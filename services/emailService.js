import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_SERVER,
  port: parseInt(process.env.SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
});

const sendMail = (opts) => transporter.sendMail(opts);

// Send job application confirmation email
export const sendJobApplicationEmail = async (candidateEmail, candidateName, jobTitle, company) => {
  try {
    const { baseTemplate, ctaButton, infoBox, divider, FRONTEND_URL } = await import('./emailTemplates.js');
    const name = candidateName || 'there';

    const content = `
      <!-- Hero -->
      <div style="background:linear-gradient(135deg,#4F46E5 0%,#7C3AED 100%);padding:36px 40px;text-align:center;">
        <div style="margin-bottom:10px;"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="7" width="20" height="14" rx="2" stroke="white" stroke-width="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" stroke="white" stroke-width="2"/><line x1="12" y1="12" x2="12" y2="16" stroke="white" stroke-width="2" stroke-linecap="round"/><line x1="10" y1="14" x2="14" y2="14" stroke="white" stroke-width="2" stroke-linecap="round"/></svg></div>
        <h1 style="color:#FFFFFF;font-size:22px;font-weight:800;margin:0 0 6px;">Application Received!</h1>
        <p style="color:rgba(255,255,255,0.85);font-size:14px;margin:0;">We've got your application</p>
      </div>

      <!-- Body -->
      <div style="padding:36px 40px;">
        <h2 style="color:#1F2937;font-size:18px;margin:0 0 10px;">Hi ${name}!</h2>
        <p style="color:#4B5563;font-size:15px;line-height:1.7;margin:0 0 20px;">
          Great news — your application has been successfully submitted. The hiring team will review it and get back to you soon.
        </p>

        ${infoBox(`
          <table cellpadding="0" cellspacing="0" width="100%">
            <tr><td style="padding:4px 0;"><span style="color:#6B7280;font-size:13px;">Position</span></td><td style="padding:4px 0;"><strong style="color:#1F2937;font-size:14px;">${jobTitle}</strong></td></tr>
            <tr><td style="padding:4px 0;"><span style="color:#6B7280;font-size:13px;">Company</span></td><td style="padding:4px 0;"><strong style="color:#1F2937;font-size:14px;">${company}</strong></td></tr>
            <tr><td style="padding:4px 0;"><span style="color:#6B7280;font-size:13px;">Status</span></td><td style="padding:4px 0;"><span style="background:#EFF6FF;color:#3B82F6;border-radius:20px;padding:3px 12px;font-size:12px;font-weight:700;">Under Review</span></td></tr>
          </table>
        `)}

        <p style="color:#4B5563;font-size:14px;line-height:1.7;">
          <strong>Tip:</strong> While you wait, strengthen your profile and explore more matching jobs on ZyncJobs.
        </p>

        ${divider()}

        <div style="text-align:center;margin:24px 0;">
          ${ctaButton('Track Your Application', `${FRONTEND_URL}/my-applications`)}
          <p style="margin:12px 0 0;"><a href="${FRONTEND_URL}/job-listings" style="color:#4F46E5;font-size:13px;text-decoration:none;">Browse more jobs &rarr;</a></p>
        </div>
      </div>`;

    await transporter.sendMail({
      from: `"ZyncJobs" <${process.env.SMTP_FROM_EMAIL}>`,
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
        <p style="color:#1F2937;font-size:14px;font-weight:700;margin:0 0 8px;">Areas to strengthen:</p>
        ${aiReasons.map(r => `<p style="color:#4B5563;font-size:13px;margin:4px 0;padding-left:16px;">• ${r}</p>`).join('')}
      </div>` : '';

    const feedbackHtml = aiFeedback ? `
      ${infoBox(`<p style="color:#1F2937;font-size:14px;font-weight:700;margin:0 0 6px;">AI Feedback</p><p style="color:#4B5563;font-size:13px;margin:0;line-height:1.6;">${aiFeedback}</p>`, '#8B5CF6')}` : '';

    const content = `
      <!-- Hero -->
      <div style="background:linear-gradient(135deg,#6B7280 0%,#4B5563 100%);padding:36px 40px;text-align:center;">
        <div style="margin-bottom:10px;"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" stroke="white" stroke-width="2"/><path d="M12 8v4" stroke="white" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="16" r="1" fill="white"/></svg></div>
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
          <p style="color:#065F46;font-size:14px;font-weight:700;margin:0 0 6px;">Don't give up!</p>
          <p style="color:#047857;font-size:13px;margin:0;line-height:1.6;">There are hundreds of other opportunities on ZyncJobs that match your profile. Keep applying!</p>
        </div>

        ${divider()}

        <div style="text-align:center;margin:24px 0;">
          ${ctaButton('Find More Jobs', `${FRONTEND_URL}/job-listings`, '#10B981')}
        </div>
      </div>`;

    await transporter.sendMail({
      from: employerEmail ? `"${employerName || company}" <${employerEmail}>` : `"ZyncJobs" <${process.env.SMTP_FROM_EMAIL}>`,
      replyTo: employerEmail || process.env.SMTP_FROM_EMAIL,
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
      applied:     { icon: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><polyline points="14 2 14 8 20 8" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="16" y1="13" x2="8" y2="13" stroke="white" stroke-width="2" stroke-linecap="round"/><line x1="16" y1="17" x2="8" y2="17" stroke="white" stroke-width="2" stroke-linecap="round"/><polyline points="10 9 9 9 8 9" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>', title: 'Application Received', msg: 'Your application is under review. We\'ll keep you posted!', color: '#3B82F6' },
      reviewed:    { icon: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" stroke="white" stroke-width="2"/></svg>', title: 'Application Reviewed', msg: 'The hiring team has reviewed your application and is evaluating next steps.', color: '#F59E0B' },
      shortlisted: { icon: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>', title: 'You\'re Shortlisted!', msg: 'Congratulations! You\'ve been shortlisted. Expect to hear from us soon about next steps.', color: '#10B981' },
      hired:       { icon: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><polyline points="20 6 9 17 4 12" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>', title: 'Congratulations! You\'re Hired!', msg: 'We are thrilled to offer you this position. Welcome to the team!', color: '#059669' },
      rejected:    { icon: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" stroke="white" stroke-width="2"/><path d="M12 8v4" stroke="white" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="16" r="1" fill="white"/></svg>', title: 'Application Update', msg: 'After careful review, we\'ve decided to move forward with other candidates. We encourage you to keep applying!', color: '#6B7280' },
    };
    const cfg = statusConfig[status] || statusConfig.applied;

    const content = `
      <!-- Hero -->
      <div style="background:linear-gradient(135deg,${cfg.color} 0%,#7C3AED 100%);padding:36px 40px;text-align:center;">
        <div style="margin-bottom:10px;">${cfg.icon}</div>
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
          ${ctaButton('View Application', `${FRONTEND_URL}/my-applications`, cfg.color)}
          ${status !== 'hired' && status !== 'rejected' ? `<p style="margin:12px 0 0;"><a href="${FRONTEND_URL}/job-listings" style="color:#4F46E5;font-size:13px;text-decoration:none;">Browse more jobs →</a></p>` : ''}
        </div>
      </div>`;

    await transporter.sendMail({
      from: employerEmail ? `"${employerName || company}" <${employerEmail}>` : `"ZyncJobs" <${process.env.SMTP_FROM_EMAIL}>`,
      replyTo: employerEmail || process.env.SMTP_FROM_EMAIL,
      to: candidateEmail,
      subject: `Application Update — ${jobTitle} at ${company}`,
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
              <p style="color:#6B7280;font-size:12px;margin:0;">${job.location || 'Remote'} &nbsp;&bull;&nbsp; ${job.salary || 'Competitive'}</p>
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
        <div style="margin-bottom:10px;"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M13.73 21a2 2 0 0 1-3.46 0" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
        <h1 style="color:#FFFFFF;font-size:22px;font-weight:800;margin:0 0 6px;">${jobs.length} New Job${jobs.length > 1 ? 's' : ''} For You!</h1>
        <p style="color:rgba(255,255,255,0.85);font-size:14px;margin:0;">Matching your job alert preferences</p>
      </div>

      <!-- Body -->
      <div style="padding:36px 40px;">
        <h2 style="color:#1F2937;font-size:18px;margin:0 0 10px;">Hi ${name}!</h2>
        <p style="color:#4B5563;font-size:15px;line-height:1.7;margin:0 0 20px;">
          We found <strong>${jobs.length} new job${jobs.length > 1 ? 's' : ''}</strong> matching your preferences. Don't miss out!
        </p>

        ${jobCards}

        ${divider()}

        <div style="text-align:center;margin:24px 0;">
          ${ctaButton('View All Matching Jobs', `${FRONTEND_URL}/job-listings`)}
          <p style="margin:12px 0 0;"><a href="${FRONTEND_URL}/dashboard" style="color:#6B7280;font-size:12px;text-decoration:none;">Manage job alerts →</a></p>
        </div>
      </div>`;

    await transporter.sendMail({
      from: `"ZyncJobs Jobs" <${process.env.SMTP_FROM_EMAIL}>`,
      to: userEmail,
      subject: `${jobs.length} new job${jobs.length > 1 ? 's' : ''} matching your alert`,
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
        ${featureCard('<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="#5C6BC8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>', 'Post Jobs', 'Publish openings instantly to thousands of candidates')}
        ${featureCard('<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="11" cy="11" r="8" stroke="#5C6BC8" stroke-width="2"/><line x1="21" y1="21" x2="16.65" y2="16.65" stroke="#5C6BC8" stroke-width="2" stroke-linecap="round"/></svg>', 'Find Talent', 'AI-powered candidate search &amp; ranking')}
        ${featureCard('<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="3" width="7" height="7" stroke="#5C6BC8" stroke-width="2" rx="1"/><rect x="14" y="3" width="7" height="7" stroke="#5C6BC8" stroke-width="2" rx="1"/><rect x="3" y="14" width="7" height="7" stroke="#5C6BC8" stroke-width="2" rx="1"/><rect x="14" y="14" width="7" height="7" stroke="#5C6BC8" stroke-width="2" rx="1"/></svg>', 'Track Apps', 'Manage all applications in one dashboard')}
      </tr>
    </table>`;

    const candidateFeatures = `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
      <tr>
        ${featureCard('<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="7" width="20" height="14" rx="2" stroke="#5C6BC8" stroke-width="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" stroke="#5C6BC8" stroke-width="2"/></svg>', 'Browse Jobs', 'Thousands of verified job openings')}
        ${featureCard('<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" stroke="#5C6BC8" stroke-width="2"/><path d="M12 8v4l3 3" stroke="#5C6BC8" stroke-width="2" stroke-linecap="round"/></svg>', 'AI Match', 'Get personalized job recommendations')}
        ${featureCard('<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#5C6BC8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><polyline points="14 2 14 8 20 8" stroke="#5C6BC8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>', 'Build Resume', 'Create a professional resume in minutes')}
      </tr>
    </table>`;

    const content = `
      <!-- Hero -->
      <div style="background:linear-gradient(135deg,#4F46E5 0%,#7C3AED 100%);padding:40px;text-align:center;">
        <div style="margin-bottom:12px;"><svg width="52" height="52" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><polyline points="22 4 12 14.01 9 11.01" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
        <h1 style="color:#FFFFFF;font-size:26px;font-weight:800;margin:0 0 8px;">Welcome to ZyncJobs!</h1>
        <p style="color:rgba(255,255,255,0.85);font-size:15px;margin:0;">Your ${isEmployer ? 'hiring' : 'career'} journey starts here</p>
      </div>

      <!-- Body -->
      <div style="padding:36px 40px;">
        <h2 style="color:#1F2937;font-size:20px;margin:0 0 12px;">Hi ${name}!</h2>
        <p style="color:#4B5563;font-size:15px;line-height:1.7;margin:0 0 20px;">
          ${isEmployer
            ? 'Your employer account is ready. Start posting jobs and find top talent faster with AI-powered matching.'
            : 'Your account is ready. Discover thousands of jobs tailored to your skills and experience.'}
        </p>

        ${isEmployer ? employerFeatures : candidateFeatures}

        ${divider()}

        <!-- Progress Steps -->
        <p style="color:#1F2937;font-size:14px;font-weight:700;margin:0 0 12px;">Get started in 3 steps:</p>
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
          ${ctaButton(isEmployer ? 'Start Hiring Now' : 'Explore Jobs', isEmployer ? `${FRONTEND_URL}/employer-complete-profile` : `${FRONTEND_URL}/job-listings`)}
          <p style="margin:14px 0 0;"><a href="${FRONTEND_URL}/dashboard" style="color:#4F46E5;font-size:13px;text-decoration:none;">Or go to your dashboard →</a></p>
        </div>

        ${divider()}

        <!-- Support -->
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="background:#F9FAFB;border-radius:10px;padding:16px 20px;">
              <p style="color:#1F2937;font-size:13px;font-weight:700;margin:0 0 6px;">Need help getting started?</p>
              <p style="color:#6B7280;font-size:13px;margin:0;"><a href="mailto:Admin@zyncjobs.com" style="color:#5C6BC8;">Admin@zyncjobs.com</a></p>
            </td>
          </tr>
        </table>
      </div>`;

    await transporter.sendMail({
      from: `"ZyncJobs" <${process.env.SMTP_FROM_EMAIL}>`,
      to: userEmail,
      subject: `Welcome to ZyncJobs, ${name}!`,
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
    const { baseTemplate, ctaButton, infoBox, divider, FRONTEND_URL } = await import('./emailTemplates.js');
    const name = candidateName || 'there';

    const configs = {
      application_status: {
        subject: `Follow-up: Your application for ${jobTitle}`,
        icon: '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><polyline points="14 2 14 8 20 8" stroke="white" stroke-width="2"/><line x1="16" y1="13" x2="8" y2="13" stroke="white" stroke-width="2" stroke-linecap="round"/><line x1="16" y1="17" x2="8" y2="17" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>',
        title: 'Application Follow-up', subtitle: 'We wanted to keep you updated',
        body: `Your application for <strong>${jobTitle}</strong> at <strong>${company}</strong> is still under review. We appreciate your patience and will update you as soon as we have more information.`,
        cta: 'Track Application', ctaUrl: `${FRONTEND_URL}/my-applications`,
      },
      interview_reminder: {
        subject: `Interview Reminder: ${jobTitle} at ${company}`,
        icon: '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" stroke="white" stroke-width="2"/><line x1="16" y1="2" x2="16" y2="6" stroke="white" stroke-width="2" stroke-linecap="round"/><line x1="8" y1="2" x2="8" y2="6" stroke="white" stroke-width="2" stroke-linecap="round"/><line x1="3" y1="10" x2="21" y2="10" stroke="white" stroke-width="2"/></svg>',
        title: 'Interview Reminder', subtitle: 'Your interview is coming up soon',
        body: `This is a reminder about your upcoming interview for <strong>${jobTitle}</strong> at <strong>${company}</strong>. Please be prepared and arrive on time. Good luck!`,
        extra: reminderData ? infoBox(`
          <table cellpadding="0" cellspacing="0" width="100%">
            <tr><td style="padding:3px 0;width:100px;"><span style="color:#6B7280;font-size:13px;">Date</span></td><td><strong style="color:#1F2937;font-size:13px;">${reminderData.interviewDate ? new Date(reminderData.interviewDate).toLocaleDateString() : 'TBD'}</strong></td></tr>
            <tr><td style="padding:3px 0;"><span style="color:#6B7280;font-size:13px;">Time</span></td><td><strong style="color:#1F2937;font-size:13px;">${reminderData.interviewTime || 'TBD'}</strong></td></tr>
            <tr><td style="padding:3px 0;"><span style="color:#6B7280;font-size:13px;">Type</span></td><td><strong style="color:#1F2937;font-size:13px;">${reminderData.interviewType || 'TBD'}</strong></td></tr>
            ${reminderData.interviewLocation ? `<tr><td style="padding:3px 0;"><span style="color:#6B7280;font-size:13px;">Location</span></td><td><strong style="color:#1F2937;font-size:13px;">${reminderData.interviewLocation}</strong></td></tr>` : ''}
            ${reminderData.meetingLink ? `<tr><td style="padding:3px 0;"><span style="color:#6B7280;font-size:13px;">Link</span></td><td><a href="${reminderData.meetingLink}" style="color:#5C6BC8;font-size:13px;">Join Meeting</a></td></tr>` : ''}
          </table>`) : '',
        cta: reminderData?.meetingLink ? 'Join Interview' : 'View Details',
        ctaUrl: reminderData?.meetingLink || `${FRONTEND_URL}/interviews`,
      },
      follow_up: {
        subject: `Follow-up opportunity: ${jobTitle}`,
        icon: '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        title: 'Follow-up Opportunity', subtitle: 'We hope you are still interested',
        body: `We hope you're still interested in the <strong>${jobTitle}</strong> position at <strong>${company}</strong>. If you have any questions or would like to provide additional information, please don't hesitate to reach out.`,
        cta: 'View Job', ctaUrl: `${FRONTEND_URL}/job-listings`,
      },
      deadline_reminder: {
        subject: `Deadline Reminder: ${jobTitle} application`,
        icon: '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" stroke="white" stroke-width="2"/><polyline points="12 6 12 12 16 14" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        title: 'Application Deadline', subtitle: 'The deadline is approaching',
        body: `The application deadline for <strong>${jobTitle}</strong> at <strong>${company}</strong> is approaching. Please ensure you complete any pending requirements before the deadline.`,
        cta: 'Complete Application', ctaUrl: `${FRONTEND_URL}/my-applications`,
      },
    };

    const cfg = configs[reminderType] || {
      subject: `Update: ${jobTitle} application`,
      icon: '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" stroke="white" stroke-width="2"/><polyline points="22,6 12,13 2,6" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>',
      title: 'Application Update', subtitle: 'An update on your application',
      body: `We have an update regarding your application for <strong>${jobTitle}</strong> at <strong>${company}</strong>.`,
      cta: 'View Application', ctaUrl: `${FRONTEND_URL}/my-applications`,
    };

    const subject = cfg.subject;

    const reminderContent = `
      <div style="background:linear-gradient(175deg,#5C6BC8 0%,#4A58B8 50%,#6878D0 100%);padding:28px 32px;text-align:center;">
        <div style="margin-bottom:8px;">${cfg.icon}</div>
        <h1 style="color:#FFFFFF;font-size:22px;font-weight:800;margin:0 0 6px;">${cfg.title}</h1>
        <p style="color:rgba(255,255,255,0.85);font-size:14px;margin:0;">${cfg.subtitle}</p>
      </div>
      <div style="padding:32px 36px;">
        <h2 style="color:#1F2937;font-size:18px;margin:0 0 10px;">Hi ${name}!</h2>
        <p style="color:#4B5563;font-size:15px;line-height:1.7;margin:0 0 20px;">${cfg.body}</p>
        ${cfg.extra || ''}
        ${divider()}
        <div style="text-align:center;margin:24px 0;">
          ${ctaButton(cfg.cta, cfg.ctaUrl)}
        </div>
      </div>`;

    const mailOptions = {
      from: employerEmail ? `"${employerName || company}" <${employerEmail}>` : `"ZyncJobs" <${process.env.SMTP_FROM_EMAIL}>`,
      replyTo: employerEmail || process.env.SMTP_FROM_EMAIL,
      to: candidateEmail,
      subject,
      html: baseTemplate(reminderContent, cfg.subtitle)
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
        <div style="margin-bottom:10px;"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" stroke="white" stroke-width="2"/><polyline points="22,6 12,13 2,6" stroke="white" stroke-width="2" stroke-linecap="round"/></svg></div>
        <h1 style="color:#FFFFFF;font-size:22px;font-weight:800;margin:0 0 6px;">New Application!</h1>
        <p style="color:rgba(255,255,255,0.85);font-size:14px;margin:0;">Someone applied to your job posting</p>
      </div>

      <!-- Body -->
      <div style="padding:36px 40px;">
        <h2 style="color:#1F2937;font-size:18px;margin:0 0 10px;">Hi ${employerName || 'there'}!</h2>
        <p style="color:#4B5563;font-size:15px;line-height:1.7;margin:0 0 20px;">
          A new candidate has applied for <strong>${jobTitle}</strong> at <strong>${company}</strong>.
        </p>

        ${infoBox(`
          <p style="color:#1F2937;font-size:14px;font-weight:700;margin:0 0 12px;">Candidate Details</p>
          <table cellpadding="0" cellspacing="0" width="100%">
            <tr><td style="padding:4px 0;width:80px;"><span style="color:#6B7280;font-size:13px;">Name</span></td><td style="padding:4px 0;"><strong style="color:#1F2937;font-size:14px;">${name}</strong></td></tr>
            <tr><td style="padding:4px 0;"><span style="color:#6B7280;font-size:13px;">Email</span></td><td style="padding:4px 0;"><a href="mailto:${email}" style="color:#4F46E5;font-size:14px;">${email}</a></td></tr>
            <tr><td style="padding:4px 0;"><span style="color:#6B7280;font-size:13px;">Phone</span></td><td style="padding:4px 0;"><strong style="color:#1F2937;font-size:14px;">${phone || 'Not provided'}</strong></td></tr>
            ${resumeUrl && !resumeUrl.startsWith('uploads/') ? `<tr><td style="padding:4px 0;"><span style="color:#6B7280;font-size:13px;">Resume</span></td><td style="padding:4px 0;"><a href="${resumeUrl}" style="color:#4F46E5;font-size:14px;">View Resume</a></td></tr>` : ''}
          </table>
        `, '#059669')}

        ${coverLetter ? `<div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:10px;padding:16px 20px;margin:16px 0;"><p style="color:#1F2937;font-size:13px;font-weight:700;margin:0 0 8px;">Cover Letter</p><p style="color:#4B5563;font-size:13px;line-height:1.6;margin:0;">${coverLetter.substring(0, 300)}${coverLetter.length > 300 ? '...' : ''}</p></div>` : ''}

        ${divider()}

        <div style="text-align:center;margin:24px 0;">
          ${ctaButton('Review Application', `${FRONTEND_URL}/dashboard`, '#059669')}
        </div>
      </div>`;

    await transporter.sendMail({
      from: `"ZyncJobs" <${process.env.SMTP_FROM_EMAIL}>`,
      replyTo: process.env.SMTP_FROM_EMAIL,
      to: employerEmail,
      subject: `New Application — ${name} applied for ${jobTitle}`,
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
        <div style="margin-bottom:10px;"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
        <h1 style="color:#FFFFFF;font-size:22px;font-weight:800;margin:0 0 6px;">Admin Invitation</h1>
        <p style="color:rgba(255,255,255,0.85);font-size:14px;margin:0;">You've been invited to ZyncJobs Admin</p>
      </div>
      <div style="padding:36px 40px;">
        <h2 style="color:#1F2937;font-size:18px;margin:0 0 10px;">Hi ${name}!</h2>
        <p style="color:#4B5563;font-size:15px;line-height:1.7;margin:0 0 20px;">
          You've been invited to join ZyncJobs as a <strong style="color:#2563eb;">${roleLabel}</strong>.
          Click the button below to set your password and activate your account.
        </p>
        <div style="background:#f0f9ff;border:1px solid #bfdbfe;border-radius:10px;padding:16px 20px;margin:0 0 24px;">
          <p style="color:#1e40af;font-size:13px;margin:0;">This invitation link expires in <strong>24 hours</strong>.</p>
        </div>
        <div style="text-align:center;margin:24px 0;">
          ${ctaButton('Activate Admin Account', inviteUrl, '#2563eb')}
        </div>
        <p style="color:#9CA3AF;font-size:12px;text-align:center;margin:16px 0 0;">If you didn't expect this invitation, you can safely ignore this email.</p>
      </div>`;

    await transporter.sendMail({
      from: `"ZyncJobs Admin" <${process.env.SMTP_FROM_EMAIL}>`,
      to: toEmail,
      subject: `You're invited as ${roleLabel} — ZyncJobs`,
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
        <div style="margin-bottom:10px;"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="9" x2="12" y2="13" stroke="white" stroke-width="2" stroke-linecap="round"/><line x1="12" y1="17" x2="12.01" y2="17" stroke="white" stroke-width="2" stroke-linecap="round"/></svg></div>
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
          <p style="color:#92400E;font-size:14px;font-weight:700;margin:0 0 6px;">30-Day Notice</p>
          <p style="color:#78350F;font-size:13px;margin:0;line-height:1.6;">If there is no activity in the next <strong>30 days</strong>, your resume will be automatically removed per our data retention policy.</p>
        </div>

        <p style="color:#1F2937;font-size:14px;font-weight:700;margin:0 0 10px;">What you can do:</p>
        <table cellpadding="0" cellspacing="0" width="100%">
          <tr><td style="padding:6px 0;"><a href="${FRONTEND_URL}/dashboard" style="color:#4F46E5;font-size:14px;text-decoration:none;">→ Login to keep your resume active</a></td></tr>
          <tr><td style="padding:6px 0;"><a href="${FRONTEND_URL}/resume-builder" style="color:#4F46E5;font-size:14px;text-decoration:none;">→ Update your resume</a></td></tr>
          <tr><td style="padding:6px 0;"><a href="${FRONTEND_URL}/privacy-settings" style="color:#4F46E5;font-size:14px;text-decoration:none;">→ Delete your resume anytime</a></td></tr>
        </table>

        ${divider()}

        <div style="text-align:center;margin:24px 0;">
          ${ctaButton('Keep My Resume Active', `${FRONTEND_URL}/dashboard`, '#F59E0B')}
        </div>

        <p style="color:#9CA3AF;font-size:12px;text-align:center;margin:0;">To manage privacy settings: <a href="${FRONTEND_URL}/privacy-settings" style="color:#4F46E5;">Privacy Settings</a></p>
      </div>`;

    await transporter.sendMail({
      from: `"ZyncJobs" <${process.env.SMTP_FROM_EMAIL}>`,
      to: userEmail,
      subject: 'Your ZyncJobs resume — action required',
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
    const typeLabel = type === 'video' ? 'Video Call' : type === 'phone' ? 'Phone Call' : 'In Person';

    const content = `
      <!-- Hero -->
      <div style="background:linear-gradient(135deg,#7C3AED 0%,#4F46E5 100%);padding:36px 40px;text-align:center;">
        <div style="margin-bottom:10px;"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" stroke="white" stroke-width="2"/><line x1="16" y1="2" x2="16" y2="6" stroke="white" stroke-width="2" stroke-linecap="round"/><line x1="8" y1="2" x2="8" y2="6" stroke="white" stroke-width="2" stroke-linecap="round"/><line x1="3" y1="10" x2="21" y2="10" stroke="white" stroke-width="2"/></svg></div>
        <h1 style="color:#FFFFFF;font-size:22px;font-weight:800;margin:0 0 6px;">Interview Scheduled!</h1>
        <p style="color:rgba(255,255,255,0.85);font-size:14px;margin:0;">You're one step closer to your dream job</p>
      </div>

      <!-- Body -->
      <div style="padding:36px 40px;">
        <h2 style="color:#1F2937;font-size:18px;margin:0 0 10px;">Hi ${name}!</h2>
        <p style="color:#4B5563;font-size:15px;line-height:1.7;margin:0 0 20px;">
          Your interview for <strong>${jobTitle}</strong> at <strong>${company}</strong> has been confirmed. Here are your details:
        </p>

        ${infoBox(`
          <table cellpadding="0" cellspacing="0" width="100%">
            <tr><td style="padding:6px 0;width:120px;"><span style="color:#6B7280;font-size:13px;">Date</span></td><td style="padding:6px 0;"><strong style="color:#1F2937;font-size:14px;">${interviewDate.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</strong></td></tr>
            <tr><td style="padding:6px 0;"><span style="color:#6B7280;font-size:13px;">Time</span></td><td style="padding:6px 0;"><strong style="color:#1F2937;font-size:14px;">${interviewDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</strong></td></tr>
            <tr><td style="padding:6px 0;"><span style="color:#6B7280;font-size:13px;">Duration</span></td><td style="padding:6px 0;"><strong style="color:#1F2937;font-size:14px;">${duration} minutes</strong></td></tr>
            <tr><td style="padding:6px 0;"><span style="color:#6B7280;font-size:13px;">Type</span></td><td style="padding:6px 0;"><strong style="color:#1F2937;font-size:14px;">${typeLabel}</strong></td></tr>
            ${location ? `<tr><td style="padding:6px 0;"><span style="color:#6B7280;font-size:13px;">Location</span></td><td style="padding:6px 0;"><strong style="color:#1F2937;font-size:14px;">${location}</strong></td></tr>` : ''}
          </table>
        `, '#7C3AED')}

        ${notes ? `<div style="background:#FFF7ED;border:1px solid #F59E0B;border-radius:10px;padding:14px 18px;margin:16px 0;"><p style="color:#92400E;font-size:13px;font-weight:700;margin:0 0 4px;">Notes from interviewer</p><p style="color:#78350F;font-size:13px;margin:0;line-height:1.6;">${notes}</p></div>` : ''}

        <!-- Tips -->
        <div style="background:#F0FDF4;border-radius:10px;padding:16px 20px;margin:16px 0;">
          <p style="color:#065F46;font-size:13px;font-weight:700;margin:0 0 8px;">Interview Tips</p>
          <p style="color:#047857;font-size:12px;margin:3px 0;">• Test your equipment 15 mins before</p>
          <p style="color:#047857;font-size:12px;margin:3px 0;">• Research the company & role thoroughly</p>
          <p style="color:#047857;font-size:12px;margin:3px 0;">• Prepare STAR-format examples</p>
          <p style="color:#047857;font-size:12px;margin:3px 0;">• Have questions ready for the interviewer</p>
        </div>

        ${divider()}

        <div style="text-align:center;margin:24px 0;">
          ${meetingLink ? ctaButton('Join Interview', meetingLink, '#7C3AED') : ctaButton('View Details', `${FRONTEND_URL}/interviews`, '#7C3AED')}
        </div>
      </div>`;

    await transporter.sendMail({
      from: employerEmail ? `"${employerName || company}" <${employerEmail}>` : `"ZyncJobs" <${process.env.SMTP_FROM_EMAIL}>`,
      replyTo: employerEmail || process.env.SMTP_FROM_EMAIL,
      to: candidateEmail,
      subject: `Interview Scheduled — ${jobTitle} at ${company}`,
      html: baseTemplate(content, `Your interview for ${jobTitle} is confirmed!`)
    });
    console.log('✅ Interview scheduled email sent to:', candidateEmail);
    return { success: true };
  } catch (error) {
    console.error('❌ Interview email error:', error);
    return { success: false, error: error.message };
  }
};
