"use client";

import { ExternalLink, Plus, Search, Zap } from "lucide-react";
import { useState } from "react";
import {
  Badge,
  ConfirmModal,
  PrimaryButton,
  SecondaryButton,
  SelectionCheckbox,
  SidePanel,
  ToastNotice,
} from "@/components/ui";
import {
  CollectionPanel,
  CollectionTabs,
  WorkspacePage,
} from "@/components/Workspace";
import { useDashboardMock } from "@/lib/mock-dashboard-store";

const STATE_BADGE: Record<
  string,
  {
    variant: "success" | "neutral" | "info" | "warning" | "danger";
    label: string;
  }
> = {
  ready: { variant: "success", label: "Ready" },
  building: { variant: "info", label: "Building" },
  failed: { variant: "danger", label: "Failed" },
};

export default function IndexesPage() {
  const {
    selectedCollection,
    collections,
    setSelectedCollection,
    createIndex,
    deleteIndex,
  } = useDashboardMock();
  const [creating, setCreating] = useState(false);
  const [field, setField] = useState("");
  const [asyncBuild, setAsyncBuild] = useState(true);
  const [deleteTargets, setDeleteTargets] = useState<string[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [notice, setNotice] = useState("");
  const [collectionSearch, setCollectionSearch] = useState("");
  const [indexSearch, setIndexSearch] = useState("");
  const [selectedIndexFields, setSelectedIndexFields] = useState<string[]>([]);
  const [createConfirm, setCreateConfirm] = useState(false);

  const visibleIndexes = selectedCollection.indexes.filter((index) => {
    const query = indexSearch.trim().toLowerCase();
    if (!query) return true;
    return (
      index.field.toLowerCase().includes(query) ||
      index.state.toLowerCase().includes(query) ||
      (index.operation_id ?? "").toLowerCase().includes(query)
    );
  });
  const visibleIndexFields = visibleIndexes.map((index) => index.field);
  const allVisibleSelected =
    visibleIndexFields.length > 0 &&
    visibleIndexFields.every((fieldName) =>
      selectedIndexFields.includes(fieldName),
    );
  const someVisibleSelected =
    !allVisibleSelected &&
    visibleIndexFields.some((fieldName) =>
      selectedIndexFields.includes(fieldName),
    );

  function openCreate() {
    setField("");
    setAsyncBuild(true);
    setCreateConfirm(false);
    setCreating(true);
  }

  function handleCreate() {
    setCreateConfirm(false);
    const result = createIndex(field, asyncBuild);
    setNotice(result.message);
    if (!result.ok) return;
    setField("");
    setCreating(false);
  }

  function handleDelete() {
    if (deleteConfirm !== "delete") return;
    if (deleteTargets.length === 0) return;
    let lastMessage = "";
    for (const target of deleteTargets) {
      const result = deleteIndex(target);
      lastMessage = result.message;
    }
    setNotice(
      deleteTargets.length === 1
        ? lastMessage
        : `Deleted ${deleteTargets.length} indexes.`,
    );
    setSelectedIndexFields((current) =>
      current.filter((fieldName) => !deleteTargets.includes(fieldName)),
    );
    setDeleteTargets([]);
    setDeleteConfirm("");
  }

  function selectCollection(collection: string) {
    setSelectedIndexFields([]);
    setIndexSearch("");
    setSelectedCollection(collection);
  }

  function toggleIndexSelection(fieldName: string) {
    setSelectedIndexFields((current) =>
      current.includes(fieldName)
        ? current.filter((item) => item !== fieldName)
        : [...current, fieldName],
    );
  }

  function toggleVisibleIndexSelection() {
    if (allVisibleSelected) {
      setSelectedIndexFields((current) =>
        current.filter((fieldName) => !visibleIndexFields.includes(fieldName)),
      );
      return;
    }
    setSelectedIndexFields((current) =>
      Array.from(new Set([...current, ...visibleIndexFields])),
    );
  }

  return (
    <WorkspacePage
      hideHeader
      title="Indexes"
      description={
        <>
          Make repeated filters faster for{" "}
          <span className="font-mono text-zinc-700 dark:text-zinc-300">
            {selectedCollection.name}
          </span>
        </>
      }
    >
      {notice && (
        <ToastNotice
          message={notice}
          variant={notice.includes("already") ? "warning" : "success"}
          onClose={() => setNotice("")}
        />
      )}

      <div className="h-full flex min-h-0 min-w-0 overflow-hidden">
        <CollectionPanel
          title="Indexes"
          collections={collections}
          selectedCollection={selectedCollection.name}
          onSelect={selectCollection}
          search={collectionSearch}
          onSearch={setCollectionSearch}
        />
        <div className="flex-1 min-h-0 min-w-0 overflow-hidden flex flex-col">
          <CollectionTabs
            collections={collections}
            selectedCollection={selectedCollection.name}
            onSelect={selectCollection}
          />
          <div className="h-12 shrink-0 flex items-center gap-3 px-4 border-b border-zinc-200 dark:border-white/5 bg-white dark:bg-[#121212]">
            {selectedIndexFields.length > 0 ? (
              <>
                <span className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300">
                  {selectedIndexFields.length} selected
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteTargets(selectedIndexFields);
                    setDeleteConfirm("");
                  }}
                  className="ml-auto h-8 inline-flex items-center rounded-md border border-red-200 bg-red-50 px-3 text-[13px] font-medium text-red-700 hover:bg-red-100 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20 transition-colors"
                >
                  Delete {selectedIndexFields.length}{" "}
                  {selectedIndexFields.length === 1 ? "index" : "indexes"}
                </button>
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
                    value={indexSearch}
                    onChange={(event) => setIndexSearch(event.target.value)}
                    placeholder="Filter indexes..."
                    className="w-full h-10 pl-7 pr-3 text-[13px] bg-transparent border-0 focus:outline-none placeholder:text-zinc-400 text-zinc-900 dark:text-zinc-100"
                  />
                </div>
                <PrimaryButton
                  icon={Plus}
                  onClick={openCreate}
                  className="ml-auto shrink-0 py-1.5"
                >
                  Create index
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
                      disabled={visibleIndexFields.length === 0}
                      label="Select visible indexes"
                      onClick={toggleVisibleIndexSelection}
                    />
                  </th>
                  {["Field", "State", "Operation"].map((heading) => (
                    <th
                      key={heading}
                      className="px-4 py-3 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider whitespace-nowrap border-r border-zinc-200 dark:border-white/5 last:border-r-0"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="[&_tr]:border-b [&_tr]:border-zinc-100 dark:[&_tr]:border-white/5">
                {selectedCollection.indexes.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-6 py-16 text-center text-zinc-500"
                    >
                      <div className="flex flex-col items-center gap-3">
                        <Zap size={22} />
                        <span>No indexes yet.</span>
                      </div>
                    </td>
                  </tr>
                ) : visibleIndexes.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-6 py-16 text-center text-zinc-500"
                    >
                      No matching indexes.
                    </td>
                  </tr>
                ) : (
                  visibleIndexes.map((index) => {
                    const badge = STATE_BADGE[index.state] ?? STATE_BADGE.ready;
                    return (
                      <tr
                        key={index.field}
                        className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors"
                      >
                        <td className="px-4 py-3 text-center border-r border-zinc-100 dark:border-white/5">
                          <SelectionCheckbox
                            checked={selectedIndexFields.includes(index.field)}
                            label={`Select index on ${index.field}`}
                            onClick={() => toggleIndexSelection(index.field)}
                          />
                        </td>
                        <td className="px-4 py-3 border-r border-zinc-100 dark:border-white/5">
                          <span className="font-mono text-[13px] font-medium text-zinc-800 dark:text-zinc-200">
                            {index.field}
                          </span>
                        </td>
                        <td className="px-4 py-3 border-r border-zinc-100 dark:border-white/5">
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          {index.operation_id ? (
                            <a
                              href="/dashboard/operations"
                              className="inline-flex items-center gap-1.5 font-mono text-[12px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                            >
                              {index.operation_id} <ExternalLink size={12} />
                            </a>
                          ) : (
                            <span className="text-zinc-600 text-[13px]">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {creating && (
        <SidePanel
          title="Create index"
          onClose={() => setCreating(false)}
          hasUnsavedChanges={!!field.trim() || asyncBuild !== true}
          footer={
            <>
              <SecondaryButton onClick={() => setCreating(false)}>
                Cancel
              </SecondaryButton>
              <PrimaryButton
                disabled={!field.trim()}
                onClick={() => setCreateConfirm(true)}
              >
                Create index
              </PrimaryButton>
            </>
          }
        >
          <div>
            <label
              htmlFor="index-field"
              className="block text-[12px] font-medium text-zinc-700 dark:text-zinc-300 mb-2"
            >
              Field name
            </label>
            <input
              id="index-field"
              type="text"
              value={field}
              onChange={(event) => setField(event.target.value)}
              placeholder="e.g. email"
              className="w-full font-mono text-[13px] bg-zinc-50 dark:bg-[#121212] border border-zinc-200 dark:border-white/10 rounded-md px-4 py-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-colors shadow-inner"
            />
            <p className="text-[12px] text-zinc-500 mt-2">
              Use a top-level field your app filters often.
            </p>
          </div>

          <label className="flex items-start gap-3 p-3 rounded-lg border border-zinc-200 dark:border-white/5 bg-zinc-50 dark:bg-zinc-900/30 cursor-pointer group hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors">
            <input
              type="checkbox"
              checked={asyncBuild}
              onChange={(event) => setAsyncBuild(event.target.checked)}
              className="mt-0.5 rounded border-zinc-700 bg-zinc-50 dark:bg-[#121212] text-zinc-700 dark:text-zinc-300 focus:ring-zinc-500 focus:ring-offset-0"
            />
            <span className="flex flex-col gap-1">
              <span className="text-[13px] font-medium text-zinc-800 dark:text-zinc-200">
                Build in the background
              </span>
              <span className="text-[12px] text-zinc-500">
                Recommended for larger collections. You can track progress in
                Operations.
              </span>
            </span>
          </label>
        </SidePanel>
      )}

      {createConfirm && (
        <ConfirmModal
          title="Create index?"
          description={
            <p className="text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">
              Confirm before creating an index on{" "}
              <span className="font-mono text-zinc-800 dark:text-zinc-200">
                {field.trim()}
              </span>
              .
            </p>
          }
          confirmLabel="Create index"
          onClose={() => setCreateConfirm(false)}
          onConfirm={handleCreate}
        />
      )}

      {deleteTargets.length > 0 && (
        <ConfirmModal
          title={deleteTargets.length === 1 ? "Delete index" : "Delete indexes"}
          description={
            <div className="flex flex-col gap-4">
              <div>
                Delete{" "}
                {deleteTargets.length === 1 ? (
                  <>
                    the index on{" "}
                    <span className="font-mono font-semibold text-red-800 dark:text-red-100">
                      {deleteTargets[0]}
                    </span>
                  </>
                ) : (
                  <span className="font-semibold text-red-800 dark:text-red-100">
                    {deleteTargets.length} indexes
                  </span>
                )}
                ? Filters on these fields may need to scan the collection.
              </div>
              <div>
                <label
                  htmlFor="delete-index-confirm"
                  className="block text-[12px] font-medium text-zinc-700 dark:text-zinc-300 mb-2"
                >
                  Type{" "}
                  <span className="font-mono text-zinc-800 dark:text-zinc-200">
                    delete
                  </span>{" "}
                  to confirm
                </label>
                <input
                  id="delete-index-confirm"
                  value={deleteConfirm}
                  onChange={(event) => setDeleteConfirm(event.target.value)}
                  className="w-full font-mono text-[13px] bg-zinc-50 dark:bg-[#121212] border border-zinc-200 dark:border-white/10 rounded-md px-4 py-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-500 shadow-inner transition-colors"
                />
              </div>
            </div>
          }
          confirmLabel={
            deleteTargets.length === 1 ? "Delete index" : "Delete indexes"
          }
          danger
          onConfirm={handleDelete}
          onClose={() => {
            setDeleteTargets([]);
            setDeleteConfirm("");
          }}
        />
      )}
    </WorkspacePage>
  );
}
