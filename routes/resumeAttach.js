import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Resume from '../models/Resume.js';
import User from '../models/User.js';

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

    // If it's a placeholder or non-file URL, return it as-is
    if (!resumeUrl.startsWith('http://localhost:5000/uploads/')) {
      return res.json({ success: true, resumeUrl, fileName: null });
    }

    // Extract filename from URL
    const resumePath = resumeUrl.replace('http://localhost:5000/', '');
    const sourceFile = path.join(__dirname, '..', resumePath);
    
    // Check if source file exists
    if (!fs.existsSync(sourceFile)) {
      return res.json({ success: true, resumeUrl, fileName: null });
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

// DELETE /api/resume/remove - Remove resume from view (clears DB and User record, keeps S3 file)
router.delete('/remove', async (req, res) => {
  try {
    const { userId, email } = req.body;
    if (!userId && !email) return res.status(400).json({ error: 'userId or email required' });

    const where = userId ? { userId } : { email };
    const userWhere = userId ? { id: userId } : { email };

    // Remove resume rows from DB
    await Resume.destroy({ where });

    // Clear resumeUrl on User so it never comes back on refresh
    await User.update({ resumeUrl: null }, { where: userWhere });

    res.json({ success: true, message: 'Resume removed' });
  } catch (error) {
    console.error('Resume remove error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
