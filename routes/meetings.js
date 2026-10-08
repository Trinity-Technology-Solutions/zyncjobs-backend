import express from 'express';
import { meetingService } from '../services/meetingService.js';
import User from '../models/User.js';
import Interview from '../models/Interview.js';

const router = express.Router();

const MINUTE_MS = 60 * 1000;

// Only UUIDs are valid when comparing against the users.id column
const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v || '');

// Friendly page shown for user-facing join errors (mirrors the project's interview response pages)
const joinPage = (title, subtitle, message = '', refreshSeconds = 0) => `
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${refreshSeconds ? `<meta http-equiv="refresh" content="${refreshSeconds}">` : ''}</head><body style="font-family:sans-serif;background:#E9EBF0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;">
  <div style="background:white;padding:40px;border-radius:16px;text-align:center;max-width:480px;box-shadow:0 4px 12px rgba(0,0,0,0.1);">
    <h1 style="color:#1F2937;margin:0 0 8px;">${title}</h1>
    <p style="color:#4B5563;margin:0 0 4px;line-height:1.6;">${subtitle}</p>
    ${refreshSeconds ? '<p style="color:#64748b;font-size:13px;">This page checks automatically every 15 seconds and opens the meeting when access is available.</p>' : ''}
    ${message ? `<p style="color:#6B7280;font-size:14px;margin:16px 0 0;">${message}</p>` : ''}
  </div>
</body></html>`;

// Shared time-window validation for both candidate join and employer host access
async function validateInterviewAccess(id, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
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
  const opensAt = new Date(startTime.getTime() - 10 * MINUTE_MS);
  const closesAt = new Date(endTime.getTime() + 15 * MINUTE_MS);
  const now = new Date();
  const timeZone = process.env.INTERVIEW_TIME_ZONE || 'Asia/Kolkata';
  const display = value => value.toLocaleString('en-IN', { timeZone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  if (['cancelled', 'rejected', 'completed'].includes(interview.status)) {
    res.status(410).send(joinPage('Interview Unavailable', 'This interview has been cancelled, declined or marked completed.'));
    return null;
  }
  if (now < opensAt) {
    res.status(403).send(joinPage('Interview Not Started', 'The meeting opens 10 minutes before the scheduled interview.', `Scheduled: ${display(startTime)}. Access opens: ${display(opensAt)}. Server time: ${display(now)}.`, 15));
    return null;
  }
  if (now > closesAt) {
    // An elapsed time window does not prove an interview was completed.
    res.status(410).send(joinPage('Interview Link Expired', 'The scheduled meeting window has ended. Contact the recruiter to reschedule.', `Scheduled end: ${display(endTime)}. Access closed: ${display(closesAt)}.`));
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
    if (req.query.error || !code) {
      const messages = {
        access_denied: 'Google Calendar permission was not granted. Reconnect and allow Calendar access; your Google Workspace administrator may need to approve the app.',
        admin_policy_enforced: 'Your Google Workspace policy blocked this connection. Contact your Workspace administrator.',
        invalid_scope: 'The Google Calendar permission configuration is invalid. Contact ZyncJobs support.',
      };
      const message = messages[req.query.error] || 'Google did not return an authorization code. Start again using Connect Google Account; do not open the callback URL directly.';
      return res.status(400).send(joinPage('Google Connection Failed', message));
    }
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
      googleMeetRefreshToken: tokens.refresh_token || user.googleMeetRefreshToken || null
    });
    console.log('✅ Google Meet tokens saved for user:', user.id);
    const frontendUrl = process.env.FRONTEND_URL?.split(',')[0]?.trim() || 'http://localhost:5173';
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
