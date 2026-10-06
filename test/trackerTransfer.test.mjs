// HTTP-level route tests with an isolated in-memory database adapter. No live data is touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import * as validation from '../services/trackerSubmissionValidation.js';

const require = createRequire(new URL('../package.json', import.meta.url));
const express = require('express');
const records = [];
const candidates = [
  { id: 'one', name: 'Original Name', email: 'one@example.com', phone: '9876543210', status: 'Parsed', resumePath: 'stored/original.pdf' },
  { id: 'same-person', name: 'Original Name', email: 'ONE@example.com', status: 'Parsed', resumePath: 'stored/reupload.pdf' },
  { id: 'two', name: 'Second Person', email: 'two@example.com', status: 'Parsed', resumePath: 'stored/second.pdf' },
  { id: 'error', name: 'Failed Parse', status: 'Error', resumePath: 'stored/error.pdf' },
];
const wrap = value => ({ ...value, toJSON() { return { ...this }; }, async update(values) { Object.assign(this, values); return this; } });
const TrackerRow = {
  async sync() {}, async count() { return records.length; },
  async findAll() { return [...records]; }, async findByPk(id) { return records.find(row => row.id === id); },
  async create(payload) { const row = wrap({ ...payload, id: `row-${records.length + 1}` }); records.push(row); return row; },
};
const TalentCandidate = { async findAll({ where }) { const ids = Object.values(where.id)[0]; return candidates.filter(candidate => ids.includes(candidate.id)); } };
let queue = Promise.resolve();
const sequelize = {
  async query(sql) { assert.equal(sql, 'LOCK TABLE tracker_rows IN SHARE ROW EXCLUSIVE MODE'); },
  transaction(action) {
    const operation = queue.then(async () => {
      const original = records.map(row => wrap(row));
      try { return await action({}); }
      catch (error) { records.splice(0, records.length, ...original); throw error; }
    });
    queue = operation.catch(() => {}); return operation;
  },
};
const multer = Object.assign(() => ({ single: () => (req, _res, next) => { if (req.body.fixture) req.file = { originalname: req.body.fixture.name, buffer: Buffer.from(req.body.fixture.content) }; next(); } }), { memoryStorage: () => ({}) });
const dependencies = {
  express: { default: express }, multer: { default: multer },
  '../models/TrackerRow.js': { default: TrackerRow }, '../models/TalentCandidate.js': { default: TalentCandidate },
  '../config/postgresql.js': { sequelize }, '../services/trackerSubmissionValidation.js': validation,
  '../middleware/auth.js': {
    authenticateToken(req, _res, next) { req.user = { id: 'admin-1', name: 'Admin', role: 'admin' }; next(); },
    requireRole: () => (_req, _res, next) => next(),
  },
  '../services/pdfTextExtractor.js': { default: { async extractTextFromBuffer(_buffer, name) { if (name === 'corrupted.docx') throw new Error('Cannot find end of central directory'); if (name === 'blank.pdf') return ''; if (name === 'unrelated.pdf') return 'Invoice payment receipt for office equipment. '.repeat(5); return 'Candidate Resume Education Skills Experience Projects person@example.com 9876543210 '.repeat(4); } } },
  '../services/aiClient.js': { default: { async parseResume() { return { name: 'Valid Candidate', email: 'person@example.com', phone: '9876543210' }; } } },
  '../services/s3Service.js': { getResumeStreamFromS3: async () => { throw new Error('Not needed in transfer tests'); } },
  sequelize: { Op: { like: 'like', in: 'in' } },
};
const context = vm.createContext({ console, Date, Buffer });
const route = new vm.SourceTextModule(await readFile(new URL('../routes/adminTracker.js', import.meta.url), 'utf8'), { context });
await route.link(async specifier => {
  const exports = dependencies[specifier];
  assert.ok(exports, `Unexpected dependency ${specifier}`);
  return new vm.SyntheticModule(Object.keys(exports), function () { for (const [name, value] of Object.entries(exports)) this.setExport(name, value); }, { context });
});
await route.evaluate();
const app = express(); app.use(express.json()); app.use('/tracker', route.namespace.default);
const server = await new Promise(resolve => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)); });
const base = `http://127.0.0.1:${server.address().port}/tracker`;
const details = { clientName: 'Acme', skillRole: 'JOB-1', recruiterName: 'Chosen Recruiter', source: 'Internal DB', submittedDate: '2026-10-06', interviewDate: '', status: 'Submitted' };
async function request(path, body, method = 'POST') {
  const response = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: response.status, data: await response.json() };
}

test('Talent Pool transfer route and duplicate guards', async t => {
  try {
    await t.test('reuses authoritative candidate/resume fields, with no parsing or upload', async () => {
      const result = await request('/rows/from-talent-pool', { ...details, candidateIds: ['one'], candidateName: 'Forged Name', resumeFile: 'forged' });
      assert.equal(result.status, 201);
      assert.equal(result.data.created[0].candidateName, 'Original Name');
      assert.equal(result.data.created[0].resumeFile, 'stored/original.pdf');
      assert.equal(result.data.created[0].createdBy, 'admin-1');
      assert.equal(result.data.created[0].recruiterName, 'Admin');
      assert.equal(result.data.created[0].submittedDate, new Date().toISOString().slice(0, 10));
    });
    await t.test('batch skips an existing or reuploaded candidate and creates valid remaining candidates', async () => {
      const result = await request('/rows/from-talent-pool', { ...details, clientName: ' ACME ', candidateIds: ['same-person', 'two', 'error'] });
      assert.equal(result.status, 201);
      assert.equal(result.data.created.length, 1); assert.equal(result.data.duplicates.length, 1); assert.equal(result.data.invalid.length, 1);
      assert.equal(new Set(records.map(row => row.subId)).size, records.length);
    });
    await t.test('duplicate-only batch reports conflict without inserting rows', async () => {
      const count = records.length;
      const result = await request('/rows/from-talent-pool', { ...details, candidateIds: ['one'] });
      assert.equal(result.status, 409); assert.equal(records.length, count);
    });
    await t.test('missing candidates or incomplete details cannot create rows', async () => {
      assert.equal((await request('/rows/from-talent-pool', { ...details, candidateIds: ['missing'] })).status, 404);
      assert.equal((await request('/rows/from-talent-pool', { ...details, candidateIds: ['one'], clientName: '' })).status, 400);
    });
    await t.test('manual creation and editing cannot bypass duplicate detection', async () => {
      assert.equal((await request('/rows', { ...details, candidateName: 'Same', email: 'one@example.com' })).status, 409);
      const created = await request('/rows', { ...details, skillRole: 'JOB-2', candidateName: 'Same', email: 'one@example.com' });
      assert.equal(created.status, 201);
      assert.equal((await request(`/rows/${created.data.id}`, { skillRole: 'JOB-1' }, 'PUT')).status, 409);
      assert.equal(records.find(row => row.id === created.data.id).skillRole, 'JOB-2');
    });
    await t.test('metadata is server-assigned and immutable while ordinary edits remain allowed', async () => {
      const created = await request('/rows', { ...details, skillRole: 'METADATA-JOB', recruiterName: 'Forged Recruiter', submittedDate: '2000-01-01' });
      assert.equal(created.status, 201);
      const row = created.data;
      assert.equal(row.recruiterName, 'Admin');
      assert.equal(row.submittedDate, new Date().toISOString().slice(0, 10));
      assert.equal((await request(`/rows/${row.id}`, { recruiterName: 'Changed' }, 'PUT')).status, 400);
      assert.equal((await request(`/rows/${row.id}`, { submittedDate: '2000-01-01' }, 'PUT')).status, 400);
      assert.equal((await request(`/rows/${row.id}`, { ...row, status: 'Shortlisted' }, 'PUT')).status, 200);
    });
    await t.test('invalid uploads never create rows, while valid parsed resumes do', async () => {
      const count = records.length;
      const fixtures = [
        { name: 'empty.pdf', content: '' }, { name: 'renamed.pdf', content: 'not a PDF' },
        { name: 'corrupted.docx', content: 'PK\u0003\u0004broken' },
        { name: 'blank.pdf', content: '%PDF-blank' }, { name: 'unrelated.pdf', content: '%PDF-invoice' },
      ];
      for (const fixture of fixtures) assert.equal((await request('/upload-resume', { fixture })).status, 422);
      assert.equal(records.length, count);
      assert.equal((await request('/rows', { resumeFile: 'invalid.pdf' })).status, 400);
      assert.equal(records.length, count);
      const valid = await request('/upload-resume', { fixture: { name: 'valid.pdf', content: '%PDF-valid' } });
      assert.equal(valid.status, 201); assert.equal(valid.data.candidateName, 'Valid Candidate');
      assert.equal(valid.data.status, 'Submitted');
      assert.equal(valid.data.submittedDate, new Date().toISOString().slice(0, 10));
      assert.equal(records.length, count + 1);
    });
    await t.test('parallel requests through serialized transactions create only one submission', async () => {
      const results = await Promise.all([1, 2].map(() => request('/rows/from-talent-pool', { ...details, skillRole: 'CONCURRENT-JOB', candidateIds: ['one'] })));
      assert.deepEqual(results.map(result => result.status).sort(), [201, 409]);
      assert.equal(records.filter(row => row.skillRole === 'CONCURRENT-JOB').length, 1);
    });
  } finally { await new Promise(resolve => server.close(resolve)); }
});
