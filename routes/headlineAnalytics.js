import express from 'express';
import HeadlineAnalytics from '../models/HeadlineAnalytics.js';

const router = express.Router();

// POST /api/headline/track-view - Track headline view
router.post('/track-view', async (req, res) => {
  try {
    const { userId, version } = req.body; // version: 'A' or 'B'
    
    const [analytics] = await HeadlineAnalytics.findOrCreate({
      where: { userId, isActive: true },
      defaults: { userId, viewsA: 0, viewsB: 0, clicksA: 0, clicksB: 0 }
    });
    
    if (version === 'A') {
      await analytics.increment('viewsA');
    } else {
      await analytics.increment('viewsB');
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/headline/rotation/:userId - Get which headline to show
router.get('/rotation/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId || userId === 'undefined') {
      return res.json({ version: 'A', headline: '', viewsA: 0, viewsB: 0 });
    }
    
    const analytics = await HeadlineAnalytics.findOne({ where: { userId, isActive: true } });
    if (!analytics) {
      return res.json({ version: 'A', headline: '', viewsA: 0, viewsB: 0 });
    }
    
    // Simple rotation: alternate based on total views
    const totalViews = analytics.viewsA + analytics.viewsB;
    const showA = totalViews % 2 === 0;
    
    res.json({
      version: showA ? 'A' : 'B',
      headline: showA ? (analytics.headlineA || '') : (analytics.headlineB || ''),
      viewsA: analytics.viewsA || 0,
      viewsB: analytics.viewsB || 0
    });
  } catch (error) {
    console.error('Headline rotation error:', error);
    res.json({ version: 'A', headline: '', viewsA: 0, viewsB: 0 });
  }
});

// POST /api/headline/start-test - Start A/B test
router.post('/start-test', async (req, res) => {
  try {
    const { userId, headlineA, headlineB } = req.body;
    
    await HeadlineAnalytics.upsert({
      userId,
      headlineA, 
      headlineB, 
      viewsA: 0, 
      viewsB: 0, 
      clicksA: 0, 
      clicksB: 0, 
      isActive: true 
    });
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/headline/stats/:userId - Get test statistics
router.get('/stats/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const analytics = await HeadlineAnalytics.findOne({ where: { userId, isActive: true } });
    if (!analytics) {
      return res.json({ viewsA: 0, viewsB: 0, clicksA: 0, clicksB: 0 });
    }
    
    res.json({
      viewsA: analytics.viewsA,
      viewsB: analytics.viewsB,
      clicksA: analytics.clicksA,
      clicksB: analytics.clicksB
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;