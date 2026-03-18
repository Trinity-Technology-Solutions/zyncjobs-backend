import { Op } from 'sequelize';
import Job from '../models/Job.js';
import Profile from '../models/Profile.js';

export const getSmartRecommendations = async (userId, limit = 10) => {
  const profile = await Profile.findOne({ where: { userId } });
  const where = { isActive: true, status: 'approved' };

  if (profile?.skills?.length) {
    where.skills = { [Op.overlap]: profile.skills };
  }

  return Job.findAll({ where, limit, order: [['createdAt', 'DESC']] });
};

export const getSimilarJobs = async (jobId, limit = 5) => {
  const job = await Job.findByPk(jobId);
  if (!job) return [];

  return Job.findAll({
    where: {
      id: { [Op.ne]: jobId },
      isActive: true,
      status: 'approved',
      [Op.or]: [
        { jobTitle: { [Op.iLike]: `%${job.jobTitle}%` } },
        { skills: { [Op.overlap]: job.skills || [] } }
      ]
    },
    limit,
    order: [['createdAt', 'DESC']]
  });
};

export const getTrendingJobs = async (limit = 10) => {
  return Job.findAll({
    where: { isActive: true, status: 'approved' },
    limit,
    order: [['views', 'DESC'], ['applicationsCount', 'DESC']]
  });
};
