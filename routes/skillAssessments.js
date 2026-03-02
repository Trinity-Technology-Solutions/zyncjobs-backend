import express from 'express';
import SkillAssessment from '../models/SkillAssessment.js';
import { authenticateToken } from '../middleware/auth.js';
const router = express.Router();

const assessmentQuestions = {
  'JavaScript': [
    { question: 'What is closure in JavaScript?', options: ['Function scope', 'Variable hoisting', 'Inner function accessing outer variables', 'Event handling'], correctAnswer: 2 },
    { question: 'Which method adds elements to array end?', options: ['push()', 'pop()', 'shift()', 'unshift()'], correctAnswer: 0 },
    { question: 'What does "this" refer to?', options: ['Global object', 'Current object', 'Parent object', 'Depends on context'], correctAnswer: 3 }
  ],
  'Python': [
    { question: 'Which is mutable in Python?', options: ['tuple', 'string', 'list', 'int'], correctAnswer: 2 },
    { question: 'What is list comprehension?', options: ['Loop syntax', 'Concise way to create lists', 'Function definition', 'Class method'], correctAnswer: 1 },
    { question: 'What is __init__?', options: ['Constructor', 'Destructor', 'Class variable', 'Static method'], correctAnswer: 0 }
  ],
  'React': [
    { question: 'What is JSX?', options: ['JavaScript XML', 'Java Syntax Extension', 'JSON XML', 'JavaScript Extension'], correctAnswer: 0 },
    { question: 'Which hook manages state?', options: ['useEffect', 'useState', 'useContext', 'useReducer'], correctAnswer: 1 },
    { question: 'What is virtual DOM?', options: ['Real DOM copy', 'JavaScript representation of DOM', 'HTML template', 'CSS framework'], correctAnswer: 1 }
  ]
};

// Generate AI questions for any skill
const generateAIQuestions = async (skill) => {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'mistralai/mistral-7b-instruct:free',
        messages: [{
          role: 'user',
          content: `Generate 3 multiple choice questions about ${skill}. Format as JSON array with question, options (4 choices), correctAnswer (0-3 index). Make questions practical and skill-testing.`
        }],
        max_tokens: 800
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      const content = data.choices[0].message.content;
      const questions = JSON.parse(content.match(/\[.*\]/s)?.[0] || '[]');
      return questions.length === 3 ? questions : null;
    }
  } catch (error) {
    console.error('AI question generation failed:', error);
  }
  return null;
};

// Start assessment
router.post('/start', authenticateToken, async (req, res) => {
  try {
    const { skill } = req.body;
    let questions = assessmentQuestions[skill];
    
    // Try AI generation if no predefined questions
    if (!questions) {
      questions = await generateAIQuestions(skill);
    }
    
    // Fallback to generic questions
    if (!questions) {
      questions = [
        { question: `What is a key concept in ${skill}?`, options: ['Concept A', 'Concept B', 'Concept C', 'Concept D'], correctAnswer: 0 },
        { question: `Which tool is commonly used with ${skill}?`, options: ['Tool A', 'Tool B', 'Tool C', 'Tool D'], correctAnswer: 1 },
        { question: `What is a best practice in ${skill}?`, options: ['Practice A', 'Practice B', 'Practice C', 'Practice D'], correctAnswer: 2 }
      ];
    }
    
    const assessment = await SkillAssessment.create({
      userId: req.user.id,
      skill,
      questions: questions.map(q => ({ ...q, userAnswer: -1, timeSpent: 0 })),
      score: 0,
      answers: {}
    });
    
    res.json({
      assessmentId: assessment.id,
      skill,
      questions: questions.map(q => ({ question: q.question, options: q.options })),
      totalQuestions: questions.length,
      timeLimit: 30
    });
  } catch (error) {
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
    
    await SkillAssessment.update({
      questions,
      answers,
      score: Math.round((correctAnswers / questions.length) * 100),
      completedAt: new Date()
    }, { where: { id: req.params.id } });
    
    res.json({
      score: Math.round((correctAnswers / questions.length) * 100),
      correctAnswers,
      totalQuestions: questions.length,
      timeSpent,
      status: 'completed'
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
      attributes: ['skill', 'score', 'completedAt'],
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
    res.json(['JavaScript', 'Python', 'React', 'Node.js', 'Java']);
  }
});

export default router;