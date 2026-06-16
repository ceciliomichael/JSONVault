"use client";

import {
  AlertTriangle,
  Check,
  ChevronDown,
  CircleHelp,
  Database,
  Grid2X2,
  LayoutGrid,
  Lightbulb,
  List,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
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
import type { DashboardProject } from "@/lib/projects";
import { formatDate } from "@/lib/utils";
import {
  createProjectAction,
  deleteProjectAction,
  selectProjectAction,
} from "./actions";
import { initialProjectActionState } from "./project-state";

type ProjectView = "grid" | "list";

export default function ProjectsClient({
  projects,
  selectedProjectId,
  loadError = "",
  userEmail,
  userName,
}: {
  projects: DashboardProject[];
  selectedProjectId?: string;
  loadError?: string;
  userEmail: string;
  userName?: string;
}) {
  const [state, formAction, pending] = useActionState(
    createProjectAction,
    initialProjectActionState,
  );
  const [creating, setCreating] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DashboardProject | null>(
    null,
  );
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active">("all");
  const [view, setView] = useState<ProjectView>("grid");

  useEffect(() => {
    if (state.status === "error") {
      setCreating(true);
      setProjectName(state.values.displayName);
    }
  }, [state]);

  const sortedProjects = useMemo(
    () =>
      [...projects].sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [projects],
  );
  const filteredProjects = sortedProjects.filter((project) => {
    if (statusFilter === "active" && project.status !== "active") {
      return false;
    }
    const searchText = `${project.displayName} ${project.database}`;
    return searchText.toLowerCase().includes(query.trim().toLowerCase());
  });
  const showInitialEmptyState =
    projects.length === 0 && !query.trim() && !loadError;

  function openCreate() {
    setProjectName("");
    setCreating(true);
  }

  function handleProjectNameChange(value: string) {
    setProjectName(value);
  }

  function openDeleteProject(project: DashboardProject) {
    setDeleteTarget(project);
    setDeleteConfirmName("");
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
            <ProfileMenu userEmail={userEmail} userName={userName} />
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

          {loadError && (
            <div className="mb-4 max-w-[460px]">
              <Alert variant="danger">
                <span>{loadError}</span>
              </Alert>
            </div>
          )}

          {showInitialEmptyState ? (
            <div className="w-full rounded-lg border border-dashed border-zinc-200 dark:border-white/10 bg-white dark:bg-[#161616] shadow-sm">
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-4 text-zinc-400 dark:text-zinc-500">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="40"
                    height="40"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.25"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M20.7315 7.00119C20.556 6.69754 20.3037 6.44539 20 6.27002L13 2.27002C12.696 2.09449 12.3511 2.00208 12 2.00208C11.6489 2.00208 11.304 2.09449 11 2.27002L4 6.27002C3.69626 6.44539 3.44398 6.69754 3.26846 7.00119C3.09294 7.30483 3.00036 7.6493 3 8.00002V16C3.00036 16.3508 3.09294 16.6952 3.26846 16.9989C3.44398 17.3025 3.69626 17.5547 4 17.73L11 21.73C11.304 21.9056 11.6489 21.998 12 21.998" />
                    <path d="M3.3 7L12 12L20.7 7" />
                    <path d="M12 22V12" />
                    <path d="M19 14V20" />
                    <path d="M16 17H22" />
                  </svg>
                </div>
                <h2 className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">
                  Create a project
                </h2>
                <p className="mt-1.5 text-[13px] text-zinc-500 dark:text-zinc-400">
                  Connect your JSONVault database to get started.
                </p>
                <button
                  type="button"
                  onClick={openCreate}
                  className="mt-5 inline-flex items-center gap-1.5 rounded-md border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1e1e1e] px-3 py-1.5 text-[13px] font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors shadow-sm"
                >
                  <Plus size={14} />
                  New project
                </button>
              </div>
            </div>
          ) : view === "grid" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
              {filteredProjects.map((project) => {
                const current = selectedProjectId === project.id;
                return (
                  <article
                    key={project.id}
                    className="relative h-[190px] rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#161616] shadow-sm p-6 hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-md transition-all"
                  >
                    <form
                      action={selectProjectAction}
                      className="absolute inset-0"
                    >
                      <input
                        type="hidden"
                        name="projectId"
                        value={project.id}
                      />
                      <button
                        type="submit"
                        aria-label={`Open dashboard for ${project.displayName}`}
                        className="absolute inset-0 cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-white/20 dark:focus-visible:ring-offset-[#121212]"
                      />
                    </form>
                    <div className="relative z-10 pointer-events-none h-full flex flex-col">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h2 className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                            {project.displayName}
                          </h2>
                          <p className="mt-2 text-[13px] text-zinc-500 truncate">
                            JSONVault | {project.database}
                          </p>
                        </div>
                        <button
                          type="button"
                          aria-label={`Delete project ${project.displayName}`}
                          onClick={() => openDeleteProject(project)}
                          className="pointer-events-auto p-1 rounded-md text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                        >
                          <Trash2 size={15} />
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
            <div className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#161616] overflow-hidden shadow-sm">
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
                      key={project.id}
                      className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                    >
                      <td className="px-5 py-3 font-medium">
                        {project.displayName}
                      </td>
                      <td className="px-5 py-3 font-mono text-zinc-500">
                        {project.database}
                      </td>
                      <td className="px-5 py-3 text-zinc-500">
                        {formatDate(project.createdAt)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <form action={selectProjectAction}>
                            <input
                              type="hidden"
                              name="projectId"
                              value={project.id}
                            />
                            <button
                              type="submit"
                              className="text-[12px] font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white transition-colors"
                            >
                              Open
                            </button>
                          </form>
                          <button
                            type="button"
                            aria-label={`Delete project ${project.displayName}`}
                            onClick={() => openDeleteProject(project)}
                            className="text-zinc-400 transition-colors hover:text-red-500"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!showInitialEmptyState && filteredProjects.length === 0 && (
            <div className="flex min-h-[34vh] w-full items-center justify-center">
              <div className="max-w-[420px] text-center">
                <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-white/10 dark:bg-[#161616] dark:text-zinc-400">
                  <Search size={17} />
                </div>
                <h2 className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">
                  No matching projects
                </h2>
                <p className="mt-2 text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                  Adjust the search or status filter.
                </p>
              </div>
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
              <SecondaryButton type="button" onClick={() => setCreating(false)}>
                Cancel
              </SecondaryButton>
              <PrimaryButton
                disabled={pending || !projectName.trim()}
                form="new-project-form"
                type="submit"
              >
                {pending ? "Creating project..." : "Create project"}
              </PrimaryButton>
            </>
          }
        >
          <form
            id="new-project-form"
            action={formAction}
            noValidate
            className="flex flex-col gap-5"
          >
            {state.status === "error" && (
              <Alert variant="danger">
                <span>{state.message}</span>
              </Alert>
            )}

            <div>
              <label
                htmlFor="project-name"
                className="block text-[12px] font-medium text-zinc-700 dark:text-zinc-300 mb-2"
              >
                Project name
              </label>
              <input
                id="project-name"
                name="displayName"
                type="text"
                value={projectName}
                onChange={(event) =>
                  handleProjectNameChange(event.target.value)
                }
                placeholder="Todo App"
                required
                className="w-full text-[13px] bg-zinc-50 dark:bg-[#121212] border border-zinc-200 dark:border-white/10 rounded-md px-4 py-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-colors shadow-inner"
              />
            </div>
          </form>
        </Modal>
      )}

      {deleteTarget && (
        <Modal
          title="Delete project"
          onClose={() => setDeleteTarget(null)}
          footer={
            <>
              <SecondaryButton
                type="button"
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </SecondaryButton>
              <form action={deleteProjectAction}>
                <input type="hidden" name="projectId" value={deleteTarget.id} />
                <button
                  type="submit"
                  disabled={
                    deleteConfirmName.trim() !== deleteTarget.displayName
                  }
                  className="inline-flex items-center gap-2 rounded-md border border-red-500/20 bg-red-500/10 px-4 py-2 text-[13px] font-medium text-red-500 shadow-sm transition-colors hover:bg-red-500/20 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-45 dark:text-red-400 dark:hover:text-red-300"
                >
                  <Trash2 size={14} />
                  Delete project
                </button>
              </form>
            </>
          }
        >
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/5 dark:text-amber-300">
            <AlertTriangle size={17} className="mt-0.5 shrink-0" />
            <div className="min-w-0 text-[13px] leading-relaxed">
              <p className="font-medium text-amber-900 dark:text-amber-200">
                {deleteTarget.displayName}
              </p>
              <p className="mt-1">
                This removes the dashboard project record for{" "}
                <span className="font-mono">{deleteTarget.database}</span>. It
                does not delete Core database files or documents.
              </p>
            </div>
          </div>
          <div>
            <label
              htmlFor="delete-project-confirm"
              className="mb-2 block text-[12px] font-medium text-zinc-700 dark:text-zinc-300"
            >
              Type <span className="font-mono">{deleteTarget.displayName}</span>{" "}
              to confirm
            </label>
            <input
              id="delete-project-confirm"
              type="text"
              value={deleteConfirmName}
              onChange={(event) => setDeleteConfirmName(event.target.value)}
              className="w-full rounded-md border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-[13px] text-zinc-900 shadow-inner transition-colors focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-white/10 dark:bg-[#121212] dark:text-zinc-100"
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
