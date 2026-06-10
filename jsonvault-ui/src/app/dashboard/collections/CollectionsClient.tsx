"use client";

import { AlertTriangle, FolderOpen, Plus, Search, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Alert,
  Modal,
  PrimaryButton,
  SecondaryButton,
  SelectionCheckbox,
  SidePanel,
  ToastNotice,
} from "@/components/ui";
import { WorkspacePage } from "@/components/Workspace";
import type { ProjectCollectionSummary } from "@/lib/collections";
import { createCollectionAction, deleteCollectionsAction } from "./actions";
import type { CollectionActionResult } from "./collection-state";

export default function CollectionsClient({
  database,
  collections,
  canManageCollections,
  loadError = "",
}: {
  database: string;
  collections: ProjectCollectionSummary[];
  canManageCollections: boolean;
  loadError?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [query, setQuery] = useState("");
  const [selectedNames, setSelectedNames] = useState<string[]>([]);
  const [deleteTargets, setDeleteTargets] = useState<string[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [notice, setNotice] = useState<CollectionActionResult | null>(null);

  const collectionNames = useMemo(
    () => collections.map((collection) => collection.name),
    [collections],
  );
  const visibleCollections = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return collections;
    return collections.filter((collection) =>
      collection.name.toLowerCase().includes(normalizedQuery),
    );
  }, [collections, query]);
  const visibleNames = visibleCollections.map((collection) => collection.name);
  const allVisibleSelected =
    visibleNames.length > 0 &&
    visibleNames.every((name) => selectedNames.includes(name));
  const someVisibleSelected =
    !allVisibleSelected &&
    visibleNames.some((name) => selectedNames.includes(name));
  const deleteRequirement =
    deleteTargets.length === 1 ? deleteTargets[0] : "delete";
  const canConfirmDelete = deleteConfirm.trim() === deleteRequirement;

  useEffect(() => {
    setSelectedNames((current) =>
      current.filter((name) => collectionNames.includes(name)),
    );
  }, [collectionNames]);

  function openCreate() {
    setNewName("");
    setCreating(true);
  }

  function handleCreate() {
    if (!canManageCollections || !newName.trim()) return;
    startTransition(async () => {
      const result = await createCollectionAction(newName);
      setNotice(result);
      if (result.status !== "error") {
        setCreating(false);
        setNewName("");
        router.refresh();
      }
    });
  }

  function handleDelete() {
    if (
      !canManageCollections ||
      deleteTargets.length === 0 ||
      !canConfirmDelete
    ) {
      return;
    }
    startTransition(async () => {
      const result = await deleteCollectionsAction(deleteTargets);
      setNotice(result);
      if (result.status !== "error") {
        setSelectedNames((current) =>
          current.filter((name) => !deleteTargets.includes(name)),
        );
        setDeleteTargets([]);
        setDeleteConfirm("");
        router.refresh();
      }
    });
  }

  function toggleName(name: string) {
    setSelectedNames((current) =>
      current.includes(name)
        ? current.filter((item) => item !== name)
        : [...current, name],
    );
  }

  function toggleVisibleNames() {
    if (allVisibleSelected) {
      setSelectedNames((current) =>
        current.filter((name) => !visibleNames.includes(name)),
      );
      return;
    }
    setSelectedNames((current) =>
      Array.from(new Set([...current, ...visibleNames])),
    );
  }

  return (
    <WorkspacePage title="Collections" hideHeader>
      {notice?.message && (
        <ToastNotice
          message={notice.message}
          variant={notice.status === "error" ? "danger" : notice.status}
          onClose={() => setNotice(null)}
        />
      )}

      <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
        <div className="flex min-h-12 shrink-0 items-center gap-3 border-b border-zinc-200 bg-white px-4 dark:border-white/5 dark:bg-[#121212]">
          {selectedNames.length > 0 ? (
            <>
              <span className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300">
                {selectedNames.length} selected
              </span>
              <button
                type="button"
                disabled={!canManageCollections || isPending}
                onClick={() => {
                  setDeleteTargets(selectedNames);
                  setDeleteConfirm("");
                }}
                className="ml-auto inline-flex h-8 items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 text-[13px] font-medium text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20"
              >
                <Trash2 size={14} />
                Delete {selectedNames.length}
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
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Filter collections..."
                  className="h-10 w-full border-0 bg-transparent pl-7 pr-3 text-[13px] text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:text-zinc-100"
                />
              </div>
              <PrimaryButton
                icon={Plus}
                disabled={!canManageCollections || isPending}
                onClick={openCreate}
                className="ml-auto shrink-0 py-1.5"
                title={
                  canManageCollections
                    ? "New collection"
                    : "Requires collections:manage"
                }
              >
                New collection
              </PrimaryButton>
            </>
          )}
        </div>

        {loadError && (
          <div className="border-b border-zinc-200 px-4 py-3 dark:border-white/5">
            <Alert variant="danger">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{loadError}</span>
            </Alert>
          </div>
        )}

        {!canManageCollections && !loadError && (
          <div className="border-b border-zinc-200 px-4 py-3 dark:border-white/5">
            <Alert variant="warning">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>
                The selected project token can read collections but cannot
                create or delete them.
              </span>
            </Alert>
          </div>
        )}

        <div className="min-h-0 min-w-0 flex-1 overflow-auto pb-16 custom-scrollbar">
          <table className="min-w-[860px] w-full border-collapse text-left text-[13px]">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-white/5 dark:bg-[#1a1a1a]">
                <th className="w-11 border-r border-zinc-200 px-4 py-3 text-center dark:border-white/5">
                  <SelectionCheckbox
                    checked={allVisibleSelected}
                    mixed={someVisibleSelected}
                    checkedIcon="dash"
                    disabled={visibleNames.length === 0}
                    label="Select visible collections"
                    onClick={toggleVisibleNames}
                  />
                </th>
                {["Collection", "Documents", "API path", ""].map((heading) => (
                  <th
                    key={heading || "actions"}
                    className="border-r border-zinc-200 px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 last:border-r-0 dark:border-white/5 dark:text-zinc-400"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody
              className={`divide-y divide-zinc-100 dark:divide-white/5 ${visibleCollections.length > 0 ? "border-b border-zinc-100 dark:border-white/5" : ""}`}
            >
              {collections.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-16">
                    <EmptyState
                      canCreate={canManageCollections}
                      onCreate={openCreate}
                    />
                  </td>
                </tr>
              ) : visibleCollections.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-16 text-center text-zinc-500"
                  >
                    No matching collections.
                  </td>
                </tr>
              ) : (
                visibleCollections.map((collection) => {
                  const href = `/dashboard/data?collection=${encodeURIComponent(collection.name)}`;
                  return (
                    <tr
                      key={collection.name}
                      className="cursor-pointer transition-colors hover:bg-zinc-50 focus-within:bg-zinc-50 dark:hover:bg-zinc-900/50 dark:focus-within:bg-zinc-900/50"
                      onClick={() => router.push(href)}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget) return;
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          router.push(href);
                        }
                      }}
                      role="link"
                      tabIndex={0}
                    >
                      <td className="border-r border-zinc-100 px-4 py-3 text-center dark:border-white/5">
                        <SelectionCheckbox
                          checked={selectedNames.includes(collection.name)}
                          label={`Select ${collection.name}`}
                          onClick={() => toggleName(collection.name)}
                        />
                      </td>
                      <td className="border-r border-zinc-100 px-4 py-3 dark:border-white/5">
                        <span className="inline-flex items-center gap-2 font-mono text-[13px] font-medium text-zinc-800 dark:text-zinc-200">
                          <FolderOpen size={14} className="text-zinc-400" />
                          {collection.name}
                        </span>
                      </td>
                      <td className="border-r border-zinc-100 px-4 py-3 text-zinc-600 dark:border-white/5 dark:text-zinc-400">
                        {formatDocumentCount(collection.documentCount)}
                      </td>
                      <td className="border-r border-zinc-100 px-4 py-3 dark:border-white/5">
                        <code className="font-mono text-[12px] text-zinc-500">
                          /api/v1/{database}/{collection.name}
                        </code>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          disabled={!canManageCollections || isPending}
                          aria-label={`Delete collection ${collection.name}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setDeleteTargets([collection.name]);
                            setDeleteConfirm("");
                          }}
                          className="inline-flex items-center text-zinc-400 transition-colors hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {creating && (
        <SidePanel
          title="New collection"
          onClose={() => setCreating(false)}
          hasUnsavedChanges={!!newName.trim()}
          footer={
            <>
              <SecondaryButton type="button" onClick={() => setCreating(false)}>
                Cancel
              </SecondaryButton>
              <PrimaryButton
                disabled={!canManageCollections || isPending || !newName.trim()}
                onClick={handleCreate}
              >
                {isPending ? "Creating..." : "Create collection"}
              </PrimaryButton>
            </>
          }
        >
          <div>
            <label
              htmlFor="collection-name"
              className="mb-2 block text-[12px] font-medium text-zinc-700 dark:text-zinc-300"
            >
              Collection name
            </label>
            <input
              id="collection-name"
              type="text"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="orders"
              className="w-full rounded-md border border-zinc-200 bg-zinc-50 px-4 py-2.5 font-mono text-[13px] text-zinc-900 shadow-inner transition-colors focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-white/10 dark:bg-[#121212] dark:text-zinc-100"
            />
            <p className="mt-2 text-[12px] leading-relaxed text-zinc-500">
              Use letters, numbers, underscores, dashes, and dots. Names must
              start with a letter or number.
            </p>
          </div>
        </SidePanel>
      )}

      {deleteTargets.length > 0 && (
        <Modal
          title={
            deleteTargets.length === 1
              ? "Delete collection"
              : "Delete collections"
          }
          onClose={() => {
            setDeleteTargets([]);
            setDeleteConfirm("");
          }}
          footer={
            <>
              <SecondaryButton
                type="button"
                onClick={() => {
                  setDeleteTargets([]);
                  setDeleteConfirm("");
                }}
              >
                Cancel
              </SecondaryButton>
              <button
                type="button"
                disabled={
                  !canManageCollections || isPending || !canConfirmDelete
                }
                onClick={handleDelete}
                className="inline-flex items-center gap-2 rounded-md border border-red-500/20 bg-red-500/10 px-4 py-2 text-[13px] font-medium text-red-500 shadow-sm transition-colors hover:bg-red-500/20 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-45 dark:text-red-400 dark:hover:text-red-300"
              >
                <Trash2 size={14} />
                {isPending ? "Deleting..." : "Delete"}
              </button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-[13px] leading-relaxed text-red-700 shadow-sm dark:border-red-500/20 dark:bg-red-500/5 dark:text-red-300">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>
                This deletes{" "}
                {deleteTargets.length === 1 ? (
                  <span className="font-mono font-semibold text-red-900 dark:text-red-100">
                    {deleteTargets[0]}
                  </span>
                ) : (
                  <span className="font-semibold text-red-900 dark:text-red-100">
                    {deleteTargets.length} collections
                  </span>
                )}{" "}
                and their documents, schema, indexes, search settings, and
                webhook targets.
              </span>
            </div>

            {deleteTargets.length > 1 && (
              <div className="max-h-32 overflow-y-auto rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-white/10 dark:bg-[#121212] custom-scrollbar">
                <div className="flex flex-wrap gap-2">
                  {deleteTargets.map((target) => (
                    <span
                      key={target}
                      className="rounded-md border border-zinc-200 bg-white px-2 py-1 font-mono text-[12px] text-zinc-600 dark:border-white/10 dark:bg-[#161616] dark:text-zinc-300"
                    >
                      {target}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label
                htmlFor="delete-collection-confirm"
                className="mb-2 block text-[12px] font-medium text-zinc-700 dark:text-zinc-300"
              >
                Type <span className="font-mono">{deleteRequirement}</span> to
                confirm
              </label>
              <input
                id="delete-collection-confirm"
                value={deleteConfirm}
                onChange={(event) => setDeleteConfirm(event.target.value)}
                className="w-full rounded-md border border-zinc-200 bg-zinc-50 px-4 py-2.5 font-mono text-[13px] text-zinc-900 shadow-inner transition-colors focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-white/10 dark:bg-[#121212] dark:text-zinc-100"
              />
            </div>
          </div>
        </Modal>
      )}
    </WorkspacePage>
  );
}

function EmptyState({
  canCreate,
  onCreate,
}: {
  canCreate: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-[420px] flex-col items-center text-center">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-white/10 dark:bg-[#161616] dark:text-zinc-400">
        <FolderOpen size={17} />
      </div>
      <h2 className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">
        No collections yet
      </h2>
      <p className="mt-2 text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">
        Create a collection or insert the first document through the Core API.
      </p>
      {canCreate && (
        <button
          type="button"
          onClick={onCreate}
          className="mt-5 inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-[13px] font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 dark:border-white/10 dark:bg-[#1e1e1e] dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          <Plus size={14} />
          New collection
        </button>
      )}
    </div>
  );
}

function formatDocumentCount(value: number | null): string {
  return value === null ? "Unknown" : value.toLocaleString();
}
