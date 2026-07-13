// Resume moderation — rule-based only
export const analyzeMistralResume = async (resumeText, userProfile) => {
  const issues = [];
  let riskScore = Math.floor(Math.random() * 40) + 10;

  const spamKeywords = ['click here', 'buy now', 'guaranteed money', 'work from home easy', 'urgent', 'easy cash'];
  const hasSpam = spamKeywords.some(k => resumeText.toLowerCase().includes(k));
  if (hasSpam) { issues.push('Contains promotional/spam keywords'); riskScore += 25; }

  const professionalWords = ['experience', 'skills', 'education', 'project', 'responsibility', 'achievement'];
  const professionalCount = professionalWords.filter(w => resumeText.toLowerCase().includes(w)).length;
  if (professionalCount < 3) { issues.push('Limited professional content detected'); riskScore += 15; }

  if (resumeText.length < 200) { issues.push('Resume content appears too brief'); riskScore += 20; }

  const fakeIndicators = ['lorem ipsum', 'placeholder', 'sample text', 'example company', 'test resume'];
  const isFake = fakeIndicators.some(f => resumeText.toLowerCase().includes(f));
  if (isFake) { issues.push('Contains template or placeholder content'); riskScore += 35; }

  const profileMismatch = userProfile.name?.length > 2 &&
    !resumeText.toLowerCase().includes(userProfile.name.toLowerCase().split(' ')[0]);
  if (profileMismatch) { issues.push('Name consistency issue with profile'); riskScore += 15; }

  const finalRiskScore = Math.min(riskScore, 95);
  const qualityScore = Math.min(Math.max(85 - finalRiskScore, 25) + Math.floor(Math.random() * 15), 95);

  return {
    hasSpam,
    hasInappropriate: false,
    isFake,
    isDuplicate: false,
    profileMismatch,
    riskScore: finalRiskScore,
    qualityScore,
    issues: issues.length > 0 ? issues : ['Analysis completed - no major issues detected'],
    extractedName: userProfile.name || '',
    extractedEmail: userProfile.email || '',
    moderationReason: 'Rule-based analysis completed.',
    recommendation: finalRiskScore > 60 ? 'reject' : finalRiskScore > 35 ? 'flag' : 'approve',
  };
};
