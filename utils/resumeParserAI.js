import axios from 'axios';

// Mistral AI Resume Parser for Profile Auto-Fill
export class ResumeParserAI {
  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY;
    this.model = 'mistralai/mistral-7b-instruct';
  }

  async parseResumeToProfile(resumeText) {
    const prompt = `Extract candidate profile information from this resume. Respond with ONLY valid JSON.

RESUME CONTENT:
"${resumeText.substring(0, 2000)}"

EXTRACT THESE FIELDS:
- name: Full name of candidate
- email: Email address
- phone: Phone number
- location: Current location/city
- title: Current job title or desired position
- experience: Years of experience (number)
- skills: Array of technical skills
- education: Highest education degree
- summary: Brief professional summary (2-3 lines)
- workExperience: Latest job experience
- certifications: Any certifications mentioned

JSON FORMAT (respond with ONLY this JSON):
{
  "name": "John Doe",
  "email": "john@example.com", 
  "phone": "+1234567890",
  "location": "San Francisco, CA",
  "title": "Software Engineer",
  "experience": 5,
  "skills": ["JavaScript", "React", "Node.js", "Python"],
  "education": "Bachelor's in Computer Science",
  "summary": "Experienced software engineer with 5+ years in full-stack development. Passionate about creating scalable web applications.",
  "workExperience": "Senior Developer at Tech Corp (2020-2024)",
  "certifications": ["AWS Certified", "Google Cloud Professional"]
}`;

    try {
      const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 600
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.FRONTEND_URL,
          'X-Title': 'ZyncJobs-Resume-Parser'
        }
      });

      return this.parseAIResponse(response.data.choices[0].message.content);
    } catch (error) {
      console.error('Mistral resume parsing error:', error.message);
      return this.getFallbackParsing(resumeText);
    }
  }

  parseAIResponse(content) {
    try {
      const cleaned = content.trim().replace(/```json|```/g, '');
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          name: parsed.name || '',
          email: parsed.email || '',
          phone: parsed.phone || '',
          location: parsed.location || '',
          title: parsed.title || '',
          experience: Number(parsed.experience) || 0,
          skills: Array.isArray(parsed.skills) ? parsed.skills : [],
          education: parsed.education || '',
          summary: parsed.summary || '',
          workExperience: parsed.workExperience || '',
          certifications: Array.isArray(parsed.certifications) ? parsed.certifications : []
        };
      }
      
      throw new Error('No valid JSON found');
    } catch (error) {
      return this.getFallbackParsing();
    }
  }

  getFallbackParsing(resumeText = '') {
    // Only extract what's actually found in the resume
    const lines = resumeText.split('\n').filter(line => line.trim());
    
    // Extract name (only if clearly identifiable)
    let name = '';
    const namePattern = /^[A-Z][a-z]+ [A-Z][a-z]+/;
    for (const line of lines.slice(0, 5)) {
      if (namePattern.test(line.trim()) && !line.includes('@') && !line.includes('http')) {
        name = line.trim();
        break;
      }
    }
    
    // Extract email (only if found)
    const emailMatch = resumeText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const email = emailMatch ? emailMatch[0] : '';
    
    // Extract phone (only if found)
    const phoneMatch = resumeText.match(/[\+]?[1-9]?[\d\s\-\(\)]{10,}/);
    const phone = phoneMatch ? phoneMatch[0].replace(/\s+/g, '') : '';
    
    // Extract location (look for city, state patterns)
    const locationMatch = resumeText.match(/([A-Z][a-z]+,\s*[A-Z]{2})|([A-Z][a-z]+\s+[A-Z][a-z]+,\s*[A-Z]{2})/i);
    const location = locationMatch ? locationMatch[0] : '';
    
    // Extract skills (only if mentioned in resume)
    const skillKeywords = ['JavaScript', 'Python', 'Java', 'React', 'Node.js', 'SQL', 'HTML', 'CSS', 'Git', 'AWS', 'Docker', 'Angular', 'Vue', 'PHP', 'C++', 'C#'];
    const skills = skillKeywords.filter(skill => 
      resumeText.toLowerCase().includes(skill.toLowerCase())
    );
    
    // Extract experience years (only if mentioned)
    const expMatch = resumeText.match(/(\d+)\+?\s*years?\s*(of\s*)?experience/i);
    const experience = expMatch ? parseInt(expMatch[1]) : 0;
    
    // Extract education (look for degree patterns)
    const educationMatch = resumeText.match(/(Bachelor|Master|PhD|B\.S\.|M\.S\.|B\.A\.|M\.A\.).*?(in|of)\s+([A-Za-z\s]+)/i);
    const education = educationMatch ? educationMatch[0] : '';
    
    // Extract job title (look for common title patterns)
    const titleMatch = resumeText.match(/(Software Engineer|Developer|Manager|Analyst|Designer|Consultant|Specialist)/i);
    const title = titleMatch ? titleMatch[0] : '';
    
    return {
      name: name || '',
      email: email || '',
      phone: phone || '',
      location: location || '',
      title: title || '',
      experience: experience,
      skills: skills,
      education: education || '',
      summary: '',
      workExperience: '',
      certifications: []
    };
  }
}

export const resumeParser = new ResumeParserAI();