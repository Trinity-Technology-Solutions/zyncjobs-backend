import axios from 'axios';

// Mistral AI job detection with enhanced prompting

// Mistral AI-powered job moderation
export const analyzeJobPost = async (jobData) => {
  try {
    const prompt = `You are a job posting moderator. Analyze this job posting and respond ONLY with valid JSON.

Job Details:
- Title: ${jobData.jobTitle}
- Company: ${jobData.company}
- Location: ${jobData.location}
- Salary: ${jobData.salary?.min || 0}-${jobData.salary?.max || 0} ${jobData.salary?.currency || 'USD'}
- Description: ${jobData.description}
- Requirements: ${jobData.requirements?.join(', ') || 'None'}

Detect:
1. SPAM: Excessive caps, repeated text, suspicious links, "easy money" promises
2. FAKE: Unrealistic salary (>$500k), vague descriptions, missing company info, scam indicators
3. COMPLIANCE: Discriminatory language (age, gender, race), illegal requirements
4. RISK SCORE: 0-100 (0=clean, 100=definitely problematic)

Respond with this exact JSON format:
{"isSpam": false, "isFake": false, "hasComplianceIssues": false, "riskScore": 25, "issues": ["list specific issues found"]}`;

    const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
      model: 'mistralai/mistral-7b-instruct',
      messages: [{ 
        role: 'user', 
        content: prompt 
      }],
      temperature: 0.1,
      max_tokens: 500
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.FRONTEND_URL,
        'X-Title': 'ZyncJobs-Moderation'
      }
    });

    const aiResponse = response.data.choices[0].message.content.trim();
    
    // Extract JSON from response
    const jsonMatch = aiResponse.match(/\{[^}]+\}/s);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    // Fallback parsing
    return JSON.parse(aiResponse);
  } catch (error) {
    console.error('Mistral AI moderation error:', error.message);
    // Fallback to basic moderation if AI fails
    return basicModerationCheck(jobData);
  }
};

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