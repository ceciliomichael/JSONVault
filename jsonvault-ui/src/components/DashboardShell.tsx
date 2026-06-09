"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import type { DashboardProject } from "@/lib/projects";
import type { MeResponse } from "@/lib/types";

export default function DashboardShell({
  children,
  me,
  project,
  userEmail,
  userName,
}: {
  children: ReactNode;
  me: MeResponse | null;
  project: DashboardProject;
  userEmail: string;
  userName?: string;
}) {
  const pathname = usePathname();
  const databaseLabels = { [project.database]: project.displayName };
  const fullBleed = pathname !== "/dashboard";

  return (
    <div className="h-screen overflow-hidden bg-white dark:bg-[#121212]">
      <Topbar
        databases={[project.database]}
        databaseLabels={databaseLabels}
        collections={[]}
        selectedDb={project.database}
        selectedCollection=""
        userEmail={userEmail}
        userName={userName}
      />
      <div className="flex h-[calc(100vh-3rem)] overflow-hidden">
        <Sidebar me={me} />
        <main
          className={`flex-1 min-w-0 bg-white dark:bg-[#121212] ${
            fullBleed
              ? "overflow-hidden p-0"
              : "overflow-y-auto overflow-x-hidden p-6 lg:p-8"
          }`}
        >
          <div
            className={
              fullBleed
                ? "w-full h-full min-w-0 overflow-hidden"
                : "max-w-[1180px] mx-auto min-w-0"
            }
          >
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
