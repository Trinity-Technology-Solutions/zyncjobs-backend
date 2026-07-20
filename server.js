import { Op } from 'sequelize';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
// import dotenv from 'dotenv'; // Moved to instrument.mjs
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import connectDB from './config/database.js';
import { sequelize } from './config/postgresql.js';
import passport from './config/passport.js';
import authRoutes from './routes/auth.js';
import tokenRoutes from './routes/token.js';
import jobRoutes from './routes/jobs.js';
import userRoutes from './routes/users.js';
import usersGetRoutes from './routes/users-get.js';
import applicationRoutes from './routes/applications.js';
import jobAlertRoutes from './routes/jobAlerts.js';
import uploadRoutes from './routes/upload.js';
import moderationRoutes from './routes/moderation.js';
import resumeBasicRoutes from './routes/resumeBasic.js';
import resumeRoutes from './routes/resume.js';
import resumeAttachRoutes from './routes/resumeAttach.js';
import resumeModerationRoutes from './routes/resumeModeration.js';
import analyticsRoutes from './routes/analytics.js';
import analyticsTrackingRoutes, { setIo as setAnalyticsIo } from './routes/analyticsTracking.js';
import adminJobsRoutes from './routes/adminJobs.js';
import companyRoutes from './routes/companies.js';
import companySearchRoutes from './routes/companySearch.js';
import locationsRoutes from './routes/locations.js';
import pdfRoutes from './routes/pdf.js';
import resumeVersionRoutes from './routes/resumeVersions.js';
import aiSuggestionsRoutes from './routes/aiSuggestions.js';
import suggestRoutes from './routes/suggestRoutes.js';
import adminUserRoutes from './routes/adminUsers.js';
import adminAnalyticsRoutes from './routes/adminAnalytics.js';
import adminSettingsRoutes from './routes/adminSettings.js';
import adminBulkRoutes from './routes/adminBulk.js';
import adminTalentPoolRoutes from './routes/adminTalentPool.js';
import adminAuditRoutes from './routes/adminAudit.js';
import aiScoringRoutes from './routes/aiScoring.js';
import aiScoringFlowRoutes from './routes/aiScoringFlow.js';
import employerCandidatesRoutes from './routes/employerCandidates.js';
import adminSystemRoutes from './routes/adminSystem.js';
import adminNotificationRoutes from './routes/adminNotifications.js';
import adminVerificationsRoutes from './routes/adminVerifications.js';
import { maintenanceGuard, registrationGuard, maxJobsGuard, getJobStatus } from './middleware/settingsMiddleware.js';
import notificationRoutes from './routes/notifications.js';
import messageRoutes, { setIo as setMessagesIo } from './routes/messages.js';
import profileRoutes from './routes/profile.js';
import autocompleteRoutes from './routes/autocomplete.js';
import companyAutocompleteRoutes from './routes/companyAutocomplete.js';
import linkedinParserRoutes from './routes/linkedinParser.js';
import dashboardRoutes from './routes/dashboard.js';
import reminderRoutes from './routes/reminders.js';
import headlineAnalyticsRoutes from './routes/headlineAnalytics.js';
import resumeScoreRoutes from './routes/resumeScore.js';
import skillAssessmentRoutes from './routes/skillAssessments.js';
import interviewRoutes from './routes/interviews.js';
import meetingRoutes from './routes/meetings.js';
import advancedSearchRoutes from './routes/advancedSearch.js';
import searchAnalyticsRoutes from './routes/searchAnalytics.js';
import collegesRoutes from './routes/colleges.js';
import skillsRoutes from './routes/skills.js';
import jobTitlesRoutes from './routes/jobTitles.js';
import resumeViewerRoutes from './routes/resumeViewer.js';
import savedCandidatesRoutes from './routes/savedCandidates.js';
import reviewRoutes from './routes/reviews.js';
import matchRoutes from './routes/match.js';
import savedRecommendedJobsRoutes from './routes/savedRecommendedJobs.js';
import savedJobsRoutes from './routes/savedJobs.js';
import userPreferencesRoutes from './routes/userPreferences.js';
import jobSessionRoutes from './routes/jobSession.js';
import employerRoutes from './routes/employers.js';
import ogTagsRoutes from './routes/ogTags.js';
import socialShareRoutes from './routes/socialShare.js';
import teamRoutes from './routes/team.js';
import companyVerificationRoutes from './routes/companyVerification.js';
import accessControlRoutes from './routes/accessControl.js';
import teamAuthRoutes from './routes/teamAuth.js';
import aiRejectionSettingsRoutes from './routes/aiRejectionSettings.js';
import credentialingRoutes from './routes/credentialing.js';
import salaryInsightsRoutes from './routes/salaryInsights.js';
import resumeBuilderRoutes from './routes/resumeBuilder.js';
import resumeAIRoutes from './routes/resumeAI.js';
import rankingRoutes from './routes/ranking.js';
import aiClient from './services/aiClient.js';
import gdprRoutes from './routes/gdpr.js';
import contactRoutes from './routes/contact.js';
import aiRoutes from './routes/ai.js';
import aiProxyRoutes from './routes/aiProxy.js';
import gstVerifyRoutes from './routes/gstVerify.js';
// import reminderScheduler from './services/reminderScheduler.js';
import jobAlertScheduler from './services/jobAlertScheduler.js';
import notificationScheduler from './services/notificationScheduler.js';
import gdprRetentionScheduler from './services/gdprRetentionScheduler.js';
import Notification from './models/Notification.js';
import Message from './models/Message.js';
import Review from './models/Review.js';
import Company from './models/Company.js';
import { loadInitialData } from './scripts/loadInitialData.js';

import { generateAccessToken, generateRefreshToken } from './utils/jwt.js';
import { errorHandler, notFound } from './utils/errorHandler.js';
import { validateEnv } from './utils/envValidator.js';
import { getRedisStatus } from './services/redisService.js';
import { sanitizeInput } from './middleware/sanitize.js';


import * as Sentry from '@sentry/node';

const envFile = process.env.NODE_ENV === 'qa' ? '.env.qa' : process.env.NODE_ENV === 'production' ? '.env.production' : '.env';
// dotenv.config({ path: envFile }); // Moved to instrument.mjs
validateEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ✅ CORS FIRST — before helmet, session, rateLimit, everything
const ALLOWED_ORIGINS = [
  'https://www.zyncjobs.com',
  'https://zyncjobs.com',
  'https://qa.zyncjobs.com',
  'https://trinitetech.com',
  'https://www.trinitetech.com',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
];
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    // Allow any localhost port in development
    if (process.env.NODE_ENV !== 'production' && /^http:\/\/localhost:\d+$/.test(origin)) {
      return callback(null, true);
    }
    console.log('❌ CORS blocked:', origin);
    return callback(new Error('CORS blocked: ' + origin), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'x-file-hash'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Trust proxy for deployment
app.set('trust proxy', 1);
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: ALLOWED_ORIGINS,
    credentials: true
  }
});
const PORT = process.env.PORT || 5000;

connectDB().then(async () => {
  console.log('✅ Database connected');
  
  // Run enhanced company fields migration
  try {
    const { migrateEnhancedCompanyFields } = await import('./scripts/migrateEnhancedCompanyFields.js');
    await migrateEnhancedCompanyFields();
    console.log('✅ Enhanced company fields migration completed');
  } catch (migrationError) {
    console.warn('⚠️ Migration warning:', migrationError.message);
    // Don't fail server startup if migration fails
  }

  // Run team invitation columns migration
  try {
    const { migrateTeamInvitationColumns } = await import('./scripts/migrateTeamInvitationColumns.js');
    await migrateTeamInvitationColumns();
    console.log('✅ Team invitation columns migration completed');
  } catch (migrationError) {
    console.warn('⚠️ Team invitation migration warning:', migrationError.message);
    // Don't fail server startup if migration fails
  }
  
  // Comment out loadInitialData for faster startup
  // loadInitialData();
  
  // Start job alert scheduler
  if (process.env.ENABLE_JOB_ALERT_SCHEDULER !== 'false') {
    jobAlertScheduler.start();
  }
  
  // Start notification scheduler
  if (process.env.ENABLE_NOTIFICATION_SCHEDULER !== 'false') {
    notificationScheduler.start();
  }
  // Start GDPR retention scheduler
  if (process.env.ENABLE_GDPR_SCHEDULER !== 'false') {
    gdprRetentionScheduler.start();
  }
}).catch(err => {
  console.error('❌ Database connection failed:', err);
  process.exit(1);
});

// Wire Socket.io to analytics tracking and messages for real-time updates
setAnalyticsIo(io);
setMessagesIo(io);

// Socket.io connection
const userSockets = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('register', (userId) => {
    userSockets.set(userId, socket.id);
    console.log(`User ${userId} registered with socket ${socket.id}`);
  });

  socket.on('send_message', async (data) => {
    try {
      const { senderId, receiverId, message } = data;
      const conversationId = [senderId, receiverId].sort().join('_');

      const newMessage = new Message({
        conversationId,
        senderId,
        receiverId,
        message
      });
      await newMessage.save();

      const receiverSocketId = userSockets.get(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('new_message', newMessage);
      }
      socket.emit('message_sent', newMessage);
    } catch (error) {
      socket.emit('error', error.message);
    }
  });

  socket.on('disconnect', () => {
    for (const [userId, socketId] of userSockets.entries()) {
      if (socketId === socket.id) {
        userSockets.delete(userId);
        break;
      }
    }
    console.log('User disconnected:', socket.id);
  });
});

// Helper to send notification
export async function sendNotification(userId, type, title, message, link = null) {
  try {
    const notification = new Notification({ userId, type, title, message, link });
    await notification.save();

    const socketId = userSockets.get(userId);
    if (socketId) {
      io.to(socketId).emit('new_notification', notification);
    }
    return notification;
  } catch (error) {
    console.error('Notification error:', error);
  }
}

const isQA = process.env.NODE_ENV === 'qa';

// Derive API origin for frame-ancestors
const apiOrigin = process.env.BACKEND_URL
  ? process.env.BACKEND_URL.trim().replace(/\/+$/, '')
  : null;

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'frame-ancestors': ["'self'", ...ALLOWED_ORIGINS, ...(apiOrigin ? [apiOrigin] : [])],
      'frame-src': ["'self'", ...ALLOWED_ORIGINS, ...(apiOrigin ? [apiOrigin] : [])],
      'img-src': ["'self'", 'data:', '*'],
    },
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || (() => { throw new Error('SESSION_SECRET env var is required'); })(),
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'qa',
    sameSite: process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'qa' ? 'none' : 'lax',
    maxAge: 10 * 60 * 1000
  }
}));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Rate limiting - more lenient for development
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 500 : 10000,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    return process.env.NODE_ENV === 'development';
  }
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 20 : 100,
  message: 'Too many login attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    return process.env.NODE_ENV === 'development';
  }
});

app.use('/api/users/login', loginLimiter);
app.use('/api/users/register', loginLimiter);
app.use(limiter);
app.use(cookieParser());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(sanitizeInput);
// Debug middleware - only in development
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });
}

// Dedicated download route — serves resume with Content-Disposition: attachment
app.get('/uploads/download/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, 'uploads', 'resumes', filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Content-Type', 'application/pdf');
  const candidateName = req.query.name
    ? String(req.query.name).replace(/[^a-zA-Z0-9_\- ]/g, '').trim().replace(/\s+/g, '_')
    : filename;
  const downloadName = candidateName.endsWith('.pdf') ? candidateName : `${candidateName}_resume.pdf`;
  res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
  res.sendFile(filePath);
});

// Serve uploaded files with proper headers
app.use('/uploads', (req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(path.join(__dirname, 'uploads'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.pdf')) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline');
      // Remove frame restrictions for PDFs
      res.removeHeader('X-Frame-Options');
    }
  }
}));

// Serve public static assets (logos, images)
app.use('/images', express.static(path.join(__dirname, 'public', 'images')));

// Settings enforcement middleware
app.use(maintenanceGuard);

app.use('/api/jobs', jobRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/token', tokenRoutes);
app.use('/api/users', userRoutes);
// Move applications route before catch-all
app.use('/api/applications', applicationRoutes);
app.use('/api/job-alerts', jobAlertRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/moderation', moderationRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/analytics-tracking', analyticsTrackingRoutes);
app.use('/api/admin/jobs', adminJobsRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/company', companySearchRoutes);
app.use('/api/locations', locationsRoutes);
app.use('/api/countries', locationsRoutes);
app.use('/api/colleges', collegesRoutes);
app.use('/api/skills', skillsRoutes);
app.use('/api/job-titles', jobTitlesRoutes);
app.use('/api/pdf', pdfRoutes);
app.use('/api/resume-versions', resumeVersionRoutes);
app.use('/api/ai-suggestions', aiSuggestionsRoutes);
app.use('/api', suggestRoutes);
app.use('/api/admin/users', adminUserRoutes);
app.use('/api/admin/analytics', adminAnalyticsRoutes);
app.use('/api/admin/settings', adminSettingsRoutes);
app.use('/api/admin/bulk', adminBulkRoutes);
app.use('/api/admin/talent', adminTalentPoolRoutes);
app.use('/api/admin/audit', adminAuditRoutes);
app.use('/api/ai', aiScoringRoutes);
app.use('/api/ai-flow', aiScoringFlowRoutes);
app.use('/api/employer', employerCandidatesRoutes);
app.use('/api/candidates', employerCandidatesRoutes);
app.use('/api/profiles', employerCandidatesRoutes);
app.use('/api/admin/system', adminSystemRoutes);
app.use('/api/admin/notifications', adminNotificationRoutes);
app.use('/api/admin/verifications', adminVerificationsRoutes);
app.use('/api/resume', resumeBasicRoutes);
app.use('/api/resume', resumeRoutes);
app.use('/api/resume', resumeAttachRoutes);
app.use('/api/resume', resumeModerationRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/autocomplete', autocompleteRoutes);
app.use('/api/companies', companyAutocompleteRoutes);
app.use('/api', linkedinParserRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reminders', reminderRoutes);
app.use('/api/search', advancedSearchRoutes);
app.use('/api/search-analytics', searchAnalyticsRoutes);
app.use('/api/headline', headlineAnalyticsRoutes);
app.use('/api/resume-score', resumeScoreRoutes);
app.use('/api/skill-assessments', skillAssessmentRoutes);
app.use('/api/interviews', interviewRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/resume-viewer', resumeViewerRoutes);
app.use('/api/saved-candidates', savedCandidatesRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/match', matchRoutes);
app.use('/api/saved-recommended-jobs', savedRecommendedJobsRoutes);
app.use('/api/saved-jobs', savedJobsRoutes);
app.use('/api/user-preferences', userPreferencesRoutes);
app.use('/api/job-session', jobSessionRoutes);
app.use('/api/employers', employerRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/company-verification', companyVerificationRoutes);
app.use('/api/access', accessControlRoutes);
app.use('/api/team-auth', teamAuthRoutes);
app.use('/api/social', socialShareRoutes);
app.use('/api/ai-rejection-settings/preview', aiRejectionSettingsRoutes);
app.use('/api/ai-rejection-settings/bulk-reject', aiRejectionSettingsRoutes);
app.use('/api/ai-rejection-settings', aiRejectionSettingsRoutes);
app.use('/api/credentialing', credentialingRoutes);
app.use('/api/salary-insights', salaryInsightsRoutes);
app.use('/api/resume-builder', resumeBuilderRoutes);
app.use('/api/resume-ai', resumeAIRoutes);
app.use('/api/ranking', rankingRoutes);
app.use('/api/gdpr', gdprRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/ai-proxy', aiProxyRoutes);
app.use('/api/verify', gstVerifyRoutes);
app.use('/', ogTagsRoutes);

// Logo proxy — backend fetches external logo, returns to frontend
// Avoids ERR_TUNNEL / network block on client side
app.get('/api/logo-proxy', async (req, res) => {
  const domain = (req.query.domain || '').replace(/[^a-zA-Z0-9.-]/g, '');
  if (!domain) return res.status(400).end();
  const urls = [
    `https://logo.clearbit.com/${domain}`,
    `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
    `https://img.logo.dev/${domain}?token=pk_cY8JBeWnQR6g5m_ymQhBoQ&size=64`,
  ];
  for (const url of urls) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (r.ok && r.headers.get('content-type')?.startsWith('image')) {
        const buf = await r.arrayBuffer();
        res.set('Content-Type', r.headers.get('content-type'));
        res.set('Cache-Control', 'public, max-age=86400');
        return res.send(Buffer.from(buf));
      }
    } catch {}
  }
  res.status(404).end();
});

// Auto-fetch and save logo for a company by domain
app.post('/api/companies/auto-fetch-logo', async (req, res) => {
  const { companyName, domain } = req.body;
  if (!companyName || !domain) return res.status(400).json({ error: 'companyName and domain required' });
  const cleanDomain = domain.replace(/[^a-zA-Z0-9.-]/g, '');
  const urls = [
    `https://logo.clearbit.com/${cleanDomain}`,
    `https://www.google.com/s2/favicons?domain=${cleanDomain}&sz=64`,
  ];
  let logoUrl = null;
  for (const url of urls) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (r.ok && r.headers.get('content-type')?.startsWith('image')) {
        logoUrl = url;
        break;
      }
    } catch {}
  }
  if (logoUrl) {
    try {
      const Company = (await import('./models/Company.js')).default;
      await Company.update({ logo: logoUrl }, { where: { name: companyName } });
    } catch {}
  }
  res.json({ logoUrl });
});

// Bulk auto-fetch logos for all companies missing logo
app.post('/api/admin/bulk-fetch-logos', async (req, res) => {
  try {
    const Company = (await import('./models/Company.js')).default;
    const { Op } = await import('sequelize');
    const companies = await Company.findAll({
      where: {
        [Op.or]: [
          { logo: null },
          { logo: '' },
          { logo: { [Op.like]: '%clearbit%' } },
          { logo: { [Op.like]: '%google.com/s2/favicons%' } },
          { logo: { [Op.like]: '%ui-avatars%' } },
        ]
      }
    });
    const results = [];
    for (const company of companies) {
      // Get domain from website, companyWebsite, or createdBy email
      let domain = company.domain;
      if (!domain && company.website) {
        try { domain = new URL(company.website).hostname.replace('www.', ''); } catch {}
      }
      if (!domain && company.companyWebsite) {
        try { domain = new URL(company.companyWebsite).hostname.replace('www.', ''); } catch {}
      }
      if (!domain && company.createdBy && company.createdBy.includes('@')) {
        const emailDomain = company.createdBy.split('@')[1];
        const genericDomains = ['gmail.com','yahoo.com','outlook.com','hotmail.com'];
        if (!genericDomains.includes(emailDomain)) domain = emailDomain;
      }
      if (!domain) { results.push({ name: company.name, status: 'no_domain' }); continue; }
      const urls = [
        `https://logo.clearbit.com/${domain}`,
        `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
      ];
      let logoUrl = null;
      for (const url of urls) {
        try {
          const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
          if (r.ok && r.headers.get('content-type')?.startsWith('image')) {
            logoUrl = url; break;
          }
        } catch {}
      }
      if (logoUrl) {
        await company.update({ logo: logoUrl });
        results.push({ name: company.name, domain, logoUrl, status: 'updated' });
      } else {
        results.push({ name: company.name, domain, status: 'no_logo_found' });
      }
    }
    res.json({ updated: results.filter(r => r.status === 'updated').length, total: companies.length, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Resume parser with AI
app.post('/api/resume-parser/parse', async (req, res) => {
  try {
    const { base64Data } = req.body;

    if (!base64Data) {
      return res.status(400).json({ success: false, error: 'No PDF data provided' });
    }

    console.log('🔍 Processing resume...');

    // Convert base64 to buffer and extract text
    const pdfBuffer = Buffer.from(base64Data, 'base64');
    const pdfTextExtractor = (await import('./services/pdfTextExtractor.js')).default;
    const resumeText = await pdfTextExtractor.extractTextFromBuffer(pdfBuffer);

    console.log('📄 Extracted text length:', resumeText.length);

    if (!resumeText.trim()) {
      return res.status(400).json({ success: false, error: 'Could not extract text from PDF' });
    }

    // Use the AI parser to extract structured data
    const { resumeParser } = await import('./utils/resumeParserAI.js');
    const profileData = await resumeParser.parseResumeToProfile(resumeText);

    // Convert to the expected format
    const parsedData = {
      personalInfo: {
        name: profileData.name || '',
        email: profileData.email || '',
        phone: profileData.phone || '',
        location: profileData.location || ''
      },
      title: profileData.title || '',
      summary: profileData.summary || '',
      skills: profileData.skills || [],
      softSkills: profileData.softSkills || [],
      tools: profileData.tools || [],
      experience: (profileData.workExperiences || []).map(w => ({
        title: w.jobTitle || '',
        company: w.company || '',
        duration: w.date || '',
        description: (w.descriptions || []).join(' '),
        current: false
      })),
      education: (profileData.educations || []).map(e => ({
        degree: e.degree || '',
        institution: e.school || '',
        duration: e.date || '',
        grade: e.grade || ''
      })),
      projects: (profileData.projects || []).map(p => ({
        name: p.name || '',
        description: p.description || ''
      })),
      certifications: (profileData.certifications || []).map(c =>
        typeof c === 'string' ? c : `${c.name || ''}${c.provider ? ' - ' + c.provider : ''}`
      ),
      competitions: profileData.competitions || [],
      languages: ['English']
    };

    console.log('✅ Resume parsing completed!');
    res.json({ success: true, data: parsedData });
  } catch (error) {
    console.error('❌ Parse error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});


import passwordResetRoutes from './routes/passwordReset.js';
import otpRoutes from './routes/otp.js';

app.use('/api', passwordResetRoutes);
app.use('/api/otp', otpRoutes);

app.get('/api/test-suggest', (req, res) => {
  res.json({ message: 'Suggest API is working', timestamp: new Date().toISOString() });
});

app.post('/api/login', async (req, res) => {
  res.status(404).json({ error: 'Use /api/users/login endpoint' });
});

app.post('/api/register', async (req, res) => {
  res.status(404).json({ error: 'Use /api/users/register endpoint' });
});

app.post('/api/chat', async (req, res) => {
  try {
    const { message, session_id } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });
    const result = await aiClient.chat(message, session_id || 'anonymous');
    res.json({ response: result.reply, sources: [] });
  } catch (error) {
    console.error('❌ Chat error:', error.message);
    res.json({ response: getFallbackResponse(req.body.message || ''), sources: [] });
  }
});

// Helper function for fallback responses
function getFallbackResponse(message) {
  const lowerMessage = (message || '').toLowerCase();

  if (lowerMessage.includes('apply') || lowerMessage.includes('application')) {
    return "📝 Here's how to apply for jobs effectively:\n\n• Create a complete profile with your skills and experience\n• Search for jobs that match your qualifications\n• Customize your resume for each application\n• Write a compelling cover letter\n• Follow up after applying\n• Use the 'Quick Apply' feature for faster applications\n\nWould you like specific tips on any of these steps?";
  }

  if (lowerMessage.includes('resume') || lowerMessage.includes('cv')) {
    return "📄 I'd be happy to help with your resume! Here are some key tips:\n\n• Use a clean, professional format\n• Highlight relevant skills and achievements\n• Quantify your accomplishments with numbers\n• Tailor your resume for each job application\n• Keep it concise (1-2 pages)\n\nWould you like specific advice on any section of your resume?";
  }

  if (lowerMessage.includes('interview')) {
    return "🎯 Great question about interviews! Here are some essential tips:\n\n• Research the company and role thoroughly\n• Practice common interview questions\n• Prepare specific examples using the STAR method\n• Ask thoughtful questions about the role\n• Follow up with a thank-you email\n\nWhat specific aspect of interview preparation would you like to focus on?";
  }

  if (lowerMessage.includes('job') || lowerMessage.includes('career')) {
    return "💼 I'm here to help with your job search and career! I can assist with:\n\n• Finding relevant job opportunities\n• Optimizing your job applications\n• Career path planning\n• Skill development recommendations\n• Industry insights\n\nWhat specific area would you like guidance on?";
  }

  if (lowerMessage.includes('salary') || lowerMessage.includes('negotiate')) {
    return "💰 Salary negotiation is important! Here are key strategies:\n\n• Research market rates for your role\n• Highlight your unique value and achievements\n• Consider the total compensation package\n• Practice your negotiation conversation\n• Be prepared to justify your request\n\nWould you like tips on researching salary ranges or negotiation techniques?";
  }

  if (lowerMessage.includes('hi') || lowerMessage.includes('hello') || lowerMessage.includes('hey')) {
    return "👋 Hello! I'm ZyncJobs AI Assistant. I'm here to help you with:\n\n🔍 Job searching and applications\n📄 Resume writing and optimization\n🎯 Interview preparation\n💼 Career development advice\n🏢 Company research\n\nWhat would you like assistance with today?";
  }

  return "👋 Hello! I'm ZyncJobs AI Assistant. I'm here to help you with:\n\n🔍 Job searching and applications\n📄 Resume writing and optimization\n🎯 Interview preparation\n💼 Career development advice\n🏢 Company research\n\nWhat would you like assistance with today?";
}

app.post('/api/generate-content', async (req, res) => {
  try {
    const { type, jobTitle, company, degree, school } = req.body;
    if (!type) return res.status(400).json({ error: 'type is required' });

    let prompt;
    if (type === 'experience') {
      prompt = `Write 3 professional resume bullet points for a ${jobTitle || 'professional'}${company ? ` at ${company}` : ''}. Each bullet should start with a strong action verb and include quantified achievements. Return only the bullets, one per line, no numbering.`;
    } else if (type === 'education') {
      prompt = `Write a professional education description for a resume: Graduated with ${degree || 'Bachelor\'s degree'} from ${school || 'University'}. Keep it 1-2 sentences.`;
    } else if (type === 'summary') {
      prompt = `Write a 2-sentence professional resume summary for a ${jobTitle || 'professional'}. Keep it concise and impactful.`;
    } else {
      return res.status(400).json({ error: 'Invalid type' });
    }

    const result = await aiClient.suggest(prompt);
    res.json({ content: result.reply || '' });
  } catch (error) {
    console.error('generate-content error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Job Post Text Parser - extracts structured fields from pasted job description
app.post('/api/parse-job-post', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || text.length < 30) {
      return res.status(400).json({ error: 'Please provide valid job post text' });
    }

    // Pre-extract company and location with regex before sending to AI
    const preExtract = preExtractJobFields(text);

    // Pre-extract job title from first non-empty line (skip metadata lines)
    const metaLinePattern = /^(experience|exp|salary|location|skills?|department|employment|job type|work type|notice|joining|ctc|lpa|years?|\*\*)/i;
    const firstLine = text.split('\n').map(l => l.trim()).find(l =>
      l.length > 3 && l.length < 120 && !metaLinePattern.test(l) && !/^\d/.test(l)
    );
    if (firstLine && !preExtract.jobTitle) preExtract.jobTitle = firstLine.replace(/^(job title|position|role)[:\s]*/i, '').trim();

    // Pre-extract experienceRange from text
    if (!preExtract.experienceRange) {
      const expMatch = text.match(/(?:experience|exp)[^\n]{0,20}?(\d+)\s*[\u2013\u2014\u2012-]\s*(\d+)\s*years?/i)
        || text.match(/(?:experience|exp)[^\n]{0,20}?(\d+)\+\s*years?/i)
        || text.match(/(\d+)\s*[\u2013\u2014\u2012-]\s*(\d+)\s*years?/i)
        || text.match(/(\d+)\+\s*years?\s*(?:of\s*)?(?:experience|exp)/i);
      if (expMatch) preExtract.experienceRange = expMatch[0].replace(/^[^\d]+/, '').trim();
    }

    const prompt = `You are a precise job post parser. Extract structured data from the job posting below.
Return ONLY a valid JSON object — no markdown fences, no explanation, nothing else.

RULES:
- "company": Hiring company proper noun only (e.g. "Infosys", "Accenture"). Never a skill, tool, heading, or comma-separated list. Return "" if unsure.${preExtract.company ? ` Detected: "${preExtract.company}"` : ''}
- "location": City/region only (e.g. "Muscat", "Dubai", "Chennai", "Remote"). Never a skill or company name. Return "" if not found.${preExtract.location ? ` Detected: "${preExtract.location}"` : ''}
- "jobTitle": Exact position title only.
- "jobType": Array from: ["Full-time"], ["Part-time"], ["Contract"], ["Internship"]. Default ["Full-time"].
- "workSetting": Exactly one of: Remote, Hybrid, On-site.
- "mustHaveSkills": Array of REQUIRED / MANDATORY / MUST-HAVE skills from the JD. Look for sections labeled "Must Have", "Required Skills", "Mandatory Skills", "Key Skills", "Technical Skills", "Primary Skills", "Core Skills", or skills listed under "Requirements" / "Qualifications". Include technical skills, domain-specific skills, certifications, tools. For non-tech roles (HSE, HR, Finance, Healthcare etc.) extract domain skills like "NEBOSH", "Risk Assessment", "HSE Inspection", "OSHA", "Fire Safety" etc.
- "goodToHaveSkills": Array of OPTIONAL / PREFERRED / NICE-TO-HAVE skills from the JD. Look for sections labeled "Good to Have", "Nice to Have", "Preferred Skills", "Bonus Skills", "Additional Skills", "Optional Skills", "Desired Skills". If no such section exists, return empty array [].
- "experienceRange": MUST be in format "X-Y years" or "X+ years" using digits only. Examples: "3-5 years", "5-8 years", "2+ years". Extract from text like "5-8 Years", "3 to 5 years", "minimum 5 years".${preExtract.experienceRange ? ` Detected: "${preExtract.experienceRange}"` : ""}
- "experienceLevel": One of: Entry, Mid, Senior, Lead.
- "salaryMin": 0 always.
- "salaryMax": 0 always.
- "currency": INR default, USD/AED/OMR if context indicates.
- "jobCategory": Pick the BEST match from: Software Development, Data Science & Analytics, Sales & Marketing, Finance & Accounting, Human Resources, Operations, Customer Service, Healthcare, Engineering, Education, Information Technology, Oil & Gas, Construction, Manufacturing, Media & Communications, Logistics & Supply Chain, Other. Use "Engineering" for HSE/civil/mechanical/electrical. Use "Oil & Gas" if the JD mentions infrastructure/oil/gas/petrochemical.
- "description": Full job description text as-is.
- "responsibilities": Array of up to 8 responsibility bullet points extracted from the JD.
- "requirements": Array of up to 8 requirement bullet points extracted from the JD.
- "educationLevel": Degree required e.g. "Bachelor's Degree".
- "priority": One of: Low, Medium, High, Urgent.
- "benefits": Array of benefits explicitly offered by the employer. Extract from sections labeled "Benefits", "Perks", "What We Offer". Look for specific named benefits like "Health insurance", "Dental insurance", "Vision insurance", "Life insurance", "Visa sponsorship", "Green card sponsorship", "AD&D insurance", "Paid time off", "401k", "Stock options", etc. Do NOT include generic mentions in requirements/qualifications sections. Return empty array [] if no benefits section found.

JOB POST:
${text.substring(0, 5000)}

JSON:
{
  "company": "",
  "jobTitle": "",
  "location": "",
  "jobType": ["Full-time"],
  "workSetting": "On-site",
  "mustHaveSkills": [],
  "goodToHaveSkills": [],
  "experienceLevel": "Mid",
  "experienceRange": "",
  "salaryMin": 0,
  "salaryMax": 0,
  "currency": "INR",
  "jobCategory": "Information Technology",
  "description": "",
  "responsibilities": [],
  "requirements": [],
  "educationLevel": "Bachelor's Degree",
  "priority": "Medium",
  "benefits": []
}`;

    let content = '';
    try {
      const result = await aiClient.suggest(prompt);
      content = result.reply || '';
    } catch (aiErr) {
      console.warn('AI parse failed:', aiErr.message);
      return res.status(200).json({ success: true, data: buildFallbackParsed(text, preExtract) });
    }

    // Process AI response
    if (content) {
      try {
        const cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        const parsed = JSON.parse(cleaned);

        const companyName = sanitizeCompany(parsed.company || '', preExtract.company);
        const location = sanitizeLocation(parsed.location || '', preExtract.location);

        return res.json({
          success: true,
          data: {
            company: companyName,
            jobTitle: parsed.jobTitle || preExtract.jobTitle || '',
            location,
            jobType: Array.isArray(parsed.jobType) ? parsed.jobType : ['Full-time'],
            workSetting: parsed.workSetting || 'On-site',
            skills: Array.isArray(parsed.mustHaveSkills) ? parsed.mustHaveSkills : [],
            goodToHaveSkills: Array.isArray(parsed.goodToHaveSkills) ? parsed.goodToHaveSkills : [],
            experienceLevel: parsed.experienceLevel || 'Mid',
            experienceRange: parsed.experienceRange || preExtract.experienceRange || '',
            salaryMin: parsed.salaryMin || 0,
            salaryMax: parsed.salaryMax || 0,
            currency: parsed.currency || 'INR',
            jobCategory: parsed.jobCategory || 'Information Technology',
            description: parsed.description || text,
            responsibilities: Array.isArray(parsed.responsibilities) ? parsed.responsibilities : [],
            requirements: Array.isArray(parsed.requirements) ? parsed.requirements : [],
            educationLevel: parsed.educationLevel || "Bachelor's Degree",
            priority: parsed.priority || 'Medium',
          }
        });
      } catch (parseErr) {
        console.warn('Failed to parse AI response as JSON:', parseErr.message);
        return res.status(200).json({ success: true, data: buildFallbackParsed(text, preExtract) });
      }
    } else {
      return res.status(200).json({ success: true, data: buildFallbackParsed(text, preExtract) });
    }
  } catch (err) {
    console.error('Parse-job-post error:', err.message);
    return res.status(200).json({ success: true, data: buildFallbackParsed(text, preExtract) });
  }
});

// Pre-extract company and location using regex patterns before AI call
function preExtractJobFields(text) {
  const result = { company: '', location: '' };

  // Company extraction patterns
  const companyPatterns = [
    /company\s*[:\-]\s*([A-Za-z0-9][\w\s&.,'-]{1,50}?)(?:\n|\||,|$)/im,
    /(?:about|join|at)\s+([A-Z][A-Za-z0-9\s&.,'-]{1,40}?)(?:\s+is\s+hiring|\s+is\s+looking|\s+we\s+are|\n|\||,)/im,
    /([A-Z][A-Za-z0-9\s&.,'-]{1,40}?)\s+is\s+(?:hiring|looking for|seeking)/im,
    /^([A-Z][A-Za-z0-9\s&.,'-]{1,40}?)\s*[-|]\s*(?:job|career|opening|position|hiring)/im,
    /employer\s*[:\-]\s*([A-Za-z0-9][\w\s&.,'-]{1,50}?)(?:\n|\||,|$)/im,
    /organisation\s*[:\-]\s*([A-Za-z0-9][\w\s&.,'-]{1,50}?)(?:\n|\||,|$)/im,
    /organization\s*[:\-]\s*([A-Za-z0-9][\w\s&.,'-]{1,50}?)(?:\n|\||,|$)/im,
  ];

  for (const pattern of companyPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const candidate = match[1].trim().replace(/[.,]+$/, '');
      if (candidate.length >= 2 && candidate.length <= 60) {
        result.company = candidate;
        break;
      }
    }
  }

  // Location extraction patterns - Indian cities + common global cities
  const indianCities = [
    'Chennai', 'Bangalore', 'Bengaluru', 'Mumbai', 'Hyderabad', 'Pune', 'Delhi',
    'Kolkata', 'Ahmedabad', 'Coimbatore', 'Madurai', 'Noida', 'Gurgaon', 'Gurugram',
    'Kochi', 'Thiruvananthapuram', 'Jaipur', 'Chandigarh', 'Indore', 'Bhopal',
    'Nagpur', 'Surat', 'Vadodara', 'Lucknow', 'Patna', 'Bhubaneswar', 'Visakhapatnam',
    'Mysore', 'Mysuru', 'Mangalore', 'Hubli', 'Tiruchirappalli', 'Trichy', 'Salem',
    'Vellore', 'Erode', 'Tirunelveli', 'Pondicherry', 'Puducherry'
  ];
  const globalCities = [
    'Remote', 'Singapore', 'Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman',
    'Muscat', 'Salalah', 'Sohar', 'Nizwa',
    'Riyadh', 'Jeddah', 'Dammam', 'Khobar',
    'Doha', 'Kuwait City', 'Manama',
    'London', 'New York', 'San Francisco', 'Toronto', 'Sydney', 'Melbourne', 'Berlin', 'Amsterdam'
  ];
  const allCities = [...indianCities, ...globalCities];

  // Try explicit location label first
  const locationLabelMatch = text.match(/location\s*[:\-]\s*([^\n,|]{2,50})/i);
  if (locationLabelMatch) {
    const locText = locationLabelMatch[1].trim();
    // Check if it contains a known city
    const foundCity = allCities.find(c => locText.toLowerCase().includes(c.toLowerCase()));
    if (foundCity) {
      result.location = foundCity === 'Bengaluru' ? 'Bangalore' : foundCity;
    } else if (locText.toLowerCase().includes('remote')) {
      result.location = 'Remote';
    } else if (locText.length <= 40) {
      result.location = locText.split(/[,|]/)[0].trim();
    }
  }

  // Fallback: scan full text for city names
  if (!result.location) {
    for (const city of allCities) {
      const cityRegex = new RegExp(`\\b${city}\\b`, 'i');
      if (cityRegex.test(text)) {
        result.location = city === 'Bengaluru' ? 'Bangalore' : city;
        break;
      }
    }
  }

  return result;
}

// Sanitize AI-returned company name
function sanitizeCompany(aiCompany, preExtracted) {
  const invalidPhrases = [
    'good to have', 'must have', 'nice to have', 'required', 'preferred',
    'skills', 'experience', 'qualifications', 'responsibilities', 'benefits',
    'about the role', 'mandatory', 'optional', 'desired', 'added advantage',
    'key skills', 'technical skills', 'soft skills', 'job description',
    'job requirements', 'job responsibilities', 'what we offer', 'who we are',
    'not mentioned', 'not specified', 'not provided', 'n/a', 'na', 'none'
  ];

  // Known tools/technologies that are NOT company names
  const knownTools = [
    'postman', 'rest assured', 'selenium', 'jira', 'confluence', 'jenkins',
    'docker', 'kubernetes', 'git', 'github', 'gitlab', 'bitbucket',
    'react', 'angular', 'vue', 'node', 'nodejs', 'express', 'django', 'flask',
    'spring', 'hibernate', 'maven', 'gradle', 'junit', 'pytest', 'jest',
    'aws', 'azure', 'gcp', 'terraform', 'ansible', 'linux', 'ubuntu',
    'mysql', 'postgresql', 'mongodb', 'redis', 'elasticsearch',
    'python', 'java', 'javascript', 'typescript', 'kotlin', 'swift', 'golang',
    'html', 'css', 'sass', 'tailwind', 'bootstrap', 'figma', 'sketch',
    'tableau', 'power bi', 'excel', 'salesforce', 'sap', 'erp',
    'agile', 'scrum', 'kanban', 'devops', 'ci/cd', 'microservices',
    'machine learning', 'deep learning', 'tensorflow', 'pytorch',
    'rest', 'graphql', 'soap', 'api', 'sql', 'nosql'
  ];

  const isInvalid = (val) => {
    if (!val || val.trim().length < 2) return true;
    const lower = val.toLowerCase().trim();
    if (invalidPhrases.some(p => lower.includes(p))) return true;
    // Check if it's a known tool/technology
    if (knownTools.some(t => lower === t || lower.includes(t + ',') || lower.startsWith(t + ' '))) return true;
    // If it contains a comma and both parts are tools, it's a skills list
    if (lower.includes(',')) {
      const parts = lower.split(',').map(p => p.trim());
      const toolCount = parts.filter(p => knownTools.some(t => p.includes(t))).length;
      if (toolCount >= 1) return true; // any tool in a comma-separated list = not a company
    }
    // All-caps with more than 3 words = likely a section heading
    if (/^[A-Z\s&]+$/.test(val) && val.trim().split(/\s+/).length > 3) return true;
    // Starts with a number
    if (/^\d/.test(val.trim())) return true;
    return false;
  };

  if (!isInvalid(aiCompany)) return aiCompany.trim();
  if (!isInvalid(preExtracted)) return preExtracted.trim();
  return '';
}

// Sanitize AI-returned location
function sanitizeLocation(aiLocation, preExtracted) {
  const invalidWords = [
    'not mentioned', 'not specified', 'not provided', 'n/a', 'na', 'none',
    'india', 'pan india', 'anywhere', 'multiple', 'various'
  ];

  const knownCities = [
    'Chennai', 'Bangalore', 'Bengaluru', 'Mumbai', 'Hyderabad', 'Pune', 'Delhi',
    'Kolkata', 'Ahmedabad', 'Coimbatore', 'Madurai', 'Noida', 'Gurgaon', 'Gurugram',
    'Kochi', 'Thiruvananthapuram', 'Jaipur', 'Chandigarh', 'Indore', 'Bhopal',
    'Nagpur', 'Surat', 'Vadodara', 'Lucknow', 'Patna', 'Bhubaneswar', 'Visakhapatnam',
    'Mysore', 'Mysuru', 'Mangalore', 'Hubli', 'Tiruchirappalli', 'Trichy', 'Salem',
    'Vellore', 'Erode', 'Tirunelveli', 'Pondicherry', 'Puducherry',
    'Remote', 'Hybrid', 'Singapore',
    'Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman',
    'Muscat', 'Salalah', 'Sohar', 'Nizwa',
    'Riyadh', 'Jeddah', 'Dammam', 'Khobar',
    'Doha', 'Kuwait City', 'Manama',
    'London', 'New York', 'San Francisco', 'Toronto', 'Sydney', 'Melbourne', 'Berlin'
  ];

  const isInvalid = (val) => {
    if (!val || val.trim().length < 2) return true;
    const lower = val.toLowerCase().trim();
    if (invalidWords.some(w => lower === w || lower.includes(w))) return true;
    // If it's just "India" alone, it's too vague
    if (lower === 'india') return true;
    return false;
  };

  const normalize = (val) => {
    if (!val) return val;
    // Normalize Bengaluru -> Bangalore
    return val.replace(/bengaluru/gi, 'Bangalore').replace(/gurugram/gi, 'Gurgaon').trim();
  };

  // Prefer AI result if it's a known city
  if (!isInvalid(aiLocation)) {
    const loc = normalize(aiLocation.trim());
    // Check if it contains a known city name
    const matched = knownCities.find(c => loc.toLowerCase().includes(c.toLowerCase()));
    if (matched) return matched === 'Bengaluru' ? 'Bangalore' : matched;
    // Accept short location strings (city names)
    if (loc.length <= 50 && !loc.includes('\n')) return loc;
  }

  // Fall back to pre-extracted
  if (!isInvalid(preExtracted)) return normalize(preExtracted.trim());

  return '';
}

// Fallback parsed result when AI is unavailable
function buildFallbackParsed(text, preExtract) {
  // Try to extract job title from first line or common patterns
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  let jobTitle = '';
  // First non-empty line that looks like a job title
  for (const line of lines.slice(0, 5)) {
    if (line.length > 3 && line.length < 100 && !line.includes('@') && !line.match(/^\d/)) {
      jobTitle = line.replace(/^(job title|position|role)[:\s]*/i, '').trim();
      break;
    }
  }
  // Regex fallback
  if (!jobTitle) {
    const m = text.match(/(?:job title|position|role)[:\s]+([^\n]{3,80})/i);
    if (m) jobTitle = m[1].trim();
  }

  return {
    company: preExtract.company || '',
    jobTitle: jobTitle || preExtract.jobTitle || '',
    location: preExtract.location || '',
    jobType: ['Full-time'],
    workSetting: /remote/i.test(text) ? 'Remote' : /hybrid/i.test(text) ? 'Hybrid' : 'On-site',
    skills: [],
    experienceLevel: 'Mid',
    experienceRange: '',
    salaryMin: 0,
    salaryMax: 0,
    currency: 'INR',
    jobCategory: 'Information Technology',
    description: text,
    responsibilities: [],
    requirements: [],
    educationLevel: "Bachelor's Degree",
    priority: 'Medium',
  };
}

// AI Job Description Generation
app.post('/api/generate-job-description', async (req, res) => {
  try {
    const { jobTitle, company, jobType, location } = req.body;
    if (!jobTitle) return res.status(400).json({ error: 'Job title is required' });

    const prompt = `You are an expert HR professional. Generate a professional job description and requirements for the role below.

Job Title: ${jobTitle}${company ? `\nCompany: ${company}` : ''}${location ? `\nLocation: ${location}` : ''}${jobType ? `\nType: ${jobType}` : ''}

Return ONLY valid JSON (no markdown, no explanation) with this exact structure:
{
  "description": "Job Summary paragraph\\n\\nKey Responsibilities\\n• Responsibility 1\\n• Responsibility 2\\n• Responsibility 3\\n• Responsibility 4\\n• Responsibility 5",
  "requirements": "• Requirement 1\\n• Requirement 2\\n• Requirement 3\\n• Requirement 4\\n• Requirement 5"
}

Use plain section headings and • for bullet points. Do not use **, *, or any markdown.`;

    const raw = await aiClient.suggest(prompt);
    const cleaned = (raw.reply || '').replace(/```json|```/g, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Could not parse AI response as JSON');
    const parsed = JSON.parse(jsonMatch[0]);
    res.json({ description: parsed.description || '', requirements: parsed.requirements || '' });
  } catch (error) {
    console.error('generate-job-description error:', error.message);
    const companyName = company || 'our company';
    res.json({
      description: `We are looking for a ${jobTitle} to join ${companyName}. The ideal candidate will have relevant experience and skills for this role.`,
      requirements: `• 2+ years of relevant experience\n• Strong technical skills\n• Excellent communication and teamwork abilities`
    });
  }
});

// Serve service worker with correct MIME type
app.get('/sw.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Service-Worker-Allowed', '/');
  const swPath = path.join(process.cwd(), 'public', 'sw.js');
  if (fs.existsSync(swPath)) {
    res.sendFile(swPath);
  } else {
    res.status(404).send('Service worker not found');
  }
});

// Serve manifest with correct MIME type
app.get('/manifest.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const manifestPath = path.join(process.cwd(), 'public', 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    res.sendFile(manifestPath);
  } else {
    res.status(404).send('Manifest not found');
  }
});

app.get('/', (req, res) => {
  res.json({ message: 'Trinity Jobs API is running!', status: 'OK' });
});

app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send('User-agent: *\nDisallow:');
});

app.get('/favicon.ico', (req, res) => res.status(204).end());

// Test notifications endpoint
app.get('/api/notifications/test/:employerEmail', async (req, res) => {
  try {
    const { employerEmail } = req.params;
    
    console.log(`🔔 Testing notifications for: ${employerEmail}`);
    
    // Trigger daily summary
    const summary = await notificationScheduler.triggerDailySummary(employerEmail);
    
    // Get current notifications
    const response = await fetch(`${req.protocol}://${req.get('host')}/api/notifications?employerEmail=${encodeURIComponent(employerEmail)}`);
    const notifications = await response.json();
    
    res.json({
      message: 'Notification test completed',
      employerEmail,
      summaryGenerated: !!summary,
      currentNotifications: notifications.length,
      schedulerStatus: notificationScheduler.getStatus()
    });
  } catch (error) {
    console.error('❌ Notification test error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Test settings endpoint
app.get('/api/test-settings', (req, res) => {
  try {
    const settingsPath = path.join(__dirname, 'data/adminSettings.json');
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    res.json({
      settings,
      jobAutoApprove: settings.jobAutoApprove,
      getJobStatus: getJobStatus()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Simple health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    await sequelize.authenticate();
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      services: { api: true, database: true, redis: getRedisStatus() },
      version: '1.0.0'
    });
  } catch (error) {
    console.error('❌ Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message,
      services: { api: true, database: false, redis: getRedisStatus() }
    });
  }
});

// Ping endpoint for basic connectivity
app.get('/api/ping', (req, res) => {
  res.json({ message: 'pong', timestamp: new Date().toISOString(), server: 'zyncjobs-api' });
});

// Test applications endpoint
app.get('/api/applications/test', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Applications endpoint is working',
    timestamp: new Date().toISOString()
  });
});

// Test resume parser route
app.get('/api/resume-parser/test', (req, res) => {
  res.json({ message: 'Resume parser route is working!', timestamp: new Date().toISOString() });
});

app.get('/api/test', async (req, res) => {
  try {
    const { sequelize } = await import('./config/postgresql.js');
    await sequelize.authenticate();
    res.json({ status: 'success', message: 'Connected to PostgreSQL' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Test analytics endpoint
app.get('/api/test-analytics', async (req, res) => {
  try {
    const Analytics = (await import('./models/Analytics.js')).default;

    const email = 'mutheeswaran@trinitetech.com';

    const searchAppearances = await Analytics.count({
      where: {
        email: { [Op.iLike]: `%${email}%` },
        eventType: 'search_appearance'
      }
    });

    const recruiterActions = await Analytics.count({
      where: {
        email: { [Op.iLike]: `%${email}%` },
        eventType: 'recruiter_action'
      }
    });

    const allData = await Analytics.findAll({
      where: {
        email: { [Op.iLike]: `%${email}%` }
      },
      order: [['createdAt', 'DESC']]
    });

    res.json({
      status: 'success',
      email,
      searchAppearances,
      recruiterActions,
      totalRecords: allData.length,
      data: allData
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API-only server — all non-API routes return 404
app.get('*', (req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

app.use(Sentry.expressErrorHandler());
app.use(errorHandler);


// Format description text with proper bullet points
export function formatDescriptionWithBullets(text) {
  if (!text) return '';

  // If already HTML, return as-is
  if (/<[a-z][\s\S]*>/i.test(text)) return text;

  const BULLET_SECTIONS = new Set([
    'key responsibilities','responsibilities','requirements',
    'preferred qualifications','qualifications','what we offer',
    'nice to have','skills required','required skills','benefits',
    'about the role','who you are','your responsibilities',
    'job responsibilities','duties','key duties','what you will do',
    'what we are looking for','your role','the role'
  ]);

  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  let out = '', inList = false, inBulletSection = false;

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const isBullet = /^[-*•]\s+/.test(l) || /^\d+[.)\s]\s*/.test(l);
    const lower = l.toLowerCase().replace(/:$/, '').trim();

    // Detect section heading: short line ending with colon OR followed by a bullet line
    const nextIsBullet = i < lines.length - 1 && (/^[-*•]\s+/.test(lines[i + 1]) || /^\d+[.)\s]\s*/.test(lines[i + 1]));
    const isHeading = l.length < 80 && (l.endsWith(':') || nextIsBullet) && !isBullet;

    if (isHeading) {
      if (inList) { out += '</ul>\n'; inList = false; }
      inBulletSection = BULLET_SECTIONS.has(lower);
      out += '<h3>' + l.replace(/:$/, '') + '</h3>\n';
    } else if (isBullet) {
      // Explicit bullet — strip the bullet marker
      const content = l.replace(/^[-*•]\s+/, '').replace(/^\d+[.)\s]\s*/, '');
      if (!inList) { out += '<ul>\n'; inList = true; }
      out += '<li>' + content + '</li>\n';
    } else if (inBulletSection) {
      // Plain line inside a known bullet section — treat as bullet
      if (!inList) { out += '<ul>\n'; inList = true; }
      out += '<li>' + l + '</li>\n';
    } else {
      if (inList) { out += '</ul>\n'; inList = false; inBulletSection = false; }
      out += '<p>' + l + '</p>\n';
    }
  }

  if (inList) out += '</ul>\n';
  return out;
}

function filterSkillsByJobTitle(skills, jobTitle) {
  const title = jobTitle.toLowerCase();
  const domainMap = [
    { keys: ['react','frontend','front-end','ui developer','web developer'],
      keep: ['react','javascript','typescript','html','css','redux','webpack','tailwind','sass','jest','next','vue','angular','figma','rest api','graphql'] },
    { keys: ['node','backend','back-end','express','api developer'],
      keep: ['node','express','javascript','typescript','mongodb','postgresql','mysql','redis','docker','aws','rest api','graphql','kafka','nginx'] },
    { keys: ['python','django','flask','data engineer','ml','machine learning','ai','data scientist'],
      keep: ['python','django','flask','pandas','numpy','tensorflow','pytorch','scikit','sql','postgresql','mongodb','aws','docker','spark','kafka','airflow'] },
    { keys: ['java','spring','j2ee','microservices'],
      keep: ['java','spring','hibernate','maven','gradle','mysql','postgresql','kafka','docker','kubernetes','aws','rest','soap','junit'] },
    { keys: ['devops','cloud','aws','azure','gcp','infrastructure','sre'],
      keep: ['aws','azure','gcp','docker','kubernetes','terraform','ansible','jenkins','linux','bash','python','ci/cd','prometheus','grafana','nginx'] },
    { keys: ['qa','quality','tester','automation','manual test'],
      keep: ['selenium','cypress','playwright','jira','testng','junit','postman','rest assured','appium','java','python','javascript','sql','jmeter','agile'] },
    { keys: ['data analyst','business analyst','bi','tableau','power bi'],
      keep: ['sql','excel','tableau','power bi','python','r','pandas','google analytics','looker','dax','etl','aws','azure'] },
    { keys: ['product manager','product owner','scrum master','agile coach'],
      keep: ['jira','confluence','agile','scrum','kanban','roadmap','figma','sql','analytics','stakeholder','ux'] },
    { keys: ['sales','business development','account manager','crm'],
      keep: ['salesforce','crm','excel','hubspot','pipedrive','b2b','b2c','negotiation','linkedin','cold calling'] },
    { keys: ['hr','recruiter','talent','people operations'],
      keep: ['ats','workday','sap hr','excel','linkedin','recruitment','onboarding','payroll','hris'] },
  ];
  const matched = domainMap.find(d => d.keys.some(k => title.includes(k)));
  if (!matched) return skills;
  return skills.filter(skill => {
    const s = skill.toLowerCase();
    return matched.keep.some(k => s.includes(k) || k.includes(s));
  });
}

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
  console.log(`🔗 Frontend URL: ${process.env.FRONTEND_URL}`);
  console.log(`💬 Socket.io enabled for real-time features`);
  console.log(`📧 Job alert scheduler: ${jobAlertScheduler.isRunning ? 'ACTIVE' : 'INACTIVE'}`);
  console.log(`🔔 Notification scheduler: ${notificationScheduler.isRunning ? 'ACTIVE' : 'INACTIVE'}`);
}).on('error', (err) => {
  console.error('❌ Server failed to start:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  jobAlertScheduler.stop();
  notificationScheduler.stop();
  gdprRetentionScheduler.stop();
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
// TEST

