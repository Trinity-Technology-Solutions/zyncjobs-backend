import express from 'express';
import { callGroq } from '../services/groqService.js';

const router = express.Router();

// POST /api/parse-linkedin - Parse LinkedIn profile text with AI
router.post('/parse-linkedin', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || text.length < 50) {
      return res.status(400).json({ error: 'Please provide valid LinkedIn profile text' });
    }

    const prompt = `Parse this LinkedIn profile text and extract structured data in JSON format.

LinkedIn Profile Text:
${text}

Extract and return ONLY valid JSON with this exact structure (no markdown, no explanation):
{
  "name": "Full Name",
  "email": "email if found or empty string",
  "phone": "phone if found or empty string",
  "location": "City, State/Country",
  "headline": "Current job title and company",
  "summary": "About/Summary section",
  "experience": [{"title": "Job Title","company": "Company Name","duration": "Jan 2020 - Present","description": "Job description"}],
  "education": [{"school": "University Name","degree": "Degree Name","field": "Field of Study","year": "2020"}],
  "skills": ["Skill1", "Skill2"],
  "certifications": ["Cert1"],
  "languages": ["English"]
}`;

    const raw = await callGroq({ feature: 'resume-parse', messages: [{ role: 'user', content: prompt }], maxTokens: 1000 });
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Failed to extract JSON from AI response');
    res.json(JSON.parse(jsonMatch[0]));
  } catch (error) {
    console.error('LinkedIn parsing error:', error);
    res.status(500).json({ error: 'Failed to parse LinkedIn profile' });
  }
});

export default router;
