import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import UserPreferences from '../models/UserPreferences.js';

const router = express.Router();

// GET /api/user-preferences - Get user preferences
router.get('/', authenticateToken, async (req, res) => {
  try {
    let preferences = await UserPreferences.findOne({
      where: { userId: req.user.id }
    });
    
    if (!preferences) {
      // Create default preferences if none exist
      preferences = await UserPreferences.create({
        userId: req.user.id,
        userEmail: req.user.email
      });
    }
    
    res.json(preferences);
  } catch (error) {
    console.error('Error fetching user preferences:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/user-preferences - Update user preferences
router.put('/', authenticateToken, async (req, res) => {
  try {
    const {
      resumeSkills,
      searchHistory,
      savedSearches,
      jobPreferences,
      locationPreferences,
      salaryPreferences,
      notificationPreferences,
      otherPreferences
    } = req.body;
    
    let preferences = await UserPreferences.findOne({
      where: { userId: req.user.id }
    });
    
    if (!preferences) {
      // Create new preferences
      preferences = await UserPreferences.create({
        userId: req.user.id,
        userEmail: req.user.email,
        resumeSkills: resumeSkills || [],
        searchHistory: searchHistory || [],
        savedSearches: savedSearches || [],
        jobPreferences: jobPreferences || {},
        locationPreferences: locationPreferences || [],
        salaryPreferences: salaryPreferences || {},
        notificationPreferences: notificationPreferences || {},
        otherPreferences: otherPreferences || {}
      });
    } else {
      // Update existing preferences
      await preferences.update({
        resumeSkills: resumeSkills !== undefined ? resumeSkills : preferences.resumeSkills,
        searchHistory: searchHistory !== undefined ? searchHistory : preferences.searchHistory,
        savedSearches: savedSearches !== undefined ? savedSearches : preferences.savedSearches,
        jobPreferences: jobPreferences !== undefined ? jobPreferences : preferences.jobPreferences,
        locationPreferences: locationPreferences !== undefined ? locationPreferences : preferences.locationPreferences,
        salaryPreferences: salaryPreferences !== undefined ? salaryPreferences : preferences.salaryPreferences,
        notificationPreferences: notificationPreferences !== undefined ? notificationPreferences : preferences.notificationPreferences,
        otherPreferences: otherPreferences !== undefined ? otherPreferences : preferences.otherPreferences
      });
    }
    
    res.json({
      message: 'Preferences updated successfully',
      preferences
    });
  } catch (error) {
    console.error('Error updating user preferences:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/user-preferences/resume-skills - Update resume skills specifically
router.post('/resume-skills', authenticateToken, async (req, res) => {
  try {
    const { skills } = req.body;
    
    if (!Array.isArray(skills)) {
      return res.status(400).json({ error: 'Skills must be an array' });
    }
    
    let preferences = await UserPreferences.findOne({
      where: { userId: req.user.id }
    });
    
    if (!preferences) {
      preferences = await UserPreferences.create({
        userId: req.user.id,
        userEmail: req.user.email,
        resumeSkills: skills
      });
    } else {
      await preferences.update({ resumeSkills: skills });
    }
    
    res.json({
      message: 'Resume skills updated successfully',
      resumeSkills: preferences.resumeSkills
    });
  } catch (error) {
    console.error('Error updating resume skills:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/user-preferences/search-history - Add to search history
router.post('/search-history', authenticateToken, async (req, res) => {
  try {
    const { searchTerm, location, timestamp } = req.body;
    
    let preferences = await UserPreferences.findOne({
      where: { userId: req.user.id }
    });
    
    if (!preferences) {
      preferences = await UserPreferences.create({
        userId: req.user.id,
        userEmail: req.user.email,
        searchHistory: [{ searchTerm, location, timestamp: timestamp || new Date() }]
      });
    } else {
      const currentHistory = preferences.searchHistory || [];
      const newHistory = [
        { searchTerm, location, timestamp: timestamp || new Date() },
        ...currentHistory.slice(0, 19) // Keep only last 20 searches
      ];
      
      await preferences.update({ searchHistory: newHistory });
    }
    
    res.json({
      message: 'Search history updated successfully',
      searchHistory: preferences.searchHistory
    });
  } catch (error) {
    console.error('Error updating search history:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
