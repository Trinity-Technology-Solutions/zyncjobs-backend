import aiClient from './aiClient.js';
import vectorService from './vectorService.js';

class AIService {

  async generateCompletion(prompt) {
    try {
      const result = await aiClient.suggest(prompt);
      return result.reply || 'AI response unavailable';
    } catch (error) {
      console.error('AI Service Error:', error.message);
      return 'AI service temporarily unavailable';
    }
  }

  async enhanceResume(resumeData) {
    try {
      const result = await aiClient.improveResume(JSON.stringify(resumeData));
      return result.improved || JSON.stringify(resumeData);
    } catch {
      return 'AI service temporarily unavailable';
    }
  }

  async generateJobDescription(jobTitle, company, requirements) {
    try {
      const result = await aiClient.generateJD(jobTitle, '', requirements || []);
      return result.job_description || `We are looking for a ${jobTitle}${company ? ` at ${company}` : ''}.`;
    } catch {
      return `We are looking for a ${jobTitle}${company ? ` at ${company}` : ''}.`;
    }
  }

  async semanticJobMatch(resumeData) {
    try {
      const resumeText = vectorService.profileToText(resumeData);
      const matches = await vectorService.findSimilarJobs(resumeText, 10);
      if (!matches.length) return { matches: [], analysis: 'No matching jobs found yet.' };
      const topMatches = matches.slice(0, 5).map(j => ({ title: j.jobTitle, company: j.company, score: j.matchScore, location: j.location }));
      const analysis = await this.generateCompletion(
        `A candidate has these skills: ${(resumeData.skills || []).join(', ')}. Top matching jobs: ${JSON.stringify(topMatches)}. In 2-3 sentences, explain why these jobs are a good match.`
      );
      return { matches, analysis };
    } catch (error) {
      console.error('Semantic job match error:', error.message);
      return { matches: [], analysis: 'Matching service temporarily unavailable' };
    }
  }

  async semanticCandidateMatch(jobData) {
    try {
      const jobText = vectorService.jobToText(jobData);
      const matches = await vectorService.findSimilarCandidates(jobText, 20);
      if (!matches.length) return { matches: [], analysis: 'No candidate profiles indexed yet.' };
      const analysis = await this.generateCompletion(
        `Job: ${jobData.jobTitle} at ${jobData.company}. Found ${matches.length} matching candidates. In 2 sentences, summarize the talent pool quality.`
      );
      return { matches, analysis };
    } catch (error) {
      console.error('Semantic candidate match error:', error.message);
      return { matches: [], analysis: 'Matching service temporarily unavailable' };
    }
  }

  async matchJobs(candidateProfile, jobListings) {
    const scored = jobListings.map(job => ({
      ...job,
      matchScore: vectorService.getMatchScore(job, candidateProfile),
    }));
    return scored.sort((a, b) => b.matchScore - a.matchScore);
  }

  async provideCareerAdvice(userQuery, userProfile) {
    return this.generateCompletion(
      `User profile: ${JSON.stringify(userProfile)}\nQuery: ${userQuery}`
    );
  }

  async indexJobForSearch(jobId, jobData) {
    await vectorService.upsertJobEmbedding(jobId, jobData);
  }

  async indexResumeForSearch(userId, resumeData) {
    await vectorService.upsertResumeEmbedding(userId, resumeData);
  }
}

export default new AIService();
