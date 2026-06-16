import { BookOpen } from "lucide-react";
import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { docsNavigation } from "@/lib/docs";

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen flex-col bg-white dark:bg-[#1c1c1c]">
      {/* Topbar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-6 text-[14px] dark:border-white/5 dark:bg-[#1c1c1c]">
        <div className="flex items-center gap-8">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 transition-opacity hover:opacity-80"
          >
            <BrandMark />
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">
              JSONVault
            </span>
            <span className="font-medium text-zinc-500">Docs</span>
          </Link>

          <nav className="hidden items-center gap-6 text-[13px] font-medium text-zinc-600 dark:text-zinc-300 md:flex">
            <Link href="#" className="hover:text-zinc-900 dark:hover:text-white">
              Guides
            </Link>
            <Link href="#" className="hover:text-zinc-900 dark:hover:text-white">
              Reference
            </Link>
            <Link href="#" className="hover:text-zinc-900 dark:hover:text-white">
              Architecture
            </Link>
            <Link href="#" className="hover:text-zinc-900 dark:hover:text-white">
              Resources
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden w-48 items-center gap-2 rounded border border-transparent bg-zinc-100 px-3 py-1.5 text-zinc-500 transition-colors focus-within:border-zinc-300 dark:bg-zinc-800 dark:focus-within:border-zinc-700 lg:flex">
            <span className="flex-1 text-[12px]">Search docs...</span>
            <span className="rounded border border-zinc-200 px-1 font-mono text-[10px] dark:border-zinc-700">
              Ctrl K
            </span>
          </div>
          <Link
            href="/dashboard"
            className="rounded-md bg-zinc-900 px-4 py-1.5 text-[13px] font-medium text-white shadow-sm transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Dashboard
          </Link>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="custom-scrollbar w-[280px] shrink-0 overflow-y-auto border-r border-zinc-200 bg-white dark:border-white/5 dark:bg-[#1c1c1c]">
          <div className="p-6">
            <div className="mb-6 flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              <BookOpen size={16} className="text-zinc-500" />
              Overview
            </div>

            <div className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
              Guides
            </div>
            <nav className="mb-8 flex flex-col gap-1.5">
              {docsNavigation.map((page) => (
                <Link
                  key={page.slug}
                  href={`/docs/${page.slug}`}
                  className="rounded-md px-3 py-1.5 text-[13px] text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-100"
                >
                  {page.title}
                </Link>
              ))}
            </nav>
          </div>
        </aside>

        {/* MDX Content */}
        <main className="custom-scrollbar flex-1 overflow-y-auto bg-white dark:bg-[#1c1c1c]">
          <div className="mx-auto flex max-w-5xl justify-center px-8 py-12 lg:px-12">
            <div className="w-full max-w-3xl">{children}</div>

            {/* Right Sidebar */}
            <div className="ml-12 hidden w-48 shrink-0 xl:block">
              <div className="sticky top-12">
                <div className="mb-3 text-[12px] font-semibold text-zinc-900 dark:text-zinc-100">
                  Is this helpful?
                </div>
                <div className="mb-8 flex gap-2">
                  <button className="flex h-6 w-6 items-center justify-center rounded border border-zinc-200 text-zinc-500 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800">
                    <span className="text-[10px]">✕</span>
                  </button>
                  <button className="flex h-6 w-6 items-center justify-center rounded border border-zinc-200 text-zinc-500 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800">
                    <span className="text-[10px]">✓</span>
                  </button>
                </div>

                <div className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
                  AI Tools
                </div>
                <div className="flex flex-col gap-2 text-[13px] text-zinc-500">
                  <button className="flex items-center gap-2 text-left hover:text-zinc-900 dark:hover:text-zinc-100">
                    <span className="text-zinc-400">📄</span> Copy as Markdown
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
