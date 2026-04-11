import express from 'express';
import { Op } from 'sequelize';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleAuth.js';
import SavedCandidate from '../models/SavedCandidate.js';
import User from '../models/User.js';
import Profile from '../models/Profile.js';

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

    // Enrich with live profilePhoto from Profile table
    const emails = rows.map(r => r.candidateEmail).filter(Boolean);
    const profiles = emails.length
      ? await Profile.findAll({ where: { email: { [Op.in]: emails } }, attributes: ['email', 'profilePhoto'] })
      : [];
    const photoMap = {};
    profiles.forEach(p => { if (p.profilePhoto) photoMap[p.email] = p.profilePhoto; });

    const enriched = rows.map(r => ({
      ...r.toJSON(),
      candidateProfilePicture: photoMap[r.candidateEmail] || r.candidateProfilePicture || ''
    }));

    res.json({
      savedCandidates: enriched,
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
    const { candidateId, fullName, name, title, jobTitle, location, email, skills, experience, profilePhoto, companyName: reqCompanyName, companyLogo: reqCompanyLogo, notes, tags, appliedJobTitle, appliedJobId } = req.body;

    if (!candidateId) {
      return res.status(400).json({ error: 'Candidate ID is required' });
    }

    // Normalize candidateId: if not a valid UUID, use employerEmail+candidateId as a lookup key
    // and store the raw id as a string by using candidateEmail as unique key instead
    const candidateName = fullName || name || 'Unknown';
    const candidateEmail = email || `candidate_${candidateId}@placeholder.com`;

    // Check if already saved (by employerId + candidateEmail to handle non-UUID ids)
    const existingSave = await SavedCandidate.findOne({
      where: { employerId: req.user.id, candidateEmail }
    });
    if (existingSave) {
      return res.status(409).json({ error: 'Candidate already saved', savedId: existingSave.id });
    }

    // Parse experience: extract number from strings like "3 years", "5+", etc.
    let experienceNum = null;
    if (experience !== undefined && experience !== null && experience !== '') {
      const parsed = parseInt(String(experience));
      experienceNum = isNaN(parsed) ? null : parsed;
    }

    // Try to get extra info from DB, fall back to request body
    let candidateData = {
      name: candidateName,
      email: candidateEmail,
      title: title || jobTitle || '',
      location: location || '',
      skills: skills || [],
      experience: experienceNum,
      profilePicture: profilePhoto || ''
    };

    // Try UUID lookup only if candidateId looks like a UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(candidateId)) {
      try {
        const dbUser = await User.findOne({ where: { id: candidateId } });
        if (dbUser) {
          candidateData = {
            name: dbUser.name || dbUser.fullName || candidateData.name,
            email: dbUser.email || candidateData.email,
            title: dbUser.title || dbUser.jobTitle || candidateData.title,
            location: dbUser.location || candidateData.location,
            skills: dbUser.skills || candidateData.skills,
            experience: typeof dbUser.experience === 'number' ? dbUser.experience : experienceNum,
            profilePicture: dbUser.profilePicture || dbUser.profilePhoto || candidateData.profilePicture,
          };
        }
      } catch (_) {}
    }

    // Generate a deterministic UUID for non-UUID candidateIds
    const { v5: uuidv5 } = await import('uuid');
    const NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
    const resolvedCandidateId = uuidRegex.test(candidateId)
      ? candidateId
      : uuidv5(`${candidateId}`, NAMESPACE);

    const savedCandidate = await SavedCandidate.create({
      employerId: req.user.id,
      employerEmail: req.user.email,
      candidateId: resolvedCandidateId,
      candidateName: candidateData.name,
      candidateEmail: candidateData.email,
      candidateTitle: candidateData.title,
      candidateLocation: candidateData.location,
      candidateSkills: Array.isArray(candidateData.skills) ? candidateData.skills : [],
      candidateExperience: candidateData.experience,
      candidateProfilePicture: candidateData.profilePicture,
      companyName: reqCompanyName || req.user.companyName || '',
      companyLogo: reqCompanyLogo || req.user.companyLogo || '',
      appliedJobTitle: appliedJobTitle || '',
      appliedJobId: appliedJobId || null,
      notes: notes || '',
      tags: tags || []
    });

    res.status(201).json({ message: 'Candidate saved successfully', savedCandidate });
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
