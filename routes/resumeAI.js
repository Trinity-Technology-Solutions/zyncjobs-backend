import express from 'express';
import aiClient from '../services/aiClient.js';

const router = express.Router();

// POST /api/resume-ai/ats-score-v2 — Hybrid ATS (Rule 70% + AI 30%)
router.post('/ats-score-v2', async (req, res) => {
  try {
    const { resumeText, jobDescription } = req.body;
    if (!resumeText) return res.status(400).json({ error: 'resumeText is required' });
    const data = await aiClient.atsScoreV2(resumeText, jobDescription || '');
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/resume-ai/intelligence — Resume Intelligence (hybrid)
router.post('/intelligence', async (req, res) => {
  try {
    const { resumeJson } = req.body;
    if (!resumeJson) return res.status(400).json({ error: 'resumeJson is required' });
    const data = await aiClient.resumeIntelligence(resumeJson);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/resume-ai/grammar — Grammar Checker (pure AI)
router.post('/grammar', async (req, res) => {
  try {
    const { text, mode } = req.body;
    if (!text) return res.status(400).json({ error: 'text is required' });
    const data = await aiClient.grammarCheck(text, mode || 'check');
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
