// ============================================================
// Server-only provider configuration
// Read from .env environment file — never exposed to the client
// ============================================================
import "server-only";
import "./env"; // Strictly load from root .env file

export type ProviderId = "groq" | "google";

export interface ModelInfo {
  id: string;
  displayName: string;
}

export interface ServerProviderConfig {
  id: ProviderId;
  name: string;
  baseUrl: string;
  apiKey: string | undefined;
  models: ModelInfo[];
}

export interface ClientProviderInfo {
  id: ProviderId;
  name: string;
  configured: boolean;
  models: ModelInfo[];
}

function parseModelList(
  envValue: string | undefined,
  defaults: ModelInfo[]
): ModelInfo[] {
  if (!envValue || envValue.trim() === "") return defaults;
  return envValue.split(",").map((m) => {
    const trimmed = m.trim();
    let displayName = trimmed;

    // Groq Models
    if (trimmed.includes("gpt-oss-20b")) displayName = "GPT-OSS 20B";
    else if (trimmed.includes("gpt-oss-120b")) displayName = "GPT-OSS 120B";
    else if (trimmed.includes("qwen3.8-27b")) displayName = "Qwen 3.8 27B";
    else if (trimmed.includes("allam-2-7b")) displayName = "ALLaM 2 7B";
    // Google Gemini Models
    else if (trimmed.includes("gemini-3.5-flash-lite")) displayName = "Gemini 3.5 Flash-Lite";
    else if (trimmed.includes("gemini-3.5-flash")) displayName = "Gemini 3.5 Flash";
    else if (trimmed.includes("gemini-3.6-flash")) displayName = "Gemini 3.6 Flash";
    else if (trimmed.includes("gemini-3.8-flash")) displayName = "Gemini 3.8 Flash";
    else if (trimmed.includes("gemini-4-argon")) displayName = "Gemini 4 Argon";

    return { id: trimmed, displayName };
  });
}

export function getProviders(): ServerProviderConfig[] {
  // Groq (powers Column 1 and Column 2)
  const groqKey = process.env.GROQ_API_KEY;
  const groqModels = parseModelList(process.env.GROQ_MODELS, [
    { id: "openai/gpt-oss-20b", displayName: "GPT-OSS 20B" },
    { id: "qwen/qwen3.8-27b", displayName: "Qwen 3.8 27B" },
    { id: "openai/gpt-oss-120b", displayName: "GPT-OSS 120B" },
    { id: "allam-2-7b", displayName: "ALLaM 2 7B" },
  ]);

  // Google AI Studio (powers Column 3)
  const geminiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_AI_STUDIO_API_KEY ||
    process.env.GOOGLE_API_KEY;
  const geminiModels = parseModelList(
    process.env.GEMINI_MODELS || process.env.GOOGLE_MODELS,
    [
      { id: "gemini-3.5-flash-lite", displayName: "Gemini 3.5 Flash-Lite" },
      { id: "gemini-3.8-flash", displayName: "Gemini 3.8 Flash" },
      { id: "gemini-3.5-flash", displayName: "Gemini 3.5 Flash" },
      { id: "gemini-3.6-flash", displayName: "Gemini 3.6 Flash" },
      { id: "gemini-4-argon", displayName: "Gemini 4 Argon" },
    ]
  );

  return [
    {
      id: "groq",
      name: "Groq",
      baseUrl: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
      apiKey: groqKey,
      models: groqModels,
    },
    {
      id: "google",
      name: "Google AI Studio",
      baseUrl:
        process.env.GEMINI_BASE_URL ||
        "https://generativelanguage.googleapis.com/v1beta",
      apiKey: geminiKey,
      models: geminiModels,
    },
  ];
}

export function getProvider(id: ProviderId): ServerProviderConfig | undefined {
  return getProviders().find((p) => p.id === id);
}

export function getClientProviderInfo(): ClientProviderInfo[] {
  return getProviders().map((p) => ({
    id: p.id,
    name: p.name,
    configured: Boolean(p.apiKey && p.apiKey.trim().length > 0),
    models: p.models,
  }));
}
