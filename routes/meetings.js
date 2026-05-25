import express from 'express';
import { meetingService } from '../services/meetingService.js';
import User from '../models/User.js';

const router = express.Router();

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
