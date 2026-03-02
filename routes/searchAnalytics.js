import express from 'express';
import SearchAnalytics from '../models/SearchAnalytics.js';
import { Op } from 'sequelize';

const router = express.Router();

// POST /api/search-analytics/track - Track a search query
router.post('/track', async (req, res) => {
  try {
    const { query } = req.body;
    
    if (!query || query.trim().length < 2) {
      return res.status(400).json({ error: 'Query must be at least 2 characters' });
    }

    const cleanQuery = query.trim().toLowerCase();
    
    await SearchAnalytics.create({
      searchQuery: cleanQuery
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/search-analytics/popular - Get popular searches
router.get('/popular', async (req, res) => {
  try {
    res.json({
      searches: ['React', 'Python', 'JavaScript', 'Node.js', 'Java', 'Angular']
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/search-analytics/trending - Get trending searches
router.get('/trending', async (req, res) => {
  try {
    res.json({
      searches: ['Full Stack', 'Remote', 'Senior', 'Frontend', 'Backend', 'DevOps']
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;