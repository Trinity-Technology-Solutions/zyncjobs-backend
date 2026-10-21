import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import crypto from 'node:crypto';
const require = createRequire(import.meta.url);
const migration = require('../migrations/20261021000000-create-submission-tables.cjs');

test('schema repair is additive, ordered, repeatable, and runs in a transaction', async () => {
  const calls = [], transaction = {};
  const qi = { sequelize: { transaction: action => action(transaction), query: async (sql, options) => { assert.equal(options.transaction, transaction); calls.push(sql); } } };
  await migration.up(qi); await migration.up(qi);
  assert.equal(calls.length, 14);
  assert.match(calls[2], /CREATE TABLE IF NOT EXISTS submission_batches/);
  assert.match(calls[3], /CREATE TABLE IF NOT EXISTS candidate_submissions/);
  assert.ok(calls.every(sql => !/\b(?:DROP|DELETE|UPDATE|TRUNCATE|ALTER)\b/i.test(sql.replace(/ON DELETE CASCADE/g, ''))));
  await assert.rejects(migration.down(), /no automatic destructive rollback/);
});

test('batch routes use model attributes and create batch/candidates atomically', async () => {
  const express = require('express');
  const batches = [], submissions = [];
  let failChildren = false;
  const candidate = { candidateId: 'ZC-000001', name: 'Alex Smith', email: 'alex@example.com', skills: ['Java'] };
  const deps = {
    express: { default: express }, 'node:crypto': { default: crypto }, sequelize: { Op: { iLike: 'iLike' } },
    '../models/associations.js': {},
    '../middleware/auth.js': { authenticateToken(req, _res, next) { req.user = { id: 'user-1', role: 'admin' }; next(); }, requireRole: () => (_req, _res, next) => next() },
    '../config/postgresql.js': { sequelize: { async transaction(action) {
      const size = batches.length;
      try { return await action({ marker: true }); } catch (error) { batches.splice(size); throw error; }
    } } },
    '../models/TalentCandidate.js': { default: { async findAll(options) { assert.ok(options.where.candidateId); assert.ok(options.attributes.includes('candidateId')); return [candidate]; } } },
    '../models/SubmissionBatch.js': { default: {
      async create(values, options) { assert.ok(options.transaction.marker); assert.ok(values.batchId); assert.equal(values.clientName, 'Client'); const row = { ...values, id: 'batch-uuid', submittedAt: '2026-10-21T10:00:00Z' }; batches.push(row); return row; },
      async findAndCountAll(options) { assert.equal(options.distinct, true); assert.equal(JSON.stringify(options.order[0]), JSON.stringify(['submittedAt', 'DESC'])); return { rows: batches.map(batch => ({ ...batch, submissions: [] })), count: batches.length }; },
      async findOne({ where }) { assert.ok(where.batchId); return batches.find(batch => batch.batchId === where.batchId); },
    } },
    '../models/CandidateSubmission.js': { default: {
      async bulkCreate(values, options) { assert.ok(options.transaction.marker); if (failChildren) throw new Error('Children failed'); assert.equal(values[0].candidateId, candidate.candidateId); assert.ok(values[0].batchId); submissions.push(...values); return values; },
      async findAll({ where }) { assert.ok(where.batchId); return submissions.map(row => ({ ...row, candidate })); },
    } },
  };
  const context = vm.createContext({ console, Date, Buffer });
  const module = new vm.SourceTextModule(await readFile(new URL('../routes/submissions.js', import.meta.url), 'utf8'), { context });
  await module.link(async name => { const values = deps[name]; assert.ok(values, name); return new vm.SyntheticModule(Object.keys(values), function () { for (const [key, value] of Object.entries(values)) this.setExport(key, value); }, { context }); });
  await module.evaluate();
  const app = express(); app.use(express.json()); app.use('/submissions', module.namespace.default);
  const server = await new Promise(resolve => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)); });
  const base = `http://127.0.0.1:${server.address().port}/submissions`;
  const create = () => fetch(base + '/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ candidateIds: [candidate.candidateId], clientName: 'Client' }) });
  try {
    const created = await create(); assert.equal(created.status, 200); const body = await created.json(); assert.match(body.batch.batchId, /^SUB-\d{4}-[a-f0-9]{16}$/); assert.equal(body.batch.clientName, 'Client');
    const listed = await fetch(base); assert.equal(listed.status, 200); const list = await listed.json(); assert.equal(list.batches[0].batchId, body.batch.batchId);
    const detail = await fetch(base + '/' + body.batch.batchId); assert.equal(detail.status, 200); const data = await detail.json(); assert.equal(data.candidates[0].candidateId, candidate.candidateId);
    failChildren = true; assert.equal((await create()).status, 500); assert.equal(batches.length, 1);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
