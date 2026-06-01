import express from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// GET /api/company-verification/check-domain?domain=example.com
// Check if any user from this domain is already verified
router.get('/check-domain', async (req, res) => {
  try {
    const { domain } = req.query;
    if (!domain) return res.status(400).json({ error: 'domain required' });

    const verifiedUser = await User.findOne({
      where: {
        companyDomain: domain,
        verificationStatus: 'verified',
        role: 'employer'
      }
    });

    res.json({
      hasVerifiedCompany: !!verifiedUser,
      domain
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/company-verification/auto-verify/:userId
// Auto-verify user if their company domain is already verified
router.put('/auto-verify/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const domain = user.email.split('@')[1];
    
    // Check if any user from this domain is already verified
    const verifiedUser = await User.findOne({
      where: {
        companyDomain: domain,
        verificationStatus: 'verified',
        role: 'employer'
      }
    });

    if (!verifiedUser) {
      return res.status(400).json({ 
        error: 'No verified company found for this domain',
        canAutoVerify: false 
      });
    }

    // Auto-verify the user
    await user.update({
      verificationStatus: 'verified',
      verifiedAt: new Date(),
      verifiedBy: 'auto_company_domain',
      companyDomain: domain,
      domainVerificationMethod: 'company_domain_bypass'
    });

    res.json({
      success: true,
      message: 'User auto-verified based on company domain',
      verificationStatus: 'verified'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/company-verification/change-password
// Change password for team members
router.put('/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // For first-time login, skip current password check
    if (!user.isFirstLogin) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'Current password required' });
      }

      const isValidPassword = await bcrypt.compare(currentPassword, user.password);
      if (!isValidPassword) {
        return res.status(400).json({ error: 'Current password is incorrect' });
      }
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await user.update({
      password: hashedPassword,
      isFirstLogin: false
    });

    res.json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;