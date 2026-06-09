import express from 'express';

const router = express.Router();

// POST /api/verify/gst — proxy to Surepass sandbox
router.post('/gst', async (req, res) => {
  try {
    const { gstin } = req.body;
    if (!gstin) return res.status(400).json({ success: false, message: 'GSTIN is required' });

    const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    if (!gstRegex.test(gstin.toUpperCase())) {
      return res.status(400).json({ success: false, message: 'Invalid GSTIN format' });
    }

    const token = process.env.SUREPASS_TOKEN;
    if (!token) {
      console.warn('⚠️ SUREPASS_TOKEN not set — GST verification unavailable');
      return res.status(503).json({
        success: false,
        message: 'GST verification service is not configured. Please contact support.'
      });
    }

    const response = await fetch('https://kyc-api.surepass.io/api/v1/corporate/gstin', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: gstin.toUpperCase() }),
    });

    const data = await response.json();

    if (!response.ok || data.status_code !== 200) {
      return res.status(400).json({
        success: false,
        message: data.message || 'GST verification failed',
      });
    }

    return res.json({
      success: true,
      data: {
        gstin: data.data?.gstin || gstin,
        legal_name: data.data?.legal_name || '',
        trade_name: data.data?.trade_name || '',
        gstin_status: data.data?.gstin_status || 'Active',
        state: data.data?.state_jurisdiction || data.data?.state || '',
      }
    });
  } catch (error) {
    console.error('❌ GST verification error:', error.message);
    res.status(500).json({ success: false, message: 'GST verification service unavailable' });
  }
});

export default router;
