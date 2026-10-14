"use client";

import React, { useState, useRef, useEffect, useCallback, memo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  Copy,
  Check,
  Send,
  Square,
  RotateCcw,
  AlertTriangle,
  Clock,
  Cpu,
  Bot,
  Plus,
  Trash2,
  PanelLeftClose,
  PanelLeft,
  Database,
  MessageSquare,
  History,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { MarkdownRenderer } from "./markdown-renderer";
import { useResizableColumns } from "@/hooks/use-resizable-columns";
import { ColumnResizer } from "./column-resizer";
import {
  ChatSession,
  ChatTurn,
  TurnResponse,
  getAllSessions,
  saveSession,
  deleteSession,
  clearAllSessions,
} from "@/lib/db";

interface ModelOption {
  id: string;
  displayName: string;
}

interface ProviderMeta {
  id: "groq" | "google";
  name: string;
  configured: boolean;
  models: ModelOption[];
}

interface LiveColumnState {
  provider: "groq" | "google";
  providerName: string;
  selectedModel: string;
  streamingText: string;
  status: "idle" | "streaming" | "completed" | "error";
  error?: string;
  durationMs: number;
}

function createEmptySession(models: [string, string, string]): ChatSession {
  return {
    id: crypto.randomUUID(),
    title: "New Conversation",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    columnModels: models,
    turns: [],
  };
}

// ============================================================
// ISOLATED PROMPT BAR:
// Typing ONLY re-renders this component.
// Zero re-renders for columns, sidebar, or past markdown.
// ============================================================
interface PromptInputBarProps {
  onSubmit: (prompt: string) => void;
  onStop: () => void;
  isStreaming: boolean;
}

const PromptInputBar = memo(function PromptInputBar({
  onSubmit,
  onStop,
  isStreaming,
}: PromptInputBarProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow textarea from 1 row (~44px) up to ~200px max, then scroll
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const nextHeight = Math.min(el.scrollHeight, 200);
    el.style.height = `${Math.max(nextHeight, 44)}px`;
    el.style.overflowY = el.scrollHeight > 200 ? "auto" : "hidden";
  }, [text]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;
    onSubmit(trimmed);
    setText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "44px";
      textareaRef.current.style.overflowY = "hidden";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ignore Enter during IME composition (e.g. Japanese/Chinese input)
    if (e.nativeEvent.isComposing) return;

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const isTextEmpty = !text.trim();

  return (
    <footer className="flex-none bg-zinc-950/80 backdrop-blur-md px-4 pt-0 pb-3.5 max-w-5xl mx-auto w-full">
      <form onSubmit={handleSubmit} className="relative w-full">
        {/* Rounded container with 20px border-radius, subtle border, and focus-within ring */}
        <div className="relative flex flex-col justify-end w-full rounded-[15px] bg-zinc-900/80 border border-zinc-800/90 shadow-lg shadow-black/20 transition-all duration-150 focus-within:ring-2 focus-within:ring-indigo-500/40 focus-within:border-indigo-500/50">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask across all 3 AI models... (Enter to send, Shift+Enter for newline)"
            rows={1}
            className="w-full resize-none bg-transparent text-zinc-100 placeholder:text-zinc-500 text-sm py-3 pl-4 pr-12 focus:outline-none min-h-[44px] max-h-[200px] leading-relaxed custom-scrollbar"
          />

          {/* Circular send/stop action button inside bottom-right */}
          <div className="absolute right-2.5 bottom-2.5 flex items-center justify-center">
            {isStreaming ? (
              <button
                type="button"
                onClick={onStop}
                aria-label="Stop generation"
                title="Stop generation"
                className="w-8 h-8 rounded-full flex items-center justify-center bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-600/30 transition-all duration-150 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={isTextEmpty}
                aria-label="Send message"
                title="Send message"
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                  isTextEmpty
                    ? "bg-zinc-800 text-zinc-500 cursor-not-allowed opacity-40"
                    : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 active:scale-95 cursor-pointer"
                }`}
              >
                <ArrowUp className="w-4 h-4 stroke-[2.5]" />
              </button>
            )}
          </div>
        </div>
      </form>
    </footer>
  );
});

// ============================================================
// MEMOIZED TURN ITEM:
// Uses CSS containment and content-visibility: auto for smooth rendering.
// Props are stable; previous turns NEVER re-render or re-parse!
// ============================================================
interface TurnItemProps {
  turn: ChatTurn;
  colIdx: number;
  colModel: string;
  isTurnStreaming: boolean;
  streamingText: string;
  streamingError?: string;
  streamingDuration: number;
  copiedKey: string | null;
  onCopy: (text: string, key: string) => void;
  onRetry: (colIdx: number) => void;
}

const TurnItem = memo(function TurnItem({
  turn,
  colIdx,
  colModel,
  isTurnStreaming,
  streamingText,
  streamingError,
  streamingDuration,
  copiedKey,
  onCopy,
  onRetry,
}: TurnItemProps) {
  const resp = turn.columnResponses[colIdx];
  const displayText = isTurnStreaming ? streamingText : resp?.text;
  const displayError = isTurnStreaming && streamingError ? streamingError : resp?.error;
  const displayDuration = resp?.durationMs || (isTurnStreaming ? streamingDuration : 0);

  const handleRetryClick = useCallback(() => {
    onRetry(colIdx);
  }, [onRetry, colIdx]);

  return (
    <div
      className="space-y-2.5 pb-3 border-b border-zinc-800/40 last:border-b-0 [content-visibility:auto] [contain-intrinsic-size:auto_200px]"
    >
      {/* User Prompt Bubble */}
      <div className="flex justify-end">
        <div className="max-w-[90%] rounded-2xl rounded-tr-sm bg-indigo-600/20 border border-indigo-500/30 px-3.5 py-2 text-xs text-indigo-100 font-medium shadow-sm leading-relaxed">
          {turn.prompt}
        </div>
      </div>

      {/* Model Answer Header & Text */}
      <div className="space-y-1.5 pt-0.5">
        <div className="flex items-center justify-between text-[11px] text-zinc-500">
          <div className="flex items-center gap-1.5 font-mono text-[11px] text-zinc-400 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400/80" />
            <span>{resp?.model || colModel}</span>
          </div>
          <div className="flex items-center gap-2">
            {displayDuration > 0 && (
              <span className="flex items-center gap-1 font-mono text-[10px] text-zinc-500">
                <Clock className="w-2.5 h-2.5" />
                {(displayDuration / 1000).toFixed(1)}s
              </span>
            )}
            {displayText && (
              <button
                type="button"
                onClick={() => onCopy(displayText, `${turn.id}-${colIdx}`)}
                className="text-zinc-500 hover:text-zinc-200 transition-colors p-0.5"
                title="Copy text"
              >
                {copiedKey === `${turn.id}-${colIdx}` ? (
                  <Check className="w-3 h-3 text-emerald-400" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* Response Text / Markdown */}
        {displayText ? (
          <MarkdownRenderer
            content={displayText}
            isStreaming={isTurnStreaming}
          />
        ) : isTurnStreaming ? (
          <div className="flex items-center gap-2 text-xs text-zinc-500 py-1.5">
            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
            <span>Generating response...</span>
          </div>
        ) : null}

        {/* Error Display */}
        {displayError && (
          <div className="rounded-lg p-2.5 bg-rose-950/20 border border-rose-800/40 text-rose-300 text-xs flex flex-col gap-1.5 mt-2">
            <div className="flex items-center gap-1.5 font-medium">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
              <span>Generation Error</span>
            </div>
            <p className="font-mono text-[11px] text-zinc-400 break-words">
              {displayError}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRetryClick}
              className="self-start mt-1 h-6 text-[11px] border-rose-800/60 hover:bg-rose-900/30 text-rose-200 gap-1 font-medium px-2"
            >
              <RotateCcw className="w-2.5 h-2.5" />
              Retry this model
            </Button>
          </div>
        )}
      </div>
    </div>
  );
});

export function TriArena() {
  const [providers, setProviders] = useState<ProviderMeta[]>([]);

  // 60FPS Transform-based Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isSidebarPinned, setIsSidebarPinned] = useState(true);
  const isAnimatingSidebarRef = useRef(false);

  // Resizable columns hook (CSS variables + rAF + zero state updates on pointermove)
  const {
    containerRef: columnsContainerRef,
    isDragging: isResizingColumns,
    activeHandle,
    ratios: columnRatios,
    startDragging: handleStartColumnResize,
    resetRatios: handleResetColumnRatios,
    handleKeyDown: handleColumnResizeKeyDown,
  } = useResizableColumns();

  // IndexedDB Sessions & Loading state
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>("");
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(true);

  // 3 Columns Live State
  const [columns, setColumns] = useState<[LiveColumnState, LiveColumnState, LiveColumnState]>([
    {
      provider: "groq",
      providerName: "Groq",
      selectedModel: "openai/gpt-oss-20b",
      streamingText: "",
      status: "idle",
      durationMs: 0,
    },
    {
      provider: "groq",
      providerName: "Groq",
      selectedModel: "qwen/qwen3.8-27b",
      streamingText: "",
      status: "idle",
      durationMs: 0,
    },
    {
      provider: "google",
      providerName: "Google AI Studio",
      selectedModel: "gemini-3.8-flash",
      streamingText: "",
      status: "idle",
      durationMs: 0,
    },
  ]);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const abortControllersRef = useRef<(AbortController | null)[]>([null, null, null]);
  const timerRefs = useRef<(number | null)[]>([null, null, null]);
  const startTimeRef = useRef<number[]>([0, 0, 0]);

  // Auto-scroll management refs & state
  const scrollContainersRef = useRef<(HTMLDivElement | null)[]>([null, null, null]);
  const isAtBottomRef = useRef<boolean[]>([true, true, true]);
  const bottomAnchorsRef = useRef<(HTMLDivElement | null)[]>([null, null, null]);
  const [showScrollDown, setShowScrollDown] = useState<[boolean, boolean, boolean]>([
    false,
    false,
    false,
  ]);

  // Load available models and initial sessions from IndexedDB
  useEffect(() => {
    async function init() {
      setIsSessionLoading(true);
      try {
        const res = await fetch("/api/models");
        let initialModels: [string, string, string] = [
          "openai/gpt-oss-20b",
          "qwen/qwen3.8-27b",
          "gemini-3.8-flash",
        ];

        if (res.ok) {
          const data = await res.json();
          if (data.providers) {
            setProviders(data.providers);

            const groq = data.providers.find((p: ProviderMeta) => p.id === "groq");
            const google = data.providers.find((p: ProviderMeta) => p.id === "google");

            initialModels = [
              groq?.models?.find((m: ModelOption) => m.id === "openai/gpt-oss-20b")?.id ||
                groq?.models?.[0]?.id ||
                "openai/gpt-oss-20b",
              groq?.models?.find((m: ModelOption) => m.id === "qwen/qwen3.8-27b")?.id ||
                groq?.models?.[1]?.id ||
                "qwen/qwen3.8-27b",
              google?.models?.find((m: ModelOption) => m.id === "gemini-3.8-flash")?.id ||
                google?.models?.[0]?.id ||
                "gemini-3.8-flash",
            ];

            setColumns((prev) => [
              { ...prev[0], selectedModel: initialModels[0] },
              { ...prev[1], selectedModel: initialModels[1] },
              { ...prev[2], selectedModel: initialModels[2] },
            ]);
          }
        }

        const storedSessions = await getAllSessions();
        setSessions(storedSessions);

        if (storedSessions.length > 0) {
          const latest = storedSessions[0];
          setCurrentSessionId(latest.id);
          setCurrentSession(latest);
          setColumns((prev) => [
            { ...prev[0], selectedModel: latest.columnModels?.[0] || prev[0].selectedModel },
            { ...prev[1], selectedModel: latest.columnModels?.[1] || prev[1].selectedModel },
            { ...prev[2], selectedModel: latest.columnModels?.[2] || prev[2].selectedModel },
          ]);
        } else {
          const newSession = createEmptySession(initialModels);
          await saveSession(newSession);
          setSessions([newSession]);
          setCurrentSessionId(newSession.id);
          setCurrentSession(newSession);
        }
      } catch (e) {
        console.error("Initialization error:", e);
      } finally {
        setIsSessionLoading(false);
      }
    }
    init();
  }, []);

  const updateSession = useCallback(async (updated: ChatSession) => {
    setCurrentSession(updated);
    setSessions((prev) =>
      prev.map((s) => (s.id === updated.id ? updated : s)).sort((a, b) => b.updatedAt - a.updatedAt)
    );
    await saveSession(updated);
  }, []);

  // Dynamically update browser tab title based on open chat session
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (currentSession?.title && currentSession.title !== "New Conversation") {
      document.title = `${currentSession.title} — AI Tri-Arena`;
    } else {
      document.title = "AI Tri-Arena — 3-Model Live Comparison";
    }
  }, [currentSession?.title]);

  const handleNewChat = useCallback(async () => {
    abortControllersRef.current.forEach((c) => c?.abort());

    const activeModels: [string, string, string] = [
      columns[0].selectedModel,
      columns[1].selectedModel,
      columns[2].selectedModel,
    ];

    const newSess = createEmptySession(activeModels);
    await saveSession(newSess);
    setSessions((prev) => [newSess, ...prev]);
    setCurrentSessionId(newSess.id);
    setCurrentSession(newSess);

    setColumns((prev) =>
      prev.map((c) => ({
        ...c,
        streamingText: "",
        status: "idle",
        error: undefined,
        durationMs: 0,
      })) as [LiveColumnState, LiveColumnState, LiveColumnState]
    );

    toast.success("Started new conversation");
  }, [columns]);

  const handleSelectSession = useCallback(
    async (session: ChatSession) => {
      if (session.id === currentSessionId && !isSessionLoading) return;

      abortControllersRef.current.forEach((c) => c?.abort());
      setIsSessionLoading(true);

      await new Promise((resolve) => setTimeout(resolve, 150));

      setCurrentSessionId(session.id);
      setCurrentSession(session);

      if (session.columnModels) {
        setColumns((prev) => [
          { ...prev[0], selectedModel: session.columnModels[0] || prev[0].selectedModel },
          { ...prev[1], selectedModel: session.columnModels[1] || prev[1].selectedModel },
          { ...prev[2], selectedModel: session.columnModels[2] || prev[2].selectedModel },
        ]);
      }

      setColumns((prev) =>
        prev.map((c) => ({
          ...c,
          streamingText: "",
          status: "idle",
          error: undefined,
          durationMs: 0,
        })) as [LiveColumnState, LiveColumnState, LiveColumnState]
      );

      setIsSessionLoading(false);
    },
    [currentSessionId, isSessionLoading]
  );

  const handleDeleteSession = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      await deleteSession(id);
      const remaining = sessions.filter((s) => s.id !== id);
      setSessions(remaining);

      if (id === currentSessionId) {
        if (remaining.length > 0) {
          handleSelectSession(remaining[0]);
        } else {
          handleNewChat();
        }
      }
      toast.info("Conversation deleted");
    },
    [sessions, currentSessionId, handleSelectSession, handleNewChat]
  );

  const handleClearAllIndexedDB = useCallback(async () => {
    if (!window.confirm("Are you sure you want to clear all conversations from IndexedDB?")) {
      return;
    }

    abortControllersRef.current.forEach((c) => c?.abort());
    await clearAllSessions();

    const initialModels: [string, string, string] = [
      columns[0].selectedModel,
      columns[1].selectedModel,
      columns[2].selectedModel,
    ];

    const fresh = createEmptySession(initialModels);
    await saveSession(fresh);
    setSessions([fresh]);
    setCurrentSessionId(fresh.id);
    setCurrentSession(fresh);

    setColumns((prev) =>
      prev.map((c) => ({
        ...c,
        streamingText: "",
        status: "idle",
        error: undefined,
        durationMs: 0,
      })) as [LiveColumnState, LiveColumnState, LiveColumnState]
    );

    toast.success("IndexedDB history cleared");
  }, [columns]);

  const isAnyStreaming = columns.some((col) => col.status === "streaming");

  const handleStopAll = useCallback(() => {
    abortControllersRef.current.forEach((controller, idx) => {
      if (controller) {
        controller.abort();
        abortControllersRef.current[idx] = null;
      }
      if (timerRefs.current[idx]) {
        window.clearInterval(timerRefs.current[idx]!);
        timerRefs.current[idx] = null;
      }
    });

    setColumns((prev) =>
      prev.map((col) =>
        col.status === "streaming" ? { ...col, status: "completed" } : col
      ) as [LiveColumnState, LiveColumnState, LiveColumnState]
    );
  }, []);

  // Avoid layout thrashing during animation
  const handleColumnScroll = useCallback((colIdx: number) => {
    if (isAnimatingSidebarRef.current) return;
    const el = scrollContainersRef.current[colIdx];
    if (!el) return;
    const isScrollable = el.scrollHeight - el.clientHeight > 20;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    isAtBottomRef.current[colIdx] = atBottom;

    const shouldShow = isScrollable && !atBottom;
    setShowScrollDown((prev) => {
      if (prev[colIdx] === shouldShow) return prev;
      const next = [...prev] as [boolean, boolean, boolean];
      next[colIdx] = shouldShow;
      return next;
    });
  }, []);

  const scrollToBottomIfPinned = useCallback((colIdx: number) => {
    if (isAnimatingSidebarRef.current) return;
    if (isAtBottomRef.current[colIdx]) {
      const anchor = bottomAnchorsRef.current[colIdx];
      if (anchor) {
        anchor.scrollIntoView({ behavior: "instant", block: "end" });
      }
    }
  }, []);

  const handleScrollToBottomExplicit = useCallback((colIdx: number) => {
    const el = scrollContainersRef.current[colIdx];
    if (el) {
      const start = el.scrollTop;
      const target = el.scrollHeight - el.clientHeight;
      const distance = target - start;

      if (distance <= 0) {
        el.scrollTop = target;
      } else {
        const duration = 180; // Fast, snappy scroll in ms
        const startTime = performance.now();

        const step = (now: number) => {
          const elapsed = now - startTime;
          const progress = Math.min(elapsed / duration, 1);
          // Ease-out cubic: 1 - (1 - t)^3
          const easeOut = 1 - Math.pow(1 - progress, 3);
          el.scrollTop = start + distance * easeOut;

          if (progress < 1) {
            requestAnimationFrame(step);
          } else {
            el.scrollTop = target;
          }
        };

        requestAnimationFrame(step);
      }
    }
    isAtBottomRef.current[colIdx] = true;
    setShowScrollDown((prev) => {
      if (!prev[colIdx]) return prev;
      const next = [...prev] as [boolean, boolean, boolean];
      next[colIdx] = false;
      return next;
    });
  }, []);

  // Sidebar toggle with zero layout-thrashing
  const handleToggleSidebar = useCallback(() => {
    isAnimatingSidebarRef.current = true;
    setSidebarOpen((prev) => {
      const next = !prev;
      if (next) {
        setIsSidebarPinned(true);
      }
      return next;
    });
  }, []);

  const handleSidebarTransitionEnd = useCallback(() => {
    isAnimatingSidebarRef.current = false;
    setIsSidebarPinned(sidebarOpen);
  }, [sidebarOpen]);

  const buildMessagesForColumn = useCallback(
    (colIdx: number, newPrompt: string, activeSession: ChatSession) => {
      const messages: { role: "user" | "assistant"; content: string }[] = [];

      for (const turn of activeSession.turns) {
        if (turn.prompt) {
          messages.push({ role: "user", content: turn.prompt });
        }
        const colResp = turn.columnResponses[colIdx];
        if (colResp && colResp.text && !colResp.error) {
          messages.push({ role: "assistant", content: colResp.text });
        }
      }

      messages.push({ role: "user", content: newPrompt });
      return messages;
    },
    []
  );

  // Stream single column with requestAnimationFrame token buffering
  const runColumnStream = useCallback(
    async (
      colIdx: number,
      promptText: string,
      targetSession: ChatSession,
      turnId: string,
      modelOverride?: string
    ) => {
      const col = columns[colIdx];
      const modelToUse = modelOverride || col.selectedModel;

      if (abortControllersRef.current[colIdx]) {
        abortControllersRef.current[colIdx]!.abort();
      }
      if (timerRefs.current[colIdx]) {
        window.clearInterval(timerRefs.current[colIdx]!);
      }

      const controller = new AbortController();
      abortControllersRef.current[colIdx] = controller;

      setColumns((prev) => {
        const next = [...prev] as [LiveColumnState, LiveColumnState, LiveColumnState];
        next[colIdx] = {
          ...next[colIdx],
          streamingText: "",
          status: "streaming",
          error: undefined,
          durationMs: 0,
          selectedModel: modelToUse,
        };
        return next;
      });

      isAtBottomRef.current[colIdx] = true;
      setTimeout(() => scrollToBottomIfPinned(colIdx), 50);

      startTimeRef.current[colIdx] = Date.now();
      timerRefs.current[colIdx] = window.setInterval(() => {
        setColumns((prev) => {
          const next = [...prev] as [LiveColumnState, LiveColumnState, LiveColumnState];
          if (next[colIdx].status === "streaming") {
            next[colIdx] = {
              ...next[colIdx],
              durationMs: Date.now() - startTimeRef.current[colIdx],
            };
          }
          return next;
        });
      }, 100);

      const conversationMessages = buildMessagesForColumn(colIdx, promptText, targetSession);

      let accumulatedText = "";
      let errorOccurred: string | undefined;

      // RAF throttling for smooth 60fps streaming
      let rafId: number | null = null;
      const scheduleFlush = () => {
        if (rafId !== null) return;
        rafId = requestAnimationFrame(() => {
          rafId = null;
          setColumns((prev) => {
            const next = [...prev] as [LiveColumnState, LiveColumnState, LiveColumnState];
            next[colIdx] = {
              ...next[colIdx],
              streamingText: accumulatedText,
            };
            return next;
          });
          scrollToBottomIfPinned(colIdx);
        });
      };

      try {
        const res = await fetch("/api/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: col.provider,
            model: modelToUse,
            messages: conversationMessages,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({ error: "Request failed" }));
          throw new Error(errData.error || `HTTP ${res.status}`);
        }

        if (!res.body) {
          throw new Error("No response body received");
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
              const event = JSON.parse(payload);
              if (event.type === "chunk" && event.text) {
                accumulatedText += event.text;
                scheduleFlush();
              } else if (event.type === "error") {
                throw new Error(event.error || "Unknown stream error");
              }
            } catch (err: unknown) {
              if (err instanceof Error && err.message !== "Unexpected end of JSON input") {
                throw err;
              }
            }
          }
        }

        if (rafId !== null) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }

        setColumns((prev) => {
          const next = [...prev] as [LiveColumnState, LiveColumnState, LiveColumnState];
          next[colIdx] = {
            ...next[colIdx],
            streamingText: accumulatedText,
            status: "completed",
            durationMs: Date.now() - startTimeRef.current[colIdx],
          };
          return next;
        });
      } catch (err: unknown) {
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }

        if (err instanceof DOMException && err.name === "AbortError") {
          setColumns((prev) => {
            const next = [...prev] as [LiveColumnState, LiveColumnState, LiveColumnState];
            next[colIdx] = { ...next[colIdx], status: "completed" };
            return next;
          });
        } else {
          errorOccurred = err instanceof Error ? err.message : "Error occurred";
          setColumns((prev) => {
            const next = [...prev] as [LiveColumnState, LiveColumnState, LiveColumnState];
            next[colIdx] = {
              ...next[colIdx],
              status: "error",
              error: errorOccurred,
              durationMs: Date.now() - startTimeRef.current[colIdx],
            };
            return next;
          });
        }
      } finally {
        if (timerRefs.current[colIdx]) {
          window.clearInterval(timerRefs.current[colIdx]!);
          timerRefs.current[colIdx] = null;
        }
        abortControllersRef.current[colIdx] = null;

        const duration = Date.now() - startTimeRef.current[colIdx];
        setCurrentSession((latest) => {
          if (!latest) return null;
          const updatedTurns = latest.turns.map((t) => {
            if (t.id === turnId) {
              const responses = [...t.columnResponses] as [TurnResponse, TurnResponse, TurnResponse];
              responses[colIdx] = {
                model: modelToUse,
                text: accumulatedText,
                error: errorOccurred,
                durationMs: duration,
              };
              return { ...t, columnResponses: responses };
            }
            return t;
          });

          const updatedSession: ChatSession = {
            ...latest,
            updatedAt: Date.now(),
            turns: updatedTurns,
          };
          saveSession(updatedSession);
          setSessions((prev) =>
            prev.map((s) => (s.id === updatedSession.id ? updatedSession : s))
          );
          return updatedSession;
        });
      }
    },
    [columns, buildMessagesForColumn, scrollToBottomIfPinned]
  );

  const handlePromptSubmit = useCallback(
    async (submittedPrompt: string) => {
      if (!submittedPrompt || isAnyStreaming || !currentSession) return;

      const turnId = crypto.randomUUID();
      const newTurn: ChatTurn = {
        id: turnId,
        prompt: submittedPrompt,
        timestamp: Date.now(),
        columnResponses: [
          { model: columns[0].selectedModel, text: "", durationMs: 0 },
          { model: columns[1].selectedModel, text: "", durationMs: 0 },
          { model: columns[2].selectedModel, text: "", durationMs: 0 },
        ],
      };

      const newTitle =
        currentSession.turns.length === 0
          ? submittedPrompt.slice(0, 32) + (submittedPrompt.length > 32 ? "..." : "")
          : currentSession.title;

      const updatedSession: ChatSession = {
        ...currentSession,
        title: newTitle,
        updatedAt: Date.now(),
        columnModels: [
          columns[0].selectedModel,
          columns[1].selectedModel,
          columns[2].selectedModel,
        ],
        turns: [...currentSession.turns, newTurn],
      };

      await updateSession(updatedSession);

      runColumnStream(0, submittedPrompt, currentSession, turnId);
      runColumnStream(1, submittedPrompt, currentSession, turnId);
      runColumnStream(2, submittedPrompt, currentSession, turnId);
    },
    [isAnyStreaming, currentSession, columns, updateSession, runColumnStream]
  );

  const handleAskSingle = useCallback(
    (colIdx: number) => {
      if (!currentSession || currentSession.turns.length === 0) {
        toast.info("No prompt to re-run. Please send a message first.");
        return;
      }

      const lastTurn = currentSession.turns[currentSession.turns.length - 1];
      const promptToUse = lastTurn.prompt;
      const targetTurnId = lastTurn.id;

      runColumnStream(colIdx, promptToUse, currentSession, targetTurnId);
    },
    [currentSession, runColumnStream]
  );

  const handleCopyText = useCallback(async (text: string, key: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      toast.success("Copied response to clipboard");
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  }, []);

  const getModelsForProvider = (providerId: "groq" | "google") => {
    const p = providers.find((item) => item.id === providerId);
    if (!p || p.models.length === 0) {
      if (providerId === "groq") {
        return [
          { id: "openai/gpt-oss-20b", displayName: "GPT-OSS 20B" },
          { id: "openai/gpt-oss-120b", displayName: "GPT-OSS 120B" },
          { id: "qwen/qwen3.8-27b", displayName: "Qwen 3.8 27B" },
          { id: "allam-2-7b", displayName: "ALLaM 2 7B" },
        ];
      }
      return [
        { id: "gemini-3.5-flash", displayName: "Gemini 3.5 Flash" },
        { id: "gemini-3.6-flash", displayName: "Gemini 3.6 Flash" },
        { id: "gemini-3.8-flash", displayName: "Gemini 3.8 Flash" },
        { id: "gemini-4-argon", displayName: "Gemini 4 Argon" },
        { id: "gemini-3.5-flash-lite", displayName: "Gemini 3.5 Flash-Lite" },
      ];
    }
    return p.models;
  };

  const groqConfigured = providers.find((p) => p.id === "groq")?.configured ?? false;
  const googleConfigured = providers.find((p) => p.id === "google")?.configured ?? false;

  return (
    <div className="relative flex h-screen w-full bg-zinc-950 text-zinc-100 overflow-hidden font-sans">
      {/* 
        STEP 1 FIX: GPU-accelerated translateX sidebar.
        Sidebar is fixed and translates on the compositor thread.
        Zero layout thrashing and respects prefers-reduced-motion.
      */}
      <aside
        onTransitionEnd={handleSidebarTransitionEnd}
        className={`fixed top-0 bottom-0 left-0 w-64 z-30 flex flex-col bg-zinc-900/95 border-r border-zinc-800/80 transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none will-change-transform ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="w-64 h-full flex flex-col shrink-0 overflow-hidden">
          {/* Sidebar Header */}
          <div className="flex-none p-3 border-b border-zinc-800/80 flex items-center justify-between gap-1.5">
            <Button
              onClick={handleNewChat}
              className="flex-1 justify-start gap-2 h-9 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-600/30"
            >
              <Plus className="w-4 h-4" />
              New Chat
            </Button>
            <Tooltip>
              <TooltipTrigger>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleToggleSidebar}
                  className="w-8 h-8 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                >
                  <PanelLeftClose className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">
                Close sidebar
              </TooltipContent>
            </Tooltip>
          </div>

          {/* History List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
            <div className="px-2 py-1 text-[11px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <History className="w-3.5 h-3.5" />
                Saved Chats
              </span>
              <span className="text-[10px] font-mono text-zinc-600">
                {sessions.length}
              </span>
            </div>

            {sessions.length === 0 ? (
              <div className="p-4 text-center text-xs text-zinc-500 select-none">
                No conversations yet.
              </div>
            ) : (
              sessions.map((sess) => {
                const isActive = sess.id === currentSessionId;
                return (
                  <div
                    key={sess.id}
                    onClick={() => handleSelectSession(sess)}
                    className={`group flex items-center justify-between px-2.5 py-2 rounded-lg text-xs cursor-pointer transition-all ${
                      isActive
                        ? "bg-zinc-800 text-zinc-100 font-medium border border-zinc-700/60 shadow-sm"
                        : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 border border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <MessageSquare
                        className={`w-3.5 h-3.5 shrink-0 ${
                          isActive ? "text-indigo-400" : "text-zinc-500"
                        }`}
                      />
                      <div className="truncate text-left">
                        <div className="truncate">{sess.title}</div>
                        <div className="text-[10px] text-zinc-500 font-normal">
                          {sess.turns.length} {sess.turns.length === 1 ? "turn" : "turns"}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => handleDeleteSession(sess.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:text-rose-400 text-zinc-500 transition-opacity rounded"
                      title="Delete chat"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Sidebar Footer */}
          <div className="flex-none p-3 border-t border-zinc-800/80 bg-zinc-950/40 text-[11px] text-zinc-500 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Database className="w-3 h-3 text-indigo-400" />
              IndexedDB Local
            </span>
            <span className="text-[10px] text-zinc-600">Context Active</span>
          </div>
        </div>
      </aside>

      {/* 
        Main App Container:
        Offset is updated cleanly without per-frame reflow thrashing.
      */}
      <div
        className={`flex-1 flex flex-col min-w-0 overflow-hidden transition-[padding-left] duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none ${
          isSidebarPinned ? "pl-64" : "pl-0"
        }`}
      >
        {/* Top Header Bar */}
        <header className="flex-none flex items-center justify-between px-5 py-3 border-b border-zinc-800/80 bg-zinc-900/60 backdrop-blur-md z-10">
          <div className="flex items-center gap-3 min-w-0">
            {!sidebarOpen && (
              <Tooltip>
                <TooltipTrigger>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleToggleSidebar}
                    className="w-8 h-8 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg"
                  >
                    <PanelLeft className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  Open history sidebar
                </TooltipContent>
              </Tooltip>
            )}

            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-500 to-indigo-500 shadow-sm shadow-indigo-500/20 shrink-0">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-sm font-semibold tracking-tight text-zinc-100 truncate">
                    {currentSession?.title || "AI Tri-Arena"}
                  </h1>
                  <Badge
                    variant="outline"
                    className="hidden sm:inline-flex text-[10px] font-mono px-1.5 py-0 border-zinc-700 bg-zinc-800/50 text-zinc-300"
                  >
                    Multi-Turn Context
                  </Badge>
                </div>
                <p className="text-[11px] text-zinc-400 truncate">
                  3-Way live comparison (2 Groq + 1 Google AI Studio)
                </p>
              </div>
            </div>
          </div>

          {/* Top Actions: Provider Badges + Clear IndexedDB */}
          <div className="flex items-center gap-2.5">
            <div className="hidden md:flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs bg-zinc-800/60 border border-zinc-700/60">
                <span
                  className={`w-2 h-2 rounded-full ${
                    groqConfigured ? "bg-emerald-400 animate-pulse" : "bg-amber-500"
                  }`}
                />
                <span className="text-zinc-300 text-xs font-medium">Groq</span>
              </div>

              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs bg-zinc-800/60 border border-zinc-700/60">
                <span
                  className={`w-2 h-2 rounded-full ${
                    googleConfigured ? "bg-emerald-400 animate-pulse" : "bg-amber-500"
                  }`}
                />
                <span className="text-zinc-300 text-xs font-medium">Google AI</span>
              </div>
            </div>

            <Tooltip>
              <TooltipTrigger>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearAllIndexedDB}
                  className="h-8 text-xs border-zinc-700/80 hover:border-rose-700/80 hover:bg-rose-950/20 text-zinc-300 hover:text-rose-300 gap-1.5 px-2.5 font-medium"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear IndexedDB</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Wipe all saved conversation history from IndexedDB
              </TooltipContent>
            </Tooltip>
          </div>
        </header>

        {/* 
          Main 3-Column Arena Layout:
          Driven by CSS variables (--col-0, --col-1, --col-2) via useResizableColumns.
          Columns have CSS containment [contain:layout_paint_style] to isolate reflows!
        */}
        <main
          ref={columnsContainerRef}
          style={{
            gridTemplateColumns:
              "var(--col-0, 1fr) auto var(--col-1, 1fr) auto var(--col-2, 1fr)",
          }}
          className={`flex-1 min-h-0 p-3.5 grid gap-2 overflow-hidden ${
            isResizingColumns ? "select-none" : ""
          }`}
        >
          {columns.map((col, idx) => {
            const isGroq = col.provider === "groq";
            const availableModels = getModelsForProvider(col.provider);
            const turns = currentSession?.turns || [];
            const hasTurns = turns.length > 0;
            const isStreaming = col.status === "streaming";

            return (
              <React.Fragment key={idx}>
                {idx > 0 && (
                  <ColumnResizer
                    index={idx - 1}
                    isActive={activeHandle === idx - 1}
                    ariaValueNow={columnRatios[idx - 1] * 100}
                    onPointerDown={(e) => handleStartColumnResize(idx - 1, e)}
                    onDoubleClick={handleResetColumnRatios}
                    onKeyDown={(e) => handleColumnResizeKeyDown(idx - 1, e)}
                  />
                )}

                <div
                  className={`relative flex flex-col h-full bg-zinc-900/40 border border-zinc-800/90 rounded-xl overflow-hidden shadow-sm backdrop-blur-sm [contain:layout_paint_style] transition-colors duration-150 min-w-0 ${
                    isResizingColumns ? "pointer-events-none select-none" : ""
                  } ${
                    isStreaming ? "border-indigo-500/50 ring-1 ring-indigo-500/20" : ""
                  }`}
                >
                {/* Column Header */}
                <div className="flex-none px-3.5 py-2.5 border-b border-zinc-800/80 bg-zinc-900/80 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge
                      variant="outline"
                      className={`text-[11px] font-semibold tracking-wide shrink-0 ${
                        isGroq
                          ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                          : "border-blue-500/40 bg-blue-500/10 text-blue-400"
                      }`}
                    >
                      {isGroq ? `Col ${idx + 1}: Groq` : `Col 3: Google`}
                    </Badge>

                    {/* Model Selector Dropdown */}
                    <select
                      value={col.selectedModel}
                      disabled={isStreaming}
                      onChange={(e) => {
                        const newModel = e.target.value;
                        setColumns((prev) => {
                          const next = [...prev] as [
                            LiveColumnState,
                            LiveColumnState,
                            LiveColumnState
                          ];
                          next[idx] = { ...next[idx], selectedModel: newModel };
                          return next;
                        });
                        if (currentSession) {
                          const models = [...currentSession.columnModels] as [
                            string,
                            string,
                            string
                          ];
                          models[idx] = newModel;
                          updateSession({ ...currentSession, columnModels: models });
                        }
                      }}
                      className="bg-zinc-800/80 border border-zinc-700/60 rounded px-2 py-0.5 text-xs text-zinc-200 font-medium focus:outline-none focus:ring-1 focus:ring-zinc-500 truncate cursor-pointer disabled:opacity-50"
                    >
                      {availableModels.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.displayName}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Header Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isStreaming && (
                      <div className="flex items-center gap-1 text-[11px] text-indigo-400 font-mono">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-ping" />
                        <span>{(col.durationMs / 1000).toFixed(1)}s</span>
                      </div>
                    )}

                    {col.status === "error" && (
                      <Badge variant="destructive" className="text-[10px] py-0 px-1.5">
                        Failed
                      </Badge>
                    )}

                    {hasTurns && (
                      <Tooltip>
                        <TooltipTrigger>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isStreaming}
                            onClick={() => handleAskSingle(idx)}
                            className="h-7 px-2 text-xs font-medium border-zinc-700/80 hover:border-indigo-500/70 hover:text-indigo-300 hover:bg-indigo-500/10 rounded flex items-center gap-1.5 transition-colors disabled:opacity-40"
                          >
                            <RotateCcw
                              className={`w-3 h-3 ${isStreaming ? "animate-spin" : ""}`}
                            />
                            <span className="hidden lg:inline text-[11px]">Ask again</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">
                          Re-run only this model with conversational context
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </div>

                {/* Column Body: Scrollable Multi-Turn Transcript */}
                <div
                  ref={(el) => {
                    scrollContainersRef.current[idx] = el;
                  }}
                  onScroll={() => handleColumnScroll(idx)}
                  className="flex-1 min-h-0 p-3.5 overflow-y-auto space-y-4 text-sm leading-relaxed custom-scrollbar"
                >
                  {isSessionLoading ? (
                    <div className="h-full flex flex-col items-center justify-center gap-3 p-6 select-none animate-in fade-in duration-200">
                      <div className="relative flex items-center justify-center w-10 h-10">
                        <div className="absolute inset-0 rounded-full border-2 border-indigo-500/20 animate-ping" />
                        <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
                      </div>
                      <div className="text-center space-y-1">
                        <p className="text-xs font-medium text-zinc-300">Loading conversation...</p>
                        <p className="text-[10px] text-zinc-500 font-mono">Restoring from IndexedDB</p>
                      </div>
                    </div>
                  ) : !hasTurns && col.status === "idle" ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-500 select-none">
                      <div className="w-10 h-10 rounded-full bg-zinc-800/50 flex items-center justify-center mb-3 text-zinc-600">
                        <Cpu className="w-5 h-5" />
                      </div>
                      <p className="text-xs font-medium text-zinc-400">
                        Waiting for prompt
                      </p>
                      <p className="text-[11px] text-zinc-600 mt-1 max-w-[200px]">
                        Multi-turn chat active for {col.selectedModel}
                      </p>
                    </div>
                  ) : (
                    turns.map((turn, tIdx) => {
                      const isLastTurn = tIdx === turns.length - 1;
                      const isTurnStreaming = isLastTurn && isStreaming;

                      return (
                        <TurnItem
                          key={turn.id}
                          turn={turn}
                          colIdx={idx}
                          colModel={col.selectedModel}
                          isTurnStreaming={isTurnStreaming}
                          streamingText={col.streamingText}
                          streamingError={col.error}
                          streamingDuration={col.durationMs}
                          copiedKey={copiedKey}
                          onCopy={handleCopyText}
                          onRetry={handleAskSingle}
                        />
                      );
                    })
                  )}

                  <div
                    ref={(el) => {
                      bottomAnchorsRef.current[idx] = el;
                    }}
                    className="h-px w-full"
                  />
                </div>

                {/* Floating Scroll to Bottom Button */}
                {showScrollDown[idx] && (
                  <button
                    type="button"
                    onClick={() => handleScrollToBottomExplicit(idx)}
                    aria-label={`Scroll column ${idx + 1} to bottom`}
                    title="Scroll to bottom"
                    className="absolute left-1/2 -translate-x-1/2 bottom-10 z-20 w-8 h-8 rounded-full bg-zinc-800/90 hover:bg-zinc-750 text-zinc-200 hover:text-white border border-zinc-700/80 shadow-lg shadow-black/40 backdrop-blur-md flex items-center justify-center transition-all duration-150 animate-in fade-in zoom-in-90 hover:scale-105 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-450"
                  >
                    <ArrowDown className="w-4 h-4 stroke-[2.25]" />
                  </button>
                )}

                {/* Column Footer Info */}
                <div className="flex-none px-3.5 py-1.5 border-t border-zinc-800/60 bg-zinc-900/40 flex items-center justify-between text-[11px] text-zinc-500">
                  <span className="truncate max-w-[150px] font-mono text-[10px]">
                    {col.selectedModel}
                  </span>
                  <span className="text-[10px]">
                    {isStreaming
                      ? "Streaming..."
                      : turns.length > 0
                      ? `${turns.length} ${turns.length === 1 ? "turn" : "turns"}`
                      : "Ready"}
                  </span>
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </main>

        {/* 
          ISOLATED PROMPT BAR:
          Zero re-renders on keystrokes across the rest of the application!
        */}
        <PromptInputBar
          onSubmit={handlePromptSubmit}
          onStop={handleStopAll}
          isStreaming={isAnyStreaming}
        />
      </div>
    </div>
  );
}
