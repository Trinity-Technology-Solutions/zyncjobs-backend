import express from 'express';
import { body, validationResult } from 'express-validator';
import Job from '../models/Job.js';
import { Op } from 'sequelize';
import { requireRole, requirePermission, PERMISSIONS } from '../middleware/roleAuth.js';
import { mistralDetector } from '../utils/mistralJobDetector.js';
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
      status: 'approved',
      employerEmail,
      postedBy: employerEmail,
      isActive: true
    });
    
    console.log('Job created for employer:', employerEmail, 'Job ID:', job.id);
    res.status(201).json(job);
  } catch (error) {
    console.error('Error creating job:', error);
    res.status(400).json({ error: error.message });
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
