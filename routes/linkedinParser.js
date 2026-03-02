import express from 'express';
import fetch from 'node-fetch';

const router = express.Router();

// POST /api/parse-linkedin - Parse LinkedIn profile text with AI
router.post('/parse-linkedin', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || text.length < 50) {
      return res.status(400).json({ error: 'Please provide valid LinkedIn profile text' });
    }

    // Call Mistral AI via OpenRouter to parse LinkedIn text
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
  "experience": [
    {
      "title": "Job Title",
      "company": "Company Name",
      "duration": "Jan 2020 - Present",
      "description": "Job description and achievements"
    }
  ],
  "education": [
    {
      "school": "University Name",
      "degree": "Degree Name",
      "field": "Field of Study",
      "year": "2020"
    }
  ],
  "skills": ["Skill1", "Skill2", "Skill3"],
  "certifications": ["Cert1", "Cert2"],
  "languages": ["English", "Spanish"]
}`;

    const mistralResponse = await fetch(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: process.env.OPENROUTER_MODEL || 'mistralai/mistral-7b-instruct',
          messages: [{ role: 'user', content: prompt }]
        })
      }
    );

    const mistralData = await mistralResponse.json();
    const aiResponse = mistralData.choices[0].message.content;

    // Extract JSON from response
    let jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from AI response');
    }

    const parsedData = JSON.parse(jsonMatch[0]);

    console.log('✅ LinkedIn profile parsed successfully');
    res.json(parsedData);

  } catch (error) {
    console.error('❌ LinkedIn parsing error:', error);
    res.status(500).json({ error: 'Failed to parse LinkedIn profile' });
  }
});

export default router;
