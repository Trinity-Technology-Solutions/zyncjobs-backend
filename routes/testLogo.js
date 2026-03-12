import express from 'express';
import { getCompanyLogo, formatCompanyWithLogo } from '../utils/companyLogoService.js';

const router = express.Router();

// Test endpoint to verify logo service
router.get('/test-logo', (req, res) => {
  const testCompanies = [
    { name: 'Google', domain: 'google.com' },
    { name: 'Nambikkai India', domain: 'nambikai.com', website: 'https://nambikai.com' },
    { name: 'Test Company', website: 'https://example.com' },
    { name: 'No Domain Company' }
  ];

  const results = testCompanies.map(company => ({
    input: company,
    output: formatCompanyWithLogo(company)
  }));

  res.json({
    message: 'Company Logo Service Test',
    results
  });
});

export default router;
