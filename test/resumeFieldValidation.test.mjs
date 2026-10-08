import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanResumeField, validateResumeFields } from '../services/resumeFieldValidation.js';
const text = 'Sherine P\nsherine@example.com\n+91 98765 43210\nBackend Developer\nWORK EXPERIENCE\nBackend Developer\nAcme Ltd\nEDUCATION\nB.Tech\nSKILLS\nPython\nSQL Developer';
test('rejects summary paragraphs, dates, contacts, skills and names as roles', () => {
  for (const value of [', with a track record of publishing research and delivering production-ready solutions. WORK EXPERIENCE Backend Developer 06/2025 - Present', 'Sherine P', 'Python, SQL', 'someone@example.com', 'Backend Developer 06/2025 - Present']) assert.equal(cleanResumeField(value, 'jobTitle'), '');
  assert.equal(cleanResumeField('Backend Developer', 'jobTitle'), 'Backend Developer');
});
test('rejects cross-field name/contact/degree pollution without inventing missing values', () => {
  assert.equal(cleanResumeField('Backend Developer', 'name'), '');
  assert.equal(cleanResumeField('sherine@example.com', 'name'), '');
  assert.equal(cleanResumeField('2019 - 2025', 'phone'), '');
  assert.equal(cleanResumeField('Backend Developer', 'degree'), '');
  assert.equal(cleanResumeField('B.Tech', 'degree'), 'B.Tech');
  assert.equal(cleanResumeField({ name: 'Sherine P' }, 'name'), '');
});
test('grounded fallback uses a real experience role and synchronizes aliases', () => {
  const parsed = validateResumeFields({ name: 'Sherine P', title: 'with a track record of delivering solutions', jobTitle: 'sherine@example.com', workExperiences: [{ jobTitle: 'Backend Developer', company: 'Acme Ltd' }], skills: ['Python', 'Invented Skill'], tools: ['SQL Developer'] }, text);
  assert.equal(parsed.title, 'Backend Developer'); assert.equal(parsed.jobTitle, parsed.title);
  assert.deepEqual(parsed.skills, ['Python']); assert.deepEqual(parsed.tools, ['SQL Developer']);
  assert.equal(parsed.email, 'sherine@example.com'); assert.equal(parsed.phone, '+91 98765 43210');
});
test('missing role never falls back to a skills list and unsupported aliases disappear', () => {
  const parsed = validateResumeFields({ name: 'Invented Person', fullName: 'Another Invented Person', skills: ['Python'], currentRole: 'publishing research and delivering solutions', email: 'madeup@example.com' }, text);
  assert.equal(parsed.title, ''); assert.equal(parsed.name, ''); assert.equal(parsed.email, 'sherine@example.com');
  assert.equal('fullName' in parsed, false); assert.equal('currentRole' in parsed, false);
});
