import nodemailer from 'nodemailer';
import { interviewCalendar, emailKey } from './trackerInterviewValidation.js';

export async function sendTrackerInterviewInvite(row) {
  if (!process.env.SMTP_SERVER || !process.env.SMTP_PORT || !(process.env.SMTP_EMAIL || process.env.SMTP_USER)) throw new Error('Interview email is not configured.');
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_SERVER, port: Number(process.env.SMTP_PORT), secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_EMAIL || process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    connectionTimeout: 15000, socketTimeout: 30000,
  });
  const cancelled = row.status === 'cancelled';
  const result = await transport.sendMail({
    from: process.env.SMTP_EMAIL || process.env.SMTP_USER,
    replyTo: row.organizerEmail,
    to: [...new Set([row.candidateEmail, row.interviewerEmail].map(emailKey))],
    subject: `${cancelled ? 'Cancelled' : row.revision ? 'Updated interview' : 'Interview invitation'}: ${row.skillRole} — ${row.clientName}`,
    text: `${cancelled ? 'This interview has been cancelled.' : 'You are invited to an interview.'}\n\nCandidate: ${row.candidateName}\nClient: ${row.clientName}\nRole: ${row.skillRole}\nRound: ${row.round}\nDate: ${new Date(row.scheduledDate).toLocaleString('en-GB', { timeZone: row.timezone })} (${row.timezone})\nDuration: ${row.duration} minutes\nInterviewer: ${row.interviewerName}\nMode: ${row.type}\n${row.meetingLink || row.location || 'The interviewer will call the candidate.'}\n\n${row.notes || ''}`,
    icalEvent: { filename: 'interview.ics', method: cancelled ? 'CANCEL' : 'REQUEST', content: interviewCalendar(row) },
  });
  if (result.rejected?.length) throw new Error('One or more recipients were rejected.');
}
