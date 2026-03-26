import { Op } from 'sequelize';
import Job from '../models/Job.js';

export const advancedJobSearch = async (params = {}) => {
  const { query, location, jobType, workSetting, experienceLevel, salaryMin, salaryMax, skills, page = 1, limit = 20 } = params;

  const where = { isActive: true, status: 'approved' };

  if (query) {
    where[Op.or] = [
      { jobTitle: { [Op.iLike]: `%${query}%` } },
      { company: { [Op.iLike]: `%${query}%` } },
      { description: { [Op.iLike]: `%${query}%` } }
    ];
  }
  if (location) where.location = { [Op.iLike]: `%${location}%` };
  if (workSetting) where.workSetting = workSetting;
  if (experienceLevel) where.experienceLevel = experienceLevel;
  if (salaryMin) where.salaryMax = { [Op.gte]: salaryMin };
  if (salaryMax) where.salaryMin = { [Op.lte]: salaryMax };
  
  // Fix jobType handling - it's now an ENUM, not an array
  if (jobType) {
    if (Array.isArray(jobType)) {
      where.jobType = { [Op.in]: jobType };
    } else {
      where.jobType = jobType;
    }
  }
  
  // Skills is still an array
  if (skills?.length) {
    where.skills = { [Op.overlap]: Array.isArray(skills) ? skills : [skills] };
  }

  const offset = (page - 1) * limit;
  
  try {
    const { count, rows } = await Job.findAndCountAll({ 
      where, 
      limit, 
      offset, 
      order: [['createdAt', 'DESC']] 
    });

    return { jobs: rows, total: count, page, totalPages: Math.ceil(count / limit) };
  } catch (error) {
    console.error('Advanced search error:', error);
    throw error;
  }
};

export const getSearchSuggestions = async (q, type = 'all') => {
  const where = { isActive: true };
  const suggestions = [];

  if (type === 'all' || type === 'title') {
    const jobs = await Job.findAll({ where: { ...where, jobTitle: { [Op.iLike]: `%${q}%` } }, attributes: ['jobTitle'], limit: 5 });
    suggestions.push(...jobs.map(j => ({ type: 'title', value: j.jobTitle })));
  }

  if (type === 'all' || type === 'company') {
    const jobs = await Job.findAll({ where: { ...where, company: { [Op.iLike]: `%${q}%` } }, attributes: ['company'], limit: 5 });
    suggestions.push(...jobs.map(j => ({ type: 'company', value: j.company })));
  }

  if (type === 'all' || type === 'location') {
    const jobs = await Job.findAll({ where: { ...where, location: { [Op.iLike]: `%${q}%` } }, attributes: ['location'], limit: 5 });
    suggestions.push(...jobs.map(j => ({ type: 'location', value: j.location })));
  }

  return suggestions;
};
