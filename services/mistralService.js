import { callGroq } from './groqService.js';

async function aiSuggest(prompt, feature = 'default') {
  const text = await callGroq({
    feature,
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 400,
    temperature: 0.4,
  });
  return text.split('\n')
    .map(l => l.replace(/^[-•*\d.\s]+/, '').trim())
    .filter(l => l.length > 1)
    .slice(0, 5);
}

const mistralService = {
  generateJobTitleSuggestions: async (input) => {
    try {
      return await aiSuggest(
        `Suggest 5 relevant job titles that match or relate to "${input}". Return only the titles, one per line, no numbering or bullets.`,
        'job-titles'
      );
    } catch {
      return [];
    }
  },
  generateSkillSuggestions: async (input) => {
    try {
      return await aiSuggest(
        `Suggest 5 relevant skills that match or relate to "${input}". Return only the skill names, one per line, no numbering or bullets.`,
        'skills'
      );
    } catch {
      return [];
    }
  },
  generateLocationSuggestions: async (input) => {
    try {
      return await aiSuggest(
        `Suggest 5 cities or locations that match or relate to "${input}". Include both Indian cities and "Remote" if relevant. Return only the location names, one per line, no numbering or bullets.`,
        'locations'
      );
    } catch {
      return [];
    }
  },
  generateJobDescription: async (jobTitle, company, location) => {
    try {
      const prompt = `Write a 3-4 sentence professional job description for a ${jobTitle}${company ? ` at ${company}` : ''}${location ? ` in ${location}` : ''}. Keep it concise and professional.`;
      return await callGroq({
        feature: 'jd-generate',
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 300,
        temperature: 0.4,
      });
    } catch {
      return `We are looking for a ${jobTitle}${company ? ` at ${company}` : ''}${location ? ` in ${location}` : ''}. The ideal candidate will have relevant experience and skills for this role.`;
    }
  },
  getFallbackJobTitles: () => [],
  getFallbackSkills: () => [],
  getFallbackLocations: () => []
};

export default mistralService;
