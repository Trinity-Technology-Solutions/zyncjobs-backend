import express from 'express';
import Credentialing from '../models/Credentialing.js';
import Application from '../models/Application.js';

const router = express.Router();

const DEFAULT_CHECKLIST = [
  'Offer Letter Signed',
  'ID Proof Submitted',
  'Address Proof Submitted',
  'Bank Details Submitted',
  'NDA Signed',
  'Background Check Completed',
  'Equipment Assigned',
  'System Access Granted',
];

const DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];

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
    const existing = await Credentialing.findAll({ where: { employerEmail } });
    const existingAppIds = new Set(existing.map(c => c.applicationId?.toString()));
    const existingEmails = new Set(existing.map(c => c.candidateEmail));
    const eligible = hiredApps.filter(app =>
      !existingAppIds.has((app.id || app._id)?.toString()) &&
      !existingEmails.has(app.candidateEmail)
    );
    res.json(eligible);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create new credentialing record
router.post('/', async (req, res) => {
  try {
    const { employerEmail, candidateName, candidateEmail, jobTitle, applicationId } = req.body;
    if (!employerEmail || !candidateEmail) return res.status(400).json({ error: 'employerEmail and candidateEmail required' });
    const existing = await Credentialing.findOne({ where: { employerEmail, candidateEmail } });
    if (existing) return res.status(409).json({ error: 'Candidate already in credentialing' });
    const record = await Credentialing.create({
      employerEmail, candidateName, candidateEmail,
      jobTitle: jobTitle || 'Position',
      applicationId: applicationId || null,
      verificationStatus: 'pending',
      onboardingStatus: 'not-started',
      billingRate: 0, totalHours: 0, taxRate: 0, currency: 'INR',
      onboardingChecklist: [], checklistItems: [], timesheets: [], invoices: []
    });
    res.status(201).json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT verify/reject candidate
router.put('/:id/verify', async (req, res) => {
  try {
    const record = await Credentialing.findByPk(req.params.id);
    if (!record) return res.status(404).json({ error: 'Record not found' });
    await record.update({ verificationStatus: req.body.verificationStatus });
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Onboarding ──────────────────────────────────────────────────────────────

// GET onboarding data (checklist items + completed items)
router.get('/:id/onboarding', async (req, res) => {
  try {
    const record = await Credentialing.findByPk(req.params.id);
    if (!record) return res.status(404).json({ error: 'Record not found' });
    const items = (record.checklistItems && record.checklistItems.length > 0)
      ? record.checklistItems : DEFAULT_CHECKLIST;
    res.json({ completedItems: record.onboardingChecklist || [], checklistItems: items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update onboarding checklist completed items
router.put('/:id/onboarding', async (req, res) => {
  try {
    const { completedItems } = req.body;
    const record = await Credentialing.findByPk(req.params.id);
    if (!record) return res.status(404).json({ error: 'Record not found' });
    const items = (record.checklistItems && record.checklistItems.length > 0)
      ? record.checklistItems : DEFAULT_CHECKLIST;
    const total = items.length;
    const status = completedItems.length === 0 ? 'not-started'
      : completedItems.length >= total ? 'completed' : 'in-progress';
    record.onboardingChecklist = [...completedItems];
    record.onboardingStatus = status;
    record.changed('onboardingChecklist', true);
    await record.save();
    res.json({ completedItems: record.onboardingChecklist, onboardingStatus: status, checklistItems: items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update custom checklist items for this candidate
router.put('/:id/checklist-items', async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: 'items must be an array' });
    const record = await Credentialing.findByPk(req.params.id);
    if (!record) return res.status(404).json({ error: 'Record not found' });
    record.checklistItems = [...items];
    record.changed('checklistItems', true);
    // Reset completed items that no longer exist in the new list
    const validCompleted = (record.onboardingChecklist || []).filter(i => items.includes(i));
    record.onboardingChecklist = validCompleted;
    record.changed('onboardingChecklist', true);
    await record.save();
    res.json({ checklistItems: record.checklistItems, completedItems: record.onboardingChecklist });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Timesheets ──────────────────────────────────────────────────────────────

// GET all timesheets (all weeks) for a candidate
router.get('/:id/timesheets/all', async (req, res) => {
  try {
    const record = await Credentialing.findByPk(req.params.id);
    if (!record) return res.status(404).json({ error: 'Record not found' });
    res.json(record.timesheets || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET timesheet for a specific week
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

// PUT update timesheet for a week
router.put('/:id/timesheets', async (req, res) => {
  try {
    const record = await Credentialing.findByPk(req.params.id);
    if (!record) return res.status(404).json({ error: 'Record not found' });
    const sheets = [...(record.timesheets || [])];
    const { week } = req.body;
    const idx = sheets.findIndex(s => s.week === week);
    if (idx >= 0) sheets[idx] = { ...req.body };
    else sheets.push({ ...req.body });
    const totalHours = sheets.reduce((sum, s) =>
      sum + DAYS.reduce((d, day) => d + (Number(s[day]) || 0), 0), 0);
    record.timesheets = sheets;
    record.totalHours = totalHours;
    record.changed('timesheets', true);
    await record.save();
    res.json({ sheet: sheets.find(s => s.week === week), totalHours, allSheets: sheets });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Billing ──────────────────────────────────────────────────────────────────

// GET billing details
router.get('/:id/billing', async (req, res) => {
  try {
    const record = await Credentialing.findByPk(req.params.id);
    if (!record) return res.status(404).json({ error: 'Record not found' });
    res.json({
      rate: record.billingRate,
      hours: record.totalHours,
      taxRate: record.taxRate || 0,
      currency: record.currency || 'INR',
      invoices: record.invoices || []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update billing settings (rate, hours, tax, currency)
router.put('/:id/billing', async (req, res) => {
  try {
    const { rate, hours, taxRate, currency } = req.body || {};
    const record = await Credentialing.findByPk(req.params.id);
    if (!record) return res.status(404).json({ error: 'Record not found' });
    const updates = {};
    if (rate !== undefined && rate !== '') updates.billingRate = Number(rate) || 0;
    if (hours !== undefined && hours !== '') updates.totalHours = Number(hours) || 0;
    if (taxRate !== undefined && taxRate !== '') updates.taxRate = Number(taxRate) || 0;
    if (currency) updates.currency = currency;
    await record.update(updates);
    res.json({ rate: record.billingRate, hours: record.totalHours, taxRate: record.taxRate, currency: record.currency, invoices: record.invoices || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST generate invoice
router.post('/:id/billing/invoice', async (req, res) => {
  try {
    const record = await Credentialing.findByPk(req.params.id);
    if (!record) return res.status(404).json({ error: 'Record not found' });
    const { rate, hours, taxRate, currency, notes } = req.body;
    const effectiveRate = Number(rate) || record.billingRate || 0;
    const effectiveHours = Number(hours) || record.totalHours || 0;
    const effectiveTax = Number(taxRate) ?? record.taxRate ?? 0;
    const effectiveCurrency = currency || record.currency || 'INR';
    const subtotal = effectiveRate * effectiveHours;
    const taxAmount = subtotal * (effectiveTax / 100);
    const invoice = {
      invoiceNumber: `INV-${Date.now()}`,
      date: new Date().toISOString(),
      rate: effectiveRate,
      hours: effectiveHours,
      subtotal,
      taxRate: effectiveTax,
      taxAmount,
      amount: subtotal + taxAmount,
      currency: effectiveCurrency,
      candidateName: record.candidateName,
      jobTitle: record.jobTitle,
      status: 'unpaid',
      notes: notes || '',
    };
    const updatedInvoices = [invoice, ...(record.invoices || [])];
    record.invoices = updatedInvoices;
    record.changed('invoices', true);
    await record.save();
    res.status(201).json({ invoice, invoices: updatedInvoices });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update invoice status (paid / unpaid / void)
router.put('/:id/billing/invoice/:invoiceNumber', async (req, res) => {
  try {
    const { status, notes } = req.body;
    const record = await Credentialing.findByPk(req.params.id);
    if (!record) return res.status(404).json({ error: 'Record not found' });
    const invoices = [...(record.invoices || [])];
    const idx = invoices.findIndex(inv => inv.invoiceNumber === req.params.invoiceNumber);
    if (idx === -1) return res.status(404).json({ error: 'Invoice not found' });
    invoices[idx] = { ...invoices[idx], ...(status && { status }), ...(notes !== undefined && { notes }) };
    record.invoices = invoices;
    record.changed('invoices', true);
    await record.save();
    res.json({ invoice: invoices[idx], invoices });
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
