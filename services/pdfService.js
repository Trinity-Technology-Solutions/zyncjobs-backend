import PDFDocument from 'pdfkit';

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const COLORS = {
  heading:  '#1a1a2e',
  accent:   '#2563eb',
  body:     '#374151',
  muted:    '#6b7280',
  line:     '#e5e7eb',
};

const FONTS = {
  bold:    'Helvetica-Bold',
  normal:  'Helvetica',
  oblique: 'Helvetica-Oblique',
};

const MARGIN = 50;
const PAGE_W = 595.28; // A4
const CONTENT_W = PAGE_W - MARGIN * 2;

function sectionHeader(doc, title) {
  doc.moveDown(0.4);
  doc.font(FONTS.bold).fontSize(9).fillColor(COLORS.muted)
     .text(title.toUpperCase(), MARGIN, doc.y, { characterSpacing: 1.5 });
  doc.moveDown(0.15);
  doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + CONTENT_W, doc.y)
     .strokeColor(COLORS.line).lineWidth(1).stroke();
  doc.moveDown(0.3);
}

function checkNewPage(doc, neededHeight = 60) {
  if (doc.y + neededHeight > doc.page.height - MARGIN) {
    doc.addPage();
  }
}

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────

const pdfService = {
  /**
   * Generates a professional ATS-friendly resume PDF.
   * @param {object} resumeData  — shape from useResumeStore / ResumeBuilderAPI
   * @returns {Promise<Buffer>}
   */
  generateResumePDF: (resumeData) => {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true });
        const chunks = [];
        doc.on('data', (c) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const p = resumeData.personalInfo || resumeData;
        const name        = p.name        || resumeData.name        || 'Candidate';
        const email       = p.email       || resumeData.email       || '';
        const phone       = p.phone       || resumeData.phone       || '';
        const location    = p.location    || resumeData.location    || '';
        const linkedin    = p.linkedin    || resumeData.linkedin    || '';
        const portfolio   = p.portfolio   || resumeData.portfolio   || '';
        const summary     = resumeData.summary     || resumeData.profileSummary || '';
        const skills      = Array.isArray(resumeData.skills) ? resumeData.skills : [];
        const experience  = Array.isArray(resumeData.experience)  ? resumeData.experience  : [];
        const education   = Array.isArray(resumeData.education)   ? resumeData.education   : [];
        const certifications = Array.isArray(resumeData.certifications) ? resumeData.certifications : [];

        // ── NAME ──────────────────────────────────────────────────────────────
        doc.font(FONTS.bold).fontSize(22).fillColor(COLORS.heading)
           .text(name, MARGIN, MARGIN, { width: CONTENT_W });

        // ── CONTACT LINE ──────────────────────────────────────────────────────
        const contactParts = [email, phone, location].filter(Boolean);
        if (contactParts.length) {
          doc.moveDown(0.2);
          doc.font(FONTS.normal).fontSize(9).fillColor(COLORS.body)
             .text(contactParts.join('  •  '), MARGIN, doc.y, { width: CONTENT_W });
        }
        if (linkedin || portfolio) {
          doc.moveDown(0.1);
          doc.font(FONTS.normal).fontSize(9).fillColor(COLORS.accent)
             .text([linkedin, portfolio].filter(Boolean).join('  •  '), MARGIN, doc.y, { width: CONTENT_W });
        }

        // ── DIVIDER ───────────────────────────────────────────────────────────
        doc.moveDown(0.5);
        doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + CONTENT_W, doc.y)
           .strokeColor(COLORS.accent).lineWidth(2).stroke();
        doc.moveDown(0.5);

        // ── SUMMARY ───────────────────────────────────────────────────────────
        if (summary) {
          sectionHeader(doc, 'Summary');
          doc.font(FONTS.normal).fontSize(10).fillColor(COLORS.body)
             .text(summary, MARGIN, doc.y, { width: CONTENT_W, lineGap: 2 });
          doc.moveDown(0.5);
        }

        // ── SKILLS ────────────────────────────────────────────────────────────
        if (skills.length) {
          sectionHeader(doc, 'Skills');
          doc.font(FONTS.normal).fontSize(10).fillColor(COLORS.body)
             .text(skills.join('  •  '), MARGIN, doc.y, { width: CONTENT_W, lineGap: 2 });
          doc.moveDown(0.5);
        }

        // ── EXPERIENCE ────────────────────────────────────────────────────────
        if (experience.length) {
          sectionHeader(doc, 'Experience');
          experience.forEach((exp) => {
            checkNewPage(doc, 80);
            const title   = exp.title       || exp.designation  || '';
            const company = exp.company     || exp.companyName  || '';
            const duration = exp.duration   || (exp.startMonth ? `${exp.startMonth} ${exp.startYear || ''} – ${exp.currentlyWorking ? 'Present' : `${exp.endMonth || ''} ${exp.endYear || ''}`}` : '');
            const bullets  = Array.isArray(exp.bullets) ? exp.bullets.filter(Boolean) : [];
            const desc     = exp.description || '';

            // Title + duration on same line
            const titleY = doc.y;
            doc.font(FONTS.bold).fontSize(10.5).fillColor(COLORS.heading)
               .text(title, MARGIN, titleY, { width: CONTENT_W * 0.65, continued: false });
            if (duration) {
              doc.font(FONTS.normal).fontSize(9).fillColor(COLORS.muted)
                 .text(duration, MARGIN + CONTENT_W * 0.65, titleY, { width: CONTENT_W * 0.35, align: 'right' });
            }
            if (company) {
              doc.font(FONTS.oblique).fontSize(9.5).fillColor(COLORS.accent)
                 .text(company, MARGIN, doc.y, { width: CONTENT_W });
            }
            doc.moveDown(0.2);

            if (bullets.length) {
              bullets.forEach((b) => {
                checkNewPage(doc, 20);
                doc.font(FONTS.normal).fontSize(9.5).fillColor(COLORS.body)
                   .text(`• ${b}`, MARGIN + 10, doc.y, { width: CONTENT_W - 10, lineGap: 1.5 });
              });
            } else if (desc) {
              doc.font(FONTS.normal).fontSize(9.5).fillColor(COLORS.body)
                 .text(desc, MARGIN + 10, doc.y, { width: CONTENT_W - 10, lineGap: 1.5 });
            }
            doc.moveDown(0.5);
          });
        }

        // ── EDUCATION ─────────────────────────────────────────────────────────
        if (education.length) {
          sectionHeader(doc, 'Education');
          education.forEach((edu) => {
            checkNewPage(doc, 50);
            const degree      = edu.degree      || '';
            const institution = edu.institution || edu.college || edu.educationCollege?.college || '';
            const duration    = edu.duration    || (edu.passingYear ? `Graduated ${edu.passingYear}` : '');
            const grade       = edu.grade       || edu.percentage || '';

            const eduY = doc.y;
            doc.font(FONTS.bold).fontSize(10.5).fillColor(COLORS.heading)
               .text(degree, MARGIN, eduY, { width: CONTENT_W * 0.7 });
            if (duration) {
              doc.font(FONTS.normal).fontSize(9).fillColor(COLORS.muted)
                 .text(duration, MARGIN + CONTENT_W * 0.65, eduY, { width: CONTENT_W * 0.35, align: 'right' });
            }
            if (institution) {
              doc.font(FONTS.oblique).fontSize(9.5).fillColor(COLORS.accent)
                 .text(institution, MARGIN, doc.y, { width: CONTENT_W });
            }
            if (grade) {
              doc.font(FONTS.normal).fontSize(9).fillColor(COLORS.muted)
                 .text(`Grade: ${grade}`, MARGIN, doc.y, { width: CONTENT_W });
            }
            doc.moveDown(0.5);
          });
        }

        // ── CERTIFICATIONS ────────────────────────────────────────────────────
        if (certifications.length) {
          sectionHeader(doc, 'Certifications');
          certifications.forEach((cert) => {
            checkNewPage(doc, 30);
            const certName = cert.certificationName || cert.name || (typeof cert === 'string' ? cert : '');
            const validity = cert.startMonth ? `${cert.startMonth} ${cert.startYear || ''} – ${cert.noExpiry ? 'No Expiry' : `${cert.endMonth || ''} ${cert.endYear || ''}`}` : '';
            doc.font(FONTS.bold).fontSize(10).fillColor(COLORS.heading)
               .text(`• ${certName}`, MARGIN, doc.y, { width: CONTENT_W });
            if (validity) {
              doc.font(FONTS.normal).fontSize(9).fillColor(COLORS.muted)
                 .text(validity, MARGIN + 10, doc.y, { width: CONTENT_W });
            }
            doc.moveDown(0.3);
          });
        }

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  },
};

export default pdfService;
