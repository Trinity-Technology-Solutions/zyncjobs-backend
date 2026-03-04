import { Op } from 'sequelize';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import dotenv from 'dotenv';
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
import analyticsTrackingRoutes from './routes/analyticsTracking.js';
import analyticsDebugRoutes from './routes/analyticsDebug.js';
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
import adminAuditRoutes from './routes/adminAudit.js';
import aiScoringRoutes from './routes/aiScoring.js';
import aiScoringFlowRoutes from './routes/aiScoringFlow.js';
import employerCandidatesRoutes from './routes/employerCandidates.js';
import adminSystemRoutes from './routes/adminSystem.js';
import adminNotificationRoutes from './routes/adminNotifications.js';
import notificationRoutes from './routes/notifications.js';
import messageRoutes from './routes/messages.js';
import profileRoutes from './routes/profile.js';
import autocompleteRoutes from './routes/autocomplete.js';
import companyAutocompleteRoutes from './routes/companyAutocomplete.js';
import linkedinParserRoutes from './routes/linkedinParser.js';
import dashboardRoutes from './routes/dashboard.js';
import reminderRoutes from './routes/reminders.js';
import headlineAnalyticsRoutes from './routes/headlineAnalytics.js';
import skillAssessmentRoutes from './routes/skillAssessments.js';
import interviewRoutes from './routes/interviews.js';
import meetingRoutes from './routes/meetings.js';
import advancedSearchRoutes from './routes/advancedSearch.js';
import searchAnalyticsRoutes from './routes/searchAnalytics.js';
import collegesRoutes from './routes/colleges.js';
import skillsRoutes from './routes/skills.js';
import jobTitlesRoutes from './routes/jobTitles.js';
import resumeViewerRoutes from './routes/resumeViewer.js';
// import reminderScheduler from './services/reminderScheduler.js';
import Notification from './models/Notification.js';
import Message from './models/Message.js';
import { loadInitialData } from './scripts/loadInitialData.js';

import { generateAccessToken, generateRefreshToken } from './utils/jwt.js';
import { errorHandler, notFound } from './utils/errorHandler.js';
import { validateEnv } from './utils/envValidator.js';


dotenv.config();
validateEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Trust proxy for deployment
app.set('trust proxy', 1);
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: [
      'http://localhost:5173',
      'https://trinity-jobs.vercel.app',
      'https://trinity-jobs-ezblun328-mutheeswarans-projects.vercel.app',
      'https://stagging.zyncjobs.com',
      'https://zyncjobs.com',
      'https://www.zyncjobs.com',
      process.env.FRONTEND_URL
    ].filter(Boolean),
    credentials: true
  }
});
const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  console.log('✅ Database connected');
  // Comment out loadInitialData for faster startup
  // loadInitialData();
}).catch(err => {
  console.error('❌ Database connection failed:', err);
  process.exit(1);
});

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

app.use(helmet());

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Rate limiting - more lenient for development
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 100 : 10000, // Much higher limit for dev
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    return process.env.NODE_ENV === 'development';
  }
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 5 : 50,
  message: 'Too many login attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    return process.env.NODE_ENV === 'development' && (req.ip === '127.0.0.1' || req.ip === '::1');
  }
});

app.use('/api/users/login', loginLimiter);
app.use(limiter);
app.use(cors({
  origin: [
    "https://trinity-jobs.vercel.app",
    "https://stagging.zyncjobs.com",
    "https://api-staging.zyncjobs.com",
    "http://localhost:5173",
    "https://zyncjobs.com",
    "https://www.zyncjobs.com",
    process.env.FRONTEND_URL
  ].filter(Boolean),
  credentials: true
}));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
// Debug middleware - only in development
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });
}
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files with proper headers
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  setHeaders: (res, path) => {
    // Set proper content type for PDFs
    if (path.endsWith('.pdf')) {
      res.setHeader('Content-Type', 'application/pdf');
    }
    // Allow cross-origin access
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
}));

app.use('/api/jobs', jobRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/token', tokenRoutes);
app.use('/api/users', userRoutes);
app.use('/api/users/:id', usersGetRoutes);
// Move applications route before catch-all
app.use('/api/applications', applicationRoutes);
app.use('/api/job-alerts', jobAlertRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/moderation', moderationRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/analytics', analyticsTrackingRoutes);
app.use('/api/analytics', analyticsDebugRoutes);
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
app.use('/api/admin/audit', adminAuditRoutes);
app.use('/api/ai', aiScoringRoutes);
app.use('/api/ai-flow', aiScoringFlowRoutes);
app.use('/api/employer', employerCandidatesRoutes);
app.use('/api/candidates', employerCandidatesRoutes);
app.use('/api/admin/system', adminSystemRoutes);
app.use('/api/admin/notifications', adminNotificationRoutes);
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
app.use('/api/skill-assessments', skillAssessmentRoutes);
app.use('/api/interviews', interviewRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/resume-viewer', resumeViewerRoutes);

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
      summary: profileData.summary || '',
      skills: profileData.skills || [],
      experience: profileData.workExperience ? [{
        title: profileData.title || '',
        company: 'Previous Company',
        duration: profileData.experience ? `${profileData.experience} years` : '',
        description: profileData.workExperience,
        current: false
      }] : [],
      education: profileData.education ? [{
        degree: profileData.education,
        institution: 'University/College',
        duration: ''
      }] : [],
      projects: [],
      certifications: profileData.certifications || [],
      languages: ['English']
    };
    
    console.log('✅ Resume parsing completed!');
    res.json({ success: true, data: parsedData });
  } catch (error) {
    console.error('❌ Parse error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});


import PasswordReset from './models/PasswordReset.js';

// Password reset functionality - using database storage

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_SERVER,
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_EMAIL,
    pass: process.env.SMTP_PASSWORD
  },
  tls: {
    rejectUnauthorized: false
  }
});

app.post('/api/forgot-password', async (req, res) => {
  console.log('Forgot password request received:', req.body);
  
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }
  
  console.log('Processing reset for email:', email);
  
  try {
    const resetToken = crypto.randomBytes(32).toString('hex');
    
    // Store in database instead of memory
    await PasswordReset.create({
      email,
      token: resetToken
    });
    
    console.log('Token generated and stored in database');
    
    const resetLink = `http://localhost:5173/reset-password/${resetToken}`;
    console.log('Reset link:', resetLink);
    
    // Try to send email but don't fail if it doesn't work
    const mailOptions = {
      from: `"ZyncJobs" <${process.env.SMTP_EMAIL}>`,
      to: email,
      subject: 'ZyncJobs - Password Reset Request',
      text: `
ZyncJobs - Password Reset Request

Hello,

We received a request to reset your password for your ZyncJobs account.

Click this link to reset your password:
${resetLink}

This link will expire in 1 hour for security reasons.

If you didn't request this password reset, please ignore this email.

ZyncJobs Team
      `,
      html: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background-color: #6366f1; padding: 40px 20px; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 32px;">ZyncJobs</h1>
  </div>
  
  <div style="background-color: white; padding: 40px 30px;">
    <h2 style="color: #333; margin: 0 0 20px 0;">Password Reset Request</h2>
    
    <p style="color: #333; margin: 0 0 15px 0;">Hello,</p>
    
    <p style="color: #333; margin: 0 0 15px 0;">We received a request to reset your password for your ZyncJobs account.</p>
    
    <p style="color: #333; margin: 0 0 30px 0;">Click the button below to reset your password:</p>
    
    <div style="margin: 30px 0;">
      <a href="${resetLink}" style="background-color: #6366f1; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block;">Reset Password</a>
    </div>
    
    <p style="color: #333; margin: 30px 0 10px 0;">Or copy and paste this link in your browser:</p>
    
    <p style="color: #6366f1; margin: 0 0 30px 0; word-break: break-all;">${resetLink}</p>
    
    <p style="color: #666; margin: 0;">This link will expire in 1 hour for security reasons.</p>
    
    <p style="color: #666; margin: 15px 0 0 0;">If you didn't request this password reset, please ignore this email.</p>
  </div>
  
  <div style="background-color: #f8f9fa; padding: 20px; text-align: center;">
    <p style="color: #666; margin: 0; font-size: 12px;">ZyncJobs Team</p>
  </div>
</div>
      `
    };
    
    transporter.sendMail(mailOptions)
      .then(() => console.log('Email sent successfully!'))
      .catch(err => console.log('Email failed:', err.message));
    
    // Always return success immediately
    res.status(200).json({ message: 'Email sent' });
  } catch (error) {
    console.error('Error:', error);
    res.status(200).json({ message: 'Email sent' });
  }
});

app.get('/api/verify-reset-token/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const tokenData = await PasswordReset.findOne({ 
      where: {
        token, 
        used: false,
        expiresAt: { [Op.gt]: new Date() }
      }
    });
    
    if (!tokenData) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }
    
    res.json({ valid: true, email: tokenData.email });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and password required' });
    }
    
    const tokenData = await PasswordReset.findOne({ 
      where: {
        token, 
        used: false,
        expiresAt: { [Op.gt]: new Date() }
      }
    });
    
    if (!tokenData) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }
    
    // Mark token as used
    await tokenData.update({ used: true });
    
    console.log('Password reset successful for:', tokenData.email);
    res.json({ success: true, message: 'Password reset successful' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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
        model: 'mistralai/mistral-7b-instruct:free',
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

// Simple health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Backend server is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
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

// Catch-all error handler for unhandled routes
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ error: 'API endpoint not found', path: req.path });
  } else {
    res.status(404).json({ error: 'Route not found' });
  }
});

app.use(errorHandler);

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
  console.log(`🔗 Frontend URL: ${process.env.FRONTEND_URL}`);
  console.log(`💬 Socket.io enabled for real-time features`);
}).on('error', (err) => {
  console.error('❌ Server failed to start:', err);
  process.exit(1);
});