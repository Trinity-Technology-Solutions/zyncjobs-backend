import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = express.Router();

// Load datasets
const jobTitlesData = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/job_titles.json')));
const skillsData = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/skills.json')));
const locationsData = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/locations.json')));

function filterList(list, q) {
  if (!q || q.length < 1) return [];
  q = q.toLowerCase();
  return list.filter(item => item.toLowerCase().includes(q)).slice(0, 10);
}

router.get('/suggest', async (req, res) => {
  try {
    const { q, type } = req.query;
    console.log('Suggest API called with:', { q, type });

    if (!q || q.length < 1) {
      return res.json({ suggestions: [] });
    }

    let dataset = jobTitlesData.job_titles;
    if (type === 'skill') dataset = skillsData.skills;
    if (type === 'location') dataset = locationsData.locations;

    const suggestions = filterList(dataset, q);
    console.log(`Found ${suggestions.length} suggestions for "${q}" in ${type}:`, suggestions);
    
    res.json({ suggestions });
  } catch (error) {
    console.error('Suggest error:', error);
    res.status(500).json({ error: 'Failed to get suggestions' });
  }
});

export default router;