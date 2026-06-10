import express from 'express';
import multer from 'multer';
import pdfTextExtractor from '../services/pdfTextExtractor.js';
import { withCache, cacheGet, cacheSet } from '../services/redisService.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    cb(null, allowed.includes(file.mimetype) ? true : new Error('Only PDF/DOC allowed'));
  }
});

// ─── RULE-BASED SCORING ENGINE ───────────────────────────────────────────────

const scoreContactInfo = (text) => {
  let score = 0;
  if (/[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(text)) score += 30;       // email
  if (/(\+?\d[\d\s\-().]{7,}\d)/.test(text)) score += 25;           // phone
  if (/linkedin\.com\/in\//i.test(text)) score += 25;               // linkedin
  if (/github\.com\//i.test(text)) score += 10;                     // github
  if (/\b(bangalore|chennai|mumbai|delhi|hyderabad|pune|remote|\w+ city)\b/i.test(text)) score += 10; // location
  return Math.min(score, 100);
};

const scoreSummary = (text) => {
  const summaryMatch = text.match(
    /(?:summary|objective|profile|about me|career objective)[:\s\n]+([\s\S]{80,600})/i
  );
  if (!summaryMatch) return 0;
  const summary = summaryMatch[1];
  let score = 40; // has summary
  if (summary.length > 150) score += 20;
  if (summary.length > 300) score += 20;
  if (/\d+\s*(?:years?|yrs?)/i.test(summary)) score += 10; // mentions experience years
  if (/(?:passionate|experienced|skilled|proficient|expertise)/i.test(summary)) score += 10;
  return Math.min(score, 100);
};

const scoreExperience = (text) => {
  let score = 0;
  // Has experience section
  if (/(?:experience|employment|work history|career)[:\s\n]/i.test(text)) score += 20;
  // Job titles
  const titleMatches = text.match(/(?:engineer|developer|analyst|manager|designer|consultant|intern|lead|architect|specialist)/gi) || [];
  score += Math.min(titleMatches.length * 10, 30);
  // Date ranges (2019-2022 or Jan 2020 - Mar 2023)
  const dateMatches = text.match(/(?:\d{4}\s*[-–]\s*(?:\d{4}|present|current)|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{4})/gi) || [];
  score += Math.min(dateMatches.length * 8, 24);
  // Bullet points / action verbs
  const actionVerbs = text.match(/\b(?:developed|built|designed|led|managed|improved|increased|reduced|created|implemented|deployed|optimized|collaborated|delivered)\b/gi) || [];
  score += Math.min(actionVerbs.length * 2, 16);
  // Quantified achievements
  const numbers = text.match(/\b\d+%|\b\d+x\b|\$\d+|\d+\s*(?:million|thousand|users|clients)/gi) || [];
  score += Math.min(numbers.length * 5, 10);
  return Math.min(score, 100);
};

const scoreSkills = (text) => {
  let score = 0;
  if (/(?:skills|technologies|tech stack|tools)[:\s\n]/i.test(text)) score += 20;
  // Count recognizable tech skills
  const techSkills = [
    'javascript','typescript','python','java','react','angular','vue','node','express',
    'django','flask','spring','sql','mysql','postgresql','mongodb','redis','aws','azure',
    'gcp','docker','kubernetes','git','html','css','tailwind','graphql','rest','api',
    'machine learning','deep learning','tensorflow','pytorch','figma','jira','agile','scrum'
  ];
  const found = techSkills.filter(s => new RegExp(`\\b${s}\\b`, 'i').test(text));
  score += Math.min(found.length * 5, 60);
  // Soft skills
  if (/(?:communication|teamwork|leadership|problem.solving|analytical)/i.test(text)) score += 10;
  // Certifications
  if (/(?:certified|certification|aws certified|google certified|microsoft certified)/i.test(text)) score += 10;
  return Math.min(score, 100);
};

const scoreEducation = (text) => {
  let score = 0;
  if (/(?:education|academic|qualification)[:\s\n]/i.test(text)) score += 20;
  if (/(?:bachelor|b\.?e|b\.?tech|b\.?sc|b\.?com|b\.?a\b)/i.test(text)) score += 25;
  if (/(?:master|m\.?e|m\.?tech|m\.?sc|mba|m\.?a\b)/i.test(text)) score += 20;
  if (/(?:university|college|institute|school)/i.test(text)) score += 15;
  if (/(?:cgpa|gpa|percentage|grade|first class|distinction)/i.test(text)) score += 10;
  if (/\b(19|20)\d{2}\b/.test(text)) score += 10; // graduation year
  return Math.min(score, 100);
};

const scoreFormatting = (text) => {
  let score = 50; // base
  const lines = text.split('\n').filter(l => l.trim());
  const avgLineLen = lines.reduce((a, l) => a + l.length, 0) / (lines.length || 1);
  // Good line length (not too long = wall of text)
  if (avgLineLen < 120) score += 15;
  // Has multiple sections (headings)
  const headings = text.match(/^[A-Z][A-Z\s]{3,30}$/gm) || [];
  score += Math.min(headings.length * 5, 20);
  // Not too short
  if (text.length > 500) score += 10;
  if (text.length > 1500) score += 5;
  // Not too long (> 5000 chars = likely too verbose)
  if (text.length > 5000) score -= 10;
  return Math.min(Math.max(score, 0), 100);
};

const scoreKeywordMatch = (resumeText, jobDescription) => {
  if (!jobDescription || jobDescription.trim().length < 20) return null;
  // Extract words > 4 chars from JD (likely meaningful keywords)
  const jdWords = [...new Set(
    jobDescription.toLowerCase().match(/\b[a-z]{4,}\b/g) || []
  )].filter(w => !['with','that','this','from','have','will','your','they','been','were','also','into','more','than','when','what','which'].includes(w));

  if (jdWords.length === 0) return null;
  const resumeLower = resumeText.toLowerCase();
  const matched = jdWords.filter(w => resumeLower.includes(w));
  return Math.round((matched.length / jdWords.length) * 100);
};

const ruleBasedScore = (resumeText, jobDescription = '') => {
  const sections = {
    contactInfo: scoreContactInfo(resumeText),
    summary:     scoreSummary(resumeText),
    experience:  scoreExperience(resumeText),
    skills:      scoreSkills(resumeText),
    education:   scoreEducation(resumeText),
    formatting:  scoreFormatting(resumeText),
  };

  // Weighted overall score
  const weights = { contactInfo: 0.15, summary: 0.10, experience: 0.30, skills: 0.25, education: 0.10, formatting: 0.10 };
  const overallScore = Math.round(
    Object.entries(sections).reduce((sum, [k, v]) => sum + v * weights[k], 0)
  );

  // ATS score — focuses on machine-readability signals
  const atsScore = Math.round(
    (sections.contactInfo * 0.2) + (sections.skills * 0.35) +
    (sections.experience * 0.30) + (sections.formatting * 0.15)
  );

  const keywordMatch = scoreKeywordMatch(resumeText, jobDescription);

  // Derive missing keywords from JD
  let missingKeywords = [];
  if (jobDescription) {
    const techTerms = jobDescription.match(/\b(?:[A-Z][a-z]+(?:\.[a-z]+)?|[A-Z]{2,})\b/g) || [];
    missingKeywords = [...new Set(techTerms)]
      .filter(t => !resumeText.toLowerCase().includes(t.toLowerCase()))
      .slice(0, 8);
  }

  return { overallScore, atsScore, sections, keywordMatch, missingKeywords };
};

// ─── AI FEEDBACK (qualitative only, not scores) ──────────────────────────────

import { callGroq } from '../services/groqService.js';

const callAI = async (prompt) => {
  try {
    return await callGroq({ feature: 'resume-score', messages: [{ role: 'user', content: prompt }], maxTokens: 1200, temperature: 0.4 });
  } catch { return null; }
};

const getAIFeedback = async (resumeText, scores) => {
  // Cache key based on first 200 chars of resume + scores
  const cacheKey = `resume:feedback:${Buffer.from(resumeText.substring(0, 200)).toString('base64').substring(0, 40)}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  const prompt = `You are a resume coach. Based on these section scores for a resume, provide feedback.

Scores: ${JSON.stringify(scores)}

Resume (first 1500 chars):
${resumeText.substring(0, 1500)}

Return ONLY valid JSON, no markdown:
{
  "strengths": ["specific strength 1", "specific strength 2", "specific strength 3"],
  "improvements": [
    { "issue": "short title", "fix": "specific actionable fix" },
    { "issue": "short title", "fix": "specific actionable fix" },
    { "issue": "short title", "fix": "specific actionable fix" }
  ],
  "verdict": "one sentence overall verdict"
}`;

  try {
    const content = await callAI(prompt);
    if (!content) return null;
    const jsonMatch = content.match(/\{[\s\S]*\}/m);
    if (!jsonMatch) return null;
    const result = JSON.parse(jsonMatch[0]);
    await cacheSet(cacheKey, result, 3600); // cache 1 hour
    return result;
  } catch { return null; }
};

const defaultFeedback = (scores) => {
  const weakest = Object.entries(scores).sort((a, b) => a[1] - b[1])[0][0];
  const feedbackMap = {
    contactInfo: { issue: 'Incomplete contact info', fix: 'Add email, phone, LinkedIn URL and location' },
    summary:     { issue: 'Missing professional summary', fix: 'Add a 2-3 sentence summary highlighting your expertise' },
    experience:  { issue: 'Weak experience section', fix: 'Add job titles, company names, dates and bullet points with action verbs' },
    skills:      { issue: 'Skills section needs improvement', fix: 'List specific technical skills, tools and technologies' },
    education:   { issue: 'Education details incomplete', fix: 'Add degree, institution name and graduation year' },
    formatting:  { issue: 'Formatting issues detected', fix: 'Use clear section headings and consistent structure' },
  };
  return {
    strengths: ['Resume submitted for review', 'Contains relevant information', 'Shows professional intent'],
    improvements: [feedbackMap[weakest], feedbackMap['skills'], feedbackMap['summary']],
    verdict: 'Your resume needs improvement in key areas to pass ATS screening.'
  };
};

// ─── CORE FUNCTION ───────────────────────────────────────────────────────────

const scoreResume = async (resumeText, jobDescription = '') => {
  // Step 1: Rule-based scores (deterministic, consistent)
  const { overallScore, atsScore, sections, keywordMatch, missingKeywords } = ruleBasedScore(resumeText, jobDescription);

  // Step 2: AI feedback (qualitative only)
  const aiFeedback = await getAIFeedback(resumeText, sections) || defaultFeedback(sections);

  return {
    success: true,
    overallScore,
    atsScore,
    sections,
    keywordMatch,
    missingKeywords,
    strengths: aiFeedback.strengths,
    improvements: aiFeedback.improvements,
    verdict: aiFeedback.verdict
  };
};

// ─── ROUTES ──────────────────────────────────────────────────────────────────

router.post('/analyze', async (req, res) => {
  try {
    const { resumeText, jobDescription } = req.body;
    if (!resumeText || resumeText.trim().length < 50)
      return res.status(400).json({ error: 'Resume text is required (min 50 chars)' });
    res.json(await scoreResume(resumeText, jobDescription || ''));
  } catch (error) {
    console.error('Resume score error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

router.post('/upload', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    let resumeText = '';
    if (req.file.mimetype === 'application/pdf') {
      resumeText = await pdfTextExtractor.extractTextFromBuffer(req.file.buffer);
    } else {
      resumeText = req.file.buffer.toString('utf8');
    }
    if (!resumeText.trim()) return res.status(400).json({ error: 'Could not extract text from file' });
    res.json(await scoreResume(resumeText, req.body.jobDescription || ''));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
