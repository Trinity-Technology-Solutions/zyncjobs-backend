import Job from '../models/Job.js';
import { Op } from 'sequelize';

// Advanced search with all filters
export const advancedJobSearch = async (searchParams = {}) => {
  const {
    query = '',
    location = '',
    jobType = [],
    locationType = [],
    industry = [],
    companySize = [],
    salaryMin = 0,
    salaryMax = 999999,
    experienceLevel = [],
    freshness = '',
    skills = [],
    page = 1,
    limit = 20,
    sortBy = 'relevance'
  } = searchParams;

  try {
    const where = {
      isActive: true,
      status: 'approved'
    };

    // Text search
    if (query && query.trim()) {
      where[Op.or] = [
        { jobTitle: { [Op.iLike]: `%${query}%` } },
        { company: { [Op.iLike]: `%${query}%` } },
        { description: { [Op.iLike]: `%${query}%` } }
      ];
    }

    // Location search
    if (location && location.trim()) {
      where.location = { [Op.iLike]: `%${location}%` };
    }

    // Job type filter
    if (Array.isArray(jobType) && jobType.length > 0) {
      where.jobType = { [Op.in]: jobType };
    }

    // Location type filter
    if (Array.isArray(locationType) && locationType.length > 0) {
      where.locationType = { [Op.in]: locationType };
    }

    // Industry filter
    if (Array.isArray(industry) && industry.length > 0) {
      where.industry = { [Op.in]: industry };
    }

    // Company size filter
    if (Array.isArray(companySize) && companySize.length > 0) {
      where.companySize = { [Op.in]: companySize };
    }

    // Salary range filter
    if (salaryMin > 0 || salaryMax < 999999) {
      where[Op.or] = [
        { salaryMin: { [Op.between]: [salaryMin, salaryMax] } },
        { salaryMax: { [Op.between]: [salaryMin, salaryMax] } }
      ];
    }

    // Experience level filter
    if (Array.isArray(experienceLevel) && experienceLevel.length > 0) {
      where.experienceLevel = { [Op.in]: experienceLevel };
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
        where.createdAt = { [Op.gte]: dateThreshold };
      }
    }

    // Build sort criteria
    let order = [];
    switch (sortBy) {
      case 'date':
        order = [['createdAt', 'DESC']];
        break;
      case 'salary':
        order = [['salaryMax', 'DESC'], ['createdAt', 'DESC']];
        break;
      case 'relevance':
      default:
        order = [['createdAt', 'DESC']];
        break;
    }

    // Execute query
    const { count, rows: jobs } = await Job.findAndCountAll({
      where,
      order,
      limit: parseInt(limit) || 20,
      offset: ((parseInt(page) || 1) - 1) * (parseInt(limit) || 20)
    });

    return {
      jobs,
      total: count,
      page: parseInt(page) || 1,
      totalPages: Math.ceil(count / (parseInt(limit) || 20)),
      hasMore: (parseInt(page) || 1) * (parseInt(limit) || 20) < count
    };

  } catch (error) {
    console.error('Advanced search error:', error);
    throw error;
  }
};

// Get search suggestions/autocomplete
export const getSearchSuggestions = async (query, type = 'all') => {
  try {
    const suggestions = [];

    if (type === 'all' || type === 'titles') {
      const titles = await Job.findAll({
        attributes: [[Job.sequelize.fn('DISTINCT', Job.sequelize.col('jobTitle')), 'jobTitle']],
        where: {
          jobTitle: { [Op.iLike]: `%${query}%` },
          isActive: true,
          status: 'approved'
        },
        limit: 5,
        raw: true
      });
      suggestions.push(...titles.map(t => ({ type: 'title', value: t.jobTitle })));
    }

    if (type === 'all' || type === 'companies') {
      const companies = await Job.findAll({
        attributes: [[Job.sequelize.fn('DISTINCT', Job.sequelize.col('company')), 'company']],
        where: {
          company: { [Op.iLike]: `%${query}%` },
          isActive: true,
          status: 'approved'
        },
        limit: 5,
        raw: true
      });
      suggestions.push(...companies.map(c => ({ type: 'company', value: c.company })));
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