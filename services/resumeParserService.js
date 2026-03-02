import { resumeParser } from '../utils/resumeParserAI.js';

class ResumeParserService {
  async parseResumeText(resumeText) {
    try {
      console.log('[RESUME_PARSER] Parsing resume text...');
      
      // Use AI parser for profile extraction
      const profileData = await resumeParser.parseResumeToProfile(resumeText);
      
      console.log('[RESUME_PARSER] Profile data extracted:', profileData);
      return profileData;
    } catch (error) {
      console.error('[RESUME_PARSER] Error parsing resume:', error);
      throw error;
    }
  }

  extractSkills(text) {
    const skillKeywords = [
      'JavaScript', 'Python', 'Java', 'React', 'Node.js', 'Angular', 'Vue.js',
      'HTML', 'CSS', 'SQL', 'MongoDB', 'PostgreSQL', 'MySQL', 'AWS', 'Azure',
      'Docker', 'Kubernetes', 'Git', 'TypeScript', 'PHP', 'C++', 'C#', 'Ruby',
      'Go', 'Rust', 'Swift', 'Kotlin', 'Flutter', 'Django', 'Flask', 'Express',
      'Spring', 'Laravel', 'Redux', 'GraphQL', 'REST API', 'Microservices',
      'DevOps', 'CI/CD', 'Jenkins', 'Terraform', 'Linux', 'Agile', 'Scrum'
    ];
    
    const foundSkills = skillKeywords.filter(skill => 
      text.toLowerCase().includes(skill.toLowerCase())
    );
    
    return foundSkills;
  }

  async matchJobsToResume(resumeData) {
    try {
      const extractedSkills = this.extractSkills(resumeData.text || '');
      
      // This would typically query your job database
      // For now, return mock data
      return {
        matchCount: 0,
        extractedSkills,
        matchingJobs: []
      };
    } catch (error) {
      console.error('[RESUME_PARSER] Error matching jobs:', error);
      return {
        matchCount: 0,
        extractedSkills: [],
        matchingJobs: []
      };
    }
  }

  calculateMatchScore(job, candidateSkills) {
    if (!job.skills || !candidateSkills.length) return 0;
    
    const jobSkills = job.skills.map(s => s.toLowerCase());
    const matches = candidateSkills.filter(skill => 
      jobSkills.includes(skill.toLowerCase())
    );
    
    return Math.round((matches.length / jobSkills.length) * 100);
  }
}

export default new ResumeParserService();