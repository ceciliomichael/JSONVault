"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import { useDashboardMock } from "@/lib/mock-dashboard-store";

export default function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const {
    state,
    selectedDatabase,
    selectedCollection,
    collections,
    setSelectedDb,
    setSelectedCollection,
  } = useDashboardMock();
  const databaseLabels = Object.fromEntries(
    Object.values(state.databases).map((database) => [
      database.name,
      database.displayName ?? database.name,
    ]),
  );
  const fullBleed = pathname !== "/dashboard";

  return (
    <div className="h-screen overflow-hidden bg-white dark:bg-[#121212]">
      <Topbar
        databases={Object.keys(state.databases).sort()}
        databaseLabels={databaseLabels}
        collections={collections.map((collection) => collection.name)}
        selectedDb={selectedDatabase.name}
        selectedCollection={selectedCollection.name}
        onDbChange={setSelectedDb}
        onCollectionChange={setSelectedCollection}
      />
      <div className="flex h-[calc(100vh-3rem)] overflow-hidden">
        <Sidebar me={state.me} />
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
