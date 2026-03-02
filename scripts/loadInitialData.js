import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Company from '../models/Company.js';
import Job from '../models/Job.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function loadInitialData() {
  try {
    // Load companies
    const companiesPath = path.join(__dirname, '../data/companies.json');
    const companiesData = JSON.parse(fs.readFileSync(companiesPath, 'utf8'));
    
    const companyCount = await Company.countDocuments();
    if (companyCount === 0) {
      console.log('📦 Loading companies into database...');
      const companiesToInsert = companiesData.slice(0, 50).map(c => ({
        name: c.name,
        website: `https://${c.domain}`,
        logo: `https://logo.clearbit.com/${c.domain}`,
        industry: 'Technology',
        employees: '1000-5000',
        location: 'Global',
        description: `${c.name} is a leading technology company.`,
        isHiring: true
      }));
      await Company.insertMany(companiesToInsert);
      console.log(`✅ Loaded ${companiesToInsert.length} companies`);
    }

    // Load sample jobs
    const jobTitlesPath = path.join(__dirname, '../data/job_titles.json');
    const locationsPath = path.join(__dirname, '../data/locations.json');
    const skillsPath = path.join(__dirname, '../data/skills.json');
    
    const jobTitlesData = JSON.parse(fs.readFileSync(jobTitlesPath, 'utf8'));
    const locationsData = JSON.parse(fs.readFileSync(locationsPath, 'utf8'));
    const skillsData = JSON.parse(fs.readFileSync(skillsPath, 'utf8'));
    
    const jobTitles = Array.isArray(jobTitlesData) ? jobTitlesData : jobTitlesData.job_titles;
    const locations = Array.isArray(locationsData) ? locationsData : locationsData.locations;
    const skills = Array.isArray(skillsData) ? skillsData : skillsData.skills;

    const jobCount = await Job.countDocuments();
    // Disable automatic sample job loading - let employers post their own jobs
    if (jobCount === 0 && process.env.LOAD_SAMPLE_DATA === 'true') {
      console.log('📦 Loading sample jobs into database...');
      const sampleJobs = [];
      
      for (let i = 0; i < 20; i++) {
        const randomCompany = companiesData[Math.floor(Math.random() * Math.min(50, companiesData.length))];
        const randomTitle = jobTitles[Math.floor(Math.random() * jobTitles.length)];
        const randomLocation = locations[Math.floor(Math.random() * locations.length)];
        const randomSkills = skills.sort(() => 0.5 - Math.random()).slice(0, 5);
        
        sampleJobs.push({
          jobTitle: randomTitle || 'Software Developer',
          company: randomCompany?.name || 'Tech Company',
          location: randomLocation || 'Remote',
          jobType: ['Full-time', 'Part-time', 'Contract'][Math.floor(Math.random() * 3)],
          description: `Exciting opportunity for ${randomTitle || 'Software Developer'} at ${randomCompany?.name || 'Tech Company'}. Join our team and work on cutting-edge projects.`,
          requirements: randomSkills.length > 0 ? [randomSkills.join(', ')] : ['Experience with relevant technologies'],
          skills: randomSkills.length > 0 ? randomSkills : ['JavaScript', 'React'],
          salary: {
            min: 50000 + Math.floor(Math.random() * 50000),
            max: 100000 + Math.floor(Math.random() * 100000),
            currency: 'USD',
            period: 'yearly'
          },
          isActive: true,
          status: 'approved'
        });
      }
      
      await Job.insertMany(sampleJobs);
      console.log(`✅ Loaded ${sampleJobs.length} sample jobs`);
    }

    console.log('✅ Initial data loaded successfully');
  } catch (error) {
    console.error('❌ Error loading initial data:', error.message);
  }
}
