import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// Create transporter using Gmail SMTP
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
    const mailOptions = {
      from: process.env.SMTP_EMAIL,
      to: candidateEmail,
      subject: `Application Received - ${jobTitle}`,
      html: `
        <h2>Application Confirmation</h2>
        <p>Dear ${candidateName},</p>
        <p>Thank you for applying to the position of <strong>${jobTitle}</strong> at <strong>${company}</strong>.</p>
        <p>We have received your application and will review it shortly. You will be notified of any updates.</p>
        <br>
        <p>Best regards,<br>Trinity Jobs Team</p>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log('✅ Application confirmation email sent to:', candidateEmail);
    return { success: true, message: 'Application email sent' };
  } catch (error) {
    console.error('❌ Email error:', error);
    return { success: false, error: error.message };
  }
};

// Send application rejection email
export const sendApplicationRejectionEmail = async (candidateEmail, candidateName, jobTitle, company) => {
  try {
    const mailOptions = {
      from: process.env.SMTP_EMAIL,
      to: candidateEmail,
      subject: `Application Update - ${jobTitle}`,
      html: `
        <h2>Application Update</h2>
        <p>Dear ${candidateName},</p>
        <p>Thank you for your interest in the position of <strong>${jobTitle}</strong> at <strong>${company}</strong>.</p>
        <p>After careful consideration, we have decided to move forward with other candidates whose qualifications more closely match our current needs.</p>
        <p>We encourage you to apply for future opportunities that match your skills and experience.</p>
        <br>
        <p>Best regards,<br>Trinity Jobs Team</p>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log('✅ Rejection email sent to:', candidateEmail);
    return { success: true, message: 'Rejection email sent' };
  } catch (error) {
    console.error('❌ Email error:', error);
    return { success: false, error: error.message };
  }
};

// Send application status update email
export const sendApplicationStatusEmail = async (candidateEmail, candidateName, jobTitle, company, status) => {
  try {
    const statusMessages = {
      applied: 'Your application has been received and is under review.',
      reviewed: 'Your application has been reviewed by our team.',
      shortlisted: 'Congratulations! You have been shortlisted for this position.',
      hired: 'Congratulations! You have been selected for this position.',
      rejected: 'Thank you for your interest. We have decided to move forward with other candidates.',
      withdrawn: 'Your application has been withdrawn as requested.'
    };

    const mailOptions = {
      from: process.env.SMTP_EMAIL,
      to: candidateEmail,
      subject: `Application Status Update - ${jobTitle}`,
      html: `
        <h2>Application Status Update</h2>
        <p>Dear ${candidateName},</p>
        <p>Your application for <strong>${jobTitle}</strong> at <strong>${company}</strong> has been updated.</p>
        <p><strong>Current Status:</strong> ${status.charAt(0).toUpperCase() + status.slice(1)}</p>
        <p>${statusMessages[status] || 'Your application status has been updated.'}</p>
        <br>
        <p>Best regards,<br>Trinity Jobs Team</p>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log('✅ Status update email sent to:', candidateEmail);
    return { success: true, message: 'Status email sent' };
  } catch (error) {
    console.error('❌ Email error:', error);
    return { success: false, error: error.message };
  }
};

// Send job alert email
export const sendJobAlertEmail = async (userEmail, userName, jobs) => {
  try {
    const jobsHtml = jobs.map(job => `
      <div style="border: 1px solid #ddd; padding: 15px; margin: 10px 0; border-radius: 5px;">
        <h3>${job.title}</h3>
        <p><strong>Company:</strong> ${job.company}</p>
        <p><strong>Location:</strong> ${job.location}</p>
        <p><strong>Salary:</strong> ${job.salary || 'Not specified'}</p>
        <p>${job.description.substring(0, 200)}...</p>
      </div>
    `).join('');

    const mailOptions = {
      from: process.env.SMTP_EMAIL,
      to: userEmail,
      subject: `New Job Opportunities - ${jobs.length} matches found`,
      html: `
        <h2>New Job Opportunities</h2>
        <p>Dear ${userName},</p>
        <p>We found ${jobs.length} new job(s) matching your preferences:</p>
        ${jobsHtml}
        <br>
        <p>Visit Trinity Jobs to apply for these positions.</p>
        <p>Best regards,<br>Trinity Jobs Team</p>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log('✅ Job alert email sent to:', userEmail);
    return { success: true, message: 'Job alert email sent' };
  } catch (error) {
    console.error('❌ Email error:', error);
    return { success: false, error: error.message };
  }
};

// Send welcome email for new registrations
export const sendWelcomeEmail = async (userEmail, userName, userType) => {
  try {
    const subject = 'Welcome to ZyncJobs! 🎉';
    const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #6366f1; padding: 40px 20px; text-align: center;">
        <h1 style="color: white; margin: 0;">Welcome to ZyncJobs!</h1>
      </div>
      
      <div style="padding: 40px 30px; background-color: #f9f9f9;">
        <h2 style="color: #333;">Hello ${userName || 'there'}! 👋</h2>
        
        <p style="color: #333; font-size: 16px; line-height: 1.6;">
          Thank you for joining ZyncJobs! We're excited to have you as part of our community.
        </p>
        
        ${userType === 'employer' ? `
        <p style="color: #333; font-size: 16px; line-height: 1.6;">
          As an employer, you can now:
        </p>
        <ul style="color: #333; font-size: 16px; line-height: 1.8;">
          <li>Post unlimited job openings</li>
          <li>Search and connect with top candidates</li>
          <li>Manage applications efficiently</li>
          <li>Build your company profile</li>
        </ul>
        ` : `
        <p style="color: #333; font-size: 16px; line-height: 1.6;">
          As a job seeker, you can now:
        </p>
        <ul style="color: #333; font-size: 16px; line-height: 1.8;">
          <li>Browse thousands of job opportunities</li>
          <li>Apply to jobs with one click</li>
          <li>Build your professional profile</li>
          <li>Get AI-powered job recommendations</li>
        </ul>
        `}
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}" style="background-color: #6366f1; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Get Started
          </a>
        </div>
        
        <p style="color: #666; font-size: 14px;">
          If you have any questions, feel free to reach out to our support team.
        </p>
      </div>
      
      <div style="background-color: #f1f1f1; padding: 20px; text-align: center;">
        <p style="color: #666; margin: 0; font-size: 12px;">© 2025 ZyncJobs. All rights reserved.</p>
      </div>
    </div>
  `;

    const mailOptions = {
      from: `"ZyncJobs" <${process.env.SMTP_EMAIL}>`,
      to: userEmail,
      subject,
      html
    };

    await transporter.sendMail(mailOptions);
    console.log('✅ Welcome email sent to:', userEmail);
    return { success: true, message: 'Welcome email sent' };
  } catch (error) {
    console.error('❌ Welcome email error:', error);
    return { success: false, error: error.message };
  }
};

// Send follow-up reminder email
export const sendFollowUpReminderEmail = async (candidateEmail, candidateName, jobTitle, company, reminderType, reminderData = {}) => {
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
          <p>Best regards,<br>Trinity Jobs Team</p>
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
          <p>Best regards,<br>Trinity Jobs Team</p>
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
          <p>Best regards,<br>Trinity Jobs Team</p>
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
          <p>Best regards,<br>Trinity Jobs Team</p>
        `;
        break;
        
      default:
        subject = `Update: ${jobTitle} application`;
        html = `
          <h2>Application Update</h2>
          <p>Dear ${candidateName},</p>
          <p>We have an update regarding your application for <strong>${jobTitle}</strong> at <strong>${company}</strong>.</p>
          <br>
          <p>Best regards,<br>Trinity Jobs Team</p>
        `;
    }

    const mailOptions = {
      from: process.env.SMTP_EMAIL,
      to: candidateEmail,
      subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #6366f1; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">Trinity Jobs</h1>
          </div>
          <div style="padding: 30px; background-color: white;">
            ${html}
          </div>
          <div style="background-color: #f1f1f1; padding: 15px; text-align: center;">
            <p style="color: #666; margin: 0; font-size: 12px;">© 2025 Trinity Jobs. All rights reserved.</p>
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

export default { sendJobApplicationEmail, sendApplicationRejectionEmail, sendApplicationStatusEmail, sendJobAlertEmail, sendWelcomeEmail, sendFollowUpReminderEmail };

// Send interview scheduled email to candidate
export const sendInterviewScheduledEmail = async (candidateEmail, candidateName, jobTitle, company, interviewDetails) => {
  try {
    const { scheduledDate, duration, type, meetingLink, location, notes } = interviewDetails;
    const interviewDate = new Date(scheduledDate);
    
    const mailOptions = {
      from: `"ZyncJobs" <${process.env.SMTP_EMAIL}>`,
      to: candidateEmail,
      subject: `Interview Scheduled - ${jobTitle} at ${company}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #6366f1; padding: 30px 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">Interview Scheduled! 🎉</h1>
          </div>
          
          <div style="padding: 40px 30px; background-color: white;">
            <h2 style="color: #333;">Hello ${candidateName}! 👋</h2>
            
            <p style="color: #333; font-size: 16px; line-height: 1.6;">
              Great news! Your interview has been scheduled for the position of <strong>${jobTitle}</strong> at <strong>${company}</strong>.
            </p>
            
            <div style="background-color: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #6366f1;">
              <h3 style="color: #333; margin-top: 0;">📅 Interview Details</h3>
              <p style="margin: 10px 0;"><strong>Date:</strong> ${interviewDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
              <p style="margin: 10px 0;"><strong>Time:</strong> ${interviewDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</p>
              <p style="margin: 10px 0;"><strong>Duration:</strong> ${duration} minutes</p>
              <p style="margin: 10px 0;"><strong>Type:</strong> ${type === 'video' ? '🎥 Video Call' : type === 'phone' ? '📞 Phone Call' : '🏢 In Person'}</p>
              ${meetingLink ? `<p style="margin: 10px 0;"><strong>Meeting Link:</strong> <a href="${meetingLink}" style="color: #6366f1;">${meetingLink}</a></p>` : ''}
              ${location ? `<p style="margin: 10px 0;"><strong>Location:</strong> ${location}</p>` : ''}
            </div>
            
            ${notes ? `
            <div style="background-color: #fff7ed; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h4 style="color: #333; margin-top: 0;">📝 Additional Notes</h4>
              <p style="color: #666;">${notes}</p>
            </div>
            ` : ''}
            
            <div style="background-color: #f0fdf4; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h4 style="color: #333; margin-top: 0;">💡 Interview Tips</h4>
              <ul style="color: #666; line-height: 1.8;">
                <li>Test your equipment 15 minutes before the interview</li>
                <li>Research the company and role thoroughly</li>
                <li>Prepare examples of your work and achievements</li>
                <li>Have questions ready for the interviewer</li>
                <li>Dress professionally</li>
              </ul>
            </div>
            
            ${meetingLink ? `
            <div style="text-align: center; margin: 30px 0;">
              <a href="${meetingLink}" style="background-color: #6366f1; color: white; padding: 14px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                Join Interview
              </a>
            </div>
            ` : ''}
            
            <p style="color: #666; font-size: 14px; margin-top: 30px;">
              Good luck with your interview! If you need to reschedule or have any questions, please contact us as soon as possible.
            </p>
          </div>
          
          <div style="background-color: #f1f1f1; padding: 20px; text-align: center;">
            <p style="color: #666; margin: 0; font-size: 12px;">© 2025 ZyncJobs. All rights reserved.</p>
          </div>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log('✅ Interview scheduled email sent to:', candidateEmail);
    return { success: true, message: 'Interview email sent' };
  } catch (error) {
    console.error('❌ Interview email error:', error);
    return { success: false, error: error.message };
  }
};