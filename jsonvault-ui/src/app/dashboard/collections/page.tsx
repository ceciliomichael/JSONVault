"use client";

import { AlertTriangle, Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
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
import { WorkspacePage } from "@/components/Workspace";
import { useDashboardMock } from "@/lib/mock-dashboard-store";

export default function CollectionsPage() {
  const router = useRouter();
  const {
    collections,
    setSelectedCollection,
    createCollection,
    deleteCollection,
  } = useDashboardMock();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [collectionSearch, setCollectionSearch] = useState("");
  const [selectedCollectionNames, setSelectedCollectionNames] = useState<
    string[]
  >([]);
  const [notice, setNotice] = useState("");
  const [deleteTargets, setDeleteTargets] = useState<string[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [createConfirm, setCreateConfirm] = useState(false);

  const visibleCollections = collections.filter((collection) =>
    collection.name
      .toLowerCase()
      .includes(collectionSearch.trim().toLowerCase()),
  );
  const visibleCollectionNames = visibleCollections.map(
    (collection) => collection.name,
  );
  const allVisibleSelected =
    visibleCollectionNames.length > 0 &&
    visibleCollectionNames.every((name) =>
      selectedCollectionNames.includes(name),
    );
  const someVisibleSelected =
    !allVisibleSelected &&
    visibleCollectionNames.some((name) =>
      selectedCollectionNames.includes(name),
    );
  const deleteRequirement =
    deleteTargets.length === 1 ? deleteTargets[0] : "delete";

  function openCreate() {
    setNewName("");
    setCreateConfirm(false);
    setCreating(true);
  }

  function handleCreate() {
    setCreateConfirm(false);
    const result = createCollection(newName);
    setNotice(result.message);
    if (!result.ok) return;
    setNewName("");
    setCreating(false);
  }

  function handleDelete() {
    if (deleteTargets.length === 0) return;
    let lastMessage = "";
    for (const target of deleteTargets) {
      const result = deleteCollection(target);
      lastMessage = result.message;
    }
    setNotice(
      deleteTargets.length === 1
        ? lastMessage
        : `Deleted ${deleteTargets.length} collections.`,
    );
    setSelectedCollectionNames((current) =>
      current.filter((name) => !deleteTargets.includes(name)),
    );
    setDeleteTargets([]);
    setDeleteConfirm("");
  }

  function toggleCollectionSelection(name: string) {
    setSelectedCollectionNames((current) =>
      current.includes(name)
        ? current.filter((item) => item !== name)
        : [...current, name],
    );
  }

  function toggleVisibleCollectionSelection() {
    if (allVisibleSelected) {
      setSelectedCollectionNames((current) =>
        current.filter((name) => !visibleCollectionNames.includes(name)),
      );
      return;
    }
    setSelectedCollectionNames((current) =>
      Array.from(new Set([...current, ...visibleCollectionNames])),
    );
  }

  function openCollection(name: string) {
    setSelectedCollection(name);
    router.push("/dashboard/data");
  }

  return (
    <WorkspacePage title="Collections" hideHeader>
      {notice && (
        <ToastNotice
          message={notice}
          variant={notice.includes("cannot") ? "warning" : "success"}
          onClose={() => setNotice("")}
        />
      )}

      <div className="h-full min-h-0 min-w-0 overflow-hidden flex flex-col">
        <div className="h-12 shrink-0 flex items-center gap-3 px-4 border-b border-zinc-200 dark:border-white/5 bg-white dark:bg-[#121212]">
          {selectedCollectionNames.length > 0 ? (
            <>
              <span className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300">
                {selectedCollectionNames.length} selected
              </span>
              <button
                type="button"
                onClick={() => {
                  setDeleteTargets(selectedCollectionNames);
                  setDeleteConfirm("");
                }}
                className="ml-auto h-8 inline-flex items-center rounded-md border border-red-200 bg-red-50 px-3 text-[13px] font-medium text-red-700 hover:bg-red-100 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20 transition-colors"
              >
                Delete {selectedCollectionNames.length}{" "}
                {selectedCollectionNames.length === 1
                  ? "collection"
                  : "collections"}
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
                  value={collectionSearch}
                  onChange={(event) => setCollectionSearch(event.target.value)}
                  placeholder="Filter collections..."
                  className="w-full h-10 pl-7 pr-3 text-[13px] bg-transparent border-0 focus:outline-none placeholder:text-zinc-400 text-zinc-900 dark:text-zinc-100"
                />
              </div>
              <PrimaryButton
                icon={Plus}
                onClick={openCreate}
                className="ml-auto shrink-0 py-1.5"
              >
                New collection
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
                    disabled={visibleCollectionNames.length === 0}
                    label="Select visible collections"
                    onClick={toggleVisibleCollectionSelection}
                  />
                </th>
                {["Collection", "Documents", "Indexes", "Schema", "Search"].map(
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
              {collections.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-16 text-center text-zinc-500"
                  >
                    No collections yet.
                  </td>
                </tr>
              ) : visibleCollections.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-16 text-center text-zinc-500"
                  >
                    No matching collections.
                  </td>
                </tr>
              ) : (
                visibleCollections.map((collection) => (
                  <tr
                    key={collection.name}
                    onClick={() => openCollection(collection.name)}
                    className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors group cursor-pointer"
                  >
                    <td className="px-4 py-3 text-center border-r border-zinc-100 dark:border-white/5">
                      <SelectionCheckbox
                        checked={selectedCollectionNames.includes(
                          collection.name,
                        )}
                        label={`Select ${collection.name}`}
                        onClick={() =>
                          toggleCollectionSelection(collection.name)
                        }
                      />
                    </td>
                    <td className="px-4 py-3 border-r border-zinc-100 dark:border-white/5">
                      <span className="font-mono text-[13px] font-medium text-zinc-800 dark:text-zinc-200 group-hover:underline">
                        {collection.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400 border-r border-zinc-100 dark:border-white/5">
                      {collection.documents.length.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400 border-r border-zinc-100 dark:border-white/5">
                      {collection.indexes.length}
                    </td>
                    <td className="px-4 py-3 border-r border-zinc-100 dark:border-white/5">
                      <Badge
                        variant={collection.schema ? "success" : "neutral"}
                      >
                        {collection.schema ? "set" : "none"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 border-r border-zinc-100 dark:border-white/5">
                      <Badge
                        variant={
                          collection.ftsFields.length > 0
                            ? "success"
                            : "neutral"
                        }
                      >
                        {collection.ftsFields.length > 0 ? "enabled" : "off"}
                      </Badge>
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
          title="New collection"
          onClose={() => setCreating(false)}
          hasUnsavedChanges={!!newName.trim()}
          footer={
            <>
              <SecondaryButton onClick={() => setCreating(false)}>
                Cancel
              </SecondaryButton>
              <PrimaryButton
                disabled={!newName.trim()}
                onClick={() => setCreateConfirm(true)}
              >
                Create collection
              </PrimaryButton>
            </>
          }
        >
          <div>
            <label
              htmlFor="collection-name"
              className="block text-[12px] font-medium text-zinc-700 dark:text-zinc-300 mb-2"
            >
              Collection name
            </label>
            <input
              id="collection-name"
              type="text"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="e.g. orders"
              className="w-full font-mono text-[13px] bg-zinc-50 dark:bg-[#121212] border border-zinc-200 dark:border-white/10 rounded-md px-4 py-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-colors shadow-inner"
            />
            <p className="text-[12px] text-zinc-500 mt-2 leading-relaxed">
              Use letters, numbers, underscores, hyphens, and dots. Names must
              start with a letter or number.
            </p>
          </div>
        </SidePanel>
      )}

      {createConfirm && (
        <ConfirmModal
          title="Create collection?"
          description={
            <p className="text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">
              Confirm before creating{" "}
              <span className="font-mono text-zinc-800 dark:text-zinc-200">
                {newName.trim()}
              </span>
              .
            </p>
          }
          confirmLabel="Create collection"
          onClose={() => setCreateConfirm(false)}
          onConfirm={handleCreate}
        />
      )}

      {deleteTargets.length > 0 && (
        <ConfirmModal
          title={
            deleteTargets.length === 1
              ? "Delete collection"
              : "Delete collections"
          }
          description={
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-3 p-4 rounded-lg bg-red-50 dark:bg-red-500/5 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-300 text-[13px] leading-relaxed shadow-sm">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
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
                <div className="max-h-32 overflow-y-auto custom-scrollbar rounded-md border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-[#121212] p-3">
                  <div className="flex flex-wrap gap-2">
                    {deleteTargets.map((target) => (
                      <span
                        key={target}
                        className="font-mono text-[12px] px-2 py-1 rounded-md border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#161616] text-zinc-600 dark:text-zinc-300"
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
                  className="block text-[12px] font-medium text-zinc-700 dark:text-zinc-300 mb-2"
                >
                  Type{" "}
                  <span className="font-mono text-zinc-800 dark:text-zinc-200">
                    {deleteRequirement}
                  </span>{" "}
                  to confirm
                </label>
                <input
                  id="delete-collection-confirm"
                  value={deleteConfirm}
                  onChange={(event) => setDeleteConfirm(event.target.value)}
                  className="w-full font-mono text-[13px] bg-zinc-50 dark:bg-[#121212] border border-zinc-200 dark:border-white/10 rounded-md px-4 py-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-500 shadow-inner transition-colors"
                />
              </div>
            </div>
          }
          confirmLabel={
            deleteTargets.length === 1
              ? "Delete collection"
              : "Delete collections"
          }
          danger
          onConfirm={() => {
            if (deleteConfirm === deleteRequirement) handleDelete();
          }}
          onClose={() => {
            setDeleteTargets([]);
            setDeleteConfirm("");
          }}
        />
      )}
    </WorkspacePage>
  );
}
