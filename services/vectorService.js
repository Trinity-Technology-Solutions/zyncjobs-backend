/**
 * Vector Service — In-database semantic matching using TF-IDF + cosine similarity
 * No external vector DB needed. Works entirely with PostgreSQL JSONB.
 *
 * How it works:
 *  1. Text → tokenize → term frequency map (sparse vector)
 *  2. Vectors stored as JSONB in job_embeddings / resume_embeddings tables
 *  3. Cosine similarity computed in JS across stored vectors
 *  4. Returns ranked results with match scores
 */

import { sequelize } from '../config/postgresql.js';
import Job from '../models/Job.js';

// ─── TABLE BOOTSTRAP ─────────────────────────────────────────────────────────

const bootstrap = async () => {
  try {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS job_embeddings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "jobId" UUID NOT NULL UNIQUE,
        vector JSONB NOT NULL,
        text TEXT NOT NULL,
        "updatedAt" TIMESTAMP DEFAULT NOW()
      )
    `);
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS resume_embeddings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" TEXT NOT NULL UNIQUE,
        vector JSONB NOT NULL,
        text TEXT NOT NULL,
        "updatedAt" TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Embedding tables ready');
  } catch (e) {
    console.warn('⚠️  Embedding table bootstrap warning:', e.message);
  }
};

bootstrap();

// ─── TEXT → VECTOR ───────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with',
  'by','from','is','are','was','were','be','been','being','have','has',
  'had','do','does','did','will','would','could','should','may','might',
  'this','that','these','those','it','its','we','our','you','your','they',
  'their','he','she','his','her','as','if','then','than','so','up','out',
  'about','into','through','during','before','after','above','below',
  'between','each','more','most','other','some','such','no','not','only',
  'same','also','just','because','while','although','however','therefore'
]);

const tokenize = (text) => {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s+#]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t));
};

// Build TF vector (term frequency map)
const buildVector = (text) => {
  const tokens = tokenize(text);
  if (!tokens.length) return {};
  const tf = {};
  for (const t of tokens) tf[t] = (tf[t] || 0) + 1;
  // Normalize by doc length
  const len = tokens.length;
  for (const t in tf) tf[t] = tf[t] / len;
  return tf;
};

// Cosine similarity between two TF vectors
const cosineSimilarity = (vecA, vecB) => {
  const keysA = Object.keys(vecA);
  if (!keysA.length) return 0;

  let dot = 0, magA = 0, magB = 0;
  for (const k of keysA) {
    const a = vecA[k] || 0;
    const b = vecB[k] || 0;
    dot += a * b;
    magA += a * a;
  }
  for (const k of Object.keys(vecB)) magB += vecB[k] * vecB[k];

  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
};

// Build searchable text from a job record
const jobToText = (job) => [
  job.jobTitle || '',
  job.title || '',
  job.company || '',
  job.description || '',
  job.requirements || '',
  job.responsibilities || '',
  job.location || '',
  job.experienceLevel || '',
  job.jobCategory || '',
  ...(Array.isArray(job.skills) ? job.skills : [])
].join(' ');

// Build searchable text from a resume/profile record
const profileToText = (profile) => [
  profile.title || '',
  profile.name || '',
  profile.location || '',
  profile.profileSummary || '',
  profile.experience || '',
  profile.education || '',
  profile.certifications || '',
  ...(Array.isArray(profile.skills) ? profile.skills : [])
].join(' ');

// ─── UPSERT ──────────────────────────────────────────────────────────────────

const upsertJobEmbedding = async (jobId, jobData) => {
  try {
    const text = jobToText(jobData);
    const vector = buildVector(text);
    await sequelize.query(
      `INSERT INTO job_embeddings ("jobId", vector, text, "updatedAt")
       VALUES (:jobId, :vector, :text, NOW())
       ON CONFLICT ("jobId") DO UPDATE
       SET vector = :vector, text = :text, "updatedAt" = NOW()`,
      { replacements: { jobId, vector: JSON.stringify(vector), text: text.substring(0, 2000) } }
    );
  } catch (e) {
    console.warn('upsertJobEmbedding error:', e.message);
  }
};

const upsertResumeEmbedding = async (userId, resumeData) => {
  try {
    const text = profileToText(resumeData);
    const vector = buildVector(text);
    await sequelize.query(
      `INSERT INTO resume_embeddings ("userId", vector, text, "updatedAt")
       VALUES (:userId, :vector, :text, NOW())
       ON CONFLICT ("userId") DO UPDATE
       SET vector = :vector, text = :text, "updatedAt" = NOW()`,
      { replacements: { userId: String(userId), vector: JSON.stringify(vector), text: text.substring(0, 2000) } }
    );
  } catch (e) {
    console.warn('upsertResumeEmbedding error:', e.message);
  }
};

// ─── FIND SIMILAR JOBS ───────────────────────────────────────────────────────

const findSimilarJobs = async (queryText, limit = 10) => {
  try {
    const queryVec = buildVector(queryText);
    if (!Object.keys(queryVec).length) return [];

    // Pull all job embeddings
    const rows = await sequelize.query(
      `SELECT je."jobId", je.vector FROM job_embeddings je LIMIT 2000`,
      { type: sequelize.QueryTypes.SELECT }
    );

    if (!rows.length) {
      // Fallback: index all active jobs on-the-fly then retry
      await indexAllJobs();
      return findSimilarJobs(queryText, limit);
    }

    // Score each job
    const scored = rows.map(row => {
      const vec = typeof row.vector === 'string' ? JSON.parse(row.vector) : row.vector;
      return { jobId: row.jobId, score: cosineSimilarity(queryVec, vec) };
    });

    // Sort by score descending, take top N
    const topIds = scored
      .filter(s => s.score > 0.05)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => ({ jobId: s.jobId, score: s.score }));

    if (!topIds.length) return [];

    // Fetch full job records
    const jobs = await Job.findAll({
      where: { id: topIds.map(t => t.jobId), isActive: true, status: 'approved' }
    });

    // Attach scores and sort
    const jobMap = {};
    for (const j of jobs) jobMap[j.id] = j.toJSON();

    return topIds
      .filter(t => jobMap[t.jobId])
      .map(t => ({ ...jobMap[t.jobId], matchScore: Math.round(t.score * 100) }));

  } catch (e) {
    console.error('findSimilarJobs error:', e.message);
    return [];
  }
};

// ─── FIND SIMILAR CANDIDATES ─────────────────────────────────────────────────

const findSimilarCandidates = async (queryText, limit = 10) => {
  try {
    const queryVec = buildVector(queryText);
    if (!Object.keys(queryVec).length) return [];

    const rows = await sequelize.query(
      `SELECT "userId", vector, text FROM resume_embeddings LIMIT 2000`,
      { type: sequelize.QueryTypes.SELECT }
    );

    if (!rows.length) return [];

    const scored = rows.map(row => {
      const vec = typeof row.vector === 'string' ? JSON.parse(row.vector) : row.vector;
      return { userId: row.userId, score: cosineSimilarity(queryVec, vec), text: row.text };
    });

    return scored
      .filter(s => s.score > 0.05)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => ({ userId: s.userId, matchScore: Math.round(s.score * 100), preview: s.text.substring(0, 200) }));

  } catch (e) {
    console.error('findSimilarCandidates error:', e.message);
    return [];
  }
};

// ─── BULK INDEX ALL JOBS (run once on startup) ───────────────────────────────

const indexAllJobs = async () => {
  try {
    const jobs = await Job.findAll({ where: { isActive: true, status: 'approved' } });
    if (!jobs.length) return;

    // Check how many are already indexed
    const [{ count }] = await sequelize.query(
      `SELECT COUNT(*) as count FROM job_embeddings`,
      { type: sequelize.QueryTypes.SELECT }
    );

    if (parseInt(count) >= jobs.length) return; // already indexed

    console.log(`🔍 Indexing ${jobs.length} jobs for semantic search...`);
    for (const job of jobs) {
      await upsertJobEmbedding(job.id, job.toJSON());
    }
    console.log(`✅ Indexed ${jobs.length} jobs`);
  } catch (e) {
    console.warn('indexAllJobs warning:', e.message);
  }
};

// ─── MATCH SCORE BETWEEN ONE JOB AND ONE PROFILE ────────────────────────────

const getMatchScore = (jobData, profileData) => {
  const jobVec = buildVector(jobToText(jobData));
  const profileVec = buildVector(profileToText(profileData));
  const score = cosineSimilarity(jobVec, profileVec);

  // Skill overlap bonus
  const jobSkills = (jobData.skills || []).map(s => s.toLowerCase());
  const profileSkills = (profileData.skills || []).map(s => s.toLowerCase());
  const overlap = jobSkills.filter(s => profileSkills.includes(s)).length;
  const skillBonus = jobSkills.length > 0 ? (overlap / jobSkills.length) * 0.3 : 0;

  return Math.min(100, Math.round((score + skillBonus) * 100));
};

// ─── EXPLAIN MATCH ───────────────────────────────────────────────────────────

const explainMatch = (jobData, profileData) => {
  const jobSkills = (jobData.skills || []).map(s => s.toLowerCase());
  const profileSkills = (profileData.skills || []).map(s => s.toLowerCase());
  const matched = jobSkills.filter(s => profileSkills.includes(s));
  const missing = jobSkills.filter(s => !profileSkills.includes(s));

  const score = getMatchScore(jobData, profileData);

  return {
    score,
    matchedSkills: matched,
    missingSkills: missing.slice(0, 5),
    locationMatch: jobData.location && profileData.location
      ? jobData.location.toLowerCase().includes(profileData.location.toLowerCase()) ||
        profileData.location.toLowerCase().includes(jobData.location.toLowerCase())
      : null,
    experienceMatch: jobData.experienceLevel && profileData.yearsExperience
      ? (() => {
          const years = parseInt(profileData.yearsExperience) || 0;
          const level = jobData.experienceLevel;
          if (level === 'Entry' && years <= 2) return true;
          if (level === 'Mid' && years >= 2 && years <= 5) return true;
          if (level === 'Senior' && years >= 5) return true;
          if (level === 'Lead' && years >= 7) return true;
          return false;
        })()
      : null,
    verdict: score >= 70 ? 'Strong Match' : score >= 45 ? 'Good Match' : score >= 25 ? 'Partial Match' : 'Low Match'
  };
};

// Schedule background indexing after server starts
setTimeout(indexAllJobs, 5000);

const vectorService = {
  findSimilarJobs,
  findSimilarCandidates,
  upsertJobEmbedding,
  upsertResumeEmbedding,
  getMatchScore,
  explainMatch,
  indexAllJobs,
  buildVector,
  jobToText,
  profileToText
};

export default vectorService;
