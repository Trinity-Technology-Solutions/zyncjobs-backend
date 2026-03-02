import express from 'express';
import { Op } from 'sequelize';

const router = express.Router();

// Debug endpoint to check analytics data
router.get('/debug/:email', async (req, res) => {
  try {
    const { email } = req.params;
    
    const Analytics = (await import('../models/Analytics.js')).default;
    
    // Get all analytics for this email
    const allAnalytics = await Analytics.findAll({
      where: {
        email: { [Op.iLike]: `%${email}%` }
      },
      order: [['createdAt', 'DESC']]
    });
    
    const searchAppearances = await Analytics.count({
      where: {
        email: { [Op.iLike]: `%${email}%` },
        eventType: 'search_appearance'
      }
    });

    const recruiterActions = await Analytics.count({
      where: {
        email: { [Op.iLike]: `%${email}%` },
        eventType: 'recruiter_action'
      }
    });
    
    res.json({
      email,
      totalRecords: allAnalytics.length,
      searchAppearances,
      recruiterActions,
      allData: allAnalytics
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;