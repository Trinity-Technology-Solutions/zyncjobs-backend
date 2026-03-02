import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

class PDFParserService {
  constructor() {
    this.pythonParserPath = path.join(process.cwd(), 'services', 'enhancedPdfParser.py');
  }

  async parseWithPython(pdfPath) {
    return new Promise((resolve, reject) => {
      const python = spawn('python', [this.pythonParserPath, pdfPath]);
      let result = '';
      let error = '';

      python.stdout.on('data', (data) => {
        result += data.toString();
      });

      python.stderr.on('data', (data) => {
        error += data.toString();
      });

      python.on('close', (code) => {
        if (code === 0) {
          try {
            const parsed = JSON.parse(result);
            resolve(parsed);
          } catch (e) {
            reject(new Error('Failed to parse Python output'));
          }
        } else {
          reject(new Error(`Python parser failed: ${error}`));
        }
      });
    });
  }

  extractEmail(text) {
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const matches = text.match(emailRegex);
    return matches ? matches[0] : null;
  }

  extractPhone(text) {
    const phoneRegex = /(\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g;
    const matches = text.match(phoneRegex);
    return matches ? matches[0] : null;
  }

  extractName(text) {
    const lines = text.split('\n').filter(line => line.trim());
    
    // Look for name in first few lines
    for (let i = 0; i < Math.min(3, lines.length); i++) {
      const line = lines[i].trim();
      
      // Skip lines with email or phone
      if (line.includes('@') || line.match(/\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/)) {
        continue;
      }
      
      // Check if line looks like a name (2-3 words, proper case)
      const namePattern = /^[A-Z][a-z]+ [A-Z][a-z]+( [A-Z][a-z]+)?$/;
      if (namePattern.test(line)) {
        return line;
      }
    }
    
    return null;
  }

  async parseResumeEnhanced(pdfPath) {
    try {
      // Try Python enhanced parser first
      const enhancedResult = await this.parseWithPython(pdfPath);
      if (enhancedResult && !enhancedResult.error) {
        return {
          ...enhancedResult,
          parsingMethod: 'enhanced',
          confidence: 0.9
        };
      }
    } catch (error) {
      console.warn('Enhanced parser failed, falling back to basic parsing:', error.message);
    }

    // Fallback to basic parsing
    return this.parseResumeBasic(pdfPath);
  }

  async parseResumeBasic(pdfPath) {
    // Basic parsing implementation (existing logic)
    const text = await this.extractTextFromPDF(pdfPath);
    
    return {
      name: this.extractName(text),
      email: this.extractEmail(text),
      phone: this.extractPhone(text),
      skills: this.extractSkillsFromText(text),
      experience_years: this.extractExperience(text),
      education: this.extractEducation(text),
      parsingMethod: 'basic',
      confidence: 0.6
    };
  }

  extractSkillsFromText(text) {
    const skillKeywords = [
      'JavaScript', 'Python', 'Java', 'React', 'Node.js', 'Angular', 'Vue.js',
      'HTML', 'CSS', 'SQL', 'MongoDB', 'PostgreSQL', 'MySQL', 'AWS', 'Azure',
      'Docker', 'Kubernetes', 'Git', 'TypeScript', 'PHP', 'C++', 'C#', 'Ruby',
      'Go', 'Rust', 'Swift', 'Kotlin', 'Flutter', 'Django', 'Flask', 'Express',
      'Spring', 'Laravel', 'Redux', 'GraphQL', 'REST API', 'Microservices',
      'DevOps', 'CI/CD', 'Jenkins', 'Terraform', 'Linux', 'Agile', 'Scrum',
      'Machine Learning', 'AI', 'Data Science', 'TensorFlow', 'PyTorch'
    ];
    
    const foundSkills = [];
    const textLower = text.toLowerCase();
    
    skillKeywords.forEach(skill => {
      const pattern = new RegExp(`\\b${skill.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (pattern.test(textLower)) {
        foundSkills.push(skill);
      }
    });
    
    return [...new Set(foundSkills)]; // Remove duplicates
  }

  extractExperience(text) {
    const expRegex = /(\d+)\+?\s*years?\s*(of\s*)?experience/i;
    const match = text.match(expRegex);
    return match ? parseInt(match[1]) : 0;
  }

  extractEducation(text) {
    const educationKeywords = [
      'Bachelor', 'Master', 'PhD', 'B.S.', 'M.S.', 'B.A.', 'M.A.',
      'Computer Science', 'Engineering', 'Information Technology'
    ];
    
    const lines = text.split('\n');
    for (const line of lines) {
      for (const keyword of educationKeywords) {
        if (line.toLowerCase().includes(keyword.toLowerCase())) {
          return line.trim();
        }
      }
    }
    
    return null;
  }
}

export default new PDFParserService();