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

  // Always use ZyncJobs logo for social sharing
  let logoBuffer = null;
  const zyncjobsLogoPath = path.join(__dirname, '../public/images/zyncjobs-logo.png');
  if (fs.existsSync(zyncjobsLogoPath)) {
    try {
      logoBuffer = fs.readFileSync(zyncjobsLogoPath);
    } catch (e) {
      logoBuffer = null;
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

  // Render square 300x300 thumbnail (Facebook shows as small left thumbnail like LinkedIn)
  const svgCanvas = `
  <svg width="300" height="300" viewBox="0 0 300 300" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg_grad" x1="0" y1="0" x2="300" y2="300" gradientUnits="userSpaceOnUse">
        <stop stop-color="#0F172A"/>
        <stop offset="1" stop-color="#1E1B4B"/>
      </linearGradient>
      <linearGradient id="brand_grad" x1="0" y1="0" x2="100%" y2="0%">
        <stop stop-color="#6366F1" />
        <stop offset="1" stop-color="#A855F7" />
      </linearGradient>
    </defs>
    <rect width="300" height="300" fill="url(#bg_grad)" />
    <!-- Logo box -->
    <rect x="50" y="40" width="200" height="200" rx="20" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="3"/>
    <!-- ZyncJobs brand bar at bottom -->
    <rect x="0" y="258" width="300" height="42" fill="url(#brand_grad)"/>
    <text x="150" y="285" fill="#FFFFFF" font-family="Arial, sans-serif" font-weight="bold" font-size="18" text-anchor="middle">ZYNCJOBS</text>
  </svg>
  `;

  const canvasBuffer = await sharp(Buffer.from(svgCanvas)).png().toBuffer();

  let finalImageBuffer;
  if (processedLogoBuffer) {
    // Composite ZyncJobs logo centered inside the 200x200 white box (offset: x=50, y=40)
    finalImageBuffer = await sharp(canvasBuffer)
      .composite([{ input: processedLogoBuffer, top: 40, left: 50 }])
      .png()
      .toBuffer();
  } else {
    // Fallback: ZyncJobs text initial
    const fallbackSvg = Buffer.from(`
      <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <rect width="200" height="200" rx="16" fill="#F1F5F9"/>
        <text x="100" y="115" font-family="Arial, sans-serif" font-size="64" font-weight="bold" fill="#4F46E5" text-anchor="middle">Z</text>
      </svg>
    `);
    finalImageBuffer = await sharp(canvasBuffer)
      .composite([{ input: fallbackSvg, top: 40, left: 50 }])
      .png()
      .toBuffer();
  }

  imageCache.set(cacheKey, { buffer: finalImageBuffer, timestamp: Date.now() });
  return finalImageBuffer;
}
