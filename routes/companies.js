import express from 'express';
import { Op } from 'sequelize';
import multer from 'multer';
// import { uploadCompanyLogoToS3, uploadCompanyCoverToS3, deleteCompanyImageFromS3 } from '../services/s3Service.js';
import { formatCompanyWithLogo } from '../utils/companyLogoService.js';
import Company from '../models/Company.js';
import CompanyProfile from '../models/CompanyProfile.js';
import Job from '../models/Job.js';
import Review from '../models/Review.js';
import User from '../models/User.js';
import { authenticateToken as auth } from '../middleware/auth.js';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(file.originalname.toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});



// ===== COMPANY PROFILE ROUTES =====

// GET /api/companies/:id/profile - Get company profile
router.get('/:id/profile', auth, async (req, res) => {
  try {
    const { id: companyId } = req.params;
    
    // Verify user has access to this company
    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    // For employers, check if they belong to this company
    if (user.role === 'employer' && user.company !== companyId) {
      // Try to find company by name as well
      const company = await Company.findByPk(companyId);
      if (!company || user.company !== company.name) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    
    // Get or create company profile
    let profile = await CompanyProfile.findOne({
      where: { companyId },
      include: [{
        model: Company,
        as: 'company',
        attributes: ['id', 'name', 'domain', 'logo']
      }]
    });
    
    if (!profile) {
      // Create default profile if doesn't exist
      profile = await CompanyProfile.create({ companyId });
      await profile.reload({
        include: [{
          model: Company,
          as: 'company',
          attributes: ['id', 'name', 'domain', 'logo']
        }]
      });
    }
    
    res.json({ profile });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// PUT /api/companies/:id/profile - Update company profile
router.put('/:id/profile', auth, async (req, res) => {
  try {
    const { id: companyId } = req.params;
    const {
      description,
      industry,
      companySize,
      foundedYear,
      headquarters,
      website,
      phone,
      tagline,
      benefits,
      locations,
      socialLinks
    } = req.body;
    
    // Verify user has access to this company
    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    // For employers, check if they belong to this company
    if (user.role === 'employer' && user.company !== companyId) {
      const company = await Company.findByPk(companyId);
      if (!company || user.company !== company.name) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    
    // Calculate completion percentage
    const requiredFields = [description, industry, companySize, headquarters];
    const completedRequired = requiredFields.filter(field => field && field.trim()).length;
    const optionalFields = [website, phone, tagline];
    const completedOptional = optionalFields.filter(field => field && field.trim()).length;
    const hasBenefits = benefits && benefits.length > 0 ? 1 : 0;
    const hasLocations = locations && locations.length > 0 ? 1 : 0;
    
    const completionPercentage = Math.round(
      ((completedRequired * 20) + (completedOptional * 10) + (hasBenefits * 10) + (hasLocations * 10))
    );
    
    // Upsert profile
    const [profile] = await CompanyProfile.upsert({
      companyId,
      description,
      industry,
      companySize,
      foundedYear: foundedYear ? parseInt(foundedYear) : null,
      headquarters,
      website,
      phone,
      tagline,
      benefits: benefits || [],
      locations: locations || [],
      socialLinks: socialLinks || {},
      completionPercentage
    }, {
      returning: true
    });
    
    res.json({ profile });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// POST /api/companies/:id/upload-logo - Upload company logo
router.post('/:id/upload-logo', auth, upload.single('logo'), async (req, res) => {
  try {
    const { id: companyId } = req.params;
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    // Verify user has access to this company
    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    if (user.role === 'employer' && user.company !== companyId) {
      const company = await Company.findByPk(companyId);
      if (!company || user.company !== company.name) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    
    // Upload to S3
    const logoUrl = await uploadCompanyLogoToS3(req.file.buffer, companyId, req.file.originalname);
    
    // Update profile with logo URL
    await CompanyProfile.upsert({
      companyId,
      logoUrl
    });
    
    // Also update companies table
    await Company.update(
      { logo: logoUrl },
      { where: { id: companyId } }
    );
    
    res.json({ logoUrl });
  } catch (error) {
    console.error('Upload logo error:', error);
    res.status(500).json({ error: 'Failed to upload logo' });
  }
});

// POST /api/companies/:id/upload-cover - Upload cover image
router.post('/:id/upload-cover', auth, upload.single('cover'), async (req, res) => {
  try {
    const { id: companyId } = req.params;
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    // Verify user has access to this company
    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    if (user.role === 'employer' && user.company !== companyId) {
      const company = await Company.findByPk(companyId);
      if (!company || user.company !== company.name) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    
    // Upload to S3
    const coverUrl = await uploadCompanyCoverToS3(req.file.buffer, companyId, req.file.originalname);
    
    // Update profile with cover URL
    await CompanyProfile.upsert({
      companyId,
      coverImageUrl: coverUrl
    });
    
    res.json({ coverUrl });
  } catch (error) {
    console.error('Upload cover error:', error);
    res.status(500).json({ error: 'Failed to upload cover image' });
  }
});

// GET /api/companies/:id/completion-status - Get completion status
router.get('/:id/completion-status', auth, async (req, res) => {
  try {
    const { id: companyId } = req.params;
    
    const profile = await CompanyProfile.findOne({
      where: { companyId }
    });
    
    if (!profile) {
      return res.json({ completionPercentage: 0, profileCompleted: false });
    }
    
    res.json({
      completionPercentage: profile.completionPercentage || 0,
      profileCompleted: profile.profileCompleted || false
    });
  } catch (error) {
    console.error('Get completion status error:', error);
    res.status(500).json({ error: 'Failed to fetch completion status' });
  }
});

// POST /api/companies/:id/mark-completed - Mark profile as completed
router.post('/:id/mark-completed', auth, async (req, res) => {
  try {
    const { id: companyId } = req.params;
    
    // Verify user has access to this company
    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    if (user.role === 'employer' && user.company !== companyId) {
      const company = await Company.findByPk(companyId);
      if (!company || user.company !== company.name) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    
    // Mark as completed
    await CompanyProfile.update(
      { profileCompleted: true },
      { where: { companyId } }
    );
    
    // Also update companies table
    await Company.update(
      { profileCompleted: true },
      { where: { id: companyId } }
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Mark completed error:', error);
    res.status(500).json({ error: 'Failed to mark profile as completed' });
  }
});

// ===== EXISTING COMPANY ROUTES =====

// GET /api/companies - Get all companies or search companies
router.get('/', async (req, res) => {
  try {
    let whereClause = {};
    const { search, limit = 50 } = req.query;
    
    // If search query provided, filter companies
    if (search) {
      const searchTerm = search.toString();
      whereClause = {
        [Op.or]: [
          { name: { [Op.iLike]: `%${searchTerm}%` } },
          { domain: { [Op.iLike]: `%${searchTerm}%` } },
          { description: { [Op.iLike]: `%${searchTerm}%` } },
          { industry: { [Op.iLike]: `%${searchTerm}%` } }
        ]
      };
    }
    
    // Fetch companies from database
    const companies = await Company.findAll({
      where: whereClause,
      order: [['verified', 'DESC'], ['createdAt', 'DESC']], // Verified companies first
      limit: parseInt(limit),
      attributes: { exclude: ['followers', 'verificationDocuments'] } // Don't expose sensitive data
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
        size: companyData.size || null,
        // Include verification status for frontend
        verified: companyData.verified || false,
        verificationStatus: companyData.verificationStatus || 'pending'
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
      location,
      employerEmail,
      gstNumber,
      registrationNumber
    } = req.body;
    
    // Validate required fields
    if (!name) {
      return res.status(400).json({ error: 'Company name is required' });
    }
    
    // Upsert: update if exists, create if not
    const existingCompany = await Company.findOne({
      where: {
        [Op.or]: [
          { name: { [Op.iLike]: name } },
          ...(domain ? [{ domain: { [Op.iLike]: domain } }] : [])
        ]
      }
    });
    
    if (existingCompany) {
      // Update existing company with new info
      await existingCompany.update({
        ...(domain && { domain }),
        ...(logo && { logo }),
        ...(description && { description }),
        ...(industry && { industry }),
        ...(size && { size }),
        ...(website && { website }),
        ...(location && { location }),
        ...(employerEmail && !existingCompany.createdBy && { createdBy: employerEmail })
      });
      return res.json({
        success: true,
        company: formatCompanyWithLogo(existingCompany.toJSON()),
        message: 'Company profile updated'
      });
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
      gstNumber,
      registrationNumber,
      createdBy: employerEmail,
      followers: [],
      verified: false,
      verificationStatus: 'pending'
    });
    
    const companyData = company.toJSON();
    
    // Don't expose sensitive verification data
    delete companyData.verificationDocuments;
    delete companyData.verifiedBy;
    
    res.status(201).json({
      success: true,
      company: formatCompanyWithLogo(companyData),
      message: 'Company profile created successfully'
    });
  } catch (error) {
    console.error('Error creating company:', error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      res.status(409).json({ error: 'Company with this name already exists' });
    } else {
      res.status(500).json({ error: 'Failed to create company' });
    }
  }
});

// GET /api/companies/suggestions?q={query} - Get company suggestions
router.get('/suggestions', async (req, res) => {
  try {
    const { q: query, limit = 10 } = req.query;
    
    if (!query || query.length < 2) {
      return res.json({ success: true, companies: [] });
    }
    
    // Import the verification service
    const { CompanyVerificationService } = await import('../services/companyVerificationService.js');
    
    const suggestions = await CompanyVerificationService.getCompanySuggestions(
      query, 
      parseInt(limit)
    );
    
    res.json({
      success: true,
      companies: suggestions
    });
  } catch (error) {
    console.error('Company suggestions error:', error);
    res.status(500).json({ 
      success: false,
      companies: [],
      error: 'Failed to fetch company suggestions'
    });
  }
});

// POST /api/companies/verify - Verify company domain (for frontend)
router.post('/verify', async (req, res) => {
  try {
    const { email, companyName } = req.body;
    
    if (!email || !companyName) {
      return res.status(400).json({ 
        error: 'Email and company name are required' 
      });
    }
    
    // Import the verification service
    const { CompanyVerificationService } = await import('../services/companyVerificationService.js');
    
    const verificationResult = await CompanyVerificationService.verifyCompanyDomain(
      email, 
      companyName
    );
    
    res.json({
      success: true,
      ...verificationResult
    });
  } catch (error) {
    console.error('Company verification error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Verification service unavailable',
      isValid: false,
      isCompanyDomain: false,
      verificationMethod: 'manual_review',
      message: 'Please try again later'
    });
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
