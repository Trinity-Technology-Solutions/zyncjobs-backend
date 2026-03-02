import express from 'express';
import mistralService from '../services/mistralService.js';

const router = express.Router();

// Job title suggestions
router.post('/job-titles', async (req, res) => {
  try {
    const { input } = req.body;
    
    if (!input || input.length < 1) {
      return res.json({ suggestions: [] });
    }

    const suggestions = await mistralService.generateJobTitleSuggestions(input);
    res.json({ suggestions });
  } catch (error) {
    console.error('Job title suggestions error:', error);
    // Return fallback suggestions instead of error
    const fallbackSuggestions = mistralService.getFallbackJobTitles(input);
    res.json({ suggestions: fallbackSuggestions });
  }
});

// Skill suggestions
router.post('/skills', async (req, res) => {
  try {
    const { input } = req.body;
    
    if (!input || input.length < 1) {
      return res.json({ suggestions: [] });
    }

    const suggestions = await mistralService.generateSkillSuggestions(input);
    res.json({ suggestions });
  } catch (error) {
    console.error('Skill suggestions error:', error);
    // Return fallback suggestions instead of error
    const fallbackSuggestions = mistralService.getFallbackSkills(input);
    res.json({ suggestions: fallbackSuggestions });
  }
});

// Location suggestions
router.post('/locations', async (req, res) => {
  try {
    const { input } = req.body;
    
    if (!input || input.length < 1) {
      return res.json({ suggestions: [] });
    }

    const suggestions = await mistralService.generateLocationSuggestions(input);
    res.json({ suggestions });
  } catch (error) {
    console.error('Location suggestions error:', error);
    // Return fallback suggestions instead of error
    const fallbackSuggestions = mistralService.getFallbackLocations(input);
    res.json({ suggestions: fallbackSuggestions });
  }
});

// Job description generation
router.post('/job-description', async (req, res) => {
  try {
    const { jobTitle, company, location } = req.body;
    
    if (!jobTitle) {
      return res.status(400).json({ error: 'Job title is required' });
    }

    const description = await mistralService.generateJobDescription(jobTitle, company, location);
    res.json({ description });
  } catch (error) {
    console.error('Job description generation error:', error);
    res.status(500).json({ error: 'Failed to generate job description' });
  }
});

export default router;