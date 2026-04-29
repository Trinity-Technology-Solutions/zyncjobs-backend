import express from 'express';
import { Op } from 'sequelize';
import { formatCompanyWithLogo } from '../utils/companyLogoService.js';
import Company from '../models/Company.js';
import Job from '../models/Job.js';
import Review from '../models/Review.js';
import User from '../models/User.js';

const router = express.Router();

// GET /api/companies - Get all companies or search companies
router.get('/', async (req, res) => {
  try {
    let whereClause = {};
    
    // If search query provided, filter companies
    if (req.query.search) {
      const searchTerm = req.query.search.toString();
      whereClause = {
        [Op.or]: [
          { name: { [Op.iLike]: `%${searchTerm}%` } },
          { description: { [Op.iLike]: `%${searchTerm}%` } },
          { industry: { [Op.iLike]: `%${searchTerm}%` } }
        ]
      };
    }
    
    // Fetch companies from database
    const companies = await Company.findAll({
      where: whereClause,
      order: [['createdAt', 'DESC']],
      attributes: { exclude: ['followers'] }
    });
    
    const companyNames = companies.map(c => c.name);

    // Real open positions count
    const jobCounts = await Job.findAll({
      where: { company: { [Op.in]: companyNames }, isActive: true, status: 'approved' },
      attributes: ['company', [Job.sequelize.fn('COUNT', Job.sequelize.col('id')), 'count']],
      group: ['company'],
      raw: true
    });
    const jobCountMap = Object.fromEntries(jobCounts.map(j => [j.company, parseInt(j.count)]));

    // Real average rating per company
    const ratings = await Review.findAll({
      where: { companyName: { [Op.in]: companyNames } },
      attributes: ['companyName', [Review.sequelize.fn('AVG', Review.sequelize.col('rating')), 'avgRating'], [Review.sequelize.fn('COUNT', Review.sequelize.col('id')), 'reviewCount']],
      group: ['companyName'],
      raw: true
    });
    const ratingMap = Object.fromEntries(ratings.map(r => [r.companyName, { avg: parseFloat(r.avgRating).toFixed(1), count: parseInt(r.reviewCount) }]));

    // Real employer count per company
    const employers = await User.findAll({
      where: { company: { [Op.in]: companyNames }, role: 'employer', isActive: true },
      attributes: ['company', [User.sequelize.fn('COUNT', User.sequelize.col('id')), 'count']],
      group: ['company'],
      raw: true
    });
    const employerMap = Object.fromEntries(employers.map(e => [e.company, parseInt(e.count)]));

    const formattedCompanies = companies.map(company => {
      const companyData = company.toJSON();
      const name = companyData.name;
      return {
        ...formatCompanyWithLogo(companyData),
        openPositions: jobCountMap[name] || 0,
        rating: ratingMap[name]?.avg || null,
        reviewCount: ratingMap[name]?.count || 0,
        employerCount: employerMap[name] || 0,
        location: companyData.location || null,
        size: companyData.size || null
      };
    });

    res.json(formattedCompanies);
  } catch (error) {
    console.error('Error loading companies:', error);
    res.status(500).json({ error: 'Failed to load companies' });
  }
});

// GET /api/companies/logo/:companyName - Get company logo by name
router.get('/logo/:companyName', async (req, res) => {
  try {
    const companyName = req.params.companyName.trim();
    
    // Find company in database
    const company = await Company.findOne({
      where: {
        [Op.or]: [
          { name: { [Op.iLike]: companyName } },
          { name: { [Op.iLike]: `%${companyName}%` } }
        ]
      }
    });
    
    if (company) {
      const companyData = company.toJSON();
      res.json(formatCompanyWithLogo(companyData));
    } else {
      res.status(404).json({ error: 'Company not found' });
    }
  } catch (error) {
    console.error('Error finding company logo:', error);
    res.status(500).json({ error: 'Failed to find company' });
  }
});

// POST /api/companies - Create a new company (for employers)
router.post('/', async (req, res) => {
  try {
    const {
      name,
      domain,
      logo,
      description,
      industry,
      size,
      website,
      location
    } = req.body;
    
    // Validate required fields
    if (!name) {
      return res.status(400).json({ error: 'Company name is required' });
    }
    
    // Check if company already exists
    const existingCompany = await Company.findOne({
      where: { name: { [Op.iLike]: name } }
    });
    
    if (existingCompany) {
      return res.status(409).json({ error: 'Company with this name already exists' });
    }
    
    // Create new company
    const company = await Company.create({
      name,
      domain,
      logo,
      description,
      industry,
      size,
      website,
      location,
      followers: []
    });
    
    const companyData = company.toJSON();
    res.status(201).json(formatCompanyWithLogo(companyData));
  } catch (error) {
    console.error('Error creating company:', error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      res.status(409).json({ error: 'Company with this name already exists' });
    } else {
      res.status(500).json({ error: 'Failed to create company' });
    }
  }
});

// GET /api/companies/:id - Get specific company details
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const company = await Company.findOne({
      where: {
        [Op.or]: [
          { id: id },
          { name: { [Op.iLike]: id } }
        ]
      },
      attributes: {
        exclude: ['followers'] // Don't include followers in public view
      }
    });
    
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const companyData = company.toJSON();
    const name = companyData.name;

    const [jobCount, ratingData, employerCount] = await Promise.all([
      Job.count({ where: { company: name, isActive: true, status: 'approved' } }),
      Review.findOne({
        where: { companyName: name },
        attributes: [[Review.sequelize.fn('AVG', Review.sequelize.col('rating')), 'avgRating'], [Review.sequelize.fn('COUNT', Review.sequelize.col('id')), 'reviewCount']],
        raw: true
      }),
      User.count({ where: { company: name, role: 'employer', isActive: true } })
    ]);

    res.json({
      ...formatCompanyWithLogo(companyData),
      openPositions: jobCount,
      rating: ratingData?.avgRating ? parseFloat(ratingData.avgRating).toFixed(1) : null,
      reviewCount: parseInt(ratingData?.reviewCount) || 0,
      employerCount,
      location: companyData.location || null,
      size: companyData.size || null
    });
  } catch (error) {
    console.error('Error fetching company:', error);
    res.status(500).json({ error: 'Failed to fetch company' });
  }
});

// PUT /api/companies/:id - Update company (for employers)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    // Remove fields that shouldn't be updated via this endpoint
    delete updateData.id;
    delete updateData.followers;
    delete updateData.createdAt;
    delete updateData.updatedAt;
    
    const company = await Company.findOne({
      where: {
        [Op.or]: [
          { id: id },
          { name: { [Op.iLike]: id } }
        ]
      }
    });
    
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    
    await company.update(updateData);
    const updatedCompany = await company.reload();
    
    const companyData = updatedCompany.toJSON();
    res.json(formatCompanyWithLogo(companyData));
  } catch (error) {
    console.error('Error updating company:', error);
    res.status(500).json({ error: 'Failed to update company' });
  }
});

// DELETE /api/companies/:id - Delete company (for employers)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const company = await Company.findOne({
      where: {
        [Op.or]: [
          { id: id },
          { name: { [Op.iLike]: id } }
        ]
      }
    });
    
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    
    await company.destroy();
    res.json({ success: true, message: 'Company deleted successfully' });
  } catch (error) {
    console.error('Error deleting company:', error);
    res.status(500).json({ error: 'Failed to delete company' });
  }
});

// Helper: find or create company record in DB by name
const findOrCreateCompany = async (companyId) => {
  let company = await Company.findOne({ 
    where: {
      [Op.or]: [
        { id: companyId },
        { name: { [Op.iLike]: companyId } }
      ]
    }
  }).catch(() => null);
  
  if (!company) {
    company = await Company.create({ 
      name: companyId, 
      followers: [] 
    }).catch(() => null);
  }
  return company;
};

// GET /api/companies/:id/follow-status
router.get('/:id/follow-status', async (req, res) => {
  try {
    const company = await findOrCreateCompany(req.params.id);
    if (!company) return res.json({ isFollowing: false, followersCount: 0 });
    const followers = company.followers || [];
    const userEmail = req.query.userEmail || '';
    res.json({
      isFollowing: userEmail ? followers.includes(userEmail) : false,
      followersCount: followers.length
    });
  } catch (error) {
    console.error('Follow status error:', error);
    res.json({ isFollowing: false, followersCount: 0 });
  }
});

// POST /api/companies/:id/follow
router.post('/:id/follow', async (req, res) => {
  try {
    const { userEmail } = req.body;
    if (!userEmail) return res.status(400).json({ error: 'userEmail required' });
    const company = await findOrCreateCompany(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });
    const followers = company.followers || [];
    if (!followers.includes(userEmail)) {
      await company.update({ followers: [...followers, userEmail] });
    }
    const updated = await company.reload();
    res.json({ success: true, followersCount: (updated.followers || []).length });
  } catch (error) {
    console.error('Follow error:', error);
    res.status(500).json({ error: 'Failed to follow company' });
  }
});

// POST /api/companies/:id/unfollow
router.post('/:id/unfollow', async (req, res) => {
  try {
    const { userEmail } = req.body;
    if (!userEmail) return res.status(400).json({ error: 'userEmail required' });
    const company = await findOrCreateCompany(req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });
    const followers = (company.followers || []).filter(e => e !== userEmail);
    await company.update({ followers });
    res.json({ success: true, followersCount: followers.length });
  } catch (error) {
    console.error('Unfollow error:', error);
    res.status(500).json({ error: 'Failed to unfollow company' });
  }
});

export default router;
