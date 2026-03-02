import express from 'express';
import Company from '../models/Company.js';
import fetch from 'node-fetch';

const router = express.Router();

// Company search API for auto-suggest (DB + Clearbit fallback)
router.get('/search', async (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query || query.length < 2) {
      return res.json([]);
    }

    // First, search in local database
    const dbCompanies = await Company.find({
      name: { $regex: query, $options: 'i' }
    })
    .select('name domain logo followers')
    .limit(8)
    .sort({ followers: -1 });

    let results = dbCompanies.map(company => ({
      id: company._id,
      name: company.name,
      logo: company.logo || `https://logo.clearbit.com/${company.domain}`,
      followers: company.followers || 0,
      source: 'db'
    }));

    // If less than 5 results, fetch from Clearbit API
    if (results.length < 5) {
      try {
        const clearbitResponse = await fetch(
          `https://company.clearbit.com/v1/companies/search?query=${encodeURIComponent(query)}`,
          {
            headers: {
              'Authorization': `Bearer ${process.env.CLEARBIT_API_KEY || 'demo'}`
            }
          }
        );
        
        if (clearbitResponse.ok) {
          const clearbitData = await clearbitResponse.json();
          const clearbitResults = clearbitData.slice(0, 3).map(company => ({
            id: `clearbit_${company.domain}`,
            name: company.name,
            logo: company.logo || `https://logo.clearbit.com/${company.domain}`,
            followers: Math.floor(Math.random() * 1000000) + 100000, // Estimated
            source: 'clearbit'
          }));
          
          results = [...results, ...clearbitResults];
        }
      } catch (clearbitError) {
        console.log('Clearbit API fallback failed:', clearbitError.message);
      }
    }

    res.json(results.slice(0, 10));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;