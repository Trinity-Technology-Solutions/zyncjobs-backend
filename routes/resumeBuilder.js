import express from 'express';
import fetch from 'node-fetch';

const router = express.Router();

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODELS = [
  'google/gemma-3-4b-it:free',
  'mistralai/mistral-7b-instruct:free',
  'meta-llama/llama-3.2-3b-instruct:free',
];

async function callAI(prompt, systemMsg = 'You are a professional resume writer.', maxTokens = 1200) {
  if (!process.env.OPENROUTER_API_KEY) throw new Error('AI service not configured');

  for (const model of MODELS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);
      const res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.FRONTEND_URL || 'http://localhost:5173',
          'X-Title': 'ZyncJobs-ResumeBuilder',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemMsg },
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
          max_tokens: maxTokens,
        }),
      });
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) return content;
      }
    } catch (e) {
      console.warn(`Model ${model} failed:`, e.message);
    }
  }
  throw new Error('All AI models failed. Try again.');
}

// ─── (A) AI Resume Generator ─────────────────────────────────────────────────
// POST /api/resume-builder/generate-content
// Body: { jobTitle, experience, name? }
// Returns: { summary, bullets, skills }
router.post('/generate-content', async (req, res) => {
  try {
    const { jobTitle, experience, name } = req.body;
    if (!jobTitle || !experience) {
      return res.status(400).json({ error: 'jobTitle and experience are required' });
    }

    const prompt = `You are a professional ATS resume writer.
Generate resume content for:
Job Title: ${jobTitle}
Experience: ${experience}
${name ? `Candidate Name: ${name}` : ''}

Return ONLY valid JSON (no markdown, no explanation):
{
  "summary": "2-3 sentence professional summary with strong action verbs",
  "bullets": [
    "Bullet 1 with action verb and quantified metric",
    "Bullet 2 with action verb and quantified metric",
    "Bullet 3 with action verb and quantified metric",
    "Bullet 4 with action verb and quantified metric",
    "Bullet 5 with action verb and quantified metric"
  ],
  "skills": ["skill1", "skill2", "skill3", "skill4", "skill5", "skill6", "skill7", "skill8"]
}`;

    const raw = await callAI(prompt, 'You are a professional ATS resume writer. Return only valid JSON.', 800);
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'AI returned invalid format' });

    const result = JSON.parse(jsonMatch[0]);
    res.json(result);
  } catch (err) {
    console.error('generate-content error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── (B) JD-Based ATS Optimization ───────────────────────────────────────────
// POST /api/resume-builder/optimize-jd
// Body: { resumeData: { summary, bullets, skills }, jobDescription }
// Returns: { summary, bullets, skills, keywords, atsScore, improvements }
router.post('/optimize-jd', async (req, res) => {
  try {
    const { resumeData, jobDescription } = req.body;
    if (!resumeData || !jobDescription) {
      return res.status(400).json({ error: 'resumeData and jobDescription are required' });
    }

    const prompt = `You are an ATS optimization expert.
Optimize this resume to match the job description.

Current Resume:
Summary: ${resumeData.summary || ''}
Bullets: ${(resumeData.bullets || []).join('\n')}
Skills: ${(resumeData.skills || []).join(', ')}

Job Description:
${jobDescription.substring(0, 2000)}

Return ONLY valid JSON:
{
  "summary": "improved ATS-optimized summary using JD keywords",
  "bullets": ["improved bullet 1", "improved bullet 2", "improved bullet 3", "improved bullet 4", "improved bullet 5"],
  "skills": ["skill1", "skill2", "skill3", "skill4", "skill5", "skill6", "skill7", "skill8"],
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "atsScore": 85,
  "improvements": ["improvement tip 1", "improvement tip 2", "improvement tip 3"]
}`;

    const raw = await callAI(prompt, 'You are an ATS optimization expert. Return only valid JSON.', 1000);
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'AI returned invalid format' });

    const result = JSON.parse(jsonMatch[0]);
    res.json(result);
  } catch (err) {
    console.error('optimize-jd error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── (C) Real-time Bullet Suggestions ────────────────────────────────────────
// POST /api/resume-builder/suggest-bullets
// Body: { text, jobTitle }
// Returns: { suggestions: [{ original, improved, reason }] }
router.post('/suggest-bullets', async (req, res) => {
  try {
    const { text, jobTitle } = req.body;
    if (!text) return res.status(400).json({ error: 'text is required' });

    const prompt = `You are a resume writing expert.
Improve this resume bullet point for a ${jobTitle || 'professional'} role.
Original: "${text}"

Return ONLY valid JSON:
{
  "suggestions": [
    {
      "original": "${text}",
      "improved": "stronger version with action verb and metric",
      "reason": "why this is better (ATS, impact, clarity)"
    },
    {
      "original": "${text}",
      "improved": "alternative stronger version",
      "reason": "alternative improvement reason"
    }
  ]
}`;

    const raw = await callAI(prompt, 'You are a resume writing expert. Return only valid JSON.', 400);
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'AI returned invalid format' });

    res.json(JSON.parse(jsonMatch[0]));
  } catch (err) {
    console.error('suggest-bullets error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── ATS Score Calculator ─────────────────────────────────────────────────────
// POST /api/resume-builder/ats-score
// Body: { resumeData: { summary, bullets, skills, experience, education } }
// Returns: { score, breakdown, suggestions }
router.post('/ats-score', async (req, res) => {
  try {
    const { resumeData } = req.body;
    if (!resumeData) return res.status(400).json({ error: 'resumeData is required' });

    const hasName = !!(resumeData.personalInfo?.name);
    const hasEmail = !!(resumeData.personalInfo?.email);
    const hasPhone = !!(resumeData.personalInfo?.phone);
    const hasSummary = !!(resumeData.summary?.trim());
    const skillsCount = (resumeData.skills || []).length;
    const bulletsCount = (resumeData.bullets || resumeData.experience?.flatMap(e => e.bullets || []) || []).length;
    const hasEducation = (resumeData.education || []).length > 0;
    const hasExperience = (resumeData.experience || []).length > 0;

    // Rule-based scoring (fast, no AI needed)
    let score = 0;
    const breakdown = [];
    const suggestions = [];

    if (hasName) { score += 10; breakdown.push({ label: 'Name', score: 10, max: 10 }); }
    else { breakdown.push({ label: 'Name', score: 0, max: 10 }); suggestions.push('Add your full name'); }

    if (hasEmail && hasPhone) { score += 10; breakdown.push({ label: 'Contact Info', score: 10, max: 10 }); }
    else { breakdown.push({ label: 'Contact Info', score: hasEmail || hasPhone ? 5 : 0, max: 10 }); suggestions.push('Add email and phone number'); }

    if (hasSummary) { score += 20; breakdown.push({ label: 'Professional Summary', score: 20, max: 20 }); }
    else { breakdown.push({ label: 'Professional Summary', score: 0, max: 20 }); suggestions.push('Add a professional summary with keywords'); }

    const skillScore = Math.min(20, skillsCount * 2);
    score += skillScore;
    breakdown.push({ label: 'Skills', score: skillScore, max: 20 });
    if (skillsCount < 6) suggestions.push('Add at least 6-8 relevant skills');

    const expScore = hasExperience ? 20 : 0;
    score += expScore;
    breakdown.push({ label: 'Work Experience', score: expScore, max: 20 });
    if (!hasExperience) suggestions.push('Add work experience with bullet points');

    const bulletScore = Math.min(10, bulletsCount * 2);
    score += bulletScore;
    breakdown.push({ label: 'Achievement Bullets', score: bulletScore, max: 10 });
    if (bulletsCount < 3) suggestions.push('Add quantified achievement bullet points');

    const eduScore = hasEducation ? 10 : 0;
    score += eduScore;
    breakdown.push({ label: 'Education', score: eduScore, max: 10 });
    if (!hasEducation) suggestions.push('Add your education details');

    res.json({ score: Math.min(100, score), breakdown, suggestions });
  } catch (err) {
    console.error('ats-score error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Legacy: Full Resume Generator (kept for backward compat) ─────────────────
// POST /api/resume-builder/generate
router.post('/generate', async (req, res) => {
  try {
    const { name, jobTitle, skills, experience, education, jobDescription } = req.body;
    if (!name || !skills || !experience) {
      return res.status(400).json({ error: 'Name, skills, and experience are required.' });
    }

    const prompt = `Act as a senior HR recruiter and professional resume writer.
Write a clean ATS-optimized resume with quantified achievements.

Candidate Details:
Name: ${name}
Job Title: ${jobTitle || 'Professional'}
Skills: ${skills}
Experience: ${experience}
Education: ${education || 'Not provided'}
${jobDescription ? `Target Job Description:\n${jobDescription}` : ''}

Output Format (use these EXACT section headers):

SUMMARY
Write 2-3 lines professional summary here.

SKILLS
List skills comma separated here.

EXPERIENCE
• Bullet point with action verb and metric
• Bullet point with action verb and metric
• Bullet point with action verb and metric

EDUCATION
Degree, Institution, Year`;

    const resume = await callAI(prompt);
    res.json({ resume });
  } catch (err) {
    console.error('generate error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Legacy: Improve Resume (kept for backward compat) ───────────────────────
// POST /api/resume-builder/improve
router.post('/improve', async (req, res) => {
  try {
    const { existingResume, jobDescription } = req.body;
    if (!existingResume || !jobDescription) {
      return res.status(400).json({ error: 'Resume and job description are required.' });
    }

    const prompt = `Improve this resume to better match the job description.
Make it more ATS-friendly with stronger action verbs and quantified achievements.
Keep the same section structure (SUMMARY, SKILLS, EXPERIENCE, EDUCATION).

Current Resume:
${existingResume}

Job Description:
${jobDescription}

Return only the improved resume, no extra explanation.`;

    const resume = await callAI(prompt);
    res.json({ resume });
  } catch (err) {
    console.error('improve error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
