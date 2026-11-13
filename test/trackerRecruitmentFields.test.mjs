import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractTrackerRecruitmentFields,
  normalizeLinkedinUrl,
  validateTrackerRecruitmentFields,
} from '../services/trackerRecruitmentFields.js';

test('extracts source-backed US recruitment details', () => {
  const text = [
    'Jane Candidate', 'Location: Austin, TX 78701',
    'LinkedIn: https://www.linkedin.com/in/jane-candidate/',
    'Education: Master of Science in Computer Science',
    'Tax term: W-2 Contract', 'Visa status: H-4 EAD',
  ].join('\n');
  assert.deepEqual(extractTrackerRecruitmentFields(text, { location: 'Austin, TX 78701', educations: [{ degree: 'Master of Science' }] }), {
    location: 'Austin, TX 78701', linkedinUrl: 'https://www.linkedin.com/in/jane-candidate',
    qualification: 'PG', taxTerm: 'W-2 Contract', visaStatus: 'H-4 EAD',
  });
});

test('does not infer visa or tax arrangements from work history or location', () => {
  const text = 'Location: Boston, MA\nBuilt a platform for H-1B and C2C recruiters.\nEducation: Bachelor of Science';
  const fields = extractTrackerRecruitmentFields(text, { location: 'Boston, MA', educations: [{ degree: 'Bachelor of Science' }] });
  assert.equal(fields.location, 'Boston, MA');
  assert.equal(fields.qualification, 'UG');
  assert.equal(fields.visaStatus, '');
  assert.equal(fields.taxTerm, '');
});

test('ambiguous declarations and hallucinated LinkedIn links stay blank', () => {
  const text = 'Visa status: H-1B or GC\nTax terms: W-2 or C2C\nLinkedIn company page: https://linkedin.com/company/acme';
  const fields = extractTrackerRecruitmentFields(text, { linkedinUrl: 'https://www.linkedin.com/in/imaginary' });
  assert.equal(fields.visaStatus, '');
  assert.equal(fields.taxTerm, '');
  assert.equal(fields.linkedinUrl, '');
});

test('US degree abbreviations and location placeholders are handled', () => {
  assert.equal(extractTrackerRecruitmentFields('Education: B.S. Computer Science', { educations: [{ degree: 'B.S.' }] }).qualification, 'UG');
  assert.equal(extractTrackerRecruitmentFields('Education: M.S. Computer Science', { educations: [{ degree: 'M.S.' }] }).qualification, 'PG');
  assert.equal(extractTrackerRecruitmentFields('Location: Location not found, USA', {}).location, '');
  assert.equal(extractTrackerRecruitmentFields('Profile: https://evil-linkedin.com/in/impersonated', {}).linkedinUrl, '');
  assert.equal(extractTrackerRecruitmentFields('Available on 1099\nEducation: B.S. Computer Science', {}).taxTerm, '1099');
  assert.equal(extractTrackerRecruitmentFields('LinkedIn: linkedin . com / in / jane-doe', {}).linkedinUrl, 'https://www.linkedin.com/in/jane-doe');
});

test('profile URLs and manual options are validated before storage', () => {
  assert.equal(normalizeLinkedinUrl('linkedin.com/in/jane-doe/?trk=resume'), 'https://www.linkedin.com/in/jane-doe');
  assert.equal(normalizeLinkedinUrl('https://linkedin.com.evil.example/in/jane'), '');
  assert.equal(validateTrackerRecruitmentFields({ linkedinUrl: 'https://linkedin.com.evil.example/in/jane' }), 'Enter a LinkedIn profile URL (linkedin.com/in/...).');
  assert.equal(validateTrackerRecruitmentFields({ taxTerm: 'C2C', visaStatus: 'TN', qualification: 'UG' }), null);
  assert.equal(validateTrackerRecruitmentFields({ visaStatus: 'Assumed citizen' }), 'Invalid visaStatus.');
  assert.equal(validateTrackerRecruitmentFields({ location: '17, Prashant Colony Contact No.: +918237577403' }), 'Invalid location. Do not include contact, date-of-birth, email, or phone information.');
  assert.equal(validateTrackerRecruitmentFields({ location: 'Austin, TX 78701' }), null);
});
