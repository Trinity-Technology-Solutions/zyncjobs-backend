// Job detection — rule-based only
export class MistralJobDetector {

  async detectJobIssues(jobData) {
    return this.getFallbackAnalysis(jobData);
  }

  async batchAnalyze(jobs) {
    const results = [];
    for (const job of jobs) {
      results.push({ jobId: job._id, analysis: this.getFallbackAnalysis(job) });
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return results;
  }

  getFallbackAnalysis(jobData = {}) {
    let riskScore = Math.floor(Math.random() * 35) + 5;
    const issues = [];

    if (jobData.description?.length < 100) { riskScore += 25; issues.push('Job description too brief'); }
    if (jobData.salary?.max > 500000) { riskScore += 35; issues.push('Unrealistic salary range detected'); }

    const spamWords = ['urgent', 'easy money', 'work from home guaranteed', 'no experience needed'];
    const hasSpamContent = spamWords.some(w => jobData.description?.toLowerCase().includes(w));
    if (hasSpamContent) { riskScore += 30; issues.push('Contains promotional language'); }

    if (!jobData.company || jobData.company.length < 3) { riskScore += 20; issues.push('Company information insufficient'); }

    const professionalTerms = ['responsibilities', 'requirements', 'qualifications', 'benefits'];
    const professionalCount = professionalTerms.filter(t => jobData.description?.toLowerCase().includes(t)).length;
    if (professionalCount < 2) { riskScore += 15; issues.push('Limited professional structure'); }

    const finalRiskScore = Math.min(riskScore, 90);
    return {
      isSpam: hasSpamContent,
      isFake: finalRiskScore > 45,
      hasComplianceIssues: false,
      riskScore: finalRiskScore,
      issues: issues.length > 0 ? issues : ['Standard analysis completed - no major issues'],
      recommendation: finalRiskScore > 55 ? 'reject' : finalRiskScore > 30 ? 'flag' : 'approve',
    };
  }
}

export const mistralDetector = new MistralJobDetector();
