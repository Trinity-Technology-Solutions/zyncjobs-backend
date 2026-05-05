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
import messageRoutes from './routes/messages.js';
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
import aiRejectionSettingsRoutes from './routes/aiRejectionSettings.js';
import credentialingRoutes from './routes/credentialing.js';
import salaryInsightsRoutes from './routes/salaryInsights.js';
import resumeBuilderRoutes from './routes/resumeBuilder.js';
import gdprRoutes from './routes/gdpr.js';
import contactRoutes from './routes/contact.js';
import aiRoutes from './routes/ai.js';
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
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Trust proxy for deployment
app.set('trust proxy', 1);
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(",") : [].filter(Boolean),
    credentials: true
  }
});
const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  console.log('✅ Database connected');
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

// Wire Socket.io to analytics tracking for real-time updates
setAnalyticsIo(io);

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
      // Allow framing from frontend origins AND the API domain itself
      'frame-ancestors': ["'self'", ...ALLOWED_ORIGINS, ...(apiOrigin ? [apiOrigin] : [])],
      'frame-src': ["'self'", ...ALLOWED_ORIGINS, ...(apiOrigin ? [apiOrigin] : [])],
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
app.use(sanitizeInput);
app.use(cookieParser());
app.use(express.json({ limit: '20mb' }));
// Debug middleware - only in development
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });
}
app.use(express.urlencoded({ extended: true }));

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
app.use('/api/analytics', analyticsTrackingRoutes);
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
app.use('/api/social', socialShareRoutes);
app.use('/api/ai-rejection-settings/preview', aiRejectionSettingsRoutes);
app.use('/api/ai-rejection-settings/bulk-reject', aiRejectionSettingsRoutes);
app.use('/api/ai-rejection-settings', aiRejectionSettingsRoutes);
app.use('/api/credentialing', credentialingRoutes);
app.use('/api/salary-insights', salaryInsightsRoutes);
app.use('/api/resume-builder', resumeBuilderRoutes);
app.use('/api/gdpr', gdprRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/ai', aiRoutes);
app.use('/', ogTagsRoutes);

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
    const { message, session_id, language } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    console.log('💬 Chat request:', { message, session_id });

    // Check if OpenRouter API key exists
    if (!process.env.OPENROUTER_API_KEY) {
      console.error('❌ OpenRouter API key not found');
      return res.json({
        response: "I'm ZyncJobs AI Assistant! I can help you with job searching, resume building, interview preparation, and career advice. What would you like to know?",
        sources: []
      });
    }

    // Call OpenRouter API with Mistral
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.FRONTEND_URL || 'http://localhost:5173',
        'X-Title': 'ZyncJobs'
      },
      body: JSON.stringify({
        model: 'google/gemma-3-4b-it:free',
        messages: [
          {
            role: 'system',
            content: `You are ZyncJobs AI Assistant, a helpful chatbot for a job portal called ZyncJobs. You help users with:

🔍 Job Search & Applications:
- Finding relevant job opportunities
- Application strategies and tips
- Job market insights

📄 Resume & Profile:
- Resume writing and optimization
- LinkedIn profile enhancement
- Skills highlighting

🎯 Interview Preparation:
- Common interview questions
- Interview techniques and tips
- Salary negotiation advice

💼 Career Development:
- Career path guidance
- Skills development recommendations
- Industry trends and insights

🏢 Company Research:
- Company culture insights
- Industry analysis
- Work environment tips

Always be helpful, professional, and focus on job-related topics. Keep responses concise, actionable, and encouraging. Use emojis sparingly for better readability.`
          },
          {
            role: 'user',
            content: message
          }
        ],
        max_tokens: 600,
        temperature: 0.7,
        top_p: 0.9
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ OpenRouter API error: ${response.status} - ${errorText}`);

      // Provide helpful fallback response based on common queries
      const fallbackResponse = getFallbackResponse(message);
      return res.json({
        response: fallbackResponse,
        sources: []
      });
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content || getFallbackResponse(message);

    console.log('✅ Chat response generated successfully');

    res.json({
      response: aiResponse.trim(),
      sources: []
    });
  } catch (error) {
    console.error('❌ Chat error:', error.message);

    const fallbackResponse = getFallbackResponse(req.body.message || '');
    res.json({
      response: fallbackResponse,
      sources: []
    });
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
    let content = '';

    if (type === 'experience') {
      content = `• Managed daily operations and improved efficiency by implementing new processes\n• Collaborated with cross-functional teams to deliver high-quality results\n• Analyzed data and provided insights to support strategic decision-making`;
    } else if (type === 'education') {
      content = `Graduated with ${degree || 'Bachelor\'s degree'} from ${school || 'University'}. Completed coursework in relevant subjects and developed strong analytical skills.`;
    } else if (type === 'summary') {
      content = `Dedicated ${jobTitle || 'professional'} with strong background and proven track record of delivering results.`;
    }

    res.json({ content });
  } catch (error) {
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

    const prompt = `You are a precise job post parser. Extract structured data from the job posting below.
Return ONLY valid JSON, no markdown, no explanation.

CRITICAL EXTRACTION RULES:

"company": Extract ONLY the hiring company/organization name.
  - Look for patterns: "About [Company]", "[Company] is hiring", "Company: [Name]", "at [Company]", "Join [Company]", "[Company] - Job Title"
  - The company name is usually a proper noun (e.g. "Infosys", "TCS", "Google", "Zoho", "Freshworks")
  - NEVER EVER use section headings or requirement labels as company name. These are NOT company names: "Good to Have", "Must Have", "Nice to Have", "Required", "Preferred", "Mandatory", "Skills", "Experience", "Qualifications", "Responsibilities", "Benefits", "About the Role", "Key Skills"
  - NEVER use tools, technologies, or skills as company name. These are tools NOT companies: "Postman", "REST Assured", "Selenium", "Docker", "Kubernetes", "Jenkins", "Jira", "Git", "GitHub", "React", "Angular", "Python", "Java", "AWS", "Azure", "MySQL", "MongoDB", "Figma", "Agile", "Scrum"
  - A company name is NEVER a comma-separated list of tools or skills
  - If you cannot find a real company name, return "" (empty string). Do NOT guess.
  ${preExtract.company ? `- The company name for this job post is: "${preExtract.company}" — use this value.` : '- No company name pattern found in text, return "".'}}

"location": Extract ONLY the actual city/region where the job is located.
  - Look for patterns: "Location: [City]", "Based in [City]", "Office in [City]", "[City], India", "[City] | [State]"
  - Valid examples: "Chennai", "Bangalore", "Mumbai", "Hyderabad", "Pune", "Delhi", "Remote", "Hybrid"
  - NEVER use: company names, job titles, skill names, or generic words like "India" alone
  - If the job is remote, return "Remote"
  - If not found, return ""
  ${preExtract.location ? `- HINT: Likely location detected: "${preExtract.location}"` : ''}

"jobTitle": The exact job position title only (e.g. "Senior React Developer", "Data Analyst").
"jobType": Array of applicable types from: Full-time, Part-time, Contract, Freelance, Internship. Can be multiple (e.g. ["Full-time", "Contract"]).
"workSetting": One of exactly: Remote, Hybrid, On-site.
"skills": Array of specific technical/professional skills (e.g. ["React", "Node.js", "PostgreSQL"]).
"experienceLevel": One of exactly: Entry, Mid, Senior, Lead. Infer from years required.
"experienceRange": String like "3-5 years" or "2+ years" extracted from the text.
"salaryMin": Minimum salary as integer (0 if not mentioned).
"salaryMax": Maximum salary as integer (0 if not mentioned).
"currency": Currency code like INR, USD, EUR (default INR if Indian context).
"jobCategory": One of: Software Development, Data Science & Analytics, Sales & Marketing, Finance & Accounting, Human Resources, Operations, Customer Service, Healthcare, Engineering, Education, Information Technology, Other.
"description": The full job description text as-is.
"responsibilities": Array of key responsibility bullet points (max 6).
"requirements": Array of key requirement bullet points (max 6).
"educationLevel": Degree required like "Bachelor's Degree", "Master's Degree", etc.
"priority": One of: Low, Medium, High, Urgent. Infer from urgency words.

JOB POST:
${text.substring(0, 3500)}

JSON:
{
  "company": "",
  "jobTitle": "",
  "location": "",
  "jobType": ["Full-time"],
  "workSetting": "On-site",
  "skills": [],
  "experienceLevel": "Mid",
  "experienceRange": "",
  "salaryMin": 0,
  "salaryMax": 0,
  "currency": "INR",
  "jobCategory": "Software Development",
  "description": "",
  "responsibilities": [],
  "requirements": [],
  "educationLevel": "Bachelor's Degree",
  "priority": "Medium"
}`;

    if (!process.env.OPENROUTER_API_KEY) {
      return res.status(200).json({ success: true, data: buildFallbackParsed(text, preExtract) });
    }

    const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.FRONTEND_URL || 'http://localhost:5173',
        'X-Title': 'ZyncJobs-JobParser'
      },
      body: JSON.stringify({
        model: 'google/gemma-3-4b-it:free',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 1500
      })
    });

    if (!aiRes.ok) {
      console.warn('⚠️ OpenRouter returned', aiRes.status, '— using fallback');
      return res.status(200).json({ success: true, data: buildFallbackParsed(text, preExtract) });
    }

    const data = await aiRes.json();
    const content = data.choices?.[0]?.message?.content || '';
    const cleaned = content.trim().replace(/```json|```/g, '');
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return res.status(200).json({ success: true, data: buildFallbackParsed(text, preExtract) });
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      return res.status(200).json({ success: true, data: buildFallbackParsed(text, preExtract) });
    }

    // Post-process: validate and fix company
    parsed.company = ''; // Never auto-fill company from JD

    // Post-process: validate and fix location
    parsed.location = sanitizeLocation(parsed.location, preExtract.location);

    // Never auto-fill salary from JD
    parsed.salaryMin = 0;
    parsed.salaryMax = 0;

    // Ensure arrays
    if (!Array.isArray(parsed.skills)) parsed.skills = [];
    if (!Array.isArray(parsed.responsibilities)) parsed.responsibilities = [];
    if (!Array.isArray(parsed.requirements)) parsed.requirements = [];
    if (!Array.isArray(parsed.jobType)) parsed.jobType = parsed.jobType ? [parsed.jobType] : ['Full-time'];

    // If description is empty, use original text
    if (!parsed.description) parsed.description = text;

    console.log('✅ Job post parsed - company:', parsed.company, '| title:', parsed.jobTitle, '| location:', parsed.location);
    res.json({ success: true, data: parsed });
  } catch (error) {
    console.error('❌ Job post parse error:', error.message);
    res.status(500).json({ error: error.message });
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
    'Remote', 'Singapore', 'Dubai', 'Abu Dhabi', 'London', 'New York', 'San Francisco',
    'Toronto', 'Sydney', 'Melbourne', 'Doha', 'Riyadh', 'Berlin', 'Amsterdam'
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
    'Remote', 'Hybrid', 'Singapore', 'Dubai', 'Abu Dhabi', 'London', 'New York',
    'San Francisco', 'Toronto', 'Sydney', 'Melbourne', 'Doha', 'Riyadh', 'Berlin'
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
  return {
    company: preExtract.company || '',
    jobTitle: '',
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

    if (!jobTitle) {
      return res.status(400).json({ error: 'Job title is required' });
    }

    const description = generateJobDescription(jobTitle, company, jobType, location);
    const requirements = generateJobRequirements(jobTitle);

    res.json({ description, requirements });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

function generateJobDescription(jobTitle, company, jobType, location) {
  const companyName = company || 'our company';

  const templates = {
    'react': `We are seeking a skilled React Developer to join ${companyName}. You will be responsible for developing user interface components and implementing them following well-known React.js workflows.

Key Responsibilities:
• Develop new user-facing features using React.js
• Build reusable components and front-end libraries
• Translate designs and wireframes into high-quality code
• Optimize components for maximum performance
• Collaborate with team members and stakeholders`,

    'python': `Join ${companyName} as a Python Developer and contribute to building scalable applications. You will work on backend development, API integration, and data processing solutions.

Key Responsibilities:
• Develop and maintain Python applications
• Design and implement RESTful APIs
• Work with databases and data processing
• Write clean, maintainable, and efficient code
• Collaborate with cross-functional teams`,

    'full stack': `We are looking for a Full Stack Developer to join ${companyName}. You will work on both front-end and back-end development.

Key Responsibilities:
• Develop front-end website architecture
• Design and develop back-end applications and APIs
• Create servers and databases for functionality
• Ensure cross-platform optimization
• Work with development teams and product managers`
  };

  const key = Object.keys(templates).find(k => jobTitle.toLowerCase().includes(k));
  return key ? templates[key] : `Join ${companyName} as a ${jobTitle} and be part of our dynamic team.

Key Responsibilities:
• Execute core responsibilities related to ${jobTitle.toLowerCase()} role
• Collaborate with team members on various projects
• Contribute to company goals and objectives
• Maintain high standards of work quality
• Stay updated with industry trends`;
}

function generateJobRequirements(jobTitle) {
  const templates = {
    'react': `• 3+ years of experience with React.js
• Strong proficiency in JavaScript
• Experience with React.js workflows (Redux, Flux)
• Familiarity with RESTful APIs
• Knowledge of modern authorization mechanisms
• Experience with front-end development tools
• Bachelor's degree in Computer Science or related field`,

    'python': `• 3+ years of experience in Python development
• Strong knowledge of Python frameworks (Django, Flask)
• Experience with databases (PostgreSQL, MySQL, MongoDB)
• Familiarity with RESTful API development
• Knowledge of version control systems (Git)
• Experience with cloud platforms (AWS, Azure)
• Bachelor's degree in Computer Science or related field`,

    'full stack': `• 4+ years of experience in full-stack development
• Proficiency in front-end technologies (HTML, CSS, JavaScript)
• Strong backend development skills (Node.js, Python, Java)
• Experience with databases (SQL and NoSQL)
• Knowledge of cloud services and deployment
• Familiarity with version control and CI/CD
• Bachelor's degree in Computer Science or related field`
  };

  const key = Object.keys(templates).find(k => jobTitle.toLowerCase().includes(k));
  return key ? templates[key] : `• 2+ years of relevant experience
• Strong technical skills related to the position
• Excellent communication and teamwork abilities
• Problem-solving and analytical thinking skills
• Bachelor's degree in relevant field or equivalent experience
• Proficiency in relevant tools and technologies`;
}

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
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Backend server is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    redis: getRedisStatus()
  });
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

app.get('/api/analytics/profile/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const { userType } = req.query;

    console.log('📊 Analytics request for:', email, 'userType:', userType);

    if (userType === 'employer') {
      const Job = (await import('./models/Job.js')).default;
      const Application = (await import('./models/Application.js')).default;

      const jobsPosted = await Job.count({
        where: {
          [Op.or]: [
            { employerEmail: { [Op.iLike]: `%${email}%` } },
            { postedBy: { [Op.iLike]: `%${email}%` } }
          ],
          isActive: { [Op.ne]: false }
        }
      });

      const applicationsReceived = await Application.count({
        where: {
          employerEmail: { [Op.iLike]: `%${email}%` }
        }
      });

      console.log('📈 Employer analytics result:', { jobsPosted, applicationsReceived, email });

      res.json({
        jobsPosted,
        applicationsReceived
      });
    } else {
      const Application = (await import('./models/Application.js')).default;
      const Analytics = (await import('./models/Analytics.js')).default;

      const applicationsSent = await Application.count({
        where: {
          candidateEmail: { [Op.iLike]: `%${email}%` }
        }
      });

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

      console.log('📈 Candidate analytics result:', { applicationsSent, searchAppearances, recruiterActions, email });

      res.json({
        searchAppearances: searchAppearances || 0,
        recruiterActions: recruiterActions || 0
      });
    }
  } catch (error) {
    console.error('❌ Analytics error:', error);
    res.status(500).json({ error: error.message });
  }
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

// Serve static frontend files (if you have a build folder)
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'build')));
}

// Serve frontend app for non-API routes (SPA support)
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ error: 'API endpoint not found', path: req.path });
  } else if (process.env.NODE_ENV === 'production') {
    // Serve index.html for all non-API routes in production
    res.sendFile(path.join(__dirname, 'build', 'index.html'));
  } else {
    // For development, redirect to frontend URL
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(frontendUrl + req.path);
  }
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
