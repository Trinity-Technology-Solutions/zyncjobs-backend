import express from 'express';
import aiClient from '../services/aiClient.js';
import { withCache, cacheGet, cacheSet } from '../services/redisService.js';

const router = express.Router();

async function aiCall(prompt) {
  const result = await aiClient.suggest(prompt);
  const raw = result.reply || '';
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) return JSON.parse(match[0]);
  throw new Error('No JSON in AI response');
}

// POST /api/resume-builder/generate-content
router.post('/generate-content', async (req, res) => {
  try {
    const { jobTitle, experience, name } = req.body;
    if (!jobTitle || !experience)
      return res.status(400).json({ error: 'jobTitle and experience are required' });

    const prompt = `You are a professional ATS resume writer.
Generate resume content for:
Job Title: ${jobTitle}
Experience: ${experience}
${name ? `Candidate Name: ${name}` : ''}

Return ONLY valid JSON (no markdown):
{"summary":"2-3 sentence professional summary","bullets":["Bullet 1","Bullet 2","Bullet 3","Bullet 4","Bullet 5"],"skills":["skill1","skill2","skill3","skill4","skill5","skill6","skill7","skill8"]}`;

    try {
      const result = await aiCall(prompt);
      return res.json(result);
    } catch {
      return res.json({
        summary: `Experienced ${jobTitle} with ${experience} of expertise delivering results.`,
        bullets: ['Led cross-functional teams to deliver projects on time', 'Improved process efficiency by 30%', 'Collaborated with stakeholders to define requirements', 'Analyzed data to provide actionable insights', 'Mentored junior team members'],
        skills: ['Communication', 'Problem Solving', 'Agile', 'Data Analysis', 'Leadership', 'Excel', 'SQL', 'Project Management']
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/resume-builder/optimize-jd
router.post('/optimize-jd', async (req, res) => {
  try {
    const { resumeData, jobDescription } = req.body;
    if (!resumeData || !jobDescription)
      return res.status(400).json({ error: 'resumeData and jobDescription are required' });

    const prompt = `You are an ATS optimization expert.
Optimize this resume to match the job description.

Current Resume:
Summary: ${resumeData.summary || ''}
Bullets: ${(resumeData.bullets || []).join('\n')}
Skills: ${(resumeData.skills || []).join(', ')}

Job Description:
${jobDescription.substring(0, 2000)}

Return ONLY valid JSON:
{"summary":"improved summary","bullets":["bullet1","bullet2","bullet3","bullet4","bullet5"],"skills":["skill1","skill2","skill3","skill4","skill5","skill6","skill7","skill8"],"keywords":["kw1","kw2","kw3","kw4","kw5"],"atsScore":85,"improvements":["tip1","tip2","tip3"]}`;

    try {
      const result = await aiCall(prompt);
      return res.json(result);
    } catch {
      // Fallback: rule-based optimization
      const jdWords = jobDescription.toLowerCase().split(/\W+/).filter(w => w.length > 3);
      const jdKeywords = [...new Set(jdWords)].slice(0, 8);
      return res.json({
        summary: resumeData.summary || `Experienced professional targeting ${jobDescription.substring(0, 60)}.`,
        bullets: (resumeData.bullets || resumeData.experience?.flatMap(e => e.bullets || []) || []).slice(0, 5),
        skills: resumeData.skills || [],
        keywords: jdKeywords,
        atsScore: 70,
        improvements: ['Add more keywords from the job description', 'Quantify achievements with metrics', 'Use action verbs to start bullet points'],
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/resume-builder/suggest-bullets
router.post('/suggest-bullets', async (req, res) => {
  try {
    const { text, jobTitle } = req.body;
    if (!text) return res.status(400).json({ error: 'text is required' });

    const prompt = `Improve this resume bullet point for a ${jobTitle || 'professional'} role.
Original: ${text}

Return ONLY valid JSON:
{"suggestions":[{"original":"${text}","improved":"stronger version with action verb and metric","reason":"why better"},{"original":"${text}","improved":"alternative stronger version","reason":"alternative reason"}]}`;

    try {
      const result = await aiCall(prompt);
      return res.json(result);
    } catch {
      return res.json({ suggestions: [{ original: text, improved: text, reason: 'AI could not generate a suggestion. Try again.' }] });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/resume-builder/ats-score
router.post('/ats-score', async (req, res) => {
  try {
    const { resumeData } = req.body;
    if (!resumeData) return res.status(400).json({ error: 'resumeData is required' });

    // Rule-based scoring
    const hasName = !!(resumeData.personalInfo?.name);
    const hasEmail = !!(resumeData.personalInfo?.email);
    const hasPhone = !!(resumeData.personalInfo?.phone);
    const hasSummary = !!(resumeData.summary?.trim());
    const skillsCount = (resumeData.skills || []).length;
    const bulletsCount = (resumeData.bullets || resumeData.experience?.flatMap(e => e.bullets || []) || []).length;
    const hasEducation = (resumeData.education || []).length > 0;
    const hasExperience = (resumeData.experience || []).length > 0;

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
    score += skillScore; breakdown.push({ label: 'Skills', score: skillScore, max: 20 });
    if (skillsCount < 6) suggestions.push('Add at least 6-8 relevant skills');
    score += hasExperience ? 20 : 0; breakdown.push({ label: 'Work Experience', score: hasExperience ? 20 : 0, max: 20 });
    if (!hasExperience) suggestions.push('Add work experience with bullet points');
    const bulletScore = Math.min(10, bulletsCount * 2);
    score += bulletScore; breakdown.push({ label: 'Achievement Bullets', score: bulletScore, max: 10 });
    if (bulletsCount < 3) suggestions.push('Add quantified achievement bullet points');
    score += hasEducation ? 10 : 0; breakdown.push({ label: 'Education', score: hasEducation ? 10 : 0, max: 10 });
    if (!hasEducation) suggestions.push('Add your education details');

    // AI enhancement via agent
    try {
      const aiPrompt = `Analyze this resume and provide ATS optimization suggestions. Return ONLY JSON with "score"(0-100) and "suggestions"(string array).\n\nResume: ${JSON.stringify(resumeData).substring(0, 1000)}`;
      const result = await aiCall(aiPrompt);
      if (typeof result.score === 'number') score = Math.round(score * 0.5 + result.score * 0.5);
      if (Array.isArray(result.suggestions)) suggestions.push(...result.suggestions);
    } catch { /* use rule-based only */ }

    res.json({ score: Math.min(100, score), breakdown, suggestions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/resume-builder/generate (legacy)
router.post('/generate', async (req, res) => {
  try {
    const { name, jobTitle, skills, experience, education, jobDescription } = req.body;
    if (!name || !skills || !experience)
      return res.status(400).json({ error: 'Name, skills, and experience are required.' });

    const result = await aiClient.suggest(`Write an ATS-optimized resume for ${name}, ${jobTitle}, skills: ${skills}, experience: ${experience}${education ? `, education: ${education}` : ''}${jobDescription ? `, targeting: ${jobDescription.substring(0, 500)}` : ''}`);
    res.json({ resume: result.reply });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/resume-builder/improve (legacy)
router.post('/improve', async (req, res) => {
  try {
    const { existingResume, jobDescription } = req.body;
    if (!existingResume || !jobDescription)
      return res.status(400).json({ error: 'Resume and job description are required.' });

    const result = await aiClient.improveResume(existingResume, jobDescription);
    res.json({ resume: result.improved || existingResume });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
