import express from 'express';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const router = express.Router();
const __dirname = dirname(fileURLToPath(import.meta.url));
const jobTitlesData = JSON.parse(readFileSync(join(__dirname, '../data/job_titles.json'), 'utf8'));

router.get('/', (req, res) => {
  res.json(jobTitlesData);
});

router.get('/search/:query', (req, res) => {
  const query = req.params.query.toLowerCase();
  const filtered = jobTitlesData.job_titles.filter(title =>
    title.toLowerCase().includes(query)
  );
  res.json({ job_titles: filtered });
});

export default router;
