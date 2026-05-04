// Shared premium email base template for ZyncJobs
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://zyncjobs.com';

// Brand colors
const BRAND = {
  primary: '#4F46E5',
  primaryDark: '#3730A3',
  gradient: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)',
  accent: '#F59E0B',
  success: '#10B981',
  danger: '#EF4444',
  text: '#1F2937',
  muted: '#6B7280',
  bg: '#F9FAFB',
  white: '#FFFFFF',
  border: '#E5E7EB',
};

// Base wrapper used by all emails
export const baseTemplate = (content, previewText = '') => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <title>ZyncJobs</title>
  ${previewText ? `<span style="display:none;max-height:0;overflow:hidden;">${previewText}</span>` : ''}
</head>
<body style="margin:0;padding:0;background-color:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- HEADER -->
        <tr><td style="background:linear-gradient(135deg,#4F46E5 0%,#7C3AED 100%);border-radius:16px 16px 0 0;padding:24px 40px;text-align:center;">
          <a href="${FRONTEND_URL}" style="text-decoration:none;display:inline-block;">
            <img src="${FRONTEND_URL}/images/zyncjobs-logo.png" alt="ZyncJobs" width="160" height="auto"
              style="display:block;max-width:160px;height:auto;margin:0 auto;"
              onerror="this.style.display='none'"/>
          </a>
          <p style="color:rgba(255,255,255,0.8);margin:8px 0 0;font-size:12px;letter-spacing:0.5px;">AI-Powered Hiring Platform</p>
        </td></tr>

        <!-- BODY -->
        <tr><td style="background:#FFFFFF;padding:0;">
          ${content}
        </td></tr>

        <!-- FOOTER -->
        <tr><td style="background:#1F2937;border-radius:0 0 16px 16px;padding:28px 40px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="text-align:center;padding-bottom:16px;">
                <a href="${FRONTEND_URL}" style="color:#9CA3AF;text-decoration:none;font-size:13px;margin:0 12px;">Home</a>
                <a href="${FRONTEND_URL}/job-listings" style="color:#9CA3AF;text-decoration:none;font-size:13px;margin:0 12px;">Jobs</a>
                <a href="${FRONTEND_URL}/privacy" style="color:#9CA3AF;text-decoration:none;font-size:13px;margin:0 12px;">Privacy</a>
                <a href="mailto:support@zyncjobs.com" style="color:#9CA3AF;text-decoration:none;font-size:13px;margin:0 12px;">Support</a>
              </td>
            </tr>
            <tr>
              <td style="text-align:center;border-top:1px solid #374151;padding-top:16px;">
                <p style="color:#6B7280;font-size:12px;margin:0;">© 2026 ZyncJobs. All rights reserved.</p>
                <p style="color:#4B5563;font-size:11px;margin:6px 0 0;">ZyncJobs · support@zyncjobs.com</p>
              </td>
            </tr>
          </table>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

// Big CTA button
export const ctaButton = (text, url, color = '#4F46E5') => `
<table cellpadding="0" cellspacing="0" style="margin:0 auto;">
  <tr><td style="border-radius:10px;background:linear-gradient(135deg,${color},#7C3AED);">
    <a href="${url}" style="display:inline-block;padding:14px 36px;color:#FFFFFF;font-size:15px;font-weight:700;text-decoration:none;border-radius:10px;letter-spacing:0.3px;">${text}</a>
  </td></tr>
</table>`;

// Feature card row (icon + title + desc)
export const featureCard = (icon, title, desc) => `
<td style="width:33%;padding:8px;vertical-align:top;">
  <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:12px;padding:16px;text-align:center;">
    <div style="font-size:28px;margin-bottom:8px;">${icon}</div>
    <p style="color:#1F2937;font-size:13px;font-weight:700;margin:0 0 4px;">${title}</p>
    <p style="color:#6B7280;font-size:12px;margin:0;line-height:1.5;">${desc}</p>
  </div>
</td>`;

// Status badge
export const statusBadge = (status) => {
  const map = {
    applied:     { color: '#3B82F6', bg: '#EFF6FF', label: '📋 Applied' },
    reviewed:    { color: '#F59E0B', bg: '#FFFBEB', label: '👀 Under Review' },
    shortlisted: { color: '#10B981', bg: '#ECFDF5', label: '⭐ Shortlisted' },
    hired:       { color: '#059669', bg: '#D1FAE5', label: '🎉 Hired!' },
    rejected:    { color: '#EF4444', bg: '#FEF2F2', label: '❌ Not Selected' },
    scheduled:   { color: '#8B5CF6', bg: '#F5F3FF', label: '📅 Interview Scheduled' },
  };
  const s = map[status] || { color: '#6B7280', bg: '#F9FAFB', label: status };
  return `<span style="display:inline-block;background:${s.bg};color:${s.color};border:1px solid ${s.color}33;border-radius:20px;padding:6px 16px;font-size:13px;font-weight:700;">${s.label}</span>`;
};

// Info box (highlight section)
export const infoBox = (content, color = '#4F46E5') => `
<div style="background:${color}0D;border-left:4px solid ${color};border-radius:0 8px 8px 0;padding:16px 20px;margin:20px 0;">
  ${content}
</div>`;

// Divider
export const divider = () => `<hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0;"/>`;

export { FRONTEND_URL };
