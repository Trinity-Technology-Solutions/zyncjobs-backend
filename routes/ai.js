import express from 'express';
import { callGeminiChat, callGeminiStream } from '../services/geminiService.js';
import { callGroq } from '../services/groqService.js';

// Use Groq first, fallback to Gemini
async function callAI({ systemPrompt, messages, maxTokens = 800, temperature = 0.4, feature = 'default' }) {
  try {
    return await callGroq({ systemPrompt, messages, maxTokens, temperature, feature });
  } catch (e) {
    console.warn('[ai.js] Groq failed, trying Gemini:', e.message);
    return callGeminiChat({ systemPrompt, messages, maxTokens, temperature });
  }
}

const router = express.Router();

function getFallbackResponse(message) {
  const m = (message || '').toLowerCase();
  if (m.includes('apply') || m.includes('application'))
    return "📝 Here's how to apply for jobs effectively:\n\n• Create a complete profile\n• Customize your resume for each application\n• Write a compelling cover letter\n• Follow up after applying";
  if (m.includes('resume') || m.includes('cv'))
    return "📄 Resume tips:\n\n• Use a clean, professional format\n• Highlight relevant skills and achievements\n• Quantify accomplishments with numbers\n• Keep it to 1-2 pages";
  if (m.includes('interview'))
    return "🎯 Interview tips:\n\n• Research the company thoroughly\n• Use the STAR method for behavioral questions\n• Prepare 3-5 strong examples\n• Practice out loud";
  if (m.includes('salary') || m.includes('negotiat'))
    return "💰 Salary tips:\n\n• Research market rates first\n• Let the employer give a number first\n• Counter with a range\n• Always negotiate — most employers expect it";
  return "👋 Hello! I'm ZyncJobs AI Assistant. I can help with:\n\n🔍 Job searching\n📄 Resume writing\n🎯 Interview prep\n💼 Career advice\n\nWhat would you like help with?";
}

// POST /api/ai/chat — handles both ChatWidget { message, history } and structured { messages, systemPrompt }
router.post('/chat', async (req, res) => {
  const { message, history, messages, systemPrompt, maxTokens = 800 } = req.body;

  // Structured format (from aiChatService.ts sendAIMessage)
  if (messages && Array.isArray(messages)) {
    try {
      const reply = await callAI({
        systemPrompt: systemPrompt || '',
        messages,
        maxTokens,
        temperature: 0.4,
        feature: 'ai-recruiter',
      });
      return res.json({ content: reply });
    } catch (err) {
      console.error('[Gemini /ai/chat]', err.message);
      return res.status(503).json({ error: 'AI service unavailable', details: err.message });
    }
  }

  // Legacy ChatWidget format { message, history }
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message or messages array required' });
  }
  try {
    const sys = 'You are a helpful assistant for ZyncJobs, a job portal. Help users with job searching, resume tips, interview prep, and career advice. Be concise and friendly.';
    const chatMessages = [
      ...(history || []).map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: message },
    ];
    const reply = await callAI({
      systemPrompt: sys,
      messages: chatMessages,
      maxTokens: 600,
      temperature: 0.7,
      feature: 'career-coach',
    });
    return res.json({ reply });
  } catch (err) {
    console.error('[Gemini /ai/chat legacy]', err.message);
    return res.json({ reply: getFallbackResponse(message) });
  }
});

// POST /api/ai/chat/stream — streaming for CareerCoach, Recruiter, ChatWidget
router.post('/chat/stream', async (req, res) => {
  const { messages, systemPrompt, maxTokens = 600 } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages array required' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    await callGeminiStream({
      systemPrompt: systemPrompt || '',
      messages,
      maxTokens,
      onChunk: (text) => res.write('data: ' + JSON.stringify({ chunk: text }) + '\n\n'),
    });
  } catch (err) {
    console.error('[Gemini /ai/chat/stream]', err.message);
    res.write('data: ' + JSON.stringify({ chunk: 'Sorry, AI service is temporarily unavailable.' }) + '\n\n');
  }

  res.write('data: [DONE]\n\n');
  res.end();
});

export default router;
