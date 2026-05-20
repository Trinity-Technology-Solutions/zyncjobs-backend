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

    const { baseTemplate, ctaButton, divider, FRONTEND_URL } = await import('./emailTemplates.js');

    const digits = otp.split('').map(d =>
      `<span style="display:inline-block;width:44px;height:52px;line-height:52px;text-align:center;background:#F5F3FF;border:2px solid #4F46E5;border-radius:10px;color:#4F46E5;font-size:26px;font-weight:800;margin:0 4px;font-family:'Courier New',monospace;">${d}</span>`
    ).join('');

    const content = `
      <!-- Hero -->
      <div style="background:linear-gradient(135deg,#4F46E5 0%,#7C3AED 100%);padding:36px 40px;text-align:center;">
        <div style="margin-bottom:10px;"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" stroke="white" stroke-width="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
        <h1 style="color:#FFFFFF;font-size:22px;font-weight:800;margin:0 0 6px;">Verify Your Email</h1>
        <p style="color:rgba(255,255,255,0.85);font-size:14px;margin:0;">One-time verification code</p>
      </div>

      <!-- Body -->
      <div style="padding:36px 40px;">
        <h2 style="color:#1F2937;font-size:18px;margin:0 0 10px;">Hi ${name || 'there'}!</h2>
        <p style="color:#4B5563;font-size:15px;line-height:1.7;margin:0 0 28px;">
          Use the code below to verify your email and complete your ${userType === 'employer' ? 'employer' : 'job seeker'} registration on ZyncJobs.
        </p>

        <!-- OTP Box -->
        <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:14px;padding:28px;text-align:center;margin:0 0 24px;">
          <p style="color:#6B7280;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;margin:0 0 16px;">Your Verification Code</p>
          <div style="margin-bottom:16px;">${digits}</div>
          <p style="color:#9CA3AF;font-size:12px;margin:0;">Expires in <strong style="color:#EF4444;">10 minutes</strong></p>
        </div>

        <div style="background:#FEF3C7;border:1px solid #F59E0B;border-radius:10px;padding:14px 18px;margin-bottom:24px;">
          <p style="color:#92400E;font-size:13px;margin:0;">Never share this code with anyone. ZyncJobs will never ask for your OTP.</p>
        </div>

        ${divider()}
        <p style="color:#9CA3AF;font-size:13px;text-align:center;margin:0;">Didn't request this? You can safely ignore this email.</p>
      </div>`;

    await transporter.sendMail({
      from: `"ZyncJobs" <${process.env.SMTP_EMAIL}>`,
      to: email,
      subject: `${otp} is your ZyncJobs verification code`,
      html: baseTemplate(content, `Your ZyncJobs OTP is ${otp}. Valid for 10 minutes.`)
    });
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
