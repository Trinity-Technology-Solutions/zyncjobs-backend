import express from 'express';
import aiClient from '../services/aiClient.js';

const router = express.Router();

// POST /api/ranking/rule-score — Deterministic rule-based score
router.post('/rule-score', async (req, res) => {
  try {
    const { candidate, job } = req.body;
    const data = await aiClient.rankingRuleScore(candidate, job);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ranking/ai-score — AI semantic score via LLM
router.post('/ai-score', async (req, res) => {
  try {
    const { candidate, job } = req.body;
    const data = await aiClient.rankingAIScore(candidate, job);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ranking/hybrid-score — Combined rule + AI score
router.post('/hybrid-score', async (req, res) => {
  try {
    const { candidate, job } = req.body;
    const data = await aiClient.rankingHybridScore(candidate, job);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ranking/rank — Rank multiple candidates against a job
router.post('/rank', async (req, res) => {
  try {
    const { candidates, job } = req.body;
    const data = await aiClient.rankingRank(candidates, job);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
