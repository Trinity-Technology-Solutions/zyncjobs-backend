import express from 'express';
import User from '../models/User.js';
import Job from '../models/Job.js';
import Company from '../models/Company.js';
import { Op } from 'sequelize';

const router = express.Router();

// POST /api/employers/:employerId/company - Register/Update company for employer
router.post('/:employerId/company', async (req, res) => {
  try {
    const { employerId } = req.params;
    const {
      name,
      industry,
      description,
      location,
      size,
      website,
      logo
    } = req.body;

    // Validate required fields
    if (!name) {
      return res.status(400).json({ error: 'Company name is required' });
    }

    // Verify employer exists
    const employer = await User.findOne({
      where: { 
        employerId: employerId,
        role: 'employer'
      }
    });

    if (!employer) {
      return res.status(404).json({ error: 'Employer not found' });
    }

    // Check if company already exists
    let company = await Company.findOne({
      where: { name: { [Op.iLike]: name } }
    });

    if (company) {
      // Update existing company
      await company.update({
        industry: industry || company.industry,
        description: description || company.description,
        location: location || company.location,
        size: size || company.size,
        website: website || company.website,
        logo: logo || company.logo
      });
    } else {
      // Create new company
      company = await Company.create({
        name,
        industry,
        description,
        location,
        size,
        website,
        logo,
        followers: []
      });
    }

    // Update employer's company information
    await employer.update({
      company: name,
      companyName: name,
      companyWebsite: website,
      companyLogo: logo
    });

    res.json({
      success: true,
      company: company.toJSON(),
      message: company ? 'Company updated successfully' : 'Company registered successfully'
    });
  } catch (error) {
    console.error('Error registering company:', error);
    res.status(500).json({ error: 'Failed to register company' });
  }
});

// GET /api/employers/:employerId - Get employer info by employer ID
router.get('/:employerId', async (req, res) => {
  try {
    const employer = await User.findOne({
      where: { 
        employerId: req.params.employerId,
        role: 'employer'
      },
      attributes: ['id', 'name', 'email', 'company', 'companyName', 'companyLogo', 'companyWebsite', 'location', 'employerId', 'createdAt']
    });

    if (!employer) {
      return res.status(404).json({ error: 'Employer not found' });
    }

    // Get job count for this employer
    const jobCount = await Job.count({
      where: { 
        employerId: req.params.employerId,
        isActive: true,
        status: 'approved'
      }
    });

    // Get company details if available
    let companyDetails = null;
    if (employer.company || employer.companyName) {
      companyDetails = await Company.findOne({
        where: { 
          name: { [Op.iLike]: employer.company || employer.companyName }
        }
      });
    }

    res.json({
      ...employer.toJSON(),
      jobCount,
      companyDetails: companyDetails ? companyDetails.toJSON() : null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/employers/:employerId/jobs - Get all jobs by employer ID
router.get('/:employerId/jobs', async (req, res) => {
  try {
    const { page = 1, limit = 10, status = 'approved' } = req.query;
    
    const jobs = await Job.findAll({
      where: { 
        employerId: req.params.employerId,
        isActive: true,
        status: status === 'all' ? { [Op.in]: ['approved', 'pending', 'rejected'] } : status
      },
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit)
    });

    const totalJobs = await Job.count({
      where: { 
        employerId: req.params.employerId,
        isActive: true,
        status: status === 'all' ? { [Op.in]: ['approved', 'pending', 'rejected'] } : status
      }
    });

    res.json({
      jobs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalJobs,
        pages: Math.ceil(totalJobs / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/employers/:employerId/stats - Get employer statistics
router.get('/:employerId/stats', async (req, res) => {
  try {
    const [totalJobs, activeJobs, pendingJobs] = await Promise.all([
      Job.count({ where: { employerId: req.params.employerId } }),
      Job.count({ where: { employerId: req.params.employerId, isActive: true, status: 'approved' } }),
      Job.count({ where: { employerId: req.params.employerId, status: 'pending' } })
    ]);

    // Get total views and applications
    const jobs = await Job.findAll({
      where: { employerId: req.params.employerId },
      attributes: ['views', 'applicationsCount']
    });

    const totalViews = jobs.reduce((sum, job) => sum + (job.views || 0), 0);
    const totalApplications = jobs.reduce((sum, job) => sum + (job.applicationsCount || 0), 0);

    res.json({
      totalJobs,
      activeJobs,
      pendingJobs,
      totalViews,
      totalApplications
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
