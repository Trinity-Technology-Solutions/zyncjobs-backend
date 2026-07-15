import { sequelize } from '../config/postgresql.js';
import Job from '../models/Job.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function seed() {
  try {
    await sequelize.authenticate();
    console.log('DB connected');

    const companies = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/companies.json'), 'utf8'));
    const titles = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/job_titles.json'), 'utf8'));
    const locations = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/locations.json'), 'utf8'));
    const skills = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/skills.json'), 'utf8'));

    const jobTitles = Array.isArray(titles) ? titles : titles.job_titles;
    const locs = Array.isArray(locations) ? locations : locations.locations;
    const skillList = Array.isArray(skills) ? skills : skills.skills;

    const existing = await Job.count();
    if (existing > 0) {
      console.log(`Already have ${existing} jobs, skipping seed`);
      process.exit(0);
    }

    const jobs = [];
    for (let i = 0; i < 20; i++) {
      const c = companies[Math.floor(Math.random() * companies.length)];
      const t = jobTitles[Math.floor(Math.random() * jobTitles.length)];
      const l = locs[Math.floor(Math.random() * locs.length)];
      const s = [...skillList].sort(() => Math.random() - 0.5).slice(0, 5);

      const types = ['Full-time', 'Part-time', 'Contract', 'Freelance'];
      const workSettings = ['Remote', 'Hybrid', 'On-site'];
      const levels = ['Entry', 'Mid', 'Senior', 'Lead'];

      jobs.push({
        id: uuidv4(),
        employerId: uuidv4(),
        positionId: uuidv4(),
        jobTitle: t,
        company: c.name,
        companyLogo: c.logoUrl || `https://logo.clearbit.com/${c.domain}`,
        location: l,
        jobType: types[Math.floor(Math.random() * types.length)],
        workSetting: workSettings[Math.floor(Math.random() * workSettings.length)],
        description: `Exciting opportunity for ${t} at ${c.name}. Join a dynamic team and work on cutting-edge projects. We are looking for a passionate individual to help us build innovative solutions.`,
        requirements: `• ${s.slice(0, 3).join('\n• ')}`,
        responsibilities: `• Develop and maintain software solutions\n• Collaborate with cross-functional teams\n• Participate in code reviews\n• Write clean, scalable code`,
        skills: s,
        salaryMin: 300000 + Math.floor(Math.random() * 400000) * 1000,
        salaryMax: 700000 + Math.floor(Math.random() * 800000) * 1000,
        currency: 'INR',
        payRate: 'per year',
        payType: 'Range',
        experienceLevel: levels[Math.floor(Math.random() * levels.length)],
        employerEmail: `hr@${c.domain}`,
        postedByEmail: `hr@${c.domain}`,
        postedByName: c.name,
        isActive: true,
        status: 'approved',
        slug: `${t.toLowerCase().replace(/\s+/g, '-')}-${c.name.toLowerCase().replace(/\s+/g, '-')}-${i}`,
        views: Math.floor(Math.random() * 500),
        applicationsCount: Math.floor(Math.random() * 50),
        createdAt: new Date(Date.now() - Math.floor(Math.random() * 30) * 86400000),
        updatedAt: new Date()
      });
    }

    await Job.bulkCreate(jobs);
    console.log(`✅ Seeded ${jobs.length} sample jobs`);
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  }
}

seed();
