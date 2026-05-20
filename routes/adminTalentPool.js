import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { authenticateToken } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleAuth.js';
import nodemailer from 'nodemailer';
import TalentCandidate from '../models/TalentCandidate.js';
import { uploadResumeToS3, uploadTalentResumeToS3 } from '../services/s3Service.js';
import { baseTemplate, ctaButton, divider, featureCard, FRONTEND_URL } from '../services/emailTemplates.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = express.Router();

// Storage
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx', '.txt'];
    allowed.includes(path.extname(file.originalname).toLowerCase()) ? cb(null, true) : cb(new Error('PDF, DOC, DOCX, TXT only'));
  },
  limits: { fileSize: 10 * 1024 * 1024 }
});

// POST /api/admin/talent/upload
router.post('/upload', authenticateToken, requireRole(['admin']), upload.array('resumes', 200), async (req, res) => {
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

  const CONCURRENCY = 3;
  const BATCH_DELAY_MS = 20000;

  async function parseAndSaveFromS3(s3Url, fileName) {
    try {
      const existing = await TalentCandidate.findOne({ where: { resumePath: s3Url } });
      if (existing) {
        console.log(`[TALENT] Already parsed, skipping: ${fileName}`);
        return { file: fileName, status: 'ok', name: existing.name, email: existing.email, skipped: true };
      }
      console.log(`[TALENT] Parsing: ${fileName} from ${s3Url}`);
      const { stream } = await getResumeStreamFromS3(s3Url);
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);
      const text = await pdfTextExtractor.extractTextFromBuffer(buffer, fileName);
      const parsed = await resumeParser.parseResumeToProfile(text);
      const candidate = await TalentCandidate.create({
        id: `tp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: parsed.name || '',
        email: parsed.email || '',
        phone: parsed.phone || '',
        skills: Array.isArray(parsed.skills) ? parsed.skills.join(', ') : '',
        experience: parsed.workExperiences?.length ? `${parsed.workExperiences.length} role(s)` : '',
        jobTitle: parsed.title || '',
        summary: parsed.summary || '',
        location: parsed.location || '',
        country: parsed.country || '',
        tools: Array.isArray(parsed.tools) ? parsed.tools.join(', ') : '',
        softSkills: Array.isArray(parsed.softSkills) ? parsed.softSkills.join(', ') : '',
        workExperiences: JSON.stringify(parsed.workExperiences || []),
        educations: JSON.stringify(parsed.educations || []),
        projects: JSON.stringify(parsed.projects || []),
        certifications: JSON.stringify(parsed.certifications || []),
        resumePath: s3Url,
        resumeFile: fileName,
        status: (parsed.name || parsed.email) ? 'Parsed' : 'Error',
        source: 'uploaded_resume',
        rawText: text.substring(0, 500)
      });
      return { file: fileName, status: 'ok', name: candidate.name, email: candidate.email };
    } catch (err) {
      console.error(`[TALENT] FAILED ${fileName}:`, err.message);
      return { file: fileName, status: 'error', error: err.message };
    }
  }

  async function parseAndSaveFromFile(file) {
    try {
      const { fileUrl, alreadyExists } = await uploadTalentResumeToS3(file.buffer, file.originalname);
      console.log(`Talent resume ${alreadyExists ? 'already existed' : 'uploaded'}: ${fileUrl}`);
      const existing = await TalentCandidate.findOne({ where: { resumePath: fileUrl } });
      if (existing) {
        return { file: file.originalname, status: 'ok', name: existing.name, email: existing.email, skipped: true };
      }
      const text = await pdfTextExtractor.extractTextFromBuffer(file.buffer, file.originalname);
      const parsed = await resumeParser.parseResumeToProfile(text);
      const candidate = await TalentCandidate.create({
        id: `tp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: parsed.name || '',
        email: parsed.email || '',
        phone: parsed.phone || '',
        skills: Array.isArray(parsed.skills) ? parsed.skills.join(', ') : '',
        experience: parsed.workExperiences?.length ? `${parsed.workExperiences.length} role(s)` : '',
        jobTitle: parsed.title || '',
        summary: parsed.summary || '',
        location: parsed.location || '',
        country: parsed.country || '',
        tools: Array.isArray(parsed.tools) ? parsed.tools.join(', ') : '',
        softSkills: Array.isArray(parsed.softSkills) ? parsed.softSkills.join(', ') : '',
        workExperiences: JSON.stringify(parsed.workExperiences || []),
        educations: JSON.stringify(parsed.educations || []),
        projects: JSON.stringify(parsed.projects || []),
        certifications: JSON.stringify(parsed.certifications || []),
        resumePath: fileUrl,
        resumeFile: file.originalname,
        status: (parsed.name || parsed.email) ? 'Parsed' : 'Error',
        source: 'uploaded_resume',
        rawText: text.substring(0, 500)
      });
      return { file: file.originalname, status: 'ok', name: candidate.name, email: candidate.email };
    } catch (err) {
      return { file: file.originalname, status: 'error', error: err.message };
    }
  }

  const s3Tasks = resumeUrls.map((url, index) => {
    const fileName = fileNames[index] || `resume_${index + 1}`;
    return () => parseAndSaveFromS3(url, fileName);
  });
  const fileTasks = uploadedFiles.map(file => () => parseAndSaveFromFile(file));
  const allTasks = [...s3Tasks, ...fileTasks];

  for (let i = 0; i < allTasks.length; i += CONCURRENCY) {
    const batch = allTasks.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(task => task()));
    results.push(...batchResults);
    if (i + CONCURRENCY < allTasks.length) await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
  }

  res.json({ success: true, processed: results.length, results });
});

// GET /api/admin/talent/candidates
router.get('/candidates', authenticateToken, requireRole(['admin']), async (req, res) => {
  const candidates = await TalentCandidate.findAll({ order: [['addedDate', 'DESC']] });
  res.json({ candidates });
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
          ${ctaButton('Claim Your Free Account Now', `${FRONTEND_URL}`)}
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
          ${ctaButton("Join Now — It's Free", `${FRONTEND_URL}`)}
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
          ${ctaButton('View My Matched Jobs', `${FRONTEND_URL}`)}
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

    const updates = {
      name: parsed.name || candidate.name || '',
      email: parsed.email || candidate.email || '',
      phone: parsed.phone || candidate.phone || '',
      skills: Array.isArray(parsed.skills) ? parsed.skills.join(', ') : (candidate.skills || ''),
      experience: parsed.workExperiences?.length ? `${parsed.workExperiences.length} role(s)` : (candidate.experience || ''),
      jobTitle: parsed.title || candidate.jobTitle || '',
      summary: parsed.summary || '',
      location: parsed.location || '',
      workExperiences: JSON.stringify(parsed.workExperiences || []),
      educations: JSON.stringify(parsed.educations || []),
      rawText: text.substring(0, 500),
      status: (parsed.name || parsed.email) ? 'Parsed' : 'Error',
    };

    await candidate.update(updates);
    return res.json({ ...updates, id: candidate.id });
  } catch (err) {
    console.error(`[TALENT RETRY] Failed for ${req.params.id}:`, err.message);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/talent/processing-status
router.get('/processing-status', authenticateToken, requireRole(['admin']), (req, res) => {
  res.json({ isProcessing: false, status: '', progress: 0 });
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
