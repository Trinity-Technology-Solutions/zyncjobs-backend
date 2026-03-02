import Job from '../models/Job.js';
import User from '../models/User.js';

// Smart job recommendations based on user profile
export const getSmartRecommendations = async (userId, limit = 10) => {
  try {
    const user = await User.findById(userId);
    if (!user) return [];

    const userSkills = user.profile?.skills || [];
    const userLocation = user.location || '';
    const appliedJobIds = user.appliedJobs.map(app => app.jobId);

    // Build recommendation query
    const query = {
      isActive: true,
      status: 'approved',
      _id: { $nin: appliedJobIds }
    };

    // Score-based aggregation for recommendations
    const pipeline = [
      { $match: query },
      {
        $addFields: {
          score: {
            $add: [
              // Skills match score (0-50 points)
              {
                $multiply: [
                  { $size: { $setIntersection: ['$skills', userSkills] } },
                  10
                ]
              },
              // Location match score (0-20 points)
              {
                $cond: [
                  { $regexMatch: { input: '$location', regex: userLocation, options: 'i' } },
                  20,
                  0
                ]
              },
              // Recent jobs bonus (0-15 points)
              {
                $cond: [
                  { $gte: ['$createdAt', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)] },
                  15,
                  0
                ]
              },
              // Trending jobs bonus (0-10 points)
              { $cond: ['$trending', 10, 0] },
              // Featured jobs bonus (0-5 points)
              { $cond: ['$featured', 5, 0] }
            ]
          }
        }
      },
      { $sort: { score: -1, createdAt: -1 } },
      { $limit: limit }
    ];

    return await Job.aggregate(pipeline);
  } catch (error) {
    console.error('Smart recommendations error:', error);
    return [];
  }
};

// Get similar jobs based on a specific job
export const getSimilarJobs = async (jobId, limit = 5) => {
  try {
    const job = await Job.findById(jobId);
    if (!job) return [];

    const query = {
      isActive: true,
      status: 'approved',
      _id: { $ne: jobId }
    };

    const pipeline = [
      { $match: query },
      {
        $addFields: {
          similarity: {
            $add: [
              // Same company bonus
              { $cond: [{ $eq: ['$company', job.company] }, 30, 0] },
              // Skills similarity
              {
                $multiply: [
                  { $size: { $setIntersection: ['$skills', job.skills] } },
                  10
                ]
              },
              // Same location bonus
              { $cond: [{ $eq: ['$location', job.location] }, 15, 0] },
              // Same job type bonus
              { $cond: [{ $eq: ['$jobType', job.jobType] }, 10, 0] },
              // Same industry bonus
              { $cond: [{ $eq: ['$industry', job.industry] }, 10, 0] }
            ]
          }
        }
      },
      { $sort: { similarity: -1, createdAt: -1 } },
      { $limit: limit }
    ];

    return await Job.aggregate(pipeline);
  } catch (error) {
    console.error('Similar jobs error:', error);
    return [];
  }
};

// Get trending jobs
export const getTrendingJobs = async (limit = 10) => {
  try {
    return await Job.find({
      isActive: true,
      status: 'approved',
      $or: [
        { trending: true },
        { views: { $gte: 100 } },
        { applications: { $gte: 10 } }
      ]
    })
    .sort({ views: -1, applications: -1, createdAt: -1 })
    .limit(limit);
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