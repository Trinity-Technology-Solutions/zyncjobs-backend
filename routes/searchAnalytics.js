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
    const limit = parseInt(req.query.limit) || 6;
    
    // Get most searched queries from last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const popularSearches = await SearchAnalytics.findAll({
      attributes: [
        'searchQuery',
        [SearchAnalytics.sequelize.fn('COUNT', SearchAnalytics.sequelize.col('searchQuery')), 'count']
      ],
      where: {
        createdAt: { [Op.gte]: thirtyDaysAgo },
        searchQuery: { [Op.ne]: null }
      },
      group: ['searchQuery'],
      order: [[SearchAnalytics.sequelize.literal('count'), 'DESC']],
      limit: limit,
      raw: true
    });

    // If no data, return default popular searches
    if (!popularSearches || popularSearches.length === 0) {
      return res.json({
        searches: ['React', 'Python', 'JavaScript', 'Node.js', 'Java', 'Angular']
      });
    }

    const searches = popularSearches.map(item => 
      item.searchQuery.charAt(0).toUpperCase() + item.searchQuery.slice(1)
    );

    res.json({ searches });
  } catch (error) {
    console.error('Popular searches error:', error);
    // Fallback to default if error
    res.json({
      searches: ['React', 'Python', 'JavaScript', 'Node.js', 'Java', 'Angular']
    });
  }
});

// GET /api/search-analytics/trending - Get trending searches
router.get('/trending', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 6;
    
    // Get trending searches from last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const trendingSearches = await SearchAnalytics.findAll({
      attributes: [
        'searchQuery',
        [SearchAnalytics.sequelize.fn('COUNT', SearchAnalytics.sequelize.col('searchQuery')), 'count']
      ],
      where: {
        createdAt: { [Op.gte]: sevenDaysAgo },
        searchQuery: { [Op.ne]: null }
      },
      group: ['searchQuery'],
      order: [[SearchAnalytics.sequelize.literal('count'), 'DESC']],
      limit: limit,
      raw: true
    });

    // If no data, return default trending searches
    if (!trendingSearches || trendingSearches.length === 0) {
      return res.json({
        searches: ['Full Stack', 'Remote', 'Senior', 'Frontend', 'Backend', 'DevOps']
      });
    }

    const searches = trendingSearches.map(item => 
      item.searchQuery.charAt(0).toUpperCase() + item.searchQuery.slice(1)
    );

    res.json({ searches });
  } catch (error) {
    console.error('Trending searches error:', error);
    // Fallback to default if error
    res.json({
      searches: ['Full Stack', 'Remote', 'Senior', 'Frontend', 'Backend', 'DevOps']
    });
  }
});

export default router;