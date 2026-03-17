import express from 'express';
import Job from '../models/Job.js';

const router = express.Router();

function getOgImage(job) {
  const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;
  // Trinity company — use Trinity logo from backend static
  if (job.company && job.company.toLowerCase().includes('trinity')) {
    return `${backendUrl}/images/trinity-logo.webp`;
  }
  // Use actual company logo if available
  if (job.companyLogo && job.companyLogo.startsWith('http')) {
    return job.companyLogo;
  }
  // Use logo.dev for known companies
  if (job.company) {
    const domain = getCompanyDomain(job.company);
    if (domain) return `https://img.logo.dev/${domain}?token=pk_cY8JBeWnQR6g5m_ymQhBoQ&size=200`;
  }
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  return `${frontendUrl}/images/og-default.png`;
}

function getCompanyDomain(companyName) {
  const map = {
    'google': 'google.com', 'microsoft': 'microsoft.com', 'amazon': 'amazon.com',
    'apple': 'apple.com', 'meta': 'meta.com', 'facebook': 'facebook.com',
    'tcs': 'tcs.com', 'infosys': 'infosys.com', 'wipro': 'wipro.com',
    'zoho': 'zoho.com', 'ibm': 'ibm.com', 'accenture': 'accenture.com',
    'oracle': 'oracle.com', 'salesforce': 'salesforce.com', 'adobe': 'adobe.com',
    'freshworks': 'freshworks.com', 'hcl': 'hcltech.com', 'cognizant': 'cognizant.com',
    'capgemini': 'capgemini.com', 'deloitte': 'deloitte.com', 'pwc': 'pwc.com',
    'trinity': 'trinitetech.com'
  };
  const lower = companyName.toLowerCase();
  for (const [key, domain] of Object.entries(map)) {
    if (lower.includes(key)) return domain;
  }
  return null;
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