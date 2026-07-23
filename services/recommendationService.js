import { Op } from 'sequelize';
import Job from '../models/Job.js';
import Profile from '../models/Profile.js';
import User from '../models/User.js';
import vectorService from './vectorService.js';
import { sequelize } from '../config/postgresql.js';

async function resolveUserId(idOrEmail) {
  if (!idOrEmail) return null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrEmail)) {
    return idOrEmail;
  }
  const user = await User.findOne({ where: { email: { [Op.iLike]: idOrEmail } }, attributes: ['id'] });
  return user ? user.id : null;
}

export const getSmartRecommendations = async (userId, limit = 10) => {
  try {
    const resolved = await resolveUserId(userId);
    if (!resolved) return [];

    // Try by userId first, fallback to email
    let profile = await Profile.findOne({ where: { userId: resolved } });
    if (!profile) {
      const user = await User.findByPk(resolved, { attributes: ['email'] });
      if (user?.email) {
        profile = await Profile.findOne({ where: { email: user.email } });
        // Link userId to profile for future lookups
        if (profile && !profile.userId) {
          await profile.update({ userId: resolved });
        }
      }
    }

    let queryText = profile ? vectorService.profileToText(profile.toJSON()) : null;

    // Fallback: use existing resume_embedding if profile has no skills
    if (!queryText || queryText.trim().length < 10) {
      const [row] = await sequelize.query(
        `SELECT text FROM resume_embeddings WHERE "userId" = :userId LIMIT 1`,
        { replacements: { userId: String(resolved) }, type: sequelize.QueryTypes.SELECT }
      );
      if (row?.text) queryText = row.text;
    }

    if (!queryText || queryText.trim().length < 10) return [];

    // Index this user's profile so future calls are faster
    if (profile) vectorService.upsertResumeEmbedding(resolved, profile.toJSON()).catch(() => {});

    return await vectorService.findSimilarJobs(queryText, limit);
  } catch (e) {
    console.error('getSmartRecommendations error:', e.message);
    return [];
  }
};

export const getSimilarJobs = async (jobId, limit = 5) => {
  try {
    const job = await Job.findByPk(jobId);
    if (!job) return [];

    const queryText = vectorService.jobToText(job.toJSON());
    const similar = await vectorService.findSimilarJobs(queryText, limit + 1);

    // Exclude the source job itself
    return similar.filter(j => j.id !== jobId).slice(0, limit);
  } catch (e) {
    console.error('getSimilarJobs error:', e.message);
    return [];
  }
};

export const getTrendingJobs = async (limit = 10) => {
  return Job.findAll({
    where: { isActive: true, status: 'approved' },
    limit,
    order: [['views', 'DESC'], ['applicationsCount', 'DESC']]
  });
};

// Match a single job against a candidate profile
export const getJobMatchDetails = async (jobId, userId) => {
  try {
    const [job, profile] = await Promise.all([
      Job.findByPk(jobId),
      (async () => {
        const resolved = await resolveUserId(userId);
        if (!resolved) return null;
        let p = await Profile.findOne({ where: { userId: resolved } });
        if (!p) {
          const u = await User.findByPk(resolved, { attributes: ['email'] });
          if (u?.email) p = await Profile.findOne({ where: { email: u.email } });
        }
        return p;
      })()
    ]);
    if (!job || !profile) return null;
    return vectorService.explainMatch(job.toJSON(), profile.toJSON());
  } catch (e) {
    console.error('getJobMatchDetails error:', e.message);
    return null;
  }
};

// Get top candidate matches for a job (employer use)
export const getTopCandidatesForJob = async (jobId, limit = 20) => {
  try {
    const job = await Job.findByPk(jobId);
    if (!job) return [];
    const queryText = vectorService.jobToText(job.toJSON());
    return vectorService.findSimilarCandidates(queryText, limit);
  } catch (e) {
    console.error('getTopCandidatesForJob error:', e.message);
    return [];
  }
};


