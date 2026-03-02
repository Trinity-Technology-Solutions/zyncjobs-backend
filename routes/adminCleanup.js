// Add this to your backend routes (e.g., in backend/routes/admin.js)

const express = require('express');
const router = express.Router();

// DELETE /api/admin/cleanup - Clean all employer data and jobs
router.delete('/cleanup', async (req, res) => {
  try {
    const db = req.app.locals.db; // Assuming you have db in app.locals
    
    // Delete all employer users
    const employerResult = await db.collection('users').deleteMany({
      userType: 'employer'
    });
    
    // Delete all job posts
    const jobsResult = await db.collection('jobs').deleteMany({});
    
    // Delete all applications
    const applicationsResult = await db.collection('applications').deleteMany({});
    
    res.json({
      success: true,
      message: 'Database cleaned successfully',
      deleted: {
        employers: employerResult.deletedCount,
        jobs: jobsResult.deletedCount,
        applications: applicationsResult.deletedCount
      }
    });
    
  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cleanup database',
      error: error.message
    });
  }
});

module.exports = router;