import express from 'express';
import Job from '../models/Job.js';

const router = express.Router();

function getOgImage(job) {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  // Use trinity-logo as the default OG share image
  return `${frontendUrl}/images/company-logos/trinity-logo.png`;
}

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

    const jobTitle = `${job.jobTitle} at ${job.company}`;
    const description = (job.jobDescription || job.description || 'Job opportunity at ' + job.company).substring(0, 160) + '...';
    const ogImage = getOgImage(job);
    const jobUrl = `${process.env.FRONTEND_URL}/job-detail?id=${job._id || job.id}`;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${jobTitle} | ZyncJobs</title>
    
    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website">
    <meta property="og:url" content="${jobUrl}">
    <meta property="og:title" content="${jobTitle}">
    <meta property="og:description" content="${description}">
    <meta property="og:image" content="${ogImage}">
    <meta property="og:site_name" content="ZyncJobs">
    
    <!-- Twitter -->
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
        window.location.href = "${jobUrl}";
    </script>
    
    <!-- Fallback for non-JS -->
    <meta http-equiv="refresh" content="0; url=${jobUrl}">
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