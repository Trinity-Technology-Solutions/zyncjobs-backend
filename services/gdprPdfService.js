import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { formatJobCode } from '../utils/idGenerator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const C = {
  primary:   '#1e3a8a',
  accent:    '#f97316',
  white:     '#ffffff',
  dark:      '#1f2937',
  body:      '#374151',
  muted:     '#6b7280',
  light:     '#f8fafc',
  border:    '#e2e8f0',
  green:     '#16a34a',
  greenBg:   '#dcfce7',
  blueBg:    '#eff6ff',
};

const F = { bold: 'Helvetica-Bold', normal: 'Helvetica', oblique: 'Helvetica-Oblique' };
const M = 45;
const PW = 595.28;
const CW = PW - M * 2;

function addPage(doc) {
  doc.addPage();
}

function checkPage(doc, needed = 80) {
  if (doc.y + needed > doc.page.height - 60) addPage(doc);
}

function hline(doc, y, color = C.border, w = 1) {
  doc.moveTo(M, y).lineTo(M + CW, y).strokeColor(color).lineWidth(w).stroke();
}

function sectionBanner(doc, title, subtitle = '') {
  checkPage(doc, 50);
  doc.moveDown(0.6);
  const y = doc.y;
  doc.rect(M, y, CW, 28).fill(C.primary);
  doc.font(F.bold).fontSize(9.5).fillColor(C.white)
     .text(title.toUpperCase(), M + 12, y + 9, { width: CW - 120, characterSpacing: 0.8 });
  if (subtitle) {
    doc.font(F.normal).fontSize(8.5).fillColor('#93c5fd')
       .text(subtitle, M + CW - 110, y + 10, { width: 100, align: 'right' });
  }
  doc.moveDown(0.1);
  doc.y = y + 34;
}

function row(doc, label, value, opts = {}) {
  checkPage(doc, 22);
  const y = doc.y;
  const labelW = opts.labelW || 160;
  const valX = M + labelW;
  const valW = CW - labelW;

  // Zebra stripe
  if (opts.stripe) {
    doc.rect(M, y - 2, CW, 18).fill(C.light).fillColor(C.light);
  }

  doc.font(F.bold).fontSize(9).fillColor(C.dark)
     .text(label, M + 8, y, { width: labelW - 10 });

  const displayVal = (value === null || value === undefined || value === '') ? 'N/A' : String(value);
  doc.font(F.normal).fontSize(9).fillColor(displayVal === 'N/A' ? C.muted : C.body)
     .text(displayVal, valX, y, { width: valW - 8 });

  doc.y = y + 18;
}

function badge(doc, text, x, y, bgColor, textColor = C.white) {
  const tw = doc.font(F.bold).fontSize(7.5).widthOfString(text);
  const bw = tw + 14;
  const bh = 14;
  doc.roundedRect(x, y, bw, bh, 4).fill(bgColor);
  doc.font(F.bold).fontSize(7.5).fillColor(textColor)
     .text(text, x + 7, y + 3.5, { width: tw });
  return bw;
}

function statusBadge(doc, status, x, y) {
  const s = (status || '').toLowerCase();
  const map = {
    hired:       { bg: '#16a34a', label: 'HIRED' },
    shortlisted: { bg: '#2563eb', label: 'SHORTLISTED' },
    interviewed: { bg: '#7c3aed', label: 'INTERVIEWED' },
    reviewed:    { bg: '#0891b2', label: 'REVIEWED' },
    rejected:    { bg: '#dc2626', label: 'REJECTED' },
    withdrawn:   { bg: '#9ca3af', label: 'WITHDRAWN' },
    pending:     { bg: '#d97706', label: 'PENDING' },
    applied:     { bg: '#059669', label: 'APPLIED' },
  };
  const cfg = map[s] || { bg: C.muted, label: (status || 'UNKNOWN').toUpperCase() };
  badge(doc, cfg.label, x, y, cfg.bg);
}

function enabledBadge(doc, val, x, y) {
  if (val) {
    badge(doc, 'ENABLED', x, y, C.green);
  } else {
    badge(doc, 'DISABLED', x, y, '#dc2626');
  }
}

/**
 * Generates the GDPR data export PDF for both employers and candidates.
 * @param {object} data  - { user, jobs, applications, consent, resumes }
 * @returns {Promise<Buffer>}
 */
export function generateGdprPdf(data) {
  return new Promise((resolve, reject) => {
    try {
      const { user, jobs = [], applications = [], consent, resumes = [] } = data;
      const isEmployer = user.role === 'employer';
      
      // Debug logging
      console.log('🔍 GDPR PDF Generation Debug:');
      console.log('User role:', user.role);
      console.log('Is employer:', isEmployer);
      console.log('User email:', user.email);
      console.log('Jobs count:', jobs.length);
      console.log('Applications count:', applications.length);
      console.log('Resumes count:', resumes.length);
      
      const doc = new PDFDocument({ size: 'A4', margin: M, bufferPages: true });
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // ── HEADER BANNER ────────────────────────────────────────────────────────
      doc.rect(0, 0, PW, 72).fill(C.primary);

      // Company logo (if available)
      const logoPath = path.join(__dirname, '..', 'public', 'images', 'trinity-logo.webp');
      let logoDrawn = false;
      if (fs.existsSync(logoPath)) {
        try {
          doc.image(logoPath, M, 14, { height: 44, fit: [120, 44] });
          logoDrawn = true;
        } catch (_) {}
      }

      // Brand text
      const brandX = logoDrawn ? M + 130 : M;
      doc.font(F.bold).fontSize(20).fillColor(C.white)
         .text('ZYNC', brandX, 18, { continued: true })
         .font(F.bold).fontSize(20).fillColor(C.accent)
         .text(' JOBS', { continued: false });

      // Header meta
      const metaX = PW - M - 200;
      doc.font(F.normal).fontSize(8).fillColor('#bfdbfe')
         .text('Data Export Report  ·  GDPR Art. 20 — Portability', metaX, 20, { width: 200, align: 'right' });
      doc.font(F.normal).fontSize(7.5).fillColor('#93c5fd')
         .text(`Generated: ${new Date().toLocaleString()}`, metaX, 32, { width: 200, align: 'right' });

      doc.y = 88;

      if (isEmployer) {
        console.log('📊 Generating EMPLOYER PDF content');
        // ── EMPLOYER: COMPANY PROFILE ────────────────────────────────────────────
        sectionBanner(doc, 'Company Profile');

        // GDPR export — only the 4 required fields; no blanks
        const contactName = user.name || user.fullName || user.contactPerson || null;
        const profileRows = [
          ['Company Name',  user.companyName || user.company],
          ['Contact Name',  contactName],
          ['Email',         user.email],
          ['Account Role',  user.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : 'Employer'],
        ];
        profileRows.forEach(([label, val], i) => row(doc, label, val, { stripe: i % 2 === 0 }));

        // ── EMPLOYER: PRIVACY SETTINGS ───────────────────────────────────────────
        sectionBanner(doc, 'Privacy Settings');

        const privacyItems = [
          ['Store Company Profile',       consent?.storeResume ?? true],
          ['Allow Candidates to View',    consent?.allowEmployerView ?? true],
          ['Receive Application Alerts',  consent?.receiveJobAlerts ?? true],
          ['AI-Based Candidate Matching', consent?.allowAIRecommendations ?? true],
        ];

        privacyItems.forEach(([label, val], i) => {
          checkPage(doc, 24);
          const y = doc.y;
          if (i % 2 === 0) doc.rect(M, y - 2, CW, 20).fill(C.light);
          doc.font(F.bold).fontSize(9).fillColor(C.dark)
             .text(label, M + 8, y, { width: CW - 100 });
          enabledBadge(doc, val, M + CW - 80, y);
          doc.y = y + 20;
        });

        // ── EMPLOYER: JOB POSTINGS ───────────────────────────────────────────────
        sectionBanner(doc, 'Job Postings', `${jobs.length} total`);

        if (jobs.length === 0) {
          doc.font(F.oblique).fontSize(9).fillColor(C.muted)
             .text('No job postings found.', M + 8, doc.y);
          doc.moveDown(0.5);
        }

        jobs.forEach((job, idx) => {
          checkPage(doc, 140);

          // Job title heading
          doc.moveDown(0.3);
          doc.font(F.bold).fontSize(10.5).fillColor(C.primary)
             .text(`${idx + 1}. ${job.jobTitle || job.title || 'Untitled'}`, M + 8, doc.y);
          doc.moveDown(0.15);
          hline(doc, doc.y, C.border, 0.5);
          doc.moveDown(0.2);

          // Format Employer ID: prefer job.employerId, fallback to user.employerId
          const rawEmpId = job.employerId || user.employerId || user.id || '';
          const formattedEmpId = rawEmpId
            ? (/^EID/i.test(rawEmpId) ? rawEmpId : (/^\d+$/.test(rawEmpId) ? `EID${String(rawEmpId).padStart(4, '0')}` : rawEmpId))
            : null;

          // Format Position Code
          const positionCode = job.positionCode || formatJobCode(job.positionId, job.company) || job.positionId || null;

          const jobRows = [
            ['Employer ID',    formattedEmpId],
            ['Position Code',  positionCode],
            ['Category',       job.jobCategory || job.category],
            ['Status',         job.status],
            ['Location',       job.location],
            ['Type',           job.jobType],
            ['Posted',         job.createdAt ? new Date(job.createdAt).toLocaleDateString() : null],
          ];
          jobRows.forEach(([label, val], i) => row(doc, label, val, { stripe: i % 2 === 0, labelW: 130 }));

          // Hiring data for this job
          const jobApps = applications.filter(a => a.jobId === job.id);
          if (jobApps.length > 0) {
            checkPage(doc, 40);
            doc.moveDown(0.3);

            // Hiring data sub-banner
            const hy = doc.y;
            doc.rect(M + 8, hy, CW - 8, 22).fill(C.blueBg);
            doc.font(F.bold).fontSize(9).fillColor(C.primary)
               .text(`HIRING DATA  (${jobApps.length} application${jobApps.length !== 1 ? 's' : ''})`, M + 16, hy + 6, { width: CW - 24 });
            doc.y = hy + 28;

            // Status summary
            const summary = {};
            jobApps.forEach(a => { summary[a.status] = (summary[a.status] || 0) + 1; });
            doc.font(F.bold).fontSize(8.5).fillColor(C.dark).text('Summary:', M + 16, doc.y);
            doc.moveDown(0.15);
            Object.entries(summary).forEach(([st, cnt]) => {
              doc.font(F.normal).fontSize(8.5).fillColor(C.body)
                 .text(`${st.charAt(0).toUpperCase() + st.slice(1)}: ${cnt}`, M + 28, doc.y);
              doc.moveDown(0.15);
            });
            doc.moveDown(0.2);
          }

          doc.moveDown(0.4);
          hline(doc, doc.y, C.border, 0.5);
        });

        // ── EMPLOYER: CANDIDATE APPLICATIONS ─────────────────────────────────────
        // Always render this section — show 0 if no applications exist
        {
          // Build job title lookup
          const jobMap = {};
          jobs.forEach(j => { jobMap[j.id] = j.jobTitle || j.title || ''; });

          sectionBanner(doc, 'Candidate Applications', `${applications.length} total`);

          if (applications.length === 0) {
            doc.font(F.oblique).fontSize(9).fillColor(C.muted)
               .text('No candidate applications found for your posted jobs.', M + 8, doc.y);
            doc.moveDown(0.5);
          } else {
            applications.forEach((app, idx) => {
              checkPage(doc, 100);
              doc.moveDown(0.3);

              // Candidate name heading
              doc.font(F.bold).fontSize(10).fillColor(C.primary)
                 .text(`${idx + 1}. ${app.candidateName || app.candidateEmail || 'Unknown Candidate'}`, M + 8, doc.y);
              doc.moveDown(0.15);
              hline(doc, doc.y, C.border, 0.5);
              doc.moveDown(0.2);

              // Applied Role row
              checkPage(doc, 22);
              const arY = doc.y;
              if (idx % 2 === 0) doc.rect(M, arY - 2, CW, 18).fill(C.light);
              doc.font(F.bold).fontSize(9).fillColor(C.dark)
                 .text('Applied Role', M + 8, arY, { width: 152 });
              const roleTitle = jobMap[app.jobId] || app.jobTitle || 'N/A';
              doc.font(F.bold).fontSize(9).fillColor(C.primary)
                 .text(roleTitle, M + 160, arY, { width: CW - 168 });
              doc.y = arY + 18;

              // Status row with badge
              checkPage(doc, 22);
              const stY = doc.y;
              if (idx % 2 !== 0) doc.rect(M, stY - 2, CW, 18).fill(C.light);
              doc.font(F.bold).fontSize(9).fillColor(C.dark)
                 .text('Status', M + 8, stY, { width: 152 });
              statusBadge(doc, app.status, M + 160, stY);
              doc.y = stY + 18;

              const appRows = [
                ['Email',      app.candidateEmail],
                ['Phone',      app.candidatePhone],
                ['Applied On', app.createdAt ? new Date(app.createdAt).toLocaleDateString() : null],
              ];
              appRows.forEach(([label, val], i) => {
                const stripe = (i + 2) % 2 === (idx % 2 === 0 ? 0 : 1);
                row(doc, label, val, { stripe, labelW: 160 });
              });

              doc.moveDown(0.3);
              hline(doc, doc.y, C.border, 0.5);
            });
          }
        }
      } else {
        console.log('👤 Generating CANDIDATE PDF content');
        // ── CANDIDATE: PERSONAL PROFILE ──────────────────────────────────────────
        sectionBanner(doc, 'Personal Profile');

        const candidateRows = [
          ['Full Name',     user.name],
          ['Email',         user.email],
          ['Phone',         user.phone],
          ['Location',      user.location],
          ['Job Title',     user.title],
          ['Bio',           user.bio],
          ['Skills',        Array.isArray(user.skills) ? user.skills.join(', ') : user.skills],
          ['Account Role',  user.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : null],
          ['Member Since',  user.createdAt ? new Date(user.createdAt).toLocaleDateString() : null],
        ];
        candidateRows.forEach(([label, val], i) => row(doc, label, val, { stripe: i % 2 === 0 }));

        // ── CANDIDATE: PRIVACY SETTINGS ──────────────────────────────────────────
        sectionBanner(doc, 'Privacy Settings');

        const candidatePrivacyItems = [
          ['Store My Resume',             consent?.storeResume ?? true],
          ['Allow Employers to View Profile', consent?.allowEmployerView ?? true],
          ['Receive Job Alerts',          consent?.receiveJobAlerts ?? true],
          ['Allow AI-Based Recommendations', consent?.allowAIRecommendations ?? true],
        ];

        candidatePrivacyItems.forEach(([label, val], i) => {
          checkPage(doc, 24);
          const y = doc.y;
          if (i % 2 === 0) doc.rect(M, y - 2, CW, 20).fill(C.light);
          doc.font(F.bold).fontSize(9).fillColor(C.dark)
             .text(label, M + 8, y, { width: CW - 100 });
          enabledBadge(doc, val, M + CW - 80, y);
          doc.y = y + 20;
        });

        // ── CANDIDATE: RESUME DATA ────────────────────────────────────────────────
        sectionBanner(doc, 'Resume Data', `${resumes.length} resume${resumes.length !== 1 ? 's' : ''}`);

        if (resumes.length === 0) {
          doc.font(F.oblique).fontSize(9).fillColor(C.muted)
             .text('No resumes uploaded.', M + 8, doc.y);
          doc.moveDown(0.5);
        } else {
          resumes.forEach((resume, idx) => {
            checkPage(doc, 80);
            doc.moveDown(0.3);

            // Resume heading
            doc.font(F.bold).fontSize(10.5).fillColor(C.primary)
               .text(`${idx + 1}. ${resume.fileName || 'Resume'}`, M + 8, doc.y);
            doc.moveDown(0.15);
            hline(doc, doc.y, C.border, 0.5);
            doc.moveDown(0.2);

            const resumeRows = [
              ['Status',      resume.status],
              ['File Name',   resume.fileName],
              ['Uploaded',    resume.createdAt ? new Date(resume.createdAt).toLocaleDateString() : null],
              ['File Size',   resume.fileSize ? `${Math.round(resume.fileSize / 1024)} KB` : null],
            ];
            resumeRows.forEach(([label, val], i) => row(doc, label, val, { stripe: i % 2 === 0, labelW: 120 }));

            doc.moveDown(0.4);
            hline(doc, doc.y, C.border, 0.5);
          });
        }

        // ── CANDIDATE: JOB APPLICATIONS ──────────────────────────────────────────
        sectionBanner(doc, 'Job Applications', `${applications.length} total`);

        if (applications.length === 0) {
          doc.font(F.oblique).fontSize(9).fillColor(C.muted)
             .text('No job applications found.', M + 8, doc.y);
          doc.moveDown(0.5);
        } else {
          applications.forEach((app, idx) => {
            checkPage(doc, 100);
            doc.moveDown(0.3);

            // Job title heading
            doc.font(F.bold).fontSize(10).fillColor(C.primary)
               .text(`${idx + 1}. ${app.jobTitle || 'Job Application'}`, M + 8, doc.y);
            doc.moveDown(0.15);
            hline(doc, doc.y, C.border, 0.5);
            doc.moveDown(0.2);

            // Status row with badge
            checkPage(doc, 22);
            const stY = doc.y;
            if (idx % 2 === 0) doc.rect(M, stY - 2, CW, 18).fill(C.light);
            doc.font(F.bold).fontSize(9).fillColor(C.dark)
               .text('Status', M + 8, stY, { width: 152 });
            statusBadge(doc, app.status, M + 160, stY);
            doc.y = stY + 18;

            const appRows = [
              ['Company',     app.companyName || app.employerName],
              ['Location',    app.jobLocation],
              ['Applied On',  app.createdAt ? new Date(app.createdAt).toLocaleDateString() : null],
              ['Job Type',    app.jobType],
            ];
            appRows.forEach(([label, val], i) => {
              const stripe = (i + 1) % 2 === (idx % 2 === 0 ? 0 : 1);
              row(doc, label, val, { stripe, labelW: 160 });
            });

            doc.moveDown(0.3);
            hline(doc, doc.y, C.border, 0.5);
          });
        }
      }

      // ── FOOTER on all pages ───────────────────────────────────────────────────
      const totalPages = doc.bufferedPageRange().count;
      for (let i = 0; i < totalPages; i++) {
        doc.switchToPage(i);
        const fy = doc.page.height - 36;
        doc.rect(0, fy - 4, PW, 40).fill('#f1f5f9');
        hline(doc, fy - 4, C.border, 0.5);
        doc.font(F.normal).fontSize(7.5).fillColor(C.muted)
           .text('ZyncJobs  ·  privacy@zyncjobs.com  ·  GDPR Art. 20 Data Portability', M, fy + 4, { width: CW - 80 });
        doc.font(F.normal).fontSize(7.5).fillColor(C.muted)
           .text(`Page ${i + 1} of ${totalPages}`, M, fy + 4, { width: CW, align: 'right' });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
