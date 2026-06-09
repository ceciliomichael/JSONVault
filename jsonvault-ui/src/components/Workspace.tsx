"use client";

import { Plus, Search, Table2 } from "lucide-react";
import Link from "next/link";
import type { MockCollection } from "@/lib/mock-dashboard-store";
import { PrimaryButton } from "./ui";

export function WorkspacePage({
  title,
  description,
  action,
  hideHeader = false,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  hideHeader?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="h-full min-w-0 overflow-hidden flex flex-col bg-white dark:bg-[#121212] animate-in fade-in duration-500">
      {!hideHeader && (
        <div className="h-16 shrink-0 flex items-center justify-between gap-4 px-6 border-b border-zinc-200 dark:border-white/5">
          <div className="min-w-0">
            <h1 className="text-[20px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              {title}
            </h1>
            {description && (
              <p className="text-[13px] text-zinc-500 mt-1 truncate">
                {description}
              </p>
            )}
          </div>
          {action}
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

export function WorkspaceTable({
  headings,
  children,
}: {
  headings: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="h-full min-w-0 max-w-full overflow-auto custom-scrollbar pb-16">
      <table className="min-w-max w-full text-[13px] text-left border-collapse">
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-zinc-200 dark:border-white/5 bg-zinc-50 dark:bg-[#1a1a1a]">
            {headings.map((heading) => (
              <th
                key={heading || "actions"}
                className="px-4 py-3 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider whitespace-nowrap border-r border-zinc-200 dark:border-white/5 last:border-r-0"
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 border-b border-zinc-100 dark:divide-white/5 dark:border-white/5">
          {children}
        </tbody>
      </table>
    </div>
  );
}

export function CollectionTabs({
  collections,
  selectedCollection,
  onSelect,
}: {
  collections: MockCollection[];
  selectedCollection: string;
  onSelect: (collection: string) => void;
}) {
  return (
    <div className="h-12 shrink-0 flex items-stretch overflow-x-auto overflow-y-hidden custom-scrollbar border-b border-zinc-200 dark:border-white/5 bg-zinc-50 dark:bg-[#161616]">
      {collections.slice(0, 4).map((collection) => {
        const active = collection.name === selectedCollection;
        return (
          <button
            key={collection.name}
            type="button"
            onClick={() => onSelect(collection.name)}
            className={`min-w-[180px] px-4 border-r border-zinc-200 dark:border-white/5 text-left text-[13px] font-medium transition-colors ${
              active
                ? "bg-white dark:bg-[#121212] text-zinc-900 dark:text-zinc-100 border-t-2 border-t-zinc-900 dark:border-t-zinc-100"
                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-white dark:hover:bg-[#121212]"
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <Table2 size={14} />
              {collection.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function CollectionPanel({
  title = "Table Editor",
  collections,
  selectedCollection,
  onSelect,
  search,
  onSearch,
}: {
  title?: string;
  collections: MockCollection[];
  selectedCollection: string;
  onSelect: (collection: string) => void;
  search: string;
  onSearch: (value: string) => void;
}) {
  const filtered = collections.filter((collection) =>
    collection.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <aside className="w-[260px] shrink-0 bg-white dark:bg-[#161616] border-r border-zinc-200 dark:border-white/5 flex flex-col overflow-hidden">
      <div className="px-4 py-4 border-b border-zinc-200 dark:border-white/5">
        <h2 className="text-[16px] font-semibold text-zinc-900 dark:text-zinc-100">
          {title}
        </h2>
        <div className="mt-4 h-9 px-3 rounded-md border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-[#121212] text-[13px] text-zinc-600 dark:text-zinc-300 flex items-center justify-between">
          schema public
        </div>
        <Link
          href="/dashboard/collections"
          className="mt-2 w-full h-9 px-3 rounded-md border border-zinc-200 dark:border-white/10 text-[13px] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors flex items-center gap-2"
        >
          <Plus size={14} />
          New collection
        </Link>
      </div>
      <div className="p-3">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
          />
          <input
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Search tables..."
            className="w-full pl-9 pr-3 py-2 rounded-md border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-[#121212] text-[13px] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar pt-2 pb-16">
        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-[12px] text-zinc-500">
            No matching tables.
          </div>
        ) : (
          filtered.map((collection) => {
            const active = collection.name === selectedCollection;
            return (
              <button
                key={collection.name}
                type="button"
                onClick={() => onSelect(collection.name)}
                className={`w-full h-9 px-4 grid grid-cols-[18px_1fr] items-center gap-2 text-left text-[13px] transition-colors ${
                  active
                    ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                    : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                }`}
              >
                <Table2 size={14} className="text-zinc-400" />
                <span className="truncate">{collection.name}</span>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}

export function ToolbarButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-9 px-3 rounded-md border border-zinc-200 dark:border-white/10 text-[13px] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
    >
      {children}
    </button>
  );
}

export function HeaderPrimaryButton({
  icon,
  children,
  onClick,
}: {
  icon?: React.ElementType;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <PrimaryButton icon={icon} onClick={onClick}>
      {children}
    </PrimaryButton>
  );
}
