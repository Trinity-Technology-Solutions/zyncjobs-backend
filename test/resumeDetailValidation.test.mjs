import test from 'node:test';
import assert from 'node:assert/strict';
import { validateResumeFields } from '../services/resumeFieldValidation.js';
const source = `Sherine P
sherine@example.com
+91 98765 43210
PROJECTS
Tank Tect
Detected and protected tank water quality during floods using sensor technology.
Built alerts in Python and React.
https://example.com/tank
INTERNSHIPS
Open Weaver
Software Intern
2023-2023
Built and deployed a portfolio website using a no-code development platform.
CERTIFICATIONS
AWS Cloud Practitioner
AWS
2023-07-01
2026-07-01
ABC-123
https://example.com/certificate`;
test('preserves complete projects and avoids duplicate descriptions on repeated normalization', () => {
 const input = { projects: [{ projectName: 'Tank Tect', descriptions: ['Detected and protected tank water quality during floods using sensor technology.', 'Built alerts in Python and React.'], technologies: ['Python', 'React'], projectUrl: 'https://example.com/tank' }] };
 const result = validateResumeFields(input, source);
 assert.equal(result.projects[0].name, 'Tank Tect');
 assert.equal(result.projects[0].descriptions.length, 2);
 assert.deepEqual(result.projects[0].technologies, ['Python', 'React']);
 assert.equal(result.projects[0].projectUrl, 'https://example.com/tank');
 assert.deepEqual(validateResumeFields(result, source).projects, result.projects);
});
test('supports internship aliases, year ranges and detailed responsibilities', () => {
 const result = validateResumeFields({ internships: [{ companyName: 'Open Weaver', designation: 'Software Intern', date: '2023-2023', responsibilities: ['Built and deployed a portfolio website using a no-code development platform.'] }] }, source);
 assert.equal(result.internships[0].company, 'Open Weaver');
 assert.equal(result.internships[0].jobTitle, 'Software Intern');
 assert.equal(result.internships[0].date, '2023-2023');
 assert.match(result.internships[0].description, /portfolio website/);
});
test('preserves certification issuer, dates, credential ID and URL without inventing no-expiry', () => {
 const result = validateResumeFields({ certifications: [{ certificationName: 'AWS Cloud Practitioner', issuer: 'AWS', issueDate: '2023-07-01', expirationDate: '2026-07-01', certificateId: 'ABC-123', credentialUrl: 'https://example.com/certificate', noExpiry: true }] }, source);
 const cert = result.certifications[0];
 assert.equal(cert.name, 'AWS Cloud Practitioner'); assert.equal(cert.provider, 'AWS');
 assert.equal(cert.issuedDate, '2023-07-01'); assert.equal(cert.expiryDate, '2026-07-01');
 assert.equal(cert.credentialId, 'ABC-123'); assert.equal(cert.url, 'https://example.com/certificate');
 assert.equal(cert.noExpiry, undefined);
});
