import test from 'node:test';
import assert from 'node:assert/strict';
import { sameSubmission, validateDetails } from '../services/trackerSubmissionValidation.js';

const row = { talentCandidateId: 'candidate-1', clientName: 'Acme', skillRole: 'JOB-123', email: 'person@example.com', phone: '+91 98765 43210', resumeFile: 's3://original-resume' };
test('duplicate client/job matching normalizes casing and whitespace', () => {
  assert.equal(sameSubmission(row, { ...row, clientName: ' ACME ', skillRole: ' job-123 ', email: 'PERSON@EXAMPLE.COM' }), true);
});
test('same candidate can be submitted to a different job or client', () => {
  assert.equal(sameSubmission(row, { ...row, skillRole: 'JOB-124' }), false);
  assert.equal(sameSubmission(row, { ...row, clientName: 'Another Client' }), false);
});
test('recognizes a reuploaded candidate by email or normalized phone', () => {
  assert.equal(sameSubmission(row, { ...row, talentCandidateId: 'new-id', resumeFile: 'new-file' }), true);
  assert.equal(sameSubmission(row, { ...row, talentCandidateId: '', email: '', resumeFile: '', phone: '919876543210' }), true);
});
test('candidate ID and original resume provide fallback identity', () => {
  assert.equal(sameSubmission({ ...row, email: '', phone: '' }, { ...row, email: '', phone: '', resumeFile: 'another' }), true);
  assert.equal(sameSubmission({ ...row, email: '', phone: '', talentCandidateId: '' }, { ...row, email: '', phone: '', talentCandidateId: '' }), true);
});
test('different candidates and incomplete blank tracker rows do not collide', () => {
  assert.equal(sameSubmission(row, { ...row, talentCandidateId: 'other', email: 'other@example.com', phone: '', resumeFile: 'other' }), false);
  assert.equal(sameSubmission({}, {}), false);
});
const details = { clientName: 'Acme', skillRole: 'JOB-123', recruiterName: 'Recruiter', source: 'Internal DB', submittedDate: '2026-10-06', interviewDate: '', status: 'Submitted' };
test('requires submission-specific fields', () => {
  assert.equal(validateDetails(details), null);
  for (const key of ['clientName', 'skillRole', 'recruiterName', 'source', 'submittedDate', 'status']) assert.ok(validateDetails({ ...details, [key]: ' ' }));
});
test('rejects invalid dates, statuses and interviews before submission', () => {
  assert.ok(validateDetails({ ...details, submittedDate: '2026-02-30' }));
  assert.ok(validateDetails({ ...details, interviewDate: '2026-10-05' }));
  assert.ok(validateDetails({ ...details, status: 'Made Up' }));
  assert.equal(validateDetails({ ...details, interviewDate: '2026-10-07' }), null);
});
