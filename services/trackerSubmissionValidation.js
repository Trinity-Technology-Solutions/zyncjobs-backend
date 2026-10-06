export const normalize = value => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
const digits = value => String(value || '').replace(/\D/g, '');
export function sameSubmission(a, b) {
  if (!normalize(a.clientName) || !normalize(a.skillRole)) return false;
  if (normalize(a.clientName) !== normalize(b.clientName) || normalize(a.skillRole) !== normalize(b.skillRole)) return false;
  return Boolean(
    (a.talentCandidateId && a.talentCandidateId === b.talentCandidateId) ||
    (normalize(a.email) && normalize(a.email) === normalize(b.email)) ||
    (digits(a.phone).length >= 7 && digits(a.phone) === digits(b.phone)) ||
    (a.resumeFile && a.resumeFile === b.resumeFile)
  );
}
export function validateDetails(data) {
  for (const key of ['clientName', 'skillRole', 'recruiterName', 'source', 'submittedDate', 'status']) {
    if (typeof data[key] !== 'string' || !data[key].trim()) return `${key} is required`;
    if (data[key].length > 255) return `${key} is too long`;
  }
  for (const key of ['submittedDate', 'interviewDate']) {
    if (!data[key] && key === 'interviewDate') continue;
    const value = data[key];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) return `Invalid ${key}`;
  }
  if (data.interviewDate && data.interviewDate < data.submittedDate) return 'Interview date cannot precede submitted date';
  if (!['Submitted', 'Feedback', 'Shortlisted', 'Rejected', 'Screening', 'Not Relevant'].includes(data.status)) return 'Invalid status';
  return null;
}
