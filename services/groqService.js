// External Groq API removed — all AI calls go through aiClient (port 8001)
export async function callGroq() {
  throw new Error('[groqService] Groq removed — use aiClient instead');
}
