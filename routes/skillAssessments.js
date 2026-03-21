import express from 'express';
import SkillAssessment from '../models/SkillAssessment.js';
import { authenticateToken } from '../middleware/auth.js';
const router = express.Router();

const FREE_MODELS = [
  'qwen/qwen3-4b:free',
  'meta-llama/llama-3.2-3b-instruct:free',
  'mistralai/mistral-small-3.1-24b-instruct:free',
  'google/gemma-3-27b-it:free',
  'meta-llama/llama-3.3-70b-instruct:free'
];

const callAI = async (prompt) => {
  for (const model of FREE_MODELS) {
    try {
      console.log(`🤖 Trying model: ${model}`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000); // 20s per model
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.FRONTEND_URL || 'http://localhost:5173',
          'X-Title': 'ZyncJobs'
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 3000,
          temperature: 0.7
        })
      });
      clearTimeout(timeout);
      if (!response.ok) {
        const err = await response.text();
        console.warn(`Model ${model} failed (${response.status}):`, err.substring(0, 100));
        continue;
      }
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      if (content) {
        console.log(`✅ Got response from ${model}`);
        return content;
      }
    } catch (e) {
      console.warn(`Model ${model} error:`, e.message);
    }
  }
  return null;
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

const generateAssessmentReview = async (skill, score, correctAnswers, totalQuestions) => {
  try {
    if (!process.env.OPENROUTER_API_KEY) return getDefaultReview(skill, score);

    const prompt = `Generate a professional assessment review for a candidate who scored ${score}% (${correctAnswers}/${totalQuestions} correct) on a ${skill} skill assessment.

Provide:
1. Performance Summary (1-2 sentences)
2. Strengths (2-3 bullet points)
3. Areas for Improvement (2-3 bullet points)
4. Recommendations (2-3 actionable steps)

Format as JSON:
{
  "summary": "...",
  "strengths": ["...", "..."],
  "improvements": ["...", "..."],
  "recommendations": ["...", "..."],
  "level": "Beginner|Intermediate|Advanced"
}`;

    const content = await callAI(prompt);
    if (!content) return getDefaultReview(skill, score);

    const jsonMatch = content.match(/\{[\s\S]*\}/m);
    if (!jsonMatch) return getDefaultReview(skill, score);

    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error('Review generation failed:', error.message);
    return getDefaultReview(skill, score);
  }
};

const getDefaultReview = (skill, score) => {
  let level = 'Beginner';
  let summary = '';
  
  if (score >= 80) {
    level = 'Advanced';
    summary = `Excellent performance! You demonstrated strong proficiency in ${skill}.`;
  } else if (score >= 60) {
    level = 'Intermediate';
    summary = `Good effort! You have solid understanding of ${skill} with room for improvement.`;
  } else {
    level = 'Beginner';
    summary = `You're starting your journey in ${skill}. Keep practicing to improve your skills.`;
  }

  return {
    summary,
    strengths: [
      'Completed the full assessment',
      'Demonstrated foundational knowledge',
      'Showed commitment to skill development'
    ],
    improvements: [
      `Deepen your understanding of ${skill} core concepts`,
      'Practice more hands-on projects',
      'Study advanced topics in this area'
    ],
    recommendations: [
      `Take online courses focused on ${skill}`,
      'Build real-world projects to apply knowledge',
      'Join communities and collaborate with others'
    ],
    level
  };
};

// Start assessment
router.post('/start', authenticateToken, async (req, res) => {
  try {
    const { skill } = req.body;
    
    if (!skill) {
      return res.status(400).json({ error: 'Skill is required' });
    }

    console.log(`🚀 Starting assessment for ${skill}...`);
    
    // Generate AI questions
    let questions = await generateAIQuestions(skill);
    
    // Retry once if AI generation fails
    if (!questions) {
      console.log('⚠️ First attempt failed, retrying AI generation...');
      questions = await generateAIQuestions(skill);
    }

    if (!questions) {
      console.log('⚠️ AI generation failed, using fallback questions');
      questions = getFallbackQuestions(skill);
    }
    
    const assessment = await SkillAssessment.create({
      userId: req.user.id,
      skill,
      questions: questions.map(q => ({ ...q, userAnswer: -1 })),
      score: 0,
      answers: {},
      status: 'in_progress'
    });
    
    res.json({
      assessmentId: assessment.id,
      skill,
      questions: questions.map(q => ({ question: q.question, options: q.options })),
      totalQuestions: questions.length,
      timeLimit: 30
    });
  } catch (error) {
    console.error('Start assessment error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Submit assessment
router.post('/submit/:id', authenticateToken, async (req, res) => {
  try {
    const { answers, timeSpent } = req.body;
    const assessment = await SkillAssessment.findByPk(req.params.id);
    
    if (!assessment || assessment.userId !== req.user.id) {
      return res.status(404).json({ error: 'Assessment not found' });
    }
    
    const questions = Array.isArray(assessment.questions) ? assessment.questions : [];
    let correctAnswers = 0;
    
    const updatedQuestions = questions.map((q, i) => {
      const userAnswer = Array.isArray(answers) ? answers[i] : -1;
      if (userAnswer === q.correctAnswer) correctAnswers++;
      return { ...q, userAnswer };
    });
    
    const score = questions.length > 0 ? Math.round((correctAnswers / questions.length) * 100) : 0;
    
    // Generate review
    const review = await generateAssessmentReview(
      assessment.skill,
      score,
      correctAnswers,
      questions.length
    );
    
    await SkillAssessment.update({
      questions: updatedQuestions,
      answers,
      score,
      completedAt: new Date(),
      status: 'completed',
      review
    }, { where: { id: req.params.id } });
    
    res.json({
      assessmentId: req.params.id,
      score,
      correctAnswers,
      totalQuestions: questions.length,
      timeSpent,
      status: 'completed',
      review
    });
  } catch (error) {
    console.error('Submit assessment error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get assessment review
router.get('/review/:id', authenticateToken, async (req, res) => {
  try {
    const assessment = await SkillAssessment.findByPk(req.params.id);
    
    if (!assessment || assessment.userId !== req.user.id) {
      return res.status(404).json({ error: 'Assessment not found' });
    }
    
    res.json({
      assessmentId: assessment.id,
      skill: assessment.skill,
      score: assessment.score,
      completedAt: assessment.completedAt,
      review: assessment.review || {},
      status: assessment.status,
      questions: assessment.questions || []
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user assessments
router.get('/my-assessments', authenticateToken, async (req, res) => {
  try {
    const { sequelize } = SkillAssessment;
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

export default router;
