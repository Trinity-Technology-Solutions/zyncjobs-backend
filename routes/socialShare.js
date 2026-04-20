import express from 'express';
import Job from '../models/Job.js';

const router = express.Router();

// POST /api/social/linkedin/share - Generate LinkedIn share URL for job
router.post('/linkedin/share', async (req, res) => {
  try {
    const { jobId, positionId } = req.body;

    if (!jobId && !positionId) {
      return res.status(400).json({ error: 'Job ID or Position ID is required' });
    }

    // Find job by ID or position ID
    let job;
    if (positionId) {
      job = await Job.findOne({ where: { positionId, isActive: true } });
    } else {
      job = await Job.findByPk(jobId);
    }

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Generate job URL
    const jobUrl = `${process.env.FRONTEND_URL}/jobs/${job.positionId || job.id}`;
    
    // Create LinkedIn share text
    const shareText = `🚀 Exciting opportunity at ${job.company}!\n\n${job.jobTitle} - ${job.location}\n\n${job.jobType} | ${job.salaryMin ? `₹${job.salaryMin}${job.salaryMax ? ` - ₹${job.salaryMax}` : '+'}` : 'Competitive salary'}\n\nApply now: ${jobUrl}\n\n#Jobs #Hiring #${job.jobTitle.replace(/\s+/g, '')} #${job.company.replace(/\s+/g, '')}`;

    // Generate LinkedIn share URL
    const linkedinShareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(jobUrl)}&text=${encodeURIComponent(shareText)}`;

    res.json({
      success: true,
      shareUrl: linkedinShareUrl,
      jobUrl,
      shareText,
      job: {
        id: job.id,
        positionId: job.positionId,
        title: job.jobTitle,
        company: job.company,
        location: job.location
      }
    });

  } catch (error) {
    console.error('❌ LinkedIn share error:', error);
    res.status(500).json({ error: 'Failed to generate LinkedIn share URL' });
  }
});

// GET /api/social/share/:jobId - Get all social share URLs for a job
router.get('/share/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    
    // Find job by ID or position ID
    let job = await Job.findByPk(jobId);
    if (!job) {
      job = await Job.findOne({ where: { positionId: jobId, isActive: true } });
    }

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const jobUrl = `${process.env.FRONTEND_URL}/jobs/${job.positionId || job.id}`;
    const shareText = `Check out this job opportunity: ${job.jobTitle} at ${job.company} - ${job.location}`;
    const hashtags = `Jobs,Hiring,${job.jobTitle.replace(/\s+/g, '')},${job.company.replace(/\s+/g, '')}`;

    const shareUrls = {
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(jobUrl)}`,
      twitter: `https://twitter.com/intent/tweet?url=${encodeURIComponent(jobUrl)}&text=${encodeURIComponent(shareText)}&hashtags=${encodeURIComponent(hashtags)}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(jobUrl)}`,
      whatsapp: `https://wa.me/?text=${encodeURIComponent(`${shareText} ${jobUrl}`)}`,
      telegram: `https://t.me/share/url?url=${encodeURIComponent(jobUrl)}&text=${encodeURIComponent(shareText)}`
    };

    res.json({
      success: true,
      jobUrl,
      shareUrls,
      job: {
        id: job.id,
        positionId: job.positionId,
        title: job.jobTitle,
        company: job.company,
        location: job.location
      }
    });

  } catch (error) {
    console.error('❌ Social share error:', error);
    res.status(500).json({ error: 'Failed to generate share URLs' });
  }
});

export default router;
