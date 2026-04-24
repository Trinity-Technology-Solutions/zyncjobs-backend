import fetch from 'node-fetch';
import vectorService from './vectorService.js';

class AIService {
  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY;
    this.model = process.env.OPENROUTER_MODEL || 'google/gemma-3-4b-it:free';
    this.baseUrl = 'https://openrouter.ai/api/v1/chat/completions';
  }

  async generateCompletion(prompt, systemMessage = '') {
    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.FRONTEND_URL || 'https://api.zyncjobs.com',
          'X-Title': 'ZyncJobs AI'
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
    return this.generateCompletion(
      `Enhance this resume data: ${JSON.stringify(resumeData)}`,
      'You are an expert resume writer. Enhance the given resume content to be more professional and ATS-friendly.'
    );
  }

  async generateJobDescription(jobTitle, company, requirements) {
    return this.generateCompletion(
      `Create a job description for ${jobTitle} at ${company} with requirements: ${requirements}`,
      'You are an expert HR professional. Generate compelling job descriptions.'
    );
  }

  // Real semantic job matching using vectorService
  async semanticJobMatch(resumeData) {
    try {
      const resumeText = vectorService.profileToText(resumeData);
      const matches = await vectorService.findSimilarJobs(resumeText, 10);

      if (!matches.length) return { matches: [], analysis: 'No matching jobs found yet. More jobs will be matched as the index grows.' };

      const topMatches = matches.slice(0, 5).map(j => ({
        title: j.jobTitle,
        company: j.company,
        score: j.matchScore,
        location: j.location
      }));

      const analysis = await this.generateCompletion(
        `A candidate has these skills: ${(resumeData.skills || []).join(', ')}.\nTop matching jobs: ${JSON.stringify(topMatches)}.\nIn 2-3 sentences, explain why these jobs are a good match and what the candidate should highlight.`,
        'You are an expert job matching AI.'
      );

      return { matches, analysis };
    } catch (error) {
      console.error('Semantic job match error:', error);
      return { matches: [], analysis: 'Matching service temporarily unavailable' };
    }
  }

  // Real semantic candidate matching using vectorService
  async semanticCandidateMatch(jobData) {
    try {
      const jobText = vectorService.jobToText(jobData);
      const matches = await vectorService.findSimilarCandidates(jobText, 20);

      if (!matches.length) return { matches: [], analysis: 'No candidate profiles indexed yet.' };

      const analysis = await this.generateCompletion(
        `Job: ${jobData.jobTitle} at ${jobData.company}. Required skills: ${(jobData.skills || []).join(', ')}.\nFound ${matches.length} matching candidates with scores: ${matches.slice(0, 3).map(c => c.matchScore + '%').join(', ')}.\nIn 2 sentences, summarize the talent pool quality.`,
        'You are an expert recruiter AI.'
      );

      return { matches, analysis };
    } catch (error) {
      console.error('Semantic candidate match error:', error);
      return { matches: [], analysis: 'Matching service temporarily unavailable' };
    }
  }

  async matchJobs(candidateProfile, jobListings) {
    // Score each job against the profile using vectorService
    const profileText = vectorService.profileToText(candidateProfile);
    const profileVec = vectorService.buildVector(profileText);

    const scored = jobListings.map(job => {
      const jobText = vectorService.jobToText(job);
      const jobVec = vectorService.buildVector(jobText);
      const score = vectorService.getMatchScore(job, candidateProfile);
      return { ...job, matchScore: score };
    });

    return scored.sort((a, b) => b.matchScore - a.matchScore);
  }

  async provideCareerAdvice(userQuery, userProfile) {
    return this.generateCompletion(
      `User profile: ${JSON.stringify(userProfile)}\nQuery: ${userQuery}`,
      'You are an expert career coach. Provide personalized career advice based on user profiles and queries.'
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
