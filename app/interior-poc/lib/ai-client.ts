// Client AI unificato per la PoC
// Usa opencode (endpoint zen, OpenAI-compatible) con fallback a OpenAI

export interface AiClientOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiResponse {
  content: string;
  model: string;
  provider: "opencode" | "openai";
}

// Endpoint zen di opencode (OpenAI-compatible, modelli free)
const OPENCODE_ZEN_URL = "https://opencode.ai/zen/v1";

/**
 * Chiamata chat completion unificata
 * 1. Prova opencode zen (modelli free)
 * 2. Fallback a OpenAI
 */
export async function chatCompletion(
  messages: AiMessage[],
  options: AiClientOptions = {}
): Promise<AiResponse> {
  const opencodeApiKey = process.env.OPENCODE_API_KEY || "public";
  const openaiApiKey = process.env.OPENAI_API_KEY;

  // 1. Prova opencode zen
  try {
    return await callOpencode(messages, options, opencodeApiKey);
  } catch (err) {
    console.warn("opencode fallito, fallback a OpenAI:", err);
  }

  // 2. Fallback a OpenAI
  if (openaiApiKey) {
    return await callOpenAI(messages, options, openaiApiKey);
  }

  throw new Error(
    "Nessun provider AI configurato. Imposta OPENCODE_API_KEY o OPENAI_API_KEY in .env.local"
  );
}

/**
 * Chiamata con immagine (vision) — opencode o OpenAI
 */
export async function chatCompletionWithImage(
  systemPrompt: string,
  imageDataUrl: string,
  options: AiClientOptions = {}
): Promise<AiResponse> {
  const opencodeApiKey = process.env.OPENCODE_API_KEY || "public";
  const openaiApiKey = process.env.OPENAI_API_KEY;

  try {
    return await callOpencodeWithImage(systemPrompt, imageDataUrl, options, opencodeApiKey);
  } catch (err) {
    console.warn("opencode vision fallito, fallback a OpenAI:", err);
  }

  if (openaiApiKey) {
    return await callOpenAIWithImage(systemPrompt, imageDataUrl, options, openaiApiKey);
  }

  throw new Error("Nessun provider AI configurato");
}

/**
 * Estrae JSON da una risposta AI
 */
export function extractJson<T>(content: string): T {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Risposta AI non contiene JSON valido");
  }
  return JSON.parse(jsonMatch[0]) as T;
}

// ─── opencode zen ────────────────────────────────────────────────────────

async function callOpencode(
  messages: AiMessage[],
  options: AiClientOptions,
  apiKey: string
): Promise<AiResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  const res = await fetch(`${OPENCODE_ZEN_URL}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: options.model ?? process.env.OPENCODE_MODEL ?? "mimo-v2.5-free",
      temperature: options.temperature ?? 0.1,
      max_tokens: options.maxTokens ?? 4096,
      messages,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error?.message ?? `opencode error ${res.status}`);
  }

  const data = await res.json();
  return {
    content: data.choices?.[0]?.message?.content ?? "",
    model: data.model ?? "opencode",
    provider: "opencode",
  };
}

async function callOpencodeWithImage(
  systemPrompt: string,
  imageDataUrl: string,
  options: AiClientOptions,
  apiKey: string
): Promise<AiResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  const res = await fetch(`${OPENCODE_ZEN_URL}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: options.model ?? process.env.OPENCODE_MODEL ?? "mimo-v2.5-free",
      temperature: options.temperature ?? 0.1,
      max_tokens: options.maxTokens ?? 4096,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error?.message ?? `opencode error ${res.status}`);
  }

  const data = await res.json();
  return {
    content: data.choices?.[0]?.message?.content ?? "",
    model: data.model ?? "opencode",
    provider: "opencode",
  };
}

// ─── OpenAI ──────────────────────────────────────────────────────────────

async function callOpenAI(
  messages: AiMessage[],
  options: AiClientOptions,
  apiKey: string
): Promise<AiResponse> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: options.model ?? "gpt-4o",
      temperature: options.temperature ?? 0.1,
      max_tokens: options.maxTokens ?? 4096,
      response_format: { type: "json_object" },
      messages,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error?.message ?? `OpenAI error ${res.status}`);
  }

  const data = await res.json();
  return {
    content: data.choices?.[0]?.message?.content ?? "",
    model: data.model ?? "gpt-4o",
    provider: "openai",
  };
}

async function callOpenAIWithImage(
  systemPrompt: string,
  imageDataUrl: string,
  options: AiClientOptions,
  apiKey: string
): Promise<AiResponse> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: options.model ?? "gpt-4o",
      temperature: options.temperature ?? 0.1,
      max_tokens: options.maxTokens ?? 4096,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error?.message ?? `OpenAI error ${res.status}`);
  }

  const data = await res.json();
  return {
    content: data.choices?.[0]?.message?.content ?? "",
    model: data.model ?? "gpt-4o",
    provider: "openai",
  };
}