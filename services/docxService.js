import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, UnderlineType } from 'docx';

/**
 * Normalise resume data from different shapes
 */
function normalise(raw) {
  if (raw.personalInfo) {
    const p = raw.personalInfo;
    return {
      name: p.name || '',
      email: p.email || '',
      phone: p.phone || '',
      location: p.location || '',
      linkedin: p.linkedin || '',
      portfolio: p.portfolio || '',
      summary: raw.summary || '',
      skills: Array.isArray(raw.skills) ? raw.skills : [],
      experience: (Array.isArray(raw.experience) ? raw.experience : []).map(e => ({
        title: e.title || e.designation || '',
        company: e.company || e.companyName || '',
        duration: e.duration || buildDuration(e),
        bullets: Array.isArray(e.bullets) ? e.bullets.filter(b => b && b.trim()) : [],
        description: e.description || '',
      })),
      education: (Array.isArray(raw.education) ? raw.education : []).map(e => ({
        degree: e.degree || '',
        institution: e.institution || e.college || '',
        duration: e.duration || (e.passingYear ? `Graduated ${e.passingYear}` : ''),
        grade: e.grade || e.percentage || '',
      })),
      certifications: (Array.isArray(raw.certifications) ? raw.certifications : []).map(c => ({
        name: c.certificationName || c.name || (typeof c === 'string' ? c : ''),
        validity: c.startMonth ? `${c.startMonth} ${c.startYear || ''} – ${c.noExpiry ? 'No Expiry' : `${c.endMonth || ''} ${c.endYear || ''}`}` : '',
      })).filter(c => c.name),
    };
  }

  const emp = raw.employment || {};
  const edu = raw.educationCollege || {};
  const cert = raw.certifications || {};

  const experience = [];
  if (emp.companyName || emp.designation) {
    experience.push({
      title: emp.designation || '',
      company: emp.companyName || '',
      duration: buildDuration(emp),
      bullets: emp.description ? [emp.description] : [],
      description: '',
    });
  }

  const education = [];
  if (edu.degree || edu.college) {
    education.push({
      degree: edu.degree || '',
      institution: edu.college || '',
      duration: edu.passingYear ? `Graduated ${edu.passingYear}` : '',
      grade: edu.percentage || '',
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
    name: raw.name || '',
    email: raw.email || '',
    phone: raw.phone || '',
    location: raw.location || '',
    linkedin: raw.linkedin || '',
    portfolio: raw.portfolio || '',
    summary: raw.profileSummary || raw.summary || '',
    skills: Array.isArray(raw.skills) ? raw.skills : [],
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

const docxService = {
  /**
   * Generates a professional ATS-friendly resume DOCX
   * @param {object} resumeData
   * @returns {Promise<Buffer>}
   */
  generateResumeDOCX: async (resumeData) => {
    try {
      const d = normalise(resumeData);

      if (!d.name || d.name.trim() === '') {
        throw new Error('Name is required for DOCX generation');
      }

      const sections = [];

      // NAME
      sections.push(
        new Paragraph({
          text: d.name,
          heading: HeadingLevel.TITLE,
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
        })
      );

      // CONTACT
      const contact = [d.email, d.phone, d.location].filter(Boolean).join('  •  ');
      if (contact) {
        sections.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 50 },
            children: [new TextRun({ text: contact, size: 20 })],
          })
        );
      }

      const links = [d.linkedin, d.portfolio].filter(Boolean).join('  •  ');
      if (links) {
        sections.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [new TextRun({ text: links, size: 20, color: '2563eb' })],
          })
        );
      }

      // SUMMARY
      if (d.summary) {
        sections.push(
          new Paragraph({
            text: 'SUMMARY',
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 200, after: 100 },
            thematicBreak: true,
          })
        );
        sections.push(
          new Paragraph({
            text: d.summary,
            spacing: { after: 200 },
          })
        );
      }

      // SKILLS
      if (d.skills.length) {
        sections.push(
          new Paragraph({
            text: 'SKILLS',
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 200, after: 100 },
            thematicBreak: true,
          })
        );
        sections.push(
          new Paragraph({
            text: d.skills.join('  •  '),
            spacing: { after: 200 },
          })
        );
      }

      // EXPERIENCE
      if (d.experience.length) {
        sections.push(
          new Paragraph({
            text: 'EXPERIENCE',
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 200, after: 100 },
            thematicBreak: true,
          })
        );

        d.experience.forEach((exp) => {
          sections.push(
            new Paragraph({
              spacing: { before: 100, after: 50 },
              children: [
                new TextRun({ text: exp.title, bold: true, size: 24 }),
                new TextRun({ text: '  |  ', size: 22 }),
                new TextRun({ text: exp.company, italics: true, size: 22, color: '2563eb' }),
              ],
            })
          );

          if (exp.duration) {
            sections.push(
              new Paragraph({
                text: exp.duration,
                spacing: { after: 50 },
                children: [new TextRun({ text: exp.duration, size: 20, color: '6b7280' })],
              })
            );
          }

          const lines = exp.bullets.length ? exp.bullets : exp.description ? [exp.description] : [];
          lines.forEach((bullet) => {
            sections.push(
              new Paragraph({
                text: `• ${bullet}`,
                spacing: { after: 50 },
                indent: { left: 360 },
              })
            );
          });

          sections.push(new Paragraph({ text: '', spacing: { after: 100 } }));
        });
      }

      // EDUCATION
      if (d.education.length) {
        sections.push(
          new Paragraph({
            text: 'EDUCATION',
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 200, after: 100 },
            thematicBreak: true,
          })
        );

        d.education.forEach((edu) => {
          sections.push(
            new Paragraph({
              spacing: { before: 100, after: 50 },
              children: [
                new TextRun({ text: edu.degree, bold: true, size: 24 }),
                new TextRun({ text: '  |  ', size: 22 }),
                new TextRun({ text: edu.institution, italics: true, size: 22, color: '2563eb' }),
              ],
            })
          );

          if (edu.duration) {
            sections.push(
              new Paragraph({
                text: edu.duration,
                spacing: { after: 50 },
                children: [new TextRun({ text: edu.duration, size: 20, color: '6b7280' })],
              })
            );
          }

          if (edu.grade) {
            sections.push(
              new Paragraph({
                text: `Grade: ${edu.grade}`,
                spacing: { after: 100 },
                children: [new TextRun({ text: `Grade: ${edu.grade}`, size: 20, color: '6b7280' })],
              })
            );
          }
        });
      }

      // CERTIFICATIONS
      if (d.certifications.length) {
        sections.push(
          new Paragraph({
            text: 'CERTIFICATIONS',
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 200, after: 100 },
            thematicBreak: true,
          })
        );

        d.certifications.forEach((cert) => {
          sections.push(
            new Paragraph({
              text: `• ${cert.name}`,
              spacing: { after: 50 },
              children: [new TextRun({ text: `• ${cert.name}`, bold: true, size: 22 })],
            })
          );

          if (cert.validity) {
            sections.push(
              new Paragraph({
                text: cert.validity,
                spacing: { after: 100 },
                indent: { left: 360 },
                children: [new TextRun({ text: cert.validity, size: 20, color: '6b7280' })],
              })
            );
          }
        });
      }

      const doc = new Document({
        sections: [
          {
            properties: {},
            children: sections,
          },
        ],
      });

      return await Packer.toBuffer(doc);
    } catch (err) {
      throw new Error(`DOCX generation failed: ${err.message}`);
    }
  },
};

export default docxService;
