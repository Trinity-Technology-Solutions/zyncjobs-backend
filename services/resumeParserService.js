import aiClient from './aiClient.js';

class ResumeParserService {
  async parseResumeText(resumeText) {
    console.log('[RESUME_PARSER] Trying AI agent (port 8001)...');
    try {
      const result = await aiClient.parseResume(resumeText);
      if (result && (result.name || result.email || result.skills?.length > 0 || result.workExperiences?.length > 0)) {
        console.log('[RESUME_PARSER] AI agent success:', result.name);
        return result;
      }
      console.warn('[RESUME_PARSER] AI agent returned empty result — frontend local parser will handle it');
    } catch (e) {
      console.warn('[RESUME_PARSER] AI agent failed:', e.message);
    }
    // Return minimal object so frontend falls back to local regex parser
    return { name: '', email: '', phone: '', skills: [], workExperiences: [], educations: [], projects: [] };
  }
}

export default new ResumeParserService();
