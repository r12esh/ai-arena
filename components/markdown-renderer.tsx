"use client";

import React, { useState, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy, Terminal } from "lucide-react";
import { toast } from "sonner";
import hljs from "highlight.js";
import "highlight.js/styles/atom-one-dark.css";

interface MarkdownRendererProps {
  content: string;
  isStreaming?: boolean;
}

interface CodeBlockProps {
  language: string;
  code: string;
}

function CodeBlock({ language, code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  // Compute syntax-highlighted HTML using highlight.js
  const highlightedHtml = useMemo(() => {
    try {
      const cleanLang = (language || "").toLowerCase().trim();
      if (cleanLang && hljs.getLanguage(cleanLang)) {
        return hljs.highlight(code, {
          language: cleanLang,
          ignoreIllegals: true,
        }).value;
      }
      // Auto-detect if language is unspecified or not registered
      return hljs.highlightAuto(code).value;
    } catch {
      // Safe fallback if highlighting fails
      return code
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }
  }, [code, language]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success("Code copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy code");
    }
  };

  return (
    <div className="my-3 rounded-lg border border-zinc-800 bg-[#16161a] overflow-hidden shadow-sm">
      {/* Code Header Bar */}
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-[#1e1e24] border-b border-zinc-800/80 text-xs text-zinc-400 select-none">
        <div className="flex items-center gap-1.5 font-mono text-[11px] text-zinc-300 font-medium">
          <Terminal className="w-3.5 h-3.5 text-indigo-400" />
          <span>{language || "code"}</span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2 py-0.5 text-[11px] text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/70 rounded transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400 font-medium">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy code</span>
            </>
          )}
        </button>
      </div>

      {/* Code Content with Syntax Highlighting */}
      <pre className="p-3.5 overflow-x-auto text-[13px] font-mono leading-relaxed select-text custom-scrollbar bg-[#16161a]">
        <code
          className={`hljs ${language ? `language-${language}` : ""}`}
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        />
      </pre>
    </div>
  );
}

export const MarkdownRenderer = React.memo(function MarkdownRenderer({
  content,
  isStreaming,
}: MarkdownRendererProps) {
  return (
    <div className="text-zinc-200 text-sm leading-relaxed prose-invert break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || "");
            const isCodeBlock = match || String(children).includes("\n");

            if (isCodeBlock) {
              const codeText = String(children).replace(/\n$/, "");
              return (
                <CodeBlock
                  language={match ? match[1] : ""}
                  code={codeText}
                />
              );
            }

            // Inline code
            return (
              <code
                className="font-mono text-[12px] bg-zinc-800/90 text-amber-300 px-1.5 py-0.5 rounded border border-zinc-700/60 font-medium"
                {...props}
              >
                {children}
              </code>
            );
          },
          h1({ children }) {
            return (
              <h1 className="text-base font-bold text-zinc-100 mt-4 mb-2 pb-1 border-b border-zinc-800 first:mt-0">
                {children}
              </h1>
            );
          },
          h2({ children }) {
            return (
              <h2 className="text-[15px] font-semibold text-zinc-100 mt-3.5 mb-1.5 first:mt-0">
                {children}
              </h2>
            );
          },
          h3({ children }) {
            return (
              <h3 className="text-sm font-semibold text-zinc-200 mt-3 mb-1 first:mt-0">
                {children}
              </h3>
            );
          },
          p({ children }) {
            return <p className="my-2 leading-relaxed text-zinc-200 last:mb-0">{children}</p>;
          },
          ul({ children }) {
            return (
              <ul className="list-disc list-outside ml-4 my-2 space-y-1 text-zinc-300">
                {children}
              </ul>
            );
          },
          ol({ children }) {
            return (
              <ol className="list-decimal list-outside ml-4 my-2 space-y-1 text-zinc-300">
                {children}
              </ol>
            );
          },
          li({ children }) {
            return <li className="leading-relaxed">{children}</li>;
          },
          blockquote({ children }) {
            return (
              <blockquote className="border-l-2 border-indigo-500/70 pl-3 my-2 text-zinc-400 italic bg-zinc-900/40 py-1 rounded-r">
                {children}
              </blockquote>
            );
          },
          table({ children }) {
            return (
              <div className="overflow-x-auto my-3 border border-zinc-800 rounded-lg custom-scrollbar">
                <table className="w-full text-xs text-left border-collapse">
                  {children}
                </table>
              </div>
            );
          },
          thead({ children }) {
            return <thead className="bg-zinc-800/70 text-zinc-200 font-semibold">{children}</thead>;
          },
          tbody({ children }) {
            return <tbody className="divide-y divide-zinc-800/60">{children}</tbody>;
          },
          tr({ children }) {
            return <tr className="hover:bg-zinc-800/30 transition-colors">{children}</tr>;
          },
          th({ children }) {
            return <th className="px-3 py-2 border-b border-zinc-700 font-medium">{children}</th>;
          },
          td({ children }) {
            return <td className="px-3 py-2 text-zinc-300">{children}</td>;
          },
          hr() {
            return <hr className="my-4 border-zinc-800" />;
          },
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 transition-colors"
              >
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>

      {/* Live Blinking Streaming Cursor */}
      {isStreaming && (
        <span className="inline-block w-2 h-4 ml-0.5 bg-indigo-400 animate-pulse align-middle" />
      )}
    </div>
  );
});
