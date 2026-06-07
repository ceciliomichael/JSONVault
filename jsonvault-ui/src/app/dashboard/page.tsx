"use client";

import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  FolderOpen,
  KeyRound,
  Search,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui";
import { useDashboardMock } from "@/lib/mock-dashboard-store";

const stateStyle: Record<
  string,
  { icon: React.ElementType; cls: string; label: string }
> = {
  ready: { icon: CheckCircle2, cls: "text-emerald-500", label: "Ready" },
  running: { icon: Clock, cls: "text-blue-400", label: "Running" },
  queued: { icon: Clock, cls: "text-zinc-500", label: "Queued" },
  failed: { icon: AlertTriangle, cls: "text-red-400", label: "Failed" },
  canceled: { icon: AlertTriangle, cls: "text-amber-400", label: "Canceled" },
  canceling: { icon: Clock, cls: "text-amber-400", label: "Canceling" },
};

export default function OverviewPage() {
  const { selectedDatabase, collections, state } = useDashboardMock();
  const indexCount = collections.reduce(
    (total, collection) => total + collection.indexes.length,
    0,
  );
  const readyIndexes = collections.reduce(
    (total, collection) =>
      total +
      collection.indexes.filter((index) => index.state === "ready").length,
    0,
  );
  const documentCount = collections.reduce(
    (total, collection) => total + collection.documents.length,
    0,
  );
  const runningOps = state.operations.filter(
    (operation) =>
      operation.database === selectedDatabase.name &&
      ["queued", "running", "canceling"].includes(operation.state),
  );
  const activeKeys = state.keys.filter(
    (key) => key.database === selectedDatabase.name && !key.revoked,
  );

  const stats = [
    {
      label: "Collections",
      value: String(collections.length),
      sub: `${documentCount} documents`,
      icon: FolderOpen,
      href: "/dashboard/collections",
    },
    {
      label: "Indexes",
      value: String(indexCount),
      sub: `${readyIndexes} ready`,
      icon: Zap,
      href: "/dashboard/indexes",
    },
    {
      label: "Operations",
      value: String(runningOps.length),
      sub: runningOps.length === 1 ? "1 active task" : "active tasks",
      icon: Activity,
      href: "/dashboard/operations",
    },
    {
      label: "API Keys",
      value: String(activeKeys.length),
      sub: "active app keys",
      icon: KeyRound,
      href: "/dashboard/keys",
    },
  ];

  const recentOps = state.operations
    .filter((operation) => operation.database === selectedDatabase.name)
    .slice(0, 4);

  return (
    <div className="flex flex-col gap-8 animate-in fade-in duration-500">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
            Project Overview
          </h1>
          <p className="text-[14px] text-zinc-500 mt-1">
            Manage documents, search, schemas, webhooks, and app keys for{" "}
            <span className="font-mono text-zinc-700 dark:text-zinc-300">
              {selectedDatabase.name}
            </span>
            .
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/data"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-zinc-900 text-white dark:bg-white dark:text-black text-[13px] font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors shadow-sm"
          >
            Browse documents <ArrowRight size={14} strokeWidth={2.5} />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link
              key={stat.label}
              href={stat.href}
              className="flex flex-col bg-white dark:bg-[#161616] rounded-xl border border-zinc-200 dark:border-white/5 p-5 hover:border-zinc-300 dark:hover:border-white/10 hover:bg-zinc-50 dark:hover:bg-[#1a1a1a] transition-all group"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-9 h-9 rounded-lg bg-zinc-100 dark:bg-zinc-800/50 flex items-center justify-center text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-200 transition-colors">
                  <Icon size={18} strokeWidth={1.5} />
                </div>
              </div>
              <div className="text-3xl font-semibold text-zinc-900 dark:text-zinc-100 leading-none tracking-tight mb-1">
                {stat.value}
              </div>
              <div className="text-[13px] font-medium text-zinc-500 dark:text-zinc-400 mt-2">
                {stat.label}
              </div>
              <div className="text-[12px] text-zinc-600 mt-1">{stat.sub}</div>
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-[#161616] rounded-xl border border-zinc-200 dark:border-white/5 flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-white/5">
            <h2 className="text-[14px] font-medium text-zinc-800 dark:text-zinc-200">
              Recent operations
            </h2>
            <Link
              href="/dashboard/operations"
              className="text-[12px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
            >
              View all
            </Link>
          </div>
          <div className="divide-y divide-white/5">
            {recentOps.length === 0 ? (
              <div className="px-6 py-8 text-[13px] text-zinc-500">
                No background tasks yet.
              </div>
            ) : (
              recentOps.map((operation) => {
                const meta = stateStyle[operation.state] ?? stateStyle.queued;
                const StateIcon = meta.icon;
                return (
                  <div
                    key={operation.operation_id}
                    className="flex items-center gap-4 px-6 py-4"
                  >
                    <StateIcon size={16} className={meta.cls} strokeWidth={2} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-zinc-800 dark:text-zinc-200 truncate">
                        {operation.type.replace(".", " ")}
                      </p>
                      <p className="text-[12px] text-zinc-500 font-mono truncate mt-0.5">
                        {operation.collection || selectedDatabase.name}
                      </p>
                    </div>
                    <Badge
                      variant={
                        operation.state === "ready"
                          ? "success"
                          : operation.state === "failed"
                            ? "danger"
                            : "info"
                      }
                    >
                      {meta.label}
                    </Badge>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-[#161616] rounded-xl border border-zinc-200 dark:border-white/5 flex flex-col">
          <div className="px-6 py-4 border-b border-zinc-200 dark:border-white/5">
            <h2 className="text-[14px] font-medium text-zinc-800 dark:text-zinc-200">
              Quick actions
            </h2>
          </div>
          <div className="p-5 grid grid-cols-2 gap-3">
            {[
              {
                label: "Browse documents",
                href: "/dashboard/data",
                desc: "View and edit JSON",
              },
              {
                label: "Create index",
                href: "/dashboard/indexes",
                desc: "Speed up filters",
              },
              {
                label: "Configure search",
                href: "/dashboard/fts",
                desc: "Choose text fields",
              },
              {
                label: "Set schema",
                href: "/dashboard/schemas",
                desc: "Protect writes",
              },
              {
                label: "Add webhook",
                href: "/dashboard/webhooks",
                desc: "Send change events",
              },
              {
                label: "Generate API key",
                href: "/dashboard/keys",
                desc: "Connect an app",
              },
            ].map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="flex flex-col gap-1 p-3.5 rounded-lg border border-zinc-200 dark:border-white/5 bg-zinc-50 dark:bg-zinc-900/30 hover:border-zinc-300 dark:hover:border-white/10 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors group"
              >
                <span className="text-[13px] font-medium text-zinc-800 dark:text-zinc-200 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors">
                  {action.label}
                </span>
                <span className="text-[12px] text-zinc-500">{action.desc}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-[#161616] rounded-xl border border-zinc-200 dark:border-white/5 p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Search size={16} className="text-zinc-400" />
          <h2 className="text-[14px] font-medium text-zinc-800 dark:text-zinc-200">
            App developer access
          </h2>
        </div>
        <p className="text-[13px] text-zinc-500 max-w-3xl leading-relaxed">
          This dashboard uses project owner access for management workflows. App
          code should use read-only or read/write keys created from API Keys,
          not platform admin credentials.
        </p>
      </div>
    </div>
  );
}
