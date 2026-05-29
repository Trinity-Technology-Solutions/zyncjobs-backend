// Test AI Scoring Logic
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
config({ path: join(__dirname, '..', '.env') });

// Mock job data
const mockJob = {
  id: 'test-job-1',
  jobTitle: 'Senior Software Developer',
  company: 'Tech Corp',
  skills: ['JavaScript', 'React', 'Node.js', 'PostgreSQL', 'AWS'],
  experienceLevel: 'Senior',
  experienceRange: '5+ years',
  description: 'We are looking for a senior software developer with experience in full-stack development.',
  requirements: 'Must have 5+ years of experience with JavaScript and React.'
};

// Mock candidate profiles
const mockCandidates = [
  {
    candidateEmail: 'john@example.com',
    candidateName: 'John Doe',
    skills: ['JavaScript', 'React', 'Node.js', 'MongoDB', 'Docker'],
    yearsExp: 6,
    education: 'BS Computer Science',
    location: 'San Francisco, CA'
  },
  {
    candidateEmail: 'jane@example.com',
    candidateName: 'Jane Smith',
    skills: ['Python', 'Django', 'MySQL', 'Linux'],
    yearsExp: 3,
    education: 'MS Software Engineering',
    location: 'New York, NY'
  },
  {
    candidateEmail: 'bob@example.com',
    candidateName: 'Bob Wilson',
    skills: ['JavaScript', 'React', 'Node.js', 'PostgreSQL', 'AWS', 'TypeScript'],
    yearsExp: 8,
    education: 'BS Computer Engineering',
    location: 'Austin, TX'
  }
];

// Scoring functions (copied from aiRejectionSettings.js)
const EXP_MAP = { Entry: 0, Mid: 2, Senior: 5, Lead: 8 };

function scoreSkills(candidateSkills = [], jobSkills = []) {
  if (!jobSkills.length) return 50; // No job skills specified
  if (!candidateSkills.length) return 0; // No candidate skills
  
  const matched = candidateSkills.filter(candidateSkill =>
    jobSkills.some(jobSkill => 
      candidateSkill.toLowerCase().includes(jobSkill.toLowerCase()) || 
      jobSkill.toLowerCase().includes(candidateSkill.toLowerCase()) ||
      candidateSkill.toLowerCase() === jobSkill.toLowerCase()
    )
  );
  
  const matchPercentage = (matched.length / jobSkills.length) * 100;
  return Math.round(matchPercentage);
}

function scoreExperience(candidateYearsExp = 0, jobExperienceLevel = 'Mid', jobExperienceRange = '') {
  // Parse experience from job requirements
  let requiredYears = EXP_MAP[jobExperienceLevel] ?? 2;
  
  // Try to extract years from experienceRange if available
  if (jobExperienceRange) {
    const rangeMatch = jobExperienceRange.match(/(\\d+)[-+]?\\s*(?:to\\s*)?(\\d+)?\\s*years?/i);
    if (rangeMatch) {
      requiredYears = parseInt(rangeMatch[1]);
    }
  }
  
  const candidateYears = parseFloat(candidateYearsExp) || 0;
  
  if (requiredYears === 0) return candidateYears >= 0 ? 100 : 50;
  if (candidateYears >= requiredYears) {
    // Bonus for exceeding requirements, but cap at 100
    return Math.min(100, 85 + Math.min(15, (candidateYears - requiredYears) * 3));
  }
  
  // Penalty for not meeting requirements
  const ratio = candidateYears / requiredYears;
  if (ratio >= 0.8) return Math.round(ratio * 80); // 80% if close
  if (ratio >= 0.5) return Math.round(ratio * 60); // 60% if halfway
  return Math.round(ratio * 40); // Lower score for significant gaps
}

// Test the scoring
console.log('🧪 Testing AI Scoring Logic\\n');
console.log('Job Requirements:');
console.log(`- Title: ${mockJob.jobTitle}`);
console.log(`- Skills: ${mockJob.skills.join(', ')}`);
console.log(`- Experience Level: ${mockJob.experienceLevel}`);
console.log(`- Experience Range: ${mockJob.experienceRange}\\n`);

mockCandidates.forEach((candidate, index) => {
  console.log(`Candidate ${index + 1}: ${candidate.candidateName}`);
  console.log(`- Skills: ${candidate.skills.join(', ')}`);
  console.log(`- Experience: ${candidate.yearsExp} years`);
  
  const skillsScore = scoreSkills(candidate.skills, mockJob.skills);
  const experienceScore = scoreExperience(candidate.yearsExp, mockJob.experienceLevel, mockJob.experienceRange);
  const overallScore = Math.round((skillsScore * 0.6) + (experienceScore * 0.4));
  
  console.log(`- Skills Match: ${skillsScore}%`);
  console.log(`- Experience Match: ${experienceScore}%`);
  console.log(`- Overall Score: ${overallScore}%`);
  
  // Find matching skills
  const matchingSkills = candidate.skills.filter(candidateSkill =>
    mockJob.skills.some(jobSkill => 
      candidateSkill.toLowerCase().includes(jobSkill.toLowerCase()) || 
      jobSkill.toLowerCase().includes(candidateSkill.toLowerCase()) ||
      candidateSkill.toLowerCase() === jobSkill.toLowerCase()
    )
  );
  
  const missingSkills = mockJob.skills.filter(jobSkill =>
    !candidate.skills.some(candidateSkill => 
      candidateSkill.toLowerCase().includes(jobSkill.toLowerCase()) || 
      jobSkill.toLowerCase().includes(candidateSkill.toLowerCase()) ||
      candidateSkill.toLowerCase() === jobSkill.toLowerCase()
    )
  );
  
  console.log(`- Matching Skills: ${matchingSkills.join(', ') || 'None'}`);
  console.log(`- Missing Skills: ${missingSkills.join(', ') || 'None'}`);
  console.log('---\\n');
});

console.log('✅ AI Scoring test completed!');