// POST /functions/v1/chat
// Body: { history: Array<{role, parts}>, userMessage: string, context?: AnalysisResult, language: 'es'|'en' }

import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { generate } from '../_shared/gemini.ts';

interface ChatMessage {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const { history, userMessage, context, language } = await req.json() as {
      history: ChatMessage[];
      userMessage: string;
      context?: Record<string, unknown>;
      language: 'es' | 'en';
    };

    const langName = language === 'es' ? 'Spanish' : 'English';
    let systemInstruction = `You are Alpha Stage's AI assistant, expert in Stan Weinstein's Stage Analysis. Respond in ${langName}. Be concise and precise.`;
    if (context) {
      systemInstruction += `\n\nCurrent analysis context:\n${JSON.stringify(context).slice(0, 2000)}`;
    }

    const contents: ChatMessage[] = [
      ...history,
      { role: 'user', parts: [{ text: userMessage }] },
    ];

    const raw = await generate({
      systemInstruction,
      contents,
      temperature: 0.7,
      model: 'gemini-2.5-flash',
    });

    return jsonResponse({ text: raw });
  } catch (err) {
    console.error('chat error:', err);
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
