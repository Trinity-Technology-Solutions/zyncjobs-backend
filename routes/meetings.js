import express from 'express';
import { meetingService } from '../services/meetingService.js';

const router = express.Router();

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