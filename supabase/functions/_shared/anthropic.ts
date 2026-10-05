// Minimal Anthropic REST client — raw fetch para mantener cold-starts rápidos.
// Reemplaza gemini.ts. No usa SDK para evitar peso en el Edge runtime.

const MODEL_ANALYSIS = 'claude-opus-5-5'; // Análisis de mercado y operaciones
const MODEL_ANALYSIS_FALLBACK = 'claude-opus-4-7'; // Si la cuenta aún no tiene acceso a Opus 5.5
export const MODEL_CHAT = 'claude-haiku-4-5'; // Chat: rápido y eficiente
const API_BASE = 'https://api.anthropic.com/v1';
const ANTHROPIC_VERSION = '2023-06-01';

function getKey(): string {
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) throw new Error('ANTHROPIC_API_KEY not configured in Edge Function secrets');
  return key;
}

// ─── Tipos de contenido ────────────────────────────────────────────────────

export interface TextContent {
  type: 'text';
  text: string;
}

export interface ImageContent {
  type: 'image';
  source: { type: 'base64'; media_type: string; data: string };
}

export type ContentBlock = TextContent | ImageContent;

export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

export interface AnthropicRequest {
  system?: string;
  messages: AnthropicMessage[];
  model?: string;    // Default: MODEL_ANALYSIS
  maxTokens?: number; // Default: 4096
}

// ─── Cliente ───────────────────────────────────────────────────────────────

// POST /messages. If the account can't reach MODEL_ANALYSIS (404 model not
// found), retry once with MODEL_ANALYSIS_FALLBACK so analyses never break.
async function postMessages(body: Record<string, unknown>): Promise<Response> {
  const send = (b: Record<string, unknown>) => fetch(`${API_BASE}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': getKey(),
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify(b),
  });

  let res = await send(body);
  if (res.status === 404 && body.model === MODEL_ANALYSIS) {
    console.warn(`[anthropic] ${MODEL_ANALYSIS} unavailable, falling back to ${MODEL_ANALYSIS_FALLBACK}`);
    res = await send({ ...body, model: MODEL_ANALYSIS_FALLBACK });
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${errText.slice(0, 300)}`);
  }
  return res;
}

export async function generate(req: AnthropicRequest): Promise<string> {
  const body: Record<string, unknown> = {
    model: req.model ?? MODEL_ANALYSIS,
    max_tokens: req.maxTokens ?? 4096,
    messages: req.messages,
  };
  if (req.system) body.system = req.system;

  const json = await (await postMessages(body)).json();
  // Join every text block — don't assume content[0] is text
  const text = ((json?.content ?? []) as Array<{ type: string; text?: string }>)
    .filter(b => b.type === 'text' && b.text)
    .map(b => b.text)
    .join('');
  if (!text) throw new Error('Anthropic returned empty response');
  return text;
}

// ─── Streaming ────────────────────────────────────────────────────────────
// Returns the raw Anthropic SSE Response. The caller is responsible for
// piping / transforming the body.

export async function generateStream(req: AnthropicRequest): Promise<Response> {
  const body: Record<string, unknown> = {
    model: req.model ?? MODEL_ANALYSIS,
    max_tokens: req.maxTokens ?? 4096,
    messages: req.messages,
    stream: true,
  };
  if (req.system) body.system = req.system;

  return await postMessages(body);
}

// ─── Utilidad JSON ─────────────────────────────────────────────────────────

export function extractJson<T>(text: string): T {
  let clean = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
  const match = clean.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (match) clean = match[0];
  try {
    return JSON.parse(clean) as T;
  } catch (e) {
    throw new Error(`Failed to parse Anthropic JSON response: ${(e as Error).message}`);
  }
}
