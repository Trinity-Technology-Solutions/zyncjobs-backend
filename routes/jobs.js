import express from 'express';
import { body, validationResult } from 'express-validator';
import Job from '../models/Job.js';
import User from '../models/User.js';
import { Op } from 'sequelize';
import { requireRole, requirePermission, PERMISSIONS } from '../middleware/roleAuth.js';
import { mistralDetector } from '../utils/mistralJobDetector.js';
import { generateEmployerId, generatePositionId, generatePositionIdWithYear } from '../utils/idGenerator.js';
import { maxJobsGuard, getJobStatus } from '../middleware/settingsMiddleware.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

// GET /api/jobs/countries - Get all countries
router.get('/countries', (req, res) => {
  try {
    const locationsPath = path.join(__dirname, '../data/locations.json');
    const rawData = fs.readFileSync(locationsPath, 'utf8');
    const data = JSON.parse(rawData);
    res.json({ countries: data.locations || [] });
  } catch (error) {
    console.error('Error loading locations:', error);
    res.json({ countries: [] });
  }
});

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
function getCompanyLogo(companyName) {
  if (!companyName) return null;
  
  const company = companiesData.find(c => 
    c.name.toLowerCase().trim() === companyName.toLowerCase().trim() ||
    c.name.toLowerCase().includes(companyName.toLowerCase()) ||
    companyName.toLowerCase().includes(c.name.toLowerCase())
  );
  
  return company ? company.logo : null;
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

    const order = sort === 'newest' ? [['createdAt', 'DESC']] : [['createdAt', 'DESC']];

    const jobs = await Job.findAll({
      where,
      order,
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit)
    });

    const jobsWithLogos = jobs.map(job => {
      const jobJson = job.toJSON();
      return {
        ...jobJson,
        companyLogo: getCompanyLogo(job.company),
        salary: {
          min: jobJson.salaryMin,
          max: jobJson.salaryMax,
          currency: jobJson.currency || 'INR'
        }
      };
    });

    res.json(jobsWithLogos);
  } catch (error) {
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
      return { ...jobJson, companyLogo: getCompanyLogo(job.company), salary: { min: jobJson.salaryMin, max: jobJson.salaryMax, currency: jobJson.currency || 'INR' } };
    });
    res.json(jobsWithLogos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/jobs/employer/email/:email - Get jobs by employer email
router.get('/employer/email/:email', async (req, res) => {
  try {
    const jobs = await Job.findAll({ 
      where: {
        employerEmail: req.params.email,
        isActive: true,
        status: { [Op.in]: ['approved', 'pending'] }
      },
      order: [['createdAt', 'DESC']]
    });
    const jobsWithLogos = jobs.map(job => {
      const jobJson = job.toJSON();
      return { ...jobJson, companyLogo: getCompanyLogo(job.company), salary: { min: jobJson.salaryMin, max: jobJson.salaryMax, currency: jobJson.currency || 'INR' } };
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
    res.json({ ...jobJson, companyLogo: getCompanyLogo(job.company), jobHeaderImage: getJobHeaderImage(job.jobTitle, job.skills || []), salary: { min: jobJson.salaryMin, max: jobJson.salaryMax, currency: jobJson.currency || 'INR' } });
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
        companyLogo: getCompanyLogo(job.company),
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
        companyLogo: getCompanyLogo(job.company),
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
    const valid = ['Full-time', 'Part-time', 'Contract', 'Freelance', 'Internship'];
    // Handle both array and string inputs
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

    const employerEmail = req.body.employerEmail || req.headers['x-employer-email'];
    if (!employerEmail) {
      return res.status(400).json({ error: 'Employer email is required' });
    }

    // Find or create employer ID
    let user = await User.findOne({ where: { email: employerEmail, role: 'employer' } });
    let employerId;
    
    if (user && user.employerId) {
      employerId = user.employerId;
    } else {
      // Generate new sequential employer ID
      employerId = await generateEmployerId();
      
      if (user) {
        // Update existing user with employer ID
        await user.update({ employerId });
      }
    }

    const jobData = { ...req.body };

    console.log('Raw jobData before processing:', JSON.stringify(jobData, null, 2));
    
    // Normalize jobType - extract first value if array sent from frontend
    if (Array.isArray(jobData.jobType)) {
      console.log('Converting jobType from array:', jobData.jobType, 'to string:', jobData.jobType[0]);
      jobData.jobType = jobData.jobType[0] || 'Full-time';
    }
    
    // Ensure jobType is a valid string (not array format)
    if (typeof jobData.jobType !== 'string') {
      console.log('JobType is not string, setting default. Current type:', typeof jobData.jobType, 'Value:', jobData.jobType);
      jobData.jobType = 'Full-time'; // Default fallback
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
    
    // Ensure skills is properly formatted as array
    if (jobData.skills) {
      if (typeof jobData.skills === 'string') {
        // If skills is a string, try to parse it or split it
        try {
          jobData.skills = JSON.parse(jobData.skills);
        } catch {
          jobData.skills = jobData.skills.split(',').map(s => s.trim());
        }
      } else if (!Array.isArray(jobData.skills)) {
        jobData.skills = [];
      }
    } else {
      jobData.skills = [];
    }
    
    console.log('Skills before create:', jobData.skills, 'Type:', typeof jobData.skills, 'IsArray:', Array.isArray(jobData.skills));
    console.log('JobType before create:', jobData.jobType, 'Type:', typeof jobData.jobType);
    console.log('Full jobData object being sent to Job.create:', JSON.stringify(jobData, null, 2));
    
    // Explicitly construct the job creation object to avoid any spread issues
    const jobCreateData = {
      jobTitle: jobData.jobTitle,
      company: jobData.company,
      location: jobData.location,
      jobType: jobData.jobType, // This should be a string now
      workSetting: jobData.workSetting,
      description: jobData.description,
      requirements: jobData.requirements,
      responsibilities: jobData.responsibilities,
      skills: jobData.skills, // This should be an array
      salaryMin: jobData.salaryMin,
      salaryMax: jobData.salaryMax,
      currency: jobData.currency,
      experienceLevel: jobData.experienceLevel,
      employerId,
      positionId: positionId,
      status: getJobStatus(),
      employerEmail,
      postedBy: employerEmail,
      isActive: true
    };
    
    console.log('Final jobCreateData:', JSON.stringify(jobCreateData, null, 2));
    
    const job = await Job.create(jobCreateData);
    
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
    res.json({ ...jobJson, companyLogo: getCompanyLogo(job.company), jobHeaderImage: getJobHeaderImage(job.jobTitle, job.skills || []), salary: { min: jobJson.salaryMin, max: jobJson.salaryMax, currency: jobJson.currency || 'INR' } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/jobs/:id - Delete job (soft delete by setting isActive to false)
router.delete('/:id', async (req, res) => {
  try {
    const job = await Job.findByPk(req.params.id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Soft delete - set isActive to false instead of hard delete
    await job.update({ isActive: false });
    
    res.json({ message: 'Job deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/jobs/:id/permanent - Permanently delete job (hard delete)
router.delete('/:id/permanent', async (req, res) => {
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

export default router;
