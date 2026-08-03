import express from 'express';
import CareerRoadmap from '../models/CareerRoadmap.js';

const router = express.Router();

// POST /api/roadmaps — save or update roadmap
router.post('/', async (req, res) => {
  try {
    const { userId, currentRole, targetRole, experience, roadmapData, completedSteps } = req.body;
    if (!userId || !roadmapData) return res.status(400).json({ error: 'userId and roadmapData are required' });

    const [roadmap] = await CareerRoadmap.upsert({
      userId,
      currentRole,
      targetRole,
      experience,
      roadmapData,
      completedSteps: completedSteps || [],
    });

    res.json({ success: true, roadmap });
  } catch (err) {
    console.error('Save roadmap error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/roadmaps/:userId — fetch roadmap
router.get('/:userId', async (req, res) => {
  try {
    const roadmap = await CareerRoadmap.findOne({ where: { userId: req.params.userId } });
    if (!roadmap) return res.status(404).json(null);
    res.json({
      userId: roadmap.userId,
      currentRole: roadmap.currentRole,
      targetRole: roadmap.targetRole,
      experience: roadmap.experience,
      roadmapData: roadmap.roadmapData,
      completedSteps: roadmap.completedSteps,
    });
  } catch (err) {
    console.error('Fetch roadmap error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
