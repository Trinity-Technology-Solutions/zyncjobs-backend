import crypto from 'crypto';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// In-memory OTP storage (in production, use Redis or database)
const otpStorage = new Map();

const createTransporter = () => nodemailer.createTransport({
  host: process.env.SMTP_SERVER,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_EMAIL,
    pass: process.env.SMTP_PASSWORD
  }
});

export class TeamOTPService {
  
  // Generate and send OTP to company owner
  static async sendTeamMemberOTP(teamMemberEmail, ownerEmail, memberName, companyName) {
    try {
      // Generate 6-digit OTP
      const otp = crypto.randomInt(100000, 999999).toString();
      const expiryTime = Date.now() + (5 * 60 * 1000); // 5 minutes
      
      // Store OTP with team member email as key
      otpStorage.set(teamMemberEmail.toLowerCase(), {
        otp,
        expiryTime,
        ownerEmail,
        memberName,
        companyName,
        attempts: 0
      });
      
      // Send OTP email to company owner
      const otpEmailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#dc2626 0%,#ef4444 100%);padding:32px 40px;text-align:center;">
            <img src="https://zyncjobs.com/images/zyncjobs-logo.png" alt="ZyncJobs" width="150" height="40" style="display:block;margin:0 auto 12px auto;max-width:150px;height:auto;" />
            <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700;">🔐 Team Member Login Verification</h1>
            <p style="color:#fecaca;margin:8px 0 0;font-size:14px;">Security verification required</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px;">
            <p style="color:#374151;font-size:16px;margin:0 0 8px;">Hi <strong>${companyName} Admin</strong>,</p>
            <p style="color:#6b7280;font-size:14px;margin:0 0 28px;">
              Your team member <strong>${memberName}</strong> (${teamMemberEmail}) is trying to login to the ${companyName} dashboard.
            </p>

            <!-- OTP Card -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#dc2626;border-radius:12px;overflow:hidden;margin-bottom:24px;">
              <tr>
                <td style="padding:20px 24px;text-align:center;">
                  <p style="color:#fecaca;font-size:11px;font-weight:700;letter-spacing:1px;margin:0 0 16px;text-transform:uppercase;">🔐 Verification Code</p>
                  
                  <div style="background:rgba(255,255,255,0.15);border-radius:8px;padding:16px;margin-bottom:16px;">
                    <p style="color:#fbbf24;font-size:32px;margin:0;font-family:monospace;font-weight:700;letter-spacing:8px;">${otp}</p>
                  </div>
                  
                  <p style="color:#fecaca;font-size:12px;margin:0;">This code expires in 5 minutes</p>
                </td>
              </tr>
            </table>

            <!-- Security Info -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef3c7;border:1px solid #fbbf24;border-radius:8px;margin-bottom:24px;">
              <tr>
                <td style="padding:12px 16px;">
                  <p style="color:#92400e;font-size:13px;margin:0;">⚠️ <strong>Security Notice:</strong> Only share this code with ${memberName} if you authorized their login attempt. Never share this code via email or phone.</p>
                </td>
              </tr>
            </table>

            <p style="color:#6b7280;font-size:13px;margin:0;">If you didn't authorize this login attempt, please ignore this email and consider reviewing your team member access.</p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #e5e7eb;">
            <p style="color:#9ca3af;font-size:12px;margin:0;">© 2025 ZyncJobs. All rights reserved.</p>
            <p style="color:#9ca3af;font-size:11px;margin:4px 0 0;">This is a security verification email for team member login.</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

      try {
        const transporter = createTransporter();
        await transporter.sendMail({
          from: `"ZyncJobs Security" <${process.env.SMTP_EMAIL}>`,
          to: ownerEmail,
          subject: `🔐 Team Login Verification - ${memberName} (${companyName})`,
          html: otpEmailHtml
        });
        console.log(`✅ OTP sent to company owner: ${ownerEmail} for team member: ${teamMemberEmail}`);
      } catch (emailError) {
        console.error('❌ OTP email failed:', emailError.message);
        otpStorage.delete(teamMemberEmail.toLowerCase());
        throw new Error('Failed to send verification code to company owner');
      }

      return { success: true, message: 'OTP sent to company owner', expiresIn: 300 };

    } catch (error) {
      console.error('❌ Failed to generate team member OTP:', error);
      throw error;
    }
  }
  
  // Verify OTP for team member login
  static verifyTeamMemberOTP(teamMemberEmail, providedOTP) {
    const otpData = otpStorage.get(teamMemberEmail.toLowerCase());
    
    if (!otpData) {
      return { success: false, error: 'No verification code found. Please request a new one.' };
    }
    
    // Check expiry
    if (Date.now() > otpData.expiryTime) {
      otpStorage.delete(teamMemberEmail.toLowerCase());
      return { success: false, error: 'Verification code expired. Please request a new one.' };
    }
    
    // Check attempts
    if (otpData.attempts >= 3) {
      otpStorage.delete(teamMemberEmail.toLowerCase());
      return { success: false, error: 'Too many failed attempts. Please request a new verification code.' };
    }
    
    // Verify OTP
    if (otpData.otp !== providedOTP.toString()) {
      otpData.attempts++;
      return { 
        success: false, 
        error: `Invalid verification code. ${3 - otpData.attempts} attempts remaining.`,
        attemptsLeft: 3 - otpData.attempts
      };
    }
    
    // OTP verified successfully
    otpStorage.delete(teamMemberEmail.toLowerCase());
    return { 
      success: true, 
      message: 'Verification successful',
      ownerEmail: otpData.ownerEmail,
      companyName: otpData.companyName
    };
  }
  
  // Clean expired OTPs (call this periodically)
  static cleanExpiredOTPs() {
    const now = Date.now();
    for (const [email, otpData] of otpStorage.entries()) {
      if (now > otpData.expiryTime) {
        otpStorage.delete(email);
      }
    }
  }
  
  // Get OTP status for team member
  static getOTPStatus(teamMemberEmail) {
    const otpData = otpStorage.get(teamMemberEmail.toLowerCase());
    
    if (!otpData) {
      return { exists: false };
    }
    
    const timeLeft = Math.max(0, otpData.expiryTime - Date.now());
    
    return {
      exists: true,
      timeLeft: Math.floor(timeLeft / 1000), // seconds
      attempts: otpData.attempts,
      maxAttempts: 3
    };
  }
}

// Clean expired OTPs every minute
setInterval(() => {
  TeamOTPService.cleanExpiredOTPs();
}, 60000);