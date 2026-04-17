import express from 'express';
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import { sequelize } from '../config/postgresql.js';
import { authenticateToken } from '../middleware/auth.js';
const router = express.Router();

import { callAI as callOpenRouter } from '../services/openRouterService.js';

const callAI = async (prompt) => {
  try {
    return await callOpenRouter({
      feature: 'skill-assessment',
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 3000,
      temperature: 0.7,
    });
  } catch { return null; }
};

const parseQuestions = (content) => {
  let jsonMatch = content.match(/\[\s*\{[\s\S]*?\}\s*\]/m) || content.match(/\[[\s\S]*\]/m);
  if (!jsonMatch) {
    const codeBlock = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlock) jsonMatch = [codeBlock[1].trim()];
    else return null;
  }
  try {
    const questions = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(questions)) return null;
    const placeholderPattern = /^(option|concept|tool|practice|method|pattern|debug|trend|framework|future|purpose|feature|topic|mistake|answer)\s*[a-d0-9]$/i;
    const valid = questions.filter(q =>
      q.question?.length > 10 &&
      Array.isArray(q.options) && q.options.length === 4 &&
      typeof q.correctAnswer === 'number' && q.correctAnswer >= 0 && q.correctAnswer <= 3 &&
      !q.options.some(o => placeholderPattern.test(o.trim()))
    );
    return valid.length >= 5 ? valid.slice(0, 10) : null;
  } catch {
    try {
      const fixed = jsonMatch[0].replace(/,\s*]/g, ']').replace(/,\s*}/g, '}');
      const questions = JSON.parse(fixed);
      return Array.isArray(questions) && questions.length >= 5 ? questions.slice(0, 10) : null;
    } catch { return null; }
  }
};

// Fallback question bank for common skills
const FALLBACK_QUESTIONS = {
  default: (skill) => [
    { question: `Which of the following best describes ${skill}?`, options: [`A programming paradigm`, `A software tool or technology`, `A database system`, `A networking protocol`], correctAnswer: 1 },
    { question: `What is a primary use case for ${skill}?`, options: [`Data storage`, `Building applications or solving technical problems`, `Network routing`, `Hardware management`], correctAnswer: 1 },
    { question: `Which concept is most closely associated with ${skill}?`, options: [`Abstraction`, `Encapsulation`, `Modularity`, `All of the above`], correctAnswer: 3 },
    { question: `What is a best practice when working with ${skill}?`, options: [`Ignoring documentation`, `Writing clean, readable code`, `Avoiding version control`, `Skipping testing`], correctAnswer: 1 },
    { question: `How does ${skill} handle errors?`, options: [`It ignores them`, `Through error handling mechanisms`, `By crashing the program`, `Errors are not possible`], correctAnswer: 1 },
    { question: `What tool is commonly used alongside ${skill}?`, options: [`A text editor or IDE`, `A physical calculator`, `A fax machine`, `A typewriter`], correctAnswer: 0 },
    { question: `Which of the following is a key benefit of ${skill}?`, options: [`Increased complexity`, `Improved productivity and efficiency`, `Slower performance`, `Higher hardware costs`], correctAnswer: 1 },
    { question: `What does debugging mean in the context of ${skill}?`, options: [`Adding new features`, `Finding and fixing errors in code`, `Deploying to production`, `Writing documentation`], correctAnswer: 1 },
    { question: `What is version control used for in ${skill} projects?`, options: [`Tracking changes and collaborating`, `Speeding up execution`, `Reducing file size`, `Encrypting data`], correctAnswer: 0 },
    { question: `Which approach improves code quality in ${skill}?`, options: [`Writing everything in one file`, `Code reviews and testing`, `Avoiding comments`, `Using global variables everywhere`], correctAnswer: 1 }
  ]
};

const getFallbackQuestions = (skill) => {
  const generator = FALLBACK_QUESTIONS[skill.toLowerCase()] || FALLBACK_QUESTIONS.default;
  return generator(skill);
};

// Generate exactly 10 AI questions for any skill
const generateAIQuestions = async (skill) => {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error('OPENROUTER_API_KEY not found');
    return null;
  }

  const prompt = `Generate EXACTLY 10 multiple choice questions about ${skill} for a technical skill assessment.

Return ONLY a valid JSON array with no extra text.

Example format:
[
  {"question": "What does the 'let' keyword do in JavaScript?", "options": ["Declares a block-scoped variable", "Declares a function", "Imports a module", "Creates a class"], "correctAnswer": 0},
  {"question": "Which method removes the last element from an array?", "options": ["shift()", "unshift()", "pop()", "push()"], "correctAnswer": 2}
]

Rules:
- EXACTLY 10 real questions about ${skill}
- Each question must have exactly 4 meaningful, distinct options (NOT placeholders like 'Option A')
- correctAnswer is the index (0-3) of the correct option
- Questions must test real practical knowledge of ${skill}
- Return ONLY the JSON array`;

  const content = await callAI(prompt);
  if (!content) return null;
  console.log('📝 Raw response:', content.substring(0, 200));
  return parseQuestions(content);
};

const generateAssessmentReview = async (skill, score, correctAnswers, totalQuestions, questions = [], answers = []) => {
  try {
    if (!process.env.OPENROUTER_API_KEY) return getDefaultReview(skill, score, questions, answers);

    // Build wrong question topics for context
    const wrongTopics = questions
      .map((q, i) => answers[i] !== q.correctAnswer ? q.question : null)
      .filter(Boolean)
      .slice(0, 5);

    const correctTopics = questions
      .map((q, i) => answers[i] === q.correctAnswer ? q.question : null)
      .filter(Boolean)
      .slice(0, 3);

    const prompt = `Generate a professional skill assessment review for:
- Skill: ${skill}
- Score: ${score}% (${correctAnswers}/${totalQuestions} correct)
- Questions answered correctly: ${correctTopics.join(' | ') || 'none'}
- Questions answered incorrectly: ${wrongTopics.join(' | ') || 'none'}

Based on the ACTUAL questions above, generate a personalized review.

Return ONLY valid JSON (no markdown, no extra text):
{
  "summary": "2 sentences specific to their ${skill} performance and score",
  "strengths": ["specific strength based on correct answers", "another specific strength"],
  "improvements": ["specific area from wrong answers", "another specific improvement area"],
  "recommendations": ["specific actionable step for ${skill}", "another specific step", "third step"],
  "level": "${score >= 80 ? 'Advanced' : score >= 60 ? 'Intermediate' : 'Beginner'}"
}`;

    const content = await callAI(prompt);
    if (!content) return getDefaultReview(skill, score, questions, answers);

    const jsonMatch = content.match(/\{[\s\S]*\}/m);
    if (!jsonMatch) return getDefaultReview(skill, score, questions, answers);

    const parsed = JSON.parse(jsonMatch[0]);
    // Validate all required fields exist
    if (!parsed.summary || !parsed.strengths || !parsed.improvements || !parsed.recommendations) {
      return getDefaultReview(skill, score, questions, answers);
    }
    return parsed;
  } catch (error) {
    console.error('Review generation failed:', error.message);
    return getDefaultReview(skill, score, questions, answers);
  }
};

const getDefaultReview = (skill, score, questions = [], answers = []) => {
  const level = score >= 80 ? 'Advanced' : score >= 60 ? 'Intermediate' : 'Beginner';
  const correct = questions.filter((q, i) => answers[i] === q.correctAnswer);
  const wrong = questions.filter((q, i) => answers[i] !== q.correctAnswer);

  // Dynamic summary based on score
  let summary;
  if (score >= 80) {
    summary = `Outstanding! You scored ${score}% on the ${skill} assessment, demonstrating advanced proficiency. You answered ${correct.length} out of ${questions.length || 10} questions correctly.`;
  } else if (score >= 60) {
    summary = `Good effort! You scored ${score}% on the ${skill} assessment, showing intermediate understanding. You got ${correct.length} out of ${questions.length || 10} correct — a solid foundation to build on.`;
  } else {
    summary = `You scored ${score}% on the ${skill} assessment. You answered ${correct.length} out of ${questions.length || 10} correctly. This is a great starting point to identify gaps and improve.`;
  }

  // Dynamic strengths from correct questions
  const strengths = correct.length > 0
    ? [
        `Correctly answered ${correct.length} question${correct.length > 1 ? 's' : ''} — showing real ${skill} knowledge`,
        correct.length >= 2 ? `Strong grasp of: "${correct[0].question.substring(0, 60)}..."` : `Demonstrated understanding of core ${skill} concepts`,
        score >= 60 ? `Above-average performance compared to typical ${skill} beginners` : `Completed the full assessment — showing commitment to learning`
      ]
    : [
        `Completed the full ${skill} assessment`,
        `Identified key areas that need focused study`,
        `Took the first step toward ${skill} proficiency`
      ];

  // Dynamic improvements from wrong questions
  const improvements = wrong.length > 0
    ? [
        `Review the concept behind: "${wrong[0].question.substring(0, 70)}..."`,
        wrong.length >= 2 ? `Strengthen understanding of: "${wrong[1].question.substring(0, 70)}..."` : `Practice more ${skill} hands-on exercises`,
        `Focus on the ${wrong.length} topic${wrong.length > 1 ? 's' : ''} you missed to close knowledge gaps`
      ]
    : [
        `Explore advanced ${skill} patterns and edge cases`,
        `Challenge yourself with real-world ${skill} projects`,
        `Mentor others to solidify your ${skill} expertise`
      ];

  // Dynamic recommendations based on level
  const recommendations = level === 'Advanced'
    ? [
        `Contribute to open-source ${skill} projects to showcase expertise`,
        `Explore advanced ${skill} design patterns and architecture`,
        `Consider getting a ${skill} certification to validate your skills`
      ]
    : level === 'Intermediate'
    ? [
        `Build 2-3 real projects using ${skill} to reinforce your knowledge`,
        `Take a focused course on the ${skill} topics you missed`,
        `Practice daily ${skill} coding challenges on platforms like LeetCode or HackerRank`
      ]
    : [
        `Start with the official ${skill} documentation and beginner tutorials`,
        `Complete a structured ${skill} course on freeCodeCamp, Coursera, or Udemy`,
        `Build a small project using ${skill} to apply what you learn`
      ];

  return { summary, strengths, improvements, recommendations, level };
};

// Optional auth middleware - allows both authenticated and guest users
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    // No token - create guest user
    req.user = { id: 'guest-' + Date.now(), isGuest: true };
    return next();
  }
  
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    // Invalid token - treat as guest
    req.user = { id: 'guest-' + Date.now(), isGuest: true };
    next();
  }
};

// Start assessment
router.post('/start', optionalAuth, async (req, res) => {
  try {
    const { skill } = req.body;
    if (!skill) return res.status(400).json({ error: 'Skill is required' });

    console.log(`🚀 Starting assessment for ${skill}...`);
    
    // Try AI generation with single attempt and 10s timeout
    let questions = null;
    try {
      const aiPromise = generateAIQuestions(skill);
      const timeoutPromise = new Promise((resolve, reject) => {
        setTimeout(() => reject(new Error('AI timeout')), 10000);
      });
      questions = await Promise.race([aiPromise, timeoutPromise]);
      console.log('✅ AI questions generated');
    } catch (err) {
      console.log('⚠️ AI generation failed/timeout:', err.message);
    }
    
    // Fallback to local questions if AI fails
    if (!questions || !Array.isArray(questions) || questions.length === 0) { 
      console.log('📝 Using fallback questions'); 
      questions = getFallbackQuestions(skill); 
    }

    // Use raw INSERT to avoid missing column errors on QA DB
    const id = randomUUID();
    const questionsWithAnswer = questions.map(q => ({ ...q, userAnswer: -1 }));

    // Try to insert into database, but don't fail if DB is down
    try {
      await sequelize.query(
        `INSERT INTO skill_assessments (id, "userId", skill, questions, score, answers, "createdAt", "updatedAt") VALUES (:id, :userId, :skill, :questions, 0, '{}', NOW(), NOW())`,
        { replacements: { id, userId: req.user.id, skill, questions: JSON.stringify(questionsWithAnswer) } }
      );
      console.log('✅ Saved to database');
    } catch (dbErr) {
      console.warn('⚠️ DB insert failed, trying with status column:', dbErr.message);
      try {
        await sequelize.query(
          `INSERT INTO skill_assessments (id, "userId", skill, questions, score, answers, status, "createdAt", "updatedAt") VALUES (:id, :userId, :skill, :questions, 0, '{}', 'in_progress', NOW(), NOW())`,
          { replacements: { id, userId: req.user.id, skill, questions: JSON.stringify(questionsWithAnswer) } }
        );
        console.log('✅ Saved to database (with status)');
      } catch (dbErr2) {
        console.error('❌ DB insert failed completely:', dbErr2.message);
        // Continue anyway - assessment can work without DB storage
      }
    }

    console.log(`✅ Assessment created with ${questions.length} questions`);
    res.json({
      assessmentId: id,
      skill,
      questions: questions.map(q => ({ question: q.question, options: q.options })),
      totalQuestions: questions.length,
      timeLimit: 30
    });
  } catch (error) {
    console.error('❌ Start assessment error:', error.message);
    console.error('Stack:', error.stack);
    res.status(500).json({ error: error.message || 'Failed to start assessment' });
  }
});

// Submit assessment
router.post('/submit/:id', optionalAuth, async (req, res) => {
  try {
    const { answers, timeSpent } = req.body;

    // Step 1: fetch existing columns to know what QA DB actually has
    let existingCols = [];
    try {
      const colRows = await sequelize.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'skill_assessments'`,
        { type: sequelize.QueryTypes.SELECT }
      );
      existingCols = colRows.map(r => r.column_name);
      console.log('📋 skill_assessments columns:', existingCols);
    } catch (e) {
      console.warn('Could not fetch columns:', e.message);
    }

    // Step 2: fetch the assessment row
    let rows;
    try {
      rows = await sequelize.query(
        `SELECT id, "userId", skill, questions, score FROM skill_assessments WHERE id = :id`,
        { replacements: { id: req.params.id }, type: sequelize.QueryTypes.SELECT }
      );
    } catch (e) {
      console.error('Fetch assessment error:', e.message);
      return res.status(500).json({ error: 'Failed to fetch assessment: ' + e.message });
    }

    if (!rows || rows.length === 0) {
      console.warn('⚠️ Assessment not found in DB, treating as local assessment');
      return res.status(404).json({ 
        error: 'Assessment not found',
        isLocal: true,
        message: 'This assessment was not saved to the database. Please use local scoring.'
      });
    }

    const assessment = rows[0];
    // userId column may come back as userId or userId depending on pg driver
    const rowUserId = assessment.userId || assessment['userId'];
    if (String(rowUserId) !== String(req.user.id)) {
      return res.status(404).json({ error: 'Assessment not found' });
    }

    const questions = typeof assessment.questions === 'string'
      ? JSON.parse(assessment.questions)
      : (Array.isArray(assessment.questions) ? assessment.questions : []);

    let correctAnswers = 0;
    const updatedQuestions = questions.map((q, i) => {
      const userAnswer = Array.isArray(answers) ? answers[i] : -1;
      if (userAnswer === q.correctAnswer) correctAnswers++;
      return { ...q, userAnswer };
    });

    const score = questions.length > 0 ? Math.round((correctAnswers / questions.length) * 100) : 0;
    const review = await generateAssessmentReview(assessment.skill, score, correctAnswers, questions.length, questions, answers);

    // Step 3: build UPDATE only with columns that exist
    // Auto-add missing columns on QA/prod if they don't exist
    if (!existingCols.includes('review')) {
      try { await sequelize.query(`ALTER TABLE skill_assessments ADD COLUMN IF NOT EXISTS review JSONB`); existingCols.push('review'); } catch (e) { console.warn('Could not add review column:', e.message); }
    }
    if (!existingCols.includes('completedAt')) {
      try { await sequelize.query(`ALTER TABLE skill_assessments ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP`); existingCols.push('completedAt'); } catch (e) { console.warn('Could not add completedAt column:', e.message); }
    }

    const hasCompletedAt = existingCols.includes('completedAt');
    const hasStatus = existingCols.includes('status');
    const hasReview = existingCols.includes('review');
    const hasAnswers = existingCols.includes('answers');

    let setClauses = [`questions=:questions`, `score=:score`, `"updatedAt"=NOW()`];
    if (hasAnswers) setClauses.push(`answers=:answers`);
    if (hasCompletedAt) setClauses.push(`"completedAt"=NOW()`);
    if (hasStatus) setClauses.push(`status='completed'`);
    if (hasReview) setClauses.push(`review=:review`);

    const updateSQL = `UPDATE skill_assessments SET ${setClauses.join(', ')} WHERE id=:id`;
    console.log('📝 UPDATE SQL:', updateSQL);

    await sequelize.query(updateSQL, {
      replacements: {
        questions: JSON.stringify(updatedQuestions),
        answers: JSON.stringify(answers),
        score,
        review: JSON.stringify(review),
        id: req.params.id
      }
    });

    res.json({ assessmentId: req.params.id, score, correctAnswers, totalQuestions: questions.length, timeSpent, status: 'completed', review });
  } catch (error) {
    console.error('Submit assessment error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get assessment review
router.get('/review/:id', authenticateToken, async (req, res) => {
  try {
    // Detect available columns to handle QA DB schema differences
    let existingCols = [];
    try {
      const colRows = await sequelize.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'skill_assessments'`,
        { type: sequelize.QueryTypes.SELECT }
      );
      existingCols = colRows.map(r => r.column_name);
    } catch (e) {
      console.warn('Could not fetch columns:', e.message);
    }

    const selectCols = ['id', '"userId"', 'skill', 'score', 'questions'];
    if (existingCols.includes('review')) selectCols.push('review');
    if (existingCols.includes('completedAt')) selectCols.push('"completedAt"');
    if (existingCols.includes('status')) selectCols.push('status');

    const rows = await sequelize.query(
      `SELECT ${selectCols.join(', ')} FROM skill_assessments WHERE id = :id`,
      { replacements: { id: req.params.id }, type: sequelize.QueryTypes.SELECT }
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Assessment not found' });
    }

    const assessment = rows[0];
    const rowUserId = assessment.userId || assessment['userId'];
    if (String(rowUserId) !== String(req.user.id)) {
      return res.status(404).json({ error: 'Assessment not found' });
    }

    const questions = typeof assessment.questions === 'string'
      ? JSON.parse(assessment.questions)
      : (Array.isArray(assessment.questions) ? assessment.questions : []);

    const review = assessment.review
      ? (typeof assessment.review === 'string' ? JSON.parse(assessment.review) : assessment.review)
      : {};

    res.json({
      assessmentId: assessment.id,
      skill: assessment.skill,
      score: assessment.score,
      completedAt: assessment.completedAt || assessment.createdAt || null,
      review,
      status: assessment.status || 'completed',
      questions
    });
  } catch (error) {
    console.error('Review fetch error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get user assessments
router.get('/my-assessments', authenticateToken, async (req, res) => {
  try {
    let rows;
    try {
      rows = await sequelize.query(
        `SELECT id, skill, score, "completedAt", "createdAt" FROM skill_assessments WHERE "userId" = :userId ORDER BY "createdAt" DESC`,
        { replacements: { userId: req.user.id }, type: sequelize.QueryTypes.SELECT }
      );
    } catch {
      rows = await sequelize.query(
        `SELECT id, skill, score, "createdAt" FROM skill_assessments WHERE "userId" = :userId ORDER BY "createdAt" DESC`,
        { replacements: { userId: req.user.id }, type: sequelize.QueryTypes.SELECT }
      );
    }

    const data = Array.isArray(rows) ? rows : [];
    const completed = data.filter(a => a.completedAt != null || a.score > 0);

    res.json(completed.map(a => ({
      assessmentId: a.id,
      skill: a.skill,
      score: a.score,
      completedAt: a.completedAt || a.createdAt
    })));
  } catch (error) {
    console.error('my-assessments error:', error.message);
    res.json([]);
  }
});

// GET /api/skill-assessments/learning-resources?skill=React
router.get('/learning-resources', async (req, res) => {
  const { skill } = req.query;
  if (!skill) return res.status(400).json({ error: 'skill is required' });

  try {
    const prompt = `For the skill "${skill}", return a JSON object with exactly 3 free learning resources.
Return ONLY valid JSON, no markdown.
{
  "resources": [
    { "title": "resource name", "url": "https://...", "type": "Documentation|Course|Tutorial|Video" },
    { "title": "resource name", "url": "https://...", "type": "Documentation|Course|Tutorial|Video" },
    { "title": "resource name", "url": "https://...", "type": "Documentation|Course|Tutorial|Video" }
  ]
}
Rules:
- Only real, working URLs (official docs, freeCodeCamp, MDN, YouTube, Coursera free tier, etc.)
- No paid courses
- Specific to "${skill}"`;

    const content = await callAI(prompt);
    if (!content) return res.json({ resources: [] });

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.json({ resources: [] });

    const parsed = JSON.parse(jsonMatch[0]);
    res.json({ skill, resources: parsed.resources || [] });
  } catch (e) {
    console.error('learning-resources error:', e.message);
    res.json({ resources: [] });
  }
});

// GET /api/skill-assessments/career-path?jobTitle=React Developer&skills=React,JavaScript
router.get('/career-path', async (req, res) => {
  const { jobTitle, skills } = req.query;
  if (!jobTitle) return res.status(400).json({ error: 'jobTitle is required' });

  try {
    const prompt = `Given a job role "${jobTitle}" with current skills: ${skills || 'not specified'}.
Return a JSON career path suggestion.
Return ONLY valid JSON, no markdown.
{
  "currentLevel": "Junior|Mid|Senior",
  "nextRole": "next logical job title",
  "timeframe": "e.g. 1-2 years",
  "skillsToLearn": ["skill1", "skill2", "skill3", "skill4"],
  "tip": "one actionable career advice sentence"
}`;

    const content = await callAI(prompt);
    if (!content) return res.json(null);

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.json(null);

    res.json(JSON.parse(jsonMatch[0]));
  } catch (e) {
    console.error('career-path error:', e.message);
    res.json(null);
  }
});

// Get available skills
router.get('/skills', async (req, res) => {
  try {
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const skillsPath = path.join(__dirname, '../data/skills.json');
    
    const skillsData = JSON.parse(fs.readFileSync(skillsPath, 'utf8'));
    res.json(skillsData.skills);
  } catch (error) {
    console.error('Error loading skills:', error);
    res.json(['JavaScript', 'Python', 'React', 'Node.js', 'Java', 'SQL', 'TypeScript', 'AWS']);
  }
});

// Test database connection
router.get('/test-db', async (req, res) => {
  try {
    // Test if table exists
    const result = await sequelize.query(
      `SELECT table_name FROM information_schema.tables WHERE table_name = 'skill_assessments'`,
      { type: sequelize.QueryTypes.SELECT }
    );
    
    if (result.length === 0) {
      return res.json({ 
        status: 'error', 
        message: 'skill_assessments table does not exist',
        suggestion: 'Run: npm run sync-models or create the table manually'
      });
    }
    
    // Test if we can query the table
    const count = await sequelize.query(
      `SELECT COUNT(*) as count FROM skill_assessments`,
      { type: sequelize.QueryTypes.SELECT }
    );
    
    res.json({ 
      status: 'ok', 
      message: 'Database connected and table exists',
      assessmentCount: count[0].count
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      message: error.message,
      hint: 'Check if PostgreSQL is running and database exists'
    });
  }
});

export default router;
