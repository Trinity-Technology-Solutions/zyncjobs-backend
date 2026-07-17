import Job from '../models/Job.js';
import Profile from '../models/Profile.js';
import vectorService from './vectorService.js';

export const getSmartRecommendations = async (userId, limit = 10) => {
  try {
    const profile = await Profile.findOne({ where: { userId } });
    if (!profile) return [];

    const queryText = vectorService.profileToText(profile.toJSON());
    const matches = await vectorService.findSimilarJobs(queryText, limit);

    return matches;
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
      Profile.findOne({ where: { userId } })
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


