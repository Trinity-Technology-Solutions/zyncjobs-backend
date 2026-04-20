import express from 'express';
import { Op } from 'sequelize';
import { authenticateToken } from '../middleware/auth.js';
import SavedRecommendedJob from '../models/SavedRecommendedJob.js';

const router = express.Router();

// GET /api/saved-recommended-jobs - Get user's saved recommended jobs
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;
    
    const { count, rows } = await SavedRecommendedJob.findAndCountAll({
      where: { userId: req.user.id },
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['savedAt', 'DESC']]
    });
    
    res.json({
      savedJobs: rows,
      total: count,
      page: parseInt(page),
      totalPages: Math.ceil(count / limit)
    });
  } catch (error) {
    console.error('Error fetching saved recommended jobs:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/saved-recommended-jobs - Save a recommended job
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { 
      jobId, 
      jobTitle, 
      company, 
      location, 
      salary, 
      jobType, 
      skills, 
      description, 
      matchPercentage, 
      matchingSkills 
    } = req.body;
    
    if (!jobId || !jobTitle || !company) {
      return res.status(400).json({ error: 'Job ID, title, and company are required' });
    }
    
    // Check if already saved
    const existingSave = await SavedRecommendedJob.findOne({
      where: {
        userId: req.user.id,
        jobId: jobId
      }
    });
    
    if (existingSave) {
      return res.status(409).json({ error: 'Job already saved' });
    }
    
    // Create saved job record
    const savedJob = await SavedRecommendedJob.create({
      userId: req.user.id,
      userEmail: req.user.email,
      jobId,
      jobTitle,
      company,
      location,
      salary,
      jobType,
      skills: skills || [],
      description,
      matchPercentage,
      matchingSkills: matchingSkills || []
    });
    
    res.status(201).json({
      message: 'Job saved successfully',
      savedJob
    });
  } catch (error) {
    console.error('Error saving recommended job:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/saved-recommended-jobs/:jobId - Remove saved recommended job
router.delete('/:jobId', authenticateToken, async (req, res) => {
  try {
    const { jobId } = req.params;
    
    const deleted = await SavedRecommendedJob.destroy({
      where: {
        userId: req.user.id,
        jobId: jobId
      }
    });
    
    if (!deleted) {
      return res.status(404).json({ error: 'Saved job not found' });
    }
    
    res.json({ message: 'Job removed from saved list' });
  } catch (error) {
    console.error('Error removing saved recommended job:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/saved-recommended-jobs/check/:jobId - Check if job is saved
router.get('/check/:jobId', authenticateToken, async (req, res) => {
  try {
    const { jobId } = req.params;
    
    const savedJob = await SavedRecommendedJob.findOne({
      where: {
        userId: req.user.id,
        jobId: jobId
      }
    });
    
    res.json({ isSaved: !!savedJob });
  } catch (error) {
    console.error('Error checking saved recommended job:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
