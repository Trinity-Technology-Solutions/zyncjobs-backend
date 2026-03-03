import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load colleges data
let collegesData = [];
try {
  const collegesPath = path.join(__dirname, '../data/colleges.json');
  const rawData = fs.readFileSync(collegesPath, 'utf8');
  collegesData = JSON.parse(rawData);
} catch (error) {
  console.error('Error loading colleges data:', error);
}

// GET /api/colleges - Get all colleges
router.get('/', (req, res) => {
  res.json({ colleges: collegesData });
});

// GET /api/colleges/search/:query - Search colleges
router.get('/search/:query', (req, res) => {
  try {
    const query = req.params.query.toLowerCase();
    const filteredColleges = collegesData.filter(college => 
      college.name.toLowerCase().includes(query) ||
      college.city.toLowerCase().includes(query) ||
      college.state.toLowerCase().includes(query)
    ).slice(0, 10);
    
    res.json({ colleges: filteredColleges });
  } catch (error) {
    console.error('College search error:', error);
    res.json({ colleges: [] });
  }
});

// GET /api/colleges/by-city/:city - Get colleges by city
router.get('/by-city/:city', (req, res) => {
  try {
    const city = req.params.city.toLowerCase();
    const filteredColleges = collegesData.filter(college => 
      college.city.toLowerCase() === city
    );
    
    res.json({ colleges: filteredColleges });
  } catch (error) {
    console.error('College city filter error:', error);
    res.json({ colleges: [] });
  }
});

export default router;
