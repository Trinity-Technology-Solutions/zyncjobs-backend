import PDFDocument from 'pdfkit';

const COLORS = {
  heading: '#1a1a2e',
  accent:  '#2563eb',
  body:    '#374151',
  muted:   '#6b7280',
  line:    '#e5e7eb',
};

const FONTS = {
  bold:    'Helvetica-Bold',
  normal:  'Helvetica',
  oblique: 'Helvetica-Oblique',
};

const MARGIN = 50;
const PAGE_W = 595.28;
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
  if (doc.y + neededHeight > doc.page.height - MARGIN) doc.addPage();
}

/**
 * Normalise the two possible resume shapes:
 *  A) ResumeStore shape  — { personalInfo:{}, summary, experience:[{title,company,duration,bullets:[]}], education:[{degree,institution,duration,grade}], skills:[] }
 *  B) Profile/flat shape — { name, email, phone, location, profileSummary, employment:{}, educationCollege:{}, skills:[], certifications:{} }
 */
function normalise(raw) {
  // Shape A: has personalInfo object
  if (raw.personalInfo) {
    const p = raw.personalInfo;
    return {
      name:      p.name      || '',
      email:     p.email     || '',
      phone:     p.phone     || '',
      location:  p.location  || '',
      linkedin:  p.linkedin  || '',
      portfolio: p.portfolio || '',
      summary:   raw.summary || '',
      skills:    Array.isArray(raw.skills) ? raw.skills : [],
      experience: (Array.isArray(raw.experience) ? raw.experience : []).map(e => ({
        title:    e.title    || e.designation || '',
        company:  e.company  || e.companyName || '',
        duration: e.duration || buildDuration(e),
        bullets:  Array.isArray(e.bullets) ? e.bullets.filter(b => b && b.trim()) : [],
        description: e.description || '',
      })),
      education: (Array.isArray(raw.education) ? raw.education : []).map(e => ({
        degree:      e.degree      || '',
        institution: e.institution || e.college || '',
        duration:    e.duration    || (e.passingYear ? `Graduated ${e.passingYear}` : ''),
        grade:       e.grade       || e.percentage || '',
      })),
      certifications: (Array.isArray(raw.certifications) ? raw.certifications : []).map(c => ({
        name:     c.certificationName || c.name || (typeof c === 'string' ? c : ''),
        validity: c.startMonth ? `${c.startMonth} ${c.startYear || ''} – ${c.noExpiry ? 'No Expiry' : `${c.endMonth || ''} ${c.endYear || ''}`}` : '',
      })).filter(c => c.name),
    };
  }

  // Shape B: flat profile object
  const emp = raw.employment || {};
  const edu = raw.educationCollege || {};
  const cert = raw.certifications || {};

  const experience = [];
  if (emp.companyName || emp.designation) {
    experience.push({
      title:    emp.designation  || '',
      company:  emp.companyName  || '',
      duration: buildDuration(emp),
      bullets:  emp.description ? [emp.description] : [],
      description: '',
    });
  }

  const education = [];
  if (edu.degree || edu.college) {
    education.push({
      degree:      edu.degree      || '',
      institution: edu.college     || '',
      duration:    edu.passingYear ? `Graduated ${edu.passingYear}` : '',
      grade:       edu.percentage  || '',
    });
  }

  const certifications = [];
  if (cert.certificationName) {
    certifications.push({
      name: cert.certificationName,
      validity: cert.startMonth ? `${cert.startMonth} ${cert.startYear || ''} – ${cert.noExpiry ? 'No Expiry' : `${cert.endMonth || ''} ${cert.endYear || ''}`}` : '',
    });
  }

  return {
    name:      raw.name      || '',
    email:     raw.email     || '',
    phone:     raw.phone     || '',
    location:  raw.location  || '',
    linkedin:  raw.linkedin  || '',
    portfolio: raw.portfolio || '',
    summary:   raw.profileSummary || raw.summary || '',
    skills:    Array.isArray(raw.skills) ? raw.skills : [],
    experience,
    education,
    certifications,
  };
}

function buildDuration(e) {
  if (!e.startMonth && !e.startYear) return '';
  const start = [e.startMonth, e.startYear].filter(Boolean).join(' ');
  const end = e.currentlyWorking ? 'Present' : [e.endMonth, e.endYear].filter(Boolean).join(' ');
  return end ? `${start} – ${end}` : start;
}

const pdfService = {
  /**
   * Generates a professional ATS-friendly resume PDF.
   * Accepts both ResumeStore shape and flat profile shape.
   * @param {object} resumeData
   * @returns {Promise<Buffer>}
   */
  generateResumePDF: (resumeData) => {
    return new Promise((resolve, reject) => {
      try {
        const d = normalise(resumeData);
        const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true });
        const chunks = [];
        doc.on('data', c => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // ── NAME ─────────────────────────────────────────────────────────────
        doc.font(FONTS.bold).fontSize(22).fillColor(COLORS.heading)
           .text(d.name || 'Candidate', MARGIN, MARGIN, { width: CONTENT_W });

        // ── CONTACT ──────────────────────────────────────────────────────────
        const contact = [d.email, d.phone, d.location].filter(Boolean);
        if (contact.length) {
          doc.moveDown(0.2);
          doc.font(FONTS.normal).fontSize(9).fillColor(COLORS.body)
             .text(contact.join('  •  '), MARGIN, doc.y, { width: CONTENT_W });
        }
        const links = [d.linkedin, d.portfolio].filter(Boolean);
        if (links.length) {
          doc.moveDown(0.1);
          doc.font(FONTS.normal).fontSize(9).fillColor(COLORS.accent)
             .text(links.join('  •  '), MARGIN, doc.y, { width: CONTENT_W });
        }

        // ── ACCENT DIVIDER ────────────────────────────────────────────────────
        doc.moveDown(0.5);
        doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + CONTENT_W, doc.y)
           .strokeColor(COLORS.accent).lineWidth(2).stroke();
        doc.moveDown(0.5);

        // ── SUMMARY ───────────────────────────────────────────────────────────
        if (d.summary) {
          sectionHeader(doc, 'Summary');
          doc.font(FONTS.normal).fontSize(10).fillColor(COLORS.body)
             .text(d.summary, MARGIN, doc.y, { width: CONTENT_W, lineGap: 2 });
          doc.moveDown(0.5);
        }

        // ── SKILLS ────────────────────────────────────────────────────────────
        if (d.skills.length) {
          sectionHeader(doc, 'Skills');
          doc.font(FONTS.normal).fontSize(10).fillColor(COLORS.body)
             .text(d.skills.join('  •  '), MARGIN, doc.y, { width: CONTENT_W, lineGap: 2 });
          doc.moveDown(0.5);
        }

        // ── EXPERIENCE ────────────────────────────────────────────────────────
        if (d.experience.length) {
          sectionHeader(doc, 'Experience');
          d.experience.forEach(exp => {
            checkNewPage(doc, 80);
            const titleY = doc.y;
            doc.font(FONTS.bold).fontSize(10.5).fillColor(COLORS.heading)
               .text(exp.title, MARGIN, titleY, { width: CONTENT_W * 0.65, continued: false });
            if (exp.duration) {
              doc.font(FONTS.normal).fontSize(9).fillColor(COLORS.muted)
                 .text(exp.duration, MARGIN + CONTENT_W * 0.65, titleY, { width: CONTENT_W * 0.35, align: 'right' });
            }
            if (exp.company) {
              doc.font(FONTS.oblique).fontSize(9.5).fillColor(COLORS.accent)
                 .text(exp.company, MARGIN, doc.y, { width: CONTENT_W });
            }
            doc.moveDown(0.2);
            const lines = exp.bullets.length ? exp.bullets : (exp.description ? [exp.description] : []);
            lines.forEach(b => {
              checkNewPage(doc, 20);
              doc.font(FONTS.normal).fontSize(9.5).fillColor(COLORS.body)
                 .text(`• ${b}`, MARGIN + 10, doc.y, { width: CONTENT_W - 10, lineGap: 1.5 });
            });
            doc.moveDown(0.5);
          });
        }

        // ── EDUCATION ─────────────────────────────────────────────────────────
        if (d.education.length) {
          sectionHeader(doc, 'Education');
          d.education.forEach(edu => {
            checkNewPage(doc, 50);
            const eduY = doc.y;
            doc.font(FONTS.bold).fontSize(10.5).fillColor(COLORS.heading)
               .text(edu.degree, MARGIN, eduY, { width: CONTENT_W * 0.7 });
            if (edu.duration) {
              doc.font(FONTS.normal).fontSize(9).fillColor(COLORS.muted)
                 .text(edu.duration, MARGIN + CONTENT_W * 0.65, eduY, { width: CONTENT_W * 0.35, align: 'right' });
            }
            if (edu.institution) {
              doc.font(FONTS.oblique).fontSize(9.5).fillColor(COLORS.accent)
                 .text(edu.institution, MARGIN, doc.y, { width: CONTENT_W });
            }
            if (edu.grade) {
              doc.font(FONTS.normal).fontSize(9).fillColor(COLORS.muted)
                 .text(`Grade: ${edu.grade}`, MARGIN, doc.y, { width: CONTENT_W });
            }
            doc.moveDown(0.5);
          });
        }

        // ── CERTIFICATIONS ────────────────────────────────────────────────────
        if (d.certifications.length) {
          sectionHeader(doc, 'Certifications');
          d.certifications.forEach(cert => {
            checkNewPage(doc, 30);
            doc.font(FONTS.bold).fontSize(10).fillColor(COLORS.heading)
               .text(`• ${cert.name}`, MARGIN, doc.y, { width: CONTENT_W });
            if (cert.validity) {
              doc.font(FONTS.normal).fontSize(9).fillColor(COLORS.muted)
                 .text(cert.validity, MARGIN + 10, doc.y, { width: CONTENT_W });
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
