import aiClient from '../services/aiClient.js';
import crypto from 'crypto';

// In-memory cache: hash → { result, expires }
const parseCache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

const MAX_LABELED_TEXT = 12000; // chars of labeled text sent to the AI

// Section headings — anchored (full-line) so company names never false-match
const SECTION_HEADINGS = [
  { re: /^(summary|professional summary|profile|career summary|objective|career objective|about me|personal profile)$/i, name: 'SUMMARY' },
  { re: /^(work experience|professional experience|experience|employment history|work history|employment|career history|work)$/i, name: 'EXPERIENCE' },
  { re: /^(internships?|internship training|industrial training|training|teaching experience)$/i, name: 'INTERNSHIPS' },
  { re: /^(education|academic qualifications?|academic background|academic details|qualifications?|educational qualification)$/i, name: 'EDUCATION' },
  { re: /^(technical skills|skills|skills summary|core skills|key skills|technologies|tech stack|skills[\s&/]+technologies)$/i, name: 'SKILLS' },
  { re: /^(projects?|academic projects?|personal projects?|major projects?|project work)$/i, name: 'PROJECTS' },
  { re: /^(certifications?|licenses?|licences?|certificates|courses?|professional development)$/i, name: 'CERTIFICATIONS' },
  { re: /^(languages|language proficiency|language skills)$/i, name: 'LANGUAGES' },
  { re: /^(awards?|honors?|honours?|achievements?|accomplishments?|recognitions?)$/i, name: 'AWARDS' },
  { re: /^(contact|contact information|personal details|personal information)$/i, name: 'CONTACT' },
  { re: /^(extra.?curricular|co.?curricular|volunteer(ing)?|interests|hobbies|activities)$/i, name: 'EXTRACURRICULAR' },
  { re: /^(publications?|research( work)?|papers?|patents?)$/i, name: 'PUBLICATIONS' },
  { re: /^(declaration|references|additional information)$/i, name: 'OTHER' },
];

const INDIAN_CITIES = [
  'Chennai', 'Bangalore', 'Bengaluru', 'Mumbai', 'Hyderabad', 'Pune', 'Delhi', 'New Delhi', 'Noida', 'Gurgaon', 'Gurugram',
  'Kolkata', 'Ahmedabad', 'Coimbatore', 'Kochi', 'Jaipur', 'Indore', 'Bhopal', 'Nagpur', 'Surat', 'Lucknow', 'Visakhapatnam',
  'Vizag', 'Mysore', 'Mysuru', 'Madurai', 'Trichy', 'Tiruchirappalli', 'Vellore', 'Pondicherry', 'Puducherry', 'Thiruvananthapuram',
  'Trivandrum', 'Kozhikode', 'Salem', 'Erode', 'Tirupur', 'Chandigarh', 'Kanpur', 'Agra', 'Varanasi', 'Patna', 'Ranchi',
  'Bhubaneswar', 'Guwahati', 'Dehradun', 'Raipur', 'Vijayawada', 'Guntur', 'Nellore', 'Kakinada', 'Warangal', 'Aurangabad',
  'Nashik', 'Amritsar', 'Jalandhar', 'Ludhiana', 'Goa', 'Panaji', 'Mangalore', 'Mangaluru', 'Belgaum', 'Hubli', 'Udaipur',
  'Jodhpur', 'Rajkot', 'Vadodara', 'Jamshedpur', 'Siliguri', 'Durgapur', 'Meerut', 'Ghaziabad', 'Faridabad',
];

const TECH_KEYWORDS = [
  'JavaScript', 'TypeScript', 'Python', 'Java', 'React', 'React.js', 'ReactJS', 'Angular', 'Vue', 'Node.js', 'Node',
  'Express', 'Express.js', 'Django', 'Flask', 'Spring', 'Spring Boot', 'SQL', 'MySQL', 'PostgreSQL', 'Postgres',
  'MongoDB', 'Redis', 'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'K8s', 'Git', 'GitHub', 'GitLab', 'HTML',
  'HTML5', 'CSS', 'CSS3', 'REST', 'REST API', 'GraphQL', 'C++', 'C#', 'PHP', 'Ruby', 'Go', 'Rust', 'Kotlin', 'Swift',
  'Flutter', 'React Native', 'TensorFlow', 'PyTorch', 'Pandas', 'NumPy', 'Selenium', 'Jenkins', 'Terraform', 'Linux',
  'Agile', 'Scrum', 'Jira', 'Power BI', 'PowerBI', 'Excel', 'Tableau', 'Hadoop', 'Spark', 'Hive', 'Kafka',
  'Machine Learning', 'Deep Learning', 'Data Analysis', 'Data Science', 'NLP', 'Natural Language Processing',
  'R', 'MATLAB', 'Statistics', 'Probability', 'OpenCV', 'Scikit-learn', 'Scikit', 'Keras', 'FastAPI', 'Docker Compose',
  'CI/CD', 'Microservices', 'RabbitMQ', 'Elasticsearch', 'Cassandra', 'Oracle', 'SQLite', 'Firebase', 'Tailwind',
  'Bootstrap', 'Redux', 'Next.js', 'NextJS', 'Vite', 'Webpack', 'Babel', 'Jest', 'Cypress', 'Playwright', 'Mocha',
  'Chai', 'Postman', 'Swagger', 'OAuth', 'JWT', 'WebSockets', 'Socket.io', 'Three.js', 'D3.js', 'Chart.js',
  'Unity', 'Unreal', 'Blender', 'Photoshop', 'Illustrator', 'Figma', 'Adobe XD', 'UI/UX', 'User Experience',
  'User Research', 'Wireframing', 'Prototyping', 'Usability Testing', 'Git Bash', 'Shell Scripting', 'Bash',
  'Powershell', 'SAP', 'Salesforce', 'Workday', 'ServiceNow', 'Tableau Desktop', 'Alteryx', 'Snowflake', 'Databricks',
];

const SKILL_STOPWORDS = new Set([
  'etc', 'and', 'or', 'the', 'a', 'an', 'with', 'without', 'of', 'in', 'to', 'for', 'on', 'at', 'by', 'is', 'are',
  'was', 'were', 'know', 'knowledge', 'good', 'great', 'excellent', 'advanced', 'intermediate', 'basic', 'beginner',
  'proficient', 'familiar', 'experienced', 'strong', 'hands-on', 'handson', 'working', 'development', 'technology',
  'technologies', 'tools', 'frameworks', 'library', 'libraries', 'using', 'use', 'like', 'including', 'such',
  'skills', 'skill', 'ability', 'able', 'well', 'versatile', 'sure', 'lots', 'many', 'various', 'etc.', 'knowledge',
  'exposure', 'certified', 'certification', 'training', 'experience', 'expert', 'expertise',
]);

function hashText(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

export class ResumeParserAI {
  constructor() {
  }

  // ── Section detection ─────────────────────────────────────────
  isHeading(line) {
    const t = line.trim().replace(/[:•\-–*#]+$/, '').trim();
    if (!t || t.length > 45) return null;
    if (/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(t)) return null;
    if (/\d{3,}/.test(t)) return null; // dates / years / phone → not a heading
    const allCaps = t === t.toUpperCase() && t.length > 2;
    const titleCase = /^[A-Z][a-z]+(\s[A-Z][a-z]+){1,5}$/.test(t) || /^[A-Z][a-z]+(\s(and|&)\s[A-Z][a-z]+)+$/.test(t);
    if (!allCaps && !titleCase) return null;
    for (const h of SECTION_HEADINGS) {
      if (h.re.test(t)) return h.name;
    }
    return null;
  }

  splitIntoSections(text) {
    const lines = text.split('\n').map(l => l.trim());
    const sections = [];
    let cur = { heading: 'HEADER', body: [] };
    for (const line of lines) {
      if (!line.trim()) continue;
      const h = this.isHeading(line);
      if (h) {
        if (cur.body.length) sections.push(cur);
        cur = { heading: h, body: [] };
      } else {
        cur.body.push(line);
      }
    }
    if (cur.body.length) sections.push(cur);
    return sections;
  }

  // Rebuild the resume text with [SECTION] markers so the AI never misreads layout
  sectionLabelText(text) {
    const sections = this.splitIntoSections(text);
    const parts = sections.map(s =>
      s.heading === 'HEADER' ? s.body.join('\n') : `[${s.heading}]\n${s.body.join('\n')}`
    );
    let labeled = parts.join('\n\n');
    if (labeled.length > MAX_LABELED_TEXT) labeled = labeled.slice(0, MAX_LABELED_TEXT);
    return labeled;
  }

  // ── AI call ───────────────────────────────────────────────────
  async callAIAgent(resumeText) {
    const labeled = this.sectionLabelText(resumeText);
    const result = await aiClient.parseResume(labeled);
    if (result && typeof result === 'object') {
      return JSON.stringify(result);
    }
    return null;
  }

  // ── Regex pre-extraction (RULE ENGINE — runs first, wins for contact fields) ──
  preExtract(resumeText) {
    const emailMatch = resumeText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    let phoneMatch = resumeText.match(/(?:\+91[\s-]?)?[6-9]\d{9}/);
    if (!phoneMatch) {
      // Spaced/dashed numbers like "+91 98765 43210" — match on a compacted copy
      const compact = resumeText.replace(/[\s\-().]/g, '');
      const m = compact.match(/(?:\+91)?[6-9]\d{9}/);
      if (m) phoneMatch = [m[0]];
    }
    const name = this.extractNameFromText(resumeText);
    const dobMatch = resumeText.match(/(?:dob|date\s*of\s*birth|birth\s*date|born\s*(?:on)?)\s*[:.\-]?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*,?\s*\d{4})/i);
    return {
      name: name || '',
      email: emailMatch?.[0] || '',
      phone: phoneMatch?.[0] || '',
      dob: dobMatch?.[1] || '',
      location: this.extractLocation(resumeText),
      skills: this.extractSkillsFallback(resumeText),
    };
  }

  extractLocation(resumeText) {
    for (const city of INDIAN_CITIES) {
      if (new RegExp(`\\b${city}\\b`, 'i').test(resumeText)) {
        return city === 'Bengaluru' ? 'Bangalore' : city === 'Mysuru' ? 'Mysore' : city === 'Tiruchirappalli' ? 'Trichy' : city === 'Vizag' ? 'Visakhapatnam' : city === 'Gurugram' ? 'Gurgaon' : city === 'New Delhi' ? 'Delhi' : city === 'Trivandrum' ? 'Thiruvananthapuram' : city;
      }
    }
    return '';
  }

  extractSkillsFallback(resumeText) {
    const found = [];
    for (const kw of TECH_KEYWORDS) {
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`\\b${escaped.replace(/\//g, '\\/')}\\b`, 'i').test(resumeText)) found.push(kw);
    }
    return found;
  }

  // ── AI call ───────────────────────────────────────────────────
  async callAIAgent(resumeText) {
    const labeled = this.sectionLabelText(resumeText);
    const result = await aiClient.parseResume(labeled);
    if (result && typeof result === 'object') {
      return JSON.stringify(result);
    }
    return null;
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

    let content = null;

    // Call AI agent (port 8001) with section-labeled text + schema instructions
    try {
      console.log('[RESUME_AI] Calling AI agent...');
      content = await this.callAIAgent(resumeText);
      if (content) console.log('[RESUME_AI] AI agent success');
    } catch (e) {
      console.warn('[RESUME_AI] AI agent failed:', e.message);
    }

    if (!content) {
      console.error('[RESUME_AI] All AI providers failed — using fallback');
      return this.getFallbackParsing(resumeText);
    }

    let result = this.parseAIResponse(content, resumeText, preExtracted);

    // One focused retry when critical fields are missing (AI often misses name/email on first pass)
    if (!result.name || !result.email) {
      console.log('[RESUME_AI] Missing critical fields — one focused retry');
      try {
        const retryContent = await this.callAIAgent(resumeText);
        if (retryContent) {
          const retryResult = this.parseAIResponse(retryContent, resumeText, preExtracted);
          if (!result.name && retryResult.name) result.name = retryResult.name;
          if (!result.email && retryResult.email) result.email = retryResult.email;
          if (!result.phone && retryResult.phone) result.phone = retryResult.phone;
          if (!result.dob && retryResult.dob) result.dob = retryResult.dob;
          if (!result.location && retryResult.location) result.location = retryResult.location;
          if (!result.skills.length && retryResult.skills.length) result.skills = retryResult.skills;
        }
      } catch { /* keep first pass */ }
    }

    parseCache.set(cacheKey, { result, expires: Date.now() + CACHE_TTL });
    return result;
  }

  isLikelyName(str) {
    if (!str || str.length < 2 || str.length > 60) return false;
    const roleKeywords = /\b(developer|engineer|designer|manager|analyst|intern|architect|consultant|director|president|vice|lead|head|officer|coordinator|specialist|associate|executive|founder|co-founder|student|fresher|graduate|software|full.?stack|front.?end|back.?end|data|devops|cloud|mobile|web|senior|junior|mid|entry|trainee|recruiter|hr|ceo|cto|ceo|principal|staff)\b/i;
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

      const isSentence = (s) =>
        !s || s.length > 100 ||
        /\b(developed|built|created|analyzed|implemented|designed|completed|worked|gained|contributed|internship|july|august|september|october|november|december|present|currently|involving|enabling|reducing|improving)\b/i.test(s) ||
        /^[a-z]/.test(s.trim());

      // Clean & validate skills (drop noise words, dedupe case-insensitively)
      const cleanSkills = (raw) => {
        if (!Array.isArray(raw)) return [];
        return raw
          .map(s => String(s || '').trim().replace(/^[•\-–*\d.\s]+/, '').trim())
          .filter(s => {
            const t = s.replace(/[^a-zA-Z0-9+#.\-]/g, '');
            const lower = s.toLowerCase();
            return t.length >= 2 && t.length <= 35
              && !SKILL_STOPWORDS.has(lower)
              && !/^\d+$/.test(t)
              && !/\b(developer|engineer|designer|manager|analyst|intern|lead|senior|junior|trainee|student|architect|consultant|specialist|associate|executive|head|officer|coordinator|director|technician|operator|executive)\b/i.test(s);
          })
          .filter((s, i, a) => a.findIndex(x => x.toLowerCase() === s.toLowerCase()) === i);
      };

      // Validate work experience entries — must have a title or a company, no sentences
      const cleanWork = (raw) => {
        if (!Array.isArray(raw)) return [];
        return raw.filter(e => {
          if (!e || typeof e !== 'object') return false;
          const title = String(e.jobTitle || e.title || e.role || '').trim();
          const company = String(e.company || '').trim();
          return (title || company) && !isSentence(title) && !isSentence(company);
        });
      };

      const skills = cleanSkills(parsed.skills);
      const finalSkills = skills.length ? skills : (Array.isArray(preExtracted.skills) ? preExtracted.skills : []);
      const location = String(parsed.location || preExtracted.location || '').trim();

      // AI often misplaces student internships into workExperiences — relocate by title
      let workExperiences = cleanWork(parsed.workExperiences);
      let internships = cleanWork(parsed.internships);
      if (!internships.length && workExperiences.length) {
        const moved = [];
        const kept = [];
        for (const w of workExperiences) {
          if (/\b(intern|trainee|apprentice|industrial training|co-?op|teaching assistant)\b/i.test(w.jobTitle || '')) moved.push(w);
          else kept.push(w);
        }
        if (moved.length) {
          workExperiences = kept;
          internships = moved;
        }
      }

      // Section-based fallback for fields the AI often misses (awards, languages)
      const sectionItems = (heading) => {
        const sec = this.splitIntoSections(resumeText).find(s => s.heading === heading);
        if (!sec) return [];
        return sec.body
          .flatMap(l => l.split(/[,|•\-–]/))
          .map(l => l.replace(/^[•\-–\s]+/, '').replace(/\([^)]*\)/g, '').trim())
          .filter(l => l && l.length > 1 && l.length < 60 && !/^\d{2,4}$/.test(l));
      };
      let languages = cleanSkills(parsed.languages);
      if (!languages.length) languages = sectionItems('LANGUAGES');
      let awards = cleanSkills(parsed.awards);
      if (!awards.length) awards = sectionItems('AWARDS');

      // Normalize ALL-CAPS titles to Title Case
      let title = String(parsed.title || '').trim().slice(0, 80);
      if (title && title === title.toUpperCase()) title = toTitleCase(title);

      console.log('[RESUME_AI] Parsed successfully:', name, email, `| skills: ${finalSkills.length}`);

      return {
        name,
        email,
        phone: validPhone,
        dob: preExtracted.dob || parsed.dob || '',
        location,
        country: parsed.country || (location && !parsed.country ? 'India' : ''),
        title,
        summary: String(parsed.summary || '').trim(),
        skills: finalSkills,
        softSkills: Array.isArray(parsed.softSkills) ? parsed.softSkills : [],
        tools: Array.isArray(parsed.tools) ? parsed.tools : [],
        workExperiences,
        internships,
        educations: Array.isArray(parsed.educations)
          ? parsed.educations.filter(e => e && !isSentence(e.school) && !isSentence(e.degree) && (e.school || e.degree))
          : [],
        projects: (Array.isArray(parsed.projects) ? parsed.projects : []).map(pr => ({
          name: String(pr?.name || pr?.projectName || pr?.title || '').trim(),
          description: String(pr?.description || (Array.isArray(pr?.descriptions) ? pr.descriptions.join(' ') : '') || '').trim(),
        })),
        certifications: Array.isArray(parsed.certifications) ? parsed.certifications : [],
        languages,
        awards,
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
      // Skip contact/URL lines entirely
      if (line.includes('@') || /^(http|www\.|linkedin|github|acme|xyz)/i.test(line) || /^\+?91/.test(line) || /^\d/.test(line)) continue;
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
    let phoneMatch = resumeText.match(/(?:\+91[\s-]?)?[6-9]\d{9}/);
    if (!phoneMatch) {
      const compact = resumeText.replace(/[\s\-().]/g, '');
      const m = compact.match(/(?:\+91)?[6-9]\d{9}/);
      if (m) phoneMatch = [m[0]];
    }
    const name = this.extractNameFromText(resumeText);
    const lines = resumeText.split('\n').map(l => l.trim()).filter(Boolean);
    const location = this.extractLocation(resumeText);
    const skills = this.extractSkillsFallback(resumeText);

    // URL/profile-link line detector (covers "linkedin.com/in/x", "github.com/x", etc.)
    const isUrlLine = (l) =>
      /^(https?:\/\/|www\.)/i.test(l) ||
      /(linkedin|github|gitlab|twitter|instagram|facebook|stackoverflow|behance|dribbble|portfolio|medium|youtube|calendly|indeed|naukri)\.(com|in|dev|io|org|net|me|co)\b/i.test(l) ||
      /^[\w-]+\.(com|in|io|dev|org|net|me|co)\b/i.test(l);

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

    // Generic job-block parser (used for both work and internships)
    // Handles both formats:
    //   "Web Development Intern | Trinitech Solutions, Chennai | Jun 2023 - Aug 2023"
    //   "Software Engineer\nInfosys, Chennai\n2020 - Present\n- bullet..."
    const parseJobBlocks = (sectionLines) => {
      const out = [];
      let cur = null;
      const flush = () => { if (cur && (cur.jobTitle || cur.company || cur.date)) out.push(cur); };
      const isDateRange = (l) =>
        /^[•\-–]/.test(l) ? false :
        (/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*\d{4}\s*[-–]\s*(present|current|now|(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*\d{4})/i.test(l) ||
         /^\d{1,2}\s*[\/\-.]\s*\d{1,2}\s*[\/\-.]\s*\d{2,4}\s*[-–]\s*\d{1,2}\s*[\/\-.]\s*\d{1,2}\s*[\/\-.]\s*\d{2,4}/.test(l) ||
         /^(19|20)\d{2}\s*[-–]\s*((19|20)\d{2}|present|current)$/i.test(l));
      for (const line of sectionLines) {
        const isBullet = /^[•\-–]/.test(line);
        if (isUrlLine(line)) {
          if (isBullet && cur) cur.descriptions.push(line.replace(/^[•\-–]\s*/, ''));
          continue;
        }
        const parts = line.split(/\s*\|\s*/).map(s => s.trim());
        const hasPipes = parts.length >= 2 && parts[0].length < 60;
        if (isBullet) {
          if (cur) cur.descriptions.push(line.replace(/^[•\-–]\s*/, ''));
          continue;
        }
        if (hasPipes) {
          flush();
          cur = { jobTitle: parts[0], company: parts[1] || '', date: parts[2] || '', descriptions: [] };
          continue;
        }
        if (isDateRange(line)) {
          if (cur && !cur.date) { cur.date = line; continue; }
          flush();
          cur = { jobTitle: '', company: '', date: line, descriptions: [] };
          continue;
        }
        if (!cur) { cur = { jobTitle: line, company: '', date: '', descriptions: [] }; continue; }
        if (!cur.jobTitle) { cur.jobTitle = line; continue; }
        if (!cur.company && !isDateRange(line)) { cur.company = line; continue; }
        if (!cur.date && isDateRange(line)) { cur.date = line; continue; }
        if (cur.jobTitle && cur.company) { cur.descriptions.push(line); continue; }
        cur.descriptions.push(line);
      }
      flush();
      return out;
    };

    // Work experiences
    const workExperiences = parseJobBlocks(extractSection(/^(work\s+)?(experience|employment|history)$/i));
    // Internships
    const internships = parseJobBlocks(extractSection(/^(internships?|industrial training|training)$/i));

    // Education — handles pipe format "Degree | School | Year | Score" and separate lines
    const eduLines = extractSection(/^education/i);
    const educations = [];
    if (eduLines.length > 0) {
      const yearRe = /\b(19|20)\d{2}\b/;
      const gpaRe = /\b(cgpa|gpa|percentage|score|aggregate|grade|%)\b[\s:]*([\d.]+%?)/i;
      const looksLikeHeader = (l) =>
        !(/^[•\-–*]/.test(l)) &&
        !isUrlLine(l) &&
        l.length > 3 && (l.includes('|') ? l.length < 200 : l.length < 120) &&
        !/^(developed|built|created|analyzed|implemented|designed|completed|worked|gained|proficient|relevant coursework)/i.test(l);
      const push = () => { if (cur && (cur.school || cur.degree)) educations.push(cur); };
      let cur = null;
      for (const raw of eduLines) {
        const line = raw.replace(/^[•\-–*\d.)\s]+/, '').trim();
        if (!line || !looksLikeHeader(line)) continue;
        const parts = line.split(/\s*\|\s*/).map(s => s.trim()).filter(Boolean);
        const hasYear = yearRe.test(line);
        const year = line.match(yearRe)?.[0] || '';
        const gradeMatch = line.match(gpaRe);
        if (parts.length >= 2) {
          push();
          cur = {
            degree: parts[0],
            school: parts.slice(1).find(p => !yearRe.test(p) && !gpaRe.test(p)) || parts[1],
            date: parts.find(p => yearRe.test(p) && !gpaRe.test(p)) || '',
            grade: gradeMatch?.[2] || '',
          };
          continue;
        }
        if (!cur) {
          cur = { school: line.replace(yearRe, '').replace(gpaRe, '').replace(/[|,]+$/, '').trim(), degree: '', date: year, grade: gradeMatch?.[2] || '' };
        } else if (!cur.degree && !hasYear) {
          cur.degree = line.replace(yearRe, '').trim();
        } else if (!cur.date && hasYear) {
          cur.date = year;
          if (gradeMatch?.[2] && !cur.grade) cur.grade = gradeMatch[2];
        } else {
          push();
          cur = { school: line.replace(yearRe, '').trim(), degree: '', date: year, grade: gradeMatch?.[2] || '' };
        }
      }
      push();
    }

    // Projects
    const projLines = extractSection(/^(personal\s+|academic\s+)?projects?$/i);
    const projects = [];
    if (projLines.length > 0) {
      let cur = null;
      for (const line of projLines) {
        const isBullet = /^[•\-–]/.test(line);
        if (!isBullet && isUrlLine(line)) continue;
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

    // Languages
    const langLines = extractSection(/^languages?$/i);
    const languages = langLines
      .flatMap(l => l.split(/[,|•\-–]/))
      .map(l => l.replace(/\([^)]*\)/g, '').trim())
      .filter(l => l && l.length > 1 && l.length < 25);

    // Awards / achievements
    const awardLines = extractSection(/^(awards?|honors?|honours?|achievements?|accomplishments?|recognitions?)$/i);
    const awards = awardLines
      .flatMap(l => l.split(/[,|•\-–]/))
      .map(l => l.replace(/^[•\-–\s]+/, '').replace(/\([^)]*\)/g, '').trim())
      .filter(l => l && l.length > 1 && l.length < 60);

    // Summary
    const summaryLines = extractSection(/^(summary|objective|profile)$/i);
    const summary = summaryLines.join(' ').trim();

    // Title: first non-name, non-contact line after name
    let title = '';
    const nameIdx = lines.findIndex(l => l.trim().toUpperCase() === (name || '').toUpperCase());
    for (const line of lines.slice(Math.max(0, nameIdx), nameIdx + 6)) {
      const isNameLine = line.trim().toUpperCase() === (name || '').toUpperCase();
      if (!isNameLine && !line.includes('@') && !line.match(/^[+\d]/) && !isUrlLine(line)
          && line.length > 3 && line.length < 80
          && !line.match(/^(http|www)/i) && !line.match(/\d{5,}/)) {
        title = line; break;
      }
    }
    if (title && title === title.toUpperCase()) {
      title = title.replace(/\b\w+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    }

    return {
      name, email: emailMatch?.[0] || '', phone: phoneMatch?.[0] || '',
      dob: '', location, country: location ? 'India' : '', title, summary,
      skills, softSkills: [], tools: [],
      workExperiences, internships, educations, projects, certifications,
      languages, awards, competitions: []
    };
  }
}

export const resumeParser = new ResumeParserAI();