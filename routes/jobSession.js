import express from 'express';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// In-memory storage for job application sessions (could be moved to Redis in production)
const jobApplicationSessions = new Map();

// POST /api/job-session/store - Store job data for application
router.post('/store', async (req, res) => {
  try {
    const { jobData, sessionId } = req.body;
    
    if (!jobData || !sessionId) {
      return res.status(400).json({ error: 'Job data and session ID are required' });
    }
    
    // Store job data with expiration (30 minutes)
    const expiresAt = Date.now() + (30 * 60 * 1000);
    jobApplicationSessions.set(sessionId, {
      jobData,
      expiresAt,
      userId: req.user?.id || null
    });
    
    res.json({
      message: 'Job data stored successfully',
      sessionId,
      expiresAt
    });
  } catch (error) {
    console.error('Error storing job session:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/job-session/:sessionId - Retrieve job data for application
router.get('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const session = jobApplicationSessions.get(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found or expired' });
    }
    
    // Check if session has expired
    if (Date.now() > session.expiresAt) {
      jobApplicationSessions.delete(sessionId);
      return res.status(404).json({ error: 'Session expired' });
    }
    
    res.json({
      jobData: session.jobData,
      expiresAt: session.expiresAt
    });
  } catch (error) {
    console.error('Error retrieving job session:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/job-session/:sessionId - Clear job session
router.delete('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const deleted = jobApplicationSessions.delete(sessionId);
    
    res.json({
      message: deleted ? 'Session cleared successfully' : 'Session not found',
      deleted
    });
  } catch (error) {
    console.error('Error clearing job session:', error);
    res.status(500).json({ error: error.message });
  }
});

// Cleanup expired sessions every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of jobApplicationSessions.entries()) {
    if (now > session.expiresAt) {
      jobApplicationSessions.delete(sessionId);
    }
  }
}, 10 * 60 * 1000);

export default router;