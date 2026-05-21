import express from 'express';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

const router = express.Router();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_SERVER,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_EMAIL,
    pass: process.env.SMTP_PASSWORD
  }
});

// POST /api/contact
router.post('/', async (req, res) => {
  const { name, email, subject, message } = req.body;

  if (!name || !email || !subject || !message) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    const { baseTemplate, infoBox, divider, FRONTEND_URL } = await import('./emailTemplates.js');

    // Email to admin
    const adminContent = `
      <div style="background:linear-gradient(175deg,#5C6BC8 0%,#4A58B8 50%,#6878D0 100%);padding:28px 32px;text-align:center;">
        <div style="margin-bottom:10px;"><svg width="44" height="44" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
        <h1 style="color:#FFFFFF;font-size:22px;font-weight:800;margin:0 0 6px;">New Contact Message</h1>
        <p style="color:rgba(255,255,255,0.85);font-size:14px;margin:0;">Received via ZyncJobs contact form</p>
      </div>
      <div style="padding:32px 36px;">
        ${infoBox(`
          <table cellpadding="0" cellspacing="0" width="100%">
            <tr><td style="padding:5px 0;width:80px;"><span style="color:#6B7280;font-size:13px;">Name</span></td><td style="padding:5px 0;"><strong style="color:#1F2937;font-size:14px;">${name}</strong></td></tr>
            <tr><td style="padding:5px 0;"><span style="color:#6B7280;font-size:13px;">Email</span></td><td style="padding:5px 0;"><a href="mailto:${email}" style="color:#5C6BC8;font-size:14px;">${email}</a></td></tr>
            <tr><td style="padding:5px 0;"><span style="color:#6B7280;font-size:13px;">Subject</span></td><td style="padding:5px 0;"><strong style="color:#1F2937;font-size:14px;">${subject}</strong></td></tr>
          </table>
        `)}
        <p style="color:#1F2937;font-size:13px;font-weight:700;margin:16px 0 8px;">Message:</p>
        <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:10px;padding:16px 18px;">
          <p style="color:#4B5563;font-size:14px;line-height:1.7;margin:0;">${message.replace(/\n/g, '<br>')}</p>
        </div>
        ${divider()}
        <p style="color:#9CA3AF;font-size:12px;text-align:center;margin:0;">This message was sent via the ZyncJobs contact form.</p>
      </div>`;

    await transporter.sendMail({
      from: `"ZyncJobs Contact" <${process.env.SMTP_EMAIL}>`,
      to: process.env.SMTP_EMAIL,
      replyTo: email,
      subject: `[Contact Form] ${subject}`,
      html: baseTemplate(adminContent, `New contact message from ${name}`)
    });

    // Auto-reply to sender
    const replyContent = `
      <div style="background:linear-gradient(175deg,#5C6BC8 0%,#4A58B8 50%,#6878D0 100%);padding:28px 32px;text-align:center;">
        <div style="margin-bottom:10px;"><svg width="44" height="44" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><polyline points="20 6 9 17 4 12" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
        <h1 style="color:#FFFFFF;font-size:22px;font-weight:800;margin:0 0 6px;">Message Received!</h1>
        <p style="color:rgba(255,255,255,0.85);font-size:14px;margin:0;">We'll get back to you within 24 hours</p>
      </div>
      <div style="padding:32px 36px;">
        <h2 style="color:#1F2937;font-size:18px;margin:0 0 10px;">Hi ${name}!</h2>
        <p style="color:#4B5563;font-size:15px;line-height:1.7;margin:0 0 20px;">Thank you for reaching out! We've received your message and will get back to you within <strong>24 hours</strong>.</p>
        ${infoBox(`<p style="color:#1F2937;font-size:13px;font-weight:700;margin:0 0 8px;">Your message:</p><p style="color:#4B5563;font-size:13px;line-height:1.6;margin:0;">${message.replace(/\n/g, '<br>')}</p>`)}
        ${divider()}
        <p style="color:#6B7280;font-size:13px;text-align:center;margin:0;">Need urgent help? Email us at <a href="mailto:Admin@zyncjobs.com" style="color:#5C6BC8;">Admin@zyncjobs.com</a></p>
      </div>`;

    await transporter.sendMail({
      from: `"ZyncJobs Support" <${process.env.SMTP_EMAIL}>`,
      to: email,
      subject: `We received your message — ${subject}`,
      html: baseTemplate(replyContent, `Hi ${name}, we received your message and will reply within 24 hours.`)
    });

    res.json({ success: true, message: 'Message sent successfully' });
  } catch (error) {
    console.error('❌ Contact form email error:', error);
    res.status(500).json({ error: 'Failed to send message. Please try again.' });
  }
});

export default router;
