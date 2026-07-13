// Job moderation — rule-based only (AI agent not needed for moderation)

// Enhanced rule-based moderation as fallback
export const basicModerationCheck = (jobData) => {
  const issues = [];
  let riskScore = 0;
  
  // Spam detection
  const spamKeywords = ['urgent', 'easy money', 'work from home guaranteed', 'no experience needed', 'make money fast'];
  const hasSpamKeywords = spamKeywords.some(keyword => 
    jobData.description.toLowerCase().includes(keyword.toLowerCase())
  );
  
  const isSpam = hasSpamKeywords || jobData.description.includes('!!!') || jobData.jobTitle.includes('$$$');
  if (isSpam) {
    issues.push('Contains spam indicators');
    riskScore += 40;
  }

  // Fake job detection
  const unrealisticSalary = jobData.salary?.max > 500000 || 
    (jobData.salary?.min > 0 && jobData.salary?.max / jobData.salary?.min > 10);
  
  const isFake = unrealisticSalary || jobData.description.length < 50 || !jobData.company.trim();
  if (isFake) {
    issues.push('Appears to be fake or incomplete');
    riskScore += 50;
  }

  // Compliance check
  const discriminatoryTerms = ['young', 'attractive', 'native speaker only', 'no disabilities', 'must be under'];
  const hasComplianceIssues = discriminatoryTerms.some(term =>
    jobData.description.toLowerCase().includes(term.toLowerCase())
  );
  
  if (hasComplianceIssues) {
    issues.push('Contains discriminatory language');
    riskScore += 30;
  }

  return {
    isSpam,
    isFake,
    hasComplianceIssues,
    isDuplicate: false,
    riskScore: Math.min(riskScore, 100),
    issues
  };
};

// Alias used by moderation.js
export const analyzeJobPost = basicModerationCheck;
