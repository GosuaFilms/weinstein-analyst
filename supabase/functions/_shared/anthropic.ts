// Minimal Anthropic REST client — raw fetch para mantener cold-starts rápidos.
// Reemplaza gemini.ts. No usa SDK para evitar peso en el Edge runtime.

const MODEL_ANALYSIS = 'claude-opus-4-7'; // Análisis de mercado y operaciones
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

export async function generate(req: AnthropicRequest): Promise<string> {
  const model = req.model ?? MODEL_ANALYSIS;

  const body: Record<string, unknown> = {
    model,
    max_tokens: req.maxTokens ?? 4096,
    messages: req.messages,
  };

  if (req.system) {
    body.system = req.system;
  }

  const res = await fetch(`${API_BASE}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': getKey(),
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${errText.slice(0, 300)}`);
  }

  const json = await res.json();
  const text: string | undefined = json?.content?.[0]?.text;
  if (!text) throw new Error('Anthropic returned empty response');
  return text;
}

// ─── Streaming ────────────────────────────────────────────────────────────
// Returns the raw Anthropic SSE Response. The caller is responsible for
// piping / transforming the body.

export async function generateStream(req: AnthropicRequest): Promise<Response> {
  const model = req.model ?? MODEL_ANALYSIS;

  const body: Record<string, unknown> = {
    model,
    max_tokens: req.maxTokens ?? 4096,
    messages: req.messages,
    stream: true,
  };
  if (req.system) body.system = req.system;

  const res = await fetch(`${API_BASE}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': getKey(),
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${errText.slice(0, 300)}`);
  }

  return res;
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
