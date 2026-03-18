import express from 'express';
import User from '../models/User.js';
import Profile from '../models/Profile.js';

const router = express.Router();

// Save/Update profile
router.post('/save', async (req, res) => {
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
      'name','phone','location','title','yearsExperience','skills','experience',
      'education','certifications','workAuthorization','securityClearance','resume',
      'profilePhoto','profileFrame','profileSummary','employment','projects',
      'internships','languages','awards','clubsCommittees','competitiveExams',
      'academicAchievements','companyName','roleTitle','salary','jobType',
      'gender','birthday','college','degree'
    ];
    fieldMap.forEach(f => { if (profileData[f] !== undefined) updateFields[f] = profileData[f]; });
    if (isValidUUID) updateFields.userId = userId;

    // Coerce types to match DB schema
    if (updateFields.birthday !== undefined) {
      const d = new Date(updateFields.birthday);
      updateFields.birthday = isNaN(d.getTime()) ? null : d;
    }
    // skills must be an array
    if (updateFields.skills !== undefined && !Array.isArray(updateFields.skills)) {
      try { updateFields.skills = JSON.parse(updateFields.skills); } catch { updateFields.skills = []; }
    }
    // TEXT fields must be strings (not objects/arrays)
    const textFields = ['experience','education','certifications','employment','projects','internships','languages','awards','clubsCommittees','competitiveExams','academicAchievements'];
    textFields.forEach(f => {
      if (updateFields[f] !== undefined && typeof updateFields[f] !== 'string') {
        updateFields[f] = JSON.stringify(updateFields[f]);
      }
    });

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
      await profile.update(updateFields);
      console.log('✅ Profile updated:', { id: profile.id, email: profile.email });
    } else {
      profile = await Profile.create({ email, ...updateFields });
      console.log('✅ Profile created:', { id: profile.id, email });
    }
    
    // Also update User collection with key fields (only if valid UUID)
    if (isValidUUID) {
      const userUpdateData = {
        name: profileData.name,
        phone: profileData.phone,
        location: profileData.location,
        title: profileData.title,
        skills: Array.isArray(profileData.skills) ? profileData.skills : (updateFields.skills || []),
        profilePicture: profileData.profilePhoto
      };
      if (profileData.resumeUrl) userUpdateData.resumeUrl = profileData.resumeUrl;
      // Sync companyName back to User table so job post form pre-fills correctly
      if (profileData.companyName) {
        userUpdateData.company = profileData.companyName;
        userUpdateData.companyName = profileData.companyName;
      }
      await User.update(userUpdateData, { where: { id: userId } });
      console.log('✅ User table also updated');
    }
    
    res.json({ success: true, profile });
  } catch (error) {
    console.error('❌ Profile save error:', error);
    res.status(500).json({ error: error.message });
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
      res.json({ ...profile.toJSON(), resumeUrl });
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
