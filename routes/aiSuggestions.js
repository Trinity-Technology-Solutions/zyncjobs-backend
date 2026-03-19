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

// Career Coach - Live AI Chat
router.post('/career-coach', async (req, res) => {
  try {
    const { messages, systemPrompt } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages are required' });
    }

    if (!process.env.OPENROUTER_API_KEY) {
      return res.status(503).json({ error: 'AI service not configured' });
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.FRONTEND_URL || 'http://localhost:5173',
        'X-Title': 'ZyncJobs-CareerCoach'
      },
      body: JSON.stringify({
        model: 'mistralai/mistral-7b-instruct:free',
        messages: [
          { role: 'system', content: systemPrompt || 'You are a helpful AI career coach.' },
          ...messages
        ],
        max_tokens: 700,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('OpenRouter error:', response.status, err);
      return res.status(502).json({ error: 'AI service error' });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || '';

    if (!reply) return res.status(502).json({ error: 'Empty AI response' });

    res.json({ reply });
  } catch (error) {
    console.error('Career coach error:', error);
    res.status(500).json({ error: error.message });
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