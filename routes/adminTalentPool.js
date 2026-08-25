import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Op, col, fn, literal } from 'sequelize';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleAuth.js';
import nodemailer from 'nodemailer';
import TalentCandidate from '../models/TalentCandidate.js';
import Skill from '../models/Skill.js';
import CandidateSkill from '../models/CandidateSkill.js';
import '../models/associations.js';
import { uploadResumeToS3, uploadTalentResumeToS3, getResumeStreamFromS3 } from '../services/s3Service.js';
import { normalizeSkillName, getNormalizedSkillNames } from '../services/skillNormalizer.js';
import { computeTotalExperience, extractExperienceYearsFromText } from '../services/experienceCalculator.js';
import { baseTemplate, ctaButton, divider, featureCard, getFrontendUrl } from '../services/emailTemplates.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = express.Router();

// In-memory progress tracker for bulk uploads (visible via /processing-status)
const processingState = {
  isProcessing: false,
  status: '',
  processed: 0,
  total: 0,
  success: 0,
  failed: 0,
  startedAt: null
};

// Storage
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx', '.txt'];
    allowed.includes(path.extname(file.originalname).toLowerCase()) ? cb(null, true) : cb(new Error('PDF, DOC, DOCX, TXT only'));
  },
  limits: { fileSize: 10 * 1024 * 1024 }
});

// ── Shared helpers ────────────────────────────────────────────────────────

// Upsert normalized skills + candidate_skills join rows (replaces previous rows)
async function saveCandidateSkills(candidateId, skillsArray) {
  const names = getNormalizedSkillNames(skillsArray);
  await CandidateSkill.destroy({ where: { candidateId } });
  for (const name of names) {
    const [skill] = await Skill.findOrCreate({
      where: { name },
      defaults: { name, normalizedName: name.toLowerCase() }
    });
    await CandidateSkill.findOrCreate({
      where: { candidateId, skillId: skill.id },
      defaults: { candidateId, skillId: skill.id }
    });
  }
  return names;
}

// Strict field validation — ensures each field only contains its intended data type
function sanitizeField(value, fieldType) {
  if (!value || typeof value !== 'string') return '';
  const v = value.trim();
  
  switch (fieldType) {
    case 'name':
      // Only letters, spaces, dots, hyphens - no digits, @, +, job title keywords
      if (/[\d@+]/.test(v)) return '';
      if (/\b(developer|engineer|manager|analyst|intern|architect|consultant|director|lead|senior|junior|hr|ceo|cto|founder|student|fresher|software|full.?stack|front.?end|back.?end|data|devops|cloud|mobile|web|recruiter|designer|tester|qa|admin|executive|specialist|associate|coordinator|officer|president|vice|head|principal|staff|trainee)\b/i.test(v)) return '';
      if (!/^[A-Za-z][A-Za-z.'\-\s]{1,50}$/.test(v)) return '';
      if (v.split(/\s+/).length > 4) return ''; // Max 4 words
      return v.replace(/\b\w+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    
    case 'email':
      if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(v)) return '';
      return v.toLowerCase();
    
    case 'phone':
      // Only digits, +, -, spaces, parentheses - no letters
      if (/[a-zA-Z]/.test(v)) return '';
      const digits = v.replace(/\D/g, '');
      if (digits.length < 10 || digits.length > 15) return '';
      // Reject years/date ranges
      if (/^(19|20)\d{2}/.test(digits)) return '';
      return v;
    
    case 'jobTitle':
      // Should contain role keywords, not names or contact info
      if (/[@+]/.test(v)) return '';
      if (/^\d+$/.test(v)) return '';
      if (v.split(/\s+/).length > 6) return '';
      return v;
    
    case 'location':
      // City names only - no emails, phones, job titles
      if (/[@+]/.test(v)) return '';
      if (/\b(developer|engineer|manager|analyst|intern|hr|ceo|cto)\b/i.test(v)) return '';
      if (v.length > 50) return '';
      return v;
    
    case 'company':
      // Company names - no emails, phones
      if (/[@+]/.test(v)) return '';
      if (v.length > 100) return '';
      return v;
    
    case 'summary':
      // Max 2000 chars, no contact info
      if (v.length > 2000) return v.substring(0, 2000);
      return v;
    
    default:
      return v;
  }
}

function sanitizeArray(arr, fieldType) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map(item => {
      if (typeof item === 'object' && item !== null) {
        // For objects (workExperiences, educations, etc.), sanitize each field
        const sanitized = {};
        for (const [key, val] of Object.entries(item)) {
          if (key === 'jobTitle' || key === 'title') sanitized[key] = sanitizeField(String(val || ''), 'jobTitle');
          else if (key === 'company' || key === 'school') sanitized[key] = sanitizeField(String(val || ''), 'company');
          else if (key === 'degree') sanitized[key] = sanitizeField(String(val || ''), 'jobTitle'); // degree like jobTitle
          else if (key === 'name') sanitized[key] = sanitizeField(String(val || ''), 'jobTitle'); // project name
          else if (key === 'descriptions' && Array.isArray(val)) sanitized[key] = val.map(d => sanitizeField(String(d || ''), 'summary'));
          else sanitized[key] = String(val || '');
        }
        return sanitized;
      }
      return sanitizeField(String(item || ''), fieldType);
    })
    .filter(item => {
      if (typeof item === 'string') return item.length > 0;
      if (typeof item === 'object') return Object.values(item).some(v => v && v.length > 0);
      return false;
    });
}

// Build the create payload from a parse result + file metadata
let candidateIdCounter = 0;
function candidateRecordFromParsed(parsed, { fileName, fileUrl, fileSize = 0 }) {
  const skillsArray = sanitizeArray(Array.isArray(parsed.skills) ? parsed.skills : [], 'jobTitle');
  const workExps = sanitizeArray(Array.isArray(parsed.workExperiences) ? parsed.workExperiences : [], 'jobTitle');
  const internships = sanitizeArray(Array.isArray(parsed.internships) ? parsed.internships : [], 'jobTitle');
  const educations = sanitizeArray(Array.isArray(parsed.educations) ? parsed.educations : [], 'jobTitle');
  const projects = sanitizeArray(Array.isArray(parsed.projects) ? parsed.projects : [], 'jobTitle');
  const certifications = sanitizeArray(Array.isArray(parsed.certifications) ? parsed.certifications : [], 'jobTitle');
  
  const totalExperience = computeTotalExperience(workExps) ?? extractExperienceYearsFromText(parsed.rawText || '');
  const currentCompany = workExps.length
    ? (workExps[workExps.length - 1].company || workExps[0].company || '')
    : '';
  const ext = fileName ? path.extname(fileName).toLowerCase() : '';
  
  // Strict sanitization of each field
  const name = sanitizeField(parsed.name || '', 'name');
  const email = sanitizeField(parsed.email || '', 'email');
  const phone = sanitizeField(parsed.phone || '', 'phone');
  const jobTitle = sanitizeField(parsed.title || '', 'jobTitle');
  const location = sanitizeField(parsed.location || '', 'location');
  const country = parsed.country || (location ? 'India' : '');
  const summary = sanitizeField(parsed.summary || '', 'summary');
  const tools = sanitizeArray(Array.isArray(parsed.tools) ? parsed.tools : [], 'jobTitle').join(', ');
  const softSkills = sanitizeArray(Array.isArray(parsed.softSkills) ? parsed.softSkills : [], 'jobTitle').join(', ');
  const languages = sanitizeArray(Array.isArray(parsed.languages) ? parsed.languages : [], 'jobTitle').join(', ');
  const awards = sanitizeArray(Array.isArray(parsed.awards) ? parsed.awards : [], 'jobTitle');
  
  const ok = !!(name || email);

  candidateIdCounter++;
  const candidateId = `ZC-${String(candidateIdCounter).padStart(6, '0')}`;

  return {
    id: `tp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    candidateId,
    name,
    email,
    phone,
    dob: sanitizeField(parsed.dob || '', 'phone'), // DOB similar to phone (digits only)
    skills: skillsArray.join(', '),
    experience: workExps.length ? `${workExps.length} role(s)` : '',
    totalExperience,
    jobTitle,
    currentCompany: sanitizeField(currentCompany, 'company'),
    summary,
    location,
    country,
    tools,
    softSkills,
    workExperiences: JSON.stringify(workExps),
    internships: JSON.stringify(internships),
    languages,
    awards: JSON.stringify(awards),
    educations: JSON.stringify(educations),
    projects: JSON.stringify(projects),
    certifications: JSON.stringify(certifications),
    resumePath: fileUrl,
    resumeFile: fileName,
    resumeOriginalName: fileName,
    resumeType: ext || '',
    resumeSize: fileSize,
    status: ok ? 'Parsed' : 'Error',
    parserStatus: ok ? 'Parsed' : 'Failed',
    parserError: ok ? '' : 'Could not extract name or email from resume',
    source: 'uploaded_resume',
    rawText: (parsed.rawText || '').substring(0, 2000)
  };
}

// Resolve a stored resume path to a displayable/downloadable URL
function resolveResumeUrl(candidate) {
  return candidate?.resumePath || '';
}

// Build a common filter object used by /search and /export
function buildTalentFilters(query = {}) {
  const where = {};
  const include = [];

  if (query.q) {
    const q = String(query.q).trim();
    where[Op.or] = [
      { jobTitle: { [Op.iLike]: `%${q}%` } },
      { name: { [Op.iLike]: `%${q}%` } },
      { skills: { [Op.iLike]: `%${q}%` } },
      { location: { [Op.iLike]: `%${q}%` } },
      { summary: { [Op.iLike]: `%${q}%` } },
      { experience: { [Op.iLike]: `%${q}%` } }
    ];
  }
  if (query.jobTitle) where.jobTitle = { [Op.iLike]: `%${String(query.jobTitle).trim()}%` };
  if (query.location) where.location = { [Op.iLike]: `%${String(query.location).trim()}%` };
  if (query.gender) where.gender = String(query.gender).trim();
  if ((query.expMin !== undefined && query.expMin !== '') || (query.expMax !== undefined && query.expMax !== '')) {
    where.totalExperience = {};
    if (query.expMin !== undefined && query.expMin !== '') where.totalExperience[Op.gte] = parseFloat(query.expMin);
    if (query.expMax !== undefined && query.expMax !== '') where.totalExperience[Op.lte] = parseFloat(query.expMax);
  }
  if (query.status) where.parserStatus = String(query.status);

  // Normalized skill filter — candidates having ALL the given skills
  if (query.skills) {
    const skillList = Array.isArray(query.skills) ? query.skills : String(query.skills).split(',').map(s => s.trim()).filter(Boolean);
    const normalized = skillList.map(normalizeSkillName).filter(Boolean);
    if (normalized.length) {
      include.push({
        model: CandidateSkill,
        as: 'candidateSkills',
        required: true,
        where: { [Op.and]: normalized.map(s => ({ '$candidateSkills.skill.normalizedName$': s.toLowerCase() })) },
        include: [{ model: Skill, as: 'skill', required: true }]
      });
    }
  }

  return { where, include };
}

// Serialize a candidate row for the search UI
function serializeCandidate(c) {
  const candidate = c.get ? c.get({ plain: true }) : c;
  const skills = Array.isArray(candidate.candidateSkills)
    ? candidate.candidateSkills
        .map(cs => cs.skill?.name || '')
        .filter(Boolean)
    : [];
  let workExperiences = [];
  try { workExperiences = JSON.parse(candidate.workExperiences || '[]'); } catch { /* ignore */ }
  let internships = [];
  try { internships = JSON.parse(candidate.internships || '[]'); } catch { /* ignore */ }
  let languages = [];
  try { languages = (candidate.languages || '').split(',').map(s => s.trim()).filter(Boolean); } catch { /* ignore */ }
  let awards = [];
  try { awards = JSON.parse(candidate.awards || '[]'); } catch { /* ignore */ }
  let educations = [];
  try { educations = JSON.parse(candidate.educations || '[]'); } catch { /* ignore */ }
  let projects = [];
  try { projects = JSON.parse(candidate.projects || '[]'); } catch { /* ignore */ }
  return {
    id: candidate.id,
    candidateId: candidate.candidate_id,
    name: candidate.name || '',
    email: candidate.email || '',
    phone: candidate.phone || '',
    gender: candidate.gender || '',
    dob: candidate.dob || '',
    jobTitle: candidate.jobTitle || '',
    currentCompany: candidate.currentCompany || '',
    location: candidate.location || '',
    country: candidate.country || '',
    summary: candidate.summary || '',
    skills: Array.isArray(candidate.candidateSkills) ? skills : (candidate.skills || '').split(',').map(s => s.trim()).filter(Boolean),
    totalExperience: candidate.totalExperience,
    workExperiences,
    internships,
    languages,
    awards,
    educations,
    projects,
    certifications: candidate.certifications || '',
    resumePath: candidate.resumePath || '',
    resumeUrl: resolveResumeUrl(candidate),
    resumeFile: candidate.resumeFile || '',
    resumeOriginalName: candidate.resumeOriginalName || '',
    resumeType: candidate.resumeType || '',
    status: candidate.status || '',
    parserStatus: candidate.parserStatus || '',
    parserError: candidate.parserError || '',
    retryCount: candidate.retryCount || 0,
    addedDate: candidate.addedDate || null
  };
}

// POST /api/admin/talent/upload
router.post('/upload', authenticateToken, requireRole(['admin']), upload.array('resumes', 2000), async (req, res) => {
  const resumeUrls = req.body.resumeUrls ? (Array.isArray(req.body.resumeUrls) ? req.body.resumeUrls : [req.body.resumeUrls]) : [];
  const fileNames = req.body.fileNames ? (Array.isArray(req.body.fileNames) ? req.body.fileNames : [req.body.fileNames]) : [];
  const uploadedFiles = req.files || [];

  if (!uploadedFiles.length && !resumeUrls.length) {
    return res.status(400).json({ error: 'No files or URLs provided' });
  }

  const pdfTextExtractor = (await import('../services/pdfTextExtractor.js')).default;
  const { resumeParser } = await import('../utils/resumeParserAI.js');
  const { getResumeStreamFromS3 } = await import('../services/s3Service.js');
  const results = [];

  const CONCURRENCY = 5;
  const BATCH_DELAY_MS = 500;

  async function parseAndSaveFromS3(s3Url, fileName) {
    try {
      const existing = await TalentCandidate.findOne({ where: { resumePath: s3Url } });
      if (existing) {
        console.log(`[TALENT] Already parsed, skipping: ${fileName}`);
        processingState.processed++;
        return { file: fileName, status: 'ok', name: existing.name, email: existing.email, skipped: true };
      }
      console.log(`[TALENT] Parsing: ${fileName} from ${s3Url}`);
      const { stream } = await getResumeStreamFromS3(s3Url);
      const chunks = [];
      let size = 0;
      for await (const chunk of stream) { chunks.push(chunk); size += chunk.length; }
      const buffer = Buffer.concat(chunks);
      const text = await pdfTextExtractor.extractTextFromBuffer(buffer, fileName);
      const parsed = await resumeParser.parseResumeToProfile(text);
      parsed.rawText = text;
      const record = candidateRecordFromParsed(parsed, { fileName, fileUrl: s3Url, fileSize: size });
      const candidate = await TalentCandidate.create(record);
      await saveCandidateSkills(candidate.id, parsed.skills);
      processingState.processed++;
      processingState.success++;
      return { file: fileName, status: 'ok', name: candidate.name, email: candidate.email };
    } catch (err) {
      console.error(`[TALENT] FAILED ${fileName}:`, err.message);
      processingState.processed++;
      processingState.failed++;
      return { file: fileName, status: 'error', error: err.message };
    }
  }

  async function parseAndSaveFromFile(file) {
    try {
      const { fileUrl, alreadyExists } = await uploadTalentResumeToS3(file.buffer, file.originalname);
      console.log(`Talent resume ${alreadyExists ? 'already existed' : 'uploaded'}: ${fileUrl}`);
      const existing = await TalentCandidate.findOne({ where: { resumePath: fileUrl } });
      if (existing) {
        processingState.processed++;
        return { file: file.originalname, status: 'ok', name: existing.name, email: existing.email, skipped: true };
      }
      const text = await pdfTextExtractor.extractTextFromBuffer(file.buffer, file.originalname);
      const parsed = await resumeParser.parseResumeToProfile(text);
      parsed.rawText = text;
      const record = candidateRecordFromParsed(parsed, { fileName: file.originalname, fileUrl, fileSize: file.size });
      const candidate = await TalentCandidate.create(record);
      await saveCandidateSkills(candidate.id, parsed.skills);
      processingState.processed++;
      processingState.success++;
      return { file: file.originalname, status: 'ok', name: candidate.name, email: candidate.email };
    } catch (err) {
      processingState.processed++;
      processingState.failed++;
      return { file: file.originalname, status: 'error', error: err.message };
    }
  }

  const s3Tasks = resumeUrls.map((url, index) => {
    const fileName = fileNames[index] || `resume_${index + 1}`;
    return () => parseAndSaveFromS3(url, fileName);
  });
  const fileTasks = uploadedFiles.map(file => () => parseAndSaveFromFile(file));
  const allTasks = [...s3Tasks, ...fileTasks];

  processingState.isProcessing = true;
  processingState.status = 'Processing resumes';
  processingState.processed = 0;
  processingState.total = allTasks.length;
  processingState.success = 0;
  processingState.failed = 0;
  processingState.startedAt = new Date().toISOString();

  for (let i = 0; i < allTasks.length; i += CONCURRENCY) {
    const batch = allTasks.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(task => task()));
    results.push(...batchResults);
    if (i + CONCURRENCY < allTasks.length) await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
  }

  processingState.isProcessing = false;
  processingState.status = allTasks.length ? (processingState.failed === 0 ? 'Completed' : 'Completed with errors') : 'Completed';
  processingState.startedAt = null;

  res.json({ success: true, processed: results.length, results, progress: { ...processingState } });
});

// GET /api/admin/talent/candidates
router.get('/candidates', authenticateToken, requireRole(['admin']), async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 100));
  const { where } = buildTalentFilters(req.query);
  const { rows, count } = await TalentCandidate.findAndCountAll({
    where,
    order: [['addedDate', 'DESC']],
    offset: (page - 1) * limit,
    limit
  });
  res.json({ candidates: rows.map(serializeCandidate), total: count, page, limit });
});

// GET /api/admin/talent/skills — distinct normalized skills with candidate counts
router.get('/skills', authenticateToken, requireRole(['admin']), async (req, res) => {
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 200));
  const rows = await CandidateSkill.findAll({
    attributes: ['skillId'],
    include: [{ model: Skill, as: 'skill', attributes: ['id', 'name'] }],
    group: ['CandidateSkill.skillId', 'skill.id', 'skill.name'],
    attributes: {
      include: [
        [fn('COUNT', col('CandidateSkill.id')), 'count']
      ]
    },
    order: [[literal('count'), 'DESC']],
    limit,
    raw: true
  });
  const skills = rows
    .filter(r => r['skill.name'])
    .map(r => ({ name: r['skill.name'], count: parseInt(r.count, 10) || 0 }))
    .sort((a, b) => b.count - a.count);
  res.json({ skills });
});

// GET /api/admin/talent/search — recruiter search across title/skills/experience
router.get('/search', authenticateToken, requireRole(['admin']), async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const { where, include } = buildTalentFilters(req.query);

  const { rows, count } = await TalentCandidate.findAndCountAll({
    where,
    include,
    distinct: true,
    order: [['addedDate', 'DESC']],
    offset: (page - 1) * limit,
    limit
  });
  res.json({
    candidates: rows.map(serializeCandidate),
    total: count,
    page,
    limit,
    query: {
      q: req.query.q || '',
      jobTitle: req.query.jobTitle || '',
      location: req.query.location || '',
      gender: req.query.gender || '',
      skills: req.query.skills || ''
    }
  });
});

// POST /api/admin/talent/export — CSV export of filtered candidates with field selection
router.post('/export', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { filters = {}, fields = [], limit = 10000 } = req.body;
  const FIELD_MAP = {
    name: 'Name',
    email: 'Email',
    phone: 'Phone',
    location: 'Location',
    country: 'Country',
    jobTitle: 'Job Title',
    currentCompany: 'Current Company',
    skills: 'Skills',
    totalExperience: 'Experience (Years)',
    gender: 'Gender',
    dob: 'Date of Birth',
    summary: 'Summary',
    resumeUrl: 'Resume URL'
  };
  const selected = fields.filter(f => FIELD_MAP[f]);

  const { where, include } = buildTalentFilters(filters || {});
  const rows = await TalentCandidate.findAll({
    where,
    include,
    distinct: true,
    limit: Math.min(50000, Math.max(1, parseInt(limit) || 10000)),
    order: [['addedDate', 'DESC']]
  });

  const csvEscape = (v) => {
    const s = String(v ?? '');
    let out = s.replace(/\r?\n/g, ' ').replace(/"/g, '""');
    if (/^[=+\-@]/.test(out)) out = "'" + out;
    return `"${out}"`;
  };

  const header = selected.map(f => FIELD_MAP[f]).join(',');
  const lines = rows.map(c => {
    const skills = Array.isArray(c.candidateSkills)
      ? c.candidateSkills.map(cs => cs.skill?.name || '').filter(Boolean).join('; ')
      : (c.skills || '');
    const values = {
      name: c.name, email: c.email, phone: c.phone, location: c.location, country: c.country,
      jobTitle: c.jobTitle, currentCompany: c.currentCompany, skills,
      totalExperience: c.totalExperience ?? '', gender: c.gender, dob: c.dob,
      summary: c.summary, resumeUrl: c.resumePath || ''
    };
    return selected.map(f => csvEscape(values[f])).join(',');
  });

  const csv = [header, ...lines].join('\r\n');
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="recruiter-export-${date}.csv"`);
  res.send(`\uFEFF${csv}`);
});

// DELETE /api/admin/talent/candidates/:id
router.delete('/candidates/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  await TalentCandidate.destroy({ where: { id: req.params.id } });
  res.json({ success: true });
});

// SVG icons used in feature cards
const SVG_BRIEFCASE = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="7" width="20" height="14" rx="2" stroke="#5C6BC8" stroke-width="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" stroke="#5C6BC8" stroke-width="2"/></svg>';
const SVG_AI       = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" stroke="#5C6BC8" stroke-width="2"/><path d="M12 8v4l3 3" stroke="#5C6BC8" stroke-width="2" stroke-linecap="round"/></svg>';
const SVG_DOC      = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#5C6BC8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><polyline points="14 2 14 8 20 8" stroke="#5C6BC8" stroke-width="2"/></svg>';
const SVG_BOLT     = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" stroke="#5C6BC8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const SVG_TARGET   = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" stroke="#5C6BC8" stroke-width="2"/><circle cx="12" cy="12" r="6" stroke="#5C6BC8" stroke-width="2"/><circle cx="12" cy="12" r="2" stroke="#5C6BC8" stroke-width="2"/></svg>';
const SVG_CHECK    = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><polyline points="20 6 9 17 4 12" stroke="#5C6BC8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// Talent Pool Bulk Email Templates
const SUPPORT_EMAIL = 'Admin@zyncjobs.com';
const supportBox = () => `
<table width="100%" cellpadding="0" cellspacing="0">
  <tr><td style="background:#F0F7FF;border-radius:10px;padding:14px 18px;">
    <p style="color:#1F2937;font-size:13px;font-weight:700;margin:0 0 4px;">Questions? We are here to help.</p>
    <p style="color:#6B7280;font-size:13px;margin:0;">Reply to this email or reach us at <a href="mailto:${SUPPORT_EMAIL}" style="color:#5C6BC8;">${SUPPORT_EMAIL}</a></p>
  </td></tr>
</table>`;

const TEMPLATES = {
  invite: {
    subject: "You're Personally Invited to Join ZyncJobs — Your Next Career Move Awaits",
    html: () => baseTemplate(`
      <div style="padding:32px 36px;">
        <h2 style="color:#1F2937;font-size:20px;font-weight:700;margin:0 0 6px;">You have been hand-picked.</h2>
        <p style="color:#374151;font-size:14px;line-height:1.7;margin:0 0 20px;">
          Our team reviewed your background and believes you are a strong match for roles currently open on ZyncJobs. We are reaching out personally because we think you deserve better opportunities — and we can help you find them.
        </p>

        <div style="background:linear-gradient(135deg,#EEF2FF 0%,#F5F3FF 100%);border:1px solid #C7D2FE;border-radius:14px;padding:20px 22px;margin:0 0 24px;">
          <p style="color:#3730A3;font-size:14px;font-weight:700;margin:0 0 12px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="vertical-align:middle;margin-right:6px;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" stroke="#3730A3" stroke-width="2" fill="#3730A3"/></svg> Why ZyncJobs is different:</p>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:5px 0;color:#374151;font-size:13px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" style="vertical-align:middle;margin-right:6px;"><polyline points="20 6 9 17 4 12" stroke="#10B981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg> <strong>AI-powered matching</strong> — we surface roles that fit your exact skills, not just keywords</td></tr>
            <tr><td style="padding:5px 0;color:#374151;font-size:13px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" style="vertical-align:middle;margin-right:6px;"><polyline points="20 6 9 17 4 12" stroke="#10B981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg> <strong>Verified employers only</strong> — every company on our platform is screened and active</td></tr>
            <tr><td style="padding:5px 0;color:#374151;font-size:13px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" style="vertical-align:middle;margin-right:6px;"><polyline points="20 6 9 17 4 12" stroke="#10B981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg> <strong>One-click apply</strong> — your uploaded resume does the work, no re-filling forms</td></tr>
            <tr><td style="padding:5px 0;color:#374151;font-size:13px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" style="vertical-align:middle;margin-right:6px;"><polyline points="20 6 9 17 4 12" stroke="#10B981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg> <strong>Real-time status updates</strong> — know exactly where your application stands at all times</td></tr>
            <tr><td style="padding:5px 0;color:#374151;font-size:13px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" style="vertical-align:middle;margin-right:6px;"><polyline points="20 6 9 17 4 12" stroke="#10B981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg> <strong>Free for candidates</strong> — always, no hidden fees or premium tiers</td></tr>
          </table>
        </div>

        <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
          <tr>
            ${featureCard(SVG_BRIEFCASE, 'Thousands of Jobs', 'Verified openings across tech, finance, healthcare, and more')}
            ${featureCard(SVG_AI, 'Smart AI Match', 'Personalised recommendations updated daily based on your profile')}
            ${featureCard(SVG_DOC, 'Instant Apply', 'Upload once, apply everywhere with a single click')}
          </tr>
        </table>

        ${divider()}

        <p style="color:#1F2937;font-size:14px;font-weight:700;margin:0 0 14px;">Get hired in 3 simple steps:</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
          <tr><td style="padding:10px 0;border-bottom:1px solid #F3F4F6;">
            <table cellpadding="0" cellspacing="0"><tr>
              <td style="width:32px;"><span style="background:#5C6BC8;color:#fff;border-radius:50%;width:26px;height:26px;display:inline-block;text-align:center;line-height:26px;font-size:12px;font-weight:700;">1</span></td>
              <td style="padding-left:10px;"><p style="color:#1F2937;font-size:13px;font-weight:700;margin:0;">Create your free profile</p><p style="color:#6B7280;font-size:12px;margin:2px 0 0;">Takes under 2 minutes — just your name, email, and resume</p></td>
            </tr></table>
          </td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #F3F4F6;">
            <table cellpadding="0" cellspacing="0"><tr>
              <td style="width:32px;"><span style="background:#5C6BC8;color:#fff;border-radius:50%;width:26px;height:26px;display:inline-block;text-align:center;line-height:26px;font-size:12px;font-weight:700;">2</span></td>
              <td style="padding-left:10px;"><p style="color:#1F2937;font-size:13px;font-weight:700;margin:0;">Let AI find your matches</p><p style="color:#6B7280;font-size:12px;margin:2px 0 0;">Our engine scans thousands of live roles and ranks the best fits for you</p></td>
            </tr></table>
          </td></tr>
          <tr><td style="padding:10px 0;">
            <table cellpadding="0" cellspacing="0"><tr>
              <td style="width:32px;"><span style="background:#5C6BC8;color:#fff;border-radius:50%;width:26px;height:26px;display:inline-block;text-align:center;line-height:26px;font-size:12px;font-weight:700;">3</span></td>
              <td style="padding-left:10px;"><p style="color:#1F2937;font-size:13px;font-weight:700;margin:0;">Apply and track your progress</p><p style="color:#6B7280;font-size:12px;margin:2px 0 0;">One click to apply, then watch your pipeline update in real time</p></td>
            </tr></table>
          </td></tr>
        </table>

        <div style="text-align:center;margin:0 0 28px;">
          ${ctaButton('Claim Your Free Account Now', `${getFrontendUrl()}/role-selection`)}
        </div>

        <div style="background:#FFFBEB;border:1px solid #FCD34D;border-radius:10px;padding:12px 16px;margin:0 0 24px;">
          <p style="color:#92400E;font-size:12px;margin:0;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" style="vertical-align:middle;margin-right:5px;"><circle cx="12" cy="12" r="10" stroke="#92400E" stroke-width="2"/><polyline points="12 6 12 12 16 14" stroke="#92400E" stroke-width="2" stroke-linecap="round"/></svg> <strong>Limited-time:</strong> Candidates who register this week get priority visibility to employers actively hiring right now.</p>
        </div>

        ${divider()}
        ${supportBox()}
      </div>`, 'You have been personally invited to join ZyncJobs!')
  },

  followup: {
    subject: "Still Thinking It Over? Here's What You're Missing on ZyncJobs",
    html: () => baseTemplate(`
      <div style="padding:32px 36px;">
        <h2 style="color:#1F2937;font-size:20px;font-weight:700;margin:0 0 6px;">We saved your spot.</h2>
        <p style="color:#374151;font-size:14px;line-height:1.7;margin:0 0 20px;">
          We reached out a little while ago and wanted to check in. Since then, dozens of new roles have been posted that closely match your background — and employers are actively reviewing profiles right now.
        </p>

        <div style="background:#EEF2FF;border:1px solid #C7D2FE;border-radius:14px;padding:20px 22px;margin:0 0 22px;">
          <p style="color:#3730A3;font-size:14px;font-weight:700;margin:0 0 12px;">&#128276; What has changed since our last email:</p>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:5px 0;color:#374151;font-size:13px;">&#128313;&nbsp; New roles added daily — your ideal job may already be live</td></tr>
            <tr><td style="padding:5px 0;color:#374151;font-size:13px;">&#128313;&nbsp; Employers are shortlisting candidates this week — timing matters</td></tr>
            <tr><td style="padding:5px 0;color:#374151;font-size:13px;">&#128313;&nbsp; Our AI has been updated with smarter matching for your skill set</td></tr>
            <tr><td style="padding:5px 0;color:#374151;font-size:13px;">&#128313;&nbsp; Over 500 candidates placed in the last 30 days through ZyncJobs</td></tr>
          </table>
        </div>

        ${divider()}

        <p style="color:#1F2937;font-size:14px;font-weight:700;margin:0 0 12px;">Common concerns — answered:</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">
          <tr><td style="padding:10px 0;border-bottom:1px solid #F3F4F6;">
            <p style="color:#1F2937;font-size:13px;font-weight:600;margin:0 0 3px;">&#10067; Is it really free?</p>
            <p style="color:#6B7280;font-size:13px;margin:0;">Yes — 100% free for candidates, forever. No credit card, no premium tier.</p>
          </td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #F3F4F6;">
            <p style="color:#1F2937;font-size:13px;font-weight:600;margin:0 0 3px;">&#10067; How long does setup take?</p>
            <p style="color:#6B7280;font-size:13px;margin:0;">Under 2 minutes. Upload your resume and our AI fills in the rest automatically.</p>
          </td></tr>
          <tr><td style="padding:10px 0;">
            <p style="color:#1F2937;font-size:13px;font-weight:600;margin:0 0 3px;">&#10067; Will I get spammed with irrelevant jobs?</p>
            <p style="color:#6B7280;font-size:13px;margin:0;">No. Our AI only surfaces roles that genuinely match your experience and preferences.</p>
          </td></tr>
        </table>

        <div style="background:#ECFDF5;border:1px solid #6EE7B7;border-radius:12px;padding:16px 20px;margin:0 0 24px;">
          <p style="color:#065F46;font-size:13px;font-weight:700;margin:0 0 6px;">&#127881; Success story</p>
          <p style="color:#047857;font-size:13px;margin:0;font-style:italic;">"I signed up on a Tuesday and had two interview invites by Thursday. ZyncJobs matched me to roles I would never have found on my own." — Recent ZyncJobs candidate</p>
        </div>

        <div style="text-align:center;margin:0 0 28px;">
          ${ctaButton("Join Now — It's Free", `${getFrontendUrl()}/role-selection`)}
        </div>

        <p style="color:#9CA3AF;font-size:12px;text-align:center;margin:0 0 20px;">This is our follow-up message. If you have already registered, please ignore this email.</p>

        ${divider()}
        ${supportBox()}
      </div>`, 'New opportunities are waiting — we saved your spot on ZyncJobs!')
  },

  jobs: {
    subject: "🔥 Hot Roles Matching Your Profile — Apply Before They Close",
    html: () => baseTemplate(`
      <div style="padding:32px 36px;">
        <h2 style="color:#1F2937;font-size:20px;font-weight:700;margin:0 0 6px;">New opportunities, matched to you.</h2>
        <p style="color:#374151;font-size:14px;line-height:1.7;margin:0 0 20px;">
          Our AI has identified fresh job openings on ZyncJobs that align closely with your skills and experience. These roles are live now — and the best ones fill up fast.
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">
          <tr>
            ${featureCard(SVG_BOLT, 'Urgently Hiring', 'Employers need to fill these roles within days, not weeks')}
            ${featureCard(SVG_TARGET, 'Precision Match', 'Roles selected specifically for your skill set and experience level')}
            ${featureCard(SVG_CHECK, 'Apply in 2 Min', 'No lengthy forms — your resume does the talking')}
          </tr>
        </table>

        <div style="background:#FEF3C7;border:1px solid #F59E0B;border-radius:14px;padding:18px 20px;margin:0 0 22px;">
          <p style="color:#92400E;font-size:14px;font-weight:700;margin:0 0 10px;">&#9889; Why you should act today:</p>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:4px 0;color:#78350F;font-size:13px;">&#8226;&nbsp; Top candidates are already applying — early applicants get reviewed first</td></tr>
            <tr><td style="padding:4px 0;color:#78350F;font-size:13px;">&#8226;&nbsp; Employers on ZyncJobs close roles as soon as they find the right fit</td></tr>
            <tr><td style="padding:4px 0;color:#78350F;font-size:13px;">&#8226;&nbsp; Your profile is already in our system — joining takes under 2 minutes</td></tr>
            <tr><td style="padding:4px 0;color:#78350F;font-size:13px;">&#8226;&nbsp; Missing this window could mean waiting weeks for the next batch of openings</td></tr>
          </table>
        </div>

        ${divider()}

        <p style="color:#1F2937;font-size:14px;font-weight:700;margin:0 0 14px;">What types of roles are available?</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">
          <tr>
            <td style="width:50%;padding:6px 6px 6px 0;vertical-align:top;">
              <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:10px;padding:12px 14px;">
                <p style="color:#1F2937;font-size:12px;font-weight:700;margin:0 0 6px;">&#128187; Technology</p>
                <p style="color:#6B7280;font-size:12px;margin:0;line-height:1.6;">Software Engineers, Data Scientists, DevOps, Product Managers, UX Designers</p>
              </div>
            </td>
            <td style="width:50%;padding:6px 0 6px 6px;vertical-align:top;">
              <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:10px;padding:12px 14px;">
                <p style="color:#1F2937;font-size:12px;font-weight:700;margin:0 0 6px;">&#128200; Business & Finance</p>
                <p style="color:#6B7280;font-size:12px;margin:0;line-height:1.6;">Analysts, Accountants, Project Managers, Operations, Sales Leaders</p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="width:50%;padding:6px 6px 6px 0;vertical-align:top;">
              <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:10px;padding:12px 14px;">
                <p style="color:#1F2937;font-size:12px;font-weight:700;margin:0 0 6px;">&#127973; Healthcare</p>
                <p style="color:#6B7280;font-size:12px;margin:0;line-height:1.6;">Nurses, Physicians, Allied Health, Medical Admin, Health IT</p>
              </div>
            </td>
            <td style="width:50%;padding:6px 0 6px 6px;vertical-align:top;">
              <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:10px;padding:12px 14px;">
                <p style="color:#1F2937;font-size:12px;font-weight:700;margin:0 0 6px;">&#127775; And many more</p>
                <p style="color:#6B7280;font-size:12px;margin:0;line-height:1.6;">Marketing, Legal, Education, Engineering, Customer Success, and beyond</p>
              </div>
            </td>
          </tr>
        </table>

        <div style="text-align:center;margin:0 0 28px;">
          ${ctaButton('View My Matched Jobs', `${getFrontendUrl()}/job-listings`)}
        </div>

        <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;padding:14px 18px;margin:0 0 24px;">
          <p style="color:#1E40AF;font-size:13px;margin:0;">&#128161; <strong>Pro tip:</strong> Candidates with a complete profile (photo, skills, and resume) receive 3x more employer views on ZyncJobs.</p>
        </div>

        ${divider()}
        ${supportBox()}
      </div>`, 'Hot new roles matching your profile are live on ZyncJobs!')
  }
};

// POST /api/admin/talent/email
router.post('/email', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { candidateIds, template, batchSize = 100, testEmail } = req.body;

  // ── Test send: send to a single address without needing candidateIds ──
  if (testEmail) {
    const tpl = TEMPLATES[template] || TEMPLATES.invite;
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_SERVER,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: { user: process.env.SMTP_EMAIL, pass: process.env.SMTP_PASSWORD }
    });
    try {
      await transporter.sendMail({
        from: `"ZyncJobs Careers" <${process.env.SMTP_EMAIL}>`,
        to: testEmail,
        subject: `[TEST] ${tpl.subject}`,
        html: tpl.html(),
        headers: {
          'List-Unsubscribe': `<mailto:${process.env.SMTP_EMAIL}?subject=unsubscribe>`,
          'X-Mailer': 'ZyncJobs Mailer'
        }
      });
      return res.json({ success: true, sent: 1, test: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (!candidateIds?.length) return res.status(400).json({ error: 'No candidates selected' });

  const tpl = TEMPLATES[template] || TEMPLATES.invite;
  const { Op } = await import('sequelize');
  const toSend = await TalentCandidate.findAll({
    where: { id: { [Op.in]: candidateIds }, email: { [Op.ne]: '' } }
  });

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_SERVER,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: { user: process.env.SMTP_EMAIL, pass: process.env.SMTP_PASSWORD },
    pool: true,
    maxConnections: 5,
    rateDelta: 1000,
    rateLimit: 5
  });

  let sent = 0, failed = 0;
  const errors = [];

  for (let i = 0; i < toSend.length; i += batchSize) {
    const batch = toSend.slice(i, i + batchSize);
    for (const c of batch) {
      try {
        await transporter.sendMail({
          from: `"ZyncJobs Careers" <${process.env.SMTP_EMAIL}>`,
          to: c.email,
          subject: tpl.subject,
          html: tpl.html(),
          headers: {
            'List-Unsubscribe': `<mailto:${process.env.SMTP_EMAIL}?subject=unsubscribe>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            'X-Mailer': 'ZyncJobs Mailer',
            'Precedence': 'bulk'
          }
        });
        await c.update({ emailStatus: 'Sent', emailSentAt: new Date() });
        sent++;
      } catch (err) {
        failed++;
        errors.push({ id: c.id, email: c.email, error: err.message });
      }
    }
    if (i + batchSize < toSend.length) await new Promise(r => setTimeout(r, 300));
  }

  res.json({ success: true, sent, failed, errors });
});

// POST /api/admin/talent/candidates/:id/retry
router.post('/candidates/:id/retry', authenticateToken, requireRole(['admin']), async (req, res) => {
  const candidate = await TalentCandidate.findOne({ where: { id: req.params.id } });
  if (!candidate) return res.status(404).json({ error: 'Candidate not found' });
  if (!candidate.resumePath) return res.status(400).json({ error: 'No resume URL stored for this candidate' });

  try {
    const pdfTextExtractor = (await import('../services/pdfTextExtractor.js')).default;
    const { resumeParser } = await import('../utils/resumeParserAI.js');
    const { getResumeStreamFromS3 } = await import('../services/s3Service.js');

    const { stream } = await getResumeStreamFromS3(candidate.resumePath);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);
    const text = await pdfTextExtractor.extractTextFromBuffer(buffer, candidate.resumeFile || 'resume');
    const parsed = await resumeParser.parseResumeToProfile(text);
    parsed.rawText = text;

    const workExps = Array.isArray(parsed.workExperiences) ? parsed.workExperiences : [];
    const totalExperience = computeTotalExperience(workExps) ?? extractExperienceYearsFromText(text);
    const currentCompany = workExps.length
      ? (workExps[workExps.length - 1].company || workExps[0].company || '')
      : '';

    const updates = {
      name: parsed.name || candidate.name || '',
      email: parsed.email || candidate.email || '',
      phone: parsed.phone || candidate.phone || '',
      dob: parsed.dob || candidate.dob || '',
      skills: Array.isArray(parsed.skills) ? parsed.skills.join(', ') : (candidate.skills || ''),
      experience: workExps.length ? `${workExps.length} role(s)` : (candidate.experience || ''),
      totalExperience: totalExperience ?? candidate.totalExperience,
      currentCompany: currentCompany || candidate.currentCompany || '',
      jobTitle: parsed.title || candidate.jobTitle || '',
      summary: parsed.summary || '',
      location: parsed.location || '',
      workExperiences: JSON.stringify(workExps),
      educations: JSON.stringify(Array.isArray(parsed.educations) ? parsed.educations : []),
      rawText: text.substring(0, 2000),
      status: (parsed.name || parsed.email) ? 'Parsed' : 'Error',
      parserStatus: (parsed.name || parsed.email) ? 'Parsed' : 'Failed',
      parserError: (parsed.name || parsed.email) ? '' : 'Could not extract name or email from resume',
      retryCount: (candidate.retryCount || 0) + 1
    };

    await candidate.update(updates);
    await saveCandidateSkills(candidate.id, parsed.skills);
    return res.json({ ...serializeCandidate(await TalentCandidate.findByPk(candidate.id)), id: candidate.id });
  } catch (err) {
    console.error(`[TALENT RETRY] Failed for ${req.params.id}:`, err.message);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/talent/resume/:id — stream a talent candidate's original resume
// Reuses the existing getResumeStreamFromS3 helper (same S3 integration as the
// candidate-facing /resume-viewer flow) — no raw S3 URL is exposed to the client.
router.get('/resume/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const candidate = await TalentCandidate.findByPk(req.params.id);
    if (!candidate || !candidate.resumePath) {
      return res.status(404).json({ error: 'Resume not found' });
    }
    const { stream, contentType, contentLength } = await getResumeStreamFromS3(candidate.resumePath);
    const fileName = candidate.resumeFile || candidate.resumeOriginalName || 'resume';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'no-store');
    if (contentLength) res.setHeader('Content-Length', contentLength);
    stream.on('error', () => res.end());
    stream.pipe(res);
  } catch (err) {
    console.error(`[TALENT RESUME STREAM] Failed for ${req.params.id}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/talent/processing-status
router.get('/processing-status', authenticateToken, requireRole(['admin']), (req, res) => {
  res.json({ ...processingState, progress: processingState.total ? Math.round((processingState.processed / processingState.total) * 100) : 0 });
});

// GET /api/admin/talent/stats
router.get('/stats', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { Op } = await import('sequelize');
  const [total, parsed, errors, emailSent] = await Promise.all([
    TalentCandidate.count(),
    TalentCandidate.count({ where: { status: 'Parsed' } }),
    TalentCandidate.count({ where: { status: 'Error' } }),
    TalentCandidate.count({ where: { emailStatus: 'Sent' } })
  ]);
  res.json({ total, parsed, errors, emailSent, notSent: total - emailSent });
});

export default router;
