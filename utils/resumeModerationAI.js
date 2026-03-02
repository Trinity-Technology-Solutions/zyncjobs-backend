import axios from 'axios';
import * as pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import fs from 'fs';

// Mistral AI resume moderation
export class ResumeModeratorAI {
  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY;
    this.model = 'mistralai/mistral-7b-instruct';
  }

  async extractTextFromFile(filePath, fileType) {
    try {
      if (fileType === 'application/pdf') {
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdfParse.default(dataBuffer);
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
    const prompt = `Analyze this resume for moderation. Respond with ONLY valid JSON.

RESUME TEXT:
"${resumeText.substring(0, 2000)}"

USER PROFILE:
Name: ${userProfile.name || 'Unknown'}
Email: ${userProfile.email || 'Unknown'}
Skills: ${userProfile.skills?.join(', ') || 'None listed'}

DETECT:
1. SPAM: Excessive keywords, irrelevant content, promotional text
2. INAPPROPRIATE: Offensive language, personal photos, inappropriate content
3. FAKE: Generic templates, unrealistic claims, inconsistent information
4. PROFILE_MISMATCH: Name/skills don't match user profile
5. DUPLICATE: Generic template language, copy-paste content

Rate risk 0-100 (0=clean, 100=reject).

JSON FORMAT:
{"hasSpam": false, "hasInappropriateContent": false, "isFake": false, "profileMismatch": false, "riskScore": 25, "issues": ["specific issues"], "extractedName": "name from resume", "extractedSkills": ["skill1", "skill2"], "recommendation": "approve|flag|reject"}`;

    try {
      const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 400
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.FRONTEND_URL,
          'X-Title': 'ZyncJobs-Resume-Moderation'
        }
      });

      return this.parseAIResponse(response.data.choices[0].message.content);
    } catch (error) {
      console.error('AI analysis error:', error);
      return this.getFallbackAnalysis(resumeText, userProfile);
    }
  }

  parseAIResponse(content) {
    try {
      const cleaned = content.trim().replace(/```json|```/g, '');
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          hasSpam: Boolean(parsed.hasSpam),
          hasInappropriateContent: Boolean(parsed.hasInappropriateContent),
          isFake: Boolean(parsed.isFake),
          profileMismatch: Boolean(parsed.profileMismatch),
          riskScore: Math.min(Math.max(Number(parsed.riskScore) || 0, 0), 100),
          issues: Array.isArray(parsed.issues) ? parsed.issues : [],
          extractedName: parsed.extractedName || '',
          extractedSkills: Array.isArray(parsed.extractedSkills) ? parsed.extractedSkills : [],
          recommendation: ['approve', 'flag', 'reject'].includes(parsed.recommendation) 
            ? parsed.recommendation : 'flag'
        };
      }
      
      throw new Error('No valid JSON found');
    } catch (error) {
      return this.getFallbackAnalysis();
    }
  }

  getFallbackAnalysis(resumeText = '', userProfile = {}) {
    let riskScore = 0;
    const issues = [];
    
    // Basic spam detection
    const spamKeywords = ['click here', 'buy now', 'guaranteed', 'make money'];
    const hasSpam = spamKeywords.some(keyword => 
      resumeText.toLowerCase().includes(keyword)
    );
    
    if (hasSpam) {
      riskScore += 40;
      issues.push('Contains spam keywords');
    }
    
    // Check length
    if (resumeText.length < 100) {
      riskScore += 30;
      issues.push('Resume too short');
    }
    
    return {
      hasSpam,
      hasInappropriateContent: false,
      isFake: riskScore > 30,
      profileMismatch: false,
      riskScore,
      issues,
      extractedName: '',
      extractedSkills: [],
      recommendation: riskScore > 50 ? 'reject' : riskScore > 25 ? 'flag' : 'approve'
    };
  }

  validateFileSpecs(file) {
    const maxSize = 5 * 1024 * 1024; // 5MB
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    const errors = [];
    
    if (file.size > maxSize) {
      errors.push('File size exceeds 5MB limit');
    }
    
    if (!allowedTypes.includes(file.mimetype)) {
      errors.push('Invalid file type. Only PDF and DOC files allowed');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  async checkForDuplicates(resumeText, userId) {
    // Simple duplicate detection - in production, use more sophisticated methods
    const textHash = this.generateTextHash(resumeText);
    
    // Check against existing resumes (simplified)
    return {
      isDuplicate: false,
      similarityScore: 0
    };
  }

  generateTextHash(text) {
    // Simple hash for duplicate detection
    return text.replace(/\s+/g, '').toLowerCase().substring(0, 100);
  }
}

export const resumeModerator = new ResumeModeratorAI();