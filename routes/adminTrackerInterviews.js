import express from 'express';
import { sequelize } from '../config/postgresql.js';
import TrackerRow from '../models/TrackerRow.js';
import TrackerInterview from '../models/TrackerInterview.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { validateTrackerInterview, interviewConflict, validEmail, emailKey, interviewCalendar } from '../services/trackerInterviewValidation.js';
import { sendTrackerInterviewInvite } from '../services/trackerInterviewMail.js';

const router = express.Router();
const ready = TrackerInterview.sync();
ready.catch(error => console.error('[TRACKER INTERVIEWS] Table initialization failed:', error.message));
router.use(authenticateToken, requireRole(['admin', 'super_admin', 'recruiter']));
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const errorResponse = (res, error) => res.status(error.status || 500).json({ error: error.status ? error.message : 'Unable to save interview. Please retry.' });

async function submission(req, transaction) {
  const row = await TrackerRow.findByPk(req.params.rowId, { transaction });
  if (!row || (req.user.role === 'recruiter' && String(row.createdBy) !== String(req.user.id))) fail(404, 'Submission not found.');
  return row;
}
async function write(action) {
  await ready;
  return sequelize.transaction(async transaction => {
    await sequelize.query('LOCK TABLE tracker_interviews IN SHARE ROW EXCLUSIVE MODE', { transaction });
    return action(transaction);
  });
}
async function interview(req, transaction) {
  const row = await TrackerInterview.findByPk(req.params.interviewId, { transaction });
  if (!row || row.submissionId !== req.params.rowId) fail(404, 'Interview not found.');
  return row;
}

router.get('/interview-summary', async (req, res) => {
  try {
    await ready;
    const submissions = await TrackerRow.findAll({ where: req.user.role === 'recruiter' ? { createdBy: String(req.user.id) } : {} });
    const accessible = new Set(submissions.map(row => row.id));
    const rows = await TrackerInterview.findAll({ where: { status: 'scheduled' }, order: [['scheduledDate', 'ASC']] });
    const summary = {};
    for (const row of rows) {
      if (!accessible.has(row.submissionId) || new Date(row.scheduledDate).getTime() < Date.now() || summary[row.submissionId]) continue;
      summary[row.submissionId] = { round: row.round, scheduledDate: row.scheduledDate, timezone: row.timezone };
    }
    res.json(summary);
  } catch (error) { errorResponse(res, error); }
});

router.get('/rows/:rowId/interviews', async (req, res) => {
  try { await ready; await submission(req); res.json(await TrackerInterview.findAll({ where: { submissionId: req.params.rowId }, order: [['scheduledDate', 'ASC']] })); }
  catch (error) { errorResponse(res, error); }
});

router.post('/rows/:rowId/interviews', async (req, res) => {
  try {
    const created = await write(async transaction => {
      const source = await submission(req, transaction);
      if (!source.candidateName?.trim() || !validEmail(source.email) || !source.clientName?.trim() || !source.skillRole?.trim()) fail(400, 'Save the candidate name, valid email, client and job/role on the submission first.');
      if (['Rejected', 'Not Relevant', 'Duplicate'].includes(source.status)) fail(409, 'This submission is not eligible for interview scheduling. Update its status first.');
      if (!validEmail(req.user.email)) fail(400, 'Your account needs a valid email to organize interviews.');
      const payload = { ...validateTrackerInterview(req.body), submissionId: source.id,
        candidateName: source.candidateName, candidateEmail: emailKey(source.email), clientName: source.clientName, skillRole: source.skillRole,
        recruiterName: source.recruiterName, createdBy: String(req.user.id), organizerEmail: emailKey(req.user.email), status: 'scheduled' };
      const conflict = interviewConflict(payload, await TrackerInterview.findAll({ transaction }));
      if (conflict) fail(409, conflict);
      return TrackerInterview.create(payload, { transaction });
    });
    res.status(201).json(created);
  } catch (error) { errorResponse(res, error); }
});

router.put('/rows/:rowId/interviews/:interviewId', async (req, res) => {
  try {
    const updated = await write(async transaction => {
      await submission(req, transaction);
      const row = await interview(req, transaction);
      if (row.status !== 'scheduled') fail(409, 'Only scheduled interviews can be rescheduled.');
      if (req.body.revision !== row.revision) fail(409, 'This interview has changed. Reload and try again.');
      const details = validateTrackerInterview(req.body);
      const conflict = interviewConflict({ ...row.toJSON(), ...details }, await TrackerInterview.findAll({ transaction }), row.id);
      if (conflict) fail(409, conflict);
      return row.update({ ...details, revision: row.revision + 1, lastInvitedAt: null }, { transaction });
    });
    res.json(updated);
  } catch (error) { errorResponse(res, error); }
});

router.patch('/rows/:rowId/interviews/:interviewId/status', async (req, res) => {
  try {
    const updated = await write(async transaction => {
      await submission(req, transaction);
      const row = await interview(req, transaction);
      if (!['cancelled', 'completed'].includes(req.body.status)) fail(400, 'Choose cancelled or completed.');
      if (req.body.revision !== row.revision || row.status !== 'scheduled') fail(409, 'This interview has changed. Reload and try again.');
      if (req.body.status === 'completed' && new Date(row.scheduledDate).getTime() > Date.now()) fail(400, 'A future interview cannot be completed.');
      return row.update({ status: req.body.status, revision: row.revision + 1, lastInvitedAt: null }, { transaction });
    });
    res.json(updated);
  } catch (error) { errorResponse(res, error); }
});

router.post('/rows/:rowId/interviews/:interviewId/invite', async (req, res) => {
  try {
    const updated = await write(async transaction => {
      await submission(req, transaction);
      const row = await interview(req, transaction);
      if (req.body.revision !== row.revision) fail(409, 'This interview has changed. Reload before sending an invitation.');
      if (row.status === 'completed' || (row.status === 'scheduled' && new Date(row.scheduledDate).getTime() <= Date.now())) fail(400, 'Cannot send an invitation for a past or completed interview.');
      try { await sendTrackerInterviewInvite(row.toJSON()); }
      catch (error) { console.error('[TRACKER INTERVIEW EMAIL]', error.message); fail(502, 'Interview saved, but email could not be delivered to all recipients. Check email configuration and retry the invitation.'); }
      return row.update({ lastInvitedAt: new Date() }, { transaction });
    });
    res.json(updated);
  } catch (error) { errorResponse(res, error); }
});

router.get('/rows/:rowId/interviews/:interviewId/calendar', async (req, res) => {
  try {
    await ready; await submission(req); const row = await interview(req);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="interview.ics"');
    res.setHeader('Cache-Control', 'no-store');
    res.send(interviewCalendar(row.toJSON()));
  } catch (error) { errorResponse(res, error); }
});

export default router;
