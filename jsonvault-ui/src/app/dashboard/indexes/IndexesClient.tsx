"use client";

import {
  AlertTriangle,
  Database,
  ExternalLink,
  FolderOpen,
  Plus,
  Search,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Alert,
  Badge,
  ConfirmModal,
  PrimaryButton,
  SecondaryButton,
  SelectionCheckbox,
  SidePanel,
  ToastNotice,
} from "@/components/ui";
import type { ProjectIndex } from "@/lib/indexes";
import { createIndexAction, deleteIndexesAction } from "./actions";
import type { IndexActionResult } from "./index-state";

const STATE_BADGE: Record<
  ProjectIndex["state"],
  {
    variant: "success" | "neutral" | "info" | "warning" | "danger";
    label: string;
  }
> = {
  ready: { variant: "success", label: "Ready" },
  building: { variant: "info", label: "Building" },
  failed: { variant: "danger", label: "Failed" },
};

export default function IndexesClient({
  database,
  collections,
  selectedCollection,
  indexes,
  canReadIndexes,
  canManageIndexes,
  loadError = "",
}: {
  database: string;
  collections: string[];
  selectedCollection?: string;
  indexes: ProjectIndex[];
  canReadIndexes: boolean;
  canManageIndexes: boolean;
  loadError?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [indexRows, setIndexRows] = useState<ProjectIndex[]>(indexes);
  const [creating, setCreating] = useState(false);
  const [field, setField] = useState("");
  const [asyncBuild, setAsyncBuild] = useState(true);
  const [deleteTargets, setDeleteTargets] = useState<string[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [notice, setNotice] = useState<IndexActionResult | null>(null);
  const [collectionSearch, setCollectionSearch] = useState("");
  const [indexSearch, setIndexSearch] = useState("");
  const [selectedIndexFields, setSelectedIndexFields] = useState<string[]>([]);
  const [createConfirm, setCreateConfirm] = useState(false);

  useEffect(() => {
    setIndexRows(selectedCollection ? indexes : []);
    setSelectedIndexFields([]);
    setIndexSearch("");
  }, [indexes, selectedCollection]);

  const visibleCollections = useMemo(() => {
    const query = collectionSearch.trim().toLowerCase();
    if (!query) return collections;
    return collections.filter((collection) =>
      collection.toLowerCase().includes(query),
    );
  }, [collections, collectionSearch]);

  const visibleIndexes = useMemo(() => {
    const query = indexSearch.trim().toLowerCase();
    if (!query) return indexRows;
    return indexRows.filter(
      (index) =>
        index.field.toLowerCase().includes(query) ||
        index.state.toLowerCase().includes(query) ||
        (index.operationId ?? "").toLowerCase().includes(query),
    );
  }, [indexRows, indexSearch]);

  const visibleIndexFields = visibleIndexes.map((index) => index.field);
  const selectedVisibleCount = visibleIndexFields.filter((fieldName) =>
    selectedIndexFields.includes(fieldName),
  ).length;
  const allVisibleSelected =
    visibleIndexFields.length > 0 &&
    selectedVisibleCount === visibleIndexFields.length;
  const someVisibleSelected =
    selectedVisibleCount > 0 &&
    selectedVisibleCount < visibleIndexFields.length;
  const canEditIndexes = !!selectedCollection && canManageIndexes && !isPending;

  function selectCollection(collection: string) {
    const params = new URLSearchParams();
    params.set("collection", collection);
    router.push(`/dashboard/indexes?${params.toString()}`);
  }

  function openCreate() {
    setField("");
    setAsyncBuild(true);
    setCreateConfirm(false);
    setNotice(null);
    setCreating(true);
  }

  function handleCreate() {
    setCreateConfirm(false);
    if (!selectedCollection) return;

    startTransition(async () => {
      const result = await createIndexAction(
        selectedCollection,
        field,
        asyncBuild,
      );
      setNotice(result);
      if (result.status === "success" && result.index) {
        setIndexRows((current) =>
          upsertIndex(current, result.index as ProjectIndex),
        );
        setField("");
        setCreating(false);
        router.refresh();
      }
    });
  }

  function handleDelete() {
    if (!selectedCollection || deleteConfirm.trim() !== "delete") return;

    startTransition(async () => {
      const result = await deleteIndexesAction(
        selectedCollection,
        deleteTargets,
      );
      setNotice(result);
      if (result.status === "success" && result.deletedFields) {
        const deleted = new Set(result.deletedFields);
        setIndexRows((current) =>
          current.filter((index) => !deleted.has(index.field)),
        );
        setSelectedIndexFields((current) =>
          current.filter((fieldName) => !deleted.has(fieldName)),
        );
        setDeleteTargets([]);
        setDeleteConfirm("");
        router.refresh();
      }
    });
  }

  function toggleIndexSelection(fieldName: string) {
    setSelectedIndexFields((current) =>
      current.includes(fieldName)
        ? current.filter((item) => item !== fieldName)
        : [...current, fieldName],
    );
  }

  function toggleVisibleIndexSelection() {
    if (visibleIndexFields.length === 0) return;
    setSelectedIndexFields((current) => {
      if (allVisibleSelected) {
        return current.filter(
          (fieldName) => !visibleIndexFields.includes(fieldName),
        );
      }
      return Array.from(new Set([...current, ...visibleIndexFields]));
    });
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 animate-in overflow-hidden bg-white fade-in duration-500 dark:bg-[#121212]">
      {notice?.message && (
        <ToastNotice
          message={notice.message}
          variant={notice.status === "error" ? "danger" : notice.status}
          onClose={() => setNotice(null)}
        />
      )}

      <aside className="flex w-[260px] shrink-0 flex-col overflow-hidden border-r border-zinc-200 bg-white dark:border-white/5 dark:bg-[#161616]">
        <div className="border-b border-zinc-200 px-4 py-4 dark:border-white/5">
          <h2 className="text-[16px] font-semibold text-zinc-900 dark:text-zinc-100">
            Indexes
          </h2>
          <div className="mt-4 flex h-9 items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 font-mono text-[12px] text-zinc-600 dark:border-white/10 dark:bg-[#121212] dark:text-zinc-300">
            <Database size={13} className="shrink-0 text-zinc-400" />
            <span className="truncate">{database}</span>
          </div>
          <Link
            href="/dashboard/collections"
            className="mt-2 flex h-9 w-full items-center gap-2 rounded-md border border-zinc-200 px-3 text-[13px] text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-zinc-800/50"
          >
            <Plus size={14} />
            New collection
          </Link>
        </div>

        <div className="p-3">
          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
            />
            <input
              type="search"
              value={collectionSearch}
              onChange={(event) => setCollectionSearch(event.target.value)}
              placeholder="Search collections..."
              className="h-9 w-full rounded-md border border-zinc-200 bg-zinc-50 py-2 pl-9 pr-3 text-[13px] text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-white/10 dark:bg-[#121212] dark:text-zinc-100"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto py-2 custom-scrollbar">
          {collections.length === 0 ? (
            <div className="px-4 py-8 text-center text-[12px] text-zinc-500">
              No collections yet.
            </div>
          ) : visibleCollections.length === 0 ? (
            <div className="px-4 py-8 text-center text-[12px] text-zinc-500">
              No matching collections.
            </div>
          ) : (
            visibleCollections.map((collection) => {
              const active = collection === selectedCollection;
              return (
                <button
                  key={collection}
                  type="button"
                  onClick={() => selectCollection(collection)}
                  className={`grid h-9 w-full grid-cols-[18px_1fr] items-center gap-2 px-4 text-left text-[13px] transition-colors ${
                    active
                      ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                      : "text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-800/50"
                  }`}
                >
                  <FolderOpen size={14} className="text-zinc-400" />
                  <span className="truncate font-mono">{collection}</span>
                </button>
              );
            })
          )}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-12 shrink-0 items-stretch overflow-x-auto overflow-y-hidden border-b border-zinc-200 bg-zinc-50 dark:border-white/5 dark:bg-[#161616] custom-scrollbar">
          {collections.slice(0, 4).map((collection) => {
            const active = collection === selectedCollection;
            return (
              <button
                key={collection}
                type="button"
                onClick={() => selectCollection(collection)}
                className={`min-w-[180px] border-r border-zinc-200 px-4 text-left text-[13px] font-medium transition-colors dark:border-white/5 ${
                  active
                    ? "border-t-2 border-t-zinc-900 bg-white text-zinc-900 dark:border-t-zinc-100 dark:bg-[#121212] dark:text-zinc-100"
                    : "text-zinc-500 hover:bg-white hover:text-zinc-900 dark:hover:bg-[#121212] dark:hover:text-zinc-100"
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  <FolderOpen size={14} />
                  {collection}
                </span>
              </button>
            );
          })}
        </div>

        {loadError && (
          <div className="border-b border-zinc-200 px-4 py-3 dark:border-white/5">
            <Alert variant="danger">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{loadError}</span>
            </Alert>
          </div>
        )}

        {!canReadIndexes && !loadError && (
          <div className="border-b border-zinc-200 px-4 py-3 dark:border-white/5">
            <Alert variant="warning">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>The selected project token cannot read indexes.</span>
            </Alert>
          </div>
        )}

        {!canManageIndexes && selectedCollection && !loadError && (
          <div className="border-b border-zinc-200 px-4 py-3 dark:border-white/5">
            <Alert variant="warning">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>The selected project token cannot manage indexes.</span>
            </Alert>
          </div>
        )}

        <div className="flex h-12 shrink-0 items-center gap-3 border-b border-zinc-200 bg-white px-4 dark:border-white/5 dark:bg-[#121212]">
          {selectedIndexFields.length > 0 ? (
            <>
              <span className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300">
                {selectedIndexFields.length} selected
              </span>
              <button
                type="button"
                disabled={!canEditIndexes}
                onClick={() => {
                  setDeleteTargets(selectedIndexFields);
                  setDeleteConfirm("");
                }}
                className="ml-auto inline-flex h-8 items-center rounded-md border border-red-200 bg-red-50 px-3 text-[13px] font-medium text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20"
              >
                Delete {selectedIndexFields.length}{" "}
                {selectedIndexFields.length === 1 ? "index" : "indexes"}
              </button>
            </>
          ) : (
            <>
              <div className="relative max-w-xl flex-1">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 text-zinc-400"
                />
                <input
                  type="search"
                  value={indexSearch}
                  onChange={(event) => setIndexSearch(event.target.value)}
                  placeholder="Filter indexes..."
                  className="h-10 w-full border-0 bg-transparent pl-7 pr-3 text-[13px] text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:text-zinc-100"
                />
              </div>
              <PrimaryButton
                icon={Plus}
                disabled={!canEditIndexes}
                onClick={openCreate}
                className="ml-auto shrink-0 py-1.5"
              >
                Create index
              </PrimaryButton>
            </>
          )}
        </div>

        <div className="min-h-0 min-w-0 flex-1 overflow-auto pb-16 custom-scrollbar">
          <table className="min-w-max w-full border-collapse text-left text-[13px]">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-white/5 dark:bg-[#1a1a1a]">
                <th className="w-11 border-r border-zinc-200 px-4 py-3 text-center dark:border-white/5">
                  <SelectionCheckbox
                    checked={allVisibleSelected}
                    mixed={someVisibleSelected}
                    checkedIcon="dash"
                    disabled={
                      visibleIndexFields.length === 0 || !canEditIndexes
                    }
                    label="Select visible indexes"
                    onClick={toggleVisibleIndexSelection}
                  />
                </th>
                {["Field", "State", "Operation"].map((heading) => (
                  <th
                    key={heading}
                    className="border-r border-zinc-200 px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 last:border-r-0 dark:border-white/5 dark:text-zinc-400"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 border-b border-zinc-100 dark:divide-white/5 dark:border-white/5">
              {!selectedCollection ? (
                <tr>
                  <td colSpan={4} className="px-6 py-16 text-center">
                    <EmptyIndexesState
                      title={
                        collections.length === 0
                          ? "No collections yet."
                          : "Choose a collection."
                      }
                      description={
                        collections.length === 0
                          ? "Create a collection before adding indexes."
                          : "Select a collection from the sidebar to manage indexes."
                      }
                    />
                  </td>
                </tr>
              ) : indexRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-16 text-center">
                    <EmptyIndexesState
                      title="No indexes yet."
                      description="Create an index for fields your app filters often."
                    />
                  </td>
                </tr>
              ) : visibleIndexes.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-16 text-center">
                    <EmptyIndexesState
                      title="No matching indexes."
                      description="Adjust the filter to show configured indexes."
                    />
                  </td>
                </tr>
              ) : (
                visibleIndexes.map((index) => {
                  const badge = STATE_BADGE[index.state] ?? STATE_BADGE.ready;
                  return (
                    <tr
                      key={index.field}
                      className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                    >
                      <td className="border-r border-zinc-100 px-4 py-3 text-center dark:border-white/5">
                        <SelectionCheckbox
                          checked={selectedIndexFields.includes(index.field)}
                          disabled={!canEditIndexes}
                          label={`Select index on ${index.field}`}
                          onClick={() => toggleIndexSelection(index.field)}
                        />
                      </td>
                      <td className="border-r border-zinc-100 px-4 py-3 dark:border-white/5">
                        <span className="font-mono text-[13px] font-medium text-zinc-800 dark:text-zinc-200">
                          {index.field}
                        </span>
                      </td>
                      <td className="border-r border-zinc-100 px-4 py-3 dark:border-white/5">
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        {index.operationId ? (
                          <Link
                            href="/dashboard/operations"
                            className="inline-flex items-center gap-1.5 font-mono text-[12px] text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                          >
                            {index.operationId} <ExternalLink size={12} />
                          </Link>
                        ) : (
                          <span className="text-[13px] text-zinc-500">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </main>

      {creating && (
        <SidePanel
          title="Create index"
          onClose={() => setCreating(false)}
          hasUnsavedChanges={!!field.trim() || asyncBuild !== true}
          footer={
            <>
              <SecondaryButton type="button" onClick={() => setCreating(false)}>
                Cancel
              </SecondaryButton>
              <PrimaryButton
                type="button"
                disabled={!field.trim() || !canEditIndexes}
                onClick={() => setCreateConfirm(true)}
              >
                Create index
              </PrimaryButton>
            </>
          }
        >
          {notice?.message && (
            <Alert
              variant={notice.status === "error" ? "danger" : notice.status}
            >
              <span>{notice.message}</span>
            </Alert>
          )}
          <div>
            <label
              htmlFor="index-field"
              className="mb-2 block text-[12px] font-medium text-zinc-700 dark:text-zinc-300"
            >
              Field name
            </label>
            <input
              id="index-field"
              type="text"
              value={field}
              onChange={(event) => setField(event.target.value)}
              placeholder="e.g. email"
              className="w-full rounded-md border border-zinc-200 bg-zinc-50 px-4 py-2.5 font-mono text-[13px] text-zinc-900 shadow-inner transition-colors focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-white/10 dark:bg-[#121212] dark:text-zinc-100"
            />
            <p className="mt-2 text-[12px] text-zinc-500">
              Use a top-level field your app filters often.
            </p>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 transition-colors hover:bg-zinc-100 dark:border-white/5 dark:bg-zinc-900/30 dark:hover:bg-zinc-800/50">
            <input
              type="checkbox"
              checked={asyncBuild}
              onChange={(event) => setAsyncBuild(event.target.checked)}
              className="mt-0.5 rounded border-zinc-700 bg-zinc-50 text-zinc-700 focus:ring-zinc-500 focus:ring-offset-0 dark:bg-[#121212] dark:text-zinc-300"
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
                  className="mb-2 block text-[12px] font-medium text-zinc-700 dark:text-zinc-300"
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
                  className="w-full rounded-md border border-zinc-200 bg-zinc-50 px-4 py-2.5 font-mono text-[13px] text-zinc-900 shadow-inner transition-colors focus:border-zinc-500 focus:outline-none dark:border-white/10 dark:bg-[#121212] dark:text-zinc-100"
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
    </div>
  );
}

function EmptyIndexesState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 text-zinc-500">
      <Zap size={22} />
      <span>{title}</span>
      <span className="max-w-[420px] text-[12px] leading-relaxed">
        {description}
      </span>
    </div>
  );
}

function upsertIndex(indexes: ProjectIndex[], nextIndex: ProjectIndex) {
  return [
    nextIndex,
    ...indexes.filter((index) => index.field !== nextIndex.field),
  ].sort((a, b) => a.field.localeCompare(b.field));
}
