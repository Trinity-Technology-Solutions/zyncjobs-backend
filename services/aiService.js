import fetch from 'node-fetch';
import vectorService from './vectorService.js';

class AIService {
  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY;
    this.model = process.env.OPENROUTER_MODEL || 'mistralai/mistral-7b-instruct';
    this.baseUrl = 'https://openrouter.ai/api/v1/chat/completions';
  }

  async generateCompletion(prompt, systemMessage = '') {
    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:5000',
          'X-Title': 'Trinity Jobs AI'
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            ...(systemMessage ? [{ role: 'system', content: systemMessage }] : []),
            { role: 'user', content: prompt }
          ],
          temperature: 0.7,
          max_tokens: 1000
        })
      });

      const data = await response.json();
      return data.choices?.[0]?.message?.content || 'AI response unavailable';
    } catch (error) {
      console.error('AI Service Error:', error);
      return 'AI service temporarily unavailable';
    }
  }

  async enhanceResume(resumeData) {
    const systemMessage = 'You are an expert resume writer. Enhance the given resume content to be more professional and ATS-friendly.';
    const prompt = `Enhance this resume data: ${JSON.stringify(resumeData)}`;
    return await this.generateCompletion(prompt, systemMessage);
  }

  async generateJobDescription(jobTitle, company, requirements) {
    const systemMessage = 'You are an expert HR professional. Generate compelling job descriptions.';
    const prompt = `Create a job description for ${jobTitle} at ${company} with requirements: ${requirements}`;
    return await this.generateCompletion(prompt, systemMessage);
  }

  async matchJobs(candidateProfile, jobListings) {
    const systemMessage = 'You are an expert job matching algorithm. Analyze candidate profiles and job requirements to find the best matches.';
    const prompt = `Match this candidate: ${JSON.stringify(candidateProfile)} with these jobs: ${JSON.stringify(jobListings)}`;
    return await this.generateCompletion(prompt, systemMessage);
  }

  async provideCareerAdvice(userQuery, userProfile) {
    const systemMessage = 'You are an expert career coach. Provide personalized career advice based on user profiles and queries.';
    const prompt = `User profile: ${JSON.stringify(userProfile)}\nQuery: ${userQuery}`;
    return await this.generateCompletion(prompt, systemMessage);
  }

  async semanticJobMatch(resumeData) {
    try {
      const resumeText = `${resumeData.skills?.join(' ')} ${resumeData.experience} ${resumeData.education}`;
      const similarJobs = await vectorService.findSimilarJobs(resumeText);
      
      const systemMessage = 'You are an expert job matching AI. Analyze the semantic similarity scores and provide detailed matching insights.';
      const prompt = `Resume: ${resumeText}\nSimilar Jobs: ${JSON.stringify(similarJobs)}`;
      
      const analysis = await this.generateCompletion(prompt, systemMessage);
      
      return {
        matches: similarJobs,
        analysis: analysis
      };
    } catch (error) {
      console.error('Semantic job match error:', error);
      return { matches: [], analysis: 'Matching service temporarily unavailable' };
    }
  }

  async semanticCandidateMatch(jobData) {
    try {
      const jobText = `${jobData.title} ${jobData.description} ${jobData.requirements}`;
      const similarCandidates = await vectorService.findSimilarCandidates(jobText);
      
      const systemMessage = 'You are an expert candidate matching AI. Analyze the semantic similarity scores and provide detailed matching insights.';
      const prompt = `Job: ${jobText}\nSimilar Candidates: ${JSON.stringify(similarCandidates)}`;
      
      const analysis = await this.generateCompletion(prompt, systemMessage);
      
      return {
        matches: similarCandidates,
        analysis: analysis
      };
    } catch (error) {
      console.error('Semantic candidate match error:', error);
      return { matches: [], analysis: 'Matching service temporarily unavailable' };
    }
  }

  async indexJobForSearch(jobId, jobData) {
    await vectorService.upsertJobEmbedding(jobId, jobData);
  }

  async indexResumeForSearch(userId, resumeData) {
    await vectorService.upsertResumeEmbedding(userId, resumeData);
  }
}

export default new AIService();