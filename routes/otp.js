import express from 'express';
import { body, validationResult } from 'express-validator';
import { sendOTPEmail, verifyOTP, resendOTP } from '../services/otpService.js';
import User from '../models/User.js';
import { Op } from 'sequelize';
import { enhanceValidationErrors } from '../utils/errorSuggestions.js';

const router = express.Router();

// POST /api/otp/send - Send OTP to email
router.post('/send', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('name').optional(),
  body('userType').optional(),
  body('type').optional().isIn(['registration', 'email_verification', 'password_reset']).withMessage('Valid type is required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: enhanceValidationErrors(errors) });
    }

    const { email, name, userType, type } = req.body;

    // For registration OTP, check if email already exists
    if (type !== 'email_verification') {
      const existingUser = await User.findOne({ 
        where: { email: { [Op.iLike]: email } }
      });
      
      if (existingUser && existingUser.isActive) {
        return res.status(400).json({ error: 'Email already registered' });
      }
    }

    const result = await sendOTPEmail(email, name, userType || 'candidate');
    
    if (result.success) {
      res.json({ 
        success: true, 
        message: 'Verification code sent to your email' 
      });
    } else {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to send verification code' 
      });
    }
  } catch (error) {
    console.error('❌ Send OTP error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/otp/verify - Verify OTP
router.post('/verify', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('otp').isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits'),
  body('type').optional().isIn(['registration', 'email_verification', 'password_reset']).withMessage('Valid type is required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, otp, type } = req.body;

    const result = verifyOTP(email, otp);
    
    if (result.success) {
      // If email_verification type, update user's emailVerified field
      if (type === 'email_verification') {
        const user = await User.findOne({ where: { email: { [Op.iLike]: email } } });
        if (user) {
          await user.update({ emailVerified: true, verificationStatus: 'verified' });
        }
      }
      res.json({ 
        success: true, 
        message: 'Email verified successfully',
        verified: true
      });
    } else {
      res.status(400).json({ 
        success: false, 
        error: result.error,
        verified: false
      });
    }
  } catch (error) {
    console.error('❌ Verify OTP error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/otp/resend - Resend OTP
router.post('/resend', [
  body('email').isEmail().withMessage('Valid email is required'),
  body('name').optional(),
  body('userType').optional(),
  body('type').optional().isIn(['registration', 'email_verification', 'password_reset']).withMessage('Valid type is required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, name, userType, type } = req.body;

    const result = await resendOTP(email, name, userType || 'candidate');
    
    if (result.success) {
      res.json({ 
        success: true, 
        message: 'New verification code sent to your email' 
      });
    } else {
      res.status(400).json({ 
        success: false, 
        error: result.error 
      });
    }
  } catch (error) {
    console.error('❌ Resend OTP error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
