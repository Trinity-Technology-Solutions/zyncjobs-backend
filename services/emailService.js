import nodemailer from 'nodemailer';
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

// Send job application confirmation email
export const sendJobApplicationEmail = async (candidateEmail, candidateName, jobTitle, company) => {
  try {
    const { baseTemplate, ctaButton, infoBox, divider, FRONTEND_URL } = await import('./emailTemplates.js');
    const name = candidateName || 'there';

    const content = `
      <!-- Hero -->
      <div style="background:linear-gradient(135deg,#4F46E5 0%,#7C3AED 100%);padding:36px 40px;text-align:center;">
        <div style="font-size:44px;margin-bottom:10px;">💼</div>
        <h1 style="color:#FFFFFF;font-size:22px;font-weight:800;margin:0 0 6px;">Application Received!</h1>
        <p style="color:rgba(255,255,255,0.85);font-size:14px;margin:0;">We've got your application</p>
      </div>

      <!-- Body -->
      <div style="padding:36px 40px;">
        <h2 style="color:#1F2937;font-size:18px;margin:0 0 10px;">Hi ${name}! 👋</h2>
        <p style="color:#4B5563;font-size:15px;line-height:1.7;margin:0 0 20px;">
          Great news — your application has been successfully submitted. The hiring team will review it and get back to you soon.
        </p>

        ${infoBox(`
          <table cellpadding="0" cellspacing="0" width="100%">
            <tr><td style="padding:4px 0;"><span style="color:#6B7280;font-size:13px;">Position</span></td><td style="padding:4px 0;"><strong style="color:#1F2937;font-size:14px;">${jobTitle}</strong></td></tr>
            <tr><td style="padding:4px 0;"><span style="color:#6B7280;font-size:13px;">Company</span></td><td style="padding:4px 0;"><strong style="color:#1F2937;font-size:14px;">${company}</strong></td></tr>
            <tr><td style="padding:4px 0;"><span style="color:#6B7280;font-size:13px;">Status</span></td><td style="padding:4px 0;"><span style="background:#EFF6FF;color:#3B82F6;border-radius:20px;padding:3px 12px;font-size:12px;font-weight:700;">📋 Under Review</span></td></tr>
          </table>
        `)}

        <p style="color:#4B5563;font-size:14px;line-height:1.7;">
          💡 <strong>Tip:</strong> While you wait, strengthen your profile and explore more matching jobs on ZyncJobs.
        </p>

        ${divider()}

        <div style="text-align:center;margin:24px 0;">
          ${ctaButton('🔍 Track Your Application', `${FRONTEND_URL}/my-applications`)}
          <p style="margin:12px 0 0;"><a href="${FRONTEND_URL}/job-listings" style="color:#4F46E5;font-size:13px;text-decoration:none;">Browse more jobs →</a></p>
        </div>
      </div>`;

    await transporter.sendMail({
      from: `"ZyncJobs" <${process.env.SMTP_EMAIL}>`,
      to: candidateEmail,
      subject: `✅ Application Submitted — ${jobTitle} at ${company}`,
      html: baseTemplate(content, `Your application for ${jobTitle} at ${company} has been received.`)
    });
    console.log('✅ Application confirmation email sent to:', candidateEmail);
    return { success: true };
  } catch (error) {
    console.error('❌ Email error:', error);
    return { success: false, error: error.message };
  }
};

// Send application rejection email (supports optional AI feedback)
export const sendApplicationRejectionEmail = async (candidateEmail, candidateName, jobTitle, company, aiFeedback = null, aiReasons = [], employerEmail = null, employerName = null) => {
  try {
    const { baseTemplate, ctaButton, infoBox, divider, FRONTEND_URL } = await import('./emailTemplates.js');
    const name = candidateName || 'there';

    const reasonsHtml = aiReasons.length ? `
      <div style="margin:16px 0;">
        <p style="color:#1F2937;font-size:14px;font-weight:700;margin:0 0 8px;">📝 Areas to strengthen:</p>
        ${aiReasons.map(r => `<p style="color:#4B5563;font-size:13px;margin:4px 0;padding-left:16px;">• ${r}</p>`).join('')}
      </div>` : '';

    const feedbackHtml = aiFeedback ? `
      ${infoBox(`<p style="color:#1F2937;font-size:14px;font-weight:700;margin:0 0 6px;">🤖 AI Feedback</p><p style="color:#4B5563;font-size:13px;margin:0;line-height:1.6;">${aiFeedback}</p>`, '#8B5CF6')}` : '';

    const content = `
      <!-- Hero -->
      <div style="background:linear-gradient(135deg,#6B7280 0%,#4B5563 100%);padding:36px 40px;text-align:center;">
        <div style="font-size:44px;margin-bottom:10px;">💙</div>
        <h1 style="color:#FFFFFF;font-size:22px;font-weight:800;margin:0 0 6px;">Application Update</h1>
        <p style="color:rgba(255,255,255,0.85);font-size:14px;margin:0;">Thank you for your interest</p>
      </div>

      <!-- Body -->
      <div style="padding:36px 40px;">
        <h2 style="color:#1F2937;font-size:18px;margin:0 0 10px;">Hi ${name},</h2>
        <p style="color:#4B5563;font-size:15px;line-height:1.7;margin:0 0 20px;">
          Thank you for applying to <strong>${jobTitle}</strong> at <strong>${company}</strong>. After careful review, we've decided to move forward with other candidates at this time.
        </p>

        ${reasonsHtml}
        ${feedbackHtml}

        <div style="background:#F0FDF4;border:1px solid #10B981;border-radius:10px;padding:16px 20px;margin:20px 0;">
          <p style="color:#065F46;font-size:14px;font-weight:700;margin:0 0 6px;">🚀 Don't give up!</p>
          <p style="color:#047857;font-size:13px;margin:0;line-height:1.6;">There are hundreds of other opportunities on ZyncJobs that match your profile. Keep applying!</p>
        </div>

        ${divider()}

        <div style="text-align:center;margin:24px 0;">
          ${ctaButton('🔍 Find More Jobs', `${FRONTEND_URL}/job-listings`, '#10B981')}
        </div>
      </div>`;

    await transporter.sendMail({
      from: employerEmail ? `"${employerName || company}" <${employerEmail}>` : `"ZyncJobs" <${process.env.SMTP_EMAIL}>`,
      replyTo: employerEmail || process.env.SMTP_EMAIL,
      to: candidateEmail,
      subject: `Application Update — ${jobTitle} at ${company}`,
      html: baseTemplate(content, `Update on your application for ${jobTitle} at ${company}`)
    });
    console.log('✅ Rejection email sent to:', candidateEmail);
    return { success: true };
  } catch (error) {
    console.error('❌ Email error:', error);
    return { success: false, error: error.message };
  }
};

// Send application status update email
export const sendApplicationStatusEmail = async (candidateEmail, candidateName, jobTitle, company, status, employerEmail = null, employerName = null) => {
  try {
    const { baseTemplate, ctaButton, statusBadge, infoBox, divider, FRONTEND_URL } = await import('./emailTemplates.js');
    const name = candidateName || 'there';

    const statusConfig = {
      applied:     { emoji: '📋', title: 'Application Received',    msg: 'Your application is under review. We\'ll keep you posted!', color: '#3B82F6' },
      reviewed:    { emoji: '👀', title: 'Application Reviewed',    msg: 'The hiring team has reviewed your application and is evaluating next steps.', color: '#F59E0B' },
      shortlisted: { emoji: '⭐', title: 'You\'re Shortlisted!',      msg: 'Congratulations! You\'ve been shortlisted. Expect to hear from us soon about next steps.', color: '#10B981' },
      hired:       { emoji: '🎉', title: 'Congratulations! You\'re Hired!', msg: 'We are thrilled to offer you this position. Welcome to the team!', color: '#059669' },
      rejected:    { emoji: '💙', title: 'Application Update',      msg: 'After careful review, we\'ve decided to move forward with other candidates. We encourage you to keep applying!', color: '#6B7280' },
    };
    const cfg = statusConfig[status] || statusConfig.applied;

    const content = `
      <!-- Hero -->
      <div style="background:linear-gradient(135deg,${cfg.color} 0%,#7C3AED 100%);padding:36px 40px;text-align:center;">
        <div style="font-size:44px;margin-bottom:10px;">${cfg.emoji}</div>
        <h1 style="color:#FFFFFF;font-size:22px;font-weight:800;margin:0 0 6px;">${cfg.title}</h1>
        <p style="color:rgba(255,255,255,0.85);font-size:14px;margin:0;">Application status update</p>
      </div>

      <!-- Body -->
      <div style="padding:36px 40px;">
        <h2 style="color:#1F2937;font-size:18px;margin:0 0 10px;">Hi ${name}!</h2>
        <p style="color:#4B5563;font-size:15px;line-height:1.7;margin:0 0 20px;">${cfg.msg}</p>

        ${infoBox(`
          <table cellpadding="0" cellspacing="0" width="100%">
            <tr><td style="padding:4px 0;"><span style="color:#6B7280;font-size:13px;">Position</span></td><td style="padding:4px 0;"><strong style="color:#1F2937;font-size:14px;">${jobTitle}</strong></td></tr>
            <tr><td style="padding:4px 0;"><span style="color:#6B7280;font-size:13px;">Company</span></td><td style="padding:4px 0;"><strong style="color:#1F2937;font-size:14px;">${company}</strong></td></tr>
            <tr><td style="padding:4px 0;"><span style="color:#6B7280;font-size:13px;">Status</span></td><td style="padding:4px 0;">${statusBadge(status)}</td></tr>
          </table>
        `, cfg.color)}

        ${divider()}

        <div style="text-align:center;margin:24px 0;">
          ${ctaButton('🔍 View Application', `${FRONTEND_URL}/my-applications`, cfg.color)}
          ${status !== 'hired' && status !== 'rejected' ? `<p style="margin:12px 0 0;"><a href="${FRONTEND_URL}/job-listings" style="color:#4F46E5;font-size:13px;text-decoration:none;">Browse more jobs →</a></p>` : ''}
        </div>
      </div>`;

    await transporter.sendMail({
      from: employerEmail ? `"${employerName || company}" <${employerEmail}>` : `"ZyncJobs" <${process.env.SMTP_EMAIL}>`,
      replyTo: employerEmail || process.env.SMTP_EMAIL,
      to: candidateEmail,
      subject: `${cfg.emoji} Application Update — ${jobTitle} at ${company}`,
      html: baseTemplate(content, `Your application for ${jobTitle} status: ${status}`)
    });
    console.log('✅ Status update email sent to:', candidateEmail);
    return { success: true };
  } catch (error) {
    console.error('❌ Email error:', error);
    return { success: false, error: error.message };
  }
};

// Send job alert email
export const sendJobAlertEmail = async (userEmail, userName, jobs) => {
  try {
    const { baseTemplate, ctaButton, divider, FRONTEND_URL } = await import('./emailTemplates.js');
    const name = userName || 'there';

    const jobCards = jobs.slice(0, 5).map(job => `
      <div style="border:1px solid #E5E7EB;border-radius:12px;padding:16px 20px;margin:10px 0;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td>
              <p style="color:#1F2937;font-size:15px;font-weight:700;margin:0 0 4px;">${job.title}</p>
              <p style="color:#4F46E5;font-size:13px;font-weight:600;margin:0 0 6px;">${job.company}</p>
              <p style="color:#6B7280;font-size:12px;margin:0;">📍 ${job.location || 'Remote'} &nbsp;•&nbsp; 💰 ${job.salary || 'Competitive'}</p>
            </td>
            <td style="text-align:right;vertical-align:middle;">
              <a href="${FRONTEND_URL}/job-listings" style="background:#4F46E5;color:#fff;font-size:12px;font-weight:700;padding:8px 16px;border-radius:8px;text-decoration:none;">Apply</a>
            </td>
          </tr>
        </table>
      </div>`).join('');

    const content = `
      <!-- Hero -->
      <div style="background:linear-gradient(135deg,#4F46E5 0%,#7C3AED 100%);padding:36px 40px;text-align:center;">
        <div style="font-size:44px;margin-bottom:10px;">🔔</div>
        <h1 style="color:#FFFFFF;font-size:22px;font-weight:800;margin:0 0 6px;">${jobs.length} New Job${jobs.length > 1 ? 's' : ''} For You!</h1>
        <p style="color:rgba(255,255,255,0.85);font-size:14px;margin:0;">Matching your job alert preferences</p>
      </div>

      <!-- Body -->
      <div style="padding:36px 40px;">
        <h2 style="color:#1F2937;font-size:18px;margin:0 0 10px;">Hi ${name}! 👋</h2>
        <p style="color:#4B5563;font-size:15px;line-height:1.7;margin:0 0 20px;">
          We found <strong>${jobs.length} new job${jobs.length > 1 ? 's' : ''}</strong> matching your preferences. Don't miss out!
        </p>

        ${jobCards}

        ${divider()}

        <div style="text-align:center;margin:24px 0;">
          ${ctaButton('🔍 View All Matching Jobs', `${FRONTEND_URL}/job-listings`)}
          <p style="margin:12px 0 0;"><a href="${FRONTEND_URL}/dashboard" style="color:#6B7280;font-size:12px;text-decoration:none;">Manage job alerts →</a></p>
        </div>
      </div>`;

    await transporter.sendMail({
      from: `"ZyncJobs Jobs" <${process.env.SMTP_EMAIL}>`,
      to: userEmail,
      subject: `🔔 ${jobs.length} new job${jobs.length > 1 ? 's' : ''} matching your alert`,
      html: baseTemplate(content, `${jobs.length} new jobs matching your preferences on ZyncJobs`)
    });
    console.log('✅ Job alert email sent to:', userEmail);
    return { success: true };
  } catch (error) {
    console.error('❌ Email error:', error);
    return { success: false, error: error.message };
  }
};

// Send welcome email for new registrations
export const sendWelcomeEmail = async (userEmail, userName, userType, verificationData = {}) => {
  try {
    const { baseTemplate, ctaButton, featureCard, divider, FRONTEND_URL } = await import('./emailTemplates.js');
    const name = userName || 'there';
    const isEmployer = userType === 'employer';

    const employerFeatures = `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
      <tr>
        ${featureCard('📢', 'Post Jobs', 'Publish openings instantly to thousands of candidates')}
        ${featureCard('🔍', 'Find Talent', 'AI-powered candidate search & ranking')}
        ${featureCard('📊', 'Track Apps', 'Manage all applications in one dashboard')}
      </tr>
    </table>`;

    const candidateFeatures = `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
      <tr>
        ${featureCard('💼', 'Browse Jobs', 'Thousands of verified job openings')}
        ${featureCard('🤖', 'AI Match', 'Get personalized job recommendations')}
        ${featureCard('📄', 'Build Resume', 'Create a professional resume in minutes')}
      </tr>
    </table>`;

    const content = `
      <!-- Hero -->
      <div style="background:linear-gradient(135deg,#4F46E5 0%,#7C3AED 100%);padding:40px;text-align:center;">
        <div style="font-size:48px;margin-bottom:12px;">🎉</div>
        <h1 style="color:#FFFFFF;font-size:26px;font-weight:800;margin:0 0 8px;">Welcome to ZyncJobs!</h1>
        <p style="color:rgba(255,255,255,0.85);font-size:15px;margin:0;">Your ${isEmployer ? 'hiring' : 'career'} journey starts here 🚀</p>
      </div>

      <!-- Body -->
      <div style="padding:36px 40px;">
        <h2 style="color:#1F2937;font-size:20px;margin:0 0 12px;">Hi ${name}! 👋</h2>
        <p style="color:#4B5563;font-size:15px;line-height:1.7;margin:0 0 20px;">
          ${isEmployer
            ? 'Your employer account is ready. Start posting jobs and find top talent faster with AI-powered matching.'
            : 'Your account is ready. Discover thousands of jobs tailored to your skills and experience.'}
        </p>

        ${isEmployer ? employerFeatures : candidateFeatures}

        ${divider()}

        <!-- Progress Steps -->
        <p style="color:#1F2937;font-size:14px;font-weight:700;margin:0 0 12px;">🗺️ Get started in 3 steps:</p>
        <table width="100%" cellpadding="0" cellspacing="0">
          ${isEmployer ? `
          <tr><td style="padding:8px 0;color:#4B5563;font-size:14px;"><span style="background:#4F46E5;color:#fff;border-radius:50%;width:22px;height:22px;display:inline-block;text-align:center;line-height:22px;font-size:12px;font-weight:700;margin-right:10px;">1</span>Complete your company profile</td></tr>
          <tr><td style="padding:8px 0;color:#4B5563;font-size:14px;"><span style="background:#E5E7EB;color:#6B7280;border-radius:50%;width:22px;height:22px;display:inline-block;text-align:center;line-height:22px;font-size:12px;font-weight:700;margin-right:10px;">2</span>Post your first job opening</td></tr>
          <tr><td style="padding:8px 0;color:#4B5563;font-size:14px;"><span style="background:#E5E7EB;color:#6B7280;border-radius:50%;width:22px;height:22px;display:inline-block;text-align:center;line-height:22px;font-size:12px;font-weight:700;margin-right:10px;">3</span>Review & hire top candidates</td></tr>
          ` : `
          <tr><td style="padding:8px 0;color:#4B5563;font-size:14px;"><span style="background:#4F46E5;color:#fff;border-radius:50%;width:22px;height:22px;display:inline-block;text-align:center;line-height:22px;font-size:12px;font-weight:700;margin-right:10px;">1</span>Complete your profile</td></tr>
          <tr><td style="padding:8px 0;color:#4B5563;font-size:14px;"><span style="background:#E5E7EB;color:#6B7280;border-radius:50%;width:22px;height:22px;display:inline-block;text-align:center;line-height:22px;font-size:12px;font-weight:700;margin-right:10px;">2</span>Upload your resume</td></tr>
          <tr><td style="padding:8px 0;color:#4B5563;font-size:14px;"><span style="background:#E5E7EB;color:#6B7280;border-radius:50%;width:22px;height:22px;display:inline-block;text-align:center;line-height:22px;font-size:12px;font-weight:700;margin-right:10px;">3</span>Apply to matching jobs</td></tr>
          `}
        </table>

        ${divider()}

        <div style="text-align:center;margin:28px 0;">
          ${ctaButton(isEmployer ? '🚀 Start Hiring Now' : '🔍 Explore Jobs', isEmployer ? `${FRONTEND_URL}/employer-complete-profile` : `${FRONTEND_URL}/job-listings`)}
          <p style="margin:14px 0 0;"><a href="${FRONTEND_URL}/dashboard" style="color:#4F46E5;font-size:13px;text-decoration:none;">Or go to your dashboard →</a></p>
        </div>

        ${divider()}

        <!-- Support -->
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="background:#F9FAFB;border-radius:10px;padding:16px 20px;">
              <p style="color:#1F2937;font-size:13px;font-weight:700;margin:0 0 6px;">💬 Need help getting started?</p>
              <p style="color:#6B7280;font-size:13px;margin:0;">📧 <a href="mailto:support@zyncjobs.com" style="color:#4F46E5;">support@zyncjobs.com</a></p>
            </td>
          </tr>
        </table>
      </div>`;

    await transporter.sendMail({
      from: `"ZyncJobs" <${process.env.SMTP_EMAIL}>`,
      to: userEmail,
      subject: `Welcome to ZyncJobs, ${name}! 🎉`,
      html: baseTemplate(content, `Welcome ${name}! Your ZyncJobs account is ready.`)
    });
    console.log('✅ Welcome email sent to:', userEmail);
    return { success: true };
  } catch (error) {
    console.error('❌ Welcome email error:', error);
    return { success: false, error: error.message };
  }
};

// Send follow-up reminder email
export const sendFollowUpReminderEmail = async (candidateEmail, candidateName, jobTitle, company, reminderType, reminderData = {}, employerEmail = null, employerName = null) => {
  try {
    let subject, html;
    
    switch (reminderType) {
      case 'application_status':
        subject = `Follow-up: Your application for ${jobTitle}`;
        html = `
          <h2>Application Status Follow-up</h2>
          <p>Dear ${candidateName},</p>
          <p>We wanted to follow up on your application for <strong>${jobTitle}</strong> at <strong>${company}</strong>.</p>
          <p>Your application is still under review. We appreciate your patience and will update you as soon as we have more information.</p>
          <br>
          <p>Best regards,<br>ZyncJobs Team</p>
        `;
        break;
        
      case 'interview_reminder':
        subject = `Interview Reminder: ${jobTitle} at ${company}`;
        html = `
          <h2>Interview Reminder</h2>
          <p>Dear ${candidateName},</p>
          <p>This is a reminder about your upcoming interview for <strong>${jobTitle}</strong> at <strong>${company}</strong>.</p>
          <div style="background-color: #f0f9ff; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <p><strong>Interview Details:</strong></p>
            <p><strong>Date:</strong> ${reminderData.interviewDate ? new Date(reminderData.interviewDate).toLocaleDateString() : 'TBD'}</p>
            <p><strong>Time:</strong> ${reminderData.interviewTime || 'TBD'}</p>
            <p><strong>Type:</strong> ${reminderData.interviewType || 'TBD'}</p>
            ${reminderData.interviewLocation ? `<p><strong>Location:</strong> ${reminderData.interviewLocation}</p>` : ''}
            ${reminderData.meetingLink ? `<p><strong>Meeting Link:</strong> <a href="${reminderData.meetingLink}">${reminderData.meetingLink}</a></p>` : ''}
            ${reminderData.additionalNotes ? `<p><strong>Notes:</strong> ${reminderData.additionalNotes}</p>` : ''}
          </div>
          <p>Please be prepared and arrive on time. Good luck!</p>
          <br>
          <p>Best regards,<br>ZyncJobs Team</p>
        `;
        break;
        
      case 'follow_up':
        subject = `Follow-up opportunity: ${jobTitle}`;
        html = `
          <h2>Follow-up Opportunity</h2>
          <p>Dear ${candidateName},</p>
          <p>We hope you're still interested in the <strong>${jobTitle}</strong> position at <strong>${company}</strong>.</p>
          <p>If you have any questions about the role or would like to provide additional information, please don't hesitate to reach out.</p>
          <br>
          <p>Best regards,<br>ZyncJobs Team</p>
        `;
        break;
        
      case 'deadline_reminder':
        subject = `Deadline Reminder: ${jobTitle} application`;
        html = `
          <h2>Application Deadline Reminder</h2>
          <p>Dear ${candidateName},</p>
          <p>This is a reminder that the application deadline for <strong>${jobTitle}</strong> at <strong>${company}</strong> is approaching.</p>
          <p>Please ensure you complete any pending requirements before the deadline.</p>
          <br>
          <p>Best regards,<br>ZyncJobs Team</p>
        `;
        break;
        
      default:
        subject = `Update: ${jobTitle} application`;
        html = `
          <h2>Application Update</h2>
          <p>Dear ${candidateName},</p>
          <p>We have an update regarding your application for <strong>${jobTitle}</strong> at <strong>${company}</strong>.</p>
          <br>
          <p>Best regards,<br>ZyncJobs Team</p>
        `;
    }

    const mailOptions = {
      from: employerEmail ? `"${employerName || company}" <${employerEmail}>` : process.env.SMTP_EMAIL,
      replyTo: employerEmail || process.env.SMTP_EMAIL,
      to: candidateEmail,
      subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #6366f1; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">ZyncJobs</h1>
          </div>
          <div style="padding: 30px; background-color: white;">
            ${html}
          </div>
          <div style="background-color: #f1f1f1; padding: 15px; text-align: center;">
            <p style="color: #666; margin: 0; font-size: 12px;">© 2025 ZyncJobs. All rights reserved.</p>
          </div>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log('✅ Follow-up reminder email sent to:', candidateEmail);
    return { success: true, message: 'Follow-up reminder email sent' };
  } catch (error) {
    console.error('❌ Follow-up reminder email error:', error);
    return { success: false, error: error.message };
  }
};

// Send new application notification to employer with candidate resume
export const sendEmployerApplicationEmail = async (employerEmail, jobTitle, company, candidate, employerName = null) => {
  try {
    const { baseTemplate, ctaButton, infoBox, divider, FRONTEND_URL } = await import('./emailTemplates.js');
    const { name, email, phone, resumeUrl, coverLetter } = candidate;

    const attachments = [];
    if (resumeUrl) {
      const isLocalPath = resumeUrl.startsWith('uploads/') || resumeUrl.startsWith('/');
      if (isLocalPath) attachments.push({ filename: `${name.replace(/\s+/g, '_')}_resume.pdf`, path: resumeUrl });
    }

    const content = `
      <!-- Hero -->
      <div style="background:linear-gradient(135deg,#059669 0%,#047857 100%);padding:36px 40px;text-align:center;">
        <div style="font-size:44px;margin-bottom:10px;">📩</div>
        <h1 style="color:#FFFFFF;font-size:22px;font-weight:800;margin:0 0 6px;">New Application!</h1>
        <p style="color:rgba(255,255,255,0.85);font-size:14px;margin:0;">Someone applied to your job posting</p>
      </div>

      <!-- Body -->
      <div style="padding:36px 40px;">
        <h2 style="color:#1F2937;font-size:18px;margin:0 0 10px;">Hi ${employerName || 'there'}! 👋</h2>
        <p style="color:#4B5563;font-size:15px;line-height:1.7;margin:0 0 20px;">
          A new candidate has applied for <strong>${jobTitle}</strong> at <strong>${company}</strong>.
        </p>

        ${infoBox(`
          <p style="color:#1F2937;font-size:14px;font-weight:700;margin:0 0 12px;">👤 Candidate Details</p>
          <table cellpadding="0" cellspacing="0" width="100%">
            <tr><td style="padding:4px 0;width:80px;"><span style="color:#6B7280;font-size:13px;">Name</span></td><td style="padding:4px 0;"><strong style="color:#1F2937;font-size:14px;">${name}</strong></td></tr>
            <tr><td style="padding:4px 0;"><span style="color:#6B7280;font-size:13px;">Email</span></td><td style="padding:4px 0;"><a href="mailto:${email}" style="color:#4F46E5;font-size:14px;">${email}</a></td></tr>
            <tr><td style="padding:4px 0;"><span style="color:#6B7280;font-size:13px;">Phone</span></td><td style="padding:4px 0;"><strong style="color:#1F2937;font-size:14px;">${phone || 'Not provided'}</strong></td></tr>
            ${resumeUrl && !resumeUrl.startsWith('uploads/') ? `<tr><td style="padding:4px 0;"><span style="color:#6B7280;font-size:13px;">Resume</span></td><td style="padding:4px 0;"><a href="${resumeUrl}" style="color:#4F46E5;font-size:14px;">📄 View Resume</a></td></tr>` : ''}
          </table>
        `, '#059669')}

        ${coverLetter ? `<div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:10px;padding:16px 20px;margin:16px 0;"><p style="color:#1F2937;font-size:13px;font-weight:700;margin:0 0 8px;">📝 Cover Letter</p><p style="color:#4B5563;font-size:13px;line-height:1.6;margin:0;">${coverLetter.substring(0, 300)}${coverLetter.length > 300 ? '...' : ''}</p></div>` : ''}

        ${divider()}

        <div style="text-align:center;margin:24px 0;">
          ${ctaButton('👀 Review Application', `${FRONTEND_URL}/dashboard`, '#059669')}
        </div>
      </div>`;

    await transporter.sendMail({
      from: `"ZyncJobs" <${process.env.SMTP_EMAIL}>`,
      replyTo: process.env.SMTP_EMAIL,
      to: employerEmail,
      subject: `📩 New Application — ${name} applied for ${jobTitle}`,
      html: baseTemplate(content, `${name} applied for ${jobTitle} at ${company}`),
      attachments
    });
    console.log('✅ Employer application email sent to:', employerEmail);
    return { success: true };
  } catch (error) {
    console.error('❌ Employer email error:', error);
    return { success: false, error: error.message };
  }
};

export default { sendJobApplicationEmail, sendApplicationRejectionEmail, sendApplicationStatusEmail, sendJobAlertEmail, sendWelcomeEmail, sendFollowUpReminderEmail, sendEmployerApplicationEmail };

// Send admin invitation email
export const sendAdminInviteEmail = async (toEmail, name, role, token) => {
  try {
    const { baseTemplate, ctaButton, FRONTEND_URL } = await import('./emailTemplates.js');
    const roleLabel = role === 'super_admin' ? 'Super Administrator' : 'Administrator';
    const inviteUrl = `${FRONTEND_URL}/admin/accept-invite?token=${token}`;

    const content = `
      <div style="background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);padding:36px 40px;text-align:center;">
        <div style="font-size:44px;margin-bottom:10px;">🛡️</div>
        <h1 style="color:#FFFFFF;font-size:22px;font-weight:800;margin:0 0 6px;">Admin Invitation</h1>
        <p style="color:rgba(255,255,255,0.85);font-size:14px;margin:0;">You've been invited to ZyncJobs Admin</p>
      </div>
      <div style="padding:36px 40px;">
        <h2 style="color:#1F2937;font-size:18px;margin:0 0 10px;">Hi ${name}! 👋</h2>
        <p style="color:#4B5563;font-size:15px;line-height:1.7;margin:0 0 20px;">
          You've been invited to join ZyncJobs as a <strong style="color:#2563eb;">${roleLabel}</strong>.
          Click the button below to set your password and activate your account.
        </p>
        <div style="background:#f0f9ff;border:1px solid #bfdbfe;border-radius:10px;padding:16px 20px;margin:0 0 24px;">
          <p style="color:#1e40af;font-size:13px;margin:0;">⏰ This invitation link expires in <strong>24 hours</strong>.</p>
        </div>
        <div style="text-align:center;margin:24px 0;">
          ${ctaButton('🔐 Activate Admin Account', inviteUrl, '#2563eb')}
        </div>
        <p style="color:#9CA3AF;font-size:12px;text-align:center;margin:16px 0 0;">If you didn't expect this invitation, you can safely ignore this email.</p>
      </div>`;

    await transporter.sendMail({
      from: `"ZyncJobs Admin" <${process.env.SMTP_EMAIL}>`,
      to: toEmail,
      subject: `🛡️ You're invited as ${roleLabel} — ZyncJobs`,
      html: baseTemplate(content, `Admin invitation for ${name} to join ZyncJobs`)
    });
    console.log('✅ Admin invite email sent to:', toEmail);
    return { success: true };
  } catch (error) {
    console.error('❌ Admin invite email error:', error);
    return { success: false, error: error.message };
  }
};

// Send GDPR inactivity reminder email (Step 4)
export const sendGdprInactivityReminderEmail = async (userEmail, userName) => {
  try {
    const { baseTemplate, ctaButton, divider, FRONTEND_URL } = await import('./emailTemplates.js');
    const name = userName || 'there';

    const content = `
      <!-- Hero -->
      <div style="background:linear-gradient(135deg,#F59E0B 0%,#D97706 100%);padding:36px 40px;text-align:center;">
        <div style="font-size:44px;margin-bottom:10px;">⚠️</div>
        <h1 style="color:#FFFFFF;font-size:22px;font-weight:800;margin:0 0 6px;">Action Required</h1>
        <p style="color:rgba(255,255,255,0.9);font-size:14px;margin:0;">Your ZyncJobs resume needs attention</p>
      </div>

      <!-- Body -->
      <div style="padding:36px 40px;">
        <h2 style="color:#1F2937;font-size:18px;margin:0 0 10px;">Hi ${name},</h2>
        <p style="color:#4B5563;font-size:15px;line-height:1.7;margin:0 0 20px;">
          Your resume has been inactive on ZyncJobs for a while. We respect your data privacy and want to give you control.
        </p>

        <div style="background:#FEF3C7;border:1px solid #F59E0B;border-radius:10px;padding:16px 20px;margin:0 0 20px;">
          <p style="color:#92400E;font-size:14px;font-weight:700;margin:0 0 6px;">⏰ 30-Day Notice</p>
          <p style="color:#78350F;font-size:13px;margin:0;line-height:1.6;">If there is no activity in the next <strong>30 days</strong>, your resume will be automatically removed per our data retention policy.</p>
        </div>

        <p style="color:#1F2937;font-size:14px;font-weight:700;margin:0 0 10px;">🛠️ What you can do:</p>
        <table cellpadding="0" cellspacing="0" width="100%">
          <tr><td style="padding:6px 0;"><a href="${FRONTEND_URL}/dashboard" style="color:#4F46E5;font-size:14px;text-decoration:none;">→ Login to keep your resume active</a></td></tr>
          <tr><td style="padding:6px 0;"><a href="${FRONTEND_URL}/resume-builder" style="color:#4F46E5;font-size:14px;text-decoration:none;">→ Update your resume</a></td></tr>
          <tr><td style="padding:6px 0;"><a href="${FRONTEND_URL}/privacy-settings" style="color:#4F46E5;font-size:14px;text-decoration:none;">→ Delete your resume anytime</a></td></tr>
        </table>

        ${divider()}

        <div style="text-align:center;margin:24px 0;">
          ${ctaButton('🔐 Keep My Resume Active', `${FRONTEND_URL}/dashboard`, '#F59E0B')}
        </div>

        <p style="color:#9CA3AF;font-size:12px;text-align:center;margin:0;">To manage privacy settings: <a href="${FRONTEND_URL}/privacy-settings" style="color:#4F46E5;">Privacy Settings</a></p>
      </div>`;

    await transporter.sendMail({
      from: `"ZyncJobs" <${process.env.SMTP_EMAIL}>`,
      to: userEmail,
      subject: '⚠️ Your ZyncJobs resume — action required',
      html: baseTemplate(content, 'Your ZyncJobs resume will be removed in 30 days unless you take action.')
    });
    console.log('✅ GDPR inactivity reminder sent to:', userEmail);
    return { success: true };
  } catch (error) {
    console.error('❌ GDPR reminder email error:', error);
    return { success: false, error: error.message };
  }
};

// Send interview scheduled email to candidate
export const sendInterviewScheduledEmail = async (candidateEmail, candidateName, jobTitle, company, interviewDetails, employerEmail = null, employerName = null) => {
  try {
    const { baseTemplate, ctaButton, infoBox, divider, FRONTEND_URL } = await import('./emailTemplates.js');
    const { scheduledDate, duration, type, meetingLink, location, notes } = interviewDetails;
    const name = candidateName || 'there';
    const interviewDate = new Date(scheduledDate);
    const typeLabel = type === 'video' ? '🎥 Video Call' : type === 'phone' ? '📞 Phone Call' : '🏢 In Person';

    const content = `
      <!-- Hero -->
      <div style="background:linear-gradient(135deg,#7C3AED 0%,#4F46E5 100%);padding:36px 40px;text-align:center;">
        <div style="font-size:44px;margin-bottom:10px;">🎉</div>
        <h1 style="color:#FFFFFF;font-size:22px;font-weight:800;margin:0 0 6px;">Interview Scheduled!</h1>
        <p style="color:rgba(255,255,255,0.85);font-size:14px;margin:0;">You're one step closer to your dream job</p>
      </div>

      <!-- Body -->
      <div style="padding:36px 40px;">
        <h2 style="color:#1F2937;font-size:18px;margin:0 0 10px;">Hi ${name}! 👋</h2>
        <p style="color:#4B5563;font-size:15px;line-height:1.7;margin:0 0 20px;">
          Your interview for <strong>${jobTitle}</strong> at <strong>${company}</strong> has been confirmed. Here are your details:
        </p>

        ${infoBox(`
          <table cellpadding="0" cellspacing="0" width="100%">
            <tr><td style="padding:6px 0;width:120px;"><span style="color:#6B7280;font-size:13px;">📅 Date</span></td><td style="padding:6px 0;"><strong style="color:#1F2937;font-size:14px;">${interviewDate.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</strong></td></tr>
            <tr><td style="padding:6px 0;"><span style="color:#6B7280;font-size:13px;">⏰ Time</span></td><td style="padding:6px 0;"><strong style="color:#1F2937;font-size:14px;">${interviewDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</strong></td></tr>
            <tr><td style="padding:6px 0;"><span style="color:#6B7280;font-size:13px;">⏱️ Duration</span></td><td style="padding:6px 0;"><strong style="color:#1F2937;font-size:14px;">${duration} minutes</strong></td></tr>
            <tr><td style="padding:6px 0;"><span style="color:#6B7280;font-size:13px;">📱 Type</span></td><td style="padding:6px 0;"><strong style="color:#1F2937;font-size:14px;">${typeLabel}</strong></td></tr>
            ${location ? `<tr><td style="padding:6px 0;"><span style="color:#6B7280;font-size:13px;">📍 Location</span></td><td style="padding:6px 0;"><strong style="color:#1F2937;font-size:14px;">${location}</strong></td></tr>` : ''}
          </table>
        `, '#7C3AED')}

        ${notes ? `<div style="background:#FFF7ED;border:1px solid #F59E0B;border-radius:10px;padding:14px 18px;margin:16px 0;"><p style="color:#92400E;font-size:13px;font-weight:700;margin:0 0 4px;">📝 Notes from interviewer</p><p style="color:#78350F;font-size:13px;margin:0;line-height:1.6;">${notes}</p></div>` : ''}

        <!-- Tips -->
        <div style="background:#F0FDF4;border-radius:10px;padding:16px 20px;margin:16px 0;">
          <p style="color:#065F46;font-size:13px;font-weight:700;margin:0 0 8px;">💡 Interview Tips</p>
          <p style="color:#047857;font-size:12px;margin:3px 0;">• Test your equipment 15 mins before</p>
          <p style="color:#047857;font-size:12px;margin:3px 0;">• Research the company & role thoroughly</p>
          <p style="color:#047857;font-size:12px;margin:3px 0;">• Prepare STAR-format examples</p>
          <p style="color:#047857;font-size:12px;margin:3px 0;">• Have questions ready for the interviewer</p>
        </div>

        ${divider()}

        <div style="text-align:center;margin:24px 0;">
          ${meetingLink ? ctaButton('🎥 Join Interview', meetingLink, '#7C3AED') : ctaButton('📅 View Details', `${FRONTEND_URL}/interviews`, '#7C3AED')}
        </div>
      </div>`;

    await transporter.sendMail({
      from: employerEmail ? `"${employerName || company}" <${employerEmail}>` : `"ZyncJobs" <${process.env.SMTP_EMAIL}>`,
      replyTo: employerEmail || process.env.SMTP_EMAIL,
      to: candidateEmail,
      subject: `🎉 Interview Scheduled — ${jobTitle} at ${company}`,
      html: baseTemplate(content, `Your interview for ${jobTitle} is confirmed!`)
    });
    console.log('✅ Interview scheduled email sent to:', candidateEmail);
    return { success: true };
  } catch (error) {
    console.error('❌ Interview email error:', error);
    return { success: false, error: error.message };
  }
};
