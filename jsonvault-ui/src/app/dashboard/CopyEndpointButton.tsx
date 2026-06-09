"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

export default function CopyEndpointButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copyEndpoint() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button
      type="button"
      aria-label="Copy API endpoint"
      onClick={copyEndpoint}
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 text-[12px] font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 hover:text-zinc-950 dark:border-white/10 dark:bg-[#161616] dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"
    >
      {copied ? (
        <Check size={13} className="text-emerald-500" />
      ) : (
        <Copy size={13} />
      )}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
