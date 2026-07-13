import aiClient from '../services/aiClient.js';
import crypto from 'crypto';

// In-memory cache: hash → { result, expires }
const parseCache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function hashText(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

export class ResumeParserAI {
  constructor() {
  }

  // Pre-extract name/email/phone from raw text using regex (handles multi-column PDFs)
  preExtract(resumeText) {
    // Email: standard pattern OR mailto prefix
    const emailMatch = resumeText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    // Phone: +91 followed by 10 digits, or standalone 10-digit Indian mobile (starts 6-9)
    const phoneMatch = resumeText.match(/(?:\+91[\s-]?)?[6-9]\d{9}/);
    const name = this.extractNameFromText(resumeText);
    return {
      name: name || '',
      email: emailMatch?.[0] || '',
      phone: phoneMatch?.[0] || ''
    };
  }

  buildPrompt(resumeText) {
    return `Extract resume data from this text and return ONLY valid JSON. The text may be scrambled due to multi-column PDF extraction - use smart pattern matching.

RESUME TEXT:
${resumeText.slice(0, 4000)}

EXTRACTION RULES:
- name: Look for ALL CAPS or Title Case full name (2-4 words). Examples: "ANTHONY GEORGE AGIL", "John Smith". NOT job titles.
- email: Find pattern like word@domain.com OR "mailto" prefix followed by text (e.g. "mailtoagilgeorge24" = email hint, look for actual email nearby)
- phone: Find 10-digit number or +91 followed by digits. NEVER put a year range like "2023-2024" as phone.
- location: City name only
- title: Job designation like "Full Stack Developer", "Software Engineer"
- skills: ALL technical skills, languages, frameworks mentioned
- workExperiences: Jobs/internships with company name, job title, dates, and bullet point descriptions
- educations: ONLY formal academic degrees/diplomas. Each entry MUST have a real institution name (college/university/school) in "school" field and a real degree/course name in "degree" field. NEVER put job descriptions, internship details, project names, or bullet points into education fields.
- projects: Project names with descriptions
- summary: Professional summary paragraph

Return JSON:
{"name":"","email":"","phone":"","location":"","country":"","title":"","summary":"","skills":[],"softSkills":[],"tools":[],"workExperiences":[{"jobTitle":"","company":"","date":"","descriptions":[]}],"educations":[{"degree":"","school":"","date":"","grade":""}],"projects":[{"name":"","description":""}],"certifications":[{"name":"","provider":"","date":""}],"competitions":[]}`;
  }

  async callAIAgent(prompt) {
    const result = await aiClient.suggest(prompt);
    return result.reply || null;
  }

  async parseResumeToProfile(resumeText) {
    const cacheKey = hashText(resumeText);
    const cached = parseCache.get(cacheKey);
    if (cached && Date.now() < cached.expires) {
      console.log('[RESUME_AI] Cache hit — skipping AI call');
      return cached.result;
    }

    const preExtracted = this.preExtract(resumeText);
    console.log('[RESUME_AI] Pre-extracted:', preExtracted);

    const prompt = this.buildPrompt(resumeText);
    let content = null;

    // Call AI agent (port 8001)
    try {
      console.log('[RESUME_AI] Calling AI agent...');
      content = await this.callAIAgent(prompt);
      if (content) console.log('[RESUME_AI] AI agent success');
    } catch (e) {
      console.warn('[RESUME_AI] AI agent failed:', e.message);
    }

    if (!content) {
      console.error('[RESUME_AI] All AI providers failed — using fallback');
      return this.getFallbackParsing(resumeText);
    }

    const result = this.parseAIResponse(content, resumeText, preExtracted);
    parseCache.set(cacheKey, { result, expires: Date.now() + CACHE_TTL });
    return result;
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

      // Always prefer preExtracted email/phone — regex is more reliable than AI on scrambled PDFs
      const email = preExtracted.email || parsed.email || '';
      const phone = preExtracted.phone || parsed.phone || '';
      // Validate phone — reject year ranges, short numbers
      const validPhone = /^[+\d][\d\s\-().]{7,}$/.test(phone) && !/^(19|20)\d{2}/.test(phone) ? phone : (preExtracted.phone || '');

      console.log('[RESUME_AI] Parsed successfully:', name, email);

      const isSentence = (s) =>
        !s || s.length > 100 ||
        /\b(developed|built|created|analyzed|implemented|designed|completed|worked|gained|contributed|internship|july|august|september|october|november|december|present|currently|involving|enabling|reducing|improving)\b/i.test(s) ||
        /^[a-z]/.test(s.trim());

      return {
        name,
        email,
        phone: validPhone,
        location: parsed.location || '',
        country: parsed.country || '',
        title: parsed.title || '',
        summary: parsed.summary || '',
        skills: Array.isArray(parsed.skills) ? parsed.skills : [],
        softSkills: Array.isArray(parsed.softSkills) ? parsed.softSkills : [],
        tools: Array.isArray(parsed.tools) ? parsed.tools : [],
        workExperiences: Array.isArray(parsed.workExperiences) ? parsed.workExperiences : [],
        educations: Array.isArray(parsed.educations)
          ? parsed.educations.filter(e => e && !isSentence(e.school) && !isSentence(e.degree) && (e.school || e.degree))
          : [],
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
    const NEXT_SECTION = /^(experience|work experience|employment|work history|education|academic|skills|technical skills|projects|certifications|awards|languages|interests|references|contact|internship|training|summary|objective|profile|about|extra.curricular|extracurricular|hackathons|short courses|competitions|workshops|volunteer|publications|research)s?$/i;
    const extractSection = (headingRe) => {
      const idx = lines.findIndex(l => headingRe.test(l));
      if (idx < 0) return [];
      const result = [];
      for (let i = idx + 1; i < lines.length; i++) {
        if (lines[i].trim() && NEXT_SECTION.test(lines[i].trim())) break;
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
      const gpaRe = /\b(gpa|cgpa|percentage|grade)[:\s]*([\d.]+)/i;
      const looksLikeHeader = (l) =>
        !(/^[•\-–*]/.test(l)) &&
        l.length > 3 && l.length < 120 &&
        !/^(developed|built|created|analyzed|implemented|designed|completed|worked|gained|proficient)/i.test(l);
      let cur = null;
      for (const line of eduLines) {
        const hasYear = yearRe.test(line);
        const gpaMatch = line.match(gpaRe);
        const isBullet = /^[•\-–*]/.test(line);
        if (gpaMatch && cur) {
          cur.grade = gpaMatch[2];
          if (hasYear && !cur.date) cur.date = line.match(yearRe)?.[0] || '';
          continue;
        }
        if (isBullet) {
          if (cur) { cur.descriptions = cur.descriptions || []; cur.descriptions.push(line.replace(/^[•\-–*]\s*/, '')); }
          continue;
        }
        if (!looksLikeHeader(line)) continue;
        if (!cur) {
          cur = { school: line.replace(yearRe, '').trim(), degree: '', date: hasYear ? (line.match(yearRe)?.[0] || '') : '', grade: '' };
        } else if (!cur.degree) {
          cur.degree = line.replace(yearRe, '').trim();
          if (hasYear && !cur.date) cur.date = line.match(yearRe)?.[0] || '';
        } else {
          if (cur.school) educations.push(cur);
          cur = { school: line.replace(yearRe, '').trim(), degree: '', date: hasYear ? (line.match(yearRe)?.[0] || '') : '', grade: '' };
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
