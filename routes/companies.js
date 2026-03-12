import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { formatCompanyWithLogo } from '../utils/companyLogoService.js';

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

export default router;