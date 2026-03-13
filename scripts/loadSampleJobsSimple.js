import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Job from '../models/Job.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function loadSampleJobsSimple() {
  try {
    console.log('🔍 Checking existing jobs...');
    const jobCount = await Job.count();
    
    if (jobCount > 0) {
      console.log(`✅ Database already has ${jobCount} jobs. Skipping sample data load.`);
      return;
    }

    console.log('📦 Loading sample jobs into PostgreSQL database...');
    
    // Load sample jobs from JSON file
    const sampleJobsPath = path.join(__dirname, '../data/sample_jobs.json');
    const sampleJobsData = JSON.parse(fs.readFileSync(sampleJobsPath, 'utf8'));
    
    const jobsToInsert = [];
    
    for (let i = 0; i < sampleJobsData.length; i++) {
      const jobData = sampleJobsData[i];
      
      // Convert sample data to PostgreSQL format
      const job = {
        employerId: `EMP${String(1000 + i).padStart(4, '0')}`, // Simple employer ID
        positionId: `POS${String(2000 + i).padStart(4, '0')}`, // Simple position ID
        jobTitle: jobData.title,
        company: jobData.company,
        location: jobData.location,
        jobType: 'Full-time', // Default to Full-time
        workSetting: 'On-site', // Default
        description: jobData.jobDescription || jobData.description,
        requirements: jobData.requirements,
        responsibilities: jobData.responsibilities,
        skills: jobData.skills || [],
        salaryMin: extractSalaryMin(jobData.salary),
        salaryMax: extractSalaryMax(jobData.salary),
        currency: 'USD',
        experienceLevel: mapExperience(jobData.experience),
        employerEmail: `hr@${jobData.company.toLowerCase().replace(/\s+/g, '')}.com`,
        postedBy: `hr@${jobData.company.toLowerCase().replace(/\s+/g, '')}.com`,
        isActive: true,
        status: 'approved',
        views: Math.floor(Math.random() * 100),
        applicationsCount: Math.floor(Math.random() * 20)
      };
      
      jobsToInsert.push(job);
    }
    
    // Insert jobs using Sequelize
    await Job.bulkCreate(jobsToInsert);
    
    console.log(`✅ Successfully loaded ${jobsToInsert.length} sample jobs into PostgreSQL`);
    
  } catch (error) {
    console.error('❌ Error loading sample jobs:', error.message);
    throw error;
  }
}

function extractSalaryMin(salaryString) {
  if (!salaryString) return null;
  const match = salaryString.match(/\$?([\d,]+)/);
  return match ? parseInt(match[1].replace(/,/g, '')) : null;
}

function extractSalaryMax(salaryString) {
  if (!salaryString) return null;
  const matches = salaryString.match(/\$?([\d,]+)/g);
  if (matches && matches.length > 1) {
    return parseInt(matches[1].replace(/[\$,]/g, ''));
  }
  return null;
}

function mapExperience(experience) {
  if (!experience) return 'Mid';
  if (experience.includes('3+') || experience.includes('4+')) return 'Mid';
  if (experience.includes('5+') || experience.includes('Senior')) return 'Senior';
  if (experience.includes('Lead') || experience.includes('Principal')) return 'Lead';
  return 'Entry';
}