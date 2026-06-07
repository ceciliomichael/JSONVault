"use client";

import { ChevronDown, Info, KeyRound, Plus, Search } from "lucide-react";
import { useState } from "react";
import {
  Alert,
  Badge,
  ConfirmModal,
  CopyButton,
  Dropdown,
  DropdownItem,
  PrimaryButton,
  SecondaryButton,
  SelectionCheckbox,
  SidePanel,
  ToastNotice,
} from "@/components/ui";
import { WorkspacePage } from "@/components/Workspace";
import type { MockApiKey } from "@/lib/mock-dashboard-store";
import { useDashboardMock } from "@/lib/mock-dashboard-store";
import { formatDate } from "@/lib/utils";

const SCOPE_OPTIONS = [
  {
    scope: "read_write" as const,
    title: "Read/write app key",
    description: "Let your app read, write, and use realtime.",
  },
  {
    scope: "read_only" as const,
    title: "Read-only app key",
    description: "Let your app read project data safely.",
  },
  {
    scope: "project_admin" as const,
    title: "Full access project key",
    description: "Owner-level access for trusted backend workflows.",
  },
];

type ScopeOption = (typeof SCOPE_OPTIONS)[number]["scope"];

export default function KeysPage() {
  const {
    state,
    selectedDatabase,
    selectedCollection,
    generateRuntimeKey,
    generateProjectOwnerKey,
  } = useDashboardMock();
  const [creating, setCreating] = useState(false);
  const [scope, setScope] = useState<ScopeOption>("read_write");
  const [db, setDb] = useState(selectedDatabase.name);
  const [collection, setCollection] = useState("*");
  const [notice, setNotice] = useState("");
  const [createdKey, setCreatedKey] = useState<MockApiKey | null>(null);
  const [keySearch, setKeySearch] = useState("");
  const [selectedKeyIds, setSelectedKeyIds] = useState<string[]>([]);
  const [generateConfirm, setGenerateConfirm] = useState(false);

  const keys = state.keys.filter(
    (key) => key.database === selectedDatabase.name,
  );
  const visibleKeys = keys.filter((key) => {
    const query = keySearch.trim().toLowerCase();
    if (!query) return true;
    return (
      key.jti.toLowerCase().includes(query) ||
      key.scope.toLowerCase().includes(query) ||
      key.database.toLowerCase().includes(query) ||
      key.collection.toLowerCase().includes(query)
    );
  });
  const visibleKeyIds = visibleKeys.map((key) => key.jti);
  const allVisibleSelected =
    visibleKeyIds.length > 0 &&
    visibleKeyIds.every((id) => selectedKeyIds.includes(id));
  const someVisibleSelected =
    !allVisibleSelected &&
    visibleKeyIds.some((id) => selectedKeyIds.includes(id));
  const keyDraftChanged =
    scope !== "read_write" ||
    db !== selectedDatabase.name ||
    collection !== (selectedCollection.name || "*");

  function openCreate() {
    setScope("read_write");
    setDb(selectedDatabase.name);
    setCollection(selectedCollection.name || "*");
    setNotice("");
    setCreatedKey(null);
    setGenerateConfirm(false);
    setCreating(true);
  }

  function handleGenerate() {
    setGenerateConfirm(false);
    const result =
      scope === "project_admin"
        ? generateProjectOwnerKey(db)
        : generateRuntimeKey(scope, db, collection);
    setNotice(result.message);
    if (!result.ok || !result.data) return;
    setCreatedKey(result.data);
  }

  function toggleKeySelection(id: string) {
    setSelectedKeyIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function toggleVisibleKeySelection() {
    if (allVisibleSelected) {
      setSelectedKeyIds((current) =>
        current.filter((id) => !visibleKeyIds.includes(id)),
      );
      return;
    }
    setSelectedKeyIds((current) =>
      Array.from(new Set([...current, ...visibleKeyIds])),
    );
  }

  return (
    <WorkspacePage
      hideHeader
      title="API Keys"
      description={
        <>
          Create read-only, read/write, and full access keys for{" "}
          <span className="font-mono text-zinc-700 dark:text-zinc-300">
            {selectedDatabase.name}
          </span>
        </>
      }
    >
      {notice && !creating && (
        <ToastNotice
          message={notice}
          variant={notice.includes("required") ? "warning" : "success"}
          onClose={() => setNotice("")}
        />
      )}

      <div className="h-full min-h-0 min-w-0 overflow-hidden flex flex-col">
        <div className="h-12 shrink-0 flex items-center gap-3 px-4 border-b border-zinc-200 dark:border-white/5 bg-white dark:bg-[#121212]">
          {selectedKeyIds.length > 0 ? (
            <>
              <span className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300">
                {selectedKeyIds.length} selected
              </span>
              <SecondaryButton
                onClick={() => setSelectedKeyIds([])}
                className="ml-auto py-1.5"
              >
                Clear selection
              </SecondaryButton>
            </>
          ) : (
            <>
              <div className="relative flex-1 max-w-xl">
                <Search
                  size={14}
                  className="absolute left-0 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
                />
                <input
                  type="search"
                  value={keySearch}
                  onChange={(event) => setKeySearch(event.target.value)}
                  placeholder="Filter API keys..."
                  className="w-full h-10 pl-7 pr-3 text-[13px] bg-transparent border-0 focus:outline-none placeholder:text-zinc-400 text-zinc-900 dark:text-zinc-100"
                />
              </div>
              <PrimaryButton
                icon={Plus}
                onClick={openCreate}
                className="ml-auto shrink-0 py-1.5"
              >
                Generate key
              </PrimaryButton>
            </>
          )}
        </div>

        <div className="flex-1 min-h-0 min-w-0 overflow-auto custom-scrollbar pb-16">
          <table className="min-w-max w-full text-[13px] text-left border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-zinc-200 dark:border-white/5 bg-zinc-50 dark:bg-[#1a1a1a]">
                <th className="w-11 px-4 py-3 text-center border-r border-zinc-200 dark:border-white/5">
                  <SelectionCheckbox
                    checked={allVisibleSelected}
                    mixed={someVisibleSelected}
                    checkedIcon="dash"
                    disabled={visibleKeyIds.length === 0}
                    label="Select visible API keys"
                    onClick={toggleVisibleKeySelection}
                  />
                </th>
                {["Token ID", "Use", "Database", "Collection", "Expires"].map(
                  (heading) => (
                    <th
                      key={heading}
                      className="px-4 py-3 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider whitespace-nowrap border-r border-zinc-200 dark:border-white/5 last:border-r-0"
                    >
                      {heading}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="[&_tr]:border-b [&_tr]:border-zinc-100 dark:[&_tr]:border-white/5">
              {keys.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-16 text-center text-zinc-500"
                  >
                    <div className="flex flex-col items-center gap-3">
                      <KeyRound size={22} />
                      <span>No app keys yet.</span>
                    </div>
                  </td>
                </tr>
              ) : visibleKeys.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-16 text-center text-zinc-500"
                  >
                    No matching API keys.
                  </td>
                </tr>
              ) : (
                visibleKeys.map((key) => (
                  <tr
                    key={key.jti}
                    className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors"
                  >
                    <td className="px-4 py-3 text-center border-r border-zinc-100 dark:border-white/5">
                      <SelectionCheckbox
                        checked={selectedKeyIds.includes(key.jti)}
                        label={`Select ${key.jti}`}
                        onClick={() => toggleKeySelection(key.jti)}
                      />
                    </td>
                    <td className="px-4 py-3 border-r border-zinc-100 dark:border-white/5">
                      <span className="font-mono text-[13px] text-zinc-700 dark:text-zinc-300">
                        {key.jti}
                      </span>
                    </td>
                    <td className="px-4 py-3 border-r border-zinc-100 dark:border-white/5">
                      <Badge
                        variant={
                          key.scope === "project_admin"
                            ? "warning"
                            : key.scope === "read_write"
                              ? "info"
                              : "neutral"
                        }
                      >
                        {key.scope === "project_admin"
                          ? "Full access"
                          : key.scope === "read_write"
                            ? "Read/write app"
                            : "Read-only app"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 border-r border-zinc-100 dark:border-white/5">
                      <span className="font-mono text-[13px] text-zinc-500 dark:text-zinc-400">
                        {key.database}
                      </span>
                    </td>
                    <td className="px-4 py-3 border-r border-zinc-100 dark:border-white/5">
                      <span className="font-mono text-[13px] text-zinc-500 dark:text-zinc-400">
                        {key.collection}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-500 text-[12px]">
                      {formatDate(key.expires_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {creating && (
        <SidePanel
          title="Generate API key"
          onClose={() => setCreating(false)}
          hasUnsavedChanges={
            !!createdKey?.token || (!createdKey && keyDraftChanged)
          }
          discardTitle={
            createdKey?.token ? "Close generated key?" : "Discard key draft?"
          }
          discardDescription={
            createdKey?.token
              ? "Generated keys are only shown once. Make sure you copied it before closing this panel."
              : "This API key panel has draft changes that have not been saved."
          }
          size="lg"
          footer={
            <>
              <SecondaryButton onClick={() => setCreating(false)}>
                Close
              </SecondaryButton>
              {!createdKey && (
                <PrimaryButton
                  onClick={() => setGenerateConfirm(true)}
                  disabled={!db.trim() || !collection.trim()}
                >
                  Generate key
                </PrimaryButton>
              )}
            </>
          }
        >
          {notice && (
            <Alert variant={createdKey ? "success" : "warning"}>
              <span>{notice}</span>
            </Alert>
          )}

          {createdKey?.token ? (
            <div className="flex flex-col gap-3">
              <p className="text-[13px] text-zinc-500">
                Copy this key now. Generated keys are only shown once.
              </p>
              <div className="flex items-center gap-2 rounded-md border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-[#121212] p-3">
                <code className="flex-1 font-mono text-[12px] text-zinc-800 dark:text-zinc-200 break-all">
                  {createdKey.token}
                </code>
                <CopyButton text={createdKey.token} />
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-1">
                <p className="block text-[12px] font-medium text-zinc-700 dark:text-zinc-300">
                  What will this key be used for?
                </p>
                <Dropdown
                  fullWidth
                  trigger={
                    <button
                      type="button"
                      className="w-full flex items-center justify-between text-[13px] bg-zinc-50 dark:bg-[#121212] border border-zinc-200 dark:border-white/10 rounded-md px-4 py-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-colors shadow-inner"
                    >
                      <span>
                        {SCOPE_OPTIONS.find((option) => option.scope === scope)
                          ?.title || scope}
                      </span>
                      <ChevronDown size={14} className="text-zinc-400" />
                    </button>
                  }
                >
                  <div className="p-1">
                    {SCOPE_OPTIONS.map((option) => (
                      <DropdownItem
                        key={option.scope}
                        onClick={() => setScope(option.scope)}
                      >
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium text-zinc-900 dark:text-zinc-100">
                            {option.title}
                          </span>
                          <span className="text-zinc-500">
                            {option.description}
                          </span>
                        </div>
                      </DropdownItem>
                    ))}
                  </div>
                </Dropdown>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="key-database"
                    className="block text-[12px] font-medium text-zinc-700 dark:text-zinc-300 mb-2"
                  >
                    Database
                  </label>
                  <input
                    id="key-database"
                    type="text"
                    value={db}
                    onChange={(event) => setDb(event.target.value)}
                    className="w-full font-mono text-[13px] bg-zinc-50 dark:bg-[#121212] border border-zinc-200 dark:border-white/10 rounded-md px-4 py-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-colors shadow-inner"
                  />
                </div>
                <div>
                  <label
                    htmlFor="key-collection"
                    className="block text-[12px] font-medium text-zinc-700 dark:text-zinc-300 mb-2"
                  >
                    Collection
                  </label>
                  <input
                    id="key-collection"
                    type="text"
                    value={scope === "project_admin" ? "*" : collection}
                    onChange={(event) => setCollection(event.target.value)}
                    disabled={scope === "project_admin"}
                    placeholder="* for all"
                    className="w-full font-mono text-[13px] bg-zinc-50 dark:bg-[#121212] border border-zinc-200 dark:border-white/10 rounded-md px-4 py-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-colors shadow-inner disabled:cursor-not-allowed disabled:text-zinc-400 disabled:bg-zinc-100 dark:disabled:bg-[#181818]"
                  />
                </div>
              </div>

              <Alert variant="info">
                <Info size={16} />
                <span>
                  {scope === "project_admin"
                    ? "Full access project keys are for trusted dashboard or backend workflows. Do not put them in app client code."
                    : "Generated app keys can be used by your application within the selected database and collection scope."}
                </span>
              </Alert>
            </div>
          )}
        </SidePanel>
      )}
      {generateConfirm && (
        <ConfirmModal
          title="Generate API key?"
          description={
            <p className="text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">
              Confirm before creating this key. The token will only be shown
              once.
            </p>
          }
          confirmLabel="Generate key"
          onClose={() => setGenerateConfirm(false)}
          onConfirm={handleGenerate}
        />
      )}
    </WorkspacePage>
  );
}
