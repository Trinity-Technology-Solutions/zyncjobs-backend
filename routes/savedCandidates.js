import express from 'express';
import { Op } from 'sequelize';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleAuth.js';
import SavedCandidate from '../models/SavedCandidate.js';
import User from '../models/User.js';

const router = express.Router();

// GET /api/saved-candidates - Get all saved candidates for employer
router.get('/', authenticateToken, requireRole(['employer']), async (req, res) => {
  try {
    const { page = 1, limit = 10, search, skills, location } = req.query;
    const offset = (page - 1) * limit;
    
    const whereClause = {
      employerId: req.user.id
    };
    
    // Add search filters
    if (search) {
      whereClause[Op.or] = [
        { candidateName: { [Op.iLike]: `%${search}%` } },
        { candidateTitle: { [Op.iLike]: `%${search}%` } },
        { candidateHeadline: { [Op.iLike]: `%${search}%` } }
      ];
    }
    
    if (location) {
      whereClause.candidateLocation = { [Op.iLike]: `%${location}%` };
    }
    
    if (skills) {
      const skillsArray = skills.split(',').map(s => s.trim());
      whereClause.candidateSkills = { [Op.overlap]: skillsArray };
    }
    
    const { count, rows } = await SavedCandidate.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['savedAt', 'DESC']]
    });
    
    res.json({
      savedCandidates: rows,
      total: count,
      page: parseInt(page),
      totalPages: Math.ceil(count / limit)
    });
  } catch (error) {
    console.error('Error fetching saved candidates:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/saved-candidates - Save a candidate
router.post('/', authenticateToken, requireRole(['employer']), async (req, res) => {
  try {
    const { candidateId, notes, tags } = req.body;
    
    if (!candidateId) {
      return res.status(400).json({ error: 'Candidate ID is required' });
    }
    
    // Check if candidate exists
    const candidate = await User.findOne({
      where: { id: candidateId, role: 'candidate' }
    });
    
    if (!candidate) {
      return res.status(404).json({ error: 'Candidate not found' });
    }
    
    // Check if already saved
    const existingSave = await SavedCandidate.findOne({
      where: {
        employerId: req.user.id,
        candidateId: candidateId
      }
    });
    
    if (existingSave) {
      return res.status(409).json({ error: 'Candidate already saved' });
    }
    
    // Create saved candidate record
    const savedCandidate = await SavedCandidate.create({
      employerId: req.user.id,
      employerEmail: req.user.email,
      candidateId: candidateId,
      candidateName: candidate.name,
      candidateEmail: candidate.email,
      candidateTitle: candidate.title,
      candidateLocation: candidate.location,
      candidatePhone: candidate.phone,
      candidateHeadline: candidate.headline,
      candidateBio: candidate.bio,
      candidateSkills: candidate.skills || [],
      candidateExperience: candidate.experience,
      candidateEducation: candidate.education,
      candidateProfilePicture: candidate.profilePicture,
      candidateResumeUrl: candidate.resumeUrl,
      candidateLinkedinUrl: candidate.linkedinUrl,
      candidateGithubUrl: candidate.githubUrl,
      candidatePortfolioUrl: candidate.portfolioUrl,
      companyName: req.user.companyName,
      companyLogo: req.user.companyLogo,
      notes: notes || '',
      tags: tags || []
    });
    
    res.status(201).json({
      message: 'Candidate saved successfully',
      savedCandidate
    });
  } catch (error) {
    console.error('Error saving candidate:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/saved-candidates/:candidateId - Update saved candidate (notes/tags)
router.put('/:candidateId', authenticateToken, requireRole(['employer']), async (req, res) => {
  try {
    const { candidateId } = req.params;
    const { notes, tags } = req.body;
    
    const savedCandidate = await SavedCandidate.findOne({
      where: {
        employerId: req.user.id,
        candidateId: candidateId
      }
    });
    
    if (!savedCandidate) {
      return res.status(404).json({ error: 'Saved candidate not found' });
    }
    
    await savedCandidate.update({
      notes: notes !== undefined ? notes : savedCandidate.notes,
      tags: tags !== undefined ? tags : savedCandidate.tags
    });
    
    res.json({
      message: 'Saved candidate updated successfully',
      savedCandidate
    });
  } catch (error) {
    console.error('Error updating saved candidate:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/saved-candidates/:candidateId - Remove saved candidate
router.delete('/:candidateId', authenticateToken, requireRole(['employer']), async (req, res) => {
  try {
    const { candidateId } = req.params;
    
    const deleted = await SavedCandidate.destroy({
      where: {
        employerId: req.user.id,
        candidateId: candidateId
      }
    });
    
    if (!deleted) {
      return res.status(404).json({ error: 'Saved candidate not found' });
    }
    
    res.json({ message: 'Candidate removed from saved list' });
  } catch (error) {
    console.error('Error removing saved candidate:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/saved-candidates/check/:candidateId - Check if candidate is saved
router.get('/check/:candidateId', authenticateToken, requireRole(['employer']), async (req, res) => {
  try {
    const { candidateId } = req.params;
    
    const savedCandidate = await SavedCandidate.findOne({
      where: {
        employerId: req.user.id,
        candidateId: candidateId
      }
    });
    
    res.json({ isSaved: !!savedCandidate });
  } catch (error) {
    console.error('Error checking saved candidate:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/saved-candidates/stats - Get saved candidates statistics
router.get('/stats', authenticateToken, requireRole(['employer']), async (req, res) => {
  try {
    const total = await SavedCandidate.count({
      where: { employerId: req.user.id }
    });
    
    const thisMonth = await SavedCandidate.count({
      where: {
        employerId: req.user.id,
        savedAt: {
          [Op.gte]: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
        }
      }
    });
    
    res.json({
      total,
      thisMonth
    });
  } catch (error) {
    console.error('Error fetching saved candidates stats:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
