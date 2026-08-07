import express from 'express';
import crypto from 'crypto';
import { Op } from 'sequelize';
import Interview from '../models/Interview.js';
import Application from '../models/Application.js';
import User from '../models/User.js';
import Job from '../models/Job.js';
import { meetingService } from '../services/meetingService.js';
import { sendInterviewScheduledEmail, sendInterviewAcceptedEmail, sendInterviewRejectedEmail, sendInterviewCancelledEmail } from '../services/emailService.js';
import NotificationService from '../services/notificationService.js';
import TeamMember from '../models/TeamMember.js';
import { formatJobCode } from '../utils/idGenerator.js';

const RESPONSE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const generateResponseToken = () => crypto.randomBytes(32).toString('hex');
const newTokenExpiry = () => new Date(Date.now() + RESPONSE_TOKEN_TTL_MS);

const responsePage = (emoji, title, subtitle, message = '') => `
<html><body style="font-family:sans-serif;background:#E9EBF0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;">
  <div style="background:white;padding:40px;border-radius:16px;text-align:center;max-width:480px;box-shadow:0 4px 12px rgba(0,0,0,0.1);">
    <div style="font-size:48px;margin-bottom:16px;">${emoji}</div>
    <h1 style="color:#1F2937;margin:0 0 8px;">${title}</h1>
    <p style="color:#4B5563;margin:0 0 4px;line-height:1.6;">${subtitle}</p>
    ${message ? `<p style="color:#6B7280;font-size:14px;margin:16px 0 0;">${message}</p>` : ''}
  </div>
</body></html>`;

// Block Viewer role from write operations
const blockViewer = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return next();
    const { verifyToken } = await import('../utils/jwt.js');
    const decoded = verifyToken(authHeader.replace('Bearer ', ''));
    const user = await User.findOne({ where: { id: decoded.userId }, attributes: ['id', 'email'] });
    if (!user) return next();
    const tm = await TeamMember.findOne({ where: { memberEmail: user.email.toLowerCase(), status: 'active' } });
    if (tm?.role === 'Viewer') {
      return res.status(403).json({ error: 'Access denied', message: 'Viewer role cannot perform this action' });
    }
    next();
  } catch {
    next();
  }
};

const router = express.Router();

const isValidUUID = (val) =>
  val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

// GET /api/interviews - Get interviews for employer
router.get('/', async (req, res) => {
  try {
    const { employerId, employerEmail } = req.query;
    
    // Determine the primary email to identify the company
    const primaryEmail = (employerEmail || employerId || '').trim().toLowerCase();
    if (!primaryEmail || !primaryEmail.includes('@')) {
      // Fallback to UUID-based lookup
      if (isValidUUID(employerId)) {
        console.log('📅 Fetching interviews for UUID:', employerId);
        const interviews = await Interview.findAll({
          where: { employerId },
          order: [['scheduledDate', 'DESC']]
        });
        const formatted = await formatInterviews(interviews);
        return res.json(formatted);
      }
      return res.json([]);
    }
    
    // Resolve the owner email: check if primaryEmail is a team member
    let ownerEmail = primaryEmail;
    const memberRecord = await TeamMember.findOne({
      where: { memberEmail: primaryEmail }
    });
    if (memberRecord?.employerId) {
      ownerEmail = memberRecord.employerId.toLowerCase();
    }
    
    // Collect all company emails: owner + all active team members
    const companyEmails = new Set([ownerEmail]);
    const teamMembers = await TeamMember.findAll({
      where: { employerId: ownerEmail, status: 'active' },
      attributes: ['memberEmail']
    });
    teamMembers.forEach(m => companyEmails.add(m.memberEmail.toLowerCase()));
    
    console.log('📅 Fetching interviews for company emails:', [...companyEmails]);
    
    const interviews = await Interview.findAll({
      where: {
        [Op.or]: [...companyEmails].map(email => ({
          employerEmail: { [Op.iLike]: email }
        }))
      },
      order: [['scheduledDate', 'DESC']]
    });

    const formattedInterviews = await formatInterviews(interviews);
    return res.json(formattedInterviews);
  } catch (error) {
    console.error('Interviews API error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper to format interview data with job details
async function formatInterviews(interviews) {
  return Promise.all(interviews.map(async (interview) => {
    let job = null;
    if (interview.jobId) {
      job = await Job.findByPk(interview.jobId);
    }
    return {
      _id: interview.id,
      candidateName: interview.candidateName,
      candidateEmail: interview.candidateEmail,
      jobTitle: job?.jobTitle || job?.title || 'N/A',
      company: job?.company || 'N/A',
      date: interview.scheduledDate,
      time: new Date(interview.scheduledDate).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      duration: interview.duration,
      type: interview.type,
      status: interview.status,
      meetingLink: interview.meetingLink,
      location: interview.location,
      notes: interview.notes,
      createdAt: interview.createdAt
    };
  }));
}

// GET /api/interviews/my-interviews - Get user's interviews
router.get('/my-interviews', async (req, res) => {
  try {
    const userId = req.user?.id || req.query.userId;

    const orConditions = [];
    if (isValidUUID(userId)) {
      orConditions.push({ candidateId: userId }, { employerId: userId });
    }
    if (orConditions.length === 0) return res.json([]);

    const interviews = await Interview.findAll({
      where: { [Op.or]: orConditions },
      include: [
        { model: Job, attributes: ['jobTitle', 'title', 'company'] },
        { model: User, as: 'candidate', attributes: ['name', 'email'] },
        { model: User, as: 'employer', attributes: ['name', 'email', 'company'] }
      ],
      order: [['scheduledDate', 'DESC']]
    });

    res.json(interviews);
  } catch (error) {
    console.error('My interviews API error:', error);
    res.status(500).json([]);
  }
});

// GET /api/interviews/application/:applicationId - Get interviews for a specific application
router.get('/application/:applicationId', async (req, res) => {
  try {
    const { applicationId } = req.params;
    const interviews = await Interview.findAll({
      where: { applicationId },
      order: [['createdAt', 'ASC']]
    });
    res.json(interviews);
  } catch (error) {
    console.error('Get interviews by application error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/interviews/candidate/:email - Get interviews for a candidate by email
router.get('/candidate/:email', async (req, res) => {
  try {
    const { email } = req.params;
    console.log('📅 Fetching interviews for candidate:', email);

    const interviews = await Interview.findAll({
      where: { candidateEmail: decodeURIComponent(email) },
      order: [['scheduledDate', 'DESC']]
    });

    const formatted = await Promise.all(interviews.map(async (iv) => {
      let job = null;
      if (iv.jobId) job = await Job.findByPk(iv.jobId);
      return {
        _id: iv.id,
        jobId: {
          _id: job?.id,
          jobTitle: job?.jobTitle || job?.title || 'Position',
          jobCode: job ? formatJobCode(job.positionId, job.company) : null,
          company: job?.company || 'Company'
        },
        candidateEmail: iv.candidateEmail,
        candidateName: iv.candidateName,
        interviewDate: iv.scheduledDate,
        interviewTime: new Date(iv.scheduledDate).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        interviewType: iv.type,
        meetingLink: iv.meetingLink,
        location: iv.location,
        interviewerName: iv.interviewer || null,
        status: iv.status,
        round: iv.round,
        result: iv.result,
        notes: iv.notes,
        createdAt: iv.createdAt
      };
    }));

    console.log('✅ Found', formatted.length, 'interviews for', email);
    res.json(formatted);
  } catch (error) {
    console.error('Get candidate interviews error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/interviews/schedule - Schedule new interview
router.post('/schedule', blockViewer, async (req, res) => {
  try {
    const { applicationId, candidateId, candidateEmail, candidateName, employerId, employerEmail: bodyEmployerEmail, jobId, scheduledDate, duration, type, meetingLink, location, notes, round, interviewer } = req.body;

    console.log('📅 Schedule request:', { candidateEmail, employerId, bodyEmployerEmail });

    let finalCandidateId = candidateId;
    if (!finalCandidateId && candidateEmail) {
      const candidate = await User.findOne({ where: { email: candidateEmail }, attributes: ['id', 'email', 'name'] });
      if (candidate) {
        finalCandidateId = candidate.id;
        console.log('✅ Found candidate:', finalCandidateId);
      }
    }

    let finalEmployerId = employerId;
    if (employerId && employerId.includes('@')) {
      const employer = await User.findOne({ where: { email: employerId }, attributes: ['id', 'email', 'name', 'companyName'] });
      if (employer) {
        finalEmployerId = employer.id;
        console.log('✅ Found employer:', finalEmployerId);
      }
    }

    let job;
    if (applicationId) {
      const application = await Application.findByPk(applicationId);
      if (application) {
        job = await Job.findByPk(application.jobId);
      }
    }
    if (!job && jobId) {
      job = await Job.findByPk(jobId);
    }

    // Resolve employerEmail — use body value first, then look up by UUID
    let resolvedEmployerEmail = bodyEmployerEmail || (typeof employerId === 'string' && employerId.includes('@') ? employerId : null);
    if (!resolvedEmployerEmail && finalEmployerId) {
      try {
        const emp = await User.findByPk(finalEmployerId, { attributes: ['id', 'email', 'name', 'companyName'] });
        if (emp?.email) resolvedEmployerEmail = emp.email;
      } catch { /* ignore */ }
    }

    const interview = await Interview.create({
      jobId: job?.id || jobId,
      candidateId: finalCandidateId,
      employerId: finalEmployerId,
      candidateEmail: candidateEmail,
      candidateName: candidateName,
      employerEmail: resolvedEmployerEmail,
      applicationId: applicationId || null,
      scheduledDate,
      duration: duration || 60,
      type: type || 'video',
      meetingLink,
      location,
      notes,
      round: round || null,
      interviewer: interviewer || null,
      responseToken: generateResponseToken(),
      tokenExpiry: newTokenExpiry(),
      employerConfirmed: true
    });

    console.log('✅ Interview saved:', interview.id);

    try {
      await NotificationService.createInterviewNotification(interview);
      console.log('🔔 Interview notification created');
    } catch (notificationError) {
      console.error('⚠️ Interview notification creation failed:', notificationError.message);
    }

    if (candidateEmail) {
      try {
        // Get employer details
        const employer = finalEmployerId ? await User.findByPk(finalEmployerId) : null;
        const employerEmail = employer?.email || (typeof employerId === 'string' && employerId.includes('@') ? employerId : null);
        const employerName = employer?.companyName || employer?.name || job?.company;

        await sendInterviewScheduledEmail(
          candidateEmail,
          candidateName || candidateEmail,
          job?.jobTitle || job?.title || 'Position',
          job?.company || 'Company',
          { id: interview.id, responseToken: interview.responseToken, tokenExpiry: interview.tokenExpiry, scheduledDate, duration, type, meetingLink, location, notes },
          employerEmail,
          employerName
        );
        console.log('📧 Email sent to:', candidateEmail);
      } catch (emailError) {
        console.error('❌ Email error:', emailError.message);
      }
    }

    res.json({
      success: true,
      message: 'Interview scheduled successfully',
      interview
    });
  } catch (error) {
    console.error('❌ Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/interviews/create-with-meeting - Schedule interview with meeting link
router.post('/create-with-meeting', blockViewer, async (req, res) => {
  try {
    const { applicationId, candidateId, candidateEmail, jobId, scheduledDate, duration, type, platform, notes } = req.body;

    // Step 1: Generate meeting link
    let meetingLink = '';
    if (type === 'video' && platform === 'zoom') {
      const result = await meetingService.createZoomMeeting({
        topic: 'Interview Meeting',
        start_time: scheduledDate,
        duration: duration || 60,
        description: notes || 'Interview meeting scheduled via ZyncJobs'
      });
      if (result.success) meetingLink = result.meeting.join_url;
    } else if (type === 'video' && platform === 'googlemeet') {
      const result = await meetingService.createGoogleMeet({
        topic: 'Interview Meeting',
        start_time: scheduledDate,
        duration: duration || 60,
        description: notes || 'Interview meeting scheduled via ZyncJobs'
      });
      if (result.success) meetingLink = result.meeting.join_url;
      console.log('📅 Google Meet link generated:', meetingLink, result.fallback ? '(fallback)' : '(real)');
    }

    // Step 2: Get application, candidate, job
    const application = await Application.findByPk(applicationId);
    if (!application) return res.status(404).json({ success: false, error: 'Application not found' });

    const candidate = await User.findByPk(candidateId || application.candidateId);
    const job = await Job.findByPk(application.jobId);

    // Step 3: Resolve employer details, then save interview with the generated meetingLink
    const employer = application.employerId ? await User.findByPk(application.employerId) : null;
    const employerEmail = employer?.email || application.employerEmail || job?.employerEmail;
    const employerName = employer?.companyName || employer?.name || job?.company;

    const interview = await Interview.create({
      jobId: application.jobId,
      candidateId: candidateId || application.candidateId,
      employerId: application.employerId,
      applicationId,
      candidateEmail: candidate?.email || application.candidateEmail || null,
      candidateName: candidate?.name || null,
      employerEmail,
      scheduledDate,
      duration: duration || 60,
      type: type || 'video',
      meetingLink,   // real link saved here
      notes,
      responseToken: generateResponseToken(),
      tokenExpiry: newTokenExpiry(),
      employerConfirmed: true
    });

    console.log('✅ Interview saved with meetingLink:', meetingLink);

    try {
      await NotificationService.createInterviewNotification(interview);
    } catch (notificationError) {
      console.error('⚠️ Notification failed:', notificationError.message);
    }

    if (candidate && candidate.email) {
      await sendInterviewScheduledEmail(
        candidate.email,
        candidate.name || candidateEmail,
        job?.jobTitle || job?.title || 'Position',
        job?.company || 'Company',
        { id: interview.id, responseToken: interview.responseToken, tokenExpiry: interview.tokenExpiry, scheduledDate, duration, type, meetingLink, notes },
        employerEmail,
        employerName
      );
    }

    res.json({ success: true, message: 'Interview scheduled successfully', interview, meetingLink });
  } catch (error) {
    console.error('Create interview with meeting error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/interviews/:id/confirm - Confirm interview
router.patch('/:id/confirm', async (req, res) => {
  try {
    const { id } = req.params;
    await Interview.update(
      { candidateConfirmed: true, status: 'confirmed' },
      { where: { id } }
    );
    const interview = await Interview.findByPk(id);
    res.json({ success: true, message: 'Interview confirmed', interview });
  } catch (error) {
    console.error('Confirm interview API error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Shared processor for candidate accept/decline responses (email link based)
async function handleInterviewResponse({ interview, action, res, json = false }) {
  if (interview.candidateResponded || ['accepted', 'rejected', 'confirmed'].includes(interview.status)) {
    return json
      ? res.status(400).json({ success: false, error: 'You have already responded to this interview invitation.' })
      : res.send(responsePage('&#9989;', 'Already Responded', 'You have already responded to this interview invitation.'));
  }

  const updates = {
    status: action === 'reject' ? 'rejected' : 'accepted',
    candidateResponded: true,
    candidateConfirmed: true,
    responseAt: new Date(),
    acceptedAt: action === 'reject' ? null : new Date(),
    rejectedAt: action === 'reject' ? new Date() : null,
    responseToken: null,
    tokenExpiry: null
  };

  // Optimistic concurrency guard — only one response wins even on rapid double-clicks
  const [affected] = await Interview.update(updates, {
    where: { id: interview.id, candidateResponded: false }
  });

  if (affected === 0) {
    return json
      ? res.status(400).json({ success: false, error: 'You have already responded to this interview invitation.' })
      : res.send(responsePage('&#9989;', 'Already Responded', 'You have already responded to this interview invitation.'));
  }

  const updated = await Interview.findByPk(interview.id);
  const job = updated.jobId ? await Job.findByPk(updated.jobId) : null;
  const jobTitle = job?.jobTitle || job?.title || 'Position';
  const company = job?.company || 'Company';

  // Notify employer — non-blocking so an email failure never reverts the response
  try {
    if (action === 'reject') {
      await sendInterviewRejectedEmail(updated.employerEmail, company, updated.candidateName || updated.candidateEmail, jobTitle, updated.scheduledDate);
      console.log('📧 Interview rejection email sent to employer:', updated.employerEmail);
    } else {
      await sendInterviewAcceptedEmail(updated.employerEmail, company, updated.candidateName || updated.candidateEmail, jobTitle, updated.scheduledDate);
      console.log('📧 Interview acceptance email sent to employer:', updated.employerEmail);
    }
  } catch (emailError) {
    console.error('❌ Employer notification email failed:', emailError.message);
  }

  try {
    await NotificationService.createInterviewResponseNotification(updated, action);
  } catch (notifError) {
    console.error('⚠️ Notification error:', notifError.message);
  }

  console.log(`🔄 Interview ${action === 'reject' ? 'declined' : 'accepted'}:`, updated.id, '| Candidate:', updated.candidateEmail, '| Employer:', updated.employerEmail);

  if (action === 'reject') {
    return json
      ? res.json({ success: true, message: 'Interview declined', interview: updated })
      : res.send(responsePage('&#10060;', 'Interview Declined', `You have declined the interview for <strong>${jobTitle}</strong> at <strong>${company}</strong>.`, 'The recruiter has been notified.'));
  }
  return json
    ? res.json({ success: true, message: 'Interview accepted', interview: updated })
    : res.send(responsePage('&#10004;&#65039;', 'Interview Accepted!', `You have accepted the interview for <strong>${jobTitle}</strong> at <strong>${company}</strong>.`, 'The recruiter has been notified. Check your email for details.'));
}

// GET /api/interviews/respond?token=...&action=accept|reject - Secure token-based response endpoint
router.get('/respond', async (req, res) => {
  try {
    const { token, action } = req.query;

    if (!token) {
      return res.status(400).send(responsePage('&#10060;', 'Invalid Link', 'This invitation link is invalid or missing a token.'));
    }
    if (!action || !['accept', 'reject'].includes(action)) {
      return res.status(400).send(responsePage('&#10060;', 'Invalid Request', 'This action is not supported.'));
    }

    const interview = await Interview.findOne({ where: { responseToken: token } });
    if (!interview) {
      return res.send(responsePage('&#10060;', 'Invalid Link', 'This invitation link is no longer valid.'));
    }

    if (interview.tokenExpiry && new Date(interview.tokenExpiry) < new Date()) {
      return res.send(responsePage('&#9203;', 'Link Expired', 'This interview invitation link has expired.'));
    }

    return await handleInterviewResponse({ interview, action, res });
  } catch (error) {
    console.error('Interview response error:', error);
    res.status(500).send(responsePage('&#10060;', 'Something went wrong', error.message));
  }
});

// GET /api/interviews/invite-info/:token - Fetch interview details for a response token (frontend page)
router.get('/invite-info/:token', async (req, res) => {
  try {
    const { token } = req.params;
    if (!token) {
      return res.status(400).json({ success: false, error: 'This invitation link is missing a token.', code: 'invalid' });
    }
    const interview = await Interview.findOne({ where: { responseToken: token } });
    if (!interview) {
      return res.status(404).json({ success: false, error: 'This invitation link is no longer valid.', code: 'invalid' });
    }
    if (interview.tokenExpiry && new Date(interview.tokenExpiry) < new Date()) {
      return res.json({ success: false, error: 'This interview invitation link has expired.', code: 'expired' });
    }
    const responded = interview.candidateResponded || ['accepted', 'rejected', 'confirmed'].includes(interview.status);
    const job = interview.jobId ? await Job.findByPk(interview.jobId) : null;
    const data = {
      _id: interview.id,
      jobTitle: job?.jobTitle || job?.title || 'Position',
      company: job?.company || 'Company',
      candidateName: interview.candidateName,
      candidateEmail: interview.candidateEmail,
      scheduledDate: interview.scheduledDate,
      duration: interview.duration,
      type: interview.type,
      meetingLink: interview.meetingLink,
      location: interview.location,
      notes: interview.notes,
      interviewer: interview.interviewer,
      round: interview.round,
      status: interview.status,
      responded
    };
    res.json({ success: true, data });
  } catch (error) {
    console.error('Invite info error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/interviews/respond - JSON token-based response (used by the frontend invite page)
router.post('/respond', async (req, res) => {
  try {
    const { token, action } = req.body || {};
    if (!token) return res.status(400).json({ success: false, error: 'This invitation link is missing a token.' });
    if (!action || !['accept', 'reject'].includes(action)) return res.status(400).json({ success: false, error: 'This action is not supported.' });
    const interview = await Interview.findOne({ where: { responseToken: token } });
    if (!interview) return res.status(404).json({ success: false, error: 'This invitation link is no longer valid.' });
    if (interview.tokenExpiry && new Date(interview.tokenExpiry) < new Date()) return res.status(410).json({ success: false, error: 'This interview invitation link has expired.' });
    return await handleInterviewResponse({ interview, action, res, json: true });
  } catch (error) {
    console.error('Interview response error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/interviews/:id/respond - JSON response authenticated by candidate email (dashboard buttons)
router.post('/:id/respond', async (req, res) => {
  try {
    const { id } = req.params;
    const { action, candidateEmail } = req.body || {};
    if (!isValidUUID(id)) return res.status(400).json({ success: false, error: 'Invalid interview.' });
    if (!action || !['accept', 'reject'].includes(action)) return res.status(400).json({ success: false, error: 'This action is not supported.' });
    const interview = await Interview.findByPk(id);
    if (!interview) return res.status(404).json({ success: false, error: 'Interview not found.' });
    if (!candidateEmail || interview.candidateEmail?.toLowerCase() !== String(candidateEmail).toLowerCase()) {
      return res.status(403).json({ success: false, error: 'You are not authorized to respond to this interview.' });
    }
    return await handleInterviewResponse({ interview, action, res, json: true });
  } catch (error) {
    console.error('Interview respond error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/interviews/:id/accept - Legacy candidate accepts interview via email link (kept for backward compatibility)
router.get('/:id/accept', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) {
      return res.status(400).send(responsePage('&#10060;', 'Invalid Link', 'This invitation link is invalid.'));
    }
    const interview = await Interview.findByPk(id);
    if (!interview) {
      return res.send(responsePage('&#10060;', 'Interview Not Found', 'This interview no longer exists.'));
    }
    return await handleInterviewResponse({ interview, action: 'accept', res });
  } catch (error) {
    console.error('Accept interview error:', error);
    res.status(500).send(responsePage('&#10060;', 'Something went wrong', error.message));
  }
});

// GET /api/interviews/:id/reject - Legacy candidate declines interview via email link (kept for backward compatibility)
router.get('/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) {
      return res.status(400).send(responsePage('&#10060;', 'Invalid Link', 'This invitation link is invalid.'));
    }
    const interview = await Interview.findByPk(id);
    if (!interview) {
      return res.send(responsePage('&#10060;', 'Interview Not Found', 'This interview no longer exists.'));
    }
    return await handleInterviewResponse({ interview, action: 'reject', res });
  } catch (error) {
    console.error('Reject interview error:', error);
    res.status(500).send(responsePage('&#10060;', 'Something went wrong', error.message));
  }
});

// PATCH /api/interviews/:id/reschedule - Reschedule interview
router.patch('/:id/reschedule', blockViewer, async (req, res) => {
  try {
    const { id } = req.params;
    const { scheduledDate } = req.body;
    await Interview.update(
      { scheduledDate, status: 'rescheduled' },
      { where: { id } }
    );
    const interview = await Interview.findByPk(id);
    res.json({ success: true, message: 'Interview rescheduled', interview });
  } catch (error) {
    console.error('Reschedule interview API error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Notify the candidate when an interview is cancelled (non-blocking, never reverts the cancellation)
async function notifyCandidateOfCancellation(interview) {
  if (!interview.candidateEmail) {
    console.warn('⚠️ Cancellation email skipped — missing candidate email for interview:', interview.id);
    return false;
  }

  const job = interview.jobId ? await Job.findByPk(interview.jobId) : null;
  let employerName = null;
  if (isValidUUID(interview.employerId)) {
    try {
      const employer = await User.findByPk(interview.employerId, { attributes: ['id', 'name', 'companyName'] });
      employerName = employer?.companyName || employer?.name || null;
    } catch { /* employer lookup is best-effort */ }
  }

  try {
    const result = await sendInterviewCancelledEmail(
      interview.candidateEmail,
      interview.candidateName || interview.candidateEmail,
      job?.jobTitle || job?.title || 'Position',
      job?.company || 'Company',
      {
        scheduledDate: interview.scheduledDate,
        duration: interview.duration,
        type: interview.type,
        location: interview.location
      },
      employerName
    );
    return !!result.success;
  } catch (emailError) {
    console.error('❌ Interview cancellation email error:', emailError.message);
    return false;
  }
}

// PUT /api/interviews/:id/status - Update interview status
router.put('/:id/status', blockViewer, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ success: false, error: 'Status is required' });
    }

    const interview = await Interview.findByPk(id);
    if (!interview) {
      return res.status(404).json({ success: false, error: 'Interview not found' });
    }

    const previousStatus = interview.status;
    const transitionToCancelled = status === 'cancelled' && previousStatus !== 'cancelled';

    // Atomic transition guard — only one concurrent cancellation wins and triggers the email
    const [affected] = transitionToCancelled
      ? await Interview.update(
          { status: 'cancelled' },
          { where: { id, status: { [Op.ne]: 'cancelled' } } }
        )
      : await Interview.update({ status }, { where: { id } });

    const updated = await Interview.findByPk(id);

    // Email only on a real transition into Cancelled (Scheduled/Accepted → Cancelled)
    if (transitionToCancelled && affected > 0) {
      const emailSent = await notifyCandidateOfCancellation(updated);
      console.log('🔄 Interview cancelled:', {
        interviewId: updated.id,
        candidateId: updated.candidateId || null,
        employerId: updated.employerId || null,
        previousStatus,
        newStatus: 'cancelled',
        cancelledAt: new Date().toISOString(),
        emailSent
      });
    }

    res.json({ success: true, interview: updated });
  } catch (error) {
    console.error('Update interview status error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/interviews/:id - Delete interview
router.delete('/:id', blockViewer, async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Interview.destroy({ where: { id } });
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Interview not found' });
    }
    res.json({ success: true, message: 'Interview deleted successfully' });
  } catch (error) {
    console.error('Delete interview error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
