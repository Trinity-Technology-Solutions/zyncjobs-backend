import express from 'express';
import { body, validationResult } from 'express-validator';
import multer from 'multer';
import Job from '../models/Job.js';
import User from '../models/User.js';
import Company from '../models/Company.js';
import TeamMember from '../models/TeamMember.js';
import Application from '../models/Application.js';
import Interview from '../models/Interview.js';
import { Op, literal, fn, col } from 'sequelize';
import { requireRole, requirePermission, PERMISSIONS, requireTeamRole } from '../middleware/roleAuth.js';
import { authenticateToken } from '../middleware/auth.js';
import { mistralDetector } from '../utils/mistralJobDetector.js';
import { generateEmployerId, generatePositionId, generatePositionIdWithYear, formatJobCode } from '../utils/idGenerator.js';
import { maxJobsGuard, getJobStatus } from '../middleware/settingsMiddleware.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vectorService from '../services/vectorService.js';
import { withCache, cacheDelPattern } from '../services/redisService.js';
import { geocodeLocation } from '../utils/geocode.js';
import { formatDescriptionWithBullets } from '../server.js';
import JobRefreshService from '../services/jobRefreshService.js';
import JobAlertService from '../services/jobAlertService.js';
import { uploadJobBannerToS3, uploadJobBannerToDisk } from '../services/s3Service.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_EXTENSIONS = /jpeg|jpg|png|webp/;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const bannerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIMES.includes(file.mimetype)) {
      return cb(new Error(`Invalid file type: ${file.mimetype}. Allowed: JPG, PNG, WEBP`));
    }
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
    if (!ALLOWED_EXTENSIONS.test(ext)) {
      return cb(new Error(`Invalid file extension: .${ext}. Allowed: .jpg, .jpeg, .png, .webp`));
    }
    cb(null, true);
  }
});

// Load companies data for logo lookup
let companiesData = [];
try {
  const companiesPath = path.join(__dirname, '../data/companies.json');
  const rawData = fs.readFileSync(companiesPath, 'utf8');
  companiesData = JSON.parse(rawData);
} catch (error) {
  console.error('Error loading companies data:', error);
}

// GET /api/jobs/slug/:slug - Get job by SEO slug
router.get('/slug/:slug', async (req, res) => {
  try {
    const job = await Job.findOne({ where: { slug: req.params.slug, isActive: true } });
    if (!job) return res.status(404).json({ error: 'Job not found' });
    const jobJson = job.toJSON();
    res.json({ ...jobJson, companyLogo: getCompanyLogo(job.company, job.companyLogo), jobHeaderImage: jobJson.jobHeaderImage || getJobHeaderImage(job.jobTitle, job.skills || []), salary: { min: jobJson.salaryMin, max: jobJson.salaryMax, currency: jobJson.currency || 'USD' } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/jobs/titles - Get all job titles
router.get('/titles', (req, res) => {
  try {
    const titlesPath = path.join(__dirname, '../data/job_titles.json');
    const rawData = fs.readFileSync(titlesPath, 'utf8');
    const data = JSON.parse(rawData);
    res.json({ job_titles: data.job_titles || [] });
  } catch (error) {
    console.error('Error loading job titles:', error);
    res.json({ job_titles: [] });
  }
});

// GET /api/jobs/categories - Get job categories with counts
router.get('/categories', async (req, res) => {
  const categoryKeywords = [
    { name: 'Software Development', terms: ['software developer', 'software engineer', 'software architect', 'frontend developer', 'backend developer', 'full stack developer', 'full stack engineer', 'web developer', 'web engineer', 'react developer', 'node developer', 'java developer', 'python developer', 'php developer', 'ruby developer', 'golang developer', 'typescript developer', 'javascript developer', 'application developer', 'application engineer'] },
    { name: 'Data Science & AI', terms: ['data scientist', 'machine learning', 'ai engineer', 'data analyst', 'data engineer', 'artificial intelligence', 'deep learning', 'nlp engineer', 'data science', 'ml engineer', 'business intelligence', 'analytics engineer', 'ai researcher'] },
    { name: 'Mobile Development', terms: ['mobile developer', 'ios developer', 'android developer', 'react native', 'flutter developer', 'mobile app', 'swift developer', 'kotlin developer', 'mobile engineer'] },
    { name: 'Cybersecurity', terms: ['cybersecurity', 'security analyst', 'security engineer', 'penetration tester', 'information security', 'cyber security', 'soc analyst', 'ethical hacker', 'security architect', 'network security'] },
    { name: 'Cloud Engineering', terms: ['cloud engineer', 'cloud architect', 'aws engineer', 'azure engineer', 'gcp engineer', 'cloud developer', 'solutions architect', 'site reliability engineer', 'sre engineer', 'platform engineer', 'cloud administrator'] },
    { name: 'DevOps & Infrastructure', terms: ['devops', 'infrastructure engineer', 'kubernetes engineer', 'docker engineer', 'ci/cd engineer', 'system administrator', 'sysadmin', 'network engineer', 'linux administrator', 'build engineer', 'release engineer', 'devops engineer'] },
    { name: 'Product Management', terms: ['product manager', 'product owner', 'business analyst', 'project manager', 'scrum master', 'program manager', 'product lead', 'agile coach', 'delivery manager'] },
    { name: 'UI/UX Design', terms: ['ui designer', 'ux designer', 'graphic designer', 'web designer', 'product designer', 'visual designer', 'interaction designer', 'ui/ux designer', 'ux researcher', 'design lead', 'creative designer'] }
  ];

  try {
    const results = await Promise.all(categoryKeywords.map(async (cat) => {
      const count = await Job.count({
        where: {
          isActive: true,
          status: 'approved',
          [Op.or]: cat.terms.map(term => ({ jobTitle: { [Op.iLike]: `%${term}%` } }))
        }
      });
      return { category: cat.name, count };
    }));
    res.json(results);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/jobs/countries - Get all countries
router.get('/countries', (req, res) => {
  try {
    const countriesPath = path.join(__dirname, '../data/countries.json');
    const data = JSON.parse(fs.readFileSync(countriesPath, 'utf8'));
    res.json({ countries: data.countries || [] });
  } catch (error) {
    res.json({ countries: [] });
  }
});

// Generate SEO-friendly slug
function generateSlug(jobTitle, company, id) {
  const base = `${jobTitle}-at-${company}`
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 80);
  const suffix = id ? String(id).slice(-6) : Math.random().toString(36).slice(-6);
  return `${base}-${suffix}`;
}

// Helper function to generate job code
function generateJobCode(jobTitle, company) {
  const titleCode = jobTitle.replace(/[^a-zA-Z0-9]/g, '').substring(0, 4).toUpperCase();
  const companyCode = company.replace(/[^a-zA-Z0-9]/g, '').substring(0, 3).toUpperCase();
  const timestamp = Date.now().toString().slice(-6);
  const randomNum = Math.floor(Math.random() * 100).toString().padStart(2, '0');

  return `${titleCode}${companyCode}${timestamp}${randomNum}`;
}

// Helper function to get job header image based on job title/category
function getJobHeaderImage(jobTitle, skills = []) {
  const title = jobTitle.toLowerCase();
  const skillsStr = skills.join(' ').toLowerCase();

  // Tech/Software Development
  if (title.includes('developer') || title.includes('engineer') || title.includes('programmer') ||
    title.includes('software') || skillsStr.includes('javascript') || skillsStr.includes('python') ||
    skillsStr.includes('java') || skillsStr.includes('react')) {
    return 'https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=800&h=400&fit=crop';
  }

  // Data Science/Analytics
  if (title.includes('data') || title.includes('analyst') || title.includes('scientist') ||
    skillsStr.includes('sql') || skillsStr.includes('python') || skillsStr.includes('tableau')) {
    return 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&h=400&fit=crop';
  }

  // DevOps/Cloud
  if (title.includes('devops') || title.includes('cloud') || title.includes('aws') ||
    skillsStr.includes('docker') || skillsStr.includes('kubernetes')) {
    return 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&h=400&fit=crop';
  }

  // UI/UX Design
  if (title.includes('designer') || title.includes('ui') || title.includes('ux') ||
    skillsStr.includes('figma') || skillsStr.includes('photoshop')) {
    return 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=800&h=400&fit=crop';
  }

  // Marketing/Digital
  if (title.includes('marketing') || title.includes('digital') || title.includes('seo') ||
    title.includes('content')) {
    return 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&h=400&fit=crop';
  }

  // Finance/Accounting
  if (title.includes('finance') || title.includes('accounting') || title.includes('analyst')) {
    return 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=800&h=400&fit=crop';
  }

  // Project Management
  if (title.includes('project') || title.includes('manager') || title.includes('scrum') ||
    title.includes('agile')) {
    return 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=800&h=400&fit=crop';
  }

  // Default tech/business image
  return 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&h=400&fit=crop';
}

// Helper function to get company logo
function getCompanyLogo(companyName, dbLogo = null) {
  // Always prefer the actual uploaded logo stored in DB
  if (dbLogo) return dbLogo;
  if (!companyName) return null;
  const company = companiesData.find(c =>
    c.name.toLowerCase().trim() === companyName.toLowerCase().trim() ||
    c.name.toLowerCase().includes(companyName.toLowerCase()) ||
    companyName.toLowerCase().includes(c.name.toLowerCase())
  );
  return company ? company.logo : null;
}

// Helper function to auto-assign category from job title
function getCategoryFromTitle(jobTitle) {
  const title = jobTitle.toLowerCase();

  if (title.includes('software') || title.includes('developer') || title.includes('engineer') ||
    title.includes('programmer') || title.includes('frontend') || title.includes('backend') ||
    title.includes('fullstack') || title.includes('full stack')) {
    return 'Software Development';
  }

  if (title.includes('data') || title.includes('analyst') || title.includes('scientist') ||
    title.includes('analytics') || title.includes('bi ')) {
    return 'Data Science & Analytics';
  }

  if (title.includes('devops') || title.includes('cloud') || title.includes('infrastructure') ||
    title.includes('sre') || title.includes('system')) {
    return 'DevOps & Cloud';
  }

  if (title.includes('designer') || title.includes('ui') || title.includes('ux') ||
    title.includes('graphic') || title.includes('product design')) {
    return 'Design';
  }

  if (title.includes('marketing') || title.includes('digital') || title.includes('seo') ||
    title.includes('content') || title.includes('social media')) {
    return 'Marketing';
  }

  if (title.includes('sales') || title.includes('business development') || title.includes('account')) {
    return 'Sales';
  }

  if (title.includes('hr') || title.includes('human resource') || title.includes('recruiter') ||
    title.includes('talent')) {
    return 'Human Resources';
  }

  if (title.includes('finance') || title.includes('accounting') || title.includes('accountant')) {
    return 'Finance & Accounting';
  }

  if (title.includes('project') || title.includes('manager') || title.includes('scrum') ||
    title.includes('product manager') || title.includes('program')) {
    return 'Project Management';
  }

  if (title.includes('qa') || title.includes('quality') || title.includes('test') ||
    title.includes('automation')) {
    return 'Quality Assurance';
  }

  if (title.includes('security') || title.includes('cyber')) {
    return 'Cybersecurity';
  }

  if (title.includes('hse') || title.includes('health safety') || title.includes('safety') ||
    title.includes('environment') || title.includes('inspector')) {
    return 'Health, Safety & Environment';
  }

  if (title.includes('civil') || title.includes('structural') || title.includes('infrastructure') ||
    title.includes('construction') || title.includes('site engineer')) {
    return 'Engineering & Construction';
  }

  if (title.includes('support') || title.includes('customer success') || title.includes('help desk')) {
    return 'Customer Support';
  }

  return 'Other';
}

// Helper: normalize any array field (handles string, JSON string, PG array literal, real array)
function normalizeArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    // PostgreSQL array literal: {"English","Tamil"} or {English,Tamil}
    if (val.startsWith('{') && val.endsWith('}')) {
      return val.slice(1, -1).split(',').map(s => s.replace(/^"|"$/g, '').trim()).filter(Boolean);
    }
    try { return JSON.parse(val); } catch { return val.split(',').map(s => s.trim()).filter(Boolean); }
  }
  return [];
}

// GET /api/jobs - Get all jobs
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, location, jobType, search, sort } = req.query;

    const where = { isActive: true, status: 'approved' };
    if (location) where.location = { [Op.iLike]: `%${location}%` };
    if (jobType) where.jobType = Array.isArray(jobType) ? { [Op.in]: jobType } : jobType;
    if (search) {
      where[Op.or] = [
        { jobTitle: { [Op.iLike]: `%${search}%` } },
        { company: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const jobs = await Job.findAll({
      where,
      order: [[literal('GREATEST(COALESCE("lastRefreshedAt", \'1970-01-01\'::timestamp), "createdAt")'), 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit)
    });

    const result = jobs.map(job => {
      const jobJson = job.toJSON();
      return {
        ...jobJson,
        jobCode: formatJobCode(job.positionId, job.company),
        companyLogo: getCompanyLogo(job.company, job.companyLogo),
        salary: {
          min: jobJson.salaryMin,
          max: jobJson.salaryMax,
          currency: jobJson.currency
        }
      };
    });

    res.json(result);
  } catch (error) {
    console.error('Error fetching jobs:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/jobs/employer/:employerId - Get jobs by employer ID
router.get('/employer/:employerId', async (req, res) => {
  try {
    const jobs = await Job.findAll({
      where: {
        employerId: req.params.employerId,
        isActive: true,
        status: { [Op.in]: ['approved', 'pending'] }
      },
      order: [[literal('GREATEST(COALESCE("lastRefreshedAt", \'1970-01-01\'::timestamp), "createdAt")'), 'DESC']]
    });
    const jobsWithLogos = jobs.map(job => {
      const jobJson = job.toJSON();
      return {
        ...jobJson,
        jobCode: formatJobCode(job.positionId, job.company),
        companyLogo: getCompanyLogo(job.company, job.companyLogo),
        salary: { min: jobJson.salaryMin, max: jobJson.salaryMax, currency: jobJson.currency }
      };
    });
    res.json(jobsWithLogos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/jobs/employer/email/:email - Get jobs by employer email (company-wide)
router.get('/employer/email/:email', async (req, res) => {
  try {
    let employerEmail = req.params.email;

    // For team members: auto-resolve to owner email
    const teamRecord = await TeamMember.findOne({
      where: { memberEmail: employerEmail.toLowerCase() }
    });

    const isOwner = !teamRecord || teamRecord.role === 'Owner' || teamRecord.memberEmail.toLowerCase() === teamRecord.employerId.toLowerCase();

    // Determine ALL company-wide emails to use for analytics (only if owner)
    const ownerEmailAddr = teamRecord?.employerId || employerEmail;
    
    let jobEmailsToQuery = [employerEmail.toLowerCase()];
    if (isOwner) {
      // Get all team member emails for this owner
      const teamMembers = await TeamMember.findAll({
        where: { employerId: ownerEmailAddr },
        attributes: ['memberEmail'],
        raw: true
      });
      const companyEmails = [ownerEmailAddr.toLowerCase(), ...teamMembers.map(m => m.memberEmail.toLowerCase())];
      jobEmailsToQuery = [...new Set(companyEmails.filter(Boolean))];
    }

    const whereClause = {
      isActive: true
      // Deleted jobs are already filtered by isActive: false
    };

    if (isOwner) {
      whereClause.employerEmail = { [Op.in]: jobEmailsToQuery };
    } else {
      // Team member: show only their own posted jobs OR jobs assigned to them
      whereClause[Op.or] = [
        { employerEmail: { [Op.iLike]: employerEmail } },
        { assignedTo: { [Op.iLike]: employerEmail } }
      ];
    }

    const { assignedTo } = req.query;
    if (assignedTo) {
      whereClause.assignedTo = assignedTo;
    }

    const jobs = await Job.findAll({
      where: whereClause,
      order: [['createdAt', 'DESC']]
    });

    const jobIds = jobs.map(j => j.id).filter(Boolean);
    const positionIds = jobs.map(j => j.positionId).filter(Boolean);

    // Filter positionIds and jobIds to ensure we only query valid UUIDs on the jobId column
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const validJobIds = jobIds.filter(id => uuidRegex.test(id));
    const validPositionIdsAsUuid = positionIds.filter(id => uuidRegex.test(id));
    const allValidUuidJobIds = [...new Set([...validJobIds, ...validPositionIdsAsUuid])];

    const orConditions = [];
    if (isOwner) {
      const emailConditions = jobEmailsToQuery.map(email => ({ employerEmail: { [Op.iLike]: email } }));
      orConditions.push(...emailConditions);
    } else {
      orConditions.push({ employerEmail: { [Op.iLike]: employerEmail } });
    }

    if (allValidUuidJobIds.length > 0) {
      orConditions.push({ jobId: { [Op.in]: allValidUuidJobIds } });
    }

    // Fetch ALL applications and interviews for this company team - ultra reliable
    let allApps = [];
    let allInts = [];

    try {
      allApps = await Application.findAll({
        where: {
          [Op.or]: orConditions
        },
        raw: true
      });
    } catch (e) {
      console.error('Analytics: App fetch fallback', e.message);
      allApps = await Application.findAll({
        where: allValidUuidJobIds.length > 0 ? { jobId: { [Op.in]: allValidUuidJobIds } } : { id: null },
        raw: true
      });
    }

    try {
      allInts = await Interview.findAll({
        where: {
          [Op.or]: orConditions
        },
        raw: true
      });
    } catch (e) {
      console.error('Analytics: Interview fetch fallback', e.message);
      allInts = await Interview.findAll({
        where: allValidUuidJobIds.length > 0 ? { jobId: { [Op.in]: allValidUuidJobIds } } : { id: null },
        raw: true
      });
    }
    
    console.log(`🔍 [ANALYTICS] Debug Status:`);
    console.log(`- Employer: ${employerEmail}`);
    console.log(`- Jobs found: ${jobs.length}`);
    console.log(`- Applications fetched: ${allApps.length}`);
    console.log(`- Interviews fetched: ${allInts.length}`);
    if (allApps.length > 0) {
      console.log(`- Sample App 0 JobID: ${allApps[0].jobId}`);
    }

    // In-memory aggregation with broad matching
    const statsMap = {};
    let matchedApps = 0;

    allApps.forEach(app => {
      // Robust key check for raw query results
      const jid = app.jobId || app.jobid || app.JobId || app.job_id || app.JOBID;
      if (!jid) return;

      const jidStr = String(jid).toLowerCase();
      const job = jobs.find(j =>
        (j.id && String(j.id).toLowerCase() === jidStr) ||
        (j.positionId && String(j.positionId).toLowerCase() === jidStr)
      );

      if (!job) {
        if (matchedApps < 20) {
          console.warn(`⚠️ [ANALYTICS] App ${app.id} (Candidate: ${app.candidateName}) has jobId ${jid} which matches NO jobs for this employer.`);
          console.log(`   Expected JobIDs (first 5): ${jobIds.slice(0, 5).join(', ')}`);
        }
        return;
      }

      matchedApps++;
      const key = job.id;
      if (!statsMap[key]) statsMap[key] = { apps: 0, hired: 0, rejected: 0, sched: 0, comp: 0 };

      statsMap[key].apps++;
      const s = (app.status || '').toLowerCase();
      if (s === 'hired') statsMap[key].hired++;
      else if (s === 'rejected') statsMap[key].rejected++;
    });

    console.log(`✅ [ANALYTICS] Matched ${matchedApps} of ${allApps.length} applications to active jobs.`);

    let matchedInts = 0;
    allInts.forEach(intl => {
      const jid = intl.jobId || intl.jobid || intl.JobId || intl.job_id || intl.JOBID;
      if (!jid) return;

      const jidStr = String(jid).toLowerCase();
      const job = jobs.find(j =>
        (j.id && String(j.id).toLowerCase() === jidStr) ||
        (j.positionId && String(j.positionId).toLowerCase() === jidStr)
      );

      if (!job) return;

      matchedInts++;
      const key = job.id;
      if (!statsMap[key]) statsMap[key] = { apps: 0, hired: 0, rejected: 0, sched: 0, comp: 0 };

      const s = (intl.status || '').toLowerCase();
      if (['scheduled', 'confirmed', 'rescheduled'].includes(s)) statsMap[key].sched++;
      else if (s === 'completed') statsMap[key].comp++;
    });

    const jobsWithLogos = jobs.map(job => {
      const jobJson = job.toJSON();
      const s = statsMap[job.id] || { apps: 0, hired: 0, rejected: 0, sched: 0, comp: 0 };
      return {
        ...jobJson,
        jobCode: formatJobCode(job.positionId, job.company),
        companyLogo: getCompanyLogo(job.company, job.companyLogo),
        salary: { min: jobJson.salaryMin, max: jobJson.salaryMax, currency: jobJson.currency },
        applicationCount: s.apps,
        interviewScheduled: s.sched,
        interviewCompleted: s.comp,
        hired: s.hired,
        rejected: s.rejected
      };
    });

    // Calculate total applications and interview stats across ALL fetched data
    const totalAppsCount = allApps.length;
    const totalIntsCount = allInts.length;
    const totalHiresCount = allApps.filter(a => (a.status || '').toLowerCase() === 'hired').length;
    const totalRejectedCount = allApps.filter(a => (a.status || '').toLowerCase() === 'rejected').length;

    res.setHeader('x-total-applications', String(totalAppsCount));
    res.setHeader('x-total-interviews', String(totalIntsCount));
    res.setHeader('x-total-hired', String(totalHiresCount));
    res.setHeader('x-total-rejected', String(totalRejectedCount));
    res.setHeader('Access-Control-Expose-Headers', 'x-total-applications, x-total-interviews, x-total-hired, x-total-rejected');

    res.json(jobsWithLogos);
  } catch (error) {
    console.error('CRITICAL: Employer jobs route failed:', error);
    res.status(500).json({ error: 'Failed to fetch jobs with analytics' });
  }
});

// GET /api/jobs/position/:positionId - Get job by position ID
router.get('/position/:positionId', async (req, res) => {
  try {
    const job = await Job.findOne({ where: { positionId: req.params.positionId, isActive: true } });
    if (!job) return res.status(404).json({ error: 'Job not found' });
    const jobJson = job.toJSON();
    res.json({
      ...jobJson,
      jobCode: formatJobCode(job.positionId, job.company),
      companyLogo: getCompanyLogo(job.company, job.companyLogo),
      jobHeaderImage: jobJson.jobHeaderImage || getJobHeaderImage(job.jobTitle, job.skills || []),
      salary: { min: jobJson.salaryMin, max: jobJson.salaryMax, currency: jobJson.currency }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/jobs/search/query - Quick search endpoint
router.get('/search/query', async (req, res) => {
  try {
    const { q, limit = 10, page = 1 } = req.query;

    if (!q || q.trim().length === 0) {
      return res.json([]);
    }

    const where = {
      isActive: true,
      status: 'approved',
      [Op.or]: [
        { jobTitle: { [Op.iLike]: `%${q}%` } },
        { company: { [Op.iLike]: `%${q}%` } },
        { description: { [Op.iLike]: `%${q}%` } },
        { skills: { [Op.contains]: [q] } }
      ]
    };

    const jobs = await Job.findAll({
      where,
      order: [[literal('GREATEST(COALESCE("lastRefreshedAt", \'1970-01-01\'::timestamp), "createdAt")'), 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit)
    });

    const jobsWithLogos = jobs.map(job => {
      const jobJson = job.toJSON();
      return {
        ...jobJson,
        jobCode: formatJobCode(job.positionId, job.company),
        companyLogo: getCompanyLogo(job.company, job.companyLogo),
        salary: {
          min: jobJson.salaryMin,
          max: jobJson.salaryMax,
          currency: jobJson.currency
        }
      };
    });

    res.json(jobsWithLogos);
  } catch (error) {
    console.error('Search query error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/jobs/search - General search endpoint
router.get('/search', async (req, res) => {
  try {
    const { q, location, jobType, limit = 10, page = 1 } = req.query;
    const where = { isActive: true, status: 'approved' };

    if (q) {
      where[Op.or] = [
        { jobTitle: { [Op.iLike]: `%${q}%` } },
        { company: { [Op.iLike]: `%${q}%` } },
        { description: { [Op.iLike]: `%${q}%` } }
      ];
    }

    if (location) where.location = { [Op.iLike]: `%${location}%` };
    if (jobType) where.jobType = Array.isArray(jobType) ? { [Op.in]: jobType } : jobType;

    const jobs = await Job.findAll({
      where,
      order: [[literal('GREATEST(COALESCE("lastRefreshedAt", \'1970-01-01\'::timestamp), "createdAt")'), 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit)
    });

    const jobsWithLogos = jobs.map(job => {
      const jobJson = job.toJSON();
      return {
        ...jobJson,
        jobCode: formatJobCode(job.positionId, job.company),
        companyLogo: getCompanyLogo(job.company, job.companyLogo),
        salary: {
          min: jobJson.salaryMin,
          max: jobJson.salaryMax,
          currency: jobJson.currency
        }
      };
    });

    res.json(jobsWithLogos);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/jobs/bulk-refresh - Refresh multiple jobs (must be before /:id routes)
router.post('/bulk-refresh', async (req, res) => {
  try {
    const { jobIds, userPlan = 'free' } = req.body;
    const result = await JobRefreshService.refreshMultipleJobs(jobIds, userPlan);
    res.json(result);
  } catch (error) {
    console.error('Error in bulk refresh endpoint:', error);
    res.status(500).json({ success: false, message: error.message, code: 'INTERNAL_ERROR' });
  }
});

// POST /api/jobs/bulk - Create multiple jobs at once with queued processing
router.post('/bulk', authenticateToken, maxJobsGuard, async (req, res) => {
  try {
    const company = req.user.company || req.user.companyName;
    if (!company) {
      return res.status(400).json({ error: 'No company found on your account. Please complete your company profile before posting jobs.' });
    }

    const { jobs: jobsPayload } = req.body;
    if (!Array.isArray(jobsPayload) || jobsPayload.length === 0) {
      return res.status(400).json({ error: 'jobs array is required' });
    }
    if (jobsPayload.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 jobs per bulk request' });
    }

    const user = req.user;
    const employerEmail = user.email;
    let employerId = user.employerId;
    if (!employerId) {
      employerId = await generateEmployerId();
      await user.update({ employerId });
    }

    const results = [];
    const DELAY_MS = 150; // throttle between inserts to avoid DB overload

    for (const jobData of jobsPayload) {
      try {
        // Normalize
        if (Array.isArray(jobData.jobType)) jobData.jobType = jobData.jobType[0] || 'Full-time';
        const validExpLevels = ['Entry', 'Mid', 'Senior', 'Lead'];
        if (!validExpLevels.includes(jobData.experienceLevel)) jobData.experienceLevel = 'Mid';
        if (jobData.salary) {
          jobData.salaryMin = jobData.salary.min;
          jobData.salaryMax = jobData.salary.max;
          jobData.currency = jobData.salary.currency || jobData.currency;
          delete jobData.salary;
        }
        jobData.skills = normalizeArray(jobData.skills);
        jobData.languages = normalizeArray(jobData.languages || []);

        // Strip any client-provided company — always use the auth-derived company
        delete jobData.company;
        jobData.company = company;

        // Auto-link company
        let companyId = null;
        try {
          const companyName = jobData.company?.trim();
          if (companyName) {
            const foundCompany = await Company.findOne({ where: { name: { [Op.iLike]: companyName } } });
            if (foundCompany) companyId = foundCompany.id;
          }
        } catch { /* non-blocking */ }

        const positionId = await generatePositionIdWithYear().catch(() => generatePositionId());

        const job = await Job.create({
          jobTitle: jobData.jobTitle,
          company: jobData.company,
          companyLogo: user?.companyLogo || null,
          location: jobData.location || jobData.jobLocation || 'Remote',
          jobType: jobData.jobType || 'Full-time',
          description: formatDescriptionWithBullets(jobData.description || jobData.jobDescription || ''),
          requirements: jobData.requirements || '',
          responsibilities: jobData.responsibilities || '',
          skills: jobData.skills,
          salaryMin: jobData.salaryMin,
          salaryMax: jobData.salaryMax,
          currency: jobData.currency || 'USD',
          payRate: jobData.payRate || null,
          payType: jobData.payType || null,
          experienceLevel: jobData.experienceLevel || 'Mid',
          experienceRange: jobData.experienceRange || null,
          jobCategory: jobData.jobCategory || getCategoryFromTitle(jobData.jobTitle),
          languages: jobData.languages,
          country: jobData.country || null,
          locationType: jobData.locationType || null,
          noticePeriod: jobData.noticePeriod || null,
          employerId,
          positionId,
          status: getJobStatus(),
          employerEmail,
          postedBy: employerEmail,
          postedByName: user?.name || user?.fullName || employerEmail.split('@')[0],
          companyId,
          refreshCount: 0,
          originalPostedAt: new Date(),
        });

        const slug = generateSlug(job.jobTitle, job.company, job.id);
        await job.update({ slug });
        geocodeLocation(job.location).then(coords => {
          if (coords) job.update({ latitude: coords.latitude, longitude: coords.longitude }).catch(() => { });
        }).catch(() => { });
        vectorService.upsertJobEmbedding(job.id, job.toJSON()).catch(() => { });

        // Trigger job alert notifications for bulk jobs (non-blocking)
        try {
          await JobAlertService.processNewJob(job);
        } catch (alertErr) {
          console.error('⚠️  Bulk job alert processing failed:', alertErr.message);
        }

        results.push({ success: true, id: job.id, jobTitle: job.jobTitle });
      } catch (jobErr) {
        results.push({ success: false, jobTitle: jobData.jobTitle, error: jobErr.message });
      }

      // Throttle between inserts
      await new Promise(r => setTimeout(r, DELAY_MS));
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.length - successCount;
    res.status(201).json({ successCount, failCount, results });
  } catch (error) {
    console.error('Bulk job create error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/jobs/refresh/analytics - Get refresh analytics (must be before /:id routes)
router.get('/refresh/analytics', async (req, res) => {
  try {
    const { employerEmail, userPlan = 'free' } = req.query;
    if (!employerEmail) {
      return res.status(400).json({ success: false, message: 'Employer email is required', code: 'MISSING_EMAIL' });
    }
    const result = await JobRefreshService.getRefreshAnalytics(employerEmail, userPlan);
    res.json(result);
  } catch (error) {
    console.error('Error in refresh analytics endpoint:', error);
    res.status(500).json({ success: false, message: error.message, code: 'INTERNAL_ERROR' });
  }
});

// POST /api/jobs/upload-banner - Upload and process job banner image
router.post('/upload-banner', authenticateToken, (req, res, next) => {
  bannerUpload.single('banner')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'File size exceeds 5MB limit' });
        }
        return res.status(400).json({ error: `Upload error: ${err.message}` });
      }
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const buffer = req.file.buffer;

    // Try S3 upload first, fall back to local disk
    let fileUrl;
    try {
      fileUrl = await uploadJobBannerToS3(buffer, req.file.originalname);
    } catch (s3Err) {
      console.warn('[Jobs] S3 upload failed, falling back to local disk:', s3Err.message);
      const uploadDir = path.join(__dirname, '..', 'uploads', 'job-banners');
      fileUrl = await uploadJobBannerToDisk(buffer, req.file.originalname, uploadDir);
    }

    console.log('[Jobs] Banner uploaded successfully:', fileUrl);
    res.json({ fileUrl, success: true });
  } catch (error) {
    console.error('[Jobs] Banner upload error:', error);
    res.status(500).json({ error: 'Failed to upload banner image: ' + error.message });
  }
});

// POST /api/jobs - Create new job (company derived from authenticated employer)
router.post('/', authenticateToken, maxJobsGuard, [
  body('jobTitle').trim().notEmpty().withMessage('Job title is required'),
  body('location').notEmpty().withMessage('Location is required'),
  body('jobType').custom(val => {
    const valid = ['Full-time', 'Part-time', 'Contract', 'Freelance', 'Internship', 'Temporary'];
    const types = Array.isArray(val) ? val : [val];
    if (!types.length) throw new Error('Job type is required');
    if (!types.every(t => valid.includes(t))) throw new Error('Invalid job type');
    return true;
  }),
  body('description').notEmpty().withMessage('Description is required').isLength({ max: 5000 }).withMessage('Description cannot exceed 5000 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Company is always derived from the authenticated employer — never from the client
    const company = req.user.company || req.user.companyName;
    if (!company) {
      return res.status(400).json({ error: 'No company found on your account. Please complete your company profile before posting jobs.' });
    }

    const user = req.user;
    const employerEmail = user.email;
    let employerId = user.employerId;

    if (!employerId) {
      employerId = await generateEmployerId();
      await user.update({ employerId });
    }

    const resolvedEmployerEmail = employerEmail;

    const jobData = { ...req.body };
    // Strip any client-provided company/employerEmail to prevent frontend manipulation
    delete jobData.company;
    delete jobData.employerEmail;
    delete jobData.postedBy;
    jobData.company = company;

    // Normalize jobType - handle array, string array literal {"Full-time"}, or plain string
    if (Array.isArray(jobData.jobType)) {
      jobData.jobType = jobData.jobType[0] || 'Full-time';
    } else if (typeof jobData.jobType === 'string') {
      // Strip PostgreSQL array literal format e.g. {"Full-time"} or {Full-time}
      const match = jobData.jobType.match(/^\{"?([^"\}]+)"?\}$/);
      if (match) jobData.jobType = match[1];
    }
    if (!jobData.jobType || typeof jobData.jobType !== 'string') jobData.jobType = 'Full-time';

    // Normalize experienceLevel - default to 'Mid' if empty or invalid
    const validExpLevels = ['Entry', 'Mid', 'Senior', 'Lead'];
    if (!jobData.experienceLevel || !validExpLevels.includes(jobData.experienceLevel)) {
      jobData.experienceLevel = 'Mid';
    }

    // Flatten salary object if it exists
    if (jobData.salary) {
      jobData.salaryMin = jobData.salary.min;
      jobData.salaryMax = jobData.salary.max;
      jobData.currency = jobData.salary.currency || jobData.currency;
      delete jobData.salary;
    }

    console.log('Available functions:', { generateEmployerId, generatePositionId, generatePositionIdWithYear });

    // Generate position ID with year - inline fallback if import fails
    const generatePositionIdWithYearFallback = async () => {
      const year = new Date().getFullYear();
      const sequence = await generatePositionId();
      return `${year}-${sequence}`;
    };

    const positionId = typeof generatePositionIdWithYear === 'function'
      ? await generatePositionIdWithYear()
      : await generatePositionIdWithYearFallback();

    // Ensure skills and languages are properly formatted as arrays
    jobData.skills = normalizeArray(jobData.skills);
    jobData.languages = normalizeArray(jobData.languages);

    console.log('Skills before create:', jobData.skills, 'Type:', typeof jobData.skills, 'IsArray:', Array.isArray(jobData.skills));
    console.log('JobType before create:', jobData.jobType, 'Type:', typeof jobData.jobType);
    console.log('Full jobData object being sent to Job.create:', JSON.stringify(jobData, null, 2));

    // Auto-assign category if not provided
    const autoCategory = jobData.jobCategory || getCategoryFromTitle(jobData.jobTitle);

    // Explicitly construct the job creation object to avoid any spread issues
    // Auto-link to Company table (only if company already exists — no auto-create)
    let companyId = null;
    try {
      const companyName = jobData.company?.trim();
      if (companyName) {
        const company = await Company.findOne({ where: { name: { [Op.iLike]: companyName } } });
        if (company) companyId = company.id;
      }
    } catch (e) {
      console.warn('Company auto-link failed:', e.message);
    }

    // New validation: If assignedTo is provided, it MUST be a valid team member of this company
    if (jobData.assignedTo) {
      const isTeamMember = await TeamMember.findOne({
        where: {
          employerId: resolvedEmployerEmail,
          memberEmail: { [Op.iLike]: jobData.assignedTo.trim() }
        }
      });
      if (!isTeamMember) {
        return res.status(400).json({ error: `Invalid assignment: ${jobData.assignedTo} is not a registered team member of this company.` });
      }
    }

    const jobCreateData = {
      jobTitle: jobData.jobTitle,
      company: jobData.company,
      companyLogo: user?.companyLogo || null,
      jobHeaderImage: jobData.jobHeaderImage || getJobHeaderImage(jobData.jobTitle, jobData.skills || []),
      location: jobData.location,
      jobType: jobData.jobType, // This should be a string now
      workSetting: jobData.workSetting,
      description: formatDescriptionWithBullets(jobData.description),
      requirements: jobData.requirements,
      responsibilities: jobData.responsibilities,
      skills: jobData.skills, // This should be an array
      salaryMin: jobData.salaryMin,
      salaryMax: jobData.salaryMax,
      currency: jobData.currency,
      payRate: jobData.payRate || null,
      payType: jobData.payType || null,
      experienceLevel: jobData.experienceLevel,
      jobCategory: autoCategory,
      experienceRange: jobData.experienceRange || null,
      languages: normalizeArray(jobData.languages),
      country: jobData.country || null,
      employerId,
      positionId: positionId,
      status: getJobStatus(),
      employerEmail: resolvedEmployerEmail,
      postedBy: resolvedEmployerEmail,
      postedByName: user?.name || user?.fullName || jobData.postedByName || resolvedEmployerEmail.split('@')[0],
      assignedTo: jobData.assignedTo || null,
      companyId,
      refreshCount: 0,
      originalPostedAt: new Date()
    };

    console.log('Final jobCreateData:', JSON.stringify(jobCreateData, null, 2));

    const job = await Job.create(jobCreateData);
    // Generate and save slug after creation (needs the UUID)
    const slug = generateSlug(job.jobTitle, job.company, job.id);

    // Geocode location for radius search (non-blocking)
    geocodeLocation(jobCreateData.location).then(coords => {
      if (coords) job.update({ latitude: coords.latitude, longitude: coords.longitude }).catch(() => { });
    }).catch(() => { });

    await job.update({ slug });

    // Index for semantic search (non-blocking)
    vectorService.upsertJobEmbedding(job.id, job.toJSON()).catch(() => { });

    // Trigger job alert notifications (non-blocking — must not fail job creation)
    try {
      await JobAlertService.processNewJob(job);
    } catch (alertErr) {
      console.error('⚠️  Job alert processing failed (job still created):', alertErr.message);
    }

    console.log('Job created - Employer ID:', employerId, 'Position ID:', job.positionId, 'Job ID:', job.id);
    res.status(201).json(job);
  } catch (error) {
    console.error('Error creating job:', error);
    res.status(400).json({ error: error.message });
  }
});

// GET /api/jobs/:id - Get single job (supports both UUID and positionId)
router.get('/:id', async (req, res) => {
  try {
    let job = await Job.findByPk(req.params.id);
    if (!job) {
      job = await Job.findOne({ where: { positionId: req.params.id, isActive: true } });
    }
    if (!job) return res.status(404).json({ error: 'Job not found' });
    const jobJson = job.toJSON();
    res.json({
      ...jobJson,
      jobCode: formatJobCode(job.positionId, job.company),
      companyLogo: getCompanyLogo(job.company, job.companyLogo),
      jobHeaderImage: jobJson.jobHeaderImage || getJobHeaderImage(job.jobTitle, job.skills || []),
      salary: { min: jobJson.salaryMin, max: jobJson.salaryMax, currency: jobJson.currency }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/jobs/:id - Delete job (soft delete by default, use /permanent for hard delete)
router.delete('/:id', async (req, res) => {
  try {
    const job = await Job.findByPk(req.params.id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    // Soft delete - mark as inactive only (no status change to avoid ENUM error)
    await job.update({ isActive: false });
    
    console.log(`✅ Job ${req.params.id} soft deleted (isActive: false)`);
    res.json({ message: 'Job deleted successfully', jobId: job.id });
  } catch (error) {
    console.error('❌ Job delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/jobs/:id/permanent - Permanently delete job
router.delete('/:id/permanent', authenticateToken, requireRole(['employer', 'admin']), requireTeamRole(['Owner']), async (req, res) => {
  try {
    const deleted = await Job.destroy({ where: { id: req.params.id } });
    if (!deleted) {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.json({ message: 'Job permanently deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/jobs/:id - Update job
router.put('/:id', async (req, res) => {
  try {
    const job = await Job.findByPk(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const allowed = ['jobTitle', 'location', 'jobType', 'workSetting', 'description',
      'requirements', 'responsibilities', 'skills', 'salaryMin', 'salaryMax', 'currency',
      'payRate', 'payType', 'experienceLevel', 'jobCategory', 'experienceRange', 'languages', 'country',
      'applicationDeadline', 'isActive', 'status', 'jobHeaderImage', 'assignedTo', 'postedByName'];

    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    // Flatten salary object if sent
    if (req.body.salary) {
      updates.salaryMin = req.body.salary.min;
      updates.salaryMax = req.body.salary.max;
      if (req.body.salary.currency) updates.currency = req.body.salary.currency;
    }

    // Format description with bullets if updated
    if (updates.description) {
      updates.description = formatDescriptionWithBullets(updates.description);
    }

    if (updates.jobType) {
      if (Array.isArray(updates.jobType)) updates.jobType = updates.jobType[0] || 'Full-time';
      const match = typeof updates.jobType === 'string' && updates.jobType.match(/^\{"?([^"\}]+)"?\}$/);
      if (match) updates.jobType = match[1];
    }
    const validExpLevels = ['Entry', 'Mid', 'Senior', 'Lead'];
    if (updates.experienceLevel !== undefined && !validExpLevels.includes(updates.experienceLevel)) {
      updates.experienceLevel = 'Mid';
    }
    if (updates.skills !== undefined) updates.skills = normalizeArray(updates.skills);
    if (updates.languages !== undefined) updates.languages = normalizeArray(updates.languages);
    if (updates.country) updates.country = updates.country.trim();

    await job.update(updates);
    // Re-geocode if location changed (non-blocking)
    if (updates.location) {
      geocodeLocation(updates.location).then(coords => {
        if (coords) job.update({ latitude: coords.latitude, longitude: coords.longitude }).catch(() => { });
      }).catch(() => { });
    }
    // Re-index after update (non-blocking)
    vectorService.upsertJobEmbedding(job.id, job.toJSON()).catch(() => { });
    const jobJson = job.toJSON();
    res.json({
      ...jobJson,
      jobCode: formatJobCode(job.positionId, job.company),
      companyLogo: getCompanyLogo(job.company, job.companyLogo),
      salary: { min: jobJson.salaryMin, max: jobJson.salaryMax, currency: jobJson.currency }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/jobs/:id/reactivate - Reactivate a deleted job
router.put('/:id/reactivate', async (req, res) => {
  try {
    const job = await Job.findByPk(req.params.id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    await job.update({ isActive: true });

    res.json({ message: 'Job reactivated successfully', job });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/jobs/:id/refresh - Refresh a job posting
router.post('/:id/refresh', async (req, res) => {
  try {
    const { userPlan = 'free' } = req.body;
    const result = await JobRefreshService.refreshJob(req.params.id, userPlan);

    if (result.success) {
      res.json(result);
    } else {
      const statusCode = result.code === 'JOB_NOT_FOUND' ? 404 : 400;
      res.status(statusCode).json(result);
    }
  } catch (error) {
    console.error('Error in refresh endpoint:', error);
    res.status(500).json({
      success: false,
      message: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

// GET /api/jobs/:id/refresh-status - Get refresh status for a job
router.get('/:id/refresh-status', async (req, res) => {
  try {
    const { userPlan = 'free' } = req.query;
    const result = await JobRefreshService.getRefreshStatus(req.params.id, userPlan);

    if (result.success) {
      res.json(result);
    } else {
      const statusCode = result.code === 'JOB_NOT_FOUND' ? 404 : 500;
      res.status(statusCode).json(result);
    }
  } catch (error) {
    console.error('Error in refresh status endpoint:', error);
    res.status(500).json({
      success: false,
      message: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

export default router;
