// ============================================================
// Server-only: Multi-provider streaming AI client
// Supports Groq (OpenAI-compatible) and Google AI Studio (Gemini)
// Supports multi-turn conversational context
// ============================================================
import "server-only";
import { getProvider, ProviderId } from "./providers";

const REQUEST_TIMEOUT_MS = 60_000;
const MAX_TOKENS = 4096;

export interface StreamEvent {
  type: "chunk" | "done" | "error";
  text?: string;
  error?: string;
}

export interface ChatMessageParam {
  role: "user" | "assistant";
  content: string;
}

/**
 * Stream completion generator for a specific provider and model.
 * Supports multi-turn conversation messages or a single prompt string.
 */
export async function* streamModelResponse(
  providerId: ProviderId,
  modelId: string,
  promptOrMessages: string | ChatMessageParam[]
): AsyncGenerator<StreamEvent> {
  const provider = getProvider(providerId);

  if (!provider) {
    yield { type: "error", error: `Unknown provider: ${providerId}` };
    return;
  }

  if (!provider.apiKey || provider.apiKey.trim().length === 0) {
    const envKeyName =
      providerId === "groq"
        ? "GROQ_API_KEY"
        : "GEMINI_API_KEY";
    yield {
      type: "error",
      error: `${provider.name} is not configured. Please set ${envKeyName} in your .env file.`,
    };
    return;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  // Normalize to standard message list
  const normalizedMessages: ChatMessageParam[] = Array.isArray(promptOrMessages)
    ? promptOrMessages.filter((m) => m && m.content && m.content.trim().length > 0)
    : [{ role: "user", content: String(promptOrMessages).trim() }];

  if (normalizedMessages.length === 0) {
    yield { type: "error", error: "Cannot send an empty message list." };
    return;
  }

  try {
    if (providerId === "groq") {
      // -------------------------------------------------------------
      // OpenAI-compatible Chat Completions (Groq)
      // -------------------------------------------------------------
      const res = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify({
          model: modelId,
          messages: normalizedMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          stream: true,
          max_tokens: MAX_TOKENS,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => "Unknown error");
        let safeError = errorText.replace(/Bearer\s+[a-zA-Z0-9_\-.]+/gi, "Bearer [REDACTED]");
        try {
          const parsed = JSON.parse(safeError);
          if (parsed.error?.message) {
            safeError = parsed.error.message;
          }
        } catch {
          // Keep safeError as is
        }

        yield {
          type: "error",
          error: `${provider.name} error (${res.status}): ${safeError.slice(0, 350)}`,
        };
        return;
      }

      if (!res.body) {
        yield { type: "error", error: `${provider.name} returned an empty response body.` };
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          const payload = trimmed.slice(6);
          if (payload === "[DONE]") {
            yield { type: "done" };
            return;
          }

          try {
            const parsed = JSON.parse(payload);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              yield { type: "chunk", text: delta };
            }
          } catch {
            // Ignore incomplete JSON chunks
          }
        }
      }

      yield { type: "done" };
    } else {
      // -------------------------------------------------------------
      // Google AI Studio (Gemini REST streamGenerateContent with contents array)
      // -------------------------------------------------------------
      const url = `${provider.baseUrl}/models/${encodeURIComponent(
        modelId
      )}:streamGenerateContent?alt=sse&key=${encodeURIComponent(provider.apiKey)}`;

      // Gemini roles: "user" and "model"
      const geminiContents = normalizedMessages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: geminiContents,
          generationConfig: {
            maxOutputTokens: MAX_TOKENS,
          },
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => "Unknown error");
        const safeError = errorText.replace(new RegExp(provider.apiKey, "g"), "[REDACTED]");
        yield {
          type: "error",
          error: `Google AI Studio error (${res.status}): ${safeError.slice(0, 300)}`,
        };
        return;
      }

      if (!res.body) {
        yield {
          type: "error",
          error: "Google AI Studio returned an empty response body.",
        };
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          const payload = trimmed.slice(6);

          try {
            const parsed = JSON.parse(payload);
            const candidates = parsed.candidates;
            if (candidates && candidates.length > 0) {
              const parts = candidates[0].content?.parts;
              if (parts && parts.length > 0) {
                for (const part of parts) {
                  if (part.text) {
                    yield { type: "chunk", text: part.text };
                  }
                }
              }
            }
          } catch {
            // Ignore incomplete JSON chunks
          }
        }
      }

      yield { type: "done" };
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      yield {
        type: "error",
        error: `Request to ${provider.name} timed out after ${REQUEST_TIMEOUT_MS / 1000}s.`,
      };
    } else {
      const msg = err instanceof Error ? err.message : "Unknown network error";
      yield { type: "error", error: `${provider.name} error: ${msg}` };
    }
  } finally {
    clearTimeout(timeoutId);
  }
}
