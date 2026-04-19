// Minimal Gemini REST client — we avoid the SDK to keep Edge cold-starts fast.
// Uses the current Gemini 2.5 Pro model. Update MODEL if you want to switch.

const MODEL = 'gemini-2.5-pro';
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

function getKey(): string {
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) throw new Error('GEMINI_API_KEY not set in Edge Function secrets');
  return key;
}

export interface GeminiPart {
  text?: string;
  inlineData?: { data: string; mimeType: string };
}

export interface GeminiRequest {
  systemInstruction?: string;
  contents: Array<{ role?: 'user' | 'model'; parts: GeminiPart[] }>;
  temperature?: number;
  jsonMode?: boolean;
  model?: string;
}

export async function generate(req: GeminiRequest): Promise<string> {
  const model = req.model ?? MODEL;
  const body: Record<string, unknown> = {
    contents: req.contents,
    generationConfig: {
      temperature: req.temperature ?? 0.2,
      ...(req.jsonMode ? { responseMimeType: 'application/json' } : {}),
    },
  };
  if (req.systemInstruction) {
    body.systemInstruction = { parts: [{ text: req.systemInstruction }] };
  }

  const url = `${API_BASE}/models/${model}:generateContent?key=${getKey()}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errText.slice(0, 300)}`);
  }
  const json = await res.json();
  const text: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned empty response');
  return text;
}

export function extractJson<T>(text: string): T {
  let clean = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
  const match = clean.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (match) clean = match[0];
  try {
    return JSON.parse(clean) as T;
  } catch (e) {
    throw new Error(`Failed to parse Gemini JSON response: ${(e as Error).message}`);
  }
}
