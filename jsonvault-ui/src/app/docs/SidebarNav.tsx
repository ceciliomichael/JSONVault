"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText } from "lucide-react";

export function SidebarNav({ pages }: { pages: { slug: string; title: string }[] }) {
  const pathname = usePathname();

  return (
    <nav className="mb-8 flex flex-col gap-1">
      {pages.map((page) => {
        const isActive = pathname === `/docs/${page.slug}`;
        return (
          <Link
            key={page.slug}
            href={`/docs/${page.slug}`}
            className={`flex items-center gap-2 rounded-md px-3 py-2 text-[13px] font-medium transition-colors ${
              isActive
                ? "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400"
                : "text-zinc-600 hover:bg-zinc-200/50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-100"
            }`}
          >
            <FileText size={14} className={isActive ? "text-blue-500" : "text-zinc-400"} />
            {page.title}
          </Link>
        );
      })}
    </nav>
  );
}
