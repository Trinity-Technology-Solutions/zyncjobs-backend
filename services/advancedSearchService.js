import Job from '../models/Job.js';

// Advanced search with all filters
export const advancedJobSearch = async (searchParams) => {
  const {
    query = '',
    location = '',
    radius = 50, // km
    coordinates = null, // [longitude, latitude]
    jobType = [],
    locationType = [],
    industry = [],
    companySize = [],
    salaryMin = 0,
    salaryMax = 999999,
    experienceLevel = [],
    freshness = '', // '24h', '7d', '30d'
    skills = [],
    benefits = [],
    page = 1,
    limit = 20,
    sortBy = 'relevance' // 'relevance', 'date', 'salary'
  } = searchParams;

  try {
    // Build base query
    const baseQuery = {
      isActive: true,
      status: 'approved'
    };

    // Text search
    if (query) {
      baseQuery.$or = [
        { jobTitle: { $regex: query, $options: 'i' } },
        { company: { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } },
        { skills: { $in: [new RegExp(query, 'i')] } }
      ];
    }

    // Location-based search
    if (location && !coordinates) {
      baseQuery.location = { $regex: location, $options: 'i' };
    }

    // Radius search (if coordinates provided)
    if (coordinates && coordinates.length === 2) {
      baseQuery.coordinates = {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: coordinates
          },
          $maxDistance: radius * 1000 // Convert km to meters
        }
      };
    }

    // Job type filter
    if (jobType.length > 0) {
      baseQuery.jobType = { $in: jobType };
    }

    // Location type filter
    if (locationType.length > 0) {
      baseQuery.locationType = { $in: locationType };
    }

    // Industry filter
    if (industry.length > 0) {
      baseQuery.industry = { $in: industry };
    }

    // Company size filter
    if (companySize.length > 0) {
      baseQuery.companySize = { $in: companySize };
    }

    // Salary range filter
    if (salaryMin > 0 || salaryMax < 999999) {
      baseQuery.$and = baseQuery.$and || [];
      baseQuery.$and.push({
        $or: [
          { 'salary.min': { $gte: salaryMin, $lte: salaryMax } },
          { 'salary.max': { $gte: salaryMin, $lte: salaryMax } },
          { 'salary.min': { $lte: salaryMin }, 'salary.max': { $gte: salaryMax } }
        ]
      });
    }

    // Experience level filter
    if (experienceLevel.length > 0) {
      baseQuery.experienceLevel = { $in: experienceLevel };
    }

    // Skills filter
    if (skills.length > 0) {
      baseQuery.skills = { $in: skills.map(skill => new RegExp(skill, 'i')) };
    }

    // Benefits filter
    if (benefits.length > 0) {
      baseQuery.benefits = { $in: benefits };
    }

    // Freshness filter
    if (freshness) {
      const now = new Date();
      let dateThreshold;
      
      switch (freshness) {
        case '24h':
          dateThreshold = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          dateThreshold = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          dateThreshold = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
      }
      
      if (dateThreshold) {
        baseQuery.createdAt = { $gte: dateThreshold };
      }
    }

    // Build sort criteria
    let sortCriteria = {};
    switch (sortBy) {
      case 'date':
        sortCriteria = { createdAt: -1 };
        break;
      case 'salary':
        sortCriteria = { 'salary.max': -1, createdAt: -1 };
        break;
      case 'relevance':
      default:
        // For relevance, we'll use aggregation pipeline
        if (query || skills.length > 0) {
          return await searchWithRelevanceScore(baseQuery, query, skills, page, limit);
        }
        sortCriteria = { featured: -1, trending: -1, createdAt: -1 };
        break;
    }

    // Execute query
    const jobs = await Job.find(baseQuery)
      .sort(sortCriteria)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const total = await Job.countDocuments(baseQuery);

    return {
      jobs,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total
    };

  } catch (error) {
    console.error('Advanced search error:', error);
    throw error;
  }
};

// Search with relevance scoring
const searchWithRelevanceScore = async (baseQuery, query, skills, page, limit) => {
  const pipeline = [
    { $match: baseQuery },
    {
      $addFields: {
        relevanceScore: {
          $add: [
            // Title match score (highest priority)
            {
              $cond: [
                { $regexMatch: { input: '$jobTitle', regex: query, options: 'i' } },
                50,
                0
              ]
            },
            // Company match score
            {
              $cond: [
                { $regexMatch: { input: '$company', regex: query, options: 'i' } },
                30,
                0
              ]
            },
            // Skills match score
            {
              $multiply: [
                { $size: { $setIntersection: ['$skills', skills] } },
                10
              ]
            },
            // Description match score (lower priority)
            {
              $cond: [
                { $regexMatch: { input: '$description', regex: query, options: 'i' } },
                10,
                0
              ]
            },
            // Featured/trending bonus
            { $cond: ['$featured', 5, 0] },
            { $cond: ['$trending', 3, 0] }
          ]
        }
      }
    },
    { $sort: { relevanceScore: -1, createdAt: -1 } },
    { $skip: (page - 1) * limit },
    { $limit: limit }
  ];

  const jobs = await Job.aggregate(pipeline);
  const total = await Job.countDocuments(baseQuery);

  return {
    jobs,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    hasMore: page * limit < total
  };
};

// Get search suggestions/autocomplete
export const getSearchSuggestions = async (query, type = 'all') => {
  try {
    const suggestions = [];

    if (type === 'all' || type === 'titles') {
      const titleSuggestions = await Job.distinct('jobTitle', {
        jobTitle: { $regex: query, $options: 'i' },
        isActive: true,
        status: 'approved'
      });
      suggestions.push(...titleSuggestions.slice(0, 5).map(title => ({ type: 'title', value: title })));
    }

    if (type === 'all' || type === 'companies') {
      const companySuggestions = await Job.distinct('company', {
        company: { $regex: query, $options: 'i' },
        isActive: true,
        status: 'approved'
      });
      suggestions.push(...companySuggestions.slice(0, 5).map(company => ({ type: 'company', value: company })));
    }

    if (type === 'all' || type === 'skills') {
      const skillSuggestions = await Job.distinct('skills', {
        skills: { $regex: query, $options: 'i' },
        isActive: true,
        status: 'approved'
      });
      suggestions.push(...skillSuggestions.slice(0, 5).map(skill => ({ type: 'skill', value: skill })));
    }

    return suggestions.slice(0, 10);
  } catch (error) {
    console.error('Search suggestions error:', error);
    return [];
  }
};

export default {
  advancedJobSearch,
  getSearchSuggestions
};