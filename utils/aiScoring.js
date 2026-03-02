// AI Scoring Engine for Trinity Jobs
export class AIScoring {
  
  // Resume Quality Scoring (0-100)
  static scoreResume(resumeData) {
    let score = 0;
    
    // Skills match (30 points)
    if (resumeData.skills?.length >= 5) score += 30;
    else if (resumeData.skills?.length >= 3) score += 20;
    else if (resumeData.skills?.length >= 1) score += 10;
    
    // Experience (25 points)
    if (resumeData.experience >= 5) score += 25;
    else if (resumeData.experience >= 2) score += 20;
    else if (resumeData.experience >= 1) score += 15;
    else score += 5;
    
    // Education (20 points)
    if (resumeData.education) score += 20;
    
    // Contact info (15 points)
    if (resumeData.email && resumeData.phone) score += 15;
    else if (resumeData.email || resumeData.phone) score += 10;
    
    // Profile completeness (10 points)
    if (resumeData.name && resumeData.location) score += 10;
    
    return Math.min(score, 100);
  }
  
  // Job Quality Scoring (0-100)
  static scoreJob(jobData) {
    let score = 0;
    
    // Content quality (40 points)
    if (jobData.description?.length >= 200) score += 20;
    else if (jobData.description?.length >= 100) score += 15;
    else if (jobData.description?.length >= 50) score += 10;
    
    if (jobData.requirements?.length > 0) score += 20;
    
    // Company info (30 points)
    if (jobData.company && jobData.location) score += 20;
    if (jobData.salary?.min > 0) score += 10;
    
    // Skills specified (20 points)
    if (jobData.skills?.length >= 3) score += 20;
    else if (jobData.skills?.length >= 1) score += 10;
    
    // Job type (10 points)
    if (jobData.jobType) score += 10;
    
    return Math.min(score, 100);
  }
  
  // Job-Candidate Match Scoring (0-100)
  static scoreMatch(candidateData, jobData) {
    let score = 0;
    
    // Skills match (50 points)
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
    
    // Experience match (25 points)
    const candidateExp = candidateData.experience || 0;
    const requiredExp = this.extractExperienceFromJob(jobData);
    
    if (candidateExp >= requiredExp) score += 25;
    else if (candidateExp >= requiredExp * 0.7) score += 20;
    else if (candidateExp >= requiredExp * 0.5) score += 15;
    else score += 5;
    
    // Location match (15 points)
    if (candidateData.location && jobData.location) {
      if (candidateData.location.toLowerCase().includes(jobData.location.toLowerCase()) ||
          jobData.location.toLowerCase().includes(candidateData.location.toLowerCase())) {
        score += 15;
      } else {
        score += 5; // Remote possibility
      }
    }
    
    // Job type preference (10 points)
    if (candidateData.preferredJobType === jobData.jobType) score += 10;
    else score += 5;
    
    return Math.min(score, 100);
  }
  
  // Risk Assessment Scoring (0-100, higher = more risky)
  static scoreRisk(data, type = 'job') {
    let riskScore = 0;
    
    if (type === 'job') {
      // Spam indicators
      if (this.hasSpamKeywords(data.description)) riskScore += 30;
      if (this.hasSuspiciousSalary(data.salary)) riskScore += 20;
      if (this.hasUrgentLanguage(data.description)) riskScore += 15;
      if (!data.company || data.company.length < 3) riskScore += 15;
      if (!data.requirements || data.requirements.length === 0) riskScore += 10;
      if (this.hasContactInfo(data.description)) riskScore += 10;
    }
    
    if (type === 'resume') {
      // Resume red flags
      if (this.hasInconsistentDates(data)) riskScore += 25;
      if (this.hasUnrealisticClaims(data)) riskScore += 20;
      if (!data.email || !this.isValidEmail(data.email)) riskScore += 15;
      if (data.skills?.length > 20) riskScore += 10; // Too many skills
    }
    
    return Math.min(riskScore, 100);
  }
  
  // Overall AI Score Calculation
  static calculateOverallScore(resumeData, jobData, matchData) {
    const resumeScore = this.scoreResume(resumeData);
    const jobScore = this.scoreJob(jobData);
    const matchScore = this.scoreMatch(resumeData, jobData);
    const riskScore = this.scoreRisk(jobData, 'job');
    
    // Weighted average
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
  
  // Helper methods
  static extractExperienceFromJob(jobData) {
    const desc = (jobData.description + ' ' + (jobData.requirements || '')).toLowerCase();
    if (desc.includes('5+ years') || desc.includes('5 years')) return 5;
    if (desc.includes('3+ years') || desc.includes('3 years')) return 3;
    if (desc.includes('2+ years') || desc.includes('2 years')) return 2;
    if (desc.includes('1+ year') || desc.includes('1 year')) return 1;
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