import express from 'express';
import { body, validationResult } from 'express-validator';
import Job from '../models/Job.js';
import User from '../models/User.js';
import { Op } from 'sequelize';
import { requireRole, requirePermission, PERMISSIONS } from '../middleware/roleAuth.js';
import { mistralDetector } from '../utils/mistralJobDetector.js';
import { generateEmployerId, generatePositionId } from '../utils/idGenerator.js';
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
    if (jobType) where.jobType = jobType;
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

// GET /api/jobs/:id - Get single job
router.get('/:id', async (req, res) => {
  try {
    const job = await Job.findByPk(req.params.id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const jobJson = job.toJSON();
    const jobWithLogo = {
      ...jobJson,
      companyLogo: getCompanyLogo(job.company),
      // Force generate header image for all jobs
      jobHeaderImage: getJobHeaderImage(job.jobTitle, job.skills || []),
      salary: {
        min: jobJson.salaryMin,
        max: jobJson.salaryMax,
        currency: jobJson.currency || 'INR'
      }
    };
    
    res.json(jobWithLogo);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/jobs - Create new job
router.post('/', [
  body('jobTitle').notEmpty().withMessage('Job title is required'),
  body('company').notEmpty().withMessage('Company is required'),
  body('location').notEmpty().withMessage('Location is required'),
  body('jobType').isIn(['Full-time', 'Part-time', 'Contract', 'Freelance', 'Internship']),
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
    
    // Flatten salary object if it exists
    if (jobData.salary) {
      jobData.salaryMin = jobData.salary.min;
      jobData.salaryMax = jobData.salary.max;
      jobData.currency = jobData.salary.currency || 'INR';
      delete jobData.salary;
    }

    const job = await Job.create({
      ...jobData,
      employerId,
      positionId: await generatePositionIdWithYear(), // Generate year + sequential position ID
      status: 'approved',
      employerEmail,
      postedBy: employerEmail,
      isActive: true
    });
    
    console.log('Job created - Employer ID:', employerId, 'Position ID:', job.positionId, 'Job ID:', job.id);
    res.status(201).json(job);
  } catch (error) {
    console.error('Error creating job:', error);
    res.status(400).json({ error: error.message });
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

// GET /api/jobs/position/:positionId - Get job by position ID
router.get('/position/:positionId', async (req, res) => {
  try {
    const job = await Job.findOne({ 
      where: { 
        positionId: req.params.positionId,
        isActive: true 
      } 
    });
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const jobJson = job.toJSON();
    const jobWithLogo = {
      ...jobJson,
      companyLogo: getCompanyLogo(job.company),
      // Force generate header image for all jobs
      jobHeaderImage: getJobHeaderImage(job.jobTitle, job.skills || []),
      salary: {
        min: jobJson.salaryMin,
        max: jobJson.salaryMax,
        currency: jobJson.currency || 'INR'
      }
    };
    
    res.json(jobWithLogo);
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

// DELETE /api/jobs/:id - Delete job
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Job.destroy({ where: { id: req.params.id } });
    if (!deleted) {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.json({ message: 'Job deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
