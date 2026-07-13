// Resume moderation — rule-based only
import fs from 'fs';
import * as pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

export class ResumeModeratorAI {

  async extractTextFromFile(filePath, fileType) {
    try {
      if (fileType === 'application/pdf') {
        const data = await pdfParse.default(fs.readFileSync(filePath));
        return data.text;
      } else if (fileType.includes('word')) {
        const result = await mammoth.extractRawText({ path: filePath });
        return result.value;
      }
      return '';
    } catch (error) {
      console.error('Text extraction error:', error);
      return '';
    }
  }

  async analyzeResumeContent(resumeText, userProfile) {
    return this.getFallbackAnalysis(resumeText, userProfile);
  }

  getFallbackAnalysis(resumeText = '', userProfile = {}) {
    let riskScore = 0;
    const issues = [];

    const spamKeywords = ['click here', 'buy now', 'guaranteed', 'make money'];
    const hasSpam = spamKeywords.some(k => resumeText.toLowerCase().includes(k));
    if (hasSpam) { riskScore += 40; issues.push('Contains spam keywords'); }
    if (resumeText.length < 100) { riskScore += 30; issues.push('Resume too short'); }

    return {
      hasSpam,
      hasInappropriateContent: false,
      isFake: riskScore > 30,
      profileMismatch: false,
      riskScore,
      issues,
      extractedName: '',
      extractedSkills: [],
      recommendation: riskScore > 50 ? 'reject' : riskScore > 25 ? 'flag' : 'approve',
    };
  }

  validateFileSpecs(file) {
    const maxSize = 5 * 1024 * 1024;
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    const errors = [];
    if (file.size > maxSize) errors.push('File size exceeds 5MB limit');
    if (!allowedTypes.includes(file.mimetype)) errors.push('Invalid file type. Only PDF and DOC files allowed');
    return { isValid: errors.length === 0, errors };
  }

  async checkForDuplicates(resumeText, userId) {
    return { isDuplicate: false, similarityScore: 0 };
  }
}

export const resumeModerator = new ResumeModeratorAI();
