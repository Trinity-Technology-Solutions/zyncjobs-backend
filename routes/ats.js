import express from 'express';
import { Op, fn, col, literal } from 'sequelize';
import { sequelize } from '../config/postgresql.js';
import { authenticateToken } from '../middleware/auth.js';
import TeamMember from '../models/TeamMember.js';
import Job from '../models/Job.js';
import Application from '../models/Application.js';
import Interview from '../models/Interview.js';
import User from '../models/User.js';
import RecruiterActivityLog from '../models/RecruiterActivityLog.js';
import CandidateAssignment from '../models/CandidateAssignment.js';
import CandidateNote from '../models/CandidateNote.js';
import AuditLog from '../models/AuditLog.js';

const router = express.Router();

// ─── Helper: resolve companyId (owner email) from token ─────────────────────
async function resolveCompanyId(user) {
  // If user is a team member, their companyId = employerId (owner's email)
  const member = await TeamMember.findOne({
    where: { memberEmail: { [Op.iLike]: user.email }, status: 'active' }
  });
  if (member) return member.employerId;
  // Owner: use their email as companyId
  return user.email;
}

// ─── Helper: get all recruiter emails for a company ──────────────────────────
async function getCompanyRecruiterEmails(companyId) {
  const members = await TeamMember.findAll({
    where: { employerId: companyId, status: 'active' },
    attributes: ['memberEmail', 'memberName', 'role']
  });
  // Also include owner
  return [
    { email: companyId, name: 'Admin (Owner)', role: 'Owner' },
    ...members.map(m => ({ email: m.memberEmail, name: m.memberName, role: m.role }))
  ];
}

// ─── Helper: log activity ────────────────────────────────────────────────────
export async function logActivity(companyId, userId, userName, userEmail, action, module, entityType = '', entityId = '', entityName = '', details = {}, ip = '') {
  try {
    await RecruiterActivityLog.create({ companyId, userId, userName, userEmail, action, module, entityType, entityId, entityName, details, ip });
  } catch (e) { /* non-blocking */ }
}

// ─── MODULE 1: Team Activity Dashboard ───────────────────────────────────────
// GET /api/ats/dashboard?companyId=xxx
// Owner-only: blocks team members and non-employers
router.get('/dashboard', authenticateToken, async (req, res) => {
  try {
    const companyId = req.query.companyId || await resolveCompanyId(req.user);
    const recruiters = await getCompanyRecruiterEmails(companyId);
    const emails = recruiters.map(r => r.email);

    const [totalRecruiters, jobsPosted, applications, interviews, offers, hires] = await Promise.all([
      TeamMember.count({ where: { employerId: companyId, status: 'active' } }),
      Job.count({ where: { employerEmail: { [Op.in]: emails } } }),
      Application.count({ where: { employerEmail: { [Op.in]: emails } } }),
      Interview.count({ where: { employerEmail: { [Op.in]: emails } } }),
      Application.count({ where: { employerEmail: { [Op.in]: emails }, status: 'hired' } }),
      Application.count({ where: { employerEmail: { [Op.in]: emails }, status: 'hired' } }),
    ]);

    // Recent activity (last 20)
    const recentActivity = await RecruiterActivityLog.findAll({
      where: { companyId },
      order: [['createdAt', 'DESC']],
      limit: 20
    });

    res.json({
      stats: { totalRecruiters, jobsPosted, applications, interviews, offers, hires },
      recentActivity
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── MODULE 2 + 9: Recruiter Performance / KPI ───────────────────────────────
// GET /api/ats/recruiter-performance?companyId=xxx
router.get('/recruiter-performance', authenticateToken, async (req, res) => {
  try {
    const companyId = req.query.companyId || await resolveCompanyId(req.user);
    const recruiters = await getCompanyRecruiterEmails(companyId);

    const performance = await Promise.all(recruiters.map(async (r) => {
      const [jobsPosted, applications, interviews, hires, contacted] = await Promise.all([
        Job.count({ where: { postedByEmail: { [Op.iLike]: r.email } } }),
        Application.count({ where: { employerEmail: { [Op.iLike]: r.email } } }),
        Interview.count({ where: { employerEmail: { [Op.iLike]: r.email } } }),
        Application.count({ where: { employerEmail: { [Op.iLike]: r.email }, status: 'hired' } }),
        CandidateNote.count({ where: { recruiterId: { [Op.iLike]: r.email } } }),
      ]);

      const responseRate = applications > 0 ? Math.round((interviews / applications) * 100) : 0;

      return {
        email: r.email,
        name: r.name,
        role: r.role,
        jobsPosted,
        applications,
        interviews,
        hires,
        candidatesContacted: contacted,
        offersReleased: hires,
        responseRate,
      };
    }));

    // Sort by hires desc (leaderboard)
    performance.sort((a, b) => b.hires - a.hires);
    res.json({ performance });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── MODULE 3: Activity Timeline ─────────────────────────────────────────────
// GET /api/ats/activity?companyId=xxx&page=1&limit=50&userId=xxx
router.get('/activity', authenticateToken, async (req, res) => {
  try {
    const companyId = req.query.companyId || await resolveCompanyId(req.user);
    const { page = 1, limit = 50, userId, module, from, to } = req.query;

    const where = { companyId };
    if (userId) where.userId = userId;
    if (module) where.module = module;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt[Op.gte] = new Date(from);
      if (to) where.createdAt[Op.lte] = new Date(to);
    }

    const { rows: logs, count: total } = await RecruiterActivityLog.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
    });

    res.json({ logs, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── MODULE 4+5: Candidate Assignment ────────────────────────────────────────
// GET /api/ats/assignments?companyId=xxx&recruiterId=xxx&jobId=xxx
router.get('/assignments', authenticateToken, async (req, res) => {
  try {
    const companyId = req.query.companyId || await resolveCompanyId(req.user);
    const { recruiterId, jobId, stage } = req.query;

    const where = { companyId, isActive: true };
    if (recruiterId) where.recruiterId = recruiterId;
    if (jobId) where.jobId = jobId;
    if (stage) where.pipelineStage = stage;

    const assignments = await CandidateAssignment.findAll({
      where,
      order: [['createdAt', 'DESC']],
    });
    res.json({ assignments });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/ats/assignments — assign candidate to recruiter
router.post('/assignments', authenticateToken, async (req, res) => {
  try {
    const { applicationIds, recruiterId, recruiterName, recruiterEmail, jobId, jobTitle, companyId: bodyCompanyId } = req.body;
    const companyId = bodyCompanyId || await resolveCompanyId(req.user);

    if (!applicationIds?.length || !recruiterId) {
      return res.status(400).json({ error: 'applicationIds and recruiterId required' });
    }

    // Get application details
    const apps = await Application.findAll({ where: { id: { [Op.in]: applicationIds } } });

    const created = [];
    for (const app of apps) {
      // Deactivate previous assignment
      await CandidateAssignment.update(
        { isActive: false },
        { where: { applicationId: app.id, companyId, isActive: true } }
      );
      const assignment = await CandidateAssignment.create({
        applicationId: app.id,
        candidateEmail: app.candidateEmail,
        candidateName: app.candidateName || '',
        jobId: jobId || app.jobId,
        jobTitle: jobTitle || '',
        companyId,
        recruiterId,
        recruiterName: recruiterName || '',
        recruiterEmail: recruiterEmail || recruiterId,
        assignedBy: req.user.email,
        assignedByName: req.user.name || req.user.email,
        pipelineStage: 'Applied',
      });
      created.push(assignment);
    }

    await logActivity(companyId, req.user.email, req.user.name || '', req.user.email,
      `Assigned ${created.length} candidate(s) to ${recruiterName || recruiterId}`,
      'assignment', 'assignment', '', recruiterName || recruiterId, {}, req.ip);

    res.status(201).json({ created, count: created.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/ats/assignments/:id — update pipeline stage / reassign
router.put('/assignments/:id', authenticateToken, async (req, res) => {
  try {
    const assignment = await CandidateAssignment.findByPk(req.params.id);
    if (!assignment) return res.status(404).json({ error: 'Assignment not found' });

    const { pipelineStage, recruiterId, recruiterName, recruiterEmail, notes } = req.body;
    const companyId = await resolveCompanyId(req.user);

    const prevStage = assignment.pipelineStage;
    await assignment.update({
      ...(pipelineStage && { pipelineStage }),
      ...(recruiterId && { recruiterId, recruiterName: recruiterName || '', recruiterEmail: recruiterEmail || recruiterId }),
      ...(notes !== undefined && { notes }),
    });

    if (pipelineStage && pipelineStage !== prevStage) {
      await logActivity(companyId, req.user.email, req.user.name || '', req.user.email,
        `Moved ${assignment.candidateName || assignment.candidateEmail} from ${prevStage} → ${pipelineStage}`,
        'pipeline', 'candidate', assignment.applicationId, assignment.candidateName, {}, req.ip);
    }
    if (recruiterId) {
      await logActivity(companyId, req.user.email, req.user.name || '', req.user.email,
        `Reassigned ${assignment.candidateName || assignment.candidateEmail} to ${recruiterName || recruiterId}`,
        'assignment', 'candidate', assignment.applicationId, assignment.candidateName, {}, req.ip);
    }

    res.json(assignment);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── MODULE 6: Recruiter Work Queue ──────────────────────────────────────────
// GET /api/ats/my-queue?email=xxx&companyId=xxx
router.get('/my-queue', authenticateToken, async (req, res) => {
  try {
    const email = req.query.email || req.user.email;
    const companyId = req.query.companyId || await resolveCompanyId(req.user);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

    const [myJobs, myAssignments, interviewsToday, pendingNotes] = await Promise.all([
      Job.count({ where: { postedByEmail: { [Op.iLike]: email } } }),
      CandidateAssignment.count({ where: { recruiterId: { [Op.iLike]: email }, isActive: true } }),
      Interview.count({ where: { employerEmail: { [Op.iLike]: email }, scheduledDate: { [Op.between]: [today, tomorrow] } } }),
      CandidateAssignment.count({
        where: { recruiterId: { [Op.iLike]: email }, isActive: true, pipelineStage: { [Op.in]: ['Applied', 'Screening'] } }
      }),
    ]);

    const offersReleased = await Application.count({
      where: { employerEmail: { [Op.iLike]: email }, status: 'hired' }
    });

    res.json({ myJobs, myAssignments, interviewsToday, pendingFollowups: pendingNotes, offersReleased });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── MODULE 7: Candidate Pipeline ────────────────────────────────────────────
// GET /api/ats/pipeline?companyId=xxx&recruiterId=xxx&jobId=xxx
router.get('/pipeline', authenticateToken, async (req, res) => {
  try {
    const companyId = req.query.companyId || await resolveCompanyId(req.user);
    const { recruiterId, jobId } = req.query;

    const where = { companyId, isActive: true };
    if (recruiterId) where.recruiterId = { [Op.iLike]: recruiterId };
    if (jobId) where.jobId = jobId;

    const stages = ['Applied','Screening','Shortlisted','Interview 1','Interview 2','Selected','Offer','Joined','Rejected'];
    const pipeline = {};

    for (const stage of stages) {
      pipeline[stage] = await CandidateAssignment.findAll({
        where: { ...where, pipelineStage: stage },
        order: [['updatedAt', 'DESC']],
        limit: 50,
      });
    }

    // Stage counts summary
    const counts = {};
    for (const stage of stages) counts[stage] = pipeline[stage].length;

    res.json({ pipeline, counts, stages });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── MODULE 8: Follow-up Notes ───────────────────────────────────────────────
// GET /api/ats/notes/:applicationId
router.get('/notes/:applicationId', authenticateToken, async (req, res) => {
  try {
    const notes = await CandidateNote.findAll({
      where: { applicationId: req.params.applicationId },
      order: [['createdAt', 'ASC']],
    });
    res.json({ notes });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/ats/notes
router.post('/notes', authenticateToken, async (req, res) => {
  try {
    const { applicationId, candidateEmail, candidateName, companyId: bodyCompanyId, noteType, content } = req.body;
    const companyId = bodyCompanyId || await resolveCompanyId(req.user);

    if (!applicationId || !content) return res.status(400).json({ error: 'applicationId and content required' });

    const note = await CandidateNote.create({
      applicationId,
      candidateEmail: candidateEmail || '',
      candidateName: candidateName || '',
      companyId,
      recruiterId: req.user.email,
      recruiterName: req.user.name || req.user.email,
      noteType: noteType || 'note',
      content,
    });

    await logActivity(companyId, req.user.email, req.user.name || '', req.user.email,
      `Added ${noteType || 'note'} for ${candidateName || candidateEmail}`,
      'notes', 'candidate', applicationId, candidateName || candidateEmail, {}, req.ip);

    res.status(201).json(note);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── MODULE 12: Leaderboard ───────────────────────────────────────────────────
// GET /api/ats/leaderboard?companyId=xxx
router.get('/leaderboard', authenticateToken, async (req, res) => {
  try {
    const companyId = req.query.companyId || await resolveCompanyId(req.user);
    const recruiters = await getCompanyRecruiterEmails(companyId);

    const board = await Promise.all(recruiters.map(async (r) => {
      const [hires, interviews, jobsPosted] = await Promise.all([
        Application.count({ where: { employerEmail: { [Op.iLike]: r.email }, status: 'hired' } }),
        Interview.count({ where: { employerEmail: { [Op.iLike]: r.email } } }),
        Job.count({ where: { postedByEmail: { [Op.iLike]: r.email } } }),
      ]);
      return { email: r.email, name: r.name, role: r.role, hires, interviews, jobsPosted };
    }));

    board.sort((a, b) => b.hires - a.hires || b.interviews - a.interviews);
    res.json({ leaderboard: board });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── MODULE 13: SLA Monitoring ───────────────────────────────────────────────
// GET /api/ats/sla?companyId=xxx&days=3
router.get('/sla', authenticateToken, async (req, res) => {
  try {
    const companyId = req.query.companyId || await resolveCompanyId(req.user);
    const slaDays = parseInt(req.query.days || '3');
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - slaDays);

    // Candidates stuck in Applied/Screening beyond SLA
    const slaBreaches = await CandidateAssignment.findAll({
      where: {
        companyId,
        isActive: true,
        pipelineStage: { [Op.in]: ['Applied', 'Screening'] },
        updatedAt: { [Op.lte]: threshold },
      },
      order: [['updatedAt', 'ASC']],
      limit: 100,
    });

    res.json({ slaBreaches, slaDays, count: slaBreaches.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── MODULE 10: Audit Logs ────────────────────────────────────────────────────
// GET /api/ats/audit?companyId=xxx&page=1
router.get('/audit', authenticateToken, async (req, res) => {
  try {
    const companyId = req.query.companyId || await resolveCompanyId(req.user);
    const { page = 1, limit = 50, userId } = req.query;

    const where = { companyId };
    if (userId) where.userId = userId;

    const { rows: logs, count: total } = await RecruiterActivityLog.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
    });

    res.json({ logs, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── MODULE 11: Team Members with Roles ──────────────────────────────────────
// GET /api/ats/team?companyId=xxx
router.get('/team', authenticateToken, async (req, res) => {
  try {
    const companyId = req.query.companyId || await resolveCompanyId(req.user);
    const members = await TeamMember.findAll({
      where: { employerId: companyId, status: 'active' },
      order: [['createdAt', 'ASC']],
    });

    // Augment with current team role permissions map
    const rolePermissions = {
      Owner:          { canPost: true,  canAssign: true,  canViewAll: true,  canApprove: false, label: 'Company Admin' },
      Recruiter:      { canPost: true,  canAssign: false, canViewAll: false, canApprove: false, label: 'Recruiter' },
      'Team Lead':    { canPost: true,  canAssign: true,  canViewAll: true,  canApprove: false, label: 'Team Lead' },
      'Hiring Manager':{ canPost: false, canAssign: false, canViewAll: false, canApprove: true,  label: 'Hiring Manager' },
      Viewer:         { canPost: false, canAssign: false, canViewAll: false, canApprove: false, label: 'Viewer' },
    };

    const enriched = members.map(m => ({
      ...m.toJSON(),
      permissions: rolePermissions[m.role] || rolePermissions.Viewer,
    }));

    res.json({ members: enriched, rolePermissions });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Update Team Member Role ──────────────────────────────────────────────────
// PUT /api/ats/team/:id/role
router.put('/team/:id/role', authenticateToken, async (req, res) => {
  try {
    const { role } = req.body;
    const validRoles = ['Owner', 'Recruiter', 'Team Lead', 'Hiring Manager', 'Viewer'];
    if (!validRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' });

    const member = await TeamMember.findByPk(req.params.id);
    if (!member) return res.status(404).json({ error: 'Member not found' });

    await member.update({ role });

    const companyId = await resolveCompanyId(req.user);
    await logActivity(companyId, req.user.email, req.user.name || '', req.user.email,
      `Changed role of ${member.memberName} to ${role}`,
      'team', 'user', member.id, member.memberName, {}, req.ip);

    res.json(member);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Log activity from frontend (job posted, status changed, etc.) ────────────
// POST /api/ats/log
router.post('/log', authenticateToken, async (req, res) => {
  try {
    const { action, module, entityType, entityId, entityName, details, companyId: bodyCompanyId } = req.body;
    const companyId = bodyCompanyId || await resolveCompanyId(req.user);

    await logActivity(
      companyId, req.user.email, req.user.name || req.user.email, req.user.email,
      action, module || 'general', entityType || '', entityId || '', entityName || '',
      details || {}, req.ip
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── MODULE 14: Jobs List (Owner-only) ──────────────────────────────────────
// GET /api/ats/jobs?page=1&limit=25&search=xxx&status=xxx
// Only the company owner (employer role, not a team member) can access this.
router.get('/jobs', authenticateToken, async (req, res) => {
  try {
    // Only employers (owners) can view this — block team members and non-employers
    if (req.user.role !== 'employer') {
      return res.status(403).json({ error: 'Access denied. Owner account required.' });
    }

    // Block team members — they are not the owner
    const isMember = await TeamMember.findOne({
      where: { memberEmail: { [Op.iLike]: req.user.email }, status: 'active' }
    });
    if (isMember) {
      return res.status(403).json({ error: 'Access denied. Only the company owner can view this page.' });
    }

    const { page = 1, limit = 25, search, status } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Only fetch jobs posted under this owner's email
    const where = { employerEmail: { [Op.iLike]: req.user.email } };

    if (status && status !== 'All Jobs') {
      const statusMap = { Active: true, 'On Hold': false, Closed: false };
      if (status === 'Active') where.isActive = true;
      else if (status === 'On Hold' || status === 'Closed') where.isActive = false;
    }

    if (search) {
      where[Op.or] = [
        { jobTitle: { [Op.iLike]: `%${search}%` } },
        { positionId: { [Op.iLike]: `%${search}%` } },
        { company: { [Op.iLike]: `%${search}%` } },
        { location: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const { rows: jobs, count: total } = await Job.findAndCountAll({
      where,
      attributes: ['id', 'positionId', 'jobTitle', 'company', 'location', 'isActive', 'status',
                   'jobType', 'workSetting', 'postedByName', 'postedByEmail', 'createdAt', 'applicationsCount'],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset,
    });

    res.json({
      jobs,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Summary stats for a single recruiter ────────────────────────────────────
// GET /api/ats/recruiter-stats/:email?companyId=xxx
router.get('/recruiter-stats/:email', authenticateToken, async (req, res) => {
  try {
    const email = req.params.email;
    const [jobsPosted, applications, interviews, hires, notes] = await Promise.all([
      Job.count({ where: { postedByEmail: { [Op.iLike]: email } } }),
      Application.count({ where: { employerEmail: { [Op.iLike]: email } } }),
      Interview.count({ where: { employerEmail: { [Op.iLike]: email } } }),
      Application.count({ where: { employerEmail: { [Op.iLike]: email }, status: 'hired' } }),
      CandidateNote.count({ where: { recruiterId: { [Op.iLike]: email } } }),
    ]);
    const responseRate = applications > 0 ? Math.round((interviews / applications) * 100) : 0;
    res.json({ email, jobsPosted, applications, interviews, hires, candidatesContacted: notes, offersReleased: hires, responseRate });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
