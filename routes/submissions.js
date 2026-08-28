import express from 'express';
import { Op } from 'sequelize';
import TalentCandidate from '../models/TalentCandidate.js';
import SubmissionBatch from '../models/SubmissionBatch.js';
import CandidateSubmission from '../models/CandidateSubmission.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

function parseCSV(csvText) {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
    const obj = {};
    headers.forEach((h, i) => obj[h] = values[i]);
    return obj;
  });
}

function generateSubmissionCSV(candidates, batchId, fields = []) {
  const defaultFields = ['Candidate ID', 'Submission ID', 'Name', 'Email', 'Phone', 'Location', 'Job Title', 'Skills', 'Experience'];
  const selectedFields = fields.length > 0 ? fields : defaultFields;
  
  const header = selectedFields.join(',');
  const rows = candidates.map(c => {
    const vals = {};
    if (selectedFields.includes('Candidate ID')) vals['Candidate ID'] = c.candidate_id;
    if (selectedFields.includes('Submission ID')) vals['Submission ID'] = batchId;
    if (selectedFields.includes('Name')) vals['Name'] = c.name;
    if (selectedFields.includes('Email')) vals['Email'] = c.email;
    if (selectedFields.includes('Phone')) vals['Phone'] = c.phone;
    if (selectedFields.includes('Location')) vals['Location'] = c.location;
    if (selectedFields.includes('Job Title')) vals['Job Title'] = c.jobTitle;
    if (selectedFields.includes('Skills')) vals['Skills'] = Array.isArray(c.skills) ? c.skills.join(';') : c.skills;
    if (selectedFields.includes('Experience')) vals['Experience'] = c.totalExperience || c.experience;
    
    return selectedFields.map(f => vals[f] || '').map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
  });
  return [header, ...rows].join('\n');
}

// POST /api/submissions/create - Create submission batch from selected candidates
router.post('/create', authenticateToken, requireRole(['admin', 'recruiter', 'super_admin']), async (req, res) => {
  try {
    const { candidateIds, clientName, jobTitle, notes } = req.body;
    if (!candidateIds?.length || !clientName) {
      return res.status(400).json({ error: 'candidateIds and clientName required' });
    }

    const candidates = await TalentCandidate.findAll({
      where: { candidate_id: candidateIds },
      attributes: ['candidate_id', 'name', 'email', 'phone', 'location', 'jobTitle', 'skills', 'totalExperience', 'experience']
    });

    if (candidates.length !== candidateIds.length) {
      return res.status(400).json({ error: 'Some candidates not found' });
    }

    const batch = await SubmissionBatch.create({
      client_name: clientName,
      job_title: jobTitle,
      submitted_by: req.user.id,
      candidate_count: candidates.length,
      status: 'Submitted',
      notes
    });

    const submissions = await CandidateSubmission.bulkCreate(candidates.map(c => ({
      batch_id: batch.id,
      candidate_id: c.candidate_id,
      candidate_name: c.name,
      candidate_email: c.email,
      status: 'submitted'
    })));

    res.json({
      batch: {
        batchId: batch.batch_id,
        clientName: batch.client_name,
        jobTitle: batch.job_title,
        candidateCount: batch.candidate_count,
        submittedAt: batch.submitted_at
      },
      submissionsCount: submissions.length
    });
  } catch (err) {
    console.error('[SUBMISSIONS] Create error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/submissions/generate-csv - Generate CSV for a batch
router.post('/generate-csv', authenticateToken, requireRole(['admin', 'recruiter', 'super_admin']), async (req, res) => {
  try {
    const { batchId, fields } = req.body;
    if (!batchId) return res.status(400).json({ error: 'batchId required' });

    const batch = await SubmissionBatch.findOne({ where: { batch_id: batchId } });
    if (!batch) return res.status(404).json({ error: 'Batch not found' });

    const submissions = await CandidateSubmission.findAll({
      where: { batch_id: batch.id },
      include: [{
        model: TalentCandidate,
        as: 'candidate',
        attributes: ['candidate_id', 'name', 'email', 'phone', 'location', 'jobTitle', 'skills', 'totalExperience', 'experience'],
        required: false
      }]
    });

    const candidates = submissions.map(s => s.candidate || {
      candidate_id: s.candidate_id,
      name: s.candidate_name,
      email: s.candidate_email
    });

    const csv = generateSubmissionCSV(candidates, batch.batch_id, fields);
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="submission_${batch.batch_id}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error('[SUBMISSIONS] CSV error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/submissions - List all submission batches
router.get('/', authenticateToken, requireRole(['admin', 'recruiter', 'super_admin']), async (req, res) => {
  try {
    const { clientName, status, page = 1, limit = 20 } = req.query;
    const where = {};
    if (clientName) where.client_name = { [Op.iLike]: `%${clientName}%` };
    if (status) where.status = status;

    const { rows, count } = await SubmissionBatch.findAndCountAll({
      where,
      order: [['submitted_at', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
      include: [{
        model: CandidateSubmission,
        as: 'submissions',
        attributes: ['status'],
        required: false
      }]
    });

    const batches = rows.map(b => ({
      batchId: b.batch_id,
      clientName: b.client_name,
      jobTitle: b.job_title,
      candidateCount: b.candidate_count,
      status: b.status,
      submittedAt: b.submitted_at,
      shortlistedCount: b.submissions?.filter(s => s.status === 'shortlisted').length || 0,
      rejectedCount: b.submissions?.filter(s => s.status === 'rejected').length || 0
    }));

    res.json({ batches, total: count, page: parseInt(page), totalPages: Math.ceil(count / limit) });
  } catch (err) {
    console.error('[SUBMISSIONS] List error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/submissions/:batchId - Get batch details with candidates
router.get('/:batchId', authenticateToken, requireRole(['admin', 'recruiter', 'super_admin']), async (req, res) => {
  try {
    const batch = await SubmissionBatch.findOne({ where: { batch_id: req.params.batchId } });
    if (!batch) return res.status(404).json({ error: 'Batch not found' });

    const submissions = await CandidateSubmission.findAll({
      where: { batch_id: batch.id },
      include: [{
        model: TalentCandidate,
        as: 'candidate',
        attributes: ['candidate_id', 'name', 'email', 'phone', 'location', 'jobTitle', 'skills', 'totalExperience', 'experience'],
        required: false
      }],
      order: [['submitted_at', 'ASC']]
    });

    const candidates = submissions.map(s => ({
      candidateId: s.candidate?.candidate_id || s.candidate_id,
      name: s.candidate?.name || s.candidate_name,
      email: s.candidate?.email || s.candidate_email,
      phone: s.candidate?.phone,
      location: s.candidate?.location,
      jobTitle: s.candidate?.jobTitle,
      skills: s.candidate?.skills,
      experience: s.candidate?.totalExperience || s.candidate?.experience,
      status: s.status,
      submittedAt: s.submitted_at,
      shortlistedAt: s.shortlisted_at,
      rejectedAt: s.rejected_at
    }));

    res.json({
      batch: {
        batchId: batch.batch_id,
        clientName: batch.client_name,
        jobTitle: batch.job_title,
        candidateCount: batch.candidate_count,
        status: batch.status,
        submittedAt: batch.submitted_at,
        notes: batch.notes
      },
      candidates
    });
  } catch (err) {
    console.error('[SUBMISSIONS] Detail error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/submissions/import-shortlist - Import shortlist CSV from client (flexible matching)
router.post('/import-shortlist', authenticateToken, requireRole(['admin', 'recruiter', 'super_admin']), async (req, res) => {
  try {
    const { csvText, batchId, columnMap } = req.body;
    if (!csvText) return res.status(400).json({ error: 'csvText required' });
    if (!batchId) return res.status(400).json({ error: 'batchId required' });

    const batch = await SubmissionBatch.findOne({ where: { batch_id: batchId } });
    if (!batch) return res.status(404).json({ error: 'Batch not found' });

    // Get all candidates in this batch with full details
    const submissions = await CandidateSubmission.findAll({
      where: { batch_id: batch.id },
      include: [{
        model: TalentCandidate,
        as: 'candidate',
        attributes: ['candidate_id', 'name', 'email', 'phone', 'location', 'jobTitle', 'skills', 'totalExperience', 'experience'],
        required: false
      }]
    });

    // Build candidate lookup maps (same as smart-import)
    const byEmail = new Map();
    const byPhone = new Map();
    const byName = new Map();
    const byCandidateId = new Map();
    
    submissions.forEach(s => {
      const c = s.candidate || { candidate_id: s.candidate_id, name: s.candidate_name, email: s.candidate_email };
      if (c.candidate_id) byCandidateId.set(c.candidate_id, s);
      if (c.email) byEmail.set(c.email.toLowerCase().trim(), s);
      if (c.phone) byPhone.set(c.phone.replace(/\D/g, '').slice(-10), s);
      if (c.name) byName.set(c.name.toLowerCase().trim(), s);
    });

    const rows = parseCSV(csvText);
    if (!rows.length) return res.status(400).json({ error: 'CSV empty' });

    // Column mapping - support flexible column names (same as smart-import)
    const defaultMap = {
      candidateId: 'Candidate ID',
      name: 'Name',
      email: 'Email',
      phone: 'Phone',
      status: 'Status'
    };
    const map = { ...defaultMap, ...columnMap };

    let shortlisted = 0, rejected = 0, notFound = 0;

    for (const row of rows) {
      const candidateId = (row[map.candidateId] || '').trim();
      const name = (row[map.name] || '').trim();
      const email = (row[map.email] || '').trim().toLowerCase();
      const phone = (row[map.phone] || '').replace(/\D/g, '').slice(-10);
      const status = (row[map.status] || '').toLowerCase().trim();

      let matched = null;
      let confidence = 0;
      let matchType = 'none';

      // 1. Exact candidate_id match (100%)
      if (candidateId && byCandidateId.has(candidateId)) {
        matched = byCandidateId.get(candidateId);
        confidence = 100;
        matchType = 'candidate_id';
      }
      // 2. Exact email match (95%)
      else if (email && byEmail.has(email)) {
        matched = byEmail.get(email);
        confidence = 95;
        matchType = 'email';
      }
      // 3. Exact phone match (90%)
      else if (phone && byPhone.has(phone)) {
        matched = byPhone.get(phone);
        confidence = 90;
        matchType = 'phone';
      }
      // 4. Exact name match (80%) - only if unique
      else if (name && byName.has(name.toLowerCase())) {
        matched = byName.get(name.toLowerCase());
        confidence = 80;
        matchType = 'name';
      }
      // 5. Fuzzy name match (contains)
      else if (name) {
        const nameLower = name.toLowerCase();
        for (const [key, sub] of byName) {
          if (key.includes(nameLower) || nameLower.includes(key)) {
            matched = sub;
            confidence = 65;
            matchType = 'name_fuzzy';
            break;
          }
        }
      }

      if (!matched) {
        notFound++;
        continue;
      }

      if (status === 'shortlisted') {
        await matched.update({ status: 'shortlisted', shortlisted_at: new Date() });
        shortlisted++;
      } else if (status === 'rejected') {
        await matched.update({ status: 'rejected', rejected_at: new Date() });
        rejected++;
      } else {
        // If no valid status, count as not found
        notFound++;
      }
    }

    res.json({ shortlisted, rejected, notFound, total: rows.length });
  } catch (err) {
    console.error('[SUBMISSIONS] Import error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/submissions/smart-import - Smart import with auto-matching by name/email/phone
router.post('/smart-import', authenticateToken, requireRole(['admin', 'recruiter', 'super_admin']), async (req, res) => {
  try {
    const { batchId, csvText, columnMap } = req.body;
    if (!batchId || !csvText) return res.status(400).json({ error: 'batchId and csvText required' });

    const batch = await SubmissionBatch.findOne({ where: { batch_id: batchId } });
    if (!batch) return res.status(404).json({ error: 'Batch not found' });

    // Get all candidates in this batch with full details
    const submissions = await CandidateSubmission.findAll({
      where: { batch_id: batch.id },
      include: [{
        model: TalentCandidate,
        as: 'candidate',
        attributes: ['candidate_id', 'name', 'email', 'phone', 'location', 'jobTitle', 'skills', 'totalExperience', 'experience'],
        required: false
      }]
    });

    // Build candidate lookup maps
    const byEmail = new Map();
    const byPhone = new Map();
    const byName = new Map();
    
    submissions.forEach(s => {
      const c = s.candidate || { candidate_id: s.candidate_id, name: s.candidate_name, email: s.candidate_email };
      if (c.email) byEmail.set(c.email.toLowerCase().trim(), s);
      if (c.phone) byPhone.set(c.phone.replace(/\D/g, '').slice(-10), s);
      if (c.name) byName.set(c.name.toLowerCase().trim(), s);
    });

    const rows = parseCSV(csvText);
    if (!rows.length) return res.status(400).json({ error: 'CSV empty' });

    // Column mapping - support flexible column names
    const defaultMap = {
      name: 'Name',
      email: 'Email',
      phone: 'Phone',
      status: 'Status',
      clientId: 'Client ID'
    };
    const map = { ...defaultMap, ...columnMap };

    const matches = [];

    for (const row of rows) {
      const clientId = row[map.clientId] || '';
      const name = (row[map.name] || '').trim();
      const email = (row[map.email] || '').trim().toLowerCase();
      const phone = (row[map.phone] || '').replace(/\D/g, '').slice(-10);
      const status = (row[map.status] || '').toLowerCase().trim();

      let matched = null;
      let confidence = 0;
      let matchType = 'none';

      // 1. Exact email match (100%)
      if (email && byEmail.has(email)) {
        matched = byEmail.get(email);
        confidence = 100;
        matchType = 'email';
      }
      // 2. Exact phone match (95%)
      else if (phone && byPhone.has(phone)) {
        matched = byPhone.get(phone);
        confidence = 95;
        matchType = 'phone';
      }
      // 3. Exact name match (85%) - only if unique
      else if (name && byName.has(name.toLowerCase())) {
        matched = byName.get(name.toLowerCase());
        confidence = 85;
        matchType = 'name';
      }
      // 4. Fuzzy name match (contains)
      else if (name) {
        const nameLower = name.toLowerCase();
        for (const [key, sub] of byName) {
          if (key.includes(nameLower) || nameLower.includes(key)) {
            matched = sub;
            confidence = 70;
            matchType = 'name_fuzzy';
            break;
          }
        }
      }

      matches.push({
        clientRow: { clientId, name, email, phone: row[map.phone] || '', status },
        matchedCandidate: matched ? {
          candidateId: matched.candidate?.candidate_id || matched.candidate_id,
          name: matched.candidate?.name || matched.candidate_name,
          email: matched.candidate?.email || matched.candidate_email,
          phone: matched.candidate?.phone,
          submissionId: matched.id
        } : null,
        confidence,
        matchType,
        action: matched && confidence >= 85 ? 'auto' : 'review'
      });
    }

    res.json({ matches, batch: { batchId: batch.batch_id, clientName: batch.client_name } });
  } catch (err) {
    console.error('[SUBMISSIONS] Smart import error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/submissions/confirm-smart-import - Confirm and apply smart import matches
router.post('/confirm-smart-import', authenticateToken, requireRole(['admin', 'recruiter', 'super_admin']), async (req, res) => {
  try {
    const { batchId, matches } = req.body;
    if (!batchId || !matches?.length) return res.status(400).json({ error: 'batchId and matches required' });

    let shortlisted = 0, rejected = 0, notFound = 0;

    for (const m of matches) {
      if (!m.matchedCandidate || m.action !== 'confirm') continue;

      const submission = await CandidateSubmission.findByPk(m.matchedCandidate.submissionId);
      if (!submission) { notFound++; continue; }

      if (m.clientRow.status.toLowerCase().trim() === 'shortlisted') {
        await submission.update({ status: 'shortlisted', shortlisted_at: new Date() });
        shortlisted++;
      } else if (m.clientRow.status.toLowerCase().trim() === 'rejected') {
        await submission.update({ status: 'rejected', rejected_at: new Date() });
        rejected++;
      }
    }

    res.json({ shortlisted, rejected, notFound, total: matches.length });
  } catch (err) {
    console.error('[SUBMISSIONS] Confirm smart import error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;