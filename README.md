# AI Tri-Arena — 3-Way AI Model Comparison

A lightweight, high-performance Next.js application for comparing 3 AI models head-to-head in real time:
- **Column 1:** Groq model (e.g. `llama-3.3-70b-versatile`, `llama-3.1-8b-instant`)
- **Column 2:** Groq model (e.g. `mixtral-8x7b-32768`, `gemma2-9b-it`)
- **Column 3:** Google AI Studio model (e.g. `gemini-2.0-flash`, `gemini-1.5-flash`)

All 3 models stream responses concurrently from a single bottom prompt input with zero database dependency and no history storage.

---

## Features

- **3-Way Parallel Streaming:** Submitting one prompt calls all 3 models simultaneously via Server-Sent Events (SSE).
- **Zero Database / Pure Stateless:** No database, no local storage history, and no saved logs.
- **Provider Adapters:**
  - Groq via OpenAI-compatible Chat Completions
  - Google AI Studio via native Gemini REST SSE streaming
- **Resilient Columns:** If one model fails or hits quota limits, the other two continue streaming unaffected.
- **Per-Column Model Switcher:** Switch models for any column on the fly.
- **Interactive UI:**
  - One bottom prompt composer with auto-expansion, keyboard shortcut (`Enter` to send, `Shift+Enter` for new line)
  - Quick example prompt starter chips
  - Stop button to abort active generations mid-stream
  - Copy response button with feedback toast
  - Live elapsed time & token/character counters

---

## Quick Setup

### 1. Environment Variables

Create a `.env.local` file in the project root (see `.env.example`):

```bash
# Groq API Key (Powers Columns 1 & 2)
GROQ_API_KEY=gsk_your_groq_api_key_here

# Google AI Studio API Key (Powers Column 3)
GEMINI_API_KEY=your_gemini_api_key_here
```

*(Optional model list customizations)*:
```bash
GROQ_MODELS=llama-3.3-70b-versatile,llama-3.1-8b-instant,mixtral-8x7b-32768,gemma2-9b-it
GEMINI_MODELS=gemini-2.0-flash,gemini-1.5-flash,gemini-1.5-pro
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
