import express from 'express';
import User from '../models/User.js';
import Profile from '../models/Profile.js';

const router = express.Router();

// Save/Update profile
router.post('/save', async (req, res) => {
  try {
    const { userId, email, ...profileData } = req.body;
    console.log('Profile save request:', { 
      userId, 
      email, 
      hasProfilePhoto: !!profileData.profilePhoto,
      hasInternships: !!profileData.internships,
      hasLanguages: !!profileData.languages,
      allFields: Object.keys(profileData)
    });
    
    if (!userId && !email) {
      return res.status(400).json({ error: 'userId or email required' });
    }
    
    // Check if userId is valid UUID
    const isValidUUID = userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
    
    // Save to Profile collection
    const [profile] = await Profile.upsert({
      userId: isValidUUID ? userId : null,
      email, 
      name: profileData.name,
      phone: profileData.phone,
      location: profileData.location,
      title: profileData.title,
      yearsExperience: profileData.yearsExperience,
      skills: profileData.skills,
      experience: profileData.experience,
      education: profileData.education,
      certifications: profileData.certifications,
      workAuthorization: profileData.workAuthorization,
      securityClearance: profileData.securityClearance,
      resume: profileData.resume,
      profilePhoto: profileData.profilePhoto || null,
      profileFrame: profileData.profileFrame || null,
      profileSummary: profileData.profileSummary || null,
      employment: profileData.employment || null,
      projects: profileData.projects || null,
      internships: profileData.internships || null,
      languages: profileData.languages || null,
      awards: profileData.awards || null,
      clubsCommittees: profileData.clubsCommittees || null,
      competitiveExams: profileData.competitiveExams || null,
      academicAchievements: profileData.academicAchievements || null,
      companyName: profileData.companyName || null,
      roleTitle: profileData.roleTitle || null,
      salary: profileData.salary || null,
      jobType: profileData.jobType || null,
      gender: profileData.gender || null,
      birthday: profileData.birthday || null,
      college: profileData.college || null,
      degree: profileData.degree || null
    });
    
    // Also update User collection with key fields (only if valid UUID)
    if (isValidUUID) {
      await User.update({
        name: profileData.name,
        phone: profileData.phone,
        location: profileData.location,
        title: profileData.title,
        skills: profileData.skills,
        profilePicture: profileData.profilePhoto,
        profilePhoto: profileData.profilePhoto
      }, {
        where: { id: userId }
      });
    }
    
    console.log('Profile saved successfully:', profile.id);
    console.log('Saved profile data:', {
      internships: profile.internships,
      languages: profile.languages,
      employment: profile.employment
    });
    res.json({ success: true, profile });
  } catch (error) {
    console.error('Profile save error:', error);
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
      where: isUUID ? { userId: identifier } : { email: identifier }
    });
    
    if (profile) {
      console.log('Profile found:', profile.id);
      res.json(profile);
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
