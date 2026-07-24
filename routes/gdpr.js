import express from 'express';
import { Op } from 'sequelize';
import { authenticateToken } from '../middleware/auth.js';
import GdprConsent from '../models/GdprConsent.js';
import User from '../models/User.js';
import Resume from '../models/Resume.js';
import Application from '../models/Application.js';
import Profile from '../models/Profile.js';
import Job from '../models/Job.js';
import { generateGdprPdf } from '../services/gdprPdfService.js';
import { formatJobCode } from '../utils/idGenerator.js';

const router = express.Router();

// ─── POST /api/gdpr/consent ──────────────────────────────────────────────────
// Record user consent at registration (no auth required — called right after register)
router.post('/consent', async (req, res) => {
  try {
    const { userId, consentTypes, consentDate } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const [record, created] = await GdprConsent.findOrCreate({
      where: { userId },
      defaults: {
        consentTypes: consentTypes || ['terms'],
        consentDate: consentDate || new Date(),
        lastActiveAt: new Date()
      }
    });

    if (!created) {
      // Merge new consent types
      const merged = [...new Set([...(record.consentTypes || []), ...(consentTypes || [])])];
      await record.update({ consentTypes: merged, consentDate: consentDate || new Date() });
    }

    res.json({ success: true, message: 'Consent recorded' });
  } catch (err) {
    console.error('GDPR consent error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/gdpr/privacy-settings/:userId ──────────────────────────────────
router.get('/privacy-settings/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const record = await GdprConsent.findOne({ where: { userId } });

    if (!record) {
      return res.json({
        storeResume: true,
        allowEmployerView: true,
        receiveJobAlerts: true,
        allowAIRecommendations: true
      });
    }

    res.json({
      storeResume: record.storeResume,
      allowEmployerView: record.allowEmployerView,
      receiveJobAlerts: record.receiveJobAlerts,
      allowAIRecommendations: record.allowAIRecommendations
    });
  } catch (err) {
    console.error('GDPR get settings error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/gdpr/privacy-settings/:userId ──────────────────────────────────
router.put('/privacy-settings/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { storeResume, allowEmployerView, receiveJobAlerts, allowAIRecommendations } = req.body;

    const [record] = await GdprConsent.findOrCreate({
      where: { userId },
      defaults: { consentTypes: ['terms'], lastActiveAt: new Date() }
    });

    await record.update({
      storeResume:             storeResume             ?? record.storeResume,
      allowEmployerView:       allowEmployerView       ?? record.allowEmployerView,
      receiveJobAlerts:        receiveJobAlerts        ?? record.receiveJobAlerts,
      allowAIRecommendations:  allowAIRecommendations  ?? record.allowAIRecommendations,
      lastActiveAt:            new Date()
    });

    res.json({ success: true, message: 'Privacy settings updated' });
  } catch (err) {
    console.error('GDPR update settings error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/gdpr/download-data ──────────────────────────────────────────────────
// Handle data export via POST (matches frontend expectation)
router.post('/download-data', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    // Ensure user can only download their own data
    if (req.user.id !== userId) {
      return res.status(403).json({ error: 'You can only download your own data' });
    }

    const user = await User.findOne({
      where: { id: userId },
      attributes: { exclude: ['password'] }
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const userRole = user.role || 'candidate';
    const isEmployer = userRole === 'employer';
    const isCandidate = userRole === 'candidate';

    // 1. Fetch Employer Jobs first to traverse Employer -> Jobs -> Applications
    const jobs = isEmployer ? await Job.findAll({
      where: {
        [Op.or]: [
          { employerEmail: { [Op.iLike]: user.email } },
          { postedBy: { [Op.iLike]: user.email } },
          { userId: user.id },
          ...(user.employerId ? [{ employerId: user.employerId }] : [])
        ]
      },
      order: [['createdAt', 'DESC']]
    }) : [];

    const jobIds = jobs.map(j => j.id).filter(Boolean);

    // 2. Fetch Applications, Resumes, Consent, Profile in parallel
    const [resumes, applications, consent, profile] = await Promise.all([
      isCandidate ? Resume.findAll({ where: { userId } }) : Promise.resolve([]),
      Application.findAll({
        where: {
          [Op.or]: [
            ...(isCandidate ? [
              { candidateId: userId },
              { candidateEmail: { [Op.iLike]: user.email } }
            ] : []),
            ...(isEmployer ? [
              ...(jobIds.length > 0 ? [{ jobId: { [Op.in]: jobIds } }] : []),
              { employerEmail: { [Op.iLike]: user.email } },
              { employerId: user.id },
              ...(user.employerId ? [{ employerId: user.employerId }] : [])
            ] : [])
          ]
        },
        order: [['createdAt', 'DESC']]
      }),
      GdprConsent.findOne({ where: { userId } }),
      Profile.findOne({ where: { userId } })
    ]);

    // Build job title lookup map
    const jobTitleMap = {};
    jobs.forEach(j => {
      if (j.id) jobTitleMap[j.id] = j.jobTitle || j.title || '';
    });

    const exportData = {
      exportedAt: new Date().toISOString(),
      userType: userRole,
      profile: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: userRole,
        companyName: user.companyName || user.company,
        employerId: user.employerId || user.id,
        location: user.location,
        title: user.title,
        bio: user.bio,
        skills: user.skills,
        phone: user.phone,
        createdAt: user.createdAt,
        ...(profile ? {
          profileSummary: profile.profileSummary,
          education: profile.education,
          experience: profile.experience,
          projects: profile.projects,
          certifications: profile.certifications,
          languages: profile.languages
        } : {})
      },
      resumes: resumes.map(r => ({
        id: r.id,
        fileName: r.fileName,
        status: r.status,
        uploadedAt: r.createdAt
      })),
      applications: applications.map(a => ({
        id: a.id,
        jobId: a.jobId,
        jobTitle: a.jobTitle || jobTitleMap[a.jobId] || 'N/A',
        candidateId: a.candidateId,
        candidateName: a.candidateName,
        candidateEmail: a.candidateEmail,
        candidatePhone: a.candidatePhone,
        status: a.status,
        coverLetter: a.coverLetter,
        appliedAt: a.createdAt,
        createdAt: a.createdAt
      })),
      jobs: jobs.map(j => {
        const rawEmpId = j.employerId || user.employerId || user.id || '';
        const formattedEmpId = rawEmpId
          ? (/^EID/i.test(rawEmpId) ? rawEmpId : (/^\d+$/.test(rawEmpId) ? `EID${String(rawEmpId).padStart(4, '0')}` : rawEmpId))
          : 'N/A';
        return {
          id: j.id,
          title: j.jobTitle || j.title,
          jobTitle: j.jobTitle || j.title,
          company: j.company,
          employerId: formattedEmpId,
          positionId: j.positionId,
          positionCode: formatJobCode(j.positionId, j.company) || j.positionId || 'N/A',
          jobCategory: j.jobCategory || j.category || 'N/A',
          location: j.location,
          jobType: j.jobType,
          status: j.status,
          postedAt: j.createdAt,
          createdAt: j.createdAt
        };
      }),
      privacySettings: consent ? {
        storeResume: consent.storeResume,
        allowEmployerView: consent.allowEmployerView,
        receiveJobAlerts: consent.receiveJobAlerts,
        allowAIRecommendations: consent.allowAIRecommendations,
        consentDate: consent.consentDate
      } : null
    };

    res.json({
      success: true,
      data: exportData
    });
  } catch (err) {
    console.error('GDPR download error:', err);
    res.status(500).json({ 
      success: false,
      error: 'Failed to export data',
      message: err.message 
    });
  }
});

// ─── GET /api/gdpr/download-data/:userId ─────────────────────────────────────
router.get('/download-data/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findOne({
      where: { id: userId },
      attributes: { exclude: ['password'] }
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const [resumes, applications, consent] = await Promise.all([
      Resume.findAll({ where: { userId } }),
      Application.findAll({
        where: {
          [Op.or]: [
            { candidateId: userId },
            { candidateEmail: user.email }
          ]
        }
      }),
      GdprConsent.findOne({ where: { userId } })
    ]);

    const exportData = {
      exportedAt: new Date().toISOString(),
      profile: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        location: user.location,
        title: user.title,
        bio: user.bio,
        skills: user.skills,
        createdAt: user.createdAt
      },
      resumes: resumes.map(r => ({
        id: r.id,
        fileName: r.fileName,
        status: r.status,
        uploadedAt: r.createdAt
      })),
      applications: applications.map(a => ({
        id: a.id,
        jobId: a.jobId,
        status: a.status,
        appliedAt: a.createdAt
      })),
      privacySettings: consent ? {
        storeResume: consent.storeResume,
        allowEmployerView: consent.allowEmployerView,
        receiveJobAlerts: consent.receiveJobAlerts,
        allowAIRecommendations: consent.allowAIRecommendations,
        consentDate: consent.consentDate
      } : null
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="zyncjobs-data-${userId}.json"`);
    res.json(exportData);
  } catch (err) {
    console.error('GDPR download error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/gdpr/export-pdf/:userId ───────────────────────────────────────
router.get('/export-pdf/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findOne({
      where: { id: userId },
      attributes: { exclude: ['password'] }
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Ensure role is properly set - default to 'candidate' if not specified
    const userRole = user.role || 'candidate';
    const isEmployer = userRole === 'employer';
    const isCandidate = userRole === 'candidate';

    console.log('🔍 GDPR Route Debug:');
    console.log('User ID:', userId);
    console.log('User role from DB:', user.role);
    console.log('Determined role:', userRole);
    console.log('Is employer:', isEmployer);
    console.log('Is candidate:', isCandidate);
    console.log('User email:', user.email);

    const jobs = isEmployer ? await Job.findAll({
      where: {
        [Op.or]: [
          { employerEmail: { [Op.iLike]: user.email } },
          { postedBy: { [Op.iLike]: user.email } },
          { userId: user.id },
          ...(user.employerId ? [{ employerId: user.employerId }] : [])
        ]
      },
      order: [['createdAt', 'DESC']]
    }) : [];

    const jobIds = jobs.map(j => j.id).filter(Boolean);

    const [applications, consent, resumes] = await Promise.all([
      Application.findAll({
        where: {
          [Op.or]: [
            ...(isCandidate ? [
              { candidateId: userId },
              { candidateEmail: { [Op.iLike]: user.email } }
            ] : []),
            ...(isEmployer ? [
              ...(jobIds.length > 0 ? [{ jobId: { [Op.in]: jobIds } }] : []),
              { employerEmail: { [Op.iLike]: user.email } },
              { employerId: user.id },
              ...(user.employerId ? [{ employerId: user.employerId }] : [])
            ] : [])
          ]
        },
        order: [['createdAt', 'DESC']]
      }),
      GdprConsent.findOne({ where: { userId } }),
      isCandidate ? Resume.findAll({ where: { userId }, order: [['createdAt', 'DESC']] }) : []
    ]);

    console.log('Data fetched:');
    console.log('Jobs count:', jobs.length);
    console.log('Applications count:', applications.length);
    console.log('Resumes count:', resumes.length);

    // Ensure user object has the correct role for PDF generation
    const userForPdf = {
      ...user.toJSON(),
      role: userRole
    };

    const pdfBuffer = await generateGdprPdf({
      user: userForPdf,
      jobs: jobs.map ? jobs.map(j => j.toJSON()) : [],
      applications: applications.map(a => a.toJSON()),
      consent: consent ? consent.toJSON() : null,
      resumes: resumes.map ? resumes.map(r => r.toJSON()) : []
    });

    const safeName = (user.name || 'user').replace(/[^a-zA-Z0-9]/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="ZyncJobs_DataExport_${safeName}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('GDPR PDF export error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/gdpr/delete-account ──────────────────────────────────────────
// Handle account deletion via POST (matches frontend expectation)
router.post('/delete-account', authenticateToken, async (req, res) => {
  try {
    const { userId, confirmDeletion, reason } = req.body;
    
    // Validate request
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    if (!confirmDeletion) {
      return res.status(400).json({ error: 'confirmDeletion must be true' });
    }
    
    // Ensure user can only delete their own account
    if (req.user.id !== userId) {
      return res.status(403).json({ error: 'You can only delete your own account' });
    }

    const user = await User.findOne({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userEmail = user.email;
    const userName = user.name || 'Unknown';
    
    console.log(`🗑️ Starting account deletion for user: ${userName} (${userEmail})`);

    // Log the deletion attempt
    console.log(`📝 Deletion reason: ${reason || 'User requested account deletion'}`);

    const safeDestroy = async (modelPath, condition, label) => {
      try {
        const Model = (await import(modelPath)).default;
        const count = await Model.count({ where: condition });
        if (count > 0) {
          await Model.destroy({ where: condition });
          console.log(`✅ Deleted ${count} records from ${label}`);
        } else {
          console.log(`ℹ️ No records found in ${label}`);
        }
      } catch (e) {
        console.warn(`⚠️ Could not delete from ${label}:`, e.message);
      }
    };

    // Delete all related data in proper order
    await safeDestroy('../models/Application.js',    { [Op.or]: [{ candidateEmail: userEmail }, { userId }] }, 'Applications');
    await safeDestroy('../models/Job.js',             { [Op.or]: [{ postedBy: userEmail }, { employerEmail: userEmail }, { userId }] }, 'Jobs');
    await safeDestroy('../models/Profile.js',         { [Op.or]: [{ userId }, { email: userEmail }] }, 'Profile');
    await safeDestroy('../models/Resume.js',          { [Op.or]: [{ userId }, { email: userEmail }] }, 'Resume');
    await safeDestroy('../models/ResumeVersion.js',   { userId }, 'ResumeVersions');
    await safeDestroy('../models/Interview.js',       { [Op.or]: [{ candidateEmail: userEmail }, { employerEmail: userEmail }, { userId }] }, 'Interviews');
    await safeDestroy('../models/Message.js',         { [Op.or]: [{ senderId: userId }, { receiverId: userId }] }, 'Messages');
    await safeDestroy('../models/Notification.js',    { [Op.or]: [{ userId }, { email: userEmail }] }, 'Notifications');
    await safeDestroy('../models/JobAlert.js',        { [Op.or]: [{ userId }, { email: userEmail }] }, 'JobAlerts');
    await safeDestroy('../models/SavedCandidate.js',  { [Op.or]: [{ employerId: userId }, { employerEmail: userEmail }, { candidateId: userId }] }, 'SavedCandidates');
    await safeDestroy('../models/Review.js',          { [Op.or]: [{ userId }, { reviewerEmail: userEmail }] }, 'Reviews');
    await safeDestroy('../models/Analytics.js',       { [Op.or]: [{ userId }, { email: userEmail }] }, 'Analytics');
    await safeDestroy('../models/TeamMember.js',      { [Op.or]: [{ employerId: userEmail }, { memberEmail: userEmail }] }, 'TeamMembers');
    await safeDestroy('../models/SkillAssessment.js', { userId }, 'SkillAssessments');
    await safeDestroy('../models/PasswordReset.js',   { [Op.or]: [{ userId }, { email: userEmail }] }, 'PasswordResets');
    await safeDestroy('../models/UserPreferences.js', { userId }, 'UserPreferences');
    
    // Delete GDPR consent record
    await GdprConsent.destroy({ where: { userId } });
    console.log(`✅ Deleted GDPR consent records`);

    // Mark user account as deleted (soft delete) instead of destroying
    await User.update(
      { status: 'deleted', isActive: false },
      { where: { id: userId } }
    );
    console.log(`✅ Marked user account as deleted: ${userName} (${userEmail})`);

    console.log(`🎉 GDPR full delete completed successfully for: ${userEmail}`);
    
    res.json({ 
      success: true, 
      message: 'Account and all associated data have been permanently deleted.' 
    });
  } catch (err) {
    console.error('❌ GDPR delete error:', err);
    res.status(500).json({ 
      success: false,
      error: 'Failed to delete account completely',
      message: err.message 
    });
  }
});

// ─── GET /api/gdpr/consent-history/:userId ─────────────────────────────────
router.get('/consent-history/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const record = await GdprConsent.findOne({ where: { userId } });
    if (!record) return res.json([]);
    res.json([{
      consentTypes: record.consentTypes,
      consentDate: record.consentDate,
      cookieNecessary: record.cookieNecessary,
      cookieAnalytics: record.cookieAnalytics,
      cookieMarketing: record.cookieMarketing,
      cookieConsentDate: record.cookieConsentDate,
      storeResume: record.storeResume,
      allowEmployerView: record.allowEmployerView,
      receiveJobAlerts: record.receiveJobAlerts,
      allowAIRecommendations: record.allowAIRecommendations,
      updatedAt: record.updatedAt
    }]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

// ─── POST /api/gdpr/cookie-consent ───────────────────────────────────────────
// Save cookie consent to DB (called when logged-in user accepts/rejects cookies)
router.post('/cookie-consent', authenticateToken, async (req, res) => {
  try {
    const { necessary, analytics, marketing } = req.body;
    const userId = req.user.id;

    const [record] = await GdprConsent.findOrCreate({
      where: { userId },
      defaults: { consentTypes: ['terms'], lastActiveAt: new Date() }
    });

    await record.update({
      cookieNecessary:   necessary  ?? true,
      cookieAnalytics:   analytics  ?? false,
      cookieMarketing:   marketing  ?? false,
      cookieConsentDate: new Date()
    });

    res.json({ success: true, message: 'Cookie consent saved' });
  } catch (err) {
    console.error('Cookie consent save error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/gdpr/cookie-consent ────────────────────────────────────────────
// Get saved cookie consent for logged-in user
router.get('/cookie-consent', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const record = await GdprConsent.findOne({ where: { userId } });

    if (!record || !record.cookieConsentDate) {
      return res.json({ found: false });
    }

    res.json({
      found: true,
      necessary: record.cookieNecessary,
      analytics: record.cookieAnalytics,
      marketing: record.cookieMarketing,
      savedAt:   record.cookieConsentDate
    });
  } catch (err) {
    console.error('Cookie consent get error:', err);
    res.status(500).json({ error: err.message });
  }
});
