import axios from 'axios';
import crypto from 'crypto';

// In-memory cache: hash → { result, expires }
const parseCache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function hashText(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

export class ResumeParserAI {
  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY;
    this.model = 'meta-llama/llama-3.3-70b-instruct:free';
  }

  // Pre-extract name/email/phone from raw text using regex (handles multi-column PDFs)
  preExtract(resumeText) {
    const emailMatch = resumeText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const phoneMatch = resumeText.match(/(?:\+91[\s-]?)?[6-9]\d{9}|(?:\+\d{1,3}[\s-]?)?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{4}/);
    const name = this.extractNameFromText(resumeText);
    return {
      name: name || '',
      email: emailMatch?.[0] || '',
      phone: phoneMatch?.[0] || ''
    };
  }

  async parseResumeToProfile(resumeText) {
    // Check cache first — same resume text returns instantly
    const cacheKey = hashText(resumeText);
    const cached = parseCache.get(cacheKey);
    if (cached && Date.now() < cached.expires) {
      console.log('[RESUME_AI] Cache hit — skipping AI call');
      return cached.result;
    }

    if (!this.apiKey) {
      console.error('[RESUME_AI] OPENROUTER_API_KEY is not set');
      return this.getFallbackParsing(resumeText);
    }

    // Pre-extract critical fields before AI (handles multi-column/scrambled PDFs)
    const preExtracted = this.preExtract(resumeText);
    console.log('[RESUME_AI] Pre-extracted:', preExtracted);

    const prompt = `You are an expert resume parser. Extract ALL information accurately from the resume text below and return ONLY a valid JSON object. No explanation, no markdown, no code blocks — just raw JSON.

RESUME TEXT:
${resumeText.substring(0, 5000)}

IMPORTANT RULES:
- "name" must be the PERSON'S FULL NAME only — it is usually the largest/first text on the resume, often in ALL CAPS or Title Case (e.g. "AUGUSTIN F", "John Smith", "Priya Ramesh")
- NEVER put a job title, role, or designation in "name" field (e.g. "Software Developer", "Data Analyst", "Vice President" are NOT names)
- If the name appears in ALL CAPS like "AUGUSTIN F" or "JOHN SMITH", still put it in "name" field as-is
- "title" must be the job role/designation (e.g. "Software Developer", "Data Analyst") — NOT the person's name
- Extract the EXACT email, phone as written
- For location: extract the city name only (e.g. "Chennai", "Bangalore", "Mumbai")
- For country: infer from city/address (e.g. Chennai → "India", London → "United Kingdom", New York → "United States")
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
      
      const freeModels = [
        'openai/gpt-oss-120b:free',
        'openai/gpt-oss-20b:free',
        'nvidia/nemotron-3-super-120b-a12b:free',
        'moonshotai/kimi-k2.6:free',
        'google/gemma-4-31b-it:free',
        'google/gemma-4-26b-a4b-it:free',
        'nvidia/nemotron-3-nano-30b-a3b:free',
        'nvidia/nemotron-nano-9b-v2:free',
        'qwen/qwen3-next-80b-a3b-instruct:free',
        'z-ai/glm-4.5-air:free',
        'meta-llama/llama-3.3-70b-instruct:free',
      ];

      let content = null;
      for (const model of freeModels) {
        try {
          const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            { model, messages: [{ role: 'user', content: prompt }], temperature: 0.1, max_tokens: 2000 },
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
          content = response.data?.choices?.[0]?.message?.content;
          if (content) { console.log('[RESUME_AI] Success with model:', model); break; }
        } catch (modelErr) {
          const status = modelErr.response?.status;
          console.warn('[RESUME_AI] Model failed:', model, status || modelErr.message);
          // On 429 just try next model immediately — no wait
        }
      }
      if (!content) {
        console.error('[RESUME_AI] All models failed or returned empty response');
        return this.getFallbackParsing(resumeText);
      }

      console.log('[RESUME_AI] Raw AI response:', content.substring(0, 300));
      const result = this.parseAIResponse(content, resumeText, preExtracted);
      parseCache.set(cacheKey, { result, expires: Date.now() + CACHE_TTL });
      return result;
    } catch (error) {
      console.error('[RESUME_AI] OpenRouter call failed:', error.response?.data || error.message);
      return this.getFallbackParsing(resumeText);
    }
  }

  isLikelyName(str) {
    if (!str || str.length < 2 || str.length > 60) return false;
    const roleKeywords = /\b(developer|engineer|designer|manager|analyst|intern|architect|consultant|director|president|vice|lead|head|officer|coordinator|specialist|associate|executive|founder|co-founder|student|fresher|graduate|software|full.?stack|front.?end|back.?end|data|devops|cloud|mobile|web|senior|junior|mid|entry)\b/i;
    if (roleKeywords.test(str)) return false;
    // Must contain only letters, spaces, dots, hyphens — no special chars like –, /, &
    if (/[–—/&@,()\d]/.test(str)) return false;
    return true;
  }

  parseAIResponse(content, resumeText = '', preExtracted = {}) {
    try {
      const cleaned = content.trim().replace(/```json|```/g, '').trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found in response');

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate AI-returned name — prefer preExtracted if AI got it wrong
      let name = parsed.name || '';
      const toTitleCase = s => s.replace(/\b\w+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
      const normalizedName = name === name.toUpperCase() && name.length > 1 ? toTitleCase(name) : name;
      const nameIsValid = this.isLikelyName(normalizedName);

      if (!nameIsValid) {
        // Try title field if AI swapped name/title
        if (parsed.title) {
          const titleCased = toTitleCase(parsed.title.trim());
          if (this.isLikelyName(titleCased)) { name = titleCased; parsed.title = ''; }
        }
        // Fall back to preExtracted regex result
        if (!this.isLikelyName(name)) name = preExtracted.name || '';
        // Last resort: scan text
        if (!name) name = this.extractNameFromText(resumeText);
      } else {
        name = normalizedName;
      }

      // Always normalize ALL CAPS to Title Case
      if (name && name === name.toUpperCase()) name = toTitleCase(name);

      // Use preExtracted email/phone if AI missed them (common in multi-column PDFs)
      const email = parsed.email || preExtracted.email || '';
      const phone = parsed.phone || preExtracted.phone || '';

      console.log('[RESUME_AI] Parsed successfully:', name, email);

      return {
        name,
        email,
        phone,
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

  extractNameFromText(resumeText = '') {
    const lines = resumeText.split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines.slice(0, 12)) {
      // Strip pipe/dash separated contact info
      const stripped = line.split(/[|•·]/)[0].trim();
      // Normalize ALL CAPS to Title Case for matching
      const normalized = stripped === stripped.toUpperCase() && stripped.length > 1
        ? stripped.replace(/\b\w+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        : stripped;
      if (
        normalized.length >= 2 &&
        normalized.length < 50 &&
        this.isLikelyName(normalized) &&
        /^[A-Z][a-z]/.test(normalized) &&
        /^[A-Za-z][a-zA-Z.'\- ]+(\s[A-Za-z][a-zA-Z.'\-]+)*$/.test(normalized) &&
        !/^(name|email|phone|address|contact|resume|curriculum|vitae|profile|objective|summary|skills|experience|education)$/i.test(normalized)
      ) {
        return normalized;
      }
    }
    return '';
  }

  getFallbackParsing(resumeText = '') {
    console.warn('[RESUME_AI] Using fallback regex parsing');

    const emailMatch = resumeText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const phoneMatch = resumeText.match(/(?:\+91[\s-]?)?[6-9]\d{9}/);
    const name = this.extractNameFromText(resumeText);
    const lines = resumeText.split('\n').map(l => l.trim()).filter(Boolean);

    // Location
    const cities = ['Chennai','Bangalore','Bengaluru','Mumbai','Hyderabad','Pune','Delhi','Noida','Gurgaon','Kolkata','Ahmedabad','Coimbatore','Kochi','Jaipur','Indore','Bhopal','Nagpur','Surat','Lucknow','Visakhapatnam','Mysore','Madurai','Trichy','Vellore','Pondicherry'];
    let location = '';
    for (const city of cities) {
      if (new RegExp(`\\b${city}\\b`, 'i').test(resumeText)) { location = city; break; }
    }

    // Skills — broad keyword list covering this resume's domain
    const techKeywords = [
      'JavaScript','TypeScript','Python','Java','React','Angular','Vue','Node.js','Express',
      'Django','Flask','Spring','SQL','MySQL','PostgreSQL','MongoDB','Redis','AWS','Azure',
      'GCP','Docker','Kubernetes','Git','HTML','CSS','REST','GraphQL','C++','C#','PHP',
      'Ruby','Go','Rust','Kotlin','Swift','Flutter','TensorFlow','PyTorch','Pandas','NumPy',
      'Selenium','Jenkins','Terraform','Linux','Agile','Scrum',
      'Power BI','PowerBI','Excel','Tableau','Hadoop','Spark','Hive','Kafka',
      'Machine Learning','Deep Learning','Data Analysis','Data Science','NLP',
      'R','MATLAB','Statistics','Probability','OpenCV','Scikit-learn',
    ];
    const skills = techKeywords.filter(k => {
      const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`\\b${escaped}\\b`, 'i').test(resumeText);
    });

    // Section extractor helper
    const NEXT_SECTION = /^(experience|work|education|skills|projects|certifications|awards|languages|interests|references|contact|internship|training|summary|objective|profile|about)/i;
    const extractSection = (headingRe) => {
      const idx = lines.findIndex(l => headingRe.test(l));
      if (idx < 0) return [];
      const result = [];
      for (let i = idx + 1; i < lines.length; i++) {
        if (i !== idx + 1 && NEXT_SECTION.test(lines[i]) && lines[i].length < 35) break;
        if (lines[i].trim()) result.push(lines[i].trim());
      }
      return result;
    };

    // Work experiences
    const expLines = extractSection(/^(work\s+)?(experience|employment|history)$/i);
    const workExperiences = [];
    if (expLines.length > 0) {
      let cur = null;
      for (const line of expLines) {
        if (!cur) { cur = { jobTitle: '', company: line, date: '', descriptions: [] }; }
        else if (!cur.jobTitle && !/^[•\-–]/.test(line)) { cur.jobTitle = line; }
        else if (/^[•\-–]/.test(line)) { cur.descriptions.push(line.replace(/^[•\-–]\s*/, '')); }
      }
      if (cur?.company) workExperiences.push(cur);
    }

    // Education
    const eduLines = extractSection(/^education/i);
    const educations = [];
    if (eduLines.length > 0) {
      const yearRe = /\b(19|20)\d{2}\b/;
      let cur = null;
      for (const line of eduLines) {
        if (/^\s*(19|20)\d{2}\s*$/.test(line)) {
          if (cur && !cur.date) cur.date = line.trim();
          continue;
        }
        if (!cur) {
          cur = { school: line, degree: '', date: yearRe.test(line) ? (line.match(yearRe)?.[0] || '') : '' };
        } else if (!cur.degree) {
          cur.degree = line.replace(yearRe, '').trim();
          if (yearRe.test(line) && !cur.date) cur.date = line.match(yearRe)?.[0] || '';
        } else if (line.length > 10 && !yearRe.test(line)) {
          if (cur.school) educations.push(cur);
          cur = { school: line, degree: '', date: '' };
        } else if (yearRe.test(line) && !cur.date) {
          cur.date = line.match(yearRe)?.[0] || '';
        }
      }
      if (cur?.school) educations.push(cur);
    }

    // Projects
    const projLines = extractSection(/^(personal\s+|academic\s+)?projects?$/i);
    const projects = [];
    if (projLines.length > 0) {
      let cur = null;
      for (const line of projLines) {
        const isBullet = /^[•\-–]/.test(line);
        const isDesc = /^(developed|built|created|analyzed|implemented|designed|completed|worked|gained)/i.test(line);
        if (!isBullet && !isDesc && line.length > 3 && (!cur || cur.description.length > 0)) {
          if (cur) projects.push(cur);
          cur = { name: line, description: '' };
        } else if (cur) {
          cur.description += (cur.description ? ' ' : '') + line.replace(/^[•\-–]\s*/, '');
        }
      }
      if (cur) projects.push(cur);
    }

    // Certifications
    const certLines = extractSection(/^certifications?$/i);
    const certifications = certLines
      .filter(l => l.length > 3)
      .map(l => ({ name: l.replace(/^[•\-–]\s*/, ''), provider: '', date: '' }));

    // Summary
    const summaryLines = extractSection(/^(summary|objective|profile)$/i);
    const summary = summaryLines.join(' ').trim();

    // Title: first non-name, non-contact line after name
    let title = '';
    const nameIdx = lines.findIndex(l => l.trim() === name || l.trim().toUpperCase() === (name || '').toUpperCase());
    for (const line of lines.slice(Math.max(0, nameIdx), nameIdx + 6)) {
      if (line !== name && !line.includes('@') && !line.match(/^[+\d]/) && line.length > 3 && line.length < 80
          && !line.match(/^(http|www)/i) && !line.match(/\d{5,}/)) {
        title = line; break;
      }
    }

    return {
      name, email: emailMatch?.[0] || '', phone: phoneMatch?.[0] || '',
      location, country: location ? 'India' : '', title, summary,
      skills, softSkills: [], tools: [],
      workExperiences, educations, projects, certifications, competitions: []
    };
  }
}

export const resumeParser = new ResumeParserAI();
