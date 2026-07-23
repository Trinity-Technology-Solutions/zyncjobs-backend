import express from 'express';
import User from '../models/User.js';
import Profile from '../models/Profile.js';
import vectorService from '../services/vectorService.js';
import { validateProfile } from '../middleware/profileValidator.js';

const router = express.Router();

// Save/Update profile
router.post('/save', validateProfile, async (req, res) => {
  try {
    const { userId, email, ...profileData } = req.body;
    console.log('📝 Profile save request:', { 
      userId, 
      email, 
      dataKeys: Object.keys(profileData)
    });
    console.log('📋 Full profile data:', JSON.stringify(profileData, null, 2));
    
    if (!userId && !email) {
      console.log('❌ Missing userId and email');
      return res.status(400).json({ error: 'userId or email required' });
    }
    
    // Check if userId is valid UUID
    const isValidUUID = userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
    console.log('🔍 UUID validation:', { userId, isValidUUID });
    
    // Build update fields — only include keys that were actually sent
    const updateFields = {};
    const fieldMap = [
      'name','phone','location','title','jobTitle','yearsExperience','skills','experience',
      'education','certifications','workAuthorization','securityClearance','resume','resumeUrl',
      'profilePhoto','profileFrame','coverPhoto','profileSummary','employment','projects',
      'internships','languages','awards','clubsCommittees','competitiveExams',
      'academicAchievements','companyName','roleTitle','salary','jobType',
      'gender','birthday','college','degree',
      'careerPreferences','educationCollege','educationClass12','educationClass10',
      'openToWork','visibilityStatus','profileVisibility'
    ];
    fieldMap.forEach(f => { if (profileData[f] !== undefined) updateFields[f] = profileData[f]; });
    if (isValidUUID) updateFields.userId = userId;
    console.log('🖼️ coverPhoto in updateFields:', updateFields.coverPhoto);

    // Coerce types to match DB schema
    if (updateFields.birthday !== undefined) {
      const d = new Date(updateFields.birthday);
      updateFields.birthday = isNaN(d.getTime()) ? null : d;
    }
    // skills must be an array
    if (updateFields.skills !== undefined && !Array.isArray(updateFields.skills)) {
      try { updateFields.skills = JSON.parse(updateFields.skills); } catch { updateFields.skills = []; }
    }
    // resume must be valid JSONB (object/null), not a string
    if (updateFields.resume !== undefined) {
      if (typeof updateFields.resume === 'string') {
        try { updateFields.resume = JSON.parse(updateFields.resume); } catch { updateFields.resume = null; }
      }
      if (typeof updateFields.resume !== 'object') updateFields.resume = null;
    }
    // TEXT fields must be strings — stringify if they're objects/arrays
    const textOnlyFields = ['experience', 'education', 'certifications'];
    textOnlyFields.forEach(f => {
      if (updateFields[f] !== undefined && updateFields[f] !== null) {
        if (typeof updateFields[f] !== 'string') {
          updateFields[f] = JSON.stringify(updateFields[f]);
        }
      }
    });
    // Profile model stores these as TEXT (not JSONB) — validator pre-serializes arrays;
    // only stringify here if they somehow arrive as raw objects (non-validated path).
    const textJsonFields = ['employment','projects','internships','languages','awards','clubsCommittees','competitiveExams','academicAchievements','careerPreferences','educationCollege','educationClass12','educationClass10','certifications'];
    textJsonFields.forEach(f => {
      if (updateFields[f] !== undefined && updateFields[f] !== null && typeof updateFields[f] === 'object') {
        updateFields[f] = JSON.stringify(updateFields[f]);
      }
    });

    // Also fix userId — if it's not a valid UUID, don't use it as userId
    if (updateFields.userId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(updateFields.userId)) {
      delete updateFields.userId;
    }

    // Find existing profile and update, or create new one
    let profile = null;
    if (email) {
      profile = await Profile.findOne({ where: { email } });
    } else if (isValidUUID) {
      profile = await Profile.findOne({ where: { userId } });
    }

    if (!email && !profile) {
      return res.status(400).json({ error: 'email or valid userId required' });
    }

    if (profile) {
      // Link userId to profile if it was previously null
      if (!profile.userId && isValidUUID) {
        updateFields.userId = userId;
      }
      await profile.update(updateFields);
      console.log('✅ Profile updated:', { id: profile.id, email: profile.email });
    } else {
      profile = await Profile.create({ email, ...updateFields });
      console.log('✅ Profile created:', { id: profile.id, email });
    }
    
    // Also update User collection with key fields
    try {
      const userUpdateData = {};
      if (profileData.name) userUpdateData.name = profileData.name;
      if (profileData.phone) userUpdateData.phone = profileData.phone;
      if (profileData.location) userUpdateData.location = profileData.location;
      if (profileData.title) userUpdateData.title = profileData.title;
      if (profileData.jobTitle) userUpdateData.title = profileData.jobTitle;
      if (profileData.skills) userUpdateData.skills = Array.isArray(profileData.skills) ? profileData.skills : (updateFields.skills || []);
      if (profileData.profilePhoto) userUpdateData.profilePicture = profileData.profilePhoto;
      if (profileData.resumeUrl !== undefined) userUpdateData.resumeUrl = profileData.resumeUrl || null;
      if (profileData.resume !== undefined && profileData.resume === null) userUpdateData.resumeUrl = null;
      if (profileData.companyName) {
        userUpdateData.company = profileData.companyName;
        userUpdateData.companyName = profileData.companyName;
      }
      if (Object.keys(userUpdateData).length > 0) {
        if (isValidUUID) {
          await User.update(userUpdateData, { where: { id: userId } });
        } else if (email) {
          await User.update(userUpdateData, { where: { email } });
        }
        console.log('✅ User table also updated');
      }
    } catch (userUpdateErr) {
      console.warn('⚠️ User table update skipped:', userUpdateErr.message);
    }
    
    res.json({ success: true, profile });

    // Index profile for semantic matching (non-blocking, after response)
    const indexId = isValidUUID ? userId : (profile.userId || profile.id);
    if (indexId) vectorService.upsertResumeEmbedding(String(indexId), profile.toJSON()).catch(() => {});

  } catch (error) {
    console.error('❌ Profile save error:', error.message);
    console.error('❌ Error details:', error.errors?.map(e => e.message) || error.original?.message || error.stack?.split('\n')[0]);
    res.status(500).json({ error: error.message, details: error.errors?.map(e => e.message) || error.original?.message });
  }
});

// Get profile
router.get('/:identifier', async (req, res) => {
  try {
    const identifier = req.params.identifier;
    console.log('Profile get request for identifier:', identifier);
    
    const { Op } = await import('sequelize');
    
    // Check if identifier is UUID or email
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
    
    let profile = null;
    let resumeUrl = null;

    if (isUUID) {
      // Try by userId first, then by User.id lookup
      profile = await Profile.findOne({ where: { userId: identifier }, order: [['updatedAt', 'DESC']] });
      
      if (!profile) {
        // Maybe profile was saved by email — find user's email first
        const user = await User.findOne({ where: { id: identifier } });
        if (user?.email) {
          profile = await Profile.findOne({ where: { email: user.email }, order: [['updatedAt', 'DESC']] });
        }
        resumeUrl = user?.resumeUrl || null;
      } else {
        const user = await User.findOne({ where: { id: identifier } });
        resumeUrl = user?.resumeUrl || null;
      }
    } else {
      // Email-based lookup
      profile = await Profile.findOne({ where: { email: identifier }, order: [['updatedAt', 'DESC']] });
      const user = await User.findOne({ where: { email: identifier } }).catch(() => null);
      resumeUrl = user?.resumeUrl || null;
    }
    
    if (profile) {
      console.log('Profile found:', profile.id);
      const data = profile.toJSON();
      // Parse JSON-stringified fields back to objects
      const jsonFields = ['employment','projects','internships','languages','awards','clubsCommittees','competitiveExams','academicAchievements','certifications','careerPreferences','educationCollege','educationClass12','educationClass10'];
      jsonFields.forEach(f => {
        if (data[f] && typeof data[f] === 'string') {
          try { data[f] = JSON.parse(data[f]); } catch { /* leave as-is */ }
        }
      });
      res.json({ ...data, resumeUrl });
    } else {
      console.log('Profile not found for identifier:', identifier);
      // Create a basic profile entry if it doesn't exist (email only)
      if (!isUUID && identifier.includes('@')) {
        profile = await Profile.create({ email: identifier });
        console.log('Created new profile for:', identifier);
        res.json(profile);
      } else {
        res.status(404).json({ error: 'Profile not found' });
      }
    }
  } catch (error) {
    console.error('Profile get error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
