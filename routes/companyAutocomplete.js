import express from 'express';
import Company from '../models/Company.js';
import { Op } from 'sequelize';

const router = express.Router();

// Popular companies with domains (for logo fetching)
const popularCompanies = [
  { name: 'Google', domain: 'google.com' },
  { name: 'Microsoft', domain: 'microsoft.com' },
  { name: 'Amazon', domain: 'amazon.com' },
  { name: 'Apple', domain: 'apple.com' },
  { name: 'Meta', domain: 'meta.com' },
  { name: 'Netflix', domain: 'netflix.com' },
  { name: 'Tesla', domain: 'tesla.com' },
  { name: 'IBM', domain: 'ibm.com' },
  { name: 'Oracle', domain: 'oracle.com' },
  { name: 'Salesforce', domain: 'salesforce.com' },
  { name: 'Adobe', domain: 'adobe.com' },
  { name: 'Intel', domain: 'intel.com' },
  { name: 'Cisco', domain: 'cisco.com' },
  { name: 'SAP', domain: 'sap.com' },
  { name: 'Uber', domain: 'uber.com' },
  { name: 'Airbnb', domain: 'airbnb.com' },
  { name: 'Twitter', domain: 'twitter.com' },
  { name: 'LinkedIn', domain: 'linkedin.com' },
  { name: 'Spotify', domain: 'spotify.com' },
  { name: 'Zoom', domain: 'zoom.us' },
  { name: 'Slack', domain: 'slack.com' },
  { name: 'Dropbox', domain: 'dropbox.com' },
  { name: 'PayPal', domain: 'paypal.com' },
  { name: 'eBay', domain: 'ebay.com' },
  { name: 'Shopify', domain: 'shopify.com' },
  { name: 'Stripe', domain: 'stripe.com' },
  { name: 'Square', domain: 'squareup.com' },
  { name: 'Atlassian', domain: 'atlassian.com' },
  { name: 'GitHub', domain: 'github.com' },
  { name: 'GitLab', domain: 'gitlab.com' },
  { name: 'Infosys', domain: 'infosys.com' },
  { name: 'TCS', domain: 'tcs.com' },
  { name: 'Wipro', domain: 'wipro.com' },
  { name: 'HCL', domain: 'hcltech.com' },
  { name: 'Tech Mahindra', domain: 'techmahindra.com' },
  { name: 'Cognizant', domain: 'cognizant.com' },
  { name: 'Accenture', domain: 'accenture.com' },
  { name: 'Deloitte', domain: 'deloitte.com' },
  { name: 'PwC', domain: 'pwc.com' },
  { name: 'EY', domain: 'ey.com' },
  { name: 'KPMG', domain: 'kpmg.com' }
];

// Company search with logo support
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) {
      return res.json([]);
    }

    const query = q.toLowerCase();
    
    // Search in popular companies first
    const popularMatches = popularCompanies
      .filter(company => company.name.toLowerCase().includes(query))
      .slice(0, 5);

    // Search in database
    let dbMatches = [];
    try {
      const companies = await Company.findAll({
        where: {
          name: { [Op.iLike]: `%${q}%` }
        },
        limit: 5,
        attributes: ['name', 'website']
      });

      dbMatches = companies.map(c => ({
        name: c.name,
        domain: c.website ? c.website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] : undefined
      }));
    } catch (dbError) {
      console.log('DB search skipped:', dbError.message);
    }

    // Combine and deduplicate
    const allMatches = [...popularMatches, ...dbMatches];
    const uniqueMatches = Array.from(
      new Map(allMatches.map(item => [item.name.toLowerCase(), item])).values()
    ).slice(0, 8);

    res.json(uniqueMatches);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
