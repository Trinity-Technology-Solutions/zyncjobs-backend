import express from 'express';
import { Op } from 'sequelize';
import Interview from '../models/Interview.js';
import Application from '../models/Application.js';
import User from '../models/User.js';
import Job from '../models/Job.js';
import { meetingService } from '../services/meetingService.js';
import { sendInterviewScheduledEmail } from '../services/emailService.js';

const router = express.Router();

// GET /api/interviews - Get interviews for employer
router.get('/', async (req, res) => {
  try {
    const { employerId, employerEmail } = req.query;
    
    console.log('📅 Fetching interviews for:', { employerId, employerEmail });
    
    const query = {};
    if (employerId) query.employerId = employerId;
    if (employerEmail) query.employerEmail = employerEmail;
    
    const interviews = await Interview.findAll({
      where: query,
      include: [
        { model: Job, attributes: ['jobTitle', 'title', 'company'] },
        { model: User, as: 'candidate', attributes: ['name', 'email'] }
      ],
      order: [['scheduledDate', 'DESC']]
    });
    
    console.log('✅ Found interviews:', interviews.length);
    
    // Format interviews for frontend
    const formattedInterviews = interviews.map(interview => ({
      _id: interview._id,
      candidateName: interview.candidateName || interview.candidateId?.name,
      candidateEmail: interview.candidateEmail,
      jobTitle: interview.jobId?.jobTitle || interview.jobId?.title,
      company: interview.jobId?.company,
      date: interview.scheduledDate,
      time: new Date(interview.scheduledDate).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      duration: interview.duration,
      type: interview.type,
      status: interview.status,
      meetingLink: interview.meetingLink,
      location: interview.location,
      notes: interview.notes,
      createdAt: interview.createdAt
    }));
    
    res.json(formattedInterviews);
  } catch (error) {
    console.error('Interviews API error:', error);
    res.status(500).json([]);
  }
});

// GET /api/interviews/my-interviews - Get user's interviews
router.get('/my-interviews', async (req, res) => {
  try {
    const userId = req.user?.id || req.query.userId;
    
    const interviews = await Interview.findAll({
      where: {
        [Op.or]: [{ candidateId: userId }, { employerId: userId }]
      },
      include: [
        { model: Job, attributes: ['jobTitle', 'title', 'company'] },
        { model: User, as: 'candidate', attributes: ['name', 'email'] },
        { model: User, as: 'employer', attributes: ['name', 'email', 'company'] }
      ],
      order: [['scheduledDate', 'DESC']]
    });
    
    res.json(interviews);
  } catch (error) {
    console.error('My interviews API error:', error);
    res.status(500).json([]);
  }
});

// POST /api/interviews/schedule - Schedule new interview
router.post('/schedule', async (req, res) => {
  try {
    const { applicationId, candidateId, candidateEmail, candidateName, employerId, jobId, scheduledDate, duration, type, meetingLink, location, notes } = req.body;
    
    console.log('📅 Schedule request:', { candidateEmail, employerId });

    // Get candidateId from email
    let finalCandidateId = candidateId;
    if (!finalCandidateId && candidateEmail) {
      const candidate = await User.findOne({ where: { email: candidateEmail } });
      if (candidate) {
        finalCandidateId = candidate.id;
        console.log('✅ Found candidate:', finalCandidateId);
      }
    }

    // Get employerId from email if it looks like an email
    let finalEmployerId = employerId;
    if (employerId && employerId.includes('@')) {
      const employer = await User.findOne({ where: { email: employerId } });
      if (employer) {
        finalEmployerId = employer.id;
        console.log('✅ Found employer:', finalEmployerId);
      }
    }

    // Get job
    let job;
    if (applicationId) {
      const application = await Application.findByPk(applicationId);
      if (application) {
        job = await Job.findByPk(application.jobId);
      }
    }
    if (!job && jobId) {
      job = await Job.findByPk(jobId);
    }

    // Create interview
    const interview = await Interview.create({
      jobId: job?.id || jobId,
      candidateId: finalCandidateId,
      employerId: finalEmployerId,
      candidateEmail: candidateEmail,
      candidateName: candidateName,
      employerEmail: typeof employerId === 'string' && employerId.includes('@') ? employerId : null,
      applicationId: applicationId || null,
      scheduledDate,
      duration: duration || 60,
      type: type || 'video',
      meetingLink,
      location,
      notes,
      status: 'scheduled',
      employerConfirmed: true
    });

    console.log('✅ Interview saved:', interview.id);
    
    // Send email
    if (candidateEmail) {
      try {
        await sendInterviewScheduledEmail(
          candidateEmail,
          candidateName || candidateEmail,
          job?.jobTitle || job?.title || 'Position',
          job?.company || 'Company',
          { scheduledDate, duration, type, meetingLink, location, notes }
        );
        console.log('📧 Email sent to:', candidateEmail);
      } catch (emailError) {
        console.error('❌ Email error:', emailError.message);
      }
    }
    
    res.json({ 
      success: true, 
      message: 'Interview scheduled successfully',
      interview 
    });
  } catch (error) {
    console.error('❌ Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/interviews/create-with-meeting - Schedule interview with Zoom meeting
router.post('/create-with-meeting', async (req, res) => {
  try {
    const { applicationId, candidateId, candidateEmail, jobId, scheduledDate, duration, type, platform, notes } = req.body;
    
    let meetingLink = '';
    
    // Create Zoom meeting if type is video
    if (type === 'video' && platform === 'zoom') {
      const meetingResult = await meetingService.createZoomMeeting({
        topic: 'Interview Meeting',
        start_time: scheduledDate,
        duration: duration || 60,
        description: notes || 'Interview meeting scheduled via ZyncJobs'
      });
      
      if (meetingResult.success) {
        meetingLink = meetingResult.meeting.join_url;
      }
    }

    // Get application details
    const application = await Application.findByPk(applicationId);
    if (!application) {
      return res.status(404).json({ success: false, error: 'Application not found' });
    }

    // Get candidate and job details
    const candidate = await User.findByPk(candidateId || application.candidateId);
    const job = await Job.findByPk(application.jobId);

    // Create interview
    const interview = await Interview.create({
      jobId: application.jobId,
      candidateId: candidateId || application.candidateId,
      employerId: application.employerId,
      applicationId,
      scheduledDate,
      duration: duration || 60,
      type: type || 'video',
      meetingLink,
      notes,
      status: 'scheduled',
      employerConfirmed: true
    });
    
    // Send email to candidate
    if (candidate && candidate.email) {
      await sendInterviewScheduledEmail(
        candidate.email,
        candidate.name || candidateEmail,
        job?.jobTitle || job?.title || 'Position',
        job?.company || 'Company',
        { scheduledDate, duration, type, meetingLink, notes }
      );
    }
    
    res.json({ 
      success: true, 
      message: 'Interview scheduled successfully with meeting link and email sent',
      interview,
      meetingLink
    });
  } catch (error) {
    console.error('Create interview with meeting error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/interviews/:id/confirm - Confirm interview
router.patch('/:id/confirm', async (req, res) => {
  try {
    const { id } = req.params;
    await Interview.update(
      { candidateConfirmed: true, status: 'confirmed' },
      { where: { id } }
    );
    const interview = await Interview.findByPk(id);
    res.json({ success: true, message: 'Interview confirmed', interview });
  } catch (error) {
    console.error('Confirm interview API error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /api/interviews/:id/reschedule - Reschedule interview
router.patch('/:id/reschedule', async (req, res) => {
  try {
    const { id } = req.params;
    const { scheduledDate } = req.body;
    await Interview.update(
      { scheduledDate, status: 'rescheduled' },
      { where: { id } }
    );
    const interview = await Interview.findByPk(id);
    res.json({ success: true, message: 'Interview rescheduled', interview });
  } catch (error) {
    console.error('Reschedule interview API error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/interviews/:id/status - Update interview status
router.put('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    await Interview.update({ status }, { where: { id } });
    const interview = await Interview.findByPk(id);
    
    res.json({ success: true, interview });
  } catch (error) {
    console.error('Update interview status error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;