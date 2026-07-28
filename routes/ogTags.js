import express from 'express';
import Job from '../models/Job.js';
import { generateJobOgImage } from '../services/ogImageGenerator.js';

const router = express.Router();

function getOgImage(job, req) {
  const userAgent = (req.headers['user-agent'] || '').toLowerCase();
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;

  // WhatsApp crawler detection — WhatsApp prefers site favicon/icon over 1200x630 canvas
  if (userAgent.includes('whatsapp')) {
    return `${frontendUrl}/favicon_io/android-chrome-512x512.png`;
  }

  // Dynamic 1200x630 canvas for LinkedIn, Facebook, Twitter, and default social sharing
  const jobId = job.id || job._id;
  return `${backendUrl}/og/job-image?id=${jobId}`;
}

// GET /og/job-image?id=xxx - Serves 1200x630 PNG preview image for social sharing
router.get('/og/job-image', async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) {
      return res.status(400).send('Job ID is required');
    }

    let job = await Job.findByPk(id);
    if (!job) {
      job = await Job.findOne({ where: { positionId: id } });
    }

    if (!job) {
      return res.status(404).send('Job not found');
    }

    const imageBuffer = await generateJobOgImage(job);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
    res.send(imageBuffer);
  } catch (error) {
    console.error('OG Image endpoint error:', error);
    res.status(500).send('Error generating OG image');
  }
});

// GET /jobs/:slug - SEO slug OG tags
router.get('/jobs/:slug', async (req, res) => {
  try {
    const job = await Job.findOne({ where: { slug: req.params.slug } });
    if (!job) return res.redirect(`${process.env.FRONTEND_URL}/job-listings`);
    const jobUrl = `${process.env.FRONTEND_URL}/jobs/${job.slug}`;
    res.redirect(301, jobUrl);
  } catch (error) {
    res.redirect(`${process.env.FRONTEND_URL}/job-listings`);
  }
});

// GET /job-detail?id=xxx - Dynamic OG tags for job details
router.get('/job-detail', async (req, res) => {
  try {
    const { id } = req.query;
    
    if (!id) {
      return res.status(400).send('Job ID is required');
    }

    // Find job by ID or positionId
    let job = await Job.findByPk(id);
    if (!job) {
      job = await Job.findOne({ where: { positionId: id } });
    }

    if (!job) {
      return res.status(404).send('Job not found');
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const siteIconUrl = `${frontendUrl}/favicon_io/android-chrome-512x512.png`;
    const jobTitle = `${job.jobTitle} at ${job.company}`;
    const jobType = Array.isArray(job.jobType) ? job.jobType.join(', ') : (job.jobType || '');
    const skills = Array.isArray(job.skills) && job.skills.length > 0 ? job.skills.slice(0, 4).join(', ') : '';
    const descriptionParts = [
      `📍 ${job.location || 'Location not specified'}`,
      jobType ? `⏰ ${jobType}` : null,
      job.experienceRange || job.experienceLevel ? `🎯 ${job.experienceRange || job.experienceLevel}` : null,
      skills ? `🔧 ${skills}` : null
    ].filter(Boolean);
    const description = descriptionParts.length > 0
      ? descriptionParts.join(' • ')
      : (job.description || `Job opportunity at ${job.company}`).substring(0, 160);

    const ogImage = getOgImage(job, req);
    const jobUrl = job.slug
      ? `${process.env.FRONTEND_URL}/jobs/${job.slug}`
      : `${process.env.FRONTEND_URL}/job-detail?id=${job.id}`;
    const redirectUrl = jobUrl;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${jobTitle} | ZyncJobs</title>
    
    <!-- Site Favicon & Icons -->
    <link rel="icon" type="image/x-icon" href="${frontendUrl}/favicon_io/favicon.ico">
    <link rel="apple-touch-icon" href="${siteIconUrl}">
    
    <!-- Open Graph / Facebook / LinkedIn -->
    <meta property="og:type" content="website">
    <meta property="og:url" content="${jobUrl}">
    <meta property="og:title" content="${jobTitle}">
    <meta property="og:description" content="${description}">
    <meta property="og:image" content="${ogImage}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:type" content="image/png">
    <meta property="og:site_name" content="ZyncJobs">

    <!-- Secondary Favicon OG Image for crawlers requesting square site icons -->
    <meta property="og:image" content="${siteIconUrl}">
    <meta property="og:image:width" content="512">
    <meta property="og:image:height" content="512">
    
    <!-- Twitter Card -->
    <meta property="twitter:card" content="summary_large_image">
    <meta property="twitter:url" content="${jobUrl}">
    <meta property="twitter:title" content="${jobTitle}">
    <meta property="twitter:description" content="${description}">
    <meta property="twitter:image" content="${ogImage}">
    
    <!-- Additional meta tags -->
    <meta name="description" content="${description}">
    <meta name="keywords" content="${job.skills?.join(', ') || ''}, ${job.jobTitle}, ${job.company}, ${job.location}">
    
    <!-- Redirect to frontend -->
    <script>
        window.location.href = "${redirectUrl}";
    </script>
    
    <!-- Fallback for non-JS -->
    <meta http-equiv="refresh" content="0; url=${redirectUrl}">
</head>
<body>
    <div style="text-align: center; padding: 50px; font-family: Arial, sans-serif;">
        <h1>${jobTitle}</h1>
        <p>${description}</p>
        <p>Redirecting to job details...</p>
        <a href="${jobUrl}">Click here if not redirected automatically</a>
    </div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
    
  } catch (error) {
    console.error('OG Tags error:', error);
    res.status(500).send('Internal server error');
  }
});

export default router;

