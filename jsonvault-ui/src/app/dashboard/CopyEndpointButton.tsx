"use client";

import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  KeyRound,
  Link2,
  Plug,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ConnectPanel } from "@/components/ConnectPanel";

export default function CopyEndpointButton({
  text,
  database,
  apiBaseUrl,
}: {
  text: string;
  database: string;
  apiBaseUrl: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function copyUrl() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  const truncated = text.length > 42 ? `${text.slice(0, 42)}…` : text;

  return (
    <>
      <div ref={ref} className="relative shrink-0">
        {/* Single compact trigger */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 text-[12px] font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 hover:text-zinc-950 dark:border-white/10 dark:bg-[#161616] dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"
        >
          {copied ? "Copied" : "Copy"}
          <ChevronDown
            size={11}
            className={`ml-0.5 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>

        {/* Dropdown */}
        {open && (
          <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-[300px] overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-white/10 dark:bg-[#1c1c1c]">
            {/* Project URL row */}
            <button
              type="button"
              onClick={copyUrl}
              className="group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-white/5"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400">
                <Link2 size={14} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
                  Project URL
                </p>
                <p className="mt-0.5 truncate font-mono text-[11px] text-zinc-400">
                  {truncated}
                </p>
              </div>
              <div className="shrink-0 text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100">
                {copied ? (
                  <Check size={13} className="text-emerald-500" />
                ) : (
                  <Copy size={13} />
                )}
              </div>
            </button>

            <div className="border-t border-zinc-100 dark:border-white/5" />

            {/* API Keys row */}
            <Link
              href="/dashboard/keys"
              onClick={() => setOpen(false)}
              className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-zinc-50 dark:hover:bg-white/5"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400">
                <KeyRound size={14} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
                  API Keys
                </p>
                <p className="mt-0.5 text-[11px] text-zinc-400">
                  Generate or manage project keys
                </p>
              </div>
              <ExternalLink
                size={12}
                className="shrink-0 text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100"
              />
            </Link>

            <div className="border-t border-zinc-100 dark:border-white/5" />

            {/* Get Connected CTA */}
            <div className="px-3 py-2.5">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setConnectOpen(true);
                }}
                className="flex w-full items-center justify-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 py-2 text-center text-[12px] font-medium text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-100 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300 dark:hover:bg-white/10"
              >
                <Plug size={12} className="text-zinc-500" />
                Get Connected
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Connect Panel */}
      <ConnectPanel
        database={database}
        isOpen={connectOpen}
        apiUrl={apiBaseUrl}
        onClose={() => setConnectOpen(false)}
      />
    </>
  );
}
