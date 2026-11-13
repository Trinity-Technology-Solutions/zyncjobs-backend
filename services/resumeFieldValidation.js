import { validateTrackerRecruitmentFields } from './trackerRecruitmentFields.js';

const missing = /^(?:unknown|n\/?a|none|null|undefined|not (?:found|available|provided)|resume|curriculum vitae|cv)$/i;
const roleWords = /\b(?:developer|engineer|analyst|manager|architect|consultant|director|lead|officer|executive|specialist|associate|coordinator|administrator|admin|recruiter|designer|tester|technician|operator|accountant|auditor|teacher|professor|researcher|scientist|chemist|nurse|doctor|physician|surgeon|dentist|lawyer|advocate|attorney|pharmacist|therapist|intern|trainee|apprentice|assistant|supervisor|president|head|chef|cook|driver|mechanic|electrician|plumber|welder|representative|salesperson|clerk|cashier|banker|writer|editor|journalist|engineer|ceo|cto|cfo|qa|sre)\b/i;
const prose = /\b(?:with a|track record|responsible for|worked on|looking for|seeking|passionate|experienced in|experience in|proficient in|skilled in|i am|my|delivering|publishing)\b/i;
const sectionHeading = /\b(?:work experience|professional summary|career objective|contact details|education|curriculum vitae)\b/i;
// PDF/OCR output often includes non-breaking or zero-width characters. Remove
// them before evidence matching, but preserve line boundaries for header logic.
const normalizeSourceText = value => String(value || '').normalize('NFKC')
  .replace(/[\u200B-\u200D\uFEFF]/g, '')
  .replace(/\u00A0/g, ' ');
const sourceEmails = source => (String(source || '').match(/[\w.+-]+\s*@\s*[\w-]+(?:\s*\.\s*[\w-]+)+/g) || [])
  .map(value => value.replace(/\s+/g, '').toLowerCase());
// Evaluate each PDF/OCR line independently. Matching across newlines can join
// employment/education dates into a fake "phone" number.
const sourcePhones = source => {
  const lines = String(source || '').split(/\r?\n/);
  return lines.flatMap((line, index) => {
    // Never consider publication identifiers (ISBN/ISSN/DOI/conference IDs)
    // as contact numbers, even if their punctuation resembles a phone number.
    if (/\b(?:isbn|issn|doi|publication|conference)\b/i.test(line)) return [];
    // OCR can wrap a labelled phone number across two lines. Join only that
    // explicit contact line with its immediate continuation; never join normal
    // resume lines, which is how employment dates become false phones.
    const candidate = /\b(?:phone|mobile|contact|tel(?:ephone)?)\b/i.test(line) ? `${line} ${lines[index + 1] || ''}` : line;
    return candidate.match(/\+?\d[\d \t().-]{6,}\d/g) || [];
  }).map(value => value.replace(/\s+/g, ' ').trim());
};
export function cleanResumeField(value, kind) {
  if (typeof value !== 'string') return '';
  const raw = value.trim();
  if (!raw || missing.test(raw)) return '';
  const v = raw.replace(/\s+/g, ' ');
  if (kind === 'url') { try { return ['http:', 'https:'].includes(new URL(raw).protocol) ? raw : ''; } catch { return ''; } }
  if (kind === 'summary') return v.length <= 4000 ? v : v.slice(0, 4000);
  if (/\r|\n/.test(raw) || v.length > 120 || prose.test(v) || sectionHeading.test(v)) return '';
  if (kind === 'name') return /^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(v) && v.split(' ').length <= 8 && !roleWords.test(v) && !/\b(?:email|phone|skills|profile|summary|objective|address)\b/i.test(v) ? v : '';
  if (kind === 'email') return /^[^\s@]+@(?:[a-z0-9-]+\.)+[a-z]{2,63}$/i.test(v) ? v.toLowerCase() : '';
  if (kind === 'phone') {
    const digits = v.replace(/\D/g, '');
    const isbnLike = /^(?:97[89])[- ]\d[- ]\d{3,5}[- ]\d{4,7}[- ]\d$/.test(v);
    return /^\+?[\d ().-]+$/.test(v) && digits.length >= 7 && digits.length <= 15 && !isbnLike && !/^\d{4}\s*[-/]\s*\d{4}$/.test(v) && !/^(\d)\1+$/.test(digits) && !/^\d{4}[-/]\d{2}[-/]\d{2}$/.test(v) && !/^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(v) && !/\b(?:19|20)\d{2}\b/.test(v) ? v : '';
  }
  if (kind === 'degree') return /\b(?:bachelor|master|doctorate|ph\.?d|diploma|associate(?:'s)?(?:\s+degree|\s+of)?|b\.?tech|m\.?tech|b\.?eng|m\.?eng|b\.?e|m\.?e|b\.?sc|m\.?sc|b\.?s|m\.?s|b\.?a|m\.?a|b\.?com|m\.?com|mba|bba|mca|bca|mbbs|bds|hsc|sslc|ssc|secondary|10th|12th)\b/i.test(v) && (!roleWords.test(v) || /\bassociate(?:'s)?\s+(?:degree|of)\b/i.test(v)) ? v : '';
  if (kind === 'skill' && roleWords.test(v)) return '';
  if (kind === 'jobTitle') return v.length <= 100 && v.split(' ').length <= 12 && !/^[\W\d]|[@\d;,:|!?]/.test(v) && roleWords.test(v) ? v : '';
  if (kind === 'dob') {
    const match = v.match(/^(\d{4})-(\d{2})-(\d{2})$/) || v.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
    if (!match) return '';
    const iso = match[1].length === 4 ? `${match[1]}-${match[2]}-${match[3]}` : `${match[3]}-${match[2]}-${match[1]}`;
    const date = new Date(`${iso}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso && date.getTime() <= Date.now() ? v : '';
  }
  if (kind === 'gender') return /^(male|female|non-binary|other)$/i.test(v) ? v : '';
  if (kind === 'date' && /^\d{1,2}\/\d{4}\s+to\s+(?:current|present|\d{1,2}\/\d{4})$/i.test(v)) return v;
  if (kind === 'date' && /^\d{4}\s*[-–]\s*\d{4}$/.test(v)) return v;
  if (kind === 'date') return /^(?:present|current|now|\d{4}|\d{4}[-/]\d{1,2}(?:[-/]\d{1,2})?|\d{1,2}[-/]\d{4}|[a-z]{3,9}[ ,]+\d{4})(?:\s*[-–]\s*(?:present|current|now|\d{4}|[a-z]{3,9}[ ,]+\d{4}))?$/i.test(v) ? v : '';
  if (/@|https?:\/\/|\b(?:phone|email|mobile)\b/i.test(v)) return '';
  if (kind === 'location') return !roleWords.test(v) && v.length <= 255 && !/^[\d .(),+-]+$/.test(v) && !/\b(?:contact(?:\s*(?:no|number))?|phone|mobile|tel(?:ephone)?|email|e-mail|dob|date\s+of\s+birth)\b/i.test(v) && !/\+?\d(?:[\s().-]*\d){6,}/.test(v) ? v : '';
  if (kind === 'country') return !roleWords.test(v) && v.length <= 100 && !/\d/.test(v) ? v : '';
  if (kind === 'company') return v.length <= 120 ? v : '';
  return v.length <= 100 && v.split(' ').length <= 10 ? v : '';
}
const normalized = value => String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
export function resumeEvidence(value, source, kind) {
  if (!value || !source) return false;
  // Resume headers frequently use dots instead of spaces (for example
  // "HEMAMALINI.R" while the parser returns "Hemamalini R"). Treat those
  // punctuation-only variants as the same name, but only when the complete
  // header line matches.
  if (kind === 'name') {
    const compact = input => normalized(input).replace(/[.\s'-]/g, '');
    const expected = compact(value);
    if (expected && String(source).split(/\r?\n/).some(line => compact(line) === expected)) return true;
  }
  if (kind === 'degree' && value.toUpperCase() === 'HSC') return /\b(?:HSC|higher secondary|12th)\b/i.test(source);
  if (kind === 'degree' && value.toUpperCase() === 'SSLC') return /\b(?:SSLC|secondary school|10th)\b/i.test(source);
  if (kind === 'email') return sourceEmails(source).includes(value.toLowerCase());
  if (kind === 'date') return normalized(source).replace(/\s/g, '').includes(normalized(value).replace(/\s/g, ''));
  if (kind === 'phone') return source.replace(/\D/g, '').includes(value.replace(/\D/g, ''));
  const escaped = normalized(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'iu').test(normalized(source));
}
export function validateResumeFields(input, source) {
  const data = input && typeof input === 'object' && !Array.isArray(input) ? { ...input } : {};
  const sourceText = normalizeSourceText(source);
  const contact = data.personalInfo || data.personal_info || data.contact || {};
  const pick = (kind, values) => values.map(value => cleanResumeField(value, kind)).find(value => resumeEvidence(value, sourceText, kind)) || '';
  // A header name may be absent from the AI response when a PDF uses a
  // no-space dotted heading (for example "HEMAMALINI.R"). Restrict this
  // fallback to that unambiguous heading format so ordinary text cannot turn
  // into an invented candidate name.
  const headerNames = sourceText.split(/\r?\n/).slice(0, 20).flatMap((line, index) => {
    const trimmed = line.trim();
    const labelled = trimmed.match(/^(?:name|candidate name)\s*[:\-]\s*(.+)$/i);
    if (labelled) return [labelled[1].trim()];
    if (/^[\p{L}\p{M}]{2,}(?:\.[\p{L}\p{M}]+)+\.?$/u.test(trimmed)) return [trimmed];
    // LinkedIn exports and PDF resumes frequently render the candidate name
    // in uppercase. Allow that only at the top of the document and only for a
    // two-to-four word name, never for known section headings.
    const uppercaseName = index < 6 && trimmed === trimmed.toUpperCase() &&
      /^[\p{L}\p{M}][\p{L}\p{M}'-]*(?:\s+[\p{L}\p{M}][\p{L}\p{M}'-]*){1,3}$/u.test(trimmed) &&
      !/\b(?:professional|summary|experience|education|skills|projects|certifications|curriculum|profile)\b/i.test(trimmed);
    return uppercaseName ? [trimmed] : [];
  });
  // Some PDF extractors flatten a visual multi-line header into one text line:
  // "SHERINE P Ayanavaram, Chennai | ...". Recover only the leading all-caps
  // two-to-four word name, stopping before normal title-cased location/title
  // content. This remains source-grounded and does not use an LLM guess.
  const leadingHeader = sourceText.slice(0, 600).match(/^\s*([\p{Lu}][\p{Lu}'-]{1,}(?:\s+[\p{Lu}](?:[\p{Lu}'-]*|\.)){1,3})(?=\s+(?:[\p{Lu}][\p{Ll}]|[+@|,\d]|$))/u)?.[1];
  if (leadingHeader && !/\b(?:professional|summary|experience|education|skills|projects|certifications|curriculum|profile)\b/i.test(leadingHeader)) headerNames.push(leadingHeader);
  data.name = pick('name', [data.name, data.fullName, contact.name, contact.fullName, ...headerNames]);
  // Header contacts are source-backed and ordered before model output. This
  // prevents a later publication number/identifier from winning over the
  // candidate's actual contact details at the top of the resume.
  data.email = pick('email', [...sourceEmails(sourceText), data.email, data.emailAddress, contact.email]);
  data.phone = pick('phone', [...sourcePhones(sourceText), data.phone, data.phoneNumber, data.mobile, contact.phone]);
  for (const kind of ['location', 'country', 'dob', 'gender', 'currentCompany']) data[kind] = pick(kind === 'currentCompany' ? 'company' : kind, [data[kind]]);
  const collections = ['workExperiences', 'internships', 'educations', 'projects', 'certifications', 'awards', 'competitions'];
  const kinds = { jobTitle: 'jobTitle', title: 'jobTitle', role: 'jobTitle', company: 'company', school: 'company', institution: 'company', provider: 'company', degree: 'degree', name: 'label', location: 'location', startDate: 'date', endDate: 'date', date: 'date', issuedDate: 'date', expiryDate: 'date', gpa: 'label', score: 'label', credentialId: 'label', url: 'url', projectUrl: 'url', certificationUrl: 'url' };
  for (const collection of collections) data[collection] = Array.isArray(data[collection]) ? data[collection].map(raw => {
    const item = typeof raw === 'string' ? { name: raw } : raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : {};
    item.name ||= item.projectName || item.certificationName || item.certificateName || (['projects', 'certifications', 'awards', 'competitions'].includes(collection) ? item.title : '');
    item.company ||= item.companyName || item.organization || item.employer;
    item.jobTitle ||= item.designation || item.role;
    item.provider ||= item.issuer || item.issuingOrganization;
    item.startDate ||= item.start_date; item.endDate ||= item.end_date;
    item.issuedDate ||= item.issueDate || item.issue_date || item.year;
    item.expiryDate ||= item.expirationDate || item.expiry_date;
    item.credentialId ||= item.certificateId || item.completionId;
    item.url ||= item.link || item.credentialUrl;
    const result = {};
    for (const [key, kind] of Object.entries(kinds)) if (key in item) result[key] = pick(kind, [item[key]]);
    const descriptions = [Array.isArray(item.descriptions) && item.descriptions.length ? item.descriptions : item.description, item.details, item.responsibilities, item.highlights].flatMap(value => Array.isArray(value) ? value : [value]);
    result.descriptions = [...new Set(descriptions.filter(value => typeof value === 'string' && value.trim()).map(value => cleanResumeField(value, 'summary')).filter(Boolean))];
    result.description = result.descriptions.join('\n');
    if (Array.isArray(item.technologies)) result.technologies = item.technologies.map(value => pick('label', [value])).filter(Boolean);
    if (item.noExpiry === true && /no expiry|does not expire|lifetime/i.test(sourceText)) result.noExpiry = true;
    return result;
  }).filter(item => Object.entries(item).some(([key, value]) => !['description', 'descriptions'].includes(key) && typeof value === 'string' && value)) : [];
  data.title = pick('jobTitle', [data.title, data.jobTitle, data.currentRole, data.current_role, data.profession, ...data.workExperiences.map(item => item.jobTitle || item.title || item.role), ...data.internships.map(item => item.jobTitle || item.title || item.role)]);
  data.jobTitle = data.title;
  for (const key of ['skills', 'tools', 'softSkills', 'languages']) data[key] = Array.isArray(data[key]) ? [...new Set(data[key].map(value => pick(key === 'skills' ? 'skill' : 'label', [value])).filter(Boolean))] : [];
  for (const key of ['location', 'country', 'currentCompany']) if (data[key] && [data.name, data.title].some(value => value && normalized(value) === normalized(data[key]))) data[key] = '';
  data.summary = cleanResumeField(data.summary, 'summary');
  data.totalExperience = typeof data.totalExperience === 'number' && Number.isFinite(data.totalExperience) && data.totalExperience >= 0 && data.totalExperience <= 80 ? data.totalExperience : null;
  data.experience = typeof data.experience === 'string' && /^\d+(?:\.\d+)?\s*(?:years?|yrs?|months?|mos?)$/i.test(data.experience.trim()) ? data.experience.trim() : '';
  delete data.total_experience;
  // Remove unvalidated aliases so downstream consumers cannot recover rejected raw values.
  for (const key of ['fullName', 'emailAddress', 'phoneNumber', 'mobile', 'currentRole', 'current_role', 'profession', 'personalInfo', 'personal_info', 'contact']) delete data[key];
  return data;
}

// Validate user-edited tracker fields by type without requiring resume evidence for metadata.
export function validateTrackerFields(data) {
  const recruitmentError = validateTrackerRecruitmentFields(data);
  if (recruitmentError) return recruitmentError;
  const types = { candidateName: 'name', email: 'email', phone: 'phone' };
  for (const [field, kind] of Object.entries(types)) {
    if (!(field in data) || data[field] === '' || data[field] == null) continue;
    if (!cleanResumeField(data[field], kind)) return `Invalid ${field}: enter only a valid ${kind}.`;
  }
  for (const field of ['clientName', 'skillRole', 'source', 'rate']) {
    if (!(field in data) || data[field] === '' || data[field] == null) continue;
    const value = data[field];
    if (typeof value !== 'string' || value.length > (field === 'rate' ? 100 : 255) || /[\r\n]/.test(value) || prose.test(value) || sectionHeading.test(value)) return `Invalid ${field}: paragraphs and resume sections are not allowed.`;
  }
  if ('status' in data && !['', 'Submitted', 'Feedback', 'Shortlisted', 'Rejected', 'Duplicate', 'Screening', 'Not Relevant'].includes(data.status)) return 'Invalid submission status.';
  for (const field of ['date', 'interviewDate']) {
    if (!(field in data) || !data[field]) continue;
    const value = data[field];
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return `Invalid ${field}: use a valid calendar date.`;
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return `Invalid ${field}: use a valid calendar date.`;
  }
  return null;
}
