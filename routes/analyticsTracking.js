import express from 'express';
import Analytics from '../models/Analytics.js';

const router = express.Router();

// Attach io instance (set by server.js)
let _io = null;
export function setIo(io) { _io = io; }

function emitAnalyticsUpdate(email, eventType) {
  if (_io) {
    _io.emit(`analytics_update:${email}`, { eventType, timestamp: new Date() });
  }
}

// Track profile view
router.post('/track/profile-view', async (req, res) => {
  try {
    const { userId, email, viewedBy } = req.body;
    await Analytics.create({ userId, email, eventType: 'profile_view', metadata: { viewedBy } });
    emitAnalyticsUpdate(email, 'profile_view');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Track search appearance
router.post('/track/search-appearance', async (req, res) => {
  try {
    const { userId, email, searchQuery, keyword } = req.body;
    if (!email) return res.status(400).json({ error: 'email required' });

    const query = (searchQuery || keyword || '').trim();
    // Skip single-char or empty queries
    if (query.length < 3) return res.json({ success: true, skipped: true });

    // Deduplicate: don't track same keyword for same candidate within 1 hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const { Op } = await import('sequelize');
    const existing = await Analytics.findOne({
      where: {
        email,
        eventType: 'search_appearance',
        createdAt: { [Op.gte]: oneHourAgo },
        ...(query ? { metadata: { [Op.contains]: { searchQuery: query } } } : {})
      }
    }).catch(() => null);

    if (existing) return res.json({ success: true, deduplicated: true });

    await Analytics.create({
      userId,
      email,
      eventType: 'search_appearance',
      metadata: { searchQuery: query, keyword: query }
    });
    emitAnalyticsUpdate(email, 'search_appearance');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Batch track search appearances (called by CandidateSearchPage)
router.post('/track/search-appearances', async (req, res) => {
  try {
    const { emails, searchQuery, keyword } = req.body;
    if (!Array.isArray(emails) || emails.length === 0) return res.status(400).json({ error: 'emails array required' });

    const query = (searchQuery || keyword || '').trim();
    if (query.length < 2) return res.json({ success: true, skipped: true });

    const { Op } = await import('sequelize');
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    await Promise.all(emails.map(async (email) => {
      if (!email) return;
      const existing = await Analytics.findOne({
        where: {
          email,
          eventType: 'search_appearance',
          createdAt: { [Op.gte]: oneHourAgo },
          metadata: { [Op.contains]: { searchQuery: query } }
        }
      }).catch(() => null);
      if (existing) return;
      await Analytics.create({ email, eventType: 'search_appearance', metadata: { searchQuery: query, keyword: query } });
      emitAnalyticsUpdate(email, 'search_appearance');
    }));

    res.json({ success: true, tracked: emails.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Track recruiter action
router.post('/track/recruiter-action', async (req, res) => {
  try {
    const { userId, email, action, recruiterId, recruiterName, recruiterTitle, company, location, profilePicture, recruiterEmail } = req.body;
    await Analytics.create({
      userId,
      email,
      eventType: 'recruiter_action',
      metadata: { action, recruiterId, recruiterName, recruiterTitle, company, location, profilePicture, recruiterEmail }
    });
    emitAnalyticsUpdate(email, 'recruiter_action');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
