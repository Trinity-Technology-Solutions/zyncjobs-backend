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

    // Find existing profile and update, or create new one
    let profile = await Profile.findOne({ where: { email } });
    if (profile) {
      await profile.update(updateFields);
      console.log('✅ Profile updated:', { id: profile.id, email });
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
        skills: profileData.skills,
        profilePicture: profileData.profilePhoto,
        profilePhoto: profileData.profilePhoto
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
    
    let profile = await Profile.findOne({
      where: isUUID ? { userId: identifier } : { email: identifier },
      order: [['updatedAt', 'DESC']]
    });
    
    if (profile) {
      console.log('Profile found:', profile.id);
      // Also fetch resumeUrl from User table
      let resumeUrl = null;
      try {
        const user = await User.findOne({ where: isUUID ? { id: identifier } : { email: identifier } });
        resumeUrl = user?.resumeUrl || null;
      } catch (_) {}
      res.json({ ...profile.toJSON(), resumeUrl });
    } else {
      console.log('Profile not found for identifier:', identifier);
      // Create a basic profile entry if it doesn't exist
      if (identifier.includes('@')) {
        profile = await Profile.create({
          email: identifier
        });
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
