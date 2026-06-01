import express from 'express';
import { body, validationResult } from 'express-validator';
import Job from '../models/Job.js';
import User from '../models/User.js';
import Company from '../models/Company.js';
import { Op } from 'sequelize';
import { requireRole, requirePermission, PERMISSIONS, requireTeamRole } from '../middleware/roleAuth.js';
import { authenticateToken } from '../middleware/auth.js';
import { mistralDetector } from '../utils/mistralJobDetector.js';
import { generateEmployerId, generatePositionId, generatePositionIdWithYear } from '../utils/idGenerator.js';
import { maxJobsGuard, getJobStatus } from '../middleware/settingsMiddleware.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vectorService from '../services/vectorService.js';
import { withCache, cacheDelPattern } from '../services/redisService.js';
import { geocodeLocation } from '../utils/geocode.js';
import { formatDescriptionWithBullets } from '../server.js';
import JobRefreshService from '../services/jobRefreshService.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load companies data for logo lookup
let companiesData = [];
try {
  const companiesPath = path.join(__dirname, '../data/companies.json');
  const rawData = fs.readFileSync(companiesPath, 'utf8');
  companiesData = JSON.parse(rawData);
} catch (error) {
  console.error('Error loading companies data:', error);
}

// GET /api/jobs/slug/:slug - Get job by SEO slug
router.get('/slug/:slug', async (req, res) => {
  try {
    const job = await Job.findOne({ where: { slug: req.params.slug, isActive: true } });
    if (!job) return res.status(404).json({ error: 'Job not found' });
    const jobJson = job.toJSON();
    res.json({ ...jobJson, companyLogo: getCompanyLogo(job.company, job.companyLogo), jobHeaderImage: getJobHeaderImage(job.jobTitle, job.skills || []), salary: { min: jobJson.salaryMin, max: jobJson.salaryMax, currency: jobJson.currency || 'INR' } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/jobs/titles - Get all job titles
router.get('/titles', (req, res) => {
  try {
    const titlesPath = path.join(__dirname, '../data/job_titles.json');
    const rawData = fs.readFileSync(titlesPath, 'utf8');
    const data = JSON.parse(rawData);
    res.json({ job_titles: data.job_titles || [] });
  } catch (error) {
    console.error('Error loading job titles:', error);
    res.json({ job_titles: [] });
  }
});

// GET /api/jobs/categories - Get job categories with counts
router.get('/categories', async (req, res) => {
  const categoryKeywords = [
    { name: 'Software Development', terms: ['software developer', 'software engineer', 'software architect', 'frontend developer', 'backend developer', 'full stack developer', 'full stack engineer', 'web developer', 'web engineer', 'react developer', 'node developer', 'java developer', 'python developer', 'php developer', 'ruby developer', 'golang developer', 'typescript developer', 'javascript developer', 'application developer', 'application engineer'] },
    { name: 'Data Science & AI', terms: ['data scientist', 'machine learning', 'ai engineer', 'data analyst', 'data engineer', 'artificial intelligence', 'deep learning', 'nlp engineer', 'data science', 'ml engineer', 'business intelligence', 'analytics engineer', 'ai researcher'] },
    { name: 'Mobile Development', terms: ['mobile developer', 'ios developer', 'android developer', 'react native', 'flutter developer', 'mobile app', 'swift developer', 'kotlin developer', 'mobile engineer'] },
    { name: 'Cybersecurity', terms: ['cybersecurity', 'security analyst', 'security engineer', 'penetration tester', 'information security', 'cyber security', 'soc analyst', 'ethical hacker', 'security architect', 'network security'] },
    { name: 'Cloud Engineering', terms: ['cloud engineer', 'cloud architect', 'aws engineer', 'azure engineer', 'gcp engineer', 'cloud developer', 'solutions architect', 'site reliability engineer', 'sre engineer', 'platform engineer', 'cloud administrator'] },
    { name: 'DevOps & Infrastructure', terms: ['devops', 'infrastructure engineer', 'kubernetes engineer', 'docker engineer', 'ci/cd engineer', 'system administrator', 'sysadmin', 'network engineer', 'linux administrator', 'build engineer', 'release engineer', 'devops engineer'] },
    { name: 'Product Management', terms: ['product manager', 'product owner', 'business analyst', 'project manager', 'scrum master', 'program manager', 'product lead', 'agile coach', 'delivery manager'] },
    { name: 'UI/UX Design', terms: ['ui designer', 'ux designer', 'graphic designer', 'web designer', 'product designer', 'visual designer', 'interaction designer', 'ui/ux designer', 'ux researcher', 'design lead', 'creative designer'] }
  ];

  try {
    const results = await Promise.all(categoryKeywords.map(async (cat) => {
      const count = await Job.count({
        where: {
          isActive: true,
          status: 'approved',
          [Op.or]: cat.terms.map(term => ({ jobTitle: { [Op.iLike]: `%${term}%` } }))
        }
      });
      return { category: cat.name, count };
    }));
    res.json(results);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/jobs/countries - Get all countries
router.get('/countries', (req, res) => {
  try {
    const countriesPath = path.join(__dirname, '../data/countries.json');
    const data = JSON.parse(fs.readFileSync(countriesPath, 'utf8'));
    res.json({ countries: data.countries || [] });
  } catch (error) {
    res.json({ countries: [] });
  }
});

// Generate SEO-friendly slug
function generateSlug(jobTitle, company, id) {
  const base = `${jobTitle}-at-${company}`
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 80);
  const suffix = id ? String(id).slice(-6) : Math.random().toString(36).slice(-6);
  return `${base}-${suffix}`;
}

// Helper function to generate job code
function generateJobCode(jobTitle, company) {
  const titleCode = jobTitle.replace(/[^a-zA-Z0-9]/g, '').substring(0, 4).toUpperCase();
  const companyCode = company.replace(/[^a-zA-Z0-9]/g, '').substring(0, 3).toUpperCase();
  const timestamp = Date.now().toString().slice(-6);
  const randomNum = Math.floor(Math.random() * 100).toString().padStart(2, '0');
  
  return `${titleCode}${companyCode}${timestamp}${randomNum}`;
}

// Helper function to get job header image based on job title/category
function getJobHeaderImage(jobTitle, skills = []) {
  const title = jobTitle.toLowerCase();
  const skillsStr = skills.join(' ').toLowerCase();
  
  // Tech/Software Development
  if (title.includes('developer') || title.includes('engineer') || title.includes('programmer') || 
      title.includes('software') || skillsStr.includes('javascript') || skillsStr.includes('python') || 
      skillsStr.includes('java') || skillsStr.includes('react')) {
    return 'https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=800&h=400&fit=crop';
  }
  
  // Data Science/Analytics
  if (title.includes('data') || title.includes('analyst') || title.includes('scientist') || 
      skillsStr.includes('sql') || skillsStr.includes('python') || skillsStr.includes('tableau')) {
    return 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&h=400&fit=crop';
  }
  
  // DevOps/Cloud
  if (title.includes('devops') || title.includes('cloud') || title.includes('aws') || 
      skillsStr.includes('docker') || skillsStr.includes('kubernetes')) {
    return 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&h=400&fit=crop';
  }
  
  // UI/UX Design
  if (title.includes('designer') || title.includes('ui') || title.includes('ux') || 
      skillsStr.includes('figma') || skillsStr.includes('photoshop')) {
    return 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=800&h=400&fit=crop';
  }
  
  // Marketing/Digital
  if (title.includes('marketing') || title.includes('digital') || title.includes('seo') || 
      title.includes('content')) {
    return 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&h=400&fit=crop';
  }
  
  // Finance/Accounting
  if (title.includes('finance') || title.includes('accounting') || title.includes('analyst')) {
    return 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=800&h=400&fit=crop';
  }
  
  // Project Management
  if (title.includes('project') || title.includes('manager') || title.includes('scrum') || 
      title.includes('agile')) {
    return 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=800&h=400&fit=crop';
  }
  
  // Default tech/business image
  return 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&h=400&fit=crop';
}

// Helper function to get company logo
function getCompanyLogo(companyName, dbLogo = null) {
  // Always prefer the actual uploaded logo stored in DB
  if (dbLogo) return dbLogo;
  if (!companyName) return null;
  const company = companiesData.find(c =>
    c.name.toLowerCase().trim() === companyName.toLowerCase().trim() ||
    c.name.toLowerCase().includes(companyName.toLowerCase()) ||
    companyName.toLowerCase().includes(c.name.toLowerCase())
  );
  return company ? company.logo : null;
}

// Helper function to auto-assign category from job title
function getCategoryFromTitle(jobTitle) {
  const title = jobTitle.toLowerCase();
  
  if (title.includes('software') || title.includes('developer') || title.includes('engineer') || 
      title.includes('programmer') || title.includes('frontend') || title.includes('backend') || 
      title.includes('fullstack') || title.includes('full stack')) {
    return 'Software Development';
  }
  
  if (title.includes('data') || title.includes('analyst') || title.includes('scientist') || 
      title.includes('analytics') || title.includes('bi ')) {
    return 'Data Science & Analytics';
  }
  
  if (title.includes('devops') || title.includes('cloud') || title.includes('infrastructure') || 
      title.includes('sre') || title.includes('system')) {
    return 'DevOps & Cloud';
  }
  
  if (title.includes('designer') || title.includes('ui') || title.includes('ux') || 
      title.includes('graphic') || title.includes('product design')) {
    return 'Design';
  }
  
  if (title.includes('marketing') || title.includes('digital') || title.includes('seo') || 
      title.includes('content') || title.includes('social media')) {
    return 'Marketing';
  }
  
  if (title.includes('sales') || title.includes('business development') || title.includes('account')) {
    return 'Sales';
  }
  
  if (title.includes('hr') || title.includes('human resource') || title.includes('recruiter') || 
      title.includes('talent')) {
    return 'Human Resources';
  }
  
  if (title.includes('finance') || title.includes('accounting') || title.includes('accountant')) {
    return 'Finance & Accounting';
  }
  
  if (title.includes('project') || title.includes('manager') || title.includes('scrum') || 
      title.includes('product manager') || title.includes('program')) {
    return 'Project Management';
  }
  
  if (title.includes('qa') || title.includes('quality') || title.includes('test') || 
      title.includes('automation')) {
    return 'Quality Assurance';
  }
  
  if (title.includes('security') || title.includes('cyber')) {
    return 'Cybersecurity';
  }
  
  if (title.includes('support') || title.includes('customer success') || title.includes('help desk')) {
    return 'Customer Support';
  }
  
  return 'Other';
}

// Helper: normalize any array field (handles string, JSON string, PG array literal, real array)
function normalizeArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    // PostgreSQL array literal: {"English","Tamil"} or {English,Tamil}
    if (val.startsWith('{') && val.endsWith('}')) {
      return val.slice(1, -1).split(',').map(s => s.replace(/^"|"$/g, '').trim()).filter(Boolean);
    }
    try { return JSON.parse(val); } catch { return val.split(',').map(s => s.trim()).filter(Boolean); }
  }
  return [];
}

// GET /api/jobs - Get all jobs
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, location, jobType, search, sort } = req.query;
    
    const where = { isActive: true, status: 'approved' };
    if (location) where.location = { [Op.iLike]: `%${location}%` };
    if (jobType) where.jobType = Array.isArray(jobType) ? { [Op.in]: jobType } : jobType;
    if (search) {
      where[Op.or] = [
        { jobTitle: { [Op.iLike]: `%${search}%` } },
        { company: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } }
      ];
    }
    
    const jobs = await Job.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit)
    });
    
    const result = jobs.map(job => {
      const jobJson = job.toJSON();
      return { 
        ...jobJson, 
        companyLogo: getCompanyLogo(job.company, job.companyLogo), 
        salary: { 
          min: jobJson.salaryMin, 
          max: jobJson.salaryMax, 
          currency: jobJson.currency || 'INR' 
        } 
      };
    });

    res.json(result);
  } catch (error) {
    console.error('Error fetching jobs:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/jobs/employer/:employerId - Get jobs by employer ID
router.get('/employer/:employerId', async (req, res) => {
  try {
    const jobs = await Job.findAll({ 
      where: {
        employerId: req.params.employerId,
        isActive: true,
        status: { [Op.in]: ['approved', 'pending'] }
      },
      order: [['createdAt', 'DESC']]
    });
    const jobsWithLogos = jobs.map(job => {
      const jobJson = job.toJSON();
      return { ...jobJson, companyLogo: getCompanyLogo(job.company, job.companyLogo), salary: { min: jobJson.salaryMin, max: jobJson.salaryMax, currency: jobJson.currency || 'INR' } };
    });
    res.json(jobsWithLogos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/jobs/employer/email/:email - Get jobs by employer email (company-wide)
router.get('/employer/email/:email', async (req, res) => {
  try {
    // Use the email parameter as the company identifier
    const employerEmail = req.params.email;
    
    const jobs = await Job.findAll({ 
      where: {
        employerEmail: employerEmail,
        isActive: true,
        status: { [Op.in]: ['approved', 'pending'] }
      },
      order: [['createdAt', 'DESC']]
    });
    
    const jobsWithLogos = jobs.map(job => {
      const jobJson = job.toJSON();
      return { ...jobJson, companyLogo: getCompanyLogo(job.company, job.companyLogo), salary: { min: jobJson.salaryMin, max: jobJson.salaryMax, currency: jobJson.currency || 'INR' } };
    });
    
    res.json(jobsWithLogos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/jobs/position/:positionId - Get job by position ID
router.get('/position/:positionId', async (req, res) => {
  try {
    const job = await Job.findOne({ where: { positionId: req.params.positionId, isActive: true } });
    if (!job) return res.status(404).json({ error: 'Job not found' });
    const jobJson = job.toJSON();
    res.json({ ...jobJson, companyLogo: getCompanyLogo(job.company, job.companyLogo), jobHeaderImage: getJobHeaderImage(job.jobTitle, job.skills || []), salary: { min: jobJson.salaryMin, max: jobJson.salaryMax, currency: jobJson.currency || 'INR' } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/jobs/search/query - Quick search endpoint
router.get('/search/query', async (req, res) => {
  try {
    const { q, limit = 10, page = 1 } = req.query;
    
    if (!q || q.trim().length === 0) {
      return res.json([]);
    }

    const where = {
      isActive: true,
      status: 'approved',
      [Op.or]: [
        { jobTitle: { [Op.iLike]: `%${q}%` } },
        { company: { [Op.iLike]: `%${q}%` } },
        { description: { [Op.iLike]: `%${q}%` } },
        { skills: { [Op.contains]: [q] } }
      ]
    };

    const jobs = await Job.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit)
    });

    const jobsWithLogos = jobs.map(job => {
      const jobJson = job.toJSON();
      return {
        ...jobJson,
        companyLogo: getCompanyLogo(job.company, job.companyLogo),
        salary: {
          min: jobJson.salaryMin,
          max: jobJson.salaryMax,
          currency: jobJson.currency || 'INR'
        }
      };
    });

    res.json(jobsWithLogos);
  } catch (error) {
    console.error('Search query error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/jobs/search - General search endpoint
router.get('/search', async (req, res) => {
  try {
    const { q, location, jobType, limit = 10, page = 1 } = req.query;
    const where = { isActive: true, status: 'approved' };

    if (q) {
      where[Op.or] = [
        { jobTitle: { [Op.iLike]: `%${q}%` } },
        { company: { [Op.iLike]: `%${q}%` } },
        { description: { [Op.iLike]: `%${q}%` } }
      ];
    }

    if (location) where.location = { [Op.iLike]: `%${location}%` };
    if (jobType) where.jobType = Array.isArray(jobType) ? { [Op.in]: jobType } : jobType;

    const jobs = await Job.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit)
    });

    const jobsWithLogos = jobs.map(job => {
      const jobJson = job.toJSON();
      return {
        ...jobJson,
        companyLogo: getCompanyLogo(job.company, job.companyLogo),
        salary: {
          min: jobJson.salaryMin,
          max: jobJson.salaryMax,
          currency: jobJson.currency || 'INR'
        }
      };
    });

    res.json(jobsWithLogos);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/jobs - Create new job
router.post('/', maxJobsGuard, [
  body('jobTitle').notEmpty().withMessage('Job title is required'),
  body('company').notEmpty().withMessage('Company is required'),
  body('location').notEmpty().withMessage('Location is required'),
  body('jobType').custom(val => {
<<<<<<< HEAD
    const valid = ['Full-time', 'Part-time', 'Contract', 'Freelance', 'Internship', 'Temporary'];
    // Handle both array and string inputs
=======
    const valid = ['Full-time', 'Part-time', 'Contract', 'Freelance', 'Internship'];
>>>>>>> c63d49b974d7fd548e2909987646e8ac0cdd9a84
    const types = Array.isArray(val) ? val : [val];
    if (!types.length) throw new Error('Job type is required');
    if (!types.every(t => valid.includes(t))) throw new Error('Invalid job type');
    return true;
  }),
  body('description').notEmpty().withMessage('Description is required').isLength({ max: 5000 }).withMessage('Description cannot exceed 5000 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Get employer email from body (sent by frontend) or from auth token if available
    const employerEmail = req.body.employerEmail || req.body.postedBy || (req.user?.email) || '';
    if (!employerEmail) {
      return res.status(400).json({ error: 'Employer email is required' });
    }

    let user = await User.findOne({ where: { email: employerEmail } });
    let employerId = user?.employerId;

    if (!employerId) {
      employerId = await generateEmployerId();
      if (user) await user.update({ employerId });
    }

    const resolvedEmployerEmail = ownerEmail;

    const jobData = { ...req.body };

    console.log('Raw jobData before processing:', JSON.stringify(jobData, null, 2));
    console.log('🔍 locationType:', jobData.locationType, '| languages:', jobData.languages, '| country:', jobData.country);
    
    // Normalize jobType - handle array, string array literal {"Full-time"}, or plain string
    if (Array.isArray(jobData.jobType)) {
      jobData.jobType = jobData.jobType[0] || 'Full-time';
    } else if (typeof jobData.jobType === 'string') {
      // Strip PostgreSQL array literal format e.g. {"Full-time"} or {Full-time}
      const match = jobData.jobType.match(/^\{"?([^"\}]+)"?\}$/);
      if (match) jobData.jobType = match[1];
    }
    if (!jobData.jobType || typeof jobData.jobType !== 'string') jobData.jobType = 'Full-time';

    // Normalize experienceLevel - default to 'Mid' if empty or invalid
    const validExpLevels = ['Entry', 'Mid', 'Senior', 'Lead'];
    if (!jobData.experienceLevel || !validExpLevels.includes(jobData.experienceLevel)) {
      jobData.experienceLevel = 'Mid';
    }
    
    // Flatten salary object if it exists
    if (jobData.salary) {
      jobData.salaryMin = jobData.salary.min;
      jobData.salaryMax = jobData.salary.max;
      jobData.currency = jobData.salary.currency || 'INR';
      delete jobData.salary;
    }

    console.log('Available functions:', { generateEmployerId, generatePositionId, generatePositionIdWithYear });
    
    // Generate position ID with year - inline fallback if import fails
    const generatePositionIdWithYearFallback = async () => {
      const year = new Date().getFullYear();
      const sequence = await generatePositionId();
      return `${year}-${sequence}`;
    };
    
    const positionId = typeof generatePositionIdWithYear === 'function' 
      ? await generatePositionIdWithYear() 
      : await generatePositionIdWithYearFallback();
    
    // Ensure skills and languages are properly formatted as arrays
    jobData.skills = normalizeArray(jobData.skills);
    jobData.languages = normalizeArray(jobData.languages);
    
    console.log('Skills before create:', jobData.skills, 'Type:', typeof jobData.skills, 'IsArray:', Array.isArray(jobData.skills));
    console.log('JobType before create:', jobData.jobType, 'Type:', typeof jobData.jobType);
    console.log('Full jobData object being sent to Job.create:', JSON.stringify(jobData, null, 2));
    
    // Auto-assign category if not provided
    const autoCategory = jobData.jobCategory || getCategoryFromTitle(jobData.jobTitle);
    
    // Explicitly construct the job creation object to avoid any spread issues
    // Auto-link to Company table
    let companyId = null;
    try {
      const companyName = jobData.company?.trim();
      if (companyName) {
        let company = await Company.findOne({ where: { name: { [Op.iLike]: companyName } } });
        if (!company) {
          company = await Company.create({
            name: companyName,
            logo: getCompanyLogo(companyName) || '',
            createdBy: resolvedEmployerEmail,
            followers: []
          });
        }
        companyId = company.id;
      }
    } catch (e) {
      console.warn('Company auto-link failed:', e.message);
    }

    const jobCreateData = {
      jobTitle: jobData.jobTitle,
      company: jobData.company,
      companyLogo: user?.companyLogo || null,
      location: jobData.location,
      jobType: jobData.jobType, // This should be a string now
      workSetting: jobData.workSetting,
      description: formatDescriptionWithBullets(jobData.description),
      requirements: jobData.requirements,
      responsibilities: jobData.responsibilities,
      skills: jobData.skills, // This should be an array
      salaryMin: jobData.salaryMin,
      salaryMax: jobData.salaryMax,
      currency: jobData.currency,
      experienceLevel: jobData.experienceLevel,
      jobCategory: autoCategory,
      experienceRange: jobData.experienceRange || null,
      languages: normalizeArray(jobData.languages),
      country: jobData.country || null,
      employerId,
      positionId: positionId,
      status: getJobStatus(),
      employerEmail: resolvedEmployerEmail,
      postedBy: resolvedEmployerEmail,
      companyId,
      refreshCount: 0,
      originalPostedAt: new Date()
    };
    
    console.log('Final jobCreateData:', JSON.stringify(jobCreateData, null, 2));
    
    const job = await Job.create(jobCreateData);
    // Generate and save slug after creation (needs the UUID)
    const slug = generateSlug(job.jobTitle, job.company, job.id);
    
    // Geocode location for radius search (non-blocking)
    geocodeLocation(jobCreateData.location).then(coords => {
      if (coords) job.update({ latitude: coords.latitude, longitude: coords.longitude }).catch(() => {});
    }).catch(() => {});

    await job.update({ slug });

    // Index for semantic search (non-blocking)
    vectorService.upsertJobEmbedding(job.id, job.toJSON()).catch(() => {});

    console.log('Job created - Employer ID:', employerId, 'Position ID:', job.positionId, 'Job ID:', job.id);
    res.status(201).json(job);
  } catch (error) {
    console.error('Error creating job:', error);
    res.status(400).json({ error: error.message });
  }
});

// GET /api/jobs/:id - Get single job (supports both UUID and positionId)
router.get('/:id', async (req, res) => {
  try {
    let job = await Job.findByPk(req.params.id);
    if (!job) {
      job = await Job.findOne({ where: { positionId: req.params.id, isActive: true } });
    }
    if (!job) return res.status(404).json({ error: 'Job not found' });
    const jobJson = job.toJSON();
    res.json({ ...jobJson, companyLogo: getCompanyLogo(job.company, job.companyLogo), jobHeaderImage: getJobHeaderImage(job.jobTitle, job.skills || []), salary: { min: jobJson.salaryMin, max: jobJson.salaryMax, currency: jobJson.currency || 'INR' } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/jobs/:id - Delete job
router.delete('/:id', async (req, res) => {
  try {
    const job = await Job.findByPk(req.params.id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    await job.update({ isActive: false });
    res.json({ message: 'Job deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/jobs/:id/permanent - Permanently delete job
router.delete('/:id/permanent', authenticateToken, requireRole(['employer', 'admin']), requireTeamRole(['Owner']), async (req, res) => {
  try {
    const deleted = await Job.destroy({ where: { id: req.params.id } });
    if (!deleted) {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.json({ message: 'Job permanently deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/jobs/:id - Update job
router.put('/:id', async (req, res) => {
  try {
    const job = await Job.findByPk(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const allowed = ['jobTitle', 'company', 'location', 'jobType', 'workSetting', 'description',
      'requirements', 'responsibilities', 'skills', 'salaryMin', 'salaryMax', 'currency',
      'experienceLevel', 'jobCategory', 'experienceRange', 'languages', 'country',
      'applicationDeadline', 'isActive', 'status'];

    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    // Flatten salary object if sent
    if (req.body.salary) {
      updates.salaryMin = req.body.salary.min;
      updates.salaryMax = req.body.salary.max;
      if (req.body.salary.currency) updates.currency = req.body.salary.currency;
    }
    
    // Format description with bullets if updated
    if (updates.description) {
      updates.description = formatDescriptionWithBullets(updates.description);
    }

    if (updates.jobType) {
      if (Array.isArray(updates.jobType)) updates.jobType = updates.jobType[0] || 'Full-time';
      const match = typeof updates.jobType === 'string' && updates.jobType.match(/^\{"?([^"\}]+)"?\}$/);
      if (match) updates.jobType = match[1];
    }
    const validExpLevels = ['Entry', 'Mid', 'Senior', 'Lead'];
    if (updates.experienceLevel !== undefined && !validExpLevels.includes(updates.experienceLevel)) {
      updates.experienceLevel = 'Mid';
    }
    if (updates.skills !== undefined) updates.skills = normalizeArray(updates.skills);
    if (updates.languages !== undefined) updates.languages = normalizeArray(updates.languages);
    if (updates.country) updates.country = updates.country.trim();

    await job.update(updates);
    // Re-geocode if location changed (non-blocking)
    if (updates.location) {
      geocodeLocation(updates.location).then(coords => {
        if (coords) job.update({ latitude: coords.latitude, longitude: coords.longitude }).catch(() => {});
      }).catch(() => {});
    }
    // Re-index after update (non-blocking)
    vectorService.upsertJobEmbedding(job.id, job.toJSON()).catch(() => {});
    const jobJson = job.toJSON();
    res.json({ ...jobJson, companyLogo: getCompanyLogo(job.company, job.companyLogo), salary: { min: jobJson.salaryMin, max: jobJson.salaryMax, currency: jobJson.currency || 'INR' } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/jobs/:id/reactivate - Reactivate a deleted job
router.put('/:id/reactivate', async (req, res) => {
  try {
    const job = await Job.findByPk(req.params.id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    await job.update({ isActive: true });
    
    res.json({ message: 'Job reactivated successfully', job });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/jobs/:id/refresh - Refresh a job posting
router.post('/:id/refresh', async (req, res) => {
  try {
    const { userPlan = 'free' } = req.body;
    const result = await JobRefreshService.refreshJob(req.params.id, userPlan);
    
    if (result.success) {
      res.json(result);
    } else {
      const statusCode = result.code === 'JOB_NOT_FOUND' ? 404 : 400;
      res.status(statusCode).json(result);
    }
  } catch (error) {
    console.error('Error in refresh endpoint:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

// POST /api/jobs/bulk-refresh - Refresh multiple jobs
router.post('/bulk-refresh', async (req, res) => {
  try {
    const { jobIds, userPlan = 'free' } = req.body;
    const result = await JobRefreshService.refreshMultipleJobs(jobIds, userPlan);
    
    res.json(result);
  } catch (error) {
    console.error('Error in bulk refresh endpoint:', error);
    res.status(500).json({
      success: false,
      message: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

// GET /api/jobs/:id/refresh-status - Get refresh status for a job
router.get('/:id/refresh-status', async (req, res) => {
  try {
    const { userPlan = 'free' } = req.query;
    const result = await JobRefreshService.getRefreshStatus(req.params.id, userPlan);
    
    if (result.success) {
      res.json(result);
    } else {
      const statusCode = result.code === 'JOB_NOT_FOUND' ? 404 : 500;
      res.status(statusCode).json(result);
    }
  } catch (error) {
    console.error('Error in refresh status endpoint:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

// GET /api/jobs/refresh/analytics - Get refresh analytics for employer
router.get('/refresh/analytics', async (req, res) => {
  try {
    const { employerEmail, userPlan = 'free' } = req.query;
    
    if (!employerEmail) {
      return res.status(400).json({
        success: false,
        message: 'Employer email is required',
        code: 'MISSING_EMAIL'
      });
    }
    
    const result = await JobRefreshService.getRefreshAnalytics(employerEmail, userPlan);
    res.json(result);
  } catch (error) {
    console.error('Error in refresh analytics endpoint:', error);
    res.status(500).json({
      success: false,
      message: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

export default router;
