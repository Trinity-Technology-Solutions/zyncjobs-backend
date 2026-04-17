import express from 'express';
import { callAI } from '../services/openRouterService.js';

const router = express.Router();

// Fallback responses when AI is unavailable
function getFallbackResponse(message) {
  const lowerMessage = (message || '').toLowerCase();

  if (lowerMessage.includes('apply') || lowerMessage.includes('application')) {
    return "📝 Here's how to apply for jobs effectively:\n\n• Create a complete profile with your skills and experience\n• Search for jobs that match your qualifications\n• Customize your resume for each application\n• Write a compelling cover letter\n• Follow up after applying\n\nWould you like specific tips on any of these steps?";
  }

  if (lowerMessage.includes('resume') || lowerMessage.includes('cv')) {
    return "📄 I'd be happy to help with your resume! Here are some key tips:\n\n• Use a clean, professional format\n• Highlight relevant skills and achievements\n• Quantify your accomplishments with numbers\n• Tailor your resume for each job application\n• Keep it concise (1-2 pages)\n\nWould you like specific advice on any section?";
  }

  if (lowerMessage.includes('interview')) {
    return "🎯 Great question about interviews! Here are essential tips:\n\n• Research the company and role thoroughly\n• Practice common interview questions\n• Prepare specific examples using the STAR method\n• Ask thoughtful questions about the role\n• Follow up with a thank-you email\n\nWhat specific aspect would you like to focus on?";
  }

  if (lowerMessage.includes('job') || lowerMessage.includes('career')) {
    return "💼 I'm here to help with your job search! I can assist with:\n\n• Finding relevant job opportunities\n• Optimizing your applications\n• Career path planning\n• Skill development recommendations\n• Industry insights\n\nWhat would you like guidance on?";
  }

  if (lowerMessage.includes('salary') || lowerMessage.includes('negotiate')) {
    return "💰 Salary negotiation tips:\n\n• Research market rates for your role\n• Highlight your unique value and achievements\n• Consider the total compensation package\n• Practice your negotiation conversation\n• Be prepared to justify your request\n\nWould you like tips on researching salary ranges?";
  }

  if (lowerMessage.includes('hi') || lowerMessage.includes('hello') || lowerMessage.includes('hey')) {
    return "👋 Hello! I'm ZyncJobs AI Assistant. I can help you with:\n\n🔍 Job searching and applications\n📄 Resume writing and optimization\n🎯 Interview preparation\n💼 Career development advice\n\nWhat would you like assistance with today?";
  }

  return "👋 Hello! I'm ZyncJobs AI Assistant. I can help you with:\n\n🔍 Job searching and applications\n📄 Resume writing and optimization\n🎯 Interview preparation\n💼 Career development advice\n\nWhat would you like assistance with today?";
}

// Chat endpoint for chat widget
router.post('/chat', async (req, res) => {
  try {
    const { message, history = [] } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    console.log('💬 AI chat request:', { message: message.substring(0, 50) });

    const systemPrompt = 'You are a helpful assistant for ZyncJobs, a job portal. Help users with job searching, resume tips, interview prep, and career advice. Be concise and friendly.';

    // Convert history to OpenRouter format
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: message }
    ];

    try {
      // Call OpenRouter service
      const reply = await callAI({
        feature: 'career-coach',
        messages,
        maxTokens: 600,
        temperature: 0.7
      });

      console.log('✅ AI chat response generated');
      res.json({ reply });
    } catch (aiError) {
      // If AI fails, use fallback responses
      console.warn('⚠️ AI unavailable, using fallback:', aiError.message);
      const fallbackReply = getFallbackResponse(message);
      res.json({ reply: fallbackReply });
    }
  } catch (error) {
    console.error('❌ AI chat error:', error.message);
    res.status(500).json({ 
      error: 'Failed to get AI response',
      message: "Sorry, I'm having trouble connecting. Please try again.",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;
