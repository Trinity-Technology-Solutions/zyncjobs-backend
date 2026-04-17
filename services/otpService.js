import nodemailer from 'nodemailer';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_SERVER,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_EMAIL,
    pass: process.env.SMTP_PASSWORD
  }
});

// In-memory OTP storage (use Redis in production)
const otpStore = new Map();

// Generate 6-digit OTP
export const generateOTP = () => {
  return crypto.randomInt(100000, 999999).toString();
};

// Store OTP with 10 minute expiry
export const storeOTP = (email, otp) => {
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
  otpStore.set(email.toLowerCase(), { otp, expiresAt, attempts: 0 });
  console.log(`✅ OTP stored for ${email}: ${otp} (expires in 10 min)`);
};

// Verify OTP
export const verifyOTP = (email, otp) => {
  const stored = otpStore.get(email.toLowerCase());
  
  if (!stored) {
    return { success: false, error: 'OTP not found or expired' };
  }
  
  if (Date.now() > stored.expiresAt) {
    otpStore.delete(email.toLowerCase());
    return { success: false, error: 'OTP expired' };
  }
  
  if (stored.attempts >= 3) {
    otpStore.delete(email.toLowerCase());
    return { success: false, error: 'Too many failed attempts' };
  }
  
  if (stored.otp !== otp) {
    stored.attempts++;
    return { success: false, error: 'Invalid OTP' };
  }
  
  otpStore.delete(email.toLowerCase());
  return { success: true };
};

// Send OTP email
export const sendOTPEmail = async (email, name, userType) => {
  try {
    const otp = generateOTP();
    storeOTP(email, otp);
    
    const mailOptions = {
      from: `"ZyncJobs" <${process.env.SMTP_EMAIL}>`,
      to: email,
      subject: 'ZyncJobs - Email Verification Code',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #6366f1; padding: 30px 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">ZyncJobs</h1>
          </div>
          
          <div style="padding: 40px 30px; background-color: white;">
            <h2 style="color: #333;">Email Verification</h2>
            
            <p style="color: #555; font-size: 16px;">
              Hello ${name || 'there'}! 👋
            </p>
            
            <p style="color: #555; font-size: 16px;">
              Thank you for registering as a ${userType === 'employer' ? 'Employer' : 'Job Seeker'} on ZyncJobs.
            </p>
            
            <p style="color: #555; font-size: 16px;">
              Your verification code is:
            </p>
            
            <div style="background-color: #f0f9ff; padding: 20px; border-radius: 8px; text-align: center; margin: 30px 0;">
              <h1 style="color: #6366f1; font-size: 48px; letter-spacing: 8px; margin: 0; font-family: 'Courier New', monospace;">
                ${otp}
              </h1>
            </div>
            
            <p style="color: #888; font-size: 14px;">
              This code will expire in <strong>10 minutes</strong>.
            </p>
            
            <p style="color: #888; font-size: 14px;">
              If you didn't request this code, please ignore this email.
            </p>
          </div>
          
          <div style="background-color: #f1f1f1; padding: 20px; text-align: center;">
            <p style="color: #666; margin: 0; font-size: 12px;">© 2025 ZyncJobs. All rights reserved.</p>
          </div>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log('✅ OTP email sent to:', email);
    return { success: true, message: 'OTP sent successfully' };
  } catch (error) {
    console.error('❌ OTP email error:', error);
    return { success: false, error: error.message };
  }
};

// Resend OTP
export const resendOTP = async (email, name, userType) => {
  const stored = otpStore.get(email.toLowerCase());
  
  // Allow resend only after 1 minute
  if (stored && (Date.now() - (stored.expiresAt - 10 * 60 * 1000)) < 60000) {
    return { success: false, error: 'Please wait 1 minute before requesting a new code' };
  }
  
  return await sendOTPEmail(email, name, userType);
};

export default { generateOTP, storeOTP, verifyOTP, sendOTPEmail, resendOTP };
