import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sequelize } from '../config/postgresql.js';
import Company from '../models/Company.js';
import Job from '../models/Job.js';const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function loadInitialData() {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection established');

    // Load companies
    const companiesPath = path.join(__dirname, '../data/companies.json');
    const companiesData = JSON.parse(fs.readFileSync(companiesPath, 'utf8'));

    const companyCount = await Company.count();
    if (companyCount === 0) {
      console.log('📦 Loading companies into database...');
      const companiesToInsert = (Array.isArray(companiesData) ? companiesData : []).slice(0, 50).map(c => ({
        name: c.name,
        domain: c.domain,
        logo: c.logoUrl || `https://logo.clearbit.com/${c.domain}`,
        website: `https://${c.domain}`,
        industry: 'Technology',
        size: '1000-5000',
        location: 'Global',
        description: `${c.name} is a leading technology company.`,
        verified: true,
        verificationStatus: 'verified',
        profileCompleted: true
      }));
      await Company.bulkCreate(companiesToInsert, { ignoreDuplicates: true });
      console.log(`✅ Loaded ${companiesToInsert.length} companies`);
    } else {
      console.log(`ℹ️ ${companyCount} companies already exist, skipping`);
    }

    // Load sample jobs (disabled by default - let employers post their own jobs)
    const sampleJobsPath = path.join(__dirname, '../data/sample_jobs.json');
    const sampleJobsData = JSON.parse(fs.readFileSync(sampleJobsPath, 'utf8'));

    const jobCount = await Job.count();
    if (jobCount === 0 && process.env.LOAD_SAMPLE_DATA === 'true') {
      console.log('📦 Loading sample jobs into database...');
      const jobsToInsert = (Array.isArray(sampleJobsData) ? sampleJobsData : []).slice(0, 20).map(j => ({
        employerId: 'sample-employer',
        positionId: `sample-pos-${j._id || Date.now()}`,
        jobTitle: j.title,
        company: j.company,
        companyLogo: j.logo,
        location: j.location,
        jobType: j.type || 'Full-time',
        description: j.jobDescription || j.description || '',
        requirements: Array.isArray(j.requirements) ? j.requirements.join(', ') : (j.requirements || ''),
        skills: Array.isArray(j.skills) ? j.skills : [],
        salaryMin: 50000,
        salaryMax: 150000,
        currency: 'USD',
        employerEmail: 'sample@zyncjobs.com',
        experienceLevel: 'Mid',
        experienceRange: j.experience || '3-5 years',
        isActive: true,
        status: 'active'
      }));
      await Job.bulkCreate(jobsToInsert, { ignoreDuplicates: true });
      console.log(`✅ Loaded ${jobsToInsert.length} sample jobs`);
    } else {
      console.log(jobCount === 0 ? 'ℹ️ Sample jobs disabled (set LOAD_SAMPLE_DATA=true to enable)' : `ℹ️ ${jobCount} jobs already exist, skipping`);
    }

    console.log('✅ Initial data loaded successfully');
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error loading initial data:', error.message);
    await sequelize.close();
    process.exit(1);
  }
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  loadInitialData();
}