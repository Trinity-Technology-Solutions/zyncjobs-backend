import express from 'express';
import fetch from 'node-fetch';

const router = express.Router();

router.post('/parse', async (req, res) => {
  try {
    const { base64Data } = req.body;
    
    if (!base64Data) {
      return res.status(400).json({ success: false, error: 'No PDF data provided' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    
    if (!apiKey) {
      return res.status(500).json({ success: false, error: 'API key not configured' });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: [{
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: base64Data
            }
          }, {
            type: 'text',
            text: `Parse this resume and extract information in JSON format:
{
  "personalInfo": {"name": "", "email": "", "phone": "", "location": ""},
  "summary": "",
  "skills": [],
  "experience": [{"title": "", "company": "", "duration": "", "description": "", "current": false}],
  "education": [{"degree": "", "institution": "", "duration": ""}],
  "projects": [],
  "certifications": [],
  "languages": []
}
Return ONLY the JSON object.`
          }]
        }]
      })
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`);
    }

    const data = await response.json();
    const textContent = data.content
      .filter(item => item.type === 'text')
      .map(item => item.text)
      .join('\n');

    const cleanedText = textContent.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsedData = JSON.parse(cleanedText);
    
    res.json({ success: true, data: parsedData });
  } catch (error) {
    console.error('Parse error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;