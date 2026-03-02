import express from 'express';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();

// Load JSON data
const jobTitles = JSON.parse(readFileSync(join(__dirname, '../data/job_titles.json'), 'utf-8')).job_titles;
const locations = JSON.parse(readFileSync(join(__dirname, '../data/locations.json'), 'utf-8')).locations;
const skills = JSON.parse(readFileSync(join(__dirname, '../data/skills.json'), 'utf-8')).skills;

// Autocomplete for job titles
router.get('/jobs', (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) {
      return res.json([]);
    }

    const matches = jobTitles
      .filter(title => title.toLowerCase().includes(q.toLowerCase()))
      .slice(0, 10);

    res.json(matches);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Autocomplete for locations
router.get('/locations', (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q) {
      // Return all locations if no query
      return res.json(locations);
    }
    
    if (q.length < 2) {
      return res.json([]);
    }

    const matches = locations
      .filter(loc => loc.toLowerCase().includes(q.toLowerCase()))
      .slice(0, 10);

    res.json(matches);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Autocomplete for skills
router.get('/skills', (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q) {
      // Return all skills if no query
      return res.json(skills);
    }
    
    if (q.length < 2) {
      return res.json([]);
    }

    const matches = skills
      .filter(skill => skill.toLowerCase().includes(q.toLowerCase()))
      .slice(0, 10);

    res.json(matches);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
