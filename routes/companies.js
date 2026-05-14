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
import { sequelize } from '../config/postgresql.js';

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
        // Basic fields
        name: companyData.name,
        industry: companyData.industry,
        description: companyData.description,
        location: companyData.location || companyData.headquarters,
        employees: companyData.size || companyData.companySize,
        website: companyData.website || companyData.companyWebsite,
        // Enhanced fields
        tagline: companyData.tagline,
        foundedYear: companyData.foundedYear,
        companyType: companyData.companyType,
        companySize: companyData.companySize,
        headquarters: companyData.headquarters,
        companyWebsite: companyData.companyWebsite,
        benefits: companyData.benefits || [],
        socialLinks: companyData.socialLinks || {},
        locations: companyData.additionalLocations || [],
        gstNumber: companyData.gstNumber,
        cinNumber: companyData.cinNumber,
        companyEmail: companyData.companyEmail,
        phoneNumber: companyData.phoneNumber,
        companyPhotos: companyData.companyPhotos || [],
        // Calculated fields
        openPositions: jobCountMap[name] || 0,
        rating: ratingMap[name]?.avg || null,
        reviewCount: ratingMap[name]?.count || 0,
        employerCount: employerMap[name] || 0,
        size: companyData.size || companyData.companySize || null,
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
      registrationNumber,
      // Enhanced fields from EmployerCompleteProfilePage
      companyName,
      tagline,
      foundedYear,
      companyType,
      companySize,
      headquarters,
      companyWebsite,
      benefits,
      socialLinks,
      locations,
      cinNumber,
      companyEmail,
      phoneNumber,
      companyPhotos
    } = req.body;
    
    // Use companyName if provided, fallback to name
    const finalName = companyName || name;
    
    // Validate required fields
    if (!finalName) {
      return res.status(400).json({ error: 'Company name is required' });
    }
    
    // Upsert: update if exists, create if not
    const existingCompany = await Company.findOne({
      where: {
        [Op.or]: [
          { name: { [Op.iLike]: finalName } },
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
        ...(size || companySize && { size: size || companySize }),
        ...(website || companyWebsite && { website: website || companyWebsite }),
        ...(location || headquarters && { location: location || headquarters }),
        ...(employerEmail && !existingCompany.createdBy && { createdBy: employerEmail }),
        // Enhanced fields
        ...(tagline && { tagline }),
        ...(foundedYear && { foundedYear }),
        ...(companyType && { companyType }),
        ...(companySize && { companySize }),
        ...(headquarters && { headquarters }),
        ...(companyWebsite && { companyWebsite }),
        ...(benefits && { benefits }),
        ...(socialLinks && { socialLinks }),
        ...(locations && { additionalLocations: locations }),
        ...(gstNumber && { gstNumber }),
        ...(cinNumber && { cinNumber }),
        ...(companyEmail && { companyEmail }),
        ...(phoneNumber && { phoneNumber }),
        ...(companyPhotos && { companyPhotos })
      });
      return res.json({
        success: true,
        company: formatCompanyWithLogo(existingCompany.toJSON()),
        message: 'Company profile updated'
      });
    }
    
    // Create new company with enhanced fields
    const company = await Company.create({
      name: finalName,
      domain,
      logo,
      description,
      industry,
      size: size || companySize,
      website: website || companyWebsite,
      location: location || headquarters,
      gstNumber,
      registrationNumber,
      createdBy: employerEmail,
      followers: [],
      verified: false,
      verificationStatus: 'pending',
      // Enhanced fields
      tagline,
      foundedYear,
      companyType: companyType || 'Private',
      companySize,
      headquarters,
      companyWebsite,
      benefits: benefits || [],
      socialLinks: socialLinks || {},
      additionalLocations: locations || [],
      cinNumber,
      companyEmail,
      phoneNumber,
      companyPhotos: companyPhotos || []
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

// GET /api/companies/by-domain/:domain - Get company by domain
router.get('/by-domain/:domain', async (req, res) => {
  try {
    const { domain } = req.params;
    
    if (!domain) {
      return res.status(400).json({ error: 'Domain is required' });
    }
    
    // Find company by domain
    const company = await Company.findOne({
      where: {
        [Op.or]: [
          { domain: { [Op.iLike]: domain } },
          { companyWebsite: { [Op.iLike]: `%${domain}%` } },
          { website: { [Op.iLike]: `%${domain}%` } }
        ]
      },
      attributes: { exclude: ['followers', 'verificationDocuments'] }
    });
    
    if (!company) {
      return res.status(404).json({ 
        error: 'Company not found', 
        message: `No company found for domain: ${domain}` 
      });
    }
    
    const companyData = company.toJSON();
    const name = companyData.name;
    
    // Get additional data
    const [jobCount, ratingData, employerCount] = await Promise.all([
      Job.count({ where: { company: name, isActive: true, status: 'approved' } }),
      Review.findOne({
        where: { companyName: name },
        attributes: [
          [Review.sequelize.fn('AVG', Review.sequelize.col('rating')), 'avgRating'],
          [Review.sequelize.fn('COUNT', Review.sequelize.col('id')), 'reviewCount']
        ],
        raw: true
      }),
      User.count({ where: { company: name, role: 'employer', isActive: true } })
    ]);
    
    res.json({
      ...formatCompanyWithLogo(companyData),
      // Basic fields
      name: companyData.name,
      companyName: companyData.name,
      industry: companyData.industry,
      description: companyData.description,
      location: companyData.location || companyData.headquarters,
      employees: companyData.size || companyData.companySize,
      website: companyData.website || companyData.companyWebsite,
      // Enhanced fields
      tagline: companyData.tagline,
      foundedYear: companyData.foundedYear,
      companyType: companyData.companyType,
      companySize: companyData.companySize,
      headquarters: companyData.headquarters,
      companyWebsite: companyData.companyWebsite,
      benefits: companyData.benefits || [],
      socialLinks: companyData.socialLinks || {},
      locations: companyData.additionalLocations || [],
      gstNumber: companyData.gstNumber,
      cinNumber: companyData.cinNumber,
      companyEmail: companyData.companyEmail,
      phoneNumber: companyData.phoneNumber,
      companyPhotos: companyData.companyPhotos || [],
      employerEmail: companyData.createdBy,
      domain: companyData.domain,
      // Calculated fields
      openPositions: jobCount,
      rating: ratingData?.avgRating ? parseFloat(ratingData.avgRating).toFixed(1) : null,
      reviewCount: parseInt(ratingData?.reviewCount) || 0,
      employerCount,
      size: companyData.size || companyData.companySize || null,
      // Verification status
      verified: companyData.verified || false,
      verificationStatus: companyData.verificationStatus || 'pending'
    });
  } catch (error) {
    console.error('Error fetching company by domain:', error);
    res.status(500).json({ error: 'Failed to fetch company by domain' });
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
      // Basic fields
      name: companyData.name,
      industry: companyData.industry,
      description: companyData.description,
      location: companyData.location || companyData.headquarters,
      employees: companyData.size || companyData.companySize,
      website: companyData.website || companyData.companyWebsite,
      // Enhanced fields
      tagline: companyData.tagline,
      foundedYear: companyData.foundedYear,
      companyType: companyData.companyType,
      companySize: companyData.companySize,
      headquarters: companyData.headquarters,
      companyWebsite: companyData.companyWebsite,
      benefits: companyData.benefits || [],
      socialLinks: companyData.socialLinks || {},
      locations: companyData.additionalLocations || [],
      gstNumber: companyData.gstNumber,
      cinNumber: companyData.cinNumber,
      companyEmail: companyData.companyEmail,
      phoneNumber: companyData.phoneNumber,
      companyPhotos: companyData.companyPhotos || [],
      // Calculated fields
      openPositions: jobCount,
      rating: ratingData?.avgRating ? parseFloat(ratingData.avgRating).toFixed(1) : null,
      reviewCount: parseInt(ratingData?.reviewCount) || 0,
      employerCount,
      size: companyData.size || companyData.companySize || null,
      // Verification status
      verified: companyData.verified || false,
      verificationStatus: companyData.verificationStatus || 'pending'
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

// ===== DYNAMIC COMPANY DATA ENDPOINTS (Naukri-like features) =====

// GET /api/companies/:id/enhanced - Get enhanced company profile with all dynamic data
router.get('/:id/enhanced', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get basic company info
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
    
    const companyData = company.toJSON();
    const companyName = companyData.name;
    
    // Get aggregated data
    const [jobCount, ratingData, followerCount] = await Promise.all([
      Job.count({ where: { company: companyName, isActive: true, status: 'approved' } }),
      Review.findOne({
        where: { companyName: companyName },
        attributes: [
          [Review.sequelize.fn('AVG', Review.sequelize.col('rating')), 'avgRating'],
          [Review.sequelize.fn('COUNT', Review.sequelize.col('id')), 'reviewCount']
        ],
        raw: true
      }),
      Company.findByPk(company.id, { attributes: ['followers'] })
    ]);
    
    // Enhanced company data
    const enhancedData = {
      id: companyData.id,
      name: companyData.name,
      industry: companyData.industry,
      description: companyData.description,
      company_type: companyData.industry === 'Financial Services' ? 'NBFC' : 'Private',
      founded_year: 1995,
      tagline: 'Your Financial Partner',
      logo_url: companyData.logo,
      cover_photo_url: null,
      website: companyData.website,
      headquarters: companyData.location,
      employees: companyData.size,
      avg_rating: ratingData?.avgRating ? parseFloat(ratingData.avgRating).toFixed(1) : 0,
      review_count: parseInt(ratingData?.reviewCount) || 0,
      follower_count: (followerCount?.followers || []).length,
      total_jobs: jobCount,
      verification_status: companyData.verificationStatus || 'pending'
    };
    
    res.json(enhancedData);
  } catch (error) {
    console.error('Enhanced profile error:', error);
    res.status(500).json({ error: 'Failed to fetch enhanced profile' });
  }
});

// GET /api/companies/:id/benefits - Get company benefits
router.get('/:id/benefits', async (req, res) => {
  try {
    const benefits = [
      { id: '1', benefit_type: 'health_insurance', benefit_name: 'Health Insurance', employee_count: 12 },
      { id: '2', benefit_type: 'skill_training', benefit_name: 'Job/Soft Skill Training', employee_count: 11 },
      { id: '3', benefit_type: 'cafeteria', benefit_name: 'Cafeteria', employee_count: 5 },
      { id: '4', benefit_type: 'gym', benefit_name: 'Office Gym', employee_count: 2 },
      { id: '5', benefit_type: 'childcare', benefit_name: 'Child Care Facility', employee_count: 2 }
    ];
    
    res.json({ benefits });
  } catch (error) {
    console.error('Benefits error:', error);
    res.status(500).json({ error: 'Failed to fetch benefits' });
  }
});

// GET /api/companies/:id/departments - Get company departments
router.get('/:id/departments', async (req, res) => {
  try {
    const { id } = req.params;
    
    const company = await Company.findOne({
      where: {
        [Op.or]: [
          { id: id },
          { name: { [Op.iLike]: id } }
        ]
      },
      attributes: ['name']
    });
    
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    
    const totalJobs = await Job.count({
      where: { company: company.name, isActive: true, status: 'approved' }
    });
    
    const departments = [
      { id: '1', department_name: 'Sales & Business Development', job_openings: Math.floor(totalJobs * 0.4) },
      { id: '2', department_name: 'Technology & Engineering', job_openings: Math.floor(totalJobs * 0.3) },
      { id: '3', department_name: 'Finance & Accounting', job_openings: Math.floor(totalJobs * 0.2) },
      { id: '4', department_name: 'Customer Service', job_openings: Math.floor(totalJobs * 0.1) }
    ].filter(dept => dept.job_openings > 0);
    
    res.json({ departments });
  } catch (error) {
    console.error('Departments error:', error);
    res.status(500).json({ error: 'Failed to fetch departments' });
  }
});

// GET /api/companies/:id/salaries - Get salary data
router.get('/:id/salaries', async (req, res) => {
  try {
    const salaries = [
      {
        id: '1',
        job_title: 'Software Engineer',
        experience_min: 1,
        experience_max: 5,
        salary_min: 450000,
        salary_max: 650000,
        submission_count: 6,
        location: 'Mumbai'
      },
      {
        id: '2',
        job_title: 'Manager',
        experience_min: 2,
        experience_max: 14,
        salary_min: 1150000,
        salary_max: 1270000,
        submission_count: 153,
        location: 'Mumbai'
      }
    ];
    
    res.json({ salaries });
  } catch (error) {
    console.error('Salaries error:', error);
    res.status(500).json({ error: 'Failed to fetch salaries' });
  }
});

// GET /api/companies/:id/review-breakdown - Get review breakdown
router.get('/:id/review-breakdown', async (req, res) => {
  try {
    const { id } = req.params;
    
    const company = await Company.findOne({
      where: {
        [Op.or]: [
          { id: id },
          { name: { [Op.iLike]: id } }
        ]
      },
      attributes: ['name']
    });
    
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    
    const overallRating = await Review.findOne({
      where: { companyName: company.name },
      attributes: [[Review.sequelize.fn('AVG', Review.sequelize.col('rating')), 'avgRating']],
      raw: true
    });
    
    const baseRating = overallRating?.avgRating ? parseFloat(overallRating.avgRating) : 3.5;
    
    const breakdown = {
      work_life_rating: Math.max(1, Math.min(5, baseRating - 0.1)),
      salary_rating: Math.max(1, Math.min(5, baseRating + 0.1)),
      culture_rating: Math.max(1, Math.min(5, baseRating - 0.2)),
      growth_rating: Math.max(1, Math.min(5, baseRating - 0.3)),
      security_rating: Math.max(1, Math.min(5, baseRating - 0.2)),
      skill_development_rating: Math.max(1, Math.min(5, baseRating - 0.3))
    };
    
    res.json({ breakdown });
  } catch (error) {
    console.error('Review breakdown error:', error);
    res.status(500).json({ error: 'Failed to fetch review breakdown' });
  }
});

// GET /api/companies/:id/similar - Get similar companies
router.get('/:id/similar', async (req, res) => {
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
    
    const similarCompanies = await Company.findAll({
      where: {
        industry: company.industry,
        name: { [Op.ne]: company.name }
      },
      limit: 3,
      attributes: ['id', 'name', 'logo', 'industry']
    });
    
    const similar_companies = similarCompanies.map(comp => ({
      id: comp.id,
      name: comp.name,
      logo_url: comp.logo,
      industry: comp.industry,
      similarity_score: 0.85
    }));
    
    res.json({ similar_companies });
  } catch (error) {
    console.error('Similar companies error:', error);
    res.status(500).json({ error: 'Failed to fetch similar companies' });
  }
});



export default router;
