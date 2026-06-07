"use client";

import {
  CheckCircle2,
  Database,
  KeyRound,
  ShieldAlert,
  UserCircle,
} from "lucide-react";
import { useState } from "react";
import {
  Badge,
  ConfirmModal,
  CopyButton,
  PrimaryButton,
  SecondaryButton,
  SidePanel,
  ToastNotice,
} from "@/components/ui";
import { WorkspacePage, WorkspaceTable } from "@/components/Workspace";
import type { MockApiKey } from "@/lib/mock-dashboard-store";
import { useDashboardMock } from "@/lib/mock-dashboard-store";

export default function AdminPage() {
  const {
    state,
    selectedDatabase,
    createProject,
    generateProjectOwnerKey,
    revokeKey,
  } = useDashboardMock();
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProject, setNewProject] = useState("");
  const [ownerDb, setOwnerDb] = useState(selectedDatabase.name);
  const [notice, setNotice] = useState("");
  const [createdKey, setCreatedKey] = useState<MockApiKey | null>(null);
  const [createProjectConfirm, setCreateProjectConfirm] = useState(false);

  const projects = Object.values(state.databases).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const projectOwnerKeys = state.keys.filter(
    (key) => key.scope === "project_admin",
  );

  function handleCreateProject() {
    setCreateProjectConfirm(false);
    const result = createProject(newProject);
    setNotice(result.message);
    if (!result.ok) return;
    setNewProject("");
    setCreatingProject(false);
  }

  function handleCreateOwnerKey() {
    const result = generateProjectOwnerKey(ownerDb);
    setNotice(result.message);
    if (result.data) setCreatedKey(result.data);
  }

  return (
    <WorkspacePage
      title="Platform Administration"
      description="Operator-only project and access controls"
      action={
        <PrimaryButton
          icon={Database}
          onClick={() => {
            setNewProject("");
            setCreateProjectConfirm(false);
            setCreatingProject(true);
          }}
        >
          New project
        </PrimaryButton>
      }
    >
      {notice && (
        <ToastNotice
          message={notice}
          variant={notice.includes("already") ? "warning" : "success"}
          onClose={() => setNotice("")}
        />
      )}

      <div className="h-full grid grid-cols-1 xl:grid-cols-[360px_1fr] min-h-0 min-w-0 overflow-hidden">
        <aside className="bg-white dark:bg-[#161616] border-r border-zinc-200 dark:border-white/5 overflow-y-auto custom-scrollbar">
          <section className="px-6 py-5 border-b border-zinc-200 dark:border-white/5">
            <div className="flex items-start gap-3 text-[13px] leading-relaxed text-amber-700 dark:text-amber-300">
              <ShieldAlert size={16} className="shrink-0 mt-0.5" />
              <span>
                Platform actions can affect every project on this JSONVault
                instance. Keep admin credentials out of app code.
              </span>
            </div>
          </section>

          <section className="px-6 py-5 border-b border-zinc-200 dark:border-white/5">
            <h2 className="text-[14px] font-medium text-zinc-800 dark:text-zinc-200">
              System status
            </h2>
            <div className="mt-4 flex flex-col gap-4">
              {[
                ["Database engine", "Healthy"],
                ["Realtime streams", "Ready"],
                ["Webhook worker", "Ready"],
                ["Dashboard connection", "Ready"],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-[13px] text-zinc-500 dark:text-zinc-400">
                    {label}
                  </span>
                  <div className="flex items-center gap-1.5 text-[13px] text-emerald-600 dark:text-emerald-400 font-medium">
                    <CheckCircle2 size={14} /> {value}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="px-6 py-5 border-b border-zinc-200 dark:border-white/5">
            <h2 className="text-[14px] font-medium text-zinc-800 dark:text-zinc-200">
              Create project owner access
            </h2>
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-2 leading-relaxed">
              Owner keys are for trusted dashboard, backend, or CLI workflows.
              Normal app clients should use read-only or read/write app keys.
            </p>
            <div className="mt-5 flex flex-col gap-3">
              <label
                htmlFor="project-database"
                className="block text-[12px] font-medium text-zinc-700 dark:text-zinc-300"
              >
                Project database
              </label>
              <input
                id="project-database"
                type="text"
                value={ownerDb}
                onChange={(event) => setOwnerDb(event.target.value)}
                placeholder="e.g. analytics_db"
                className="w-full font-mono text-[13px] bg-zinc-50 dark:bg-[#121212] border border-zinc-200 dark:border-white/10 rounded-md px-4 py-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-500 shadow-inner transition-colors"
              />
              <PrimaryButton icon={UserCircle} onClick={handleCreateOwnerKey}>
                Create owner key
              </PrimaryButton>
            </div>
          </section>

          {createdKey?.token && (
            <section className="px-6 py-5">
              <div className="flex items-center gap-2 text-[13px] font-medium text-zinc-800 dark:text-zinc-200">
                <KeyRound size={16} />
                Project owner key
              </div>
              <p className="mt-2 text-[12px] text-zinc-500">
                Copy this key now. Generated keys are only shown once.
              </p>
              <div className="mt-3 flex items-center gap-2 rounded-md border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-[#121212] p-3">
                <code className="flex-1 font-mono text-[12px] text-zinc-800 dark:text-zinc-200 break-all">
                  {createdKey.token}
                </code>
                <CopyButton text={createdKey.token} />
              </div>
            </section>
          )}
        </aside>

        <div className="min-w-0 flex flex-col">
          <section className="min-h-0 flex-1 flex flex-col">
            <div className="h-12 shrink-0 flex items-center justify-between px-4 border-b border-zinc-200 dark:border-white/5 bg-zinc-50 dark:bg-[#1a1a1a]">
              <h2 className="text-[14px] font-medium text-zinc-800 dark:text-zinc-200">
                Projects
              </h2>
              <span className="text-[12px] text-zinc-500">
                {projects.length} active
              </span>
            </div>
            <div className="flex-1 min-h-0">
              <WorkspaceTable headings={["Project", "Database", "Status"]}>
                {projects.map((project) => (
                  <tr
                    key={project.name}
                    className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors"
                  >
                    <td className="px-4 py-3 border-r border-zinc-100 dark:border-white/5">
                      <span className="text-[13px] font-medium text-zinc-800 dark:text-zinc-200">
                        {project.displayName ?? project.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 border-r border-zinc-100 dark:border-white/5">
                      <span className="font-mono text-[13px] text-zinc-500 dark:text-zinc-400">
                        {project.name}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="success">Active</Badge>
                    </td>
                  </tr>
                ))}
              </WorkspaceTable>
            </div>
          </section>

          <section className="h-[42%] min-h-[240px] flex flex-col border-t border-zinc-200 dark:border-white/5">
            <div className="h-12 shrink-0 flex items-center justify-between px-4 border-b border-zinc-200 dark:border-white/5 bg-zinc-50 dark:bg-[#1a1a1a]">
              <h2 className="text-[14px] font-medium text-zinc-800 dark:text-zinc-200">
                Project owner keys
              </h2>
              <span className="text-[12px] text-zinc-500">
                {projectOwnerKeys.length} total
              </span>
            </div>
            <div className="flex-1 min-h-0">
              <WorkspaceTable headings={["Token ID", "Database", "State", ""]}>
                {projectOwnerKeys.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-6 py-16 text-center text-zinc-500"
                    >
                      No project owner keys yet.
                    </td>
                  </tr>
                ) : (
                  projectOwnerKeys.map((key) => (
                    <tr
                      key={key.jti}
                      className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors group"
                    >
                      <td className="px-4 py-3 border-r border-zinc-100 dark:border-white/5">
                        <span className="font-mono text-[13px] text-zinc-800 dark:text-zinc-200">
                          {key.jti}
                        </span>
                      </td>
                      <td className="px-4 py-3 border-r border-zinc-100 dark:border-white/5">
                        <span className="font-mono text-[13px] text-zinc-500 dark:text-zinc-400">
                          {key.database}
                        </span>
                      </td>
                      <td className="px-4 py-3 border-r border-zinc-100 dark:border-white/5">
                        <Badge variant={key.revoked ? "neutral" : "warning"}>
                          {key.revoked ? "Revoked" : "Full access"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          disabled={key.revoked}
                          onClick={() => {
                            const result = revokeKey(key.jti);
                            setNotice(result.message);
                          }}
                          className="px-2.5 py-1 rounded-md text-[11px] font-medium border border-zinc-200 dark:border-white/10 text-zinc-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed opacity-0 group-hover:opacity-100 transition-all bg-white dark:bg-[#1a1a1a] shadow-sm"
                        >
                          {key.revoked ? "Revoked" : "Revoke"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </WorkspaceTable>
            </div>
          </section>
        </div>
      </div>

      {creatingProject && (
        <SidePanel
          title="New project"
          onClose={() => setCreatingProject(false)}
          hasUnsavedChanges={!!newProject.trim()}
          footer={
            <>
              <SecondaryButton onClick={() => setCreatingProject(false)}>
                Cancel
              </SecondaryButton>
              <PrimaryButton
                disabled={!newProject.trim()}
                onClick={() => setCreateProjectConfirm(true)}
              >
                Create project
              </PrimaryButton>
            </>
          }
        >
          <div>
            <label
              htmlFor="new-project-name"
              className="block text-[12px] font-medium text-zinc-700 dark:text-zinc-300 mb-2"
            >
              Project name
            </label>
            <input
              id="new-project-name"
              value={newProject}
              onChange={(event) => setNewProject(event.target.value)}
              placeholder="e.g. Analytics"
              className="w-full text-[13px] bg-zinc-50 dark:bg-[#121212] border border-zinc-200 dark:border-white/10 rounded-md px-4 py-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-500 shadow-inner transition-colors"
            />
          </div>
        </SidePanel>
      )}
      {createProjectConfirm && (
        <ConfirmModal
          title="Create project?"
          description={
            <p className="text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">
              Confirm before creating{" "}
              <span className="font-mono text-zinc-800 dark:text-zinc-200">
                {newProject.trim()}
              </span>
              .
            </p>
          }
          confirmLabel="Create project"
          onClose={() => setCreateProjectConfirm(false)}
          onConfirm={handleCreateProject}
        />
      )}
    </WorkspacePage>
  );
}
