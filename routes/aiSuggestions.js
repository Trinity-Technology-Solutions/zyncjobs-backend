import express from 'express';
import aiClient from '../services/aiClient.js';

const router = express.Router();

async function quickSuggest(prompt) {
  const result = await aiClient.suggest(prompt);
  return (result.reply || '').split('\n')
    .map(l => l.replace(/^[-•*\d.\s]+/, '').trim())
    .filter(l => l.length > 1)
    .slice(0, 5);
}

// Job title suggestions
router.post('/job-titles', async (req, res) => {
  try {
    const { input } = req.body;
    if (!input || input.length < 1) return res.json({ suggestions: [] });
    const suggestions = await quickSuggest(
      `Suggest 5 relevant job titles that match or relate to "${input}". Return only the titles, one per line, no numbering or bullets.`
    );
    res.json({ suggestions });
  } catch (error) {
    console.error('Job title suggestions error:', error.message);
    res.json({ suggestions: [] });
  }
});

// Skill suggestions
router.post('/skills', async (req, res) => {
  try {
    const { input } = req.body;
    if (!input || input.length < 1) return res.json({ suggestions: [] });
    const suggestions = await quickSuggest(
      `Suggest 5 relevant skills that match or relate to "${input}". Return only the skill names, one per line, no numbering or bullets.`
    );
    res.json({ suggestions });
  } catch (error) {
    console.error('Skill suggestions error:', error.message);
    res.json({ suggestions: [] });
  }
});

// Location suggestions
router.post('/locations', async (req, res) => {
  try {
    const { input } = req.body;
    if (!input || input.length < 1) return res.json({ suggestions: [] });
    const suggestions = await quickSuggest(
      `Suggest 5 cities or locations that match or relate to "${input}". Include Indian cities and "Remote" if relevant. Return only location names, one per line.`
    );
    res.json({ suggestions });
  } catch (error) {
    console.error('Location suggestions error:', error.message);
    res.json({ suggestions: [] });
  }
});

// Career Coach
router.post('/career-coach', async (req, res) => {
  try {
    const { messages, systemPrompt } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0)
      return res.status(400).json({ error: 'Messages are required' });

    const lastMsg = messages[messages.length - 1]?.content || '';
    const context = systemPrompt ? `${systemPrompt}\n\n${lastMsg}` : lastMsg;

    try {
      const result = await aiClient.chat(context);
      return res.json({ reply: result.reply });
    } catch (e) {
      console.warn('[career-coach] AI agent failed:', e.message);
      if (systemPrompt) return res.status(503).json({ error: 'AI service temporarily unavailable.' });
      return res.json({ reply: 'I\'m here to help with your career! Ask me about resumes, interviews, salary negotiation, or job search.' });
    }
  } catch (error) {
    console.error('Career coach error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Job description generation
router.post('/job-description', async (req, res) => {
  try {
    const { jobTitle, company, location, description, responsibilities, requirements } = req.body;
    if (!jobTitle) return res.status(400).json({ error: 'Job title is required' });

    try {
      const result = await aiClient.generateJD(jobTitle, '', [], company || '', location || '');
      let desc = result.job_description || '';
      if (desc) {
        desc = desc.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1');
        desc = desc.replace(/^#{1,6}\s*(.*)$/gm, '$1').replace(/\n{3,}/g, '\n\n').trim();
        if (company) desc = desc.replace(/our\s+company/gi, company);
        return res.json({ description: desc });
      }
    } catch (e) {
      console.warn('[job-description] AI agent failed:', e.message);
    }

    return res.json({ description: `We are looking for a ${jobTitle}${company ? ` at ${company}` : ''}${location ? ` in ${location}` : ''}.` });
  } catch (error) {
    console.error('Job description generation error:', error.message);
    res.status(500).json({ error: 'Failed to generate job description' });
  }
});

// Generic suggest proxy
router.post('/suggest', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.json({ suggestions: [] });
    const suggestions = await quickSuggest(prompt);
    res.json({ suggestions });
  } catch (error) {
    console.error('AI suggest error:', error.message);
    res.json({ suggestions: [] });
  }
});

export default router;
