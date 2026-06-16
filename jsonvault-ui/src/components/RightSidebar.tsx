"use client";

import { useState } from "react";
import { Check, FileText, MessageSquare, ThumbsUp, ThumbsDown, Download, Bot } from "lucide-react";

export function RightSidebar({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);
  const [copiedLLMs, setCopiedLLMs] = useState(false);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);

  const handleCopyMarkdown = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyLLMs = async () => {
    try {
      const res = await fetch('/llms.txt');
      if (!res.ok) throw new Error("Failed to fetch");
      const text = await res.text();
      navigator.clipboard.writeText(text);
      setCopiedLLMs(true);
      setTimeout(() => setCopiedLLMs(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDownloadLLMs = async () => {
    try {
      const res = await fetch('/llms.txt');
      if (!res.ok) throw new Error("Failed to fetch");
      const text = await res.text();
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'llms.txt';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="sticky top-24">
      <div className="mb-3 text-[12px] font-semibold text-zinc-900 dark:text-zinc-100">
        Is this helpful?
      </div>
      <div className="mb-8 flex gap-2">
        <button 
          onClick={() => setFeedback("down")}
          className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${feedback === "down" ? "border-red-500 bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400" : "border-zinc-200 text-zinc-500 hover:bg-zinc-50 hover:text-red-500 dark:border-zinc-800 dark:hover:bg-zinc-800"}`}
        >
          <ThumbsDown size={14} />
        </button>
        <button 
          onClick={() => setFeedback("up")}
          className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${feedback === "up" ? "border-emerald-500 bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" : "border-zinc-200 text-zinc-500 hover:bg-zinc-50 hover:text-emerald-500 dark:border-zinc-800 dark:hover:bg-zinc-800"}`}
        >
          <ThumbsUp size={14} />
        </button>
      </div>

      <div className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
        Resources
      </div>
      <div className="flex flex-col gap-3 text-[13px] text-zinc-500">
        <button
          onClick={handleCopyMarkdown}
          className="flex items-center gap-2 text-left hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors group"
        >
          {copied ? (
            <Check size={16} className="text-emerald-500" />
          ) : (
            <FileText size={16} className="text-zinc-400 group-hover:text-blue-500 transition-colors" />
          )}
          {copied ? "Copied to clipboard!" : "Copy Page Source"}
        </button>
        
        <button className="flex items-center gap-2 text-left hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors group">
          <MessageSquare size={16} className="text-zinc-400 group-hover:text-blue-500 transition-colors" />
          Provide Feedback
        </button>
      </div>

      <div className="mb-3 mt-8 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
        AI & LLMs
      </div>
      <div className="flex flex-col gap-3 text-[13px] text-zinc-500">
        <button
          onClick={handleCopyLLMs}
          className="flex items-center gap-2 text-left hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors group"
        >
          {copiedLLMs ? (
            <Check size={16} className="text-emerald-500" />
          ) : (
            <Bot size={16} className="text-zinc-400 group-hover:text-purple-500 transition-colors" />
          )}
          {copiedLLMs ? "Copied llms.txt!" : "Copy llms.txt"}
        </button>
        
        <button 
          onClick={handleDownloadLLMs}
          className="flex items-center gap-2 text-left hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors group"
        >
          <Download size={16} className="text-zinc-400 group-hover:text-purple-500 transition-colors" />
          Download llms.txt
        </button>
      </div>
    </div>
  );
}
