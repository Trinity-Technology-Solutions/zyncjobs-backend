import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// POST /api/resume/attach - Copy resume file for application
router.post('/attach', async (req, res) => {
  try {
    const { resumeUrl, candidateEmail, jobId } = req.body;
    
    if (!resumeUrl || !candidateEmail || !jobId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Extract filename from URL
    const resumePath = resumeUrl.replace('http://localhost:5000/', '');
    const sourceFile = path.join(__dirname, '..', resumePath);
    
    // Check if source file exists
    if (!fs.existsSync(sourceFile)) {
      return res.status(404).json({ error: 'Resume file not found' });
    }

    // Create application-specific filename
    const fileExtension = path.extname(resumePath);
    const timestamp = Date.now();
    const newFileName = `application-${jobId}-${candidateEmail.replace('@', '_')}-${timestamp}${fileExtension}`;
    const destinationFile = path.join(__dirname, '..', 'uploads', newFileName);

    // Copy the file
    fs.copyFileSync(sourceFile, destinationFile);
    
    const newResumeUrl = `http://localhost:5000/uploads/${newFileName}`;
    
    res.json({ 
      success: true, 
      resumeUrl: newResumeUrl,
      fileName: newFileName
    });
  } catch (error) {
    console.error('Resume attach error:', error);
    res.status(500).json({ error: 'Failed to attach resume' });
  }
});

export default router;