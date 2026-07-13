import aiClient from './aiClient.js';

export async function callAI({ feature = 'default', messages, maxTokens = 700, temperature = 0.7 }) {
  const lastMsg = messages?.[messages.length - 1]?.content || '';
  const result = await aiClient.suggest(lastMsg);
  return result.reply || '';
}
