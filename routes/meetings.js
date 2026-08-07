import express from 'express';
import { Op } from 'sequelize';
import { meetingService } from '../services/meetingService.js';
import User from '../models/User.js';
import Interview from '../models/Interview.js';

const router = express.Router();

const MINUTE_MS = 60 * 1000;

// Friendly page shown for user-facing join errors (mirrors the project's interview response pages)
const joinPage = (title, subtitle, message = '') => `
<html><body style="font-family:sans-serif;background:#E9EBF0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;">
  <div style="background:white;padding:40px;border-radius:16px;text-align:center;max-width:480px;box-shadow:0 4px 12px rgba(0,0,0,0.1);">
    <h1 style="color:#1F2937;margin:0 0 8px;">${title}</h1>
    <p style="color:#4B5563;margin:0 0 4px;line-height:1.6;">${subtitle}</p>
    ${message ? `<p style="color:#6B7280;font-size:14px;margin:16px 0 0;">${message}</p>` : ''}
  </div>
</body></html>`;

// GET /api/meetings/interview/:id/join
// Single source of truth for joining a scheduled interview. The meeting URL is only
// handed out (via 302 redirect) while now ∈ [scheduledDate, scheduledDate + duration].
// Every request — direct URL, refresh, new tab, shared link, bookmark — is re-validated.
router.get('/interview/:id/join', async (req, res) => {
  try {
    const { id } = req.params;
    const interview = await Interview.findByPk(id);

    if (!interview) {
      return res.status(404).send(joinPage('Interview Not Found', 'This interview does not exist or is no longer available.'));
    }

    // Times are compared as absolute JS Date instants (UTC-safe); never using frontend values.
    const startTime = new Date(interview.scheduledDate);
    if (Number.isNaN(startTime.getTime())) {
      console.error('Invalid interview schedule:', interview.id);
      return res.status(500).send(joinPage('Invalid Schedule', 'This interview does not have a valid schedule.'));
    }

    const durationMinutes = Number(interview.duration) > 0 ? Number(interview.duration) : 60;
    const endTime = new Date(startTime.getTime() + durationMinutes * MINUTE_MS);
    const now = new Date();

    console.log('📡 Interview join attempted', {
      interviewId: interview.id,
      status: interview.status,
      start: startTime.toISOString(),
      end: endTime.toISOString(),
      now: now.toISOString()
    });

    // Reuse the existing status enum — no duplicate state management.
    // Terminal states can never be re-opened, even if a link is shared or bookmarked.
    if (interview.status === 'cancelled' || interview.status === 'rejected') {
      console.log('🕒 Interview unavailable:', interview.id, interview.status);
      return res.status(410).send(joinPage('Interview Unavailable', 'This interview is no longer available.'));
    }

    if (now < startTime) {
      const availableDate = startTime.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      const availableTime = startTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      console.log('🕒 Interview not started:', interview.id);
      return res.status(403).send(joinPage(
        'Interview Not Started',
        'This interview has not started yet.',
        `It becomes available on ${availableDate} at ${availableTime}.`
      ));
    }

    if (now > endTime) {
      // Persist the terminal state once (atomic guard) so an expired link stays expired.
      await Interview.update(
        { status: 'completed' },
        { where: { id: interview.id, status: { [Op.ne]: 'completed' } } }
      );
      console.log('⏰ Interview link expired:', interview.id);
      return res.status(410).send(joinPage('Interview Link Expired', 'This interview link has expired.'));
    }

    if (!interview.meetingLink) {
      return res.status(404).send(joinPage('No Meeting Link', 'No meeting link is available for this interview.'));
    }

    console.log('✅ Interview access granted:', interview.id);
    return res.redirect(302, interview.meetingLink);
  } catch (error) {
    console.error('Interview join error:', error);
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
    // Save tokens to user
    await User.update(
      { googleMeetAccessToken: tokens.access_token, googleMeetRefreshToken: tokens.refresh_token || null },
      { where: { id: employerId } }
    );
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/employer/dashboard?googleMeetConnected=true`);
  } catch (error) {
    console.error('Google Meet callback error:', error.message);
    res.status(500).send('OAuth failed: ' + error.message);
  }
});

// GET /api/meetings/google-meet/status - Check if employer has connected Google
router.get('/google-meet/status', async (req, res) => {
  try {
    const { employerId } = req.query;
    if (!employerId) return res.json({ connected: false });
    const user = await User.findOne({ where: { id: employerId }, attributes: ['googleMeetAccessToken'] });
    res.json({ connected: !!(user?.googleMeetAccessToken) });
  } catch {
    res.json({ connected: false });
  }
});

// Create meeting (supports both Zoom and Google Meet)
router.post('/create', async (req, res) => {
  try {
    const { platform, topic, start_time, duration, description } = req.body;
    
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
      description: description || 'Interview meeting'
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
