// ============================================================
// POST /api/stream — Streams output for a single model
// Calling this in parallel for all 3 columns ensures independent,
// resilient streaming with conversational context support.
// ============================================================
import { NextRequest } from "next/server";
import { streamModelResponse, ChatMessageParam } from "@/lib/ai-client";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { provider, model, prompt, messages } = body;

    if (provider !== "groq" && provider !== "google") {
      return Response.json(
        { error: 'Invalid provider. Must be "groq" or "google".' },
        { status: 400 }
      );
    }

    if (!model || typeof model !== "string") {
      return Response.json({ error: "Model ID is required." }, { status: 400 });
    }

    let inputData: string | ChatMessageParam[];

    if (Array.isArray(messages) && messages.length > 0) {
      inputData = messages.map((m: { role: string; content: string }) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content || "").slice(0, 10000),
      }));
    } else if (typeof prompt === "string" && prompt.trim().length > 0) {
      inputData = prompt.trim().slice(0, 8000);
    } else {
      return Response.json(
        { error: "A prompt or messages array is required." },
        { status: 400 }
      );
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of streamModelResponse(provider, model, inputData)) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`)
            );
          }
        } catch (streamErr) {
          const errMsg =
            streamErr instanceof Error ? streamErr.message : "Stream processing error";
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", error: errMsg })}\n\n`
            )
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal Server Error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
