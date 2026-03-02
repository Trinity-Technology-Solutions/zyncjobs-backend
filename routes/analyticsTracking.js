import express from 'express';
import Analytics from '../models/Analytics.js';

const router = express.Router();

// Track profile view
router.post('/track/profile-view', async (req, res) => {
  try {
    const { userId, email, viewedBy } = req.body;
    
    await Analytics.create({
      userId,
      email,
      userType: 'candidate',
      eventType: 'profile_view',
      metadata: { viewedBy }
    });
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Track search appearance
router.post('/track/search-appearance', async (req, res) => {
  try {
    const { userId, email, searchQuery } = req.body;
    
    await Analytics.create({
      userId,
      email,
      userType: 'candidate',
      eventType: 'search_appearance',
      metadata: { searchQuery }
    });
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Track recruiter action
router.post('/track/recruiter-action', async (req, res) => {
  try {
    const { userId, email, action, recruiterId } = req.body;
    
    await Analytics.create({
      userId,
      email,
      userType: 'candidate',
      eventType: 'recruiter_action',
      metadata: { action, recruiterId }
    });
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;