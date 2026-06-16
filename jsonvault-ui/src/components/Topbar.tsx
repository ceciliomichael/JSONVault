"use client";

import {
  Check,
  ChevronDown,
  CircleHelp,
  Database,
  Lightbulb,
  Plug,
  Search,
  Table2,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import { ConnectPanel } from "@/components/ConnectPanel";
import ProfileMenu from "@/components/ProfileMenu";
import { Badge, Dropdown, DropdownItem } from "./ui";

interface TopbarProps {
  databases?: string[];
  databaseLabels?: Record<string, string>;
  collections?: string[];
  selectedDb?: string;
  selectedCollection?: string;
  userEmail?: string;
  userName?: string;
  apiUrl?: string;
  onDbChange?: (db: string) => void;
  onCollectionChange?: (col: string) => void;
}

export default function Topbar({
  databases = [],
  databaseLabels = {},
  collections = [],
  selectedDb = "",
  selectedCollection = "",
  userEmail = "",
  userName = "",
  apiUrl = "",
  onDbChange,
  onCollectionChange,
}: TopbarProps) {
  const pathname = usePathname();
  const [projectQuery, setProjectQuery] = useState("");
  const [isConnectOpen, setIsConnectOpen] = useState(false);
  const segments = pathname.split("/").filter(Boolean);
  const currentSection = segments.length > 1 ? segments[1] : "overview";
  const selectedDbLabel = selectedDb
    ? (databaseLabels[selectedDb] ?? selectedDb)
    : "Project";
  const collectionScopedSections = new Set([
    "data",
    "indexes",
    "fts",
    "schemas",
    "webhooks",
    "realtime",
  ]);
  const showCollection =
    collections.length > 0 &&
    selectedDb &&
    collectionScopedSections.has(currentSection);
  const filteredDatabases = databases.filter((database) => {
    const label = databaseLabels[database] ?? database;
    const query = projectQuery.trim().toLowerCase();
    if (!query) return true;
    return `${label} ${database}`.toLowerCase().includes(query);
  });

  return (
    <header className="h-12 shrink-0 flex items-center justify-between gap-4 px-3 pr-4 bg-white dark:bg-[#121212] border-b border-zinc-200 dark:border-white/5">
      <div className="min-w-0 flex items-center gap-2">
        <BrandMark />
        <span className="text-zinc-300 dark:text-zinc-700">/</span>

        <Dropdown
          align="left"
          trigger={
            <button
              type="button"
              className="flex items-center gap-2 h-8 px-2 rounded-md text-[13px] font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              JSONVault
              <Badge variant="neutral">Free</Badge>
              <ChevronDown size={13} className="text-zinc-500" />
            </button>
          }
        >
          <DropdownItem>JSONVault Workspace</DropdownItem>
        </Dropdown>

        <span className="text-zinc-300 dark:text-zinc-700">/</span>

        {databases.length > 0 && (
          <Dropdown
            align="left"
            trigger={
              <button
                type="button"
                className="flex items-center gap-2 h-8 px-2 rounded-md text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                <Database size={14} className="text-zinc-500" />
                <span className="max-w-[260px] truncate">
                  {selectedDbLabel}
                </span>
                <ChevronDown size={13} className="text-zinc-500" />
              </button>
            }
          >
            <div className="w-[320px]">
              <div className="p-2 border-b border-zinc-200 dark:border-white/5">
                <div className="relative">
                  <Search
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
                  />
                  <input
                    type="search"
                    value={projectQuery}
                    onChange={(event) => setProjectQuery(event.target.value)}
                    placeholder="Search projects..."
                    className="w-full pl-9 pr-3 py-2 rounded-md border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-[#121212] text-[13px] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-600"
                  />
                </div>
              </div>
              <div className="max-h-72 overflow-y-auto py-1 custom-scrollbar">
                {filteredDatabases.length === 0 ? (
                  <div className="px-3 py-3 text-[13px] text-zinc-500">
                    No projects found.
                  </div>
                ) : (
                  filteredDatabases.map((database) => (
                    <DropdownItem
                      key={database}
                      onClick={() => onDbChange?.(database)}
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className="flex flex-col items-start">
                          <span>{databaseLabels[database] ?? database}</span>
                          {databaseLabels[database] &&
                            databaseLabels[database] !== database && (
                              <span className="font-mono text-[11px] text-zinc-500">
                                {database}
                              </span>
                            )}
                        </div>
                        {selectedDb === database && (
                          <Check size={14} className="text-emerald-500" />
                        )}
                      </div>
                    </DropdownItem>
                  ))
                )}
              </div>
            </div>
          </Dropdown>
        )}

        <span className="text-zinc-300 dark:text-zinc-700">/</span>

        <Dropdown
          align="left"
          trigger={
            <button
              type="button"
              className="flex items-center gap-2 h-8 px-2 rounded-md text-[13px] font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              main
              <Badge variant="warning">Production</Badge>
              <ChevronDown size={13} className="text-zinc-500" />
            </button>
          }
        >
          <div className="w-[280px] p-3">
            <div className="flex items-center justify-between gap-3 mb-2">
              <span className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
                main
              </span>
              <Badge variant="warning">Production</Badge>
            </div>
            <p className="text-[12px] text-zinc-500 leading-relaxed">
              Database branches are reserved for a future JSONVault Core
              upgrade.
            </p>
          </div>
        </Dropdown>

        <button
          type="button"
          onClick={() => setIsConnectOpen(true)}
          className="flex items-center gap-1.5 h-7 px-3 rounded-full border border-zinc-200 dark:border-white/10 text-[12px] font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors ml-1"
        >
          <Plug size={13} className="text-zinc-500" />
          Connect
        </button>

        {showCollection && (
          <>
            <span className="text-zinc-300 dark:text-zinc-700">/</span>
            <Dropdown
              align="left"
              trigger={
                <button
                  type="button"
                  className="flex items-center gap-2 h-8 px-2 rounded-md text-[13px] font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  <Table2 size={14} className="text-zinc-500" />
                  <span className="max-w-[160px] truncate">
                    {selectedCollection || "All collections"}
                  </span>
                  <ChevronDown size={13} className="text-zinc-500" />
                </button>
              }
            >
              {collections.map((collection) => (
                <DropdownItem
                  key={collection}
                  onClick={() => onCollectionChange?.(collection)}
                >
                  <div className="flex items-center justify-between w-full">
                    {collection}
                    {selectedCollection === collection && (
                      <Check size={14} className="text-emerald-500" />
                    )}
                  </div>
                </DropdownItem>
              ))}
            </Dropdown>
          </>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <div className="hidden lg:flex items-center gap-2 w-[230px] px-3 py-1.5 rounded-full border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-[#181818] text-zinc-500">
          <Search size={13} />
          <span className="text-[12px] flex-1">Search...</span>
          <span className="text-[11px] text-zinc-400">Ctrl K</span>
        </div>
        <button
          type="button"
          aria-label="Help"
          className="p-1.5 rounded-full border border-zinc-200 dark:border-white/10 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
        >
          <CircleHelp size={15} />
        </button>
        <button
          type="button"
          aria-label="Feature previews"
          className="p-1.5 rounded-full border border-zinc-200 dark:border-white/10 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
        >
          <Lightbulb size={15} />
        </button>
        <ProfileMenu userEmail={userEmail} userName={userName} />
      </div>

      <ConnectPanel
        database={selectedDb}
        isOpen={isConnectOpen}
        apiUrl={apiUrl}
        onClose={() => setIsConnectOpen(false)}
      />
    </header>
  );
}
