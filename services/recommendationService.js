import Job from '../models/Job.js';
import User from '../models/User.js';
import { Op } from 'sequelize';

// Smart job recommendations based on user profile
export const getSmartRecommendations = async (userId, limit = 10) => {
  try {
    const user = await User.findByPk(userId);
    if (!user) return [];

    const userSkills = user.profile?.skills || [];
    const userLocation = user.location || '';

    const where = {
      isActive: true,
      status: 'approved'
    };

    if (userLocation) {
      where.location = { [Op.iLike]: `%${userLocation}%` };
    }

    const jobs = await Job.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit
    });

    return jobs;
  } catch (error) {
    console.error('Smart recommendations error:', error);
    return [];
  }
};

// Get similar jobs based on a specific job
export const getSimilarJobs = async (jobId, limit = 5) => {
  try {
    const job = await Job.findByPk(jobId);
    if (!job) return [];

    const where = {
      isActive: true,
      status: 'approved',
      id: { [Op.ne]: jobId }
    };

    // Try to find similar jobs by company, location, or job type
    const similarJobs = await Job.findAll({
      where: {
        ...where,
        [Op.or]: [
          { company: job.company },
          { location: job.location },
          { jobType: job.jobType },
          { industry: job.industry }
        ]
      },
      order: [['createdAt', 'DESC']],
      limit
    });

    return similarJobs;
  } catch (error) {
    console.error('Similar jobs error:', error);
    return [];
  }
};

// Get trending jobs
export const getTrendingJobs = async (limit = 10) => {
  try {
    const jobs = await Job.findAll({
      where: {
        isActive: true,
        status: 'approved',
        [Op.or]: [
          { trending: true },
          { views: { [Op.gte]: 100 } },
          { applicationsCount: { [Op.gte]: 10 } }
        ]
      },
      order: [['views', 'DESC'], ['applicationsCount', 'DESC'], ['createdAt', 'DESC']],
      limit
    });

    return jobs;
  } catch (error) {
    console.error('Trending jobs error:', error);
    return [];
  }
};

export default {
  getSmartRecommendations,
  getSimilarJobs,
  getTrendingJobs
};