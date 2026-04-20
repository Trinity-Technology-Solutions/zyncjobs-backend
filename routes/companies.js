import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { formatCompanyWithLogo } from '../utils/companyLogoService.js';
import Company from '../models/Company.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load companies data
let companiesData = [];
try {
  const companiesPath = path.join(__dirname, '../data/companies.json');
  const rawData = fs.readFileSync(companiesPath, 'utf8');
  companiesData = JSON.parse(rawData);
} catch (error) {
  console.error('Error loading companies data:', error);
}

// GET /api/companies - Get all companies or search companies
router.get('/', (req, res) => {
  try {
    let companies = companiesData;
    
    // If search query provided, filter companies
    if (req.query.search) {
      const searchTerm = req.query.search.toString().toLowerCase();
      companies = companiesData.filter(company => 
        company.name.toLowerCase().includes(searchTerm)
      );
    }
    
    // Format companies with logo service (includes Google favicon fallback)
    const formattedCompanies = companies.map(company => formatCompanyWithLogo(company));
    
    res.json(formattedCompanies);
  } catch (error) {
    console.error('Error loading companies:', error);
    res.json([]);
  }
});

// GET /api/companies/logo/:companyName - Get company logo by name
router.get('/logo/:companyName', (req, res) => {
  const companyName = req.params.companyName.toLowerCase().trim();
  
  // Find exact match first
  let company = companiesData.find(c => 
    c.name.toLowerCase().trim() === companyName
  );
  
  // If no exact match, try partial match
  if (!company) {
    company = companiesData.find(c => 
      c.name.toLowerCase().includes(companyName) || 
      companyName.includes(c.name.toLowerCase())
    );
  }
  
  if (company) {
    res.json(formatCompanyWithLogo(company));
  } else {
    res.status(404).json({ error: 'Company not found' });
  }
});

// Helper: find or create company record in DB by name
const findOrCreateCompany = async (companyId) => {
  let company = await Company.findOne({ where: { name: companyId } }).catch(() => null);
  if (!company) {
    company = await Company.create({ name: companyId, followers: [] }).catch(() => null);
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
