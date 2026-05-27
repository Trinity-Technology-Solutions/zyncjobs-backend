import express from 'express';
import { callAI } from '../services/openRouterService.js';

const router = express.Router();

async function aiCall(prompt, temperature = 0.3) {
  const raw = await callAI({ feature: 'ai-scoring', messages: [{ role: 'user', content: prompt }], maxTokens: 1200, temperature });
  const match = raw.match(/\{[\s\S]*\}/);
  return match ? JSON.parse(match[0]) : JSON.parse(raw);
}

// AI Scoring Flow Implementation
router.post('/score-candidate', async (req, res) => {
  try {
    const { jobDescription, candidateResume, jobId, candidateId } = req.body;

    // Step 1: Parse Job Requirements
    const jobRequirements = await parseJobRequirements(jobDescription);
    
    // Step 2: Parse Candidate Data
    const candidateData = await parseCandidateResume(candidateResume);
    
    // Step 3: AI Comparison & Scoring
    const scoringResult = await performAIScoring(jobRequirements, candidateData);
    
    // Step 4: Generate Final Report
    const finalReport = await generateScoringReport(scoringResult, jobRequirements, candidateData);

    res.json({
      success: true,
      jobId,
      candidateId,
      overallScore: finalReport.overallScore,
      breakdown: finalReport.breakdown,
      matchingSkills: finalReport.matchingSkills,
      missingSkills: finalReport.missingSkills,
      aiSummary: finalReport.aiSummary,
      riskFactors: finalReport.riskFactors,
      recommendation: finalReport.recommendation
    });

  } catch (error) {
    console.error('AI Scoring Error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'AI scoring failed',
      details: error.message 
    });
  }
});

// Step 1: Parse Job Requirements using Mistral AI
async function parseJobRequirements(jobDescription) {
  const prompt = `
Analyze this job description and extract structured requirements:

JOB DESCRIPTION:
${jobDescription}

Extract and return JSON with:
{
  "requiredSkills": ["skill1", "skill2"],
  "experienceLevel": "junior/mid/senior",
  "experienceYears": number,
  "education": ["degree1", "degree2"],
  "responsibilities": ["resp1", "resp2"],
  "keywords": ["keyword1", "keyword2"],
  "jobLevel": "entry/mid/senior/executive"
}
`;

  try {
    return await aiCall(prompt, 0.3);
  } catch (e) {
    return { requiredSkills: [], experienceLevel: 'mid', experienceYears: 2, education: [], responsibilities: [], keywords: [], jobLevel: 'mid' };
  }
}

// Step 2: Parse Candidate Resume using Mistral AI
async function parseCandidateResume(resumeText) {
  const prompt = `
Analyze this resume and extract structured candidate data:

RESUME:
${resumeText}

Extract and return JSON with:
{
  "skills": ["skill1", "skill2"],
  "experience": {
    "years": number,
    "level": "junior/mid/senior",
    "positions": ["position1", "position2"]
  },
  "education": ["degree1", "degree2"],
  "projects": ["project1", "project2"],
  "achievements": ["achievement1", "achievement2"],
  "keywords": ["keyword1", "keyword2"],
  "resumeQuality": "poor/average/good/excellent"
}
`;

  try {
    return await aiCall(prompt, 0.3);
  } catch (e) {
    return { skills: [], experience: { years: 0, level: 'junior', positions: [] }, education: [], projects: [], achievements: [], keywords: [], resumeQuality: 'average' };
  }
}

// Step 3: AI Comparison & Scoring
async function performAIScoring(jobRequirements, candidateData) {
  const prompt = `
Compare candidate data with job requirements and provide detailed scoring:

JOB REQUIREMENTS:
${JSON.stringify(jobRequirements, null, 2)}

CANDIDATE DATA:
${JSON.stringify(candidateData, null, 2)}

Analyze and return JSON with:
{
  "skillMatch": {
    "percentage": number (0-100),
    "matchingSkills": ["skill1", "skill2"],
    "missingSkills": ["skill1", "skill2"],
    "additionalSkills": ["skill1", "skill2"]
  },
  "experienceMatch": {
    "percentage": number (0-100),
    "levelMatch": boolean,
    "yearsGap": number,
    "relevantExperience": boolean
  },
  "educationMatch": {
    "percentage": number (0-100),
    "hasRequiredDegree": boolean,
    "educationLevel": "below/meets/exceeds"
  },
  "keywordRelevance": {
    "percentage": number (0-100),
    "matchingKeywords": ["keyword1", "keyword2"]
  },
  "resumeQualityScore": number (0-100),
  "overallFit": number (0-100)
}
`;

  try {
    return await aiCall(prompt, 0.2);
  } catch (e) {
    return { skillMatch: { percentage: 50, matchingSkills: [], missingSkills: [], additionalSkills: [] }, experienceMatch: { percentage: 50, levelMatch: false, yearsGap: 0, relevantExperience: false }, educationMatch: { percentage: 50, hasRequiredDegree: false, educationLevel: 'meets' }, keywordRelevance: { percentage: 50, matchingKeywords: [] }, resumeQualityScore: 60, overallFit: 50 };
  }
}

// Step 4: Generate Final Scoring Report
async function generateScoringReport(scoringResult, jobRequirements, candidateData) {
  const prompt = `
Generate a comprehensive hiring report based on this scoring analysis:

SCORING RESULTS:
${JSON.stringify(scoringResult, null, 2)}

JOB REQUIREMENTS:
${JSON.stringify(jobRequirements, null, 2)}

CANDIDATE DATA:
${JSON.stringify(candidateData, null, 2)}

Generate JSON report with:
{
  "overallScore": number (0-100),
  "breakdown": {
    "skillMatch": number,
    "experienceMatch": number,
    "educationMatch": number,
    "keywordRelevance": number,
    "resumeQuality": number
  },
  "matchingSkills": ["skill1", "skill2"],
  "missingSkills": ["skill1", "skill2"],
  "aiSummary": "Brief 2-3 sentence summary of candidate fit",
  "riskFactors": ["risk1", "risk2"],
  "recommendation": "hire/interview/reject",
  "strengths": ["strength1", "strength2"],
  "improvements": ["improvement1", "improvement2"]
}
`;

  try {
    const report = await aiCall(prompt, 0.4);
    
    // Calculate weighted overall score
    const weights = {
      skillMatch: 0.35,
      experienceMatch: 0.25,
      educationMatch: 0.15,
      keywordRelevance: 0.15,
      resumeQuality: 0.10
    };
    
    const calculatedScore = Math.round(
      (scoringResult.skillMatch.percentage * weights.skillMatch) +
      (scoringResult.experienceMatch.percentage * weights.experienceMatch) +
      (scoringResult.educationMatch.percentage * weights.educationMatch) +
      (scoringResult.keywordRelevance.percentage * weights.keywordRelevance) +
      (scoringResult.resumeQualityScore * weights.resumeQuality)
    );
    
    report.overallScore = calculatedScore;
    report.breakdown = {
      skillMatch: scoringResult.skillMatch.percentage,
      experienceMatch: scoringResult.experienceMatch.percentage,
      educationMatch: scoringResult.educationMatch.percentage,
      keywordRelevance: scoringResult.keywordRelevance.percentage,
      resumeQuality: scoringResult.resumeQualityScore
    };
    
    return report;
  } catch (e) {
    return {
      overallScore: 50,
      breakdown: {
        skillMatch: 50,
        experienceMatch: 50,
        educationMatch: 50,
        keywordRelevance: 50,
        resumeQuality: 50
      },
      matchingSkills: [],
      missingSkills: [],
      aiSummary: "Unable to generate detailed analysis",
      riskFactors: [],
      recommendation: "review",
      strengths: [],
      improvements: []
    };
  }
}

// Batch scoring for multiple candidates
router.post('/batch-score', async (req, res) => {
  try {
    const { jobDescription, candidates } = req.body;
    const results = [];

    for (const candidate of candidates) {
      try {
        const jobRequirements = await parseJobRequirements(jobDescription);
        const candidateData = await parseCandidateResume(candidate.resume);
        const scoringResult = await performAIScoring(jobRequirements, candidateData);
        const finalReport = await generateScoringReport(scoringResult, jobRequirements, candidateData);

        results.push({
          candidateId: candidate.id,
          candidateName: candidate.name,
          overallScore: finalReport.overallScore,
          recommendation: finalReport.recommendation,
          aiSummary: finalReport.aiSummary,
          breakdown: finalReport.breakdown
        });
      } catch (error) {
        results.push({
          candidateId: candidate.id,
          candidateName: candidate.name,
          error: 'Scoring failed',
          overallScore: 0
        });
      }
    }

    // Sort by score descending
    results.sort((a, b) => (b.overallScore || 0) - (a.overallScore || 0));

    res.json({
      success: true,
      totalCandidates: candidates.length,
      scoredCandidates: results.filter(r => !r.error).length,
      results
    });

  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Batch scoring failed',
      details: error.message 
    });
  }
});

export default router;
