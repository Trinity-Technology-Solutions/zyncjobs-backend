// Shared email base template for ZyncJobs

const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://www.zyncjobs.com').split(',')[0].trim();

// ─── BASE TEMPLATE ────────────────────────────────────────────────────────────
export const baseTemplate = (content, previewText = '') => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <title>ZyncJobs</title>
  ${previewText ? `<span style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${previewText}&nbsp;&zwnj;</span>` : ''}
</head>
<body style="margin:0;padding:0;background-color:#E9EBF0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#E9EBF0;padding:28px 16px 36px;">
    <tr><td align="center">
      <table width="620" cellpadding="0" cellspacing="0" style="max-width:620px;width:100%;">

        <!-- ═══ BODY ═══ -->
        <tr><td style="background:#FFFFFF;padding:0;">
          ${content}
        </td></tr>

        <!-- ═══ FOOTER ═══ -->
        <tr><td style="background:#1E2D5A;border-radius:0 0 20px 20px;padding:22px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="text-align:center;padding-bottom:14px;">
                <a href="${FRONTEND_URL}" style="color:#A0AABF;text-decoration:none;font-size:13px;margin:0 10px;">Home</a>
                <a href="${FRONTEND_URL}/job-listings" style="color:#A0AABF;text-decoration:none;font-size:13px;margin:0 10px;">Jobs</a>
                <a href="${FRONTEND_URL}/privacy" style="color:#A0AABF;text-decoration:none;font-size:13px;margin:0 10px;">Privacy</a>
                <a href="mailto:Admin@zyncjobs.com" style="color:#A0AABF;text-decoration:none;font-size:13px;margin:0 10px;">Support</a>
              </td>
            </tr>
            <tr>
              <td style="text-align:center;border-top:1px solid #2E3F6E;padding-top:14px;">
                <p style="color:#6B7A9F;font-size:12px;margin:0;">2026 ZyncJobs. All rights reserved.</p>
                <p style="font-size:11px;margin:5px 0 0;">
                  <span style="color:#6B7A9F;">ZyncJobs · </span>
                  <a href="mailto:Admin@zyncjobs.com" style="color:#7B8FD4;text-decoration:none;">Admin@zyncjobs.com</a>
                </p>
              </td>
            </tr>
          </table>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

// ─── CTA BUTTON ───────────────────────────────────────────────────────────────
// Dark teal/slate button matching the "Start Hiring Now" style in the image
export const ctaButton = (text, url, color = '#4F46E5') => `
<table cellpadding="0" cellspacing="0" style="margin:0 auto;">
  <tr><td style="border-radius:10px;background:linear-gradient(135deg,#3D5568 0%,#2C4455 100%);box-shadow:0 4px 12px rgba(0,0,0,0.2);">
    <a href="${url}" style="display:inline-block;padding:15px 48px;color:#FFFFFF;font-size:16px;font-weight:800;text-decoration:none;border-radius:10px;letter-spacing:0.4px;">${text}</a>
  </td></tr>
</table>`;

// ─── FEATURE CARD ─────────────────────────────────────────────────────────────
// Bordered card with icon, title, desc — matches the 3-column card row in the image
export const featureCard = (icon, title, desc) => `
<td style="width:33%;padding:6px;vertical-align:top;">
  <div style="background:#FFFFFF;border:1.5px solid #D8DCF0;border-radius:14px;padding:14px 10px;text-align:center;height:110px;box-sizing:border-box;display:table-cell;vertical-align:middle;">
    <div style="margin-bottom:8px;">${icon}</div>
    <p style="color:#1F2937;font-size:12px;font-weight:700;margin:0 0 4px;">${title}</p>
    <p style="color:#6B7280;font-size:11px;margin:0;line-height:1.5;">${desc}</p>
  </div>
</td>`;

// ─── STATUS BADGE ─────────────────────────────────────────────────────────────
export const statusBadge = (status) => {
  const map = {
    applied:     { color: '#3B82F6', bg: '#EFF6FF', label: 'Applied' },
    reviewed:    { color: '#F59E0B', bg: '#FFFBEB', label: 'Under Review' },
    shortlisted: { color: '#10B981', bg: '#ECFDF5', label: 'Shortlisted' },
    hired:       { color: '#059669', bg: '#D1FAE5', label: 'Hired!' },
    rejected:    { color: '#EF4444', bg: '#FEF2F2', label: 'Not Selected' },
    scheduled:   { color: '#8B5CF6', bg: '#F5F3FF', label: 'Interview Scheduled' },
  };
  const s = map[status] || { color: '#6B7280', bg: '#F9FAFB', label: status };
  return `<span style="display:inline-block;background:${s.bg};color:${s.color};border:1px solid ${s.color}33;border-radius:20px;padding:6px 16px;font-size:13px;font-weight:700;">${s.label}</span>`;
};

// ─── INFO BOX ─────────────────────────────────────────────────────────────────
export const infoBox = (content, color = '#5C6BC8') => `
<div style="background:${color}0D;border-left:4px solid ${color};border-radius:0 8px 8px 0;padding:16px 20px;margin:20px 0;">
  ${content}
</div>`;

// ─── DIVIDER ──────────────────────────────────────────────────────────────────
export const divider = () => `<hr style="border:none;border-top:1px solid #ECEEF5;margin:24px 0;"/>`;

export { FRONTEND_URL };
