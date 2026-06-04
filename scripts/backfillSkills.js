/**
 * One-time script: backfill skills for existing candidates who have a resumeUrl but empty skills[]
 * Run once: node scripts/backfillSkills.js
 */
import '../config/postgresql.js'; // init sequelize
import User from '../models/User.js';
import { getResumeStreamFromS3 } from '../services/s3Service.js';
import pdfTextExtractor from '../services/pdfTextExtractor.js';
import { Op } from 'sequelize';

const SKILL_KEYWORDS = [
  'javascript','typescript','react','angular','vue','python','java','c#','sql','nosql',
  'mongodb','postgresql','mysql','aws','azure','gcp','docker','kubernetes','git','html',
  'css','machine learning','devops','agile','php','ruby','go','swift','kotlin','node',
  'nodejs','express','django','flask','spring','hibernate','redis','elasticsearch',
  'graphql','rest','api','tensorflow','pytorch','bigquery','tableau','power bi','excel',
  'figma','sketch','linux','bash','terraform','ansible','jenkins','sass','bootstrap',
  'tailwind','nextjs','gatsby','fastapi','pandas','numpy','sap','salesforce','pega',
  'data analysis','data analytics','deep learning','artificial intelligence'
];

function extractSkillsFromText(text) {
  if (!text) return [];
  const lower = text.toLowerCase();
  return SKILL_KEYWORDS.filter(skill => {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, 'i').test(lower);
  });
}

// Stream S3 object to buffer
async function s3ToBuffer(fileUrl) {
  const { stream } = await getResumeStreamFromS3(fileUrl);
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

async function run() {
  // Find candidates with resumeUrl but empty/null skills
  const candidates = await User.findAll({
    where: {
      role: 'candidate',
      isActive: true,
      resumeUrl: { [Op.ne]: null },
      [Op.or]: [
        { skills: null },
        { skills: { [Op.eq]: [] } }
      ]
    },
    attributes: ['id', 'email', 'resumeUrl', 'skills']
  });

  console.log(`Found ${candidates.length} candidates to backfill`);
  let updated = 0, failed = 0;

  for (const candidate of candidates) {
    try {
      const isS3 = candidate.resumeUrl.includes('amazonaws.com');
      let buffer;

      if (isS3) {
        buffer = await s3ToBuffer(candidate.resumeUrl);
      } else {
        // skip non-S3 URLs
        console.log(`  Skipping non-S3 URL for ${candidate.email}`);
        continue;
      }

      const text = await pdfTextExtractor.extractTextFromBuffer(buffer, 'resume.pdf');
      const skills = extractSkillsFromText(text);

      if (skills.length > 0) {
        await User.update({ skills }, { where: { id: candidate.id } });
        console.log(`  ✅ ${candidate.email}: ${skills.join(', ')}`);
        updated++;
      } else {
        console.log(`  ⚠️  ${candidate.email}: no skills found in resume`);
      }
    } catch (err) {
      console.error(`  ❌ ${candidate.email}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone. Updated: ${updated}, Failed: ${failed}, Skipped: ${candidates.length - updated - failed}`);
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
