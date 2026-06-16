import { BookOpen, Zap, LifeBuoy, Search } from "lucide-react";
import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { docsNavigation } from "@/lib/docs";
import { SidebarNav } from "./SidebarNav";

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen flex-col bg-white dark:bg-[#111111]">
      {/* Topbar */}
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-zinc-200 bg-white/50 backdrop-blur-md px-6 text-[14px] dark:border-white/5 dark:bg-[#111111]/50 sticky top-0 z-50">
        <div className="flex items-center gap-8">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 transition-opacity hover:opacity-80"
          >
            <BrandMark />
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">
              JSONVault
            </span>
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
              Docs
            </span>
          </Link>

          <nav className="hidden items-center gap-6 text-[13px] font-medium text-zinc-600 dark:text-zinc-300 md:flex">
            <Link href="/docs/core-principles" className="hover:text-zinc-900 dark:hover:text-white transition-colors">
              Guides
            </Link>
            <Link href="#" className="hover:text-zinc-900 dark:hover:text-white transition-colors">
              Reference
            </Link>
            <Link href="#" className="hover:text-zinc-900 dark:hover:text-white transition-colors">
              Architecture
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden w-64 items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-zinc-500 transition-colors hover:border-zinc-300 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 dark:border-white/10 dark:bg-[#1c1c1c] dark:hover:border-white/20 lg:flex group cursor-pointer">
            <Search size={14} className="text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300" />
            <span className="flex-1 text-[13px]">Search documentation...</span>
            <span className="rounded border border-zinc-200 bg-white px-1.5 py-0.5 font-mono text-[10px] shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
              Ctrl K
            </span>
          </div>
          <Link
            href="/dashboard"
            className="rounded-lg bg-zinc-900 px-4 py-2 text-[13px] font-medium text-white shadow-sm transition-all hover:bg-zinc-800 hover:shadow dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Go to Dashboard
          </Link>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="custom-scrollbar w-[280px] shrink-0 overflow-y-auto border-r border-zinc-200 bg-zinc-50/50 dark:border-white/5 dark:bg-[#111111]">
          <div className="p-6">
            <div className="mb-6 flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
                <BookOpen size={14} />
              </div>
              Overview
            </div>

            <div className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
              Essentials
            </div>
            
            <SidebarNav pages={docsNavigation} />

            <div className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
              Resources
            </div>
            <nav className="flex flex-col gap-1">
              <Link
                href="#"
                className="flex items-center gap-2 rounded-md px-3 py-2 text-[13px] font-medium text-zinc-600 transition-colors hover:bg-zinc-200/50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-100"
              >
                <LifeBuoy size={14} className="text-zinc-400" />
                Support
              </Link>
              <Link
                href="#"
                className="flex items-center gap-2 rounded-md px-3 py-2 text-[13px] font-medium text-zinc-600 transition-colors hover:bg-zinc-200/50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-100"
              >
                <Zap size={14} className="text-zinc-400" />
                API Status
              </Link>
            </nav>
          </div>
        </aside>

        {/* MDX Content Area */}
        <main className="custom-scrollbar flex-1 overflow-y-auto bg-white dark:bg-[#111111]">
          <div className="mx-auto flex max-w-[1200px] justify-center px-8 py-12 lg:px-12">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
