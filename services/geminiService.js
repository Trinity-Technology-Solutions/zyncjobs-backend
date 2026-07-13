// External Gemini API removed — all AI calls go through aiClient (port 8001)
export async function callGemini() {
  throw new Error('[geminiService] Gemini removed — use aiClient instead');
}
export async function callGeminiChat() {
  throw new Error('[geminiService] Gemini removed — use aiClient instead');
}
export async function callGeminiStream() {
  throw new Error('[geminiService] Gemini removed — use aiClient instead');
}
