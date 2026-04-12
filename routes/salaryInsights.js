import express from 'express';
import { Op } from 'sequelize';
import Job from '../models/Job.js';

const router = express.Router();

// GET salary insights by job title
router.get('/by-title', async (req, res) => {
  try {
    const { title } = req.query;
    if (!title) return res.status(400).json({ error: 'title required' });

    const jobs = await Job.findAll({
      where: {
        jobTitle: { [Op.iLike]: `%${title}%` },
        isActive: true,
        salaryMin: { [Op.gt]: 0 },
        salaryMax: { [Op.gt]: 0 },
      },
      attributes: ['jobTitle', 'salaryMin', 'salaryMax', 'experienceLevel', 'location', 'company'],
    });

    if (jobs.length === 0) return res.json({ found: false, title, message: 'No salary data available' });

    const salaries = jobs.map(j => ({ min: j.salaryMin, max: j.salaryMax, avg: (j.salaryMin + j.salaryMax) / 2 }));
    const avgMin = Math.round(salaries.reduce((s, j) => s + j.min, 0) / salaries.length);
    const avgMax = Math.round(salaries.reduce((s, j) => s + j.max, 0) / salaries.length);
    const avgSalary = Math.round(salaries.reduce((s, j) => s + j.avg, 0) / salaries.length);
    const marketMin = Math.min(...salaries.map(j => j.min));
    const marketMax = Math.max(...salaries.map(j => j.max));

    // By experience level
    const byLevel = {};
    ['Entry', 'Mid', 'Senior', 'Lead'].forEach(level => {
      const levelJobs = jobs.filter(j => j.experienceLevel === level);
      if (levelJobs.length > 0) {
        const lvlAvg = Math.round(levelJobs.reduce((s, j) => s + (j.salaryMin + j.salaryMax) / 2, 0) / levelJobs.length);
        byLevel[level] = { avg: lvlAvg, count: levelJobs.length };
      }
    });

    // Top paying companies
    const companyMap = {};
    jobs.forEach(j => {
      if (!companyMap[j.company]) companyMap[j.company] = [];
      companyMap[j.company].push((j.salaryMin + j.salaryMax) / 2);
    });
    const topCompanies = Object.entries(companyMap)
      .map(([company, avgs]) => ({ company, avg: Math.round(avgs.reduce((a, b) => a + b, 0) / avgs.length) }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 5);

    res.json({ found: true, title, totalJobs: jobs.length, avgSalary, avgMin, avgMax, marketMin, marketMax, byLevel, topCompanies });
  } catch (err) {
    console.error('Salary insights error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET market overview - top roles salary
router.get('/market-overview', async (req, res) => {
  try {
    const jobs = await Job.findAll({
      where: {
        isActive: true,
        salaryMin: { [Op.gt]: 0 },
        salaryMax: { [Op.gt]: 0 },
      },
      attributes: ['jobTitle', 'salaryMin', 'salaryMax', 'jobCategory'],
    });

    const titleMap = {};
    jobs.forEach(j => {
      const key = j.jobTitle;
      if (!titleMap[key]) titleMap[key] = [];
      titleMap[key].push((j.salaryMin + j.salaryMax) / 2);
    });

    const topRoles = Object.entries(titleMap)
      .map(([title, avgs]) => ({
        title,
        avg: Math.round(avgs.reduce((a, b) => a + b, 0) / avgs.length),
        count: avgs.length,
      }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 10);

    res.json({ topRoles, totalJobs: jobs.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET salary comparison
router.get('/compare', async (req, res) => {
  try {
    const { title, expected } = req.query;
    if (!title || !expected) return res.status(400).json({ error: 'title and expected required' });

    const jobs = await Job.findAll({
      where: {
        jobTitle: { [Op.iLike]: `%${title}%` },
        isActive: true,
        salaryMin: { [Op.gt]: 0 },
        salaryMax: { [Op.gt]: 0 },
      },
      attributes: ['salaryMin', 'salaryMax'],
    });

    if (jobs.length === 0) return res.json({ found: false });

    const avgMarket = Math.round(jobs.reduce((s, j) => s + (j.salaryMin + j.salaryMax) / 2, 0) / jobs.length);
    const exp = Number(expected);
    const diff = exp - avgMarket;
    const pct = Math.round((diff / avgMarket) * 100);
    const status = pct > 10 ? 'above' : pct < -10 ? 'below' : 'market';

    res.json({ found: true, title, expectedSalary: exp, marketAvg: avgMarket, diff, pct, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
