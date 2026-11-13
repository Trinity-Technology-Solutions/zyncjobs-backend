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
  assert.equal(cleanResumeField('01-01-2025', 'phone'), '');
  assert.equal(cleanResumeField('17, Prashant Colony Contact No.: +918237577403', 'location'), '');
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
test('US location ZIP and degree abbreviations survive evidence validation', () => {
  const source = 'Jane Candidate\nLocation: Austin, TX 78701\nEducation: B.S. Computer Science\nContact: jane@example.com';
  const parsed = validateResumeFields({ name: 'Jane Candidate', location: 'Austin, TX 78701', country: 'India', educations: [{ degree: 'B.S. Computer Science' }] }, source);
  assert.equal(parsed.location, 'Austin, TX 78701');
  assert.equal(parsed.country, '');
  assert.equal(parsed.educations[0].degree, 'B.S. Computer Science');
});

test('accepts a punctuated resume header name when the parser uses spaces', () => {
  const source = 'HEMAMALINI.R\nSoftware Test Engineer\nCHENNAI, INDIA 600096\nrhemamalini233@gmail.com\n+91 9514416567\nEducation\nExperience\nSkills';
  const parsed = validateResumeFields({ name: 'Hemamalini R' }, source);
  assert.equal(parsed.name, 'Hemamalini R');
  assert.equal(parsed.email, 'rhemamalini233@gmail.com');
  assert.equal(parsed.phone, '+91 9514416567');
});

test('recovers labelled names and contacts split by OCR whitespace', () => {
  const source = 'Name: Jane O\'Neil\nEmail: jane.oneil @ example . com\nPhone: +1 (512)\n 555-0123\nExperience\nEducation\nSkills';
  const parsed = validateResumeFields({}, source);
  assert.equal(parsed.name, "Jane O'Neil");
  assert.equal(parsed.email, 'jane.oneil@example.com');
  assert.equal(parsed.phone, '+1 (512) 555-0123');
});

test('rejects publication and education years as phone numbers and selects the header phone', () => {
  const source = 'SHERINE P\nAyanavaram, Chennai | shreesherinerachel7@gmail.com | 8754437435\nLinkedIn: linkedin.com/in/shrine\nWORK EXPERIENCE\nBackend Developer | 06/2025 - Present\nEDUCATION\nB.Tech, Information Technology | 2021 - 2025\nPUBLICATIONS\nConference paper (2025 - 2026)\nSKILLS';
  const parsed = validateResumeFields({ name: 'Sherine P', phone: '489 (2026', email: 'shreesherinerachel7@gmail.com' }, source);
  assert.equal(cleanResumeField('489 (2026', 'phone'), '');
  assert.equal(parsed.phone, '8754437435');
});

test('prefers the header phone and rejects ISBN publication identifiers', () => {
  const source = 'SHERINE P\nAyanavaram, Chennai | shreesherinerachel7@gmail.com | 8754437435\nWORK EXPERIENCE\nBackend Developer\nEDUCATION\nB.Tech\nPUBLICATIONS\nISBN: 978-3-032-22118-6\nSKILLS';
  const parsed = validateResumeFields({ name: 'Sherine P', phone: '978-3-032-22118-6', email: 'shreesherinerachel7@gmail.com' }, source);
  assert.equal(cleanResumeField('978-3-032-22118-6', 'phone'), '');
  assert.equal(parsed.phone, '8754437435');
});

test('uses an uppercase LinkedIn-style resume header when the model misses the name', () => {
  const source = 'SHERINE P\nAyanavaram, Chennai | shreesherinerachel7@gmail.com | 8754437435\nLinkedIn: linkedin . com / in / sheresherine\nPROFESSIONAL SUMMARY\nWORK EXPERIENCE\nEDUCATION\nSKILLS';
  const parsed = validateResumeFields({}, source);
  assert.equal(parsed.name, 'SHERINE P');
  assert.equal(parsed.email, 'shreesherinerachel7@gmail.com');
  assert.equal(parsed.phone, '8754437435');
});

test('recovers a flattened uppercase PDF header name without accepting a section heading', () => {
  const source = 'SHERINE P Ayanavaram, Chennai | shreesherinerachel7@gmail.com | 8754437435\nLinkedIn: linkedin.com/in/sherine-p\nPROFESSIONAL SUMMARY\nWORK EXPERIENCE\nEDUCATION\nSKILLS';
  const parsed = validateResumeFields({}, source);
  assert.equal(parsed.name, 'SHERINE P');
  assert.equal(parsed.email, 'shreesherinerachel7@gmail.com');
  assert.equal(parsed.phone, '8754437435');
});
