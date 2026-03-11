import express from 'express';
import SkillAssessment from '../models/SkillAssessment.js';
import { authenticateToken } from '../middleware/auth.js';
const router = express.Router();

// Generate exactly 10 AI questions for any skill using Mistral
const generateAIQuestions = async (skill) => {
  try {
    if (!process.env.OPENROUTER_API_KEY) {
      console.error('OPENROUTER_API_KEY not found');
      return null;
    }

    const prompt = `You are an expert technical assessment creator. Generate EXACTLY 10 multiple choice questions about ${skill}.

IMPORTANT: You MUST return EXACTLY 10 questions, no more, no less.

Return ONLY a valid JSON array. Do not include any text before or after the JSON.

Format:
[
  {"question": "Question 1?", "options": ["A", "B", "C", "D"], "correctAnswer": 0},
  {"question": "Question 2?", "options": ["A", "B", "C", "D"], "correctAnswer": 1},
  {"question": "Question 3?", "options": ["A", "B", "C", "D"], "correctAnswer": 2},
  {"question": "Question 4?", "options": ["A", "B", "C", "D"], "correctAnswer": 3},
  {"question": "Question 5?", "options": ["A", "B", "C", "D"], "correctAnswer": 0},
  {"question": "Question 6?", "options": ["A", "B", "C", "D"], "correctAnswer": 1},
  {"question": "Question 7?", "options": ["A", "B", "C", "D"], "correctAnswer": 2},
  {"question": "Question 8?", "options": ["A", "B", "C", "D"], "correctAnswer": 3},
  {"question": "Question 9?", "options": ["A", "B", "C", "D"], "correctAnswer": 0},
  {"question": "Question 10?", "options": ["A", "B", "C", "D"], "correctAnswer": 1}
]

Requirements:
- EXACTLY 10 questions
- Each question has exactly 4 options
- correctAnswer is 0, 1, 2, or 3
- Questions test practical knowledge
- Vary difficulty levels
- Return ONLY valid JSON`;

    console.log(`🚀 Generating 10 questions for ${skill}...`);

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.FRONTEND_URL || 'http://localhost:5173',
        'X-Title': 'ZyncJobs'
      },
      body: JSON.stringify({
        model: 'mistralai/mistral-7b-instruct:free',
        messages: [{
          role: 'user',
          content: prompt
        }],
        max_tokens: 3000,
        temperature: 0.7
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error('Mistral API error:', error);
      return null;
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content || '';
    
    console.log('📝 Raw response:', content.substring(0, 200));

    // Extract JSON from response - try multiple patterns
    let jsonMatch = content.match(/\[\s*\{[\s\S]*\}\s*\]/m);
    
    if (!jsonMatch) {
      console.error('No JSON array found in response');
      return null;
    }

    let questions = [];
    try {
      questions = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error('JSON parse error:', e.message);
      return null;
    }
    
    // Validate we have exactly 10 questions
    if (!Array.isArray(questions)) {
      console.error('Response is not an array');
      return null;
    }

    console.log(`📊 Received ${questions.length} questions`);

    if (questions.length !== 10) {
      console.error(`Expected 10 questions, got ${questions.length}`);
      return null;
    }

    // Validate each question
    const valid = questions.every((q, idx) => {
      const hasQuestion = q.question && typeof q.question === 'string';
      const hasOptions = Array.isArray(q.options) && q.options.length === 4;
      const hasCorrectAnswer = typeof q.correctAnswer === 'number' && q.correctAnswer >= 0 && q.correctAnswer <= 3;
      
      if (!hasQuestion || !hasOptions || !hasCorrectAnswer) {
        console.error(`Question ${idx + 1} invalid:`, { hasQuestion, hasOptions, hasCorrectAnswer });
        return false;
      }
      return true;
    });
    
    if (!valid) {
      console.error('Invalid question format');
      return null;
    }

    console.log(`✅ Successfully generated 10 valid questions for ${skill}`);
    return questions;
  } catch (error) {
    console.error('AI question generation failed:', error.message);
  }
  return null;
};

// Generate assessment review using Mistral
const generateAssessmentReview = async (skill, score, correctAnswers, totalQuestions) => {
  try {
    if (!process.env.OPENROUTER_API_KEY) {
      return getDefaultReview(skill, score);
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.FRONTEND_URL || 'http://localhost:5173',
        'X-Title': 'ZyncJobs'
      },
      body: JSON.stringify({
        model: 'mistralai/mistral-7b-instruct:free',
        messages: [{
          role: 'system',
          content: 'You are an expert career coach and technical assessor. Provide constructive, encouraging feedback on skill assessments.'
        }, {
          role: 'user',
          content: `Generate a professional assessment review for a candidate who scored ${score}% (${correctAnswers}/${totalQuestions} correct) on a ${skill} skill assessment.

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
}`
        }],
        max_tokens: 800,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      return getDefaultReview(skill, score);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content || '';
    
    const jsonMatch = content.match(/\{[\s\S]*\}/m);
    if (!jsonMatch) {
      return getDefaultReview(skill, score);
    }

    const review = JSON.parse(jsonMatch[0]);
    return review;
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
    
    // Fallback if AI generation fails - use 10 generic questions
    if (!questions) {
      console.log('⚠️ AI generation failed, using fallback questions');
      questions = [
        { question: `What is a fundamental concept in ${skill}?`, options: ['Concept A', 'Concept B', 'Concept C', 'Concept D'], correctAnswer: 0 },
        { question: `Which is commonly used with ${skill}?`, options: ['Tool A', 'Tool B', 'Tool C', 'Tool D'], correctAnswer: 1 },
        { question: `What is a best practice in ${skill}?`, options: ['Practice A', 'Practice B', 'Practice C', 'Practice D'], correctAnswer: 2 },
        { question: `How do you optimize ${skill} code?`, options: ['Method A', 'Method B', 'Method C', 'Method D'], correctAnswer: 3 },
        { question: `What is the purpose of ${skill}?`, options: ['Purpose A', 'Purpose B', 'Purpose C', 'Purpose D'], correctAnswer: 0 },
        { question: `Which pattern is used in ${skill}?`, options: ['Pattern A', 'Pattern B', 'Pattern C', 'Pattern D'], correctAnswer: 1 },
        { question: `How do you debug ${skill}?`, options: ['Debug A', 'Debug B', 'Debug C', 'Debug D'], correctAnswer: 2 },
        { question: `What is the latest trend in ${skill}?`, options: ['Trend A', 'Trend B', 'Trend C', 'Trend D'], correctAnswer: 3 },
        { question: `Which framework works with ${skill}?`, options: ['Framework A', 'Framework B', 'Framework C', 'Framework D'], correctAnswer: 0 },
        { question: `What is the future of ${skill}?`, options: ['Future A', 'Future B', 'Future C', 'Future D'], correctAnswer: 1 }
      ];
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
    
    let correctAnswers = 0;
    const questions = assessment.questions || [];
    
    questions.forEach((q, i) => {
      q.userAnswer = answers[i];
      if (answers[i] === q.correctAnswer) correctAnswers++;
    });
    
    const score = Math.round((correctAnswers / questions.length) * 100);
    
    // Generate review
    const review = await generateAssessmentReview(
      assessment.skill,
      score,
      correctAnswers,
      questions.length
    );
    
    await SkillAssessment.update({
      questions,
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
      status: assessment.status
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user assessments
router.get('/my-assessments', authenticateToken, async (req, res) => {
  try {
    const assessments = await SkillAssessment.findAll({ 
      where: { userId: req.user.id },
      attributes: ['id', 'skill', 'score', 'completedAt', 'status'],
      order: [['completedAt', 'DESC']]
    });
    
    res.json(assessments);
  } catch (error) {
    res.status(500).json({ error: error.message });
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
