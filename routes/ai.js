import express from 'express';
import aiClient from '../services/aiClient.js';

const router = express.Router();

function getFallbackResponse(message) {
  const m = (message || '').toLowerCase();
  if (m.includes('resume') || m.includes('cv'))
    return "📄 Resume tips:\n\n• Use a clean, professional format\n• Highlight relevant skills and achievements\n• Quantify accomplishments with numbers\n• Keep it to 1-2 pages";
  if (m.includes('interview'))
    return "🎯 Interview tips:\n\n• Research the company thoroughly\n• Use the STAR method for behavioral questions\n• Prepare 3-5 strong examples\n• Practice out loud";
  if (m.includes('salary') || m.includes('negotiat'))
    return "💰 Salary tips:\n\n• Research market rates first\n• Let the employer give a number first\n• Counter with a range\n• Always negotiate — most employers expect it";
  return "👋 Hello! I'm ZyncJobs AI Assistant. I can help with:\n\n🔍 Job searching\n📄 Resume writing\n🎯 Interview prep\n💼 Career advice\n\nWhat would you like help with?";
}

// POST /api/ai/chat
router.post('/chat', async (req, res) => {
  const { message, history, messages, systemPrompt, maxTokens = 800 } = req.body;

  // Structured format
  if (messages && Array.isArray(messages)) {
    try {
      const lastMsg = messages[messages.length - 1]?.content || '';
      const context = systemPrompt ? `${systemPrompt}\n\n${lastMsg}` : lastMsg;
      const result = await aiClient.chat(context);
      return res.json({ content: result.reply });
    } catch (err) {
      console.error('[ai.js /chat structured]', err.message);
      return res.status(503).json({ error: 'AI service unavailable', details: err.message });
    }
  }

  // Legacy ChatWidget format
  if (!message || typeof message !== 'string')
    return res.status(400).json({ error: 'Message or messages array required' });

  try {
    const historyText = (history || []).map(h => `${h.role}: ${h.content}`).join('\n');
    const fullMsg = historyText ? `${historyText}\nuser: ${message}` : message;
    const result = await aiClient.chat(fullMsg);
    return res.json({ reply: result.reply });
  } catch (err) {
    console.error('[ai.js /chat legacy]', err.message);
    return res.json({ reply: getFallbackResponse(message) });
  }
});

// POST /api/ai/chat/stream — SSE streaming via AI agent
router.post('/chat/stream', async (req, res) => {
  const { messages, systemPrompt } = req.body;
  if (!messages || !Array.isArray(messages))
    return res.status(400).json({ error: 'Messages array required' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const lastMsg = messages[messages.length - 1]?.content || '';
    const context = systemPrompt ? `${systemPrompt}\n\n${lastMsg}` : lastMsg;
    const result = await aiClient.chat(context);
    const reply = result.reply || '';
    // Send in chunks to simulate streaming
    const chunkSize = 50;
    for (let i = 0; i < reply.length; i += chunkSize) {
      res.write('data: ' + JSON.stringify({ chunk: reply.slice(i, i + chunkSize) }) + '\n\n');
    }
  } catch (err) {
    console.error('[ai.js /chat/stream]', err.message);
    res.write('data: ' + JSON.stringify({ chunk: 'Sorry, AI service is temporarily unavailable.' }) + '\n\n');
  }

  res.write('data: [DONE]\n\n');
  res.end();
});

export default router;
