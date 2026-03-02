import express from 'express';
import PDFService from '../services/pdfService.js';
import { asyncHandler } from '../utils/errorHandler.js';

const router = express.Router();

router.post('/generate-resume', asyncHandler(async (req, res) => {
  const { resumeData } = req.body;
  
  if (!resumeData) {
    return res.status(400).json({ error: 'Resume data is required' });
  }

  const pdfBuffer = await PDFService.generateResumePDF(resumeData);
  
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename=resume.pdf');
  res.send(pdfBuffer);
}));

export default router;