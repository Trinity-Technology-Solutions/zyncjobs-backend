import express from 'express';
import PDFService from '../services/pdfService.js';
import { asyncHandler } from '../utils/errorHandler.js';

const router = express.Router();

// POST /api/pdf/generate-resume
// Accepts ResumeStore shape OR flat profile shape
router.post('/generate-resume', asyncHandler(async (req, res) => {
  const resumeData = req.body.resumeData || req.body;

  if (!resumeData || typeof resumeData !== 'object') {
    return res.status(400).json({ error: 'Resume data is required' });
  }

  const pdfBuffer = await PDFService.generateResumePDF(resumeData);
  const name = resumeData.personalInfo?.name || resumeData.name || 'Resume';
  const fileName = `${name.replace(/\s+/g, '_')}_Resume.pdf`;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Content-Length', pdfBuffer.length);
  res.send(pdfBuffer);
}));

export default router;