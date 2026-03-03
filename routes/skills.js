import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load skills data
let skillsData = [];
try {
  const skillsPath = path.join(__dirname, '../data/skills.json');
  const rawData = fs.readFileSync(skillsPath, 'utf8');
  const data = JSON.parse(rawData);
  skillsData = data.skills || [];
} catch (error) {
  console.error('Error loading skills data:', error);
}

// GET /api/skills - Get all skills
router.get('/', (req, res) => {
  res.json({ skills: skillsData });
});

// GET /api/skills/search/:query - Search skills
router.get('/search/:query', (req, res) => {
  try {
    const query = req.params.query.toLowerCase();
    const filteredSkills = skillsData.filter(skill => 
      skill.toLowerCase().includes(query)
    ).slice(0, 10);
    
    res.json({ skills: filteredSkills });
  } catch (error) {
    console.error('Skills search error:', error);
    res.json({ skills: [] });
  }
});

export default router;
