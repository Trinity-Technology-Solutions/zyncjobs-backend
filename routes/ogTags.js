import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Job from '../models/Job.js';
import { generateJobOgImage } from '../services/ogImageGenerator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// FRONTEND_URL may be comma-separated (e.g. "https://qa.zyncjobs.com,http://localhost:5173")
// Always use the first (primary) URL for OG tags
function getPrimaryFrontendUrl() {
  const raw = process.env.FRONTEND_URL || 'http://localhost:5173';
  return raw.split(',')[0].trim();
}

function getOgImage(job, req) {
  const userAgent = (req.headers['user-agent'] || '').toLowerCase();
  const frontendUrl = getPrimaryFrontendUrl();
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

// GET /jobs/:slug - Serve OG meta tags for social crawlers, serve React SPA for regular users
router.get('/jobs/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const frontendUrl = getPrimaryFrontendUrl();
    const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;
    const userAgent = (req.headers['user-agent'] || '').toLowerCase();
    const isCrawler = /facebookexternalhit|facebot|linkedinbot|twitterbot|whatsapp|telegrambot|slackbot|discordbot|applebot|googlebot|bingbot|yandex|duckduckbot/.test(userAgent);

    // Regular users — serve the React SPA index.html directly
    // (nginx proxies /jobs/* to us, so we must serve the SPA ourselves)
    if (!isCrawler) {
      const frontendRoot = req.headers['x-frontend-root'] || '/var/www/zyncjobs-frontend/dist';
      const indexPath = path.join(frontendRoot, 'index.html');
      if (fs.existsSync(indexPath)) {
        return res.sendFile(indexPath);
      }
      // Fallback: redirect to frontend if index.html not found
      return res.redirect(302, `${frontendUrl}/jobs/${slug}`);
    }

    // Social crawlers — look up job and return OG HTML
    let job = await Job.findOne({ where: { slug } });
    if (!job) job = await Job.findByPk(slug);
    if (!job) job = await Job.findOne({ where: { positionId: slug } });

    if (!job) {
      // Job not found — serve SPA so user sees the 404 page
      const frontendRoot = req.headers['x-frontend-root'] || '/var/www/zyncjobs-frontend/dist';
      const indexPath = path.join(frontendRoot, 'index.html');
      if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
      return res.redirect(`${frontendUrl}/job-listings`);
    }

    const jobUrl = `${frontendUrl}/jobs/${job.slug || job.id}`;
    const jobTitle = job.jobTitle || job.title || 'Job Opportunity';
    const company = job.company || 'ZyncJobs';
    const location = job.location || '';
    const jobType = Array.isArray(job.jobType) ? job.jobType.join(', ') : (job.jobType || '');
    const experience = job.experienceRange || job.experienceLevel || '';
    const skills = Array.isArray(job.skills) && job.skills.length > 0 ? job.skills.slice(0, 4).join(', ') : '';

    const descParts = [
      location ? `📍 ${location}` : null,
      jobType ? `⏰ ${jobType}` : null,
      experience ? `🎯 ${experience}` : null,
      skills ? `🔧 ${skills}` : null,
    ].filter(Boolean);
    const description = descParts.length
      ? descParts.join(' • ')
      : (job.description || `Job opportunity at ${company}`).replace(/<[^>]*>/g, '').substring(0, 160);

    const ogImage = getOgImage(job, req);
    const pageTitle = `${jobTitle} at ${company} | ZyncJobs`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${pageTitle}</title>
  <meta name="description" content="${description}">
  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="ZyncJobs">
  <meta property="og:url" content="${jobUrl}">
  <meta property="og:title" content="${pageTitle}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${ogImage}">
  <meta property="og:image:secure_url" content="${ogImage}">
  <meta property="og:image:width" content="300">
  <meta property="og:image:height" content="300">
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:alt" content="${pageTitle}">
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:url" content="${jobUrl}">
  <meta name="twitter:title" content="${pageTitle}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${ogImage}">
  <link rel="canonical" href="${jobUrl}">
</head>
<body>
  <h1>${pageTitle}</h1>
  <p>${description}</p>
  <a href="${jobUrl}">View Job on ZyncJobs</a>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(html);
  } catch (error) {
    console.error('OG /jobs/:slug error:', error);
    res.redirect(`${getPrimaryFrontendUrl()}/job-listings`);
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

    const frontendUrl = getPrimaryFrontendUrl();
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
      ? `${getPrimaryFrontendUrl()}/jobs/${job.slug}`
      : `${getPrimaryFrontendUrl()}/job-detail?id=${job.id}`;
    const redirectUrl = jobUrl;
    const pageTitle = `${jobTitle} | ZyncJobs`;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${pageTitle}</title>
    
    <!-- Site Favicon & Icons -->
    <link rel="icon" type="image/x-icon" href="${frontendUrl}/favicon_io/favicon.ico">
    <link rel="apple-touch-icon" href="${siteIconUrl}">
    
    <!-- Open Graph / Facebook / LinkedIn -->
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="ZyncJobs">
    <meta property="og:url" content="${jobUrl}">
    <meta property="og:title" content="${pageTitle}">
    <meta property="og:description" content="${description}">
    <meta property="og:image" content="${ogImage}">
    <meta property="og:image:secure_url" content="${ogImage}">
    <meta property="og:image:width" content="300">
    <meta property="og:image:height" content="300">
    <meta property="og:image:type" content="image/png">
    <meta property="og:image:alt" content="${pageTitle}">
    
    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:url" content="${jobUrl}">
    <meta name="twitter:title" content="${pageTitle}">
    <meta name="twitter:description" content="${description}">
    <meta name="twitter:image" content="${ogImage}">
    
    <!-- Additional meta tags -->
    <meta name="description" content="${description}">
    <link rel="canonical" href="${jobUrl}">
    
    <!-- Redirect to frontend -->
    <script>window.location.href = "${redirectUrl}";</script>
    <meta http-equiv="refresh" content="0; url=${redirectUrl}">
</head>
<body>
    <h1>${pageTitle}</h1>
    <p>${description}</p>
    <a href="${jobUrl}">View Job on ZyncJobs</a>
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

