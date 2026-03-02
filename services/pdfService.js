// PDF Service disabled - html-pdf-node removed for deployment compatibility

class PDFService {
  async generateResumePDF(resumeData) {
    throw new Error('PDF generation temporarily disabled');
  }

  generateResumeHTML(resumeData) {
    return '<html><body>PDF generation disabled</body></html>';
  }

  getTemplateStyles(template) {
    return '';
  }
}

export default new PDFService();