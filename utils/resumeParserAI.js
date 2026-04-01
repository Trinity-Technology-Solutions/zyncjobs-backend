import axios from 'axios';

export class ResumeParserAI {
  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY;
    this.model = 'openai/gpt-3.5-turbo';
  }

  async parseResumeToProfile(resumeText) {
    if (!this.apiKey) {
      console.error('[RESUME_AI] OPENROUTER_API_KEY is not set');
      return this.getFallbackParsing(resumeText);
    }

    const prompt = `You are an expert resume parser. Extract ALL information accurately from the resume text below and return ONLY a valid JSON object. No explanation, no markdown, no code blocks — just raw JSON.

RESUME TEXT:
${resumeText.substring(0, 5000)}

IMPORTANT RULES:
- Extract the EXACT name, email, phone as written
- For location: extract the city name only (e.g. "Chennai", "Bangalore", "Mumbai")
- For country: infer from city/address (e.g. Chennai → "India", London → "United Kingdom", New York → "United States")
- For title: use the most recent job title or the role they are applying for
- For skills: extract ALL technical skills, programming languages, frameworks, tools mentioned
- For workExperiences: extract ALL jobs with accurate dates
- For educations: extract ALL degrees with school names and years

Return this exact JSON structure (use empty string "" or empty array [] if not found):
{
  "name": "candidate full name",
  "email": "email address",
  "phone": "phone number with country code if present",
  "location": "city name only",
  "country": "country name inferred from city/address",
  "title": "current or most recent job title",
  "summary": "professional summary 2-3 lines",
  "skills": ["skill1", "skill2"],
  "softSkills": ["soft skill1"],
  "tools": ["tool1", "tool2"],
  "workExperiences": [
    {
      "jobTitle": "job title",
      "company": "company name",
      "date": "date range e.g. 04/2023 - 05/2023",
      "descriptions": ["what they did"]
    }
  ],
  "educations": [
    {
      "degree": "degree name e.g. B.Tech Information Technology",
      "school": "college or school name",
      "date": "year range e.g. 2021-2025",
      "grade": "CGPA or percentage"
    }
  ],
  "projects": [
    {
      "name": "project name",
      "description": "what the project does"
    }
  ],
  "certifications": [
    {
      "name": "certification name",
      "provider": "provider e.g. Udemy, Coursera",
      "date": "date"
    }
  ],
  "competitions": ["competition name 1", "competition name 2"]
}`;

    try {
      console.log('[RESUME_AI] Calling OpenRouter with model:', this.model);
      const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: this.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 2000
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.FRONTEND_URL || 'http://localhost:5173',
            'X-Title': 'ZyncJobs-Resume-Parser'
          },
          timeout: 30000
        }
      );

      const content = response.data?.choices?.[0]?.message?.content;
      if (!content) {
        console.error('[RESUME_AI] Empty response from OpenRouter:', JSON.stringify(response.data));
        return this.getFallbackParsing(resumeText);
      }

      console.log('[RESUME_AI] Raw AI response:', content.substring(0, 300));
      return this.parseAIResponse(content, resumeText);
    } catch (error) {
      console.error('[RESUME_AI] OpenRouter call failed:', error.response?.data || error.message);
      return this.getFallbackParsing(resumeText);
    }
  }

  parseAIResponse(content, resumeText = '') {
    try {
      const cleaned = content.trim().replace(/```json|```/g, '').trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found in response');

      const parsed = JSON.parse(jsonMatch[0]);
      console.log('[RESUME_AI] Parsed successfully:', parsed.name, parsed.email);

      return {
        name: parsed.name || '',
        email: parsed.email || '',
        phone: parsed.phone || '',
        location: parsed.location || '',
        country: parsed.country || '',
        title: parsed.title || '',
        summary: parsed.summary || '',
        skills: Array.isArray(parsed.skills) ? parsed.skills : [],
        softSkills: Array.isArray(parsed.softSkills) ? parsed.softSkills : [],
        tools: Array.isArray(parsed.tools) ? parsed.tools : [],
        workExperiences: Array.isArray(parsed.workExperiences) ? parsed.workExperiences : [],
        educations: Array.isArray(parsed.educations) ? parsed.educations : [],
        projects: Array.isArray(parsed.projects) ? parsed.projects : [],
        certifications: Array.isArray(parsed.certifications) ? parsed.certifications : [],
        competitions: Array.isArray(parsed.competitions) ? parsed.competitions : [],
      };
    } catch (error) {
      console.error('[RESUME_AI] Failed to parse AI JSON response:', error.message);
      return this.getFallbackParsing(resumeText);
    }
  }

  getFallbackParsing(resumeText = '') {
    console.warn('[RESUME_AI] Using fallback regex parsing');
    const emailMatch = resumeText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const phoneMatch = resumeText.match(/[+]?[6-9]\d{9}/);
    return {
      name: '', email: emailMatch?.[0] || '', phone: phoneMatch?.[0] || '',
      location: '', country: '', title: '', summary: '',
      skills: [], softSkills: [], tools: [],
      workExperiences: [], educations: [],
      projects: [], certifications: [], competitions: []
    };
  }
}

export const resumeParser = new ResumeParserAI();
