/**
 * Role Graph - Job title relationships and career progression paths
 * Maps job titles to related roles, seniority levels, and career paths
 */

export const SENIORITY_LEVELS = {
  INTERN: { level: 0, name: 'Intern', yearsMin: 0, yearsMax: 1 },
  JUNIOR: { level: 1, name: 'Junior', yearsMin: 0, yearsMax: 2 },
  MID: { level: 2, name: 'Mid-Level', yearsMin: 2, yearsMax: 5 },
  SENIOR: { level: 3, name: 'Senior', yearsMin: 5, yearsMax: 10 },
  LEAD: { level: 4, name: 'Lead', yearsMin: 7, yearsMax: 15 },
  PRINCIPAL: { level: 5, name: 'Principal', yearsMin: 10, yearsMax: 20 },
  STAFF: { level: 5, name: 'Staff', yearsMin: 10, yearsMax: 20 },
  ARCHITECT: { level: 6, name: 'Architect', yearsMin: 12, yearsMax: 25 },
  DIRECTOR: { level: 7, name: 'Director', yearsMin: 10, yearsMax: 30 },
  VP: { level: 8, name: 'VP', yearsMin: 15, yearsMax: 35 },
  CXO: { level: 9, name: 'C-Level', yearsMin: 20, yearsMax: 40 }
};

// Job title taxonomy with relationships
export const JOB_ROLES = {
  // Software Engineering
  'Software Engineer': {
    category: 'Engineering',
    synonyms: ['Software Developer', 'Programmer', 'Coder', 'Developer'],
    relatedRoles: ['Full Stack Developer', 'Backend Developer', 'Frontend Developer'],
    requiredSkills: ['Programming', 'Problem Solving', 'Data Structures', 'Algorithms'],
    careerPath: ['Junior Software Engineer', 'Software Engineer', 'Senior Software Engineer', 'Staff Engineer', 'Principal Engineer']
  },
  
  'Frontend Developer': {
    category: 'Engineering',
    synonyms: ['Front End Developer', 'UI Developer', 'Web Developer'],
    relatedRoles: ['Full Stack Developer', 'UI/UX Developer', 'React Developer'],
    requiredSkills: ['HTML', 'CSS', 'JavaScript', 'React', 'Vue.js', 'Angular'],
    careerPath: ['Junior Frontend Developer', 'Frontend Developer', 'Senior Frontend Developer', 'Lead Frontend Engineer']
  },
  
  'Backend Developer': {
    category: 'Engineering',
    synonyms: ['Back End Developer', 'Server-Side Developer', 'API Developer'],
    relatedRoles: ['Full Stack Developer', 'DevOps Engineer', 'Database Developer'],
    requiredSkills: ['Node.js', 'Python', 'Java', 'Databases', 'REST API', 'Microservices'],
    careerPath: ['Junior Backend Developer', 'Backend Developer', 'Senior Backend Developer', 'Backend Architect']
  },
  
  'Full Stack Developer': {
    category: 'Engineering',
    synonyms: ['Full-Stack Engineer', 'Full Stack Engineer'],
    relatedRoles: ['Software Engineer', 'Frontend Developer', 'Backend Developer'],
    requiredSkills: ['Frontend', 'Backend', 'Databases', 'DevOps', 'REST API'],
    careerPath: ['Junior Full Stack Developer', 'Full Stack Developer', 'Senior Full Stack Developer', 'Technical Lead']
  },
  
  'DevOps Engineer': {
    category: 'Engineering',
    synonyms: ['Site Reliability Engineer', 'SRE', 'Infrastructure Engineer', 'Platform Engineer'],
    relatedRoles: ['Cloud Engineer', 'System Administrator', 'Backend Developer'],
    requiredSkills: ['Docker', 'Kubernetes', 'CI/CD', 'AWS', 'Terraform', 'Linux'],
    careerPath: ['Junior DevOps Engineer', 'DevOps Engineer', 'Senior DevOps Engineer', 'DevOps Architect']
  },
  
  'Data Scientist': {
    category: 'Data',
    synonyms: ['ML Engineer', 'Machine Learning Engineer', 'AI Engineer'],
    relatedRoles: ['Data Analyst', 'Data Engineer', 'ML Researcher'],
    requiredSkills: ['Python', 'Machine Learning', 'Statistics', 'TensorFlow', 'PyTorch', 'SQL'],
    careerPath: ['Junior Data Scientist', 'Data Scientist', 'Senior Data Scientist', 'Principal Data Scientist']
  },
  
  'Data Engineer': {
    category: 'Data',
    synonyms: ['Big Data Engineer', 'ETL Developer', 'Data Pipeline Engineer'],
    relatedRoles: ['Data Scientist', 'Backend Developer', 'Database Administrator'],
    requiredSkills: ['Python', 'SQL', 'Spark', 'Airflow', 'Kafka', 'Data Warehousing'],
    careerPath: ['Junior Data Engineer', 'Data Engineer', 'Senior Data Engineer', 'Data Architect']
  },
  
  'Data Analyst': {
    category: 'Data',
    synonyms: ['Business Analyst', 'Analytics Engineer', 'BI Analyst'],
    relatedRoles: ['Data Scientist', 'Business Intelligence Developer', 'Product Analyst'],
    requiredSkills: ['SQL', 'Excel', 'Tableau', 'Power BI', 'Python', 'Statistics'],
    careerPath: ['Junior Data Analyst', 'Data Analyst', 'Senior Data Analyst', 'Lead Analyst']
  },
  
  'Mobile Developer': {
    category: 'Engineering',
    synonyms: ['iOS Developer', 'Android Developer', 'Mobile Engineer'],
    relatedRoles: ['Full Stack Developer', 'Frontend Developer'],
    requiredSkills: ['React Native', 'Flutter', 'Swift', 'Kotlin', 'Mobile UI/UX'],
    careerPath: ['Junior Mobile Developer', 'Mobile Developer', 'Senior Mobile Developer', 'Mobile Architect']
  },
  
  'QA Engineer': {
    category: 'Engineering',
    synonyms: ['Test Engineer', 'Quality Assurance Engineer', 'SDET', 'Automation Engineer'],
    relatedRoles: ['Software Engineer', 'DevOps Engineer'],
    requiredSkills: ['Testing', 'Selenium', 'Cypress', 'Jest', 'Test Automation', 'CI/CD'],
    careerPath: ['Junior QA Engineer', 'QA Engineer', 'Senior QA Engineer', 'QA Lead']
  },
  
  'Product Manager': {
    category: 'Product',
    synonyms: ['PM', 'Product Owner', 'Technical Product Manager'],
    relatedRoles: ['Project Manager', 'Business Analyst', 'Product Designer'],
    requiredSkills: ['Product Strategy', 'Roadmapping', 'Agile', 'User Research', 'Analytics'],
    careerPath: ['Associate Product Manager', 'Product Manager', 'Senior Product Manager', 'Director of Product']
  },
  
  'UI/UX Designer': {
    category: 'Design',
    synonyms: ['UX Designer', 'UI Designer', 'Product Designer', 'Interaction Designer'],
    relatedRoles: ['Frontend Developer', 'Graphic Designer', 'User Researcher'],
    requiredSkills: ['Figma', 'Sketch', 'Adobe XD', 'Prototyping', 'User Research', 'Wireframing'],
    careerPath: ['Junior Designer', 'UI/UX Designer', 'Senior Designer', 'Lead Designer']
  },
  
  'Security Engineer': {
    category: 'Security',
    synonyms: ['Cybersecurity Engineer', 'InfoSec Engineer', 'Application Security Engineer'],
    relatedRoles: ['DevOps Engineer', 'Backend Developer', 'Penetration Tester'],
    requiredSkills: ['Security', 'Penetration Testing', 'OWASP', 'Encryption', 'Compliance'],
    careerPath: ['Junior Security Engineer', 'Security Engineer', 'Senior Security Engineer', 'Security Architect']
  },
  
  'Cloud Engineer': {
    category: 'Engineering',
    synonyms: ['Cloud Architect', 'AWS Engineer', 'Azure Engineer', 'GCP Engineer'],
    relatedRoles: ['DevOps Engineer', 'Backend Developer', 'Infrastructure Engineer'],
    requiredSkills: ['AWS', 'Azure', 'GCP', 'Terraform', 'Kubernetes', 'Serverless'],
    careerPath: ['Junior Cloud Engineer', 'Cloud Engineer', 'Senior Cloud Engineer', 'Cloud Architect']
  },
  
  'Technical Writer': {
    category: 'Content',
    synonyms: ['Documentation Engineer', 'Developer Advocate', 'Content Engineer'],
    relatedRoles: ['Developer Relations', 'Product Manager', 'Software Engineer'],
    requiredSkills: ['Technical Writing', 'Documentation', 'Markdown', 'Git', 'API Documentation'],
    careerPath: ['Junior Technical Writer', 'Technical Writer', 'Senior Technical Writer', 'Documentation Lead']
  }
};

// Normalize job title
export const normalizeJobTitle = (title) => {
  if (!title) return '';
  
  const lower = title.toLowerCase().trim();
  
  // Remove common prefixes/suffixes
  const cleaned = lower
    .replace(/^(junior|senior|lead|staff|principal|sr|jr)\s+/i, '')
    .replace(/\s+(i|ii|iii|iv|v|1|2|3|4|5)$/i, '')
    .trim();
  
  // Find matching role
  for (const [canonical, data] of Object.entries(JOB_ROLES)) {
    if (canonical.toLowerCase() === cleaned) return canonical;
    if (data.synonyms.some(s => s.toLowerCase() === cleaned)) return canonical;
  }
  
  return title;
};

// Extract seniority level from title
export const extractSeniority = (title) => {
  if (!title) return SENIORITY_LEVELS.MID;
  
  const lower = title.toLowerCase();
  
  if (/\b(intern|internship)\b/.test(lower)) return SENIORITY_LEVELS.INTERN;
  if (/\b(junior|jr|entry|associate)\b/.test(lower)) return SENIORITY_LEVELS.JUNIOR;
  if (/\b(senior|sr)\b/.test(lower)) return SENIORITY_LEVELS.SENIOR;
  if (/\b(lead|team lead)\b/.test(lower)) return SENIORITY_LEVELS.LEAD;
  if (/\b(principal|staff)\b/.test(lower)) return SENIORITY_LEVELS.PRINCIPAL;
  if (/\b(architect)\b/.test(lower)) return SENIORITY_LEVELS.ARCHITECT;
  if (/\b(director)\b/.test(lower)) return SENIORITY_LEVELS.DIRECTOR;
  if (/\b(vp|vice president)\b/.test(lower)) return SENIORITY_LEVELS.VP;
  if (/\b(cto|ceo|cfo|coo|cmo|cpo)\b/.test(lower)) return SENIORITY_LEVELS.CXO;
  
  return SENIORITY_LEVELS.MID;
};

// Get related roles
export const getRelatedRoles = (title) => {
  const normalized = normalizeJobTitle(title);
  const roleData = JOB_ROLES[normalized];
  return roleData?.relatedRoles || [];
};

// Get required skills for a role
export const getRequiredSkills = (title) => {
  const normalized = normalizeJobTitle(title);
  const roleData = JOB_ROLES[normalized];
  return roleData?.requiredSkills || [];
};

// Get career path for a role
export const getCareerPath = (title) => {
  const normalized = normalizeJobTitle(title);
  const roleData = JOB_ROLES[normalized];
  return roleData?.careerPath || [];
};

// Calculate role similarity (0-1)
export const getRoleSimilarity = (title1, title2) => {
  const norm1 = normalizeJobTitle(title1);
  const norm2 = normalizeJobTitle(title2);
  
  // Exact match
  if (norm1 === norm2) return 1.0;
  
  // Check if related
  const related1 = getRelatedRoles(norm1);
  const related2 = getRelatedRoles(norm2);
  
  if (related1.includes(norm2) || related2.includes(norm1)) return 0.8;
  
  // Check if in same category
  const role1 = JOB_ROLES[norm1];
  const role2 = JOB_ROLES[norm2];
  
  if (role1 && role2 && role1.category === role2.category) return 0.6;
  
  // Check if in same career path
  const path1 = getCareerPath(norm1);
  const path2 = getCareerPath(norm2);
  
  if (path1.includes(norm2) || path2.includes(norm1)) return 0.7;
  
  return 0.0;
};

// Check if candidate experience matches job seniority
export const matchesSeniority = (candidateYears, jobTitle) => {
  const seniority = extractSeniority(jobTitle);
  const years = parseInt(candidateYears) || 0;
  
  return years >= seniority.yearsMin && years <= seniority.yearsMax;
};

export default {
  SENIORITY_LEVELS,
  JOB_ROLES,
  normalizeJobTitle,
  extractSeniority,
  getRelatedRoles,
  getRequiredSkills,
  getCareerPath,
  getRoleSimilarity,
  matchesSeniority
};
