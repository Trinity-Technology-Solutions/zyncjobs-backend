import express from 'express';
import { Op } from 'sequelize';
import { meetingService } from '../services/meetingService.js';
import User from '../models/User.js';
import Interview from '../models/Interview.js';

const router = express.Router();

const MINUTE_MS = 60 * 1000;

// Only UUIDs are valid when comparing against the users.id column
const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v || '');

// Friendly page shown for user-facing join errors (mirrors the project's interview response pages)
const joinPage = (title, subtitle, message = '') => `
<html><body style="font-family:sans-serif;background:#E9EBF0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;">
  <div style="background:white;padding:40px;border-radius:16px;text-align:center;max-width:480px;box-shadow:0 4px 12px rgba(0,0,0,0.1);">
    <h1 style="color:#1F2937;margin:0 0 8px;">${title}</h1>
    <p style="color:#4B5563;margin:0 0 4px;line-height:1.6;">${subtitle}</p>
    ${message ? `<p style="color:#6B7280;font-size:14px;margin:16px 0 0;">${message}</p>` : ''}
  </div>
</body></html>`;

// Shared time-window validation for both candidate join and employer host access
async function validateInterviewAccess(id, res) {
  const interview = await Interview.findByPk(id);

  if (!interview) {
    res.status(404).send(joinPage('Interview Not Found', 'This interview does not exist or is no longer available.'));
    return null;
  }

  const startTime = new Date(interview.scheduledDate);
  if (Number.isNaN(startTime.getTime())) {
    res.status(500).send(joinPage('Invalid Schedule', 'This interview does not have a valid schedule.'));
    return null;
  }

  const durationMinutes = Number(interview.duration) > 0 ? Number(interview.duration) : 60;
  const endTime = new Date(startTime.getTime() + durationMinutes * MINUTE_MS);
  const now = new Date();

  console.log('📡 Interview access attempted', {
    interviewId: interview.id,
    status: interview.status,
    start: startTime.toISOString(),
    end: endTime.toISOString(),
    now: now.toISOString()
  });

  if (interview.status === 'cancelled' || interview.status === 'rejected') {
    res.status(410).send(joinPage('Interview Unavailable', 'This interview is no longer available.'));
    return null;
  }

  if (now < startTime) {
    const availableDate = startTime.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const availableTime = startTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    res.status(403).send(joinPage(
      'Interview Not Started',
      'This interview has not started yet.',
      `It becomes available on ${availableDate} at ${availableTime}.`
    ));
    return null;
  }

  if (now > endTime) {
    // Persist terminal state atomically — only transitions once
    await Interview.update(
      { status: 'completed' },
      { where: { id: interview.id, status: { [Op.ne]: 'completed' } } }
    );
    console.log('⏰ Interview link expired:', interview.id);
    const endedDate = endTime.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const endedTime = endTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    res.status(410).send(joinPage(
      'Interview Link Expired',
      'This interview has ended and the meeting link is no longer valid.',
      `The interview was scheduled to end on ${endedDate} at ${endedTime}.`
    ));
    return null;
  }

  return interview; // valid — within time window
}

// GET /api/meetings/interview/:id/join — Candidate join link (participant role)
router.get('/interview/:id/join', async (req, res) => {
  try {
    const interview = await validateInterviewAccess(req.params.id, res);
    if (!interview) return;

    if (!interview.meetingLink) {
      return res.status(404).send(joinPage('No Meeting Link', 'No meeting link is available for this interview.'));
    }

    console.log('✅ Candidate join granted:', interview.id);
    return res.redirect(302, interview.meetingLink);
  } catch (error) {
    console.error('Interview join error:', error);
    res.status(500).send(joinPage('Something Went Wrong', error.message));
  }
});

// GET /api/meetings/interview/:id/host — Employer host link (enforces same time-window expiry)
router.get('/interview/:id/host', async (req, res) => {
  try {
    const interview = await validateInterviewAccess(req.params.id, res);
    if (!interview) return;

    // Use dedicated host link if available, fall back to join link
    const hostLink = interview.hostMeetingLink || interview.meetingLink;
    if (!hostLink) {
      return res.status(404).send(joinPage('No Meeting Link', 'No meeting link is available for this interview.'));
    }

    console.log('✅ Employer host access granted:', interview.id);
    return res.redirect(302, hostLink);
  } catch (error) {
    console.error('Interview host access error:', error);
    res.status(500).send(joinPage('Something Went Wrong', error.message));
  }
});

// GET /api/meetings/google-meet/connect - Start Google OAuth flow
router.get('/google-meet/connect', (req, res) => {
  try {
    const { employerId } = req.query;
    if (!employerId) return res.status(400).json({ error: 'employerId required' });
    const authUrl = meetingService.getGoogleMeetAuthUrl(employerId);
    res.redirect(authUrl);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/meetings/google-meet/callback - Handle OAuth callback
router.get('/google-meet/callback', async (req, res) => {
  try {
    const { code, state: employerId } = req.query;
    if (!code) return res.status(400).send('Missing code');
    const tokens = await meetingService.getGoogleMeetTokens(code);

    // The state can be a user UUID (owner/team member), an employerId string, or an
    // owner email (legacy) — resolve to the actual user row before saving tokens.
    let user = null;
    if (isUuid(employerId)) user = await User.findOne({ where: { id: employerId } });
    if (!user && employerId) user = await User.findOne({ where: { employerId } });
    if (!user && employerId && employerId.includes('@')) user = await User.findOne({ where: { email: employerId } });
    if (!user) return res.status(404).send('User not found for Google Meet connection');

    await user.update({
      googleMeetAccessToken: tokens.access_token,
      googleMeetRefreshToken: tokens.refresh_token || null
    });
    console.log('✅ Google Meet tokens saved for user:', user.id);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/dashboard?googleMeetConnected=true`);
  } catch (error) {
    console.error('Google Meet callback error:', error.message);
    res.status(500).send('OAuth failed: ' + error.message);
  }
});

// GET /api/meetings/google-meet/status - Check if employer has connected Google
// (or if the production service account path is active — then it's always ready)
router.get('/google-meet/status', async (req, res) => {
  try {
    const { employerId } = req.query;
    if (meetingService.isServiceAccountConfigured()) {
      return res.json({ connected: true, mode: 'service-account' });
    }
    if (!employerId) return res.json({ connected: false, mode: 'oauth' });
    let user = null;
    if (isUuid(employerId)) user = await User.findOne({ where: { id: employerId }, attributes: ['googleMeetAccessToken'] });
    if (!user) user = await User.findOne({ where: { employerId }, attributes: ['googleMeetAccessToken'] });
    if (!user && employerId.includes('@')) user = await User.findOne({ where: { email: employerId }, attributes: ['googleMeetAccessToken'] });
    res.json({ connected: !!(user?.googleMeetAccessToken), mode: 'oauth' });
  } catch {
    res.json({ connected: false, mode: 'oauth' });
  }
});

// Create meeting (supports both Zoom and Google Meet)
router.post('/create', async (req, res) => {
  try {
    const { platform, topic, start_time, duration, description, employerId, employerEmail, candidateEmail } = req.body;
    
    if (!platform) {
      return res.status(400).json({ 
        success: false, 
        error: 'Platform is required (zoom or googlemeet)' 
      });
    }
    
    const result = await meetingService.createMeeting({
      platform,
      topic: topic || 'Interview Meeting',
      start_time,
      duration: duration || 60,
      description: description || 'Interview meeting',
      employerId,
      employerEmail,
      candidateEmail
    });
    
    // Always return JSON response
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    console.error('Meeting creation error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to create meeting',
      message: 'An error occurred while creating the meeting'
    });
  }
});

// Create Zoom meeting (legacy endpoint)
router.post('/zoom/create', async (req, res) => {
  try {
    const { scheduledDate, duration, topic, start_time } = req.body;
    
    const result = await meetingService.createZoomMeeting({
      start_time: start_time || scheduledDate,
      duration,
      topic: topic || 'Interview Meeting'
    });
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    console.error('Zoom meeting creation error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to create Zoom meeting'
    });
  }
});

// Create Google Meet (legacy endpoint)
router.post('/google-meet/create', async (req, res) => {
  try {
    const { scheduledDate, duration, summary, start_time } = req.body;
    
    const result = await meetingService.createGoogleMeet({
      start_time: start_time || scheduledDate,
      duration,
      topic: summary || 'Interview Meeting'
    });
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    console.error('Google Meet creation error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to create Google Meet'
    });
  }
});

export default router;
