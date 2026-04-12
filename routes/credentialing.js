import express from 'express';
import Credentialing from '../models/Credentialing.js';
import Application from '../models/Application.js';

const router = express.Router();

// GET all credentialed candidates for employer
router.get('/', async (req, res) => {
  try {
    const { employerEmail } = req.query;
    if (!employerEmail) return res.status(400).json({ error: 'employerEmail required' });
    const records = await Credentialing.findAll({
      where: { employerEmail },
      order: [['createdAt', 'DESC']]
    });
    res.json(records);
  } catch (err) {
    console.error('Credentialing GET error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET eligible hired candidates (not yet in credentialing)
router.get('/eligible', async (req, res) => {
  try {
    const { employerEmail } = req.query;
    if (!employerEmail) return res.status(400).json({ error: 'employerEmail required' });

    const hiredApps = await Application.findAll({
      where: { employerEmail, status: 'hired' },
      order: [['createdAt', 'DESC']]
    });

    // Filter out already credentialed
    const existing = await Credentialing.findAll({ where: { employerEmail } });
    const existingAppIds = new Set(existing.map(c => c.applicationId?.toString()));
    const existingEmails = new Set(existing.map(c => c.candidateEmail));

    const eligible = hiredApps.filter(app =>
      !existingAppIds.has((app.id || app._id)?.toString()) &&
      !existingEmails.has(app.candidateEmail)
    );

    res.json(eligible);
  } catch (err) {
    console.error('Credentialing eligible GET error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST create new credentialing record
router.post('/', async (req, res) => {
  try {
    const { employerEmail, candidateName, candidateEmail, jobTitle, applicationId, verificationStatus, onboardingStatus, billingRate, totalHours } = req.body;
    if (!employerEmail || !candidateEmail) return res.status(400).json({ error: 'employerEmail and candidateEmail required' });

    // Prevent duplicates
    const existing = await Credentialing.findOne({ where: { employerEmail, candidateEmail } });
    if (existing) return res.status(409).json({ error: 'Candidate already in credentialing' });

    const record = await Credentialing.create({
      employerEmail, candidateName, candidateEmail, jobTitle,
      applicationId: applicationId || null,
      verificationStatus: verificationStatus || 'pending',
      onboardingStatus: onboardingStatus || 'not-started',
      billingRate: billingRate || 0,
      totalHours: totalHours || 0,
      onboardingChecklist: [],
      timesheets: [],
      invoices: []
    });
    res.status(201).json(record);
  } catch (err) {
    console.error('Credentialing POST error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT verify/reject candidate
router.put('/:id/verify', async (req, res) => {
  try {
    const { id } = req.params;
    const { verificationStatus } = req.body;
    const record = await Credentialing.findByPk(id);
    if (!record) return res.status(404).json({ error: 'Record not found' });
    await record.update({ verificationStatus });
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET onboarding checklist
router.get('/:id/onboarding', async (req, res) => {
  try {
    const record = await Credentialing.findByPk(req.params.id);
    if (!record) return res.status(404).json({ error: 'Record not found' });
    res.json({ completedItems: record.onboardingChecklist || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update onboarding checklist
router.put('/:id/onboarding', async (req, res) => {
  try {
    const { completedItems } = req.body;
    const record = await Credentialing.findByPk(req.params.id);
    if (!record) return res.status(404).json({ error: 'Record not found' });
    const status = completedItems.length === 0 ? 'not-started'
      : completedItems.length >= 8 ? 'completed' : 'in-progress';
    await record.update({ onboardingChecklist: completedItems, onboardingStatus: status });
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET timesheets for a week
router.get('/:id/timesheets', async (req, res) => {
  try {
    const { week } = req.query;
    const record = await Credentialing.findByPk(req.params.id);
    if (!record) return res.status(404).json({ error: 'Record not found' });
    const sheets = record.timesheets || [];
    const sheet = sheets.find(s => s.week === week) || {
      week, monday: 0, tuesday: 0, wednesday: 0, thursday: 0, friday: 0, saturday: 0, sunday: 0
    };
    res.json(sheet);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update timesheet
router.put('/:id/timesheets', async (req, res) => {
  try {
    const record = await Credentialing.findByPk(req.params.id);
    if (!record) return res.status(404).json({ error: 'Record not found' });
    const sheets = record.timesheets || [];
    const { week } = req.body;
    const idx = sheets.findIndex(s => s.week === week);
    if (idx >= 0) sheets[idx] = req.body;
    else sheets.push(req.body);
    const totalHours = sheets.reduce((sum, s) => {
      return sum + ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']
        .reduce((d, day) => d + (Number(s[day]) || 0), 0);
    }, 0);
    await record.update({ timesheets: sheets, totalHours });
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET billing
router.get('/:id/billing', async (req, res) => {
  try {
    const record = await Credentialing.findByPk(req.params.id);
    if (!record) return res.status(404).json({ error: 'Record not found' });
    res.json({ rate: record.billingRate, hours: record.totalHours, invoices: record.invoices || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update billing
router.put('/:id/billing', async (req, res) => {
  try {
    const { rate, hours } = req.body;
    const record = await Credentialing.findByPk(req.params.id);
    if (!record) return res.status(404).json({ error: 'Record not found' });
    await record.update({ billingRate: rate || 0, totalHours: hours || 0 });
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST generate invoice
router.post('/:id/billing/invoice', async (req, res) => {
  try {
    const record = await Credentialing.findByPk(req.params.id);
    if (!record) return res.status(404).json({ error: 'Record not found' });
    const { rate, hours } = req.body;
    const invoices = record.invoices || [];
    const invoice = {
      invoiceNumber: `INV-${Date.now()}`,
      date: new Date().toISOString(),
      rate: rate || record.billingRate,
      hours: hours || record.totalHours,
      amount: (rate || record.billingRate) * (hours || record.totalHours),
      candidateName: record.candidateName,
      jobTitle: record.jobTitle
    };
    invoices.unshift(invoice);
    await record.update({ invoices });
    res.status(201).json(invoice);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE credentialing record
router.delete('/:id', async (req, res) => {
  try {
    const record = await Credentialing.findByPk(req.params.id);
    if (!record) return res.status(404).json({ error: 'Record not found' });
    await record.destroy();
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
