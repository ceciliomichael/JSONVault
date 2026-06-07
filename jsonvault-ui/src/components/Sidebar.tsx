"use client";

import {
  Activity,
  FileSearch,
  FolderOpen,
  Home,
  KeyRound,
  Radio,
  Settings,
  Shield,
  ShieldCheck,
  Table2,
  Webhook,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MeResponse } from "@/lib/types";
import { hasCapability, isAdmin } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  check?: (me: MeResponse | null) => boolean;
}

const NAV: NavItem[] = [
  { label: "Overview", href: "/dashboard", icon: Home },
  {
    label: "Documents",
    href: "/dashboard/data",
    icon: Table2,
    check: (me) =>
      !!me &&
      ["read_only", "read_write", "project_admin", "admin"].includes(me.scope),
  },
  {
    label: "Collections",
    href: "/dashboard/collections",
    icon: FolderOpen,
    check: (me) => !!me,
  },
  {
    label: "Indexes",
    href: "/dashboard/indexes",
    icon: Zap,
    check: (me) => !!me,
  },
  {
    label: "Search",
    href: "/dashboard/fts",
    icon: FileSearch,
    check: (me) => !!me,
  },
  {
    label: "Schemas",
    href: "/dashboard/schemas",
    icon: ShieldCheck,
    check: (me) => !!me,
  },
  {
    label: "Webhooks",
    href: "/dashboard/webhooks",
    icon: Webhook,
    check: (me) => hasCapability(me, "webhooks:manage"),
  },
  {
    label: "Operations",
    href: "/dashboard/operations",
    icon: Activity,
    check: (me) => hasCapability(me, "operations:read"),
  },
  {
    label: "API Keys",
    href: "/dashboard/keys",
    icon: KeyRound,
    check: (me) => hasCapability(me, "keys:manage") || isAdmin(me),
  },
  {
    label: "Realtime",
    href: "/dashboard/realtime",
    icon: Radio,
    check: (me) =>
      !!me && ["read_write", "project_admin", "admin"].includes(me.scope ?? ""),
  },
  { label: "Admin", href: "/dashboard/admin", icon: Shield, check: isAdmin },
];

function isActive(pathname: string, href: string) {
  return href === "/dashboard"
    ? pathname === "/dashboard"
    : pathname === href || pathname.startsWith(`${href}/`);
}

export default function Sidebar({ me }: { me: MeResponse | null }) {
  const pathname = usePathname();
  const visibleNav = NAV.filter((item) => !item.check || item.check(me));

  return (
    <aside className="group/sidebar w-12 hover:w-56 shrink-0 border-r border-zinc-200 dark:border-white/5 bg-white dark:bg-[#121212] overflow-hidden flex flex-col transition-[width] duration-200 ease-out">
      <div className="w-full h-full bg-white dark:bg-[#121212] overflow-hidden flex flex-col">
        <nav className="flex flex-col items-stretch gap-1 py-3 w-full">
          <Link
            href="/projects"
            aria-label="All projects"
            title="All projects"
            className="mx-2 h-8 rounded-md grid grid-cols-[2rem_1fr] items-center overflow-hidden text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800/70 transition-colors"
          >
            <span className="w-8 flex items-center justify-center">
              <FolderOpen size={16} />
            </span>
            <span className="opacity-0 whitespace-nowrap text-[13px] font-medium group-hover/sidebar:opacity-100 transition-opacity">
              All projects
            </span>
          </Link>
          <div className="mx-auto w-7 h-px bg-zinc-200 dark:bg-white/5 my-2" />
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                title={item.label}
                className={`mx-2 h-8 rounded-md grid grid-cols-[2rem_1fr] items-center overflow-hidden transition-colors ${
                  active
                    ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-950 dark:text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800/70"
                }`}
              >
                <span className="w-8 flex items-center justify-center">
                  <Icon size={16} strokeWidth={active ? 2.4 : 2} />
                </span>
                <span className="opacity-0 whitespace-nowrap text-[13px] font-medium group-hover/sidebar:opacity-100 transition-opacity">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto mb-3">
          <button
            type="button"
            aria-label="Settings"
            title="Settings"
            className="mx-2 h-8 rounded-md grid grid-cols-[2rem_1fr] items-center overflow-hidden text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800/70 transition-colors"
          >
            <span className="w-8 flex items-center justify-center">
              <Settings size={16} />
            </span>
            <span className="opacity-0 whitespace-nowrap text-[13px] font-medium text-left group-hover/sidebar:opacity-100 transition-opacity">
              Settings
            </span>
          </button>
        </div>
      </div>
    </aside>
  );
}
