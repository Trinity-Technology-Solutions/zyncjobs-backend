export const ROUNDS = ['Screening', 'Technical', 'HR', 'Managerial', 'Final'];
export const activeInterview = row => row.status === 'scheduled';
export const emailKey = value => String(value || '').trim().toLowerCase();
export const validEmail = value => typeof value === 'string' && value.length <= 254 && /^[^\s@,;<>:"\\]+@[^\s@,;<>:"\\]+\.[^\s@,;<>:"\\]+$/.test(value);

export function validateTrackerInterview(input, now = Date.now()) {
  const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Invalid interview details.');
  const data = {};
  for (const [key, limit] of [['interviewerName', 255], ['interviewerEmail', 254], ['round', 30], ['timezone', 100], ['type', 20], ['meetingLink', 2048], ['location', 500], ['notes', 4000]]) {
    if (input[key] != null && typeof input[key] !== 'string') fail(`Invalid ${key}.`);
    data[key] = (input[key] || '').trim();
    if (data[key].length > limit) fail(`${key} is too long.`);
  }
  data.interviewerEmail = emailKey(data.interviewerEmail);
  if (!data.interviewerName || !validEmail(data.interviewerEmail)) fail('Enter the interviewer name and a valid email.');
  if (!ROUNDS.includes(data.round)) fail('Select a valid interview round.');
  if (!['video', 'phone', 'in-person'].includes(data.type)) fail('Select a valid interview mode.');
  try { new Intl.DateTimeFormat('en', { timeZone: data.timezone }).format(); } catch { fail('Select a valid timezone.'); }
  if (!data.timezone) fail('Select a timezone.');
  if (typeof input.scheduledDate !== 'string' || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(input.scheduledDate)) fail('Interview time must include a timezone.');
  const start = new Date(input.scheduledDate);
  if (!Number.isFinite(start.getTime()) || start.getTime() <= now) fail('Choose a future interview date and time.');
  const day = input.scheduledDate.slice(0, 10);
  const parsedDay = new Date(`${day}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(parsedDay.getTime()) || parsedDay.toISOString().slice(0, 10) !== day) fail('Invalid interview date.');
  data.scheduledDate = start.toISOString();
  data.duration = Number(input.duration);
  if (!Number.isInteger(data.duration) || data.duration < 15 || data.duration > 480) fail('Duration must be 15–480 minutes.');
  if (data.type === 'video') {
    try { const link = new URL(data.meetingLink); if (link.protocol !== 'https:' || link.username || link.password) throw new Error(); }
    catch { fail('Enter a valid HTTPS meeting link.'); }
  } else data.meetingLink = '';
  if (data.type === 'in-person' && !data.location) fail('Enter the interview location.');
  if (data.type !== 'in-person') data.location = '';
  return data;
}

export function interviewConflict(candidate, rows, excludeId) {
  const start = new Date(candidate.scheduledDate).getTime();
  const end = start + candidate.duration * 60000;
  for (const row of rows) {
    if (row.id === excludeId || row.status === 'cancelled') continue;
    if (row.submissionId === candidate.submissionId && row.round === candidate.round) return 'This round already exists for this submission. Reschedule it or choose another round.';
    const rowStart = new Date(row.scheduledDate).getTime();
    if (activeInterview(row) && start < rowStart + row.duration * 60000 && end > rowStart
      && (emailKey(row.candidateEmail) === emailKey(candidate.candidateEmail) || emailKey(row.interviewerEmail) === emailKey(candidate.interviewerEmail))) {
      return 'The candidate or interviewer already has a tracker interview during this time.';
    }
  }
  return null;
}

const escapeICS = value => String(value || '').replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
const stamp = value => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
export function interviewCalendar(row) {
  const cancelled = row.status === 'cancelled';
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ZyncJobs//Tracker Interviews//EN', `METHOD:${cancelled ? 'CANCEL' : 'REQUEST'}`, 'BEGIN:VEVENT',
    `UID:tracker-${row.id}@zyncjobs.com`, `SEQUENCE:${row.revision}`, `DTSTAMP:${stamp(Date.now())}`,
    `DTSTART:${stamp(row.scheduledDate)}`, `DTEND:${stamp(new Date(row.scheduledDate).getTime() + row.duration * 60000)}`,
    `SUMMARY:${escapeICS(`${row.round} interview: ${row.candidateName} — ${row.clientName}`)}`,
    `DESCRIPTION:${escapeICS(`${row.skillRole}\n${row.notes || ''}\n${row.meetingLink || row.location || 'Phone interview'}\nTimezone: ${row.timezone}`)}`,
    `LOCATION:${escapeICS(row.meetingLink || row.location || 'Phone interview')}`,
    `ORGANIZER:mailto:${emailKey(row.organizerEmail)}`,
    ...[...new Set([row.candidateEmail, row.interviewerEmail].map(emailKey))].map(email => `ATTENDEE;RSVP=TRUE:mailto:${email}`),
    `STATUS:${cancelled ? 'CANCELLED' : 'CONFIRMED'}`, 'END:VEVENT', 'END:VCALENDAR'];
  // Fold by UTF-8 octets so long names/notes remain valid calendar content.
  return lines.map(line => {
    let output = '', bytes = 0;
    for (const char of line) { const size = Buffer.byteLength(char); if (bytes + size > 74) { output += '\r\n '; bytes = 1; } output += char; bytes += size; }
    return output;
  }).join('\r\n') + '\r\n';
}
