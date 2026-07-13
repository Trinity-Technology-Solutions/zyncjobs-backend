import express from 'express';
import aiClient from '../services/aiClient.js';

const router = express.Router();

// POST /api/parse-linkedin
router.post('/parse-linkedin', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || text.length < 50)
      return res.status(400).json({ error: 'Please provide valid LinkedIn profile text' });

    const prompt = `Parse this LinkedIn profile text and extract structured data in JSON format.

LinkedIn Profile Text:
${text}

Extract and return ONLY valid JSON with this exact structure (no markdown, no explanation):
{"name":"","email":"","phone":"","location":"","headline":"","summary":"","experience":[{"title":"","company":"","duration":"","description":""}],"education":[{"school":"","degree":"","field":"","year":""}],"skills":[],"certifications":[],"languages":[]}`;

    const result = await aiClient.suggest(prompt);
    const raw = result.reply || '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Failed to extract JSON from AI response');
    res.json(JSON.parse(jsonMatch[0]));
  } catch (error) {
    console.error('LinkedIn parsing error:', error.message);
    res.status(500).json({ error: 'Failed to parse LinkedIn profile' });
  }
});

export default router;
