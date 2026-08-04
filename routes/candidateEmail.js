import express from 'express';
import { body, validationResult } from 'express-validator';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { sendOTPEmail, verifyOTP, resendOTP } from '../services/otpService.js';
import User from '../models/User.js';
import { Op } from 'sequelize';
import { authenticateToken } from '../middleware/auth.js';
import { enhanceValidationErrors } from '../utils/errorSuggestions.js';

const router = express.Router();

// Prevent abuse of email-triggering endpoints (per authenticated account).
// The OTP service additionally enforces resend cooldowns and resend limits.
const otpRequestLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === 'development',
  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req.ip),
  message: 'Too many verification code requests. Please try again later.'
});

// Map internal OTP service errors to user-facing messages
const mapOTPError = (error) => {
  if (!error) return 'Verification failed. Please try again.';
  if (error.includes('expired')) return 'Verification code expired. Please request a new one.';
  if (error.includes('Invalid OTP')) return 'Invalid verification code.';
  if (error.includes('Too many failed attempts')) return 'Too many failed attempts. Please request a new verification code.';
  if (error.includes('Maximum resend attempts')) return 'Maximum resend attempts reached. Please start over.';
  if (error.includes('not found')) return 'Verification code not found or expired. Please request a new one.';
  return error;
};

// POST /api/candidate/email/send-otp
router.post('/email/send-otp', authenticateToken, otpRequestLimiter, [
  body('newEmail').isEmail().normalizeEmail().withMessage('A valid new email address is required'),
  body('confirmEmail').isEmail().normalizeEmail().withMessage('A valid confirmation email address is required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: enhanceValidationErrors(errors) });
    }

    const { newEmail, confirmEmail } = req.body;
    const user = req.user;

    if (user.role !== 'candidate') {
      return res.status(403).json({ error: 'This feature is only available for candidate accounts' });
    }

    if (newEmail !== confirmEmail) {
      return res.status(400).json({ error: 'Email addresses do not match. Please check and try again.' });
    }

    if (newEmail.toLowerCase() === user.email.toLowerCase()) {
      return res.status(400).json({ error: 'New email must be different from your current email address.' });
    }

    const existingUser = await User.findOne({
      where: { email: { [Op.iLike]: newEmail }, id: { [Op.ne]: user.id } }
    });
    if (existingUser) {
      return res.status(400).json({ error: 'This email address is already registered to another account.' });
    }

    const result = await sendOTPEmail(newEmail, user.name, user.role, 'email_change');

    if (result.success) {
      res.json({ success: true, message: 'A verification code has been sent to your new email address.' });
    } else {
      res.status(500).json({ success: false, error: 'Failed to send verification code. Please try again.' });
    }
  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({ error: 'Failed to send verification code. Please try again.' });
  }
});

// POST /api/candidate/email/verify-otp
router.post('/email/verify-otp', authenticateToken, [
  body('newEmail').isEmail().normalizeEmail().withMessage('A valid email address is required'),
  body('otp').isLength({ min: 6, max: 6 }).isNumeric().withMessage('OTP must be a 6-digit code'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: enhanceValidationErrors(errors) });
    }

    const { newEmail, otp } = req.body;
    const user = req.user;

    if (user.role !== 'candidate') {
      return res.status(403).json({ error: 'This feature is only available for candidate accounts' });
    }

    // Double-check the email is still available before updating
    const existingUser = await User.findOne({
      where: { email: { [Op.iLike]: newEmail }, id: { [Op.ne]: user.id } }
    });
    if (existingUser) {
      return res.status(400).json({ error: 'This email address is already registered to another account.' });
    }

    const result = verifyOTP(newEmail, otp);

    if (result.success) {
      await user.update({ email: newEmail.toLowerCase(), emailVerified: true });
      res.json({ success: true, message: 'Your email address has been updated successfully.' });
    } else {
      res.status(400).json({ success: false, error: mapOTPError(result.error) });
    }
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ error: 'Verification failed. Please try again.' });
  }
});

// POST /api/candidate/email/resend-otp
router.post('/email/resend-otp', authenticateToken, otpRequestLimiter, [
  body('newEmail').isEmail().normalizeEmail().withMessage('A valid email address is required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: enhanceValidationErrors(errors) });
    }

    const { newEmail } = req.body;
    const user = req.user;

    if (user.role !== 'candidate') {
      return res.status(403).json({ error: 'This feature is only available for candidate accounts' });
    }

    if (newEmail.toLowerCase() === user.email.toLowerCase()) {
      return res.status(400).json({ error: 'New email must be different from your current email address.' });
    }

    const result = await resendOTP(newEmail, user.name, user.role, 'email_change');

    if (result.success) {
      res.json({ success: true, message: 'A new verification code has been sent to your new email address.' });
    } else {
      res.status(400).json({ success: false, error: mapOTPError(result.error) });
    }
  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({ error: 'Failed to resend verification code. Please try again.' });
  }
});

export default router;