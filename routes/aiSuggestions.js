import express from 'express';
import mistralService from '../services/mistralService.js';
import { callAI } from '../services/openRouterService.js';

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

    // Detect feature from systemPrompt to use correct model
    const isRecruiter = systemPrompt && systemPrompt.includes('Recruiter');
    const feature = isRecruiter ? 'ai-recruiter' : 'career-coach';

    let reply = '';
    try {
      reply = await callAI({
        feature,
        messages: [
          { role: 'system', content: systemPrompt || 'You are a helpful AI career coach.' },
          ...messages
        ],
        maxTokens: 700,
      });
    } catch (e) {
      console.warn('callAI failed:', e.message);
    }

    if (!reply) {
      // Only use keyword fallback for casual career chat (no systemPrompt override)
      // If systemPrompt is provided it means it's a structured task (mock interview, roadmap etc)
      if (systemPrompt && systemPrompt !== 'You are ZyncJobs AI Career Coach — a friendly, expert career advisor. Give concise, actionable advice on career planning, resume writing, interview prep, skill gaps, salary negotiation, and job search. Keep responses clear and encouraging. Use bullet points. Max 3-4 short paragraphs.') {
        return res.status(503).json({ error: 'AI service temporarily unavailable. Please try again.' });
      }
      const lastMsg = messages[messages.length - 1]?.content?.toLowerCase() || '';
      if (lastMsg.includes('resume') || lastMsg.includes('cv')) {
        reply = 'For a strong resume: tailor it to each job description, use action verbs, quantify achievements (e.g. "increased sales by 30%"), keep it to 1-2 pages, and ensure ATS-friendly formatting with standard section headings.';
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

// Generic prompt → suggestions proxy (used by frontend aiSuggestions.ts)
router.post('/suggest', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.json({ suggestions: [] });

    if (!process.env.OPENROUTER_API_KEY) {
      return res.json({ suggestions: [] });
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.FRONTEND_URL || 'http://localhost:5173',
        'X-Title': 'ZyncJobs'
      },
      body: JSON.stringify({
        model: 'google/gemma-3-4b-it:free',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200,
        temperature: 0.7
      })
    });

    if (!response.ok) return res.json({ suggestions: [] });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const suggestions = content.split('\n').map(l => l.replace(/^[-•*\d.]+\s*/, '').trim()).filter(l => l.length > 1).slice(0, 8);
    res.json({ suggestions });
  } catch (error) {
    console.error('AI suggest error:', error);
    res.json({ suggestions: [] });
  }
});

export default router;
