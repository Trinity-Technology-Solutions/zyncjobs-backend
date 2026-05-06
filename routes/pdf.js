import express from 'express';
import PDFService from '../services/pdfService.js';
import docxService from '../services/docxService.js';
import { asyncHandler } from '../utils/errorHandler.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// GET /api/pdf/download?file=uploads/resumes/xxx.pdf&name=CandidateName
router.get('/download', (req, res) => {
  try {
    const { file, name } = req.query;
    if (!file) return res.status(400).json({ error: 'file param required' });

    // Only allow files inside uploads/ directory (security)
    const relativePath = decodeURIComponent(String(file)).replace(/^\//, '');
    if (!relativePath.startsWith('uploads/')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const absolutePath = path.join(__dirname, '..', relativePath);
    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const filename = name
      ? `${String(name).replace(/\s+/g, '_')}_resume.pdf`
      : path.basename(absolutePath);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.sendFile(absolutePath);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/pdf/generate-resume
// Accepts ResumeStore shape OR flat profile shape
router.post('/generate-resume', asyncHandler(async (req, res) => {
  const resumeData = req.body.resumeData || req.body;

  if (!resumeData || typeof resumeData !== 'object') {
    return res.status(400).json({ error: 'Resume data is required' });
  }

  try {
    const pdfBuffer = await PDFService.generateResumePDF(resumeData);
    const name = resumeData.personalInfo?.name || resumeData.name || 'Resume';
    const fileName = `${name.replace(/\s+/g, '_')}_Resume.pdf`;

    // Set proper headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Pragma', 'no-cache');
    
    // Send the PDF buffer directly
    res.end(pdfBuffer, 'binary');
  } catch (error) {
    console.error('PDF generation error:', error);
    res.status(500).json({ error: 'Failed to generate PDF: ' + error.message });
  }
}));

// POST /api/pdf/generate-docx
// Accepts ResumeStore shape OR flat profile shape
router.post('/generate-docx', asyncHandler(async (req, res) => {
  const resumeData = req.body.resumeData || req.body;

  if (!resumeData || typeof resumeData !== 'object') {
    return res.status(400).json({ error: 'Resume data is required' });
  }

  try {
    const docxBuffer = await docxService.generateResumeDOCX(resumeData);
    const name = resumeData.personalInfo?.name || resumeData.name || 'Resume';
    const fileName = `${name.replace(/\s+/g, '_')}_Resume.docx`;

    // Set proper headers for DOCX download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', docxBuffer.length);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Pragma', 'no-cache');
    
    // Send the DOCX buffer directly
    res.end(docxBuffer, 'binary');
  } catch (error) {
    console.error('DOCX generation error:', error);
    res.status(500).json({ error: 'Failed to generate DOCX: ' + error.message });
  }
}));

export default router;
