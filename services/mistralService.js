import aiClient from './aiClient.js';

async function quickSuggest(prompt) {
  const result = await aiClient.suggest(prompt);
  return (result.reply || '').split('\n')
    .map(l => l.replace(/^[-•*\d.\s]+/, '').trim())
    .filter(l => l.length > 1)
    .slice(0, 5);
}

const mistralService = {
  generateJobTitleSuggestions: async (input) => {
    try {
      return await quickSuggest(`Suggest 5 relevant job titles that match or relate to "${input}". Return only the titles, one per line, no numbering or bullets.`);
    } catch { return []; }
  },
  generateSkillSuggestions: async (input) => {
    try {
      return await quickSuggest(`Suggest 5 relevant skills that match or relate to "${input}". Return only the skill names, one per line, no numbering or bullets.`);
    } catch { return []; }
  },
  generateLocationSuggestions: async (input) => {
    try {
      return await quickSuggest(`Suggest 5 cities or locations that match or relate to "${input}". Include Indian cities and "Remote" if relevant. Return only location names, one per line.`);
    } catch { return []; }
  },
  generateJobDescription: async (jobTitle, company, location) => {
    try {
      const result = await aiClient.generateJD(jobTitle, '', []);
      return result.job_description || `We are looking for a ${jobTitle}${company ? ` at ${company}` : ''}${location ? ` in ${location}` : ''}.`;
    } catch {
      return `We are looking for a ${jobTitle}${company ? ` at ${company}` : ''}${location ? ` in ${location}` : ''}.`;
    }
  },
  getFallbackJobTitles: () => [],
  getFallbackSkills: () => [],
  getFallbackLocations: () => [],
};

export default mistralService;
