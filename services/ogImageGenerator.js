import sharp from 'sharp';
import axios from 'axios';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-memory cache for generated OG images (key: jobId, value: { buffer, timestamp })
const imageCache = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes cache

function escapeXml(unsafe) {
  if (!unsafe) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function fetchImageBuffer(url) {
  if (!url) return null;
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 3500,
      headers: {
        'User-Agent': 'ZyncJobs-OG-Generator/1.0'
      }
    });
    return Buffer.from(response.data);
  } catch (err) {
    console.warn(`[OG Generator] Failed to fetch logo from ${url}:`, err.message);
    return null;
  }
}

export async function generateJobOgImage(job) {
  const cacheKey = `job_${job.id || job._id || job.slug}`;
  const cached = imageCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.buffer;
  }

  const title = job.jobTitle || job.title || 'Job Opportunity';
  const company = job.company || 'ZyncJobs Partner';
  const location = job.location || 'Remote / Hybrid';
  const jobType = Array.isArray(job.jobType) ? job.jobType.join(', ') : (job.jobType || 'Full-Time');
  const experience = job.experienceRange || job.experienceLevel || '';
  const skills = Array.isArray(job.skills) && job.skills.length > 0 ? job.skills.slice(0, 4).join(' • ') : '';

  // Company logo URL resolution
  let logoUrl = null;
  if (job.companyLogo && job.companyLogo.startsWith('http')) {
    logoUrl = job.companyLogo;
  } else if (company.toLowerCase().includes('trinity')) {
    const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;
    logoUrl = `${backendUrl}/images/trinity-logo.webp`;
  }

  let logoBuffer = await fetchImageBuffer(logoUrl);

  // If no logo buffer, check local fallback
  if (!logoBuffer) {
    const defaultLogoPath = path.join(__dirname, '../public/images/zyncjobs-logo.png');
    if (fs.existsSync(defaultLogoPath)) {
      try {
        logoBuffer = fs.readFileSync(defaultLogoPath);
      } catch (e) {
        logoBuffer = null;
      }
    }
  }

  // Logo processing inside fixed box container (200 x 200)
  let processedLogoBuffer = null;
  if (logoBuffer) {
    try {
      // Resize logo using sharp with fit: contain to NEVER crop or distort logo aspect ratio
      processedLogoBuffer = await sharp(logoBuffer)
        .resize(200, 200, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        })
        .png()
        .toBuffer();
    } catch (e) {
      console.warn('[OG Generator] Error processing logo buffer with Sharp:', e.message);
      processedLogoBuffer = null;
    }
  }

  // Render SVG Canvas layout (1200 x 630)
  const svgCanvas = `
  <svg width="1200" height="630" viewBox="0 0 1200 630" fill="none" xmlns="http://www.w3.org/2000/svg">
    <!-- Background Gradient -->
    <rect width="1200" height="630" fill="url(#bg_grad)" />
    
    <!-- Decorative Ambient Glows -->
    <circle cx="1050" cy="90" r="300" fill="#4F46E5" fill-opacity="0.15" filter="blur(60px)" />
    <circle cx="150" cy="550" r="250" fill="#06B6D4" fill-opacity="0.12" filter="blur(60px)" />

    <defs>
      <linearGradient id="bg_grad" x1="0" y1="0" x2="1200" y2="630" gradientUnits="userSpaceOnUse">
        <stop stop-color="#0F172A"/>
        <stop offset="0.6" stop-color="#1E1B4B"/>
        <stop offset="1" stop-color="#0F172A"/>
      </linearGradient>

      <linearGradient id="brand_grad" x1="0" y1="0" x2="100%" y2="0%">
        <stop stop-color="#6366F1" />
        <stop offset="1" stop-color="#A855F7" />
      </linearGradient>
    </defs>

    <!-- Main Card Container -->
    <rect x="40" y="40" width="1120" height="550" rx="24" fill="#1E293B" fill-opacity="0.75" stroke="#334155" stroke-width="2"/>

    <!-- Header / Brand Bar -->
    <g transform="translate(80, 80)">
      <rect width="140" height="36" rx="18" fill="url(#brand_grad)"/>
      <text x="70" y="23" fill="#FFFFFF" font-family="Arial, sans-serif" font-weight="bold" font-size="16" text-anchor="middle">ZYNCJOBS</text>
      <text x="160" y="24" fill="#94A3B8" font-family="Arial, sans-serif" font-size="16" font-weight="500">Verified Job Opportunity</text>
    </g>

    <!-- Left Content Column -->
    <g transform="translate(80, 150)">
      <!-- Job Title -->
      <text x="0" y="50" fill="#FFFFFF" font-family="Arial, sans-serif" font-weight="bold" font-size="42" width="700">
        ${escapeXml(title.length > 38 ? title.substring(0, 36) + '...' : title)}
      </text>

      <!-- Company Name -->
      <text x="0" y="96" fill="#818CF8" font-family="Arial, sans-serif" font-weight="600" font-size="28">
        ${escapeXml(company)}
      </text>

      <!-- Badges / Metadata Pills -->
      <g transform="translate(0, 140)">
        <!-- Location Pill -->
        <rect x="0" y="0" width="220" height="42" rx="10" fill="#334155" />
        <text x="110" y="26" fill="#E2E8F0" font-family="Arial, sans-serif" font-size="18" font-weight="500" text-anchor="middle">📍 ${escapeXml(location.length > 16 ? location.substring(0, 14) + '...' : location)}</text>

        <!-- Job Type Pill -->
        <rect x="235" y="0" width="180" height="42" rx="10" fill="#334155" />
        <text x="325" y="26" fill="#E2E8F0" font-family="Arial, sans-serif" font-size="18" font-weight="500" text-anchor="middle">⏰ ${escapeXml(jobType.length > 14 ? jobType.substring(0, 12) + '...' : jobType)}</text>

        ${experience ? `
        <!-- Experience Pill -->
        <rect x="430" y="0" width="190" height="42" rx="10" fill="#334155" />
        <text x="525" y="26" fill="#E2E8F0" font-family="Arial, sans-serif" font-size="18" font-weight="500" text-anchor="middle">🎯 ${escapeXml(experience.length > 14 ? experience.substring(0, 12) + '...' : experience)}</text>
        ` : ''}
      </g>

      <!-- Required Skills -->
      ${skills ? `
      <g transform="translate(0, 220)">
        <text x="0" y="20" fill="#94A3B8" font-family="Arial, sans-serif" font-size="18" font-weight="500">Key Skills: <tspan fill="#F1F5F9">${escapeXml(skills)}</tspan></text>
      </g>
      ` : ''}
    </g>

    <!-- Right Column: Logo Box Container (Fixed 240x240 Box, centered logo inside) -->
    <g transform="translate(840, 160)">
      <rect width="240" height="240" rx="20" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="4"/>
    </g>

    <!-- Footer Bar -->
    <g transform="translate(80, 530)">
      <text x="0" y="0" fill="#64748B" font-family="Arial, sans-serif" font-size="16">Apply directly on www.zyncjobs.com</text>
    </g>
  </svg>
  `;

  const canvasBuffer = await sharp(Buffer.from(svgCanvas)).png().toBuffer();

  let finalImageBuffer;
  if (processedLogoBuffer) {
    // Composite processed logo on top of the logo container box at x=860, y=180 (centered inside 240x240 box)
    finalImageBuffer = await sharp(canvasBuffer)
      .composite([
        {
          input: processedLogoBuffer,
          top: 180,
          left: 860
        }
      ])
      .png()
      .toBuffer();
  } else {
    // Render fallback text logo if image unavailable
    const fallbackSvg = Buffer.from(`
      <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <rect width="200" height="200" rx="16" fill="#F1F5F9"/>
        <text x="100" y="115" font-family="Arial, sans-serif" font-size="64" font-weight="bold" fill="#4F46E5" text-anchor="middle">
          ${escapeXml(company.charAt(0).toUpperCase())}
        </text>
      </svg>
    `);
    finalImageBuffer = await sharp(canvasBuffer)
      .composite([
        {
          input: fallbackSvg,
          top: 180,
          left: 860
        }
      ])
      .png()
      .toBuffer();
  }

  imageCache.set(cacheKey, { buffer: finalImageBuffer, timestamp: Date.now() });
  return finalImageBuffer;
}
