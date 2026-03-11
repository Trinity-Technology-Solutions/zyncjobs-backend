import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleAuth.js';

const router = express.Router();

// GET /api/saved-candidates - Get all saved candidates
router.get('/', authenticateToken, requireRole(['employer']), async (req, res) => {
  try {
    res.json({ savedCandidates: [], total: 0 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/saved-candidates - Save a candidate
router.post('/', authenticateToken, requireRole(['employer']), async (req, res) => {
  try {
    const { candidateId } = req.body;
    res.json({ message: 'Candidate saved successfully', candidateId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/saved-candidates/:candidateId - Remove saved candidate
router.delete('/:candidateId', authenticateToken, requireRole(['employer']), async (req, res) => {
  try {
    const { candidateId } = req.params;
    res.json({ message: 'Candidate removed from saved list', candidateId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
