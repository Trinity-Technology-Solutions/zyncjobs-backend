const JOB_TITLES = ['Software Engineer', 'Product Manager', 'Data Scientist', 'DevOps Engineer', 'Frontend Developer', 'Backend Developer', 'Full Stack Developer', 'UI/UX Designer', 'Business Analyst', 'Project Manager'];
const SKILLS = ['JavaScript', 'Python', 'React', 'Node.js', 'SQL', 'AWS', 'Docker', 'TypeScript', 'Java', 'Git', 'MongoDB', 'PostgreSQL'];
const LOCATIONS = ['Bangalore', 'Mumbai', 'Delhi', 'Hyderabad', 'Chennai', 'Pune', 'Kolkata', 'Remote'];

const filter = (list, input) => list.filter(i => i.toLowerCase().includes(input.toLowerCase())).slice(0, 5);

const mistralService = {
  generateJobTitleSuggestions: async (input) => filter(JOB_TITLES, input),
  generateSkillSuggestions: async (input) => filter(SKILLS, input),
  generateLocationSuggestions: async (input) => filter(LOCATIONS, input),
  generateJobDescription: async (jobTitle, company, location) => {
    return `We are looking for a ${jobTitle}${company ? ` at ${company}` : ''}${location ? ` in ${location}` : ''}. The ideal candidate will have relevant experience and skills for this role.`;
  },
  getFallbackJobTitles: (input) => filter(JOB_TITLES, input),
  getFallbackSkills: (input) => filter(SKILLS, input),
  getFallbackLocations: (input) => filter(LOCATIONS, input)
};

export default mistralService;
