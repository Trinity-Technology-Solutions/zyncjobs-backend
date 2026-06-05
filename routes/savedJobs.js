import express from 'express';
import { DataTypes, Op } from 'sequelize';
import { sequelize } from '../config/postgresql.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Lazy-define SavedJob model (avoids circular imports)
let SavedJob;
function getSavedJobModel() {
  if (SavedJob) return SavedJob;
  SavedJob = sequelize.define('SavedJob', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.STRING, allowNull: false },
    userEmail: { type: DataTypes.STRING, allowNull: false },
    jobId: { type: DataTypes.STRING, allowNull: false },
    jobTitle: DataTypes.STRING,
    company: DataTypes.STRING,
    location: DataTypes.STRING,
    salary: DataTypes.JSONB,
    jobType: DataTypes.STRING,
    savedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
  }, {
    tableName: 'saved_jobs',
    timestamps: true,
    indexes: [
      { fields: ['userId'] },
      { fields: ['userEmail'] },
      { unique: true, fields: ['userId', 'jobId'] }
    ]
  });
  SavedJob.sync({ force: false }).catch(e => console.warn('saved_jobs sync error:', e.message));
  return SavedJob;
}

// GET /api/saved-jobs — list saved jobs for logged-in user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const Model = getSavedJobModel();
    const rows = await Model.findAll({
      where: { userId: req.user.id },
      order: [['savedAt', 'DESC']]
    });
    res.json({ savedJobs: rows, jobIds: rows.map(r => r.jobId) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/saved-jobs — save a job
router.post('/', authenticateToken, async (req, res) => {
  try {
    const Model = getSavedJobModel();
    const { jobId, jobTitle, company, location, salary, jobType } = req.body;
    if (!jobId) return res.status(400).json({ error: 'jobId required' });

    const [row, created] = await Model.findOrCreate({
      where: { userId: req.user.id, jobId },
      defaults: { userEmail: req.user.email, jobId, jobTitle, company, location, salary, jobType }
    });
    res.status(created ? 201 : 200).json({ savedJob: row, alreadySaved: !created });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/saved-jobs/:jobId — unsave a job
router.delete('/:jobId', authenticateToken, async (req, res) => {
  try {
    const Model = getSavedJobModel();
    const deleted = await Model.destroy({ where: { userId: req.user.id, jobId: req.params.jobId } });
    if (!deleted) return res.status(404).json({ error: 'Saved job not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/saved-jobs/check/:jobId
router.get('/check/:jobId', authenticateToken, async (req, res) => {
  try {
    const Model = getSavedJobModel();
    const row = await Model.findOne({ where: { userId: req.user.id, jobId: req.params.jobId } });
    res.json({ isSaved: !!row });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
