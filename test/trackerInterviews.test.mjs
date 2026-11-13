import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import * as validation from '../services/trackerInterviewValidation.js';

const require = createRequire(import.meta.url);
const express = require('express');
const source = { id: 'submission-one', createdBy: 'recruiter-one', candidateName: 'Alex Smith', email: 'alex@example.com', clientName: 'Client One', skillRole: 'JOB-1', recruiterName: 'Recruiter', status: 'Shortlisted' };
const records = [];
let failMail = false;
let deliveries = 0;
let queue = Promise.resolve();
const wrap = object => ({ ...object, toJSON() { return { ...this }; }, async update(values) { Object.assign(this, values); return this; } });
const Interview = {
  async sync() {},
  async findByPk(id) { return records.find(row => row.id === id); },
  async findAll({ where } = {}) { return records.filter(row => !where || ((!where.submissionId || row.submissionId === where.submissionId) && (!where.status || row.status === where.status))); },
  async create(payload) { const row = wrap({ ...payload, id: `interview-${records.length + 1}`, revision: 0, lastInvitedAt: null }); records.push(row); return row; },
};
const sequelize = {
  async query(sql) { assert.equal(sql, 'LOCK TABLE tracker_interviews IN SHARE ROW EXCLUSIVE MODE'); },
  transaction(action) {
    const operation = queue.then(async () => {
      const original = records.map(row => wrap(row));
      try { return await action({}); } catch (error) { records.splice(0, records.length, ...original); throw error; }
    });
    queue = operation.catch(() => {}); return operation;
  },
};
const dependencies = {
  express: { default: express }, '../config/postgresql.js': { sequelize },
  '../models/TrackerRow.js': { default: { async findByPk(id) { return id === source.id ? source : null; }, async findAll({ where }) { return !where.createdBy || where.createdBy === source.createdBy ? [source] : []; } } },
  '../models/TrackerInterview.js': { default: Interview },
  '../services/trackerInterviewValidation.js': validation,
  '../services/trackerInterviewMail.js': { async sendTrackerInterviewInvite() { deliveries++; if (failMail) throw new Error('Mail unavailable'); } },
  '../middleware/auth.js': {
    authenticateToken(req, res, next) {
      if (req.headers['x-unauthorized']) return res.status(401).json({ error: 'Unauthorized' });
      req.user = { id: req.headers['x-user'] || 'recruiter-one', role: 'recruiter', email: 'recruiter@example.com' }; next();
    },
    requireRole: () => (_req, _res, next) => next(),
  },
};
const context = vm.createContext({ console, Date, Buffer, URL, Intl });
const route = new vm.SourceTextModule(await readFile(new URL('../routes/adminTrackerInterviews.js', import.meta.url), 'utf8'), { context });
await route.link(async specifier => {
  const values = dependencies[specifier]; assert.ok(values, specifier);
  return new vm.SyntheticModule(Object.keys(values), function () { for (const [name, value] of Object.entries(values)) this.setExport(name, value); }, { context });
});
await route.evaluate();
const app = express(); app.use(express.json()); app.use('/tracker', route.namespace.default);
const server = await new Promise(resolve => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)); });
const base = `http://127.0.0.1:${server.address().port}/tracker/rows/${source.id}/interviews`;
const future = new Date(Date.now() + 86400000).toISOString();
const details = { round: 'Technical', scheduledDate: future, timezone: 'Asia/Kolkata', duration: 60, interviewerName: 'Panel', interviewerEmail: 'panel@example.com', type: 'video', meetingLink: 'https://meet.google.com/abc-defg-hij', notes: 'Interview notes' };
async function request(suffix = '', method = 'GET', body, headers = {}) {
  const response = await fetch(base + suffix, { method, headers: { 'Content-Type': 'application/json', ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: response.headers.get('content-type')?.includes('json') ? await response.json() : await response.text() };
}
test('submission-linked interviews, scheduling, invitations and lifecycle', async t => {
  try {
    await t.test('a valid submission without interviews returns an empty successful list', async () => {
      const empty = await request();
      assert.equal(empty.status, 200);
      assert.deepEqual(empty.data, []);
      const missing = await fetch(base.replace(source.id, 'missing-submission'));
      assert.equal(missing.status, 404);
      assert.equal((await missing.json()).error, 'Submission not found.');
    });
    await t.test('requires authorization and submission ownership', async () => {
      assert.equal((await request('', 'GET', undefined, { 'x-unauthorized': 'yes' })).status, 401);
      assert.equal((await request('', 'POST', details, { 'x-user': 'another-recruiter' })).status, 404);
    });
    await t.test('rejects invalid dates, timezone, URLs, missing email and incomplete submissions without writes', async () => {
      for (const change of [{ scheduledDate: '2000-01-01T00:00:00Z' }, { scheduledDate: '2027-01-01T10:00' }, { timezone: 'invalid' }, { meetingLink: 'javascript:alert(1)' }, { interviewerEmail: '' }, { duration: 0 }, { type: 'in-person', location: '' }]) {
        assert.equal((await request('', 'POST', { ...details, ...change })).status, 400);
      }
      const email = source.email; source.email = ''; assert.equal((await request('', 'POST', details)).status, 400); source.email = email;
      assert.equal(records.length, 0);
    });
    await t.test('reuses authoritative submission details and sends nothing on Save', async () => {
      const response = await request('', 'POST', { ...details, candidateEmail: 'forged@example.com', clientName: 'Forged', createdBy: 'other' });
      assert.equal(response.status, 201); assert.equal(response.data.candidateEmail, source.email); assert.equal(response.data.clientName, source.clientName);
      assert.equal(response.data.createdBy, 'recruiter-one'); assert.equal(deliveries, 0); assert.equal(source.status, 'Shortlisted');
    });
    await t.test('next-interview summary only includes accessible submissions', async () => {
      const url = base.replace(`/rows/${source.id}/interviews`, '/interview-summary');
      const own = await (await fetch(url)).json(); assert.equal(own[source.id].round, 'Technical');
      const other = await (await fetch(url, { headers: { 'x-user': 'another-recruiter' } })).json(); assert.deepEqual(other, {});
    });
    await t.test('duplicates and overlapping candidate/interviewer times are blocked', async () => {
      assert.equal((await request('', 'POST', details)).status, 409);
      assert.equal((await request('', 'POST', { ...details, round: 'HR' })).status, 409);
      const next = new Date(Date.parse(future) + 3600000).toISOString();
      assert.equal((await request('', 'POST', { ...details, round: 'HR', scheduledDate: next })).status, 201);
    });
    await t.test('failed email preserves interview and can be retried without duplicate rows', async () => {
      failMail = true;
      assert.equal((await request('/interview-1/invite', 'POST', { revision: 0 })).status, 502);
      assert.equal(records.length, 2); assert.equal(records[0].lastInvitedAt, null);
      failMail = false;
      assert.equal((await request('/interview-1/invite', 'POST', { revision: 0 })).status, 200);
      assert.ok(records[0].lastInvitedAt);
    });
    await t.test('rescheduling increments version, requires resend and rejects stale edits/invites', async () => {
      assert.equal((await request('/interview-1', 'PUT', { ...details, revision: 0, scheduledDate: new Date(Date.parse(future) + 7200000).toISOString() })).status, 200);
      assert.equal(records[0].revision, 1); assert.equal(records[0].lastInvitedAt, null);
      assert.equal((await request('/interview-1', 'PUT', { ...details, revision: 0 })).status, 409);
      assert.equal((await request('/interview-1/invite', 'POST', { revision: 0 })).status, 409);
    });
    await t.test('calendar uses stable UID, UTC time, versioning and cancellation method', async () => {
      const calendar = await request('/interview-1/calendar'); assert.equal(calendar.status, 200);
      assert.match(calendar.data, /UID:tracker-interview-1@zyncjobs.com/); assert.match(calendar.data, /SEQUENCE:1/); assert.match(calendar.data, /DTSTART:\d{8}T\d{6}Z/);
      assert.equal((await request('/interview-1/status', 'PATCH', { status: 'completed', revision: 1 })).status, 400);
      assert.equal((await request('/interview-1/status', 'PATCH', { status: 'cancelled', revision: 1 })).status, 200);
      assert.match((await request('/interview-1/calendar')).data, /METHOD:CANCEL/);
      assert.equal((await request('/interview-1/invite', 'POST', { revision: 2 })).status, 200);
      assert.equal((await request('/interview-1', 'PUT', { ...details, revision: 2 })).status, 409);
    });
    await t.test('simultaneous requests create one round only', async () => {
      const payload = { ...details, round: 'Final', scheduledDate: new Date(Date.parse(future) + 14400000).toISOString() };
      const responses = await Promise.all([request('', 'POST', payload), request('', 'POST', payload)]);
      assert.deepEqual(responses.map(row => row.status).sort(), [201, 409]);
    });
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('calendar values cannot inject additional ICS fields', () => {
  const calendar = validation.interviewCalendar({ id: 'test', revision: 3, candidateName: 'Alex\nATTENDEE:evil', clientName: 'Client', round: 'HR', skillRole: 'Role', notes: 'Notes, more; detail', scheduledDate: future, duration: 30, timezone: 'UTC', candidateEmail: 'candidate@example.com', interviewerEmail: 'panel@example.com', organizerEmail: 'recruiter@example.com', status: 'scheduled' });
  assert.match(calendar, /Alex\\nATTENDEE/); assert.ok(!calendar.includes('\r\nATTENDEE:evil'));
  assert.ok(calendar.split('\r\n').every(line => Buffer.byteLength(line) <= 75));
});
