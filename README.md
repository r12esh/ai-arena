# AI Tri-Arena — 3-Way AI Model Comparison

A lightweight, high-performance Next.js application for comparing 3 AI models head-to-head in real time:
- **Column 1:** Groq model (e.g. `openai/gpt-oss-20b`, `qwen/qwen3.8-27b`)
- **Column 2:** Groq model (e.g. `qwen/qwen3.8-27b`, `openai/gpt-oss-120b`)
- **Column 3:** Google AI Studio model (e.g. `gemini-3.5-flash-lite`, `gemini-3.8-flash`)

All 3 models stream responses concurrently from a single bottom prompt input with offline-first multi-turn history stored directly in client-side IndexedDB.

---

## Features

- **3-Way Parallel Streaming:** Submitting one prompt calls all 3 models simultaneously via Server-Sent Events (SSE).
- **Client-Side IndexedDB Multi-Turn History:** Conversations are persisted in IndexedDB with multi-turn context support.
- **Provider Adapters:**
  - Groq via OpenAI-compatible Chat Completions (`api.groq.com/openai/v1`)
  - Google AI Studio via native Gemini REST SSE streaming
- **Resilient Columns:** If one model fails or hits quota limits, the other two continue streaming unaffected.
- **Per-Column Model Switcher:** Switch models for any column on the fly.
- **Interactive UI:**
  - One bottom prompt composer with auto-expansion, keyboard shortcut (`Enter` to send, `Shift+Enter` for new line)
  - Resizable columns with keyboard shortcuts and smooth drag interaction
  - Stop button to abort active generations mid-stream
  - Copy response button with feedback toast
  - Live elapsed time counter

---

## Quick Setup

### 1. Environment Variables

Only the `.env` file in the project root is used:

```bash
# Groq API Configuration (for Column 1 & Column 2 models)
GROQ_API_KEY=gsk_your_groq_api_key_here

# Google AI Studio Configuration (for Column 3 model)
GEMINI_API_KEY=your_gemini_api_key_here
```

*(Optional model list customizations in `.env`)*:
```bash
GROQ_MODELS=openai/gpt-oss-20b,qwen/qwen3.8-27b,openai/gpt-oss-120b,allam-2-7b
GEMINI_MODELS=gemini-3.5-flash-lite,gemini-3.8-flash,gemini-3.5-flash,gemini-3.6-flash,gemini-4-argon
```

### 2. Install & Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Production Build

```bash
npm run build
npm run start
```
