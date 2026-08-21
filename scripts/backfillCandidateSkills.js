// Backfill: normalize skills into skills/candidate_skills tables and compute
// totalExperience for candidates that existed before the new schema.
// Run: node scripts/backfillCandidateSkills.js
import '../models/associations.js';
import TalentCandidate from '../models/TalentCandidate.js';
import Skill from '../models/Skill.js';
import CandidateSkill from '../models/CandidateSkill.js';
import { getNormalizedSkillNames } from '../services/skillNormalizer.js';
import { computeTotalExperience, extractExperienceYearsFromText } from '../services/experienceCalculator.js';

const BATCH = 500;

async function backfill() {
  const total = await TalentCandidate.count();
  console.log(`Backfilling ${total} candidates...`);
  let done = 0, skillsSaved = 0, expSaved = 0, errors = 0;

  for (let offset = 0; offset < total; offset += BATCH) {
    const candidates = await TalentCandidate.findAll({ order: [['id', 'ASC']], offset, limit: BATCH });
    for (const c of candidates) {
      try {
        const updates = {};
        // 1. Normalized skills
        const rawSkills = (c.skills || '').split(',').map(s => s.trim()).filter(Boolean);
        const normalized = getNormalizedSkillNames(rawSkills);
        await CandidateSkill.destroy({ where: { candidateId: c.id } });
        for (const name of normalized) {
          const [skill] = await Skill.findOrCreate({
            where: { name },
            defaults: { name, normalizedName: name.toLowerCase() }
          });
          await CandidateSkill.findOrCreate({
            where: { candidateId: c.id, skillId: skill.id },
            defaults: { candidateId: c.id, skillId: skill.id }
          });
          skillsSaved++;
        }
        // 2. Total experience from workExperiences JSON
        if (c.totalExperience === null || c.totalExperience === undefined) {
          let workExps = [];
          try { workExps = JSON.parse(c.workExperiences || '[]'); } catch { /* ignore */ }
          const te = computeTotalExperience(workExps) ?? extractExperienceYearsFromText(c.rawText || '');
          if (te !== null && te !== undefined) {
            updates.totalExperience = te;
            expSaved++;
          }
        }
        if (Object.keys(updates).length) await c.update(updates);
        done++;
      } catch (err) {
        errors++;
        console.error(`FAILED ${c.id}:`, err.message);
      }
    }
    console.log(`Progress: ${done}/${total}`);
  }

  console.log(`Done. Candidates: ${done}, skills rows: ${skillsSaved}, experience computed: ${expSaved}, errors: ${errors}`);
  process.exit(0);
}

backfill().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});