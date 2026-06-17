// AI Scoring Engine for Trinity Jobs
import { callGroq } from '../services/groqService.js';

export class AIScoring {
  
  // Resume Quality Scoring (0-100) — rule-based with optional AI enhancement
  static async scoreResume(resumeData, useAI = true) {
    let score = 0;
    
    if (resumeData.skills?.length >= 5) score += 30;
    else if (resumeData.skills?.length >= 3) score += 20;
    else if (resumeData.skills?.length >= 1) score += 10;
    
    if (resumeData.experience >= 5) score += 25;
    else if (resumeData.experience >= 2) score += 20;
    else if (resumeData.experience >= 1) score += 15;
    else score += 5;
    
    if (resumeData.education) score += 20;
    
    if (resumeData.email && resumeData.phone) score += 15;
    else if (resumeData.email || resumeData.phone) score += 10;
    
    if (resumeData.name && resumeData.location) score += 10;
    
    // Enhance with AI if requested
    if (useAI && process.env.GROQ_API_KEY) {
      try {
        const aiScore = await this.aiScore('resume', resumeData);
        score = Math.round(score * 0.5 + aiScore * 0.5);
      } catch { /* fallback to rule-based */ }
    }
    
    return Math.min(score, 100);
  }
  
  // Job Quality Scoring (0-100) — rule-based with optional AI enhancement
  static async scoreJob(jobData, useAI = true) {
    let score = 0;
    
    if (jobData.description?.length >= 200) score += 20;
    else if (jobData.description?.length >= 100) score += 15;
    else if (jobData.description?.length >= 50) score += 10;
    
    if (jobData.requirements?.length > 0) score += 20;
    
    if (jobData.company && jobData.location) score += 20;
    if (jobData.salary?.min > 0) score += 10;
    
    if (jobData.skills?.length >= 3) score += 20;
    else if (jobData.skills?.length >= 1) score += 10;
    
    if (jobData.jobType) score += 10;
    
    if (useAI && process.env.GROQ_API_KEY) {
      try {
        const aiScore = await this.aiScore('job', jobData);
        score = Math.round(score * 0.5 + aiScore * 0.5);
      } catch { /* fallback to rule-based */ }
    }
    
    return Math.min(score, 100);
  }
  
  // Job-Candidate Match Scoring (0-100) — rule-based with optional AI enhancement
  static async scoreMatch(candidateData, jobData, useAI = true) {
    let score = 0;
    
    const candidateSkills = candidateData.skills || [];
    const jobSkills = jobData.skills || [];
    
    if (jobSkills.length > 0) {
      const matchedSkills = candidateSkills.filter(skill => 
        jobSkills.some(jobSkill => 
          skill.toLowerCase().includes(jobSkill.toLowerCase()) ||
          jobSkill.toLowerCase().includes(skill.toLowerCase())
        )
      );
      score += Math.min((matchedSkills.length / jobSkills.length) * 50, 50);
    }
    
    const candidateExp = candidateData.experience || 0;
    const requiredExp = this.extractExperienceFromJob(jobData);
    
    if (candidateExp >= requiredExp) score += 25;
    else if (candidateExp >= requiredExp * 0.7) score += 20;
    else if (candidateExp >= requiredExp * 0.5) score += 15;
    else score += 5;
    
    if (candidateData.location && jobData.location) {
      if (candidateData.location.toLowerCase().includes(jobData.location.toLowerCase()) ||
          jobData.location.toLowerCase().includes(candidateData.location.toLowerCase())) {
        score += 15;
      } else {
        score += 5;
      }
    }
    
    if (candidateData.preferredJobType === jobData.jobType) score += 10;
    else score += 5;
    
    if (useAI && process.env.GROQ_API_KEY) {
      try {
        const aiScore = await this.aiMatchScore(candidateData, jobData);
        score = Math.round(score * 0.5 + aiScore * 0.5);
      } catch { /* fallback to rule-based */ }
    }
    
    return Math.min(score, 100);
  }
  
  // Risk Assessment Scoring (0-100, higher = more risky)
  static async scoreRisk(data, type = 'job', useAI = true) {
    let riskScore = 0;
    
    if (type === 'job') {
      if (this.hasSpamKeywords(data.description)) riskScore += 30;
      if (this.hasSuspiciousSalary(data.salary)) riskScore += 20;
      if (this.hasUrgentLanguage(data.description)) riskScore += 15;
      if (!data.company || data.company.length < 3) riskScore += 15;
      if (!data.requirements || data.requirements.length === 0) riskScore += 10;
      if (this.hasContactInfo(data.description)) riskScore += 10;
    }
    
    if (type === 'resume') {
      if (this.hasInconsistentDates(data)) riskScore += 25;
      if (this.hasUnrealisticClaims(data)) riskScore += 20;
      if (!data.email || !this.isValidEmail(data.email)) riskScore += 15;
      if (data.skills?.length > 20) riskScore += 10;
    }
    
    if (useAI && process.env.GROQ_API_KEY) {
      try {
        const prompt = `Analyze this ${type} data for risk factors, spam indicators, and red flags. Return a single number between 0-100 where 0 = no risk, 100 = extremely risky.

Data: ${JSON.stringify(data)}

Return ONLY a number, no other text.`;
        const raw = await callGroq({
          feature: 'ai-scoring',
          messages: [{ role: 'user', content: prompt }],
          maxTokens: 50,
          temperature: 0.1,
        });
        const aiRisk = parseInt(raw);
        if (!isNaN(aiRisk)) {
          riskScore = Math.round(riskScore * 0.4 + aiRisk * 0.6);
        }
      } catch { /* fallback to rule-based */ }
    }
    
    return Math.min(riskScore, 100);
  }
  
  // Overall AI Score Calculation
  static async calculateOverallScore(resumeData, jobData, matchData) {
    const resumeScore = await this.scoreResume(resumeData);
    const jobScore = await this.scoreJob(jobData);
    const matchScore = await this.scoreMatch(resumeData, jobData);
    const riskScore = await this.scoreRisk(jobData, 'job');
    
    const overallScore = Math.round(
      (resumeScore * 0.3) + 
      (jobScore * 0.2) + 
      (matchScore * 0.4) + 
      ((100 - riskScore) * 0.1)
    );
    
    return {
      overall: overallScore,
      breakdown: {
        resume: resumeScore,
        job: jobScore,
        match: matchScore,
        risk: riskScore
      },
      recommendation: this.getRecommendation(overallScore, riskScore),
      confidence: this.getConfidence(resumeScore, jobScore, matchScore)
    };
  }
  
  // AI-powered single score (0-100)
  static async aiScore(type, data) {
    const prompt = `Score this ${type} data from 0-100 where 100 is perfect. Consider quality, completeness, and relevance.
Return ONLY a number between 0-100, no other text.

Data: ${JSON.stringify(data)}`;
    const raw = await callGroq({
      feature: 'ai-scoring',
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 50,
      temperature: 0.1,
    });
    const score = parseInt(raw);
    if (isNaN(score)) throw new Error('Invalid AI score');
    return Math.max(0, Math.min(100, score));
  }
  
  // AI-powered match score (0-100)
  static async aiMatchScore(candidateData, jobData) {
    const prompt = `Score how well this candidate matches the job from 0-100 where 100 is perfect.
Consider: skills match, experience relevance, location, and overall fit.
Return ONLY a number between 0-100, no other text.

Candidate: ${JSON.stringify({ skills: candidateData.skills, experience: candidateData.experience, location: candidateData.location })}
Job: ${JSON.stringify({ skills: jobData.skills, requiredExp: jobData.experienceRange, location: jobData.location })}`;
    const raw = await callGroq({
      feature: 'job-match',
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 50,
      temperature: 0.1,
    });
    const score = parseInt(raw);
    if (isNaN(score)) throw new Error('Invalid AI match score');
    return Math.max(0, Math.min(100, score));
  }
  
  // Helper methods
  static extractExperienceFromJob(jobData) {
    if (jobData.experienceRange) {
      const range = jobData.experienceRange.toString();
      const match = range.match(/(\d+)/);
      if (match) return parseInt(match[1]);
    }
    const levelMap = { Entry: 0, Mid: 2, Senior: 5, Lead: 8 };
    if (jobData.experienceLevel && levelMap[jobData.experienceLevel] !== undefined) {
      return levelMap[jobData.experienceLevel];
    }
    const desc = ((jobData.description || '') + ' ' + (jobData.requirements || '')).toLowerCase();
    const textMatch = desc.match(/(\d+)\+?\s*years?/);
    if (textMatch) return parseInt(textMatch[1]);
    return 0;
  }
  
  static hasSpamKeywords(text) {
    const spamWords = ['urgent', 'immediate', 'easy money', 'work from home', 'no experience'];
    return spamWords.some(word => text?.toLowerCase().includes(word));
  }
  
  static hasSuspiciousSalary(salary) {
    return salary?.min > 200000 || (salary?.min > 0 && salary?.min < 20000);
  }
  
  static hasUrgentLanguage(text) {
    const urgentWords = ['asap', 'urgent', 'immediate', 'hurry'];
    return urgentWords.some(word => text?.toLowerCase().includes(word));
  }
  
  static hasContactInfo(text) {
    return /\b\d{10}\b|\b\w+@\w+\.\w+\b/.test(text);
  }
  
  static isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
  
  static getRecommendation(score, risk) {
    if (score >= 80 && risk < 20) return 'HIGHLY_RECOMMENDED';
    if (score >= 60 && risk < 40) return 'RECOMMENDED';
    if (score >= 40 && risk < 60) return 'REVIEW_REQUIRED';
    return 'NOT_RECOMMENDED';
  }
  
  static getConfidence(resumeScore, jobScore, matchScore) {
    const avg = (resumeScore + jobScore + matchScore) / 3;
    if (avg >= 80) return 'HIGH';
    if (avg >= 60) return 'MEDIUM';
    return 'LOW';
  }
}
