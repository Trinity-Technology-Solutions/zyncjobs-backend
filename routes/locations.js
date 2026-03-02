import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load locations data
let locationsData = [];
try {
  const locationsPath = path.join(__dirname, '../data/locations.json');
  const rawData = fs.readFileSync(locationsPath, 'utf8');
  const data = JSON.parse(rawData);
  locationsData = data.locations || [];
} catch (error) {
  console.error('Error loading locations data:', error);
}

// GET /api/locations - Get all locations
router.get('/', (req, res) => {
  res.json({ countries: locationsData, locations: locationsData });
});

// GET /api/locations/search/:query - Search locations
router.get('/search/:query', (req, res) => {
  console.log('Location search called for:', req.params.query);
  try {
    const query = req.params.query.toLowerCase();
    const filteredLocations = locationsData.filter(location => 
      location.toLowerCase().includes(query)
    ).slice(0, 10);
    
    console.log('Found locations:', filteredLocations.length);
    res.json({ locations: filteredLocations });
  } catch (error) {
    console.error('Location search error:', error);
    res.json({ locations: ['Chennai', 'Mumbai', 'Bangalore', 'Delhi', 'Remote'] });
  }
});

export default router;