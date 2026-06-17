import express from 'express';
import mistralService from '../services/mistralService.js';
import { callGeminiChat } from '../services/geminiService.js';
import { callGroq } from '../services/groqService.js';

// Wrapper: tries Groq first (fastest), then Gemini, then OpenRouter
async function callAIGeminiFirst({ messages, systemPrompt, maxTokens = 800, temperature = 0.4, feature = 'default' }) {
  try {
    return await callGroq({ systemPrompt, messages, maxTokens, temperature, feature });
  } catch (groqErr) {
    console.warn('[AI] Groq failed, falling back to Gemini:', groqErr.message);
    try {
      return await callGeminiChat({ systemPrompt, messages, maxTokens, temperature });
    } catch (geminiErr) {
      console.warn('[AI] Gemini failed, falling back to OpenRouter:', geminiErr.message);
      return callAI({
        feature,
        messages: systemPrompt ? [{ role: 'system', content: systemPrompt }, ...messages] : messages,
        maxTokens,
        temperature,
      });
    }
  }
}

const router = express.Router();

// Job title suggestions
router.post('/job-titles', async (req, res) => {
  try {
    const { input } = req.body;
    if (!input || input.length < 1) return res.json({ suggestions: [] });

    const raw = await callGroq({
      feature: 'job-titles',
      messages: [{ role: 'user', content: `Suggest 5 relevant job titles that match or relate to "${input}". Return only the titles, one per line, no numbering or bullets.` }],
      maxTokens: 400,
      temperature: 0.4,
    });
    const suggestions = raw.split('\n').map(l => l.replace(/^[-•*\d.\s]+/, '').trim()).filter(l => l.length > 1).slice(0, 5);
    res.json({ suggestions });
  } catch (error) {
    console.error('Job title suggestions error:', error);
    res.json({ suggestions: [] });
  }
});

// Skill suggestions
router.post('/skills', async (req, res) => {
  try {
    const { input } = req.body;
    if (!input || input.length < 1) return res.json({ suggestions: [] });

    const raw = await callGroq({
      feature: 'skills',
      messages: [{ role: 'user', content: `Suggest 5 relevant skills that match or relate to "${input}". Return only the skill names, one per line, no numbering or bullets.` }],
      maxTokens: 400,
      temperature: 0.4,
    });
    const suggestions = raw.split('\n').map(l => l.replace(/^[-•*\d.\s]+/, '').trim()).filter(l => l.length > 1).slice(0, 5);
    res.json({ suggestions });
  } catch (error) {
    console.error('Skill suggestions error:', error);
    res.json({ suggestions: [] });
  }
});

// Location suggestions
router.post('/locations', async (req, res) => {
  try {
    const { input } = req.body;
    if (!input || input.length < 1) return res.json({ suggestions: [] });

    const raw = await callGroq({
      feature: 'locations',
      messages: [{ role: 'user', content: `Suggest 5 cities or locations that match or relate to "${input}". Include both Indian cities and "Remote" if relevant. Return only the location names, one per line, no numbering or bullets.` }],
      maxTokens: 400,
      temperature: 0.4,
    });
    const suggestions = raw.split('\n').map(l => l.replace(/^[-•*\d.\s]+/, '').trim()).filter(l => l.length > 1).slice(0, 5);
    res.json({ suggestions });
  } catch (error) {
    console.error('Location suggestions error:', error);
    res.json({ suggestions: [] });
  }
});

// Career Coach - Live AI Chat
router.post('/career-coach', async (req, res) => {
  try {
    const { messages, systemPrompt } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages are required' });
    }

    if (!process.env.GROQ_API_KEY) {
      return res.status(503).json({ error: 'AI service not configured' });
    }

    // Detect feature from systemPrompt to use correct model
    const isRecruiter = systemPrompt && systemPrompt.includes('Recruiter');
    const feature = isRecruiter ? 'ai-recruiter' : 'career-coach';

    let reply = '';
    try {
      reply = await callAIGeminiFirst({
        feature,
        systemPrompt: systemPrompt || 'You are a helpful AI career coach.',
        messages,
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

// Job description generation / AI reformat
router.post('/job-description', async (req, res) => {
  try {
    const { jobTitle, company, location, description, responsibilities, requirements } = req.body;

    if (!jobTitle) {
      return res.status(400).json({ error: 'Job title is required' });
    }

    // Build context from whatever the user has already entered
    const hasExistingContent = description || (responsibilities && responsibilities.length) || (requirements && requirements.length);

    let prompt;
    if (hasExistingContent) {
      const respList = Array.isArray(responsibilities) ? responsibilities.filter(Boolean).join('\n') : (responsibilities || '');
      const reqList  = Array.isArray(requirements)     ? requirements.filter(Boolean).join('\n')     : (requirements  || '');

      prompt = `You are an expert HR professional. Reformat and improve the following job description content into proper professional English.
DO NOT invent new content — only rewrite what is given, fixing grammar, clarity, and structure.
Return ONLY plain text using this exact structure (no markdown, no asterisks, no stars):

Job Summary
<2-3 sentence summary paragraph>

Key Responsibilities
• <responsibility 1>
• <responsibility 2>
(continue for all responsibilities)

Requirements
• <requirement 1>
• <requirement 2>
(continue for all requirements)

Use plain section headings and • for bullet points. Do not use **, *, or any markdown.

Job Title: ${jobTitle}${company ? `\nCompany: ${company}` : ''}${location ? `\nLocation: ${location}` : ''}
${description ? `\nDescription:\n${description}` : ''}
${respList ? `\nResponsibilities:\n${respList}` : ''}
${reqList ? `\nRequirements:\n${reqList}` : ''}`;
    } else {
      prompt = `You are an expert HR professional. Write a professional job description for the role below.
Return ONLY plain text using this exact structure (no markdown, no asterisks, no stars):

Job Summary
<2-3 sentence summary paragraph>

Key Responsibilities
• <responsibility 1>
• <responsibility 2>
• <responsibility 3>
• <responsibility 4>
• <responsibility 5>

Requirements
• <requirement 1>
• <requirement 2>
• <requirement 3>
• <requirement 4>
• <requirement 5>

Use plain section headings and • for bullet points. Do not use **, *, or any markdown.

Job Title: ${jobTitle}${company ? `\nCompany: ${company}` : ''}${location ? `\nLocation: ${location}` : ''}`;
    }

    let description_result;
    try {
      const raw = await callAIGeminiFirst({
        feature: 'default',
        systemPrompt: '',
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 900,
        temperature: 0.4,
      });
      // Strip any ** markdown the AI may still output despite instructions
      description_result = typeof raw === 'string'
        ? raw.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*\*([^*]+)\*/g, '$1').replace(/\*([^*]+)\*/g, '$1')
        : await mistralService.generateJobDescription(jobTitle, company, location);
    } catch (aiErr) {
      console.warn('AI unavailable for JD, using basic fallback:', aiErr.message);
      description_result = await mistralService.generateJobDescription(jobTitle, company, location);
    }

    // Always ensure description_result is a string
    if (typeof description_result !== 'string' || !description_result.trim()) {
      description_result = `We are looking for a ${jobTitle}${company ? ` at ${company}` : ''}${location ? ` in ${location}` : ''}. The ideal candidate will have relevant experience and skills for this role.`;
    }

    console.log('[JD] Final description type:', typeof description_result, '| length:', description_result.length);
    res.json({ description: description_result });
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

    if (!process.env.GROQ_API_KEY) {
      return res.json({ suggestions: [] });
    }

    const raw = await callGroq({
      feature: 'default',
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 500,
      temperature: 0.4,
    });
    const suggestions = raw.split('\n').map(l => l.replace(/^[-•*\d.\s]+/, '').trim()).filter(l => l.length > 1).slice(0, 8);
    res.json({ suggestions });
  } catch (error) {
    console.error('AI suggest error:', error);
    res.json({ suggestions: [] });
  }
});

export default router;
