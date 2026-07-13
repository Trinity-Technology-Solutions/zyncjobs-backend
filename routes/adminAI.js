import express from 'express';
import axios from 'axios';

const router = express.Router();
const GATEWAY_URL = process.env.AI_GATEWAY_URL || 'http://localhost:8000';

// GET /api/admin/ai/stats — AI audit summary stats
router.get('/stats', async (req, res) => {
  try {
    const { data } = await axios.get(`${GATEWAY_URL}/api/v1/admin/ai/stats`, { timeout: 5000 });
    res.json(data);
  } catch (error) {
    res.status(502).json({ error: 'AI Gateway unavailable', detail: error.message });
  }
});

// GET /api/admin/ai/logs — AI audit log entries
router.get('/logs', async (req, res) => {
  try {
    const { feature, status, limit, offset } = req.query;
    const params = new URLSearchParams();
    if (feature) params.set('feature', feature);
    if (status) params.set('status', status);
    if (limit) params.set('limit', limit);
    if (offset) params.set('offset', offset);
    const { data } = await axios.get(
      `${GATEWAY_URL}/api/v1/admin/ai/logs?${params.toString()}`,
      { timeout: 5000 }
    );
    res.json(data);
  } catch (error) {
    res.status(502).json({ error: 'AI Gateway unavailable', detail: error.message });
  }
});

// GET /api/admin/ai/features — Feature breakdown
router.get('/features', async (req, res) => {
  try {
    const { data } = await axios.get(`${GATEWAY_URL}/api/v1/admin/ai/features`, { timeout: 5000 });
    res.json(data);
  } catch (error) {
    res.status(502).json({ error: 'AI Gateway unavailable', detail: error.message });
  }
});

export default router;
