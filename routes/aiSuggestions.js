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

    const MODELS = [
      'google/gemma-3-4b-it:free',
      'google/gemma-3-12b-it:free',
      'mistralai/mistral-small-3.1-24b-instruct:free',
      'qwen/qwen3-4b:free',
      'meta-llama/llama-3.2-3b-instruct:free',
    ];

    let reply = '';
    for (const model of MODELS) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.FRONTEND_URL || 'http://localhost:5173',
            'X-Title': 'ZyncJobs-CareerCoach'
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: systemPrompt || 'You are a helpful AI career coach.' },
              ...messages
            ],
            max_tokens: 700,
            temperature: 0.7
          })
        });
        clearTimeout(timeout);
        if (response.ok) {
          const data = await response.json();
          reply = data.choices?.[0]?.message?.content || '';
          if (reply) break;
        } else {
          const err = await response.text();
          console.warn(`Model ${model} failed (${response.status}):`, err.substring(0, 100));
        }
      } catch (e) {
        console.warn(`Model ${model} error:`, e.message);
      }
    }

    if (!reply) {
      // Fallback: rule-based career coach response
      const lastMsg = messages[messages.length - 1]?.content?.toLowerCase() || '';
      if (lastMsg.includes('resume') || lastMsg.includes('cv')) {
        reply = 'For a strong resume: tailor it to each job description, use action verbs, quantify achievements (e.g. "increased sales by 30%"), keep it to 1-2 pages, and ensure ATS-friendly formatting with standard section headings.';
      } else if (lastMsg.includes('interview')) {
        reply = 'To ace interviews: research the company thoroughly, prepare STAR-method answers for behavioral questions, practice common technical questions for your role, prepare 3-5 questions to ask the interviewer, and follow up with a thank-you email within 24 hours.';
      } else if (lastMsg.includes('salary') || lastMsg.includes('negotiat')) {
        reply = 'For salary negotiation: research market rates on Glassdoor/LinkedIn, wait for the employer to give a number first, counter with a range where your target is the bottom, and always negotiate — most employers expect it.';
      } else if (lastMsg.includes('skill') || lastMsg.includes('learn')) {
        reply = 'To grow your skills: identify gaps by reading job descriptions for your target role, use free resources like freeCodeCamp, Coursera, or official docs, build real projects to demonstrate skills, and contribute to open source for visibility.';
      } else if (lastMsg.includes('find') || lastMsg.includes('job search') || lastMsg.includes('search') || lastMsg.includes('apply') || lastMsg.includes('application')) {
        reply = 'To find jobs faster:\n\n• Set up job alerts on LinkedIn, Naukri, and ZyncJobs for your target role\n• Apply within 24-48 hours of posting — early applicants get more responses\n• Tailor your resume keywords to each job description\n• Reach out directly to hiring managers on LinkedIn after applying\n• Track all applications in a spreadsheet to follow up on time\n• Aim to apply to 5-10 quality jobs per day rather than mass applying';
      } else {
        reply = 'I\'m here to help with your career! I can advise on resumes, interview preparation, salary negotiation, skill development, and job search strategies. What specific area would you like guidance on?';
      }
    }

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