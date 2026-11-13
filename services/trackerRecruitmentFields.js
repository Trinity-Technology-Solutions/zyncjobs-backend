// Submission metadata is populated only from evidence in the candidate's resume.
// In particular, a mention of a visa or contract type in work history is not an
// assertion about the candidate's own work authorization or availability.
export const QUALIFICATIONS = ['UG', 'PG', 'Doctorate', 'Associate', 'Diploma', 'High School', 'Other'];
export const TAX_TERMS = ['W-2', '1099', 'C2C', 'W-2 Contract', 'Direct Hire'];
export const VISA_STATUSES = ['US Citizen', 'GC', 'H-1B', 'H-4 EAD', 'F-1 CPT', 'F-1 OPT', 'STEM OPT', 'L-1', 'L-2 EAD', 'TN', 'EAD', 'J-1', 'B-1/B-2'];

const cleanLine = value => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';

export function cleanCandidateLocation(value) {
  const location = cleanLine(value);
  return location.length <= 255 && !/^(?:unknown|n\/?a|none|not found|location not found)(?:\s*,.*)?$/i.test(location) &&
    !/@|https?:\/\/|linkedin\.com|[<>]/i.test(location) &&
    !/\b(?:contact(?:\s*(?:no|number))?|phone|mobile|tel(?:ephone)?|email|e-mail|dob|date\s+of\s+birth)\b/i.test(location) &&
    !/\+?\d(?:[\s().-]*\d){6,}/.test(location) ? location : '';
}

export function normalizeLinkedinUrl(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 1024) return '';
  try {
    const url = new URL(/^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`);
    if (!['linkedin.com', 'www.linkedin.com'].includes(url.hostname.toLowerCase()) ||
        !/^\/in\/[a-z\d_-]+\/?$/i.test(url.pathname) || url.username || url.password || url.port) return '';
    return `https://www.linkedin.com${url.pathname.replace(/\/$/, '')}`;
  } catch { return ''; }
}

function linkedInFromText(text) {
  // PDF text extraction can insert whitespace or zero-width characters into
  // an otherwise valid visible LinkedIn URL. Normalize only the LinkedIn host
  // and /in/ separator before validating the resulting personal profile URL.
  const normalizedText = String(text || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/linkedin\s*\.\s*com\s*\/\s*in\s*\/\s*/gi, 'linkedin.com/in/');
  const matches = normalizedText.match(/(?<![\w.-])(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[a-z\d_-]+(?:\/?[?#][^\s<>]*)?/gi) || [];
  return matches.map(normalizeLinkedinUrl).find(Boolean) || '';
}

function qualificationFromDegrees(degrees) {
  const joined = degrees.filter(value => typeof value === 'string').join(' | ');
  if (/\b(?:ph\.?d\.?|doctorate|doctoral|doctor of philosophy)\b/i.test(joined)) return 'Doctorate';
  if (/\b(?:master(?:'s)?|postgraduate|post-graduate|mba|mca|m\.?(?:tech|eng|e|sc|s|com|a)\b|msc\b)\b/i.test(joined)) return 'PG';
  if (/\b(?:bachelor(?:'s)?|undergraduate|b\.?(?:tech|eng|e|sc|s|com|a)\b|bba\b|bca\b|mbbs\b|bds\b)\b/i.test(joined)) return 'UG';
  if (/\bassociate(?:'s)?(?:\s+degree)?\b/i.test(joined)) return 'Associate';
  if (/\bdiploma\b/i.test(joined)) return 'Diploma';
  if (/\b(?:high school|higher secondary|hsc|12th)\b/i.test(joined)) return 'High School';
  return '';
}

function explicitValue(text, labels, choices) {
  const lines = String(text || '').split(/\r?\n/);
  const found = new Set();
  for (const line of lines) {
    const match = line.match(labels);
    if (!match) continue;
    const answer = line.slice(match.index + match[0].length).trim().replace(/^[:\-\s]+/, '');
    if (!answer || answer.length > 100) continue;
    const matches = choices.filter(([pattern]) => pattern.test(answer)).map(([, value]) => value);
    for (const value of matches) {
      if (value === 'EAD' && matches.some(other => ['H-4 EAD', 'L-2 EAD'].includes(other))) continue;
      if (value === 'W-2' && matches.includes('W-2 Contract')) continue;
      found.add(value);
    }
  }
  return found.size === 1 ? [...found][0] : '';
}

const taxChoices = [
  [/\bW\s*[-–]?\s*2\s+contract\b/i, 'W-2 Contract'],
  [/\bW\s*[-–]?\s*2\b(?!\s+contract)/i, 'W-2'],
  [/\b1099\b/i, '1099'],
  [/\b(?:C\s*2\s*C|corp\s*[-–]?\s*to\s*[-–]?\s*corp)\b/i, 'C2C'],
  [/\b(?:direct\s+hire|permanent\s+hire)\b/i, 'Direct Hire'],
];
const visaChoices = [
  [/\b(?:US|U\.S\.)\s+citizen\b/i, 'US Citizen'],
  [/\b(?:green\s+card|permanent\s+resident|GC)\b/i, 'GC'],
  [/\bH\s*[-–]?\s*1B\b/i, 'H-1B'],
  [/\bH\s*[-–]?\s*4\s+EAD\b/i, 'H-4 EAD'],
  [/\bF\s*[-–]?\s*1\s+CPT\b/i, 'F-1 CPT'],
  [/\bF\s*[-–]?\s*1\s+OPT\b/i, 'F-1 OPT'],
  [/\bSTEM\s+OPT\b/i, 'STEM OPT'],
  [/\bL\s*[-–]?\s*1\b/i, 'L-1'],
  [/\bL\s*[-–]?\s*2\s+(?:EAD|work\s*[-–]?\s*authorized)\b/i, 'L-2 EAD'],
  [/\bTN\b/i, 'TN'],
  [/\bEAD\b/i, 'EAD'],
  [/\bJ\s*[-–]?\s*1\b/i, 'J-1'],
  [/\bB\s*[-–]?\s*1\s*\/\s*B\s*[-–]?\s*2\b/i, 'B-1/B-2'],
];

export function extractTrackerRecruitmentFields(text, parsed = {}) {
  const source = String(text || '');
  const location = cleanCandidateLocation(parsed.location);
  const evidencedLocation = location && location.length <= 255 && source.toLowerCase().includes(location.toLowerCase()) ? location : '';
  const labelledLocation = source.match(/(?:^|\n)\s*(?:current\s+location|location|address)\s*:\s*([^\r\n]{2,255})/i)?.[1] || '';
  const safeLocation = cleanCandidateLocation(labelledLocation);
  const degrees = Array.isArray(parsed.educations) ? parsed.educations.map(education => education?.degree || '') : [];
  const degreeLines = source.split(/\r?\n/).filter(line => /\b(?:education|qualification|degree|university|college|bachelor|master|mba|mca|ph\.?d|b\.?tech|m\.?tech)\b/i.test(line) && line.length < 180);
  return {
    location: evidencedLocation || safeLocation,
    linkedinUrl: linkedInFromText(source),
    qualification: qualificationFromDegrees([...degrees, ...degreeLines]),
    taxTerm: explicitValue(source, /(?:^|\s)(?:(?:tax\s+terms?|employment\s+type|engagement\s+type)\s*:|available\s+on\s*:?)\s*/i, taxChoices),
    visaStatus: explicitValue(source, /(?:^|\s)(?:visa\s+status|work\s+authorization|immigration\s+status|citizenship)\s*:/i, visaChoices),
  };
}

export function validateTrackerRecruitmentFields(data) {
  if ('location' in data && data.location != null && data.location !== '' && (typeof data.location !== 'string' || !cleanCandidateLocation(data.location))) return 'Invalid location. Do not include contact, date-of-birth, email, or phone information.';
  if ('linkedinUrl' in data && data.linkedinUrl && !normalizeLinkedinUrl(data.linkedinUrl)) return 'Enter a LinkedIn profile URL (linkedin.com/in/...).';
  for (const [key, options] of [['qualification', QUALIFICATIONS], ['taxTerm', TAX_TERMS], ['visaStatus', VISA_STATUSES]]) {
    if (key in data && data[key] != null && !options.includes(data[key]) && data[key] !== '') return `Invalid ${key}.`;
  }
  return null;
}

export function normalizeTrackerRecruitmentFields(data) {
  const result = { ...data };
  if ('location' in result) result.location = cleanCandidateLocation(result.location);
  if ('linkedinUrl' in result) result.linkedinUrl = normalizeLinkedinUrl(result.linkedinUrl);
  return result;
}
