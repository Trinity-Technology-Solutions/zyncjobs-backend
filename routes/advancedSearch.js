import express from 'express';
import { advancedJobSearch, getSearchSuggestions } from '../services/advancedSearchService.js';
import { getSmartRecommendations, getSimilarJobs, getTrendingJobs } from '../services/recommendationService.js';
import Job from '../models/Job.js';

const router = express.Router();

// POST /api/search/advanced - Advanced job search with all filters
router.post('/advanced', async (req, res) => {
  try {
    const searchParams = req.body;
    console.log('Search params:', searchParams);
    const result = await advancedJobSearch(searchParams);
    res.json(result);
  } catch (error) {
    console.error('Advanced search error:', error.message);
    console.error('Stack:', error.stack);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/search/suggestions - Get search suggestions
router.get('/suggestions', async (req, res) => {
  try {
    const { q, type = 'all' } = req.query;
    if (!q || q.length < 2) {
      return res.json([]);
    }
    
    const suggestions = await getSearchSuggestions(q, type);
    res.json(suggestions);
  } catch (error) {
    console.error('Search suggestions error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/search/recommendations/:userId - Smart job recommendations
router.get('/recommendations/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 10 } = req.query;
    
    const recommendations = await getSmartRecommendations(userId, parseInt(limit));
    res.json(recommendations);
  } catch (error) {
    console.error('Recommendations error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/search/similar/:jobId - Similar jobs
router.get('/similar/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { limit = 5 } = req.query;
    
    const similarJobs = await getSimilarJobs(jobId, parseInt(limit));
    res.json(similarJobs);
  } catch (error) {
    console.error('Similar jobs error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/search/trending - Trending jobs
router.get('/trending', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const trendingJobs = await getTrendingJobs(parseInt(limit));
    res.json(trendingJobs);
  } catch (error) {
    console.error('Trending jobs error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/search/filters - Get available filter options
router.get('/filters', async (req, res) => {
  try {
    // Return default filter options
    res.json({
      jobTypes: ['Full-time', 'Part-time', 'Contract', 'Internship', 'Freelance'],
      locationTypes: ['On-site', 'Remote', 'Hybrid'],
      industries: ['Technology', 'Healthcare', 'Finance', 'Education', 'Retail', 'Manufacturing'],
      companySizes: ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'],
      locations: []
    });
  } catch (error) {
    console.error('Filters error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/search/radius - Location-based radius search
router.post('/radius', async (req, res) => {
  try {
    const { latitude, longitude, radius = 50, ...otherParams } = req.body;
    
    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'Latitude and longitude are required' });
    }

    const searchParams = {
      ...otherParams,
      coordinates: [longitude, latitude],
      radius
    };

    const result = await advancedJobSearch(searchParams);
    res.json(result);
  } catch (error) {
    console.error('Radius search error:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/search/track-view/:jobId - Track job view
router.put('/track-view/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    
    const job = await Job.findByPk(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Increment views
    await job.increment('views', { by: 1 });
    
    // Update trending status if views exceed threshold
    if (job.views >= 100 && !job.trending) {
      await job.update({ trending: true });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Track view error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;