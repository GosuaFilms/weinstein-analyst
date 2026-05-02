// POST /functions/v1/chat
// Body: { history: Array<{role, parts}>, userMessage: string, context?: AnalysisResult, language: 'es'|'en' }

import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { generate, MODEL_CHAT, type AnthropicMessage } from '../_shared/anthropic.ts';

// El frontend envía historial en formato Gemini (role:'model', parts:[{text}])
// Lo convertimos al formato Anthropic (role:'assistant', content: string)
interface GeminiMessage {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

function toAnthropicHistory(history: GeminiMessage[], userMessage: string): AnthropicMessage[] {
  const messages: AnthropicMessage[] = history.map((msg) => ({
    role: msg.role === 'model' ? 'assistant' : 'user',
    content: msg.parts.map((p) => p.text).join(''),
  }));
  messages.push({ role: 'user', content: userMessage });
  return messages;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { history, userMessage, context, language } = await req.json() as {
      history: GeminiMessage[];
      userMessage: string;
      context?: Record<string, unknown>;
      language: 'es' | 'en';
    };

    const langName = language === 'es' ? 'Spanish' : 'English';
    let system = `You are Alpha Stage's AI assistant, expert in Stan Weinstein's Stage Analysis. Respond in ${langName}. Be concise and precise.`;
    if (context) {
      system += `\n\nCurrent analysis context:\n${JSON.stringify(context).slice(0, 2000)}`;
    }

    const raw = await generate({
      system,
      messages: toAnthropicHistory(history, userMessage),
      model: MODEL_CHAT,
      maxTokens: 1024,
    });

    return jsonResponse({ text: raw });
  } catch (err) {
    console.error('chat error:', err);
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
