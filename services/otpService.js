import nodemailer from 'nodemailer';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { baseTemplate, divider } from './emailTemplates.js';

dotenv.config();

const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const MAX_VERIFY_ATTEMPTS = 5;
const MAX_RESEND_REQUESTS = 3;
const RESEND_COOLDOWN_MS = 60 * 1000; // 1 minute

const getTransporter = () => nodemailer.createTransport({
  host: process.env.SMTP_SERVER || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_EMAIL || process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  },
  tls: { rejectUnauthorized: false }
});

// In-memory OTP storage (use Redis in production)
const otpStore = new Map();

// Generate 6-digit OTP
const generateOTP = () => {
  return crypto.randomInt(100000, 999999).toString();
};

// Store OTP with 10 minute expiry
const storeOTP = (email, otp, resendCount = 0) => {
  const expiresAt = Date.now() + OTP_EXPIRY_MS;
  otpStore.set(email.toLowerCase(), { otp, expiresAt, attempts: 0, resendCount });
  console.log(`✅ OTP stored for ${email} (expires in 10 min)`);
};

// Verify OTP
export const verifyOTP = (email, otp) => {
  const key = email.toLowerCase();
  const stored = otpStore.get(key);

  if (!stored) {
    return { success: false, error: 'OTP not found or expired' };
  }

  if (Date.now() > stored.expiresAt) {
    otpStore.delete(key);
    return { success: false, error: 'OTP expired' };
  }

  if (stored.attempts >= MAX_VERIFY_ATTEMPTS) {
    otpStore.delete(key);
    return { success: false, error: 'Too many failed attempts' };
  }

  if (stored.otp !== otp) {
    stored.attempts++;
    return { success: false, error: 'Invalid OTP' };
  }

  otpStore.delete(key);
  return { success: true };
};

// Build the OTP email HTML + subject for both initial send and resend
const buildOTPEmail = (name, userType, otp, isResend, purpose = 'registration') => {
  const digits = otp.split('').map(d =>
    `<span style="display:inline-block;width:44px;height:52px;line-height:52px;text-align:center;background:#F5F3FF;border:2px solid #4F46E5;border-radius:10px;color:#4F46E5;font-size:26px;font-weight:800;margin:0 4px;font-family:'Courier New',monospace;">${d}</span>`
  ).join('');

  const content = `
    <!-- Hero -->
    <div style="background:linear-gradient(135deg,#4F46E5 0%,#7C3AED 100%);padding:36px 40px;text-align:center;">
      <div style="margin-bottom:10px;"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" stroke="white" stroke-width="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
      <h1 style="color:#FFFFFF;font-size:22px;font-weight:800;margin:0 0 6px;">Verify Your Email</h1>
      <p style="color:rgba(255,255,255,0.85);font-size:14px;margin:0;">${isResend ? 'New verification code' : 'One-time verification code'}</p>
    </div>

    <!-- Body -->
    <div style="padding:36px 40px;">
      <h2 style="color:#1F2937;font-size:18px;margin:0 0 10px;">Hi ${name || 'there'}!</h2>
      <p style="color:#4B5563;font-size:15px;line-height:1.7;margin:0 0 28px;">
        ${purpose === 'email_change'
    ? 'We received a request to change the email address associated with your ZyncJobs account. To verify your new email address and complete the update, please use the verification code below.'
    : isResend
    ? 'Here is your new verification code to update your email on ZyncJobs.'
    : `Use the code below to verify your email and complete your ${userType === 'employer' ? 'employer' : 'job seeker'} registration on ZyncJobs.`}
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
      <p style="color:#9CA3AF;font-size:13px;text-align:center;margin:0;">${purpose === 'email_change'
        ? 'If you did not request this email change, you can safely ignore this email. Your account will remain unchanged unless the verification code is successfully entered.'
        : "Didn't request this? You can safely ignore this email."}</p>
    </div>`;

  return {
    subject: isResend ? 'Your new ZyncJobs verification code' : `${otp} is your ZyncJobs verification code`,
    html: baseTemplate(content, isResend
      ? 'Your new ZyncJobs verification code. Valid for 10 minutes.'
      : `Your ZyncJobs OTP is ${otp}. Valid for 10 minutes.`)
  };
};

// Deliver the OTP email (shared by send + resend)
const deliverOTPEmail = async (email, name, userType, otp, isResend, purpose = 'registration') => {
  const { subject, html } = buildOTPEmail(name, userType, otp, isResend, purpose);
  const fromEmail = process.env.SMTP_EMAIL || process.env.SMTP_USER;
  const transporter = getTransporter();
  await transporter.sendMail({
    from: `"ZyncJobs" <${fromEmail}>`,
    replyTo: fromEmail,
    to: email,
    subject,
    html
  });
};

// Send OTP email
export const sendOTPEmail = async (email, name, userType, purpose = 'registration') => {
  try {
    const otp = generateOTP();
    storeOTP(email, otp);

    await deliverOTPEmail(email, name, userType, otp, false, purpose);
    console.log('✅ OTP email sent to:', email);
    return { success: true, message: 'OTP sent successfully' };
  } catch (error) {
    console.error('❌ OTP email error:', error);
    return { success: false, error: error.message };
  }
};

// Resend OTP
export const resendOTP = async (email, name, userType, purpose = 'registration') => {
  const key = email.toLowerCase();
  const stored = otpStore.get(key);

  if (stored && stored.resendCount >= MAX_RESEND_REQUESTS) {
    return { success: false, error: 'Maximum resend attempts reached. Please request a new code.' };
  }

  if (stored && (Date.now() - (stored.expiresAt - OTP_EXPIRY_MS)) < RESEND_COOLDOWN_MS) {
    return { success: false, error: 'Please wait 1 minute before requesting a new code' };
  }

  // Preserve the resendCount before storeOTP resets it
  const nextResendCount = stored ? stored.resendCount + 1 : 1;

  // Generate new OTP, invalidate previous, and carry forward the resend counter
  const otp = generateOTP();
  storeOTP(email, otp, nextResendCount);

  try {
    await deliverOTPEmail(email, name, userType, otp, true, purpose);
    console.log('✅ Resend OTP email sent to:', email);
    return { success: true, message: 'New verification code sent successfully' };
  } catch (error) {
    console.error('❌ Resend OTP email error:', error);
    return { success: false, error: error.message };
  }
};
