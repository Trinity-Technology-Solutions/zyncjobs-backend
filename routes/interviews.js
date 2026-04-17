import express from 'express';
import { Op } from 'sequelize';
import Interview from '../models/Interview.js';
import Application from '../models/Application.js';
import User from '../models/User.js';
import Job from '../models/Job.js';
import { meetingService } from '../services/meetingService.js';
import { sendInterviewScheduledEmail } from '../services/emailService.js';
import NotificationService from '../services/notificationService.js';

const router = express.Router();

// GET /api/interviews - Get interviews for employer
router.get('/', async (req, res) => {
  try {
    const { employerId, employerEmail } = req.query;
    
    const where = {};
    if (employerId && employerId !== '') where.employerId = employerId;
    if (employerEmail && employerEmail !== '') where.employerEmail = employerEmail;
    
    if (Object.keys(where).length === 0) {
      return res.json([]);
    }

    console.log('📅 Fetching interviews for:', { employerId, employerEmail });
    
    const interviews = await Interview.findAll({
      where,
      order: [['scheduledDate', 'DESC']]
    });
    
    console.log('✅ Found interviews:', interviews.length);
    
    const formattedInterviews = await Promise.all(interviews.map(async (interview) => {
      let job = null;
      if (interview.jobId) {
        job = await Job.findByPk(interview.jobId);
      }
      
      return {
        _id: interview.id,
        candidateName: interview.candidateName,
        candidateEmail: interview.candidateEmail,
        jobTitle: job?.jobTitle || job?.title || 'N/A',
        company: job?.company || 'N/A',
        date: interview.scheduledDate,
        time: new Date(interview.scheduledDate).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        duration: interview.duration,
        type: interview.type,
        status: interview.status,
        meetingLink: interview.meetingLink,
        location: interview.location,
        notes: interview.notes,
        createdAt: interview.createdAt
      };
    }));
    
    res.json(formattedInterviews);
  } catch (error) {
    console.error('Interviews API error:', error);
    res.status(500).json({ error: error.message });
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

// GET /api/interviews/application/:applicationId - Get interviews for a specific application
router.get('/application/:applicationId', async (req, res) => {
  try {
    const { applicationId } = req.params;
    const interviews = await Interview.findAll({
      where: { applicationId },
      order: [['createdAt', 'ASC']]
    });
    res.json(interviews);
  } catch (error) {
    console.error('Get interviews by application error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/interviews/candidate/:email - Get interviews for a candidate by email
router.get('/candidate/:email', async (req, res) => {
  try {
    const { email } = req.params;
    console.log('📅 Fetching interviews for candidate:', email);

    const interviews = await Interview.findAll({
      where: { candidateEmail: decodeURIComponent(email) },
      order: [['scheduledDate', 'DESC']]
    });

    const formatted = await Promise.all(interviews.map(async (iv) => {
      let job = null;
      if (iv.jobId) job = await Job.findByPk(iv.jobId);
      return {
        _id: iv.id,
        jobId: {
          _id: job?.id,
          jobTitle: job?.jobTitle || job?.title || 'Position',
          company: job?.company || 'Company'
        },
        candidateEmail: iv.candidateEmail,
        candidateName: iv.candidateName,
        interviewDate: iv.scheduledDate,
        interviewTime: new Date(iv.scheduledDate).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        interviewType: iv.type,
        meetingLink: iv.meetingLink,
        location: iv.location,
        interviewerName: iv.interviewer || null,
        status: iv.status,
        round: iv.round,
        result: iv.result,
        notes: iv.notes,
        createdAt: iv.createdAt
      };
    }));

    console.log('✅ Found', formatted.length, 'interviews for', email);
    res.json(formatted);
  } catch (error) {
    console.error('Get candidate interviews error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/interviews/schedule - Schedule new interview
router.post('/schedule', async (req, res) => {
  try {
    const { applicationId, candidateId, candidateEmail, candidateName, employerId, jobId, scheduledDate, duration, type, meetingLink, location, notes } = req.body;
    
    console.log('📅 Schedule request:', { candidateEmail, employerId });

    let finalCandidateId = candidateId;
    if (!finalCandidateId && candidateEmail) {
      const candidate = await User.findOne({ where: { email: candidateEmail } });
      if (candidate) {
        finalCandidateId = candidate.id;
        console.log('✅ Found candidate:', finalCandidateId);
      }
    }

    let finalEmployerId = employerId;
    if (employerId && employerId.includes('@')) {
      const employer = await User.findOne({ where: { email: employerId } });
      if (employer) {
        finalEmployerId = employer.id;
        console.log('✅ Found employer:', finalEmployerId);
      }
    }

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
    
    try {
      await NotificationService.createInterviewNotification(interview);
      console.log('🔔 Interview notification created');
    } catch (notificationError) {
      console.error('⚠️ Interview notification creation failed:', notificationError.message);
    }
    
    if (candidateEmail) {
      try {
        // Get employer details
        const employer = finalEmployerId ? await User.findByPk(finalEmployerId) : null;
        const employerEmail = employer?.email || (typeof employerId === 'string' && employerId.includes('@') ? employerId : null);
        const employerName = employer?.companyName || employer?.name || job?.company;
        
        await sendInterviewScheduledEmail(
          candidateEmail,
          candidateName || candidateEmail,
          job?.jobTitle || job?.title || 'Position',
          job?.company || 'Company',
          { scheduledDate, duration, type, meetingLink, location, notes },
          employerEmail,
          employerName
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

    const application = await Application.findByPk(applicationId);
    if (!application) {
      return res.status(404).json({ success: false, error: 'Application not found' });
    }

    const candidate = await User.findByPk(candidateId || application.candidateId);
    const job = await Job.findByPk(application.jobId);

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
    
    try {
      await NotificationService.createInterviewNotification(interview);
    } catch (notificationError) {
      console.error('⚠️ Interview notification creation failed:', notificationError.message);
    }
    
    if (candidate && candidate.email) {
      // Get employer details
      const employer = application.employerId ? await User.findByPk(application.employerId) : null;
      const employerEmail = employer?.email || application.employerEmail || job?.employerEmail;
      const employerName = employer?.companyName || employer?.name || job?.company;
      
      await sendInterviewScheduledEmail(
        candidate.email,
        candidate.name || candidateEmail,
        job?.jobTitle || job?.title || 'Position',
        job?.company || 'Company',
        { scheduledDate, duration, type, meetingLink, notes },
        employerEmail,
        employerName
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
