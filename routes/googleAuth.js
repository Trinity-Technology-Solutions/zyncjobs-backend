import express from 'express';
import MeetingService from '../services/meetingService.js';

const router = express.Router();
const meetingService = new MeetingService();

// Get Google authorization URL
router.get('/auth-url', (req, res) => {
  try {
    const authUrl = meetingService.getGoogleAuthUrl();
    res.json({ 
      success: true, 
      authUrl: authUrl 
    });
  } catch (error) {
    console.error('Error generating Google auth URL:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to generate authorization URL' 
    });
  }
});

// Handle Google OAuth callback
router.get('/callback', async (req, res) => {
  try {
    const { code } = req.query;
    
    if (!code) {
      return res.status(400).json({ 
        success: false, 
        error: 'Authorization code not provided' 
      });
    }

    const tokenResult = await meetingService.getGoogleAccessToken(code);
    
    if (!tokenResult.success) {
      return res.status(400).json(tokenResult);
    }

    // Store tokens in session or return to frontend
    req.session.googleTokens = tokenResult.tokens;
    
    // Redirect to frontend with success
    res.redirect(`${process.env.FRONTEND_URL}/dashboard?google_auth=success`);
    
  } catch (error) {
    console.error('Error in Google OAuth callback:', error);
    res.redirect(`${process.env.FRONTEND_URL}/dashboard?google_auth=error`);
  }
});

// Create Google Meet with stored tokens
router.post('/create-meet', async (req, res) => {
  try {
    const { meetingData } = req.body;
    const googleTokens = req.session.googleTokens;
    
    if (!googleTokens) {
      return res.status(401).json({ 
        success: false, 
        error: 'Google authorization required',
        requiresAuth: true
      });
    }

    // Add access token to meeting data
    meetingData.accessToken = googleTokens.access_token;
    meetingData.platform = 'googlemeet';
    
    const result = await meetingService.createMeeting(meetingData);
    res.json(result);
    
  } catch (error) {
    console.error('Error creating Google Meet:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to create Google Meet' 
    });
  }
});

export default router;