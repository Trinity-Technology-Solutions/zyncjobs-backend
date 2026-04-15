import { Op } from 'sequelize';
import Job from '../models/Job.js';
import { haversineDistance } from '../utils/geocode.js';

export const advancedJobSearch = async (params = {}) => {
  const { query, location, jobType, workSetting, experienceLevel, salaryMin, salaryMax, skills,
    coordinates, radius, freshness, page = 1, limit = 20 } = params;

  const where = { isActive: true, status: 'approved' };

  // Freshness filter
  if (freshness) {
    const now = new Date();
    const cutoff = freshness === '24h'
      ? new Date(now - 24 * 60 * 60 * 1000)
      : new Date(now - 7 * 24 * 60 * 60 * 1000);
    where.createdAt = { [Op.gte]: cutoff };
  }

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
  
  if (jobType) {
    if (Array.isArray(jobType)) {
      where.jobType = { [Op.in]: jobType };
    } else {
      where.jobType = jobType;
    }
  }
  
  if (skills?.length) {
    where.skills = { [Op.overlap]: Array.isArray(skills) ? skills : [skills] };
  }

  // Radius search — fetch geocoded jobs and filter by Haversine distance
  if (coordinates && radius) {
    const [searchLon, searchLat] = coordinates;
    where.latitude = { [Op.ne]: null };
    where.longitude = { [Op.ne]: null };

    const allJobs = await Job.findAll({ where, order: [['createdAt', 'DESC']] });
    const nearby = allJobs.filter(job =>
      haversineDistance(searchLat, searchLon, job.latitude, job.longitude) <= radius
    );

    const total = nearby.length;
    const offset = (page - 1) * limit;
    const rows = nearby.slice(offset, offset + limit);
    return { jobs: rows, total, page, totalPages: Math.ceil(total / limit) };
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
