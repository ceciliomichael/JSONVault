"use client";

import {
  Check,
  ChevronDown,
  CircleHelp,
  Database,
  Grid2X2,
  LayoutGrid,
  Lightbulb,
  List,
  MoreVertical,
  Plus,
  Search,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import ProfileMenu from "@/components/ProfileMenu";
import {
  Alert,
  Badge,
  Dropdown,
  DropdownItem,
  Modal,
  PrimaryButton,
  SecondaryButton,
} from "@/components/ui";
import {
  projectIdFromName,
  useDashboardMock,
} from "@/lib/mock-dashboard-store";
import { formatDate } from "@/lib/utils";

type ProjectView = "grid" | "list";

export default function ProjectsPage() {
  const router = useRouter();
  const { state, setSelectedDb, createProject } = useDashboardMock();
  const [creating, setCreating] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [databaseId, setDatabaseId] = useState("");
  const [databaseEdited, setDatabaseEdited] = useState(false);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active">("all");
  const [view, setView] = useState<ProjectView>("grid");

  const projects = useMemo(
    () =>
      Object.values(state.databases).sort((a, b) =>
        (a.displayName ?? a.name).localeCompare(b.displayName ?? b.name),
      ),
    [state.databases],
  );
  const filteredProjects = projects.filter((project) => {
    if (statusFilter === "active" && project.status !== "active") {
      return false;
    }
    const searchText = `${project.displayName ?? project.name} ${project.name}`;
    return searchText.toLowerCase().includes(query.trim().toLowerCase());
  });

  function openCreate() {
    setProjectName("");
    setDatabaseId("");
    setDatabaseEdited(false);
    setNotice("");
    setCreating(true);
  }

  function handleProjectNameChange(value: string) {
    setProjectName(value);
    if (!databaseEdited) setDatabaseId(projectIdFromName(value));
  }

  function openProject(database: string) {
    setSelectedDb(database);
    router.push("/dashboard");
  }

  function handleCreateProject() {
    const result = createProject(projectName, databaseId);
    setNotice(result.message);
    if (!result.ok) return;
    setCreating(false);
    router.push("/dashboard");
  }

  return (
    <div className="min-h-screen bg-white dark:bg-[#121212] text-zinc-900 dark:text-zinc-100">
      <header className="fixed top-0 left-0 right-0 z-30 h-12 border-b border-zinc-200 dark:border-white/5 bg-white/95 dark:bg-[#121212]/95 backdrop-blur">
        <div className="h-full flex items-center justify-between pl-3 pr-4">
          <div className="flex items-center gap-3">
            <BrandMark />
            <div className="h-5 w-px bg-zinc-200 dark:bg-white/10" />
            <button
              type="button"
              className="flex items-center gap-2 text-[13px] font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white transition-colors"
            >
              JSONVault
              <Badge variant="neutral">Free</Badge>
              <ChevronDown size={13} className="text-zinc-500" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-2 w-[230px] px-3 py-1.5 rounded-full border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-[#181818] text-zinc-500">
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
            <ProfileMenu />
          </div>
        </div>
      </header>

      <aside className="fixed top-12 left-0 bottom-0 z-20 w-12 border-r border-zinc-200 dark:border-white/5 bg-white dark:bg-[#121212]">
        <nav className="flex flex-col items-center gap-1 py-3">
          <Link
            href="/projects"
            aria-current="page"
            aria-label="Projects"
            title="Projects"
            className="w-8 h-8 rounded-md flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 text-zinc-950 dark:text-zinc-100"
          >
            <LayoutGrid size={16} />
          </Link>
        </nav>
      </aside>

      <main className="pl-12 pt-12">
        <div className="max-w-[1120px] mx-auto px-8 py-14">
          <div className="mb-8">
            <h1 className="text-[26px] font-semibold tracking-tight">
              Projects
            </h1>
          </div>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-center mb-4">
            <div className="relative w-full lg:w-[360px]">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search for a project"
                className="w-full pl-9 pr-3 py-2 rounded-md border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#161616] text-[13px] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-600 shadow-sm"
              />
            </div>

            <Dropdown
              trigger={
                <button
                  type="button"
                  className="inline-flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#161616] text-[13px] font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors shadow-sm"
                >
                  Status
                  <ChevronDown size={14} />
                </button>
              }
            >
              <DropdownItem onClick={() => setStatusFilter("all")}>
                <div className="flex items-center justify-between w-full">
                  All projects
                  {statusFilter === "all" && <Check size={14} />}
                </div>
              </DropdownItem>
              <DropdownItem onClick={() => setStatusFilter("active")}>
                <div className="flex items-center justify-between w-full">
                  Active
                  {statusFilter === "active" && <Check size={14} />}
                </div>
              </DropdownItem>
            </Dropdown>

            <button
              type="button"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#161616] text-[13px] font-medium text-zinc-600 dark:text-zinc-300 shadow-sm"
            >
              Sorted by name
              <ChevronDown size={14} />
            </button>

            <div className="flex-1" />

            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Grid view"
                title="Grid view"
                onClick={() => setView("grid")}
                className={`w-8 h-8 rounded-md border flex items-center justify-center transition-colors ${
                  view === "grid"
                    ? "border-zinc-300 dark:border-white/10 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                    : "border-transparent text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                }`}
              >
                <Grid2X2 size={15} />
              </button>
              <button
                type="button"
                aria-label="List view"
                title="List view"
                onClick={() => setView("list")}
                className={`w-8 h-8 rounded-md border flex items-center justify-center transition-colors ${
                  view === "list"
                    ? "border-zinc-300 dark:border-white/10 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                    : "border-transparent text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                }`}
              >
                <List size={16} />
              </button>
              <PrimaryButton icon={Plus} onClick={openCreate}>
                New project
              </PrimaryButton>
            </div>
          </div>

          {notice && (
            <div className="mb-4 max-w-[460px]">
              <Alert
                variant={notice.includes("cannot") ? "warning" : "success"}
              >
                <span>{notice}</span>
              </Alert>
            </div>
          )}

          {view === "grid" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-[920px]">
              {filteredProjects.map((project) => {
                const current = state.selectedDb === project.name;
                return (
                  <article
                    key={project.name}
                    className="relative h-[190px] rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#161616] shadow-sm p-6 hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-md transition-all"
                  >
                    <button
                      type="button"
                      aria-label={`Open dashboard for ${project.displayName ?? project.name}`}
                      onClick={() => openProject(project.name)}
                      className="absolute inset-0 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-[#121212]"
                    />
                    <div className="relative z-10 pointer-events-none h-full flex flex-col">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h2 className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                            {project.displayName ?? project.name}
                          </h2>
                          <p className="mt-2 text-[13px] text-zinc-500 truncate">
                            JSONVault | {project.name}
                          </p>
                        </div>
                        <button
                          type="button"
                          aria-label={`Project actions for ${project.name}`}
                          className="pointer-events-auto p-1 rounded-md text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                        >
                          <MoreVertical size={15} />
                        </button>
                      </div>

                      <div className="mt-auto flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2 text-[13px] text-zinc-600 dark:text-zinc-300">
                          <span className="w-6 h-6 rounded-md border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-[#121212] flex items-center justify-center text-zinc-500">
                            <Database size={13} />
                          </span>
                          Project is active
                        </div>
                        {current && <Badge variant="success">Current</Badge>}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="max-w-[920px] rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#161616] overflow-hidden shadow-sm">
              <table className="w-full text-[13px] text-left">
                <thead className="bg-zinc-50 dark:bg-[#1a1a1a] border-b border-zinc-200 dark:border-white/5">
                  <tr>
                    {["Project", "Database ID", "Created", ""].map(
                      (heading) => (
                        <th
                          key={heading}
                          className="px-5 py-3 text-[11px] uppercase tracking-wider text-zinc-500 font-semibold"
                        >
                          {heading}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
                  {filteredProjects.map((project) => (
                    <tr
                      key={project.name}
                      className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                    >
                      <td className="px-5 py-3 font-medium">
                        {project.displayName ?? project.name}
                      </td>
                      <td className="px-5 py-3 font-mono text-zinc-500">
                        {project.name}
                      </td>
                      <td className="px-5 py-3 text-zinc-500">
                        {formatDate(project.created_at)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => openProject(project.name)}
                          className="text-[12px] font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white transition-colors"
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {filteredProjects.length === 0 && (
            <div className="max-w-[420px] rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#161616] p-8 text-center text-[13px] text-zinc-500">
              No projects match your search.
            </div>
          )}
        </div>
      </main>

      {creating && (
        <Modal
          title="New project"
          onClose={() => setCreating(false)}
          footer={
            <>
              <SecondaryButton onClick={() => setCreating(false)}>
                Cancel
              </SecondaryButton>
              <PrimaryButton
                disabled={!projectName.trim() || !databaseId.trim()}
                onClick={handleCreateProject}
              >
                Create project
              </PrimaryButton>
            </>
          }
        >
          <div>
            <label
              htmlFor="project-name"
              className="block text-[12px] font-medium text-zinc-700 dark:text-zinc-300 mb-2"
            >
              Project name
            </label>
            <input
              id="project-name"
              type="text"
              value={projectName}
              onChange={(event) => handleProjectNameChange(event.target.value)}
              placeholder="Todo App"
              className="w-full text-[13px] bg-zinc-50 dark:bg-[#121212] border border-zinc-200 dark:border-white/10 rounded-md px-4 py-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-colors shadow-inner"
            />
          </div>
          <div>
            <label
              htmlFor="database-id"
              className="block text-[12px] font-medium text-zinc-700 dark:text-zinc-300 mb-2"
            >
              Database ID
            </label>
            <input
              id="database-id"
              type="text"
              value={databaseId}
              onChange={(event) => {
                setDatabaseEdited(true);
                setDatabaseId(event.target.value);
              }}
              placeholder="todo_app"
              className="w-full font-mono text-[13px] bg-zinc-50 dark:bg-[#121212] border border-zinc-200 dark:border-white/10 rounded-md px-4 py-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-colors shadow-inner"
            />
            <p className="text-[12px] text-zinc-500 mt-2 leading-relaxed">
              Used in API paths, collection URLs, and generated key scope.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
