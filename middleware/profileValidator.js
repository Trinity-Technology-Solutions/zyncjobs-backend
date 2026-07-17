/**
 * profileValidator.js
 * Validates and sanitizes candidate profile data before saving.
 * Covers: dates, URLs, email, phone, numerics, sanitization, structured data.
 */

const CURRENT_YEAR = new Date().getFullYear();
const MIN_YEAR = 1950;
const MAX_YEAR = CURRENT_YEAR + 10;

const URL_REGEX = /^https?:\/\/.+/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// E.164-ish: optional +, 7–15 digits, allows spaces/dashes/parens
const PHONE_REGEX = /^\+?[\d\s\-().]{7,20}$/;

// ─── SANITIZATION HELPERS ────────────────────────────────────────────────────

const JUNK_STRINGS = new Set(['undefined', 'null', 'NaN', '']);

/** Trim a string; return null if it's a junk value or empty. */
const cleanStr = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string') return v;
  const trimmed = v.trim();
  return JUNK_STRINGS.has(trimmed) ? null : trimmed;
};

/** Sanitize every string field in a plain object (shallow). */
const sanitizeObject = (obj) => {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = typeof v === 'string' ? cleanStr(v) : v;
  }
  return out;
};

/** Parse a JSON-stringified field into an array; return [] on failure. */
const toArray = (v) => {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; }
  }
  return [];
};

// ─── FIELD VALIDATORS ────────────────────────────────────────────────────────

const validateUrl = (value, fieldName, errors) => {
  const v = cleanStr(value);
  if (!v) return; // optional field — null is fine
  if (!URL_REGEX.test(v)) errors[fieldName] = 'Please enter a valid URL (must start with http:// or https://).';
};

const validateYear = (value, fieldName, errors) => {
  if (value === null || value === undefined || value === '') return;
  const n = parseInt(value, 10);
  if (isNaN(n) || n < MIN_YEAR || n > MAX_YEAR) {
    errors[fieldName] = `Year must be between ${MIN_YEAR} and ${MAX_YEAR}.`;
  }
};

// ─── EDUCATION ENTRY VALIDATOR ───────────────────────────────────────────────

const validateEducationEntry = (entry, idx, errors) => {
  const prefix = `education[${idx}]`;
  const startYear = entry.startYear != null ? parseInt(entry.startYear, 10) : null;
  const endYear = entry.endYear != null ? parseInt(entry.endYear, 10) : null;
  const expectedGrad = entry.expectedGraduation != null ? parseInt(entry.expectedGraduation, 10) : null;
  const isPursuing = entry.currentStatus === 'pursuing' || entry.isPursuing === true;
  const isGraduated = entry.currentStatus === 'graduated' || entry.currentStatus === 'completed';

  if (startYear !== null) {
    if (isNaN(startYear) || startYear < MIN_YEAR || startYear > MAX_YEAR) {
      errors[`${prefix}.startYear`] = `Start year must be between ${MIN_YEAR} and ${MAX_YEAR}.`;
    }
  }

  if (endYear !== null) {
    if (isNaN(endYear) || endYear < MIN_YEAR || endYear > MAX_YEAR) {
      errors[`${prefix}.endYear`] = `End year must be between ${MIN_YEAR} and ${MAX_YEAR}.`;
    } else if (startYear !== null && !isNaN(startYear) && endYear < startYear) {
      errors[`${prefix}.endYear`] = 'End year cannot be earlier than start year.';
    }
  }

  if (expectedGrad !== null) {
    if (isNaN(expectedGrad) || expectedGrad < MIN_YEAR || expectedGrad > MAX_YEAR) {
      errors[`${prefix}.expectedGraduation`] = `Expected graduation year must be between ${MIN_YEAR} and ${MAX_YEAR}.`;
    } else if (CURRENT_YEAR > expectedGrad) {
      errors[`${prefix}.expectedGraduation`] = 'Current year cannot exceed expected graduation year.';
    }
  }

  if (isGraduated && !endYear && !expectedGrad) {
    errors[`${prefix}.endYear`] = 'End year is required for graduated status.';
  }

  if (entry.cgpa !== null && entry.cgpa !== undefined && entry.cgpa !== '') {
    const cgpa = parseFloat(entry.cgpa);
    if (isNaN(cgpa) || cgpa < 0 || cgpa > 10) {
      errors[`${prefix}.cgpa`] = 'CGPA must be between 0 and 10.';
    }
  }

  if (entry.percentage !== null && entry.percentage !== undefined && entry.percentage !== '') {
    const pct = parseFloat(entry.percentage);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      errors[`${prefix}.percentage`] = 'Percentage must be between 0 and 100.';
    }
  }
};

// ─── EMPLOYMENT ENTRY VALIDATOR ──────────────────────────────────────────────

const validateEmploymentEntry = (entry, idx, errors) => {
  const prefix = `employment[${idx}]`;
  const isCurrentlyWorking = entry.currentlyWorking === true || entry.currentWorking === true || entry.isCurrent === true;

  if (entry.startDate) {
    const sd = new Date(entry.startDate);
    if (isNaN(sd.getTime())) {
      errors[`${prefix}.startDate`] = 'Start date is invalid.';
    }
  }

  if (!isCurrentlyWorking && entry.endDate) {
    const ed = new Date(entry.endDate);
    if (isNaN(ed.getTime())) {
      errors[`${prefix}.endDate`] = 'End date is invalid.';
    } else if (entry.startDate) {
      const sd = new Date(entry.startDate);
      if (!isNaN(sd.getTime()) && ed < sd) {
        errors[`${prefix}.endDate`] = 'End date cannot be earlier than start date.';
      }
    }
  }

  if (isCurrentlyWorking && entry.endDate) {
    // Warn but don't block — sanitize it away silently
    entry.endDate = null;
  }
};

// ─── MAIN MIDDLEWARE ─────────────────────────────────────────────────────────

export const validateProfile = (req, res, next) => {
  const body = req.body;
  const errors = {};

  // ── 1. Sanitize all top-level string fields ──────────────────────────────
  const stringFields = [
    'name', 'phone', 'location', 'title', 'jobTitle', 'yearsExperience',
    'workAuthorization', 'securityClearance', 'resumeUrl', 'profilePhoto',
    'profileFrame', 'coverPhoto', 'profileSummary', 'companyName', 'roleTitle',
    'salary', 'jobType', 'gender', 'college', 'degree',
    'githubUrl', 'portfolioUrl', 'linkedinUrl', 'websiteUrl',
  ];
  for (const f of stringFields) {
    if (body[f] !== undefined) body[f] = cleanStr(body[f]);
  }

  // ── 2. Email ─────────────────────────────────────────────────────────────
  if (body.email !== undefined) {
    body.email = cleanStr(body.email);
    if (body.email && !EMAIL_REGEX.test(body.email)) {
      errors.email = 'Please enter a valid email address.';
    }
  }

  // ── 3. Phone ─────────────────────────────────────────────────────────────
  if (body.phone) {
    if (!PHONE_REGEX.test(body.phone)) {
      errors.phone = 'Please enter a valid phone number.';
    }
  }

  // ── 4. URL fields ────────────────────────────────────────────────────────
  validateUrl(body.githubUrl, 'githubUrl', errors);
  validateUrl(body.portfolioUrl, 'portfolioUrl', errors);
  validateUrl(body.linkedinUrl, 'linkedinUrl', errors);
  validateUrl(body.websiteUrl, 'websiteUrl', errors);
  validateUrl(body.resumeUrl, 'resumeUrl', errors);

  // ── 5. yearsExperience (numeric string is fine, but validate range) ──────
  if (body.yearsExperience !== null && body.yearsExperience !== undefined && body.yearsExperience !== '') {
    const ye = parseFloat(body.yearsExperience);
    if (!isNaN(ye) && (ye < 0 || ye > 60)) {
      errors.yearsExperience = 'Years of experience must be between 0 and 60.';
    }
  }

  // ── 6. Education array (educationCollege) ────────────────────────────────
  if (body.educationCollege !== undefined) {
    const entries = toArray(body.educationCollege);
    entries.forEach((entry, i) => {
      const clean = sanitizeObject(entry);
      entries[i] = clean;
      validateEducationEntry(clean, i, errors);
    });
    // Re-serialize back to string (model stores as TEXT)
    body.educationCollege = JSON.stringify(entries);
  }

  if (body.educationClass12 !== undefined) {
    const entries = toArray(body.educationClass12);
    entries.forEach((entry, i) => {
      const clean = sanitizeObject(entry);
      entries[i] = clean;
      validateEducationEntry(clean, i, errors);
    });
    body.educationClass12 = JSON.stringify(entries);
  }

  if (body.educationClass10 !== undefined) {
    const entries = toArray(body.educationClass10);
    entries.forEach((entry, i) => {
      const clean = sanitizeObject(entry);
      entries[i] = clean;
      validateEducationEntry(clean, i, errors);
    });
    body.educationClass10 = JSON.stringify(entries);
  }

  // ── 7. Employment array ──────────────────────────────────────────────────
  if (body.employment !== undefined) {
    const entries = toArray(body.employment);
    entries.forEach((entry, i) => {
      const clean = sanitizeObject(entry);
      entries[i] = clean;
      validateEmploymentEntry(clean, i, errors);

      // Validate project/portfolio URLs inside employment entries
      if (clean.companyUrl) validateUrl(clean.companyUrl, `employment[${i}].companyUrl`, errors);
    });
    body.employment = JSON.stringify(entries);
  }

  // ── 8. Projects array ────────────────────────────────────────────────────
  if (body.projects !== undefined) {
    const entries = toArray(body.projects);
    entries.forEach((entry, i) => {
      const clean = sanitizeObject(entry);
      entries[i] = clean;
      if (clean.projectUrl) validateUrl(clean.projectUrl, `projects[${i}].projectUrl`, errors);
      if (clean.githubUrl) validateUrl(clean.githubUrl, `projects[${i}].githubUrl`, errors);
      if (clean.liveUrl) validateUrl(clean.liveUrl, `projects[${i}].liveUrl`, errors);
    });
    body.projects = JSON.stringify(entries);
  }

  // ── 9. Certifications array ──────────────────────────────────────────────
  if (body.certifications !== undefined) {
    const entries = toArray(body.certifications);
    if (Array.isArray(entries) && entries.length > 0 && typeof entries[0] === 'object') {
      entries.forEach((entry, i) => {
        const clean = sanitizeObject(entry);
        entries[i] = clean;
        if (clean.certificateUrl) validateUrl(clean.certificateUrl, `certifications[${i}].certificateUrl`, errors);
        if (clean.credentialUrl) validateUrl(clean.credentialUrl, `certifications[${i}].credentialUrl`, errors);

        if (clean.issueYear !== null && clean.issueYear !== undefined) {
          validateYear(clean.issueYear, `certifications[${i}].issueYear`, errors);
        }
        if (clean.expiryYear !== null && clean.expiryYear !== undefined) {
          validateYear(clean.expiryYear, `certifications[${i}].expiryYear`, errors);
        }
      });
      body.certifications = JSON.stringify(entries);
    } else if (typeof body.certifications === 'string') {
      body.certifications = cleanStr(body.certifications);
    }
  }

  // ── 10. Other TEXT-JSON fields — sanitize string values inside ───────────
  const otherJsonFields = ['internships', 'languages', 'awards', 'clubsCommittees', 'competitiveExams', 'academicAchievements', 'careerPreferences'];
  for (const f of otherJsonFields) {
    if (body[f] !== undefined) {
      const entries = toArray(body[f]);
      if (entries.length > 0) {
        body[f] = JSON.stringify(entries.map(e => (typeof e === 'object' ? sanitizeObject(e) : cleanStr(e))));
      } else if (typeof body[f] === 'string') {
        body[f] = cleanStr(body[f]);
      }
    }
  }

  // ── 11. Return errors if any ─────────────────────────────────────────────
  if (Object.keys(errors).length > 0) {
    return res.status(422).json({
      success: false,
      message: 'Validation failed',
      errors,
    });
  }

  next();
};
