"use client";

import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Code2,
  Database,
  FolderOpen,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import {
  Alert,
  Modal,
  PrimaryButton,
  SecondaryButton,
  SelectionCheckbox,
  ToastNotice,
} from "@/components/ui";
import type { ProjectDocument } from "@/lib/documents";
import { formatDate } from "@/lib/utils";
import {
  createDocumentAction,
  deleteDocumentsAction,
  updateDocumentAction,
} from "./actions";
import {
  type DocumentEditorContext,
  DocumentEditorPanel,
} from "./DocumentEditorPanel";
import { EMPTY_DOCUMENT_JSON } from "./document-editor";
import type { DocumentActionResult } from "./document-state";

const LIMIT_OPTIONS = [10, 25, 50, 100];

interface DeleteTarget {
  id: string;
  etag?: string;
}

export default function DataClient({
  database,
  collections,
  selectedCollection,
  documents,
  total,
  limit,
  offset,
  search,
  canReadDocuments,
  canWriteDocuments,
  loadError = "",
}: {
  database: string;
  collections: string[];
  selectedCollection?: string;
  documents: ProjectDocument[];
  total: number;
  limit: number;
  offset: number;
  search: string;
  canReadDocuments: boolean;
  canWriteDocuments: boolean;
  loadError?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState(search);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteTargets, setDeleteTargets] = useState<DeleteTarget[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [editor, setEditor] = useState<DocumentEditorContext | null>(null);
  const [notice, setNotice] = useState<DocumentActionResult | null>(null);
  const [collectionSearch, setCollectionSearch] = useState("");

  const pageIds = useMemo(
    () => documents.map((document) => document.id),
    [documents],
  );
  const visibleCollections = useMemo(() => {
    const collectionQuery = collectionSearch.trim().toLowerCase();
    if (!collectionQuery) return collections;
    return collections.filter((collection) =>
      collection.toLowerCase().includes(collectionQuery),
    );
  }, [collections, collectionSearch]);
  const selectedVisibleCount = pageIds.filter((id) =>
    selectedIds.includes(id),
  ).length;
  const allVisibleSelected =
    pageIds.length > 0 && selectedVisibleCount === pageIds.length;
  const someVisibleSelected =
    selectedVisibleCount > 0 && selectedVisibleCount < pageIds.length;
  const deleteRequirement = "delete";
  const canConfirmDelete = deleteConfirm.trim() === deleteRequirement;
  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + limit, total);
  const canGoPrevious = offset > 0;
  const canGoNext = offset + limit < total;

  const selectedDocuments = useMemo(
    () => documents.filter((document) => selectedIds.includes(document.id)),
    [documents, selectedIds],
  );

  useEffect(() => setQuery(search), [search]);

  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => pageIds.includes(id)));
  }, [pageIds]);

  function buildHref(overrides: {
    collection?: string;
    limit?: number;
    offset?: number;
    search?: string;
  }) {
    const params = new URLSearchParams();
    const nextCollection =
      overrides.collection ?? selectedCollection ?? collections[0];
    if (nextCollection) params.set("collection", nextCollection);
    params.set("limit", String(overrides.limit ?? limit));
    const nextOffset = overrides.offset ?? offset;
    if (nextOffset > 0) params.set("offset", String(nextOffset));
    const nextSearch = overrides.search ?? search;
    if (nextSearch.trim()) params.set("search", nextSearch.trim());
    return `/dashboard/data?${params.toString()}`;
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(buildHref({ search: query, offset: 0 }));
  }

  function refreshDocuments() {
    router.refresh();
  }

  function toggleDocument(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function toggleVisibleDocuments() {
    if (allVisibleSelected) {
      setSelectedIds((current) =>
        current.filter((id) => !pageIds.includes(id)),
      );
      return;
    }
    setSelectedIds((current) => Array.from(new Set([...current, ...pageIds])));
  }

  function openCreate() {
    setEditor({
      mode: "create",
      json: EMPTY_DOCUMENT_JSON,
    });
  }

  function openEdit(document: ProjectDocument) {
    setEditor({
      mode: "edit",
      id: document.id,
      etag: document.etag,
      json: JSON.stringify(document.document, null, 2),
    });
  }

  function saveEditor(json: string) {
    if (!editor || !selectedCollection) return;

    startTransition(async () => {
      const result =
        editor.mode === "create"
          ? await createDocumentAction(selectedCollection, json)
          : await updateDocumentAction(
              selectedCollection,
              editor.id,
              editor.etag,
              json,
            );
      setNotice(result);
      if (result.status !== "error") {
        setEditor(null);
        router.refresh();
      }
    });
  }

  function confirmDelete() {
    if (
      !selectedCollection ||
      deleteTargets.length === 0 ||
      !canConfirmDelete
    ) {
      return;
    }

    startTransition(async () => {
      const result = await deleteDocumentsAction(
        selectedCollection,
        deleteTargets,
      );
      setNotice(result);
      if (result.status !== "error") {
        setSelectedIds((current) =>
          current.filter(
            (id) => !deleteTargets.some((target) => target.id === id),
          ),
        );
        setDeleteTargets([]);
        setDeleteConfirm("");
        router.refresh();
      }
    });
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 animate-in fade-in duration-500">
      {notice?.message && (
        <ToastNotice
          message={notice.message}
          variant={notice.status === "error" ? "danger" : notice.status}
          onClose={() => setNotice(null)}
        />
      )}

      <aside className="flex w-[260px] shrink-0 flex-col overflow-hidden border-r border-zinc-200 bg-white dark:border-white/5 dark:bg-[#161616]">
        <div className="border-b border-zinc-200 px-4 py-4 dark:border-white/5">
          <h1 className="text-[16px] font-semibold text-zinc-900 dark:text-zinc-100">
            Documents
          </h1>
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
                <Link
                  key={collection}
                  href={buildHref({ collection, offset: 0, search: "" })}
                  className={`grid h-9 grid-cols-[18px_1fr] items-center gap-2 px-4 text-[13px] transition-colors ${
                    active
                      ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                      : "text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-800/50"
                  }`}
                >
                  <FolderOpen size={14} className="text-zinc-400" />
                  <span className="truncate font-mono">{collection}</span>
                </Link>
              );
            })
          )}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-white dark:bg-[#121212]">
        <div className="flex min-h-12 shrink-0 items-center gap-3 border-b border-zinc-200 px-4 dark:border-white/5">
          {selectedIds.length > 0 ? (
            <>
              <span className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300">
                {selectedIds.length} selected
              </span>
              <button
                type="button"
                disabled={!canWriteDocuments || isPending}
                onClick={() => {
                  setDeleteTargets(
                    selectedDocuments.map((document) => ({
                      id: document.id,
                      etag: document.etag,
                    })),
                  );
                  setDeleteConfirm("");
                }}
                className="ml-auto inline-flex h-8 items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 text-[13px] font-medium text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20"
              >
                <Trash2 size={14} />
                Delete {selectedIds.length}
              </button>
            </>
          ) : (
            <>
              <form
                onSubmit={submitSearch}
                className="relative min-w-0 max-w-xl flex-1"
              >
                <Search
                  size={14}
                  className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 text-zinc-400"
                />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search documents..."
                  className="h-10 w-full border-0 bg-transparent pl-7 pr-3 text-[13px] text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:text-zinc-100"
                />
              </form>
              <div className="ml-auto flex shrink-0 items-center gap-2">
                <select
                  value={limit}
                  onChange={(event) =>
                    router.push(
                      buildHref({
                        limit: Number(event.target.value),
                        offset: 0,
                      }),
                    )
                  }
                  className="h-8 w-[92px] shrink-0 rounded-md border border-zinc-200 bg-white px-2 text-[12px] text-zinc-700 focus:outline-none dark:border-white/10 dark:bg-[#161616] dark:text-zinc-300"
                  aria-label="Rows per page"
                >
                  {LIMIT_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {value} rows
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  aria-label="Refresh documents"
                  onClick={refreshDocuments}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-zinc-200 text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-zinc-900 dark:border-white/10 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                >
                  <RefreshCw size={14} />
                </button>
                <PrimaryButton
                  icon={Plus}
                  disabled={
                    !selectedCollection || !canWriteDocuments || isPending
                  }
                  onClick={openCreate}
                  className="shrink-0 whitespace-nowrap py-1.5"
                >
                  Create document
                </PrimaryButton>
              </div>
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

        {!canReadDocuments && !loadError && (
          <div className="border-b border-zinc-200 px-4 py-3 dark:border-white/5">
            <Alert variant="warning">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>The selected project token cannot read documents.</span>
            </Alert>
          </div>
        )}

        <div className="min-h-0 min-w-0 flex-1 overflow-auto pb-16 custom-scrollbar">
          <table className="min-w-[980px] w-full border-collapse text-left text-[13px]">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-white/5 dark:bg-[#1a1a1a]">
                <th className="w-11 border-r border-zinc-200 px-4 py-3 text-center dark:border-white/5">
                  <SelectionCheckbox
                    checked={allVisibleSelected}
                    mixed={someVisibleSelected}
                    checkedIcon="dash"
                    disabled={documents.length === 0}
                    label="Select visible documents"
                    onClick={toggleVisibleDocuments}
                  />
                </th>
                {["ID", "Document", "Updated", "ETag", ""].map((heading) => (
                  <th
                    key={heading || "actions"}
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
                  <td colSpan={6} className="px-6 py-16">
                    <EmptyDocumentsState
                      hasCollections={collections.length > 0}
                    />
                  </td>
                </tr>
              ) : documents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16">
                    <EmptyCollectionState
                      canCreate={canWriteDocuments}
                      onCreate={openCreate}
                    />
                  </td>
                </tr>
              ) : (
                documents.map((document) => (
                  <tr
                    key={document.id}
                    className="cursor-pointer transition-colors hover:bg-zinc-50 focus-within:bg-zinc-50 dark:hover:bg-zinc-900/50 dark:focus-within:bg-zinc-900/50"
                    onClick={() => openEdit(document)}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openEdit(document);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <td className="border-r border-zinc-100 px-4 py-3 text-center dark:border-white/5">
                      <SelectionCheckbox
                        checked={selectedIds.includes(document.id)}
                        label={`Select ${document.id}`}
                        onClick={() => toggleDocument(document.id)}
                      />
                    </td>
                    <td className="border-r border-zinc-100 px-4 py-3 dark:border-white/5">
                      <span className="font-mono text-[12px] font-medium text-zinc-800 dark:text-zinc-200">
                        {document.id}
                      </span>
                    </td>
                    <td className="max-w-[420px] border-r border-zinc-100 px-4 py-3 dark:border-white/5">
                      <span className="block truncate font-mono text-[12px] text-zinc-600 dark:text-zinc-300">
                        {documentPreview(document.document)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap border-r border-zinc-100 px-4 py-3 text-[12px] text-zinc-500 dark:border-white/5">
                      {document.updated_at
                        ? formatDate(document.updated_at)
                        : "-"}
                    </td>
                    <td className="max-w-[240px] border-r border-zinc-100 px-4 py-3 dark:border-white/5">
                      <span className="block truncate font-mono text-[12px] text-zinc-500">
                        {document.etag}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={!canWriteDocuments || isPending}
                        aria-label={`Delete document ${document.id}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setDeleteTargets([
                            { id: document.id, etag: document.etag },
                          ]);
                          setDeleteConfirm("");
                        }}
                        className="inline-flex items-center text-zinc-400 transition-colors hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex shrink-0 items-center justify-between border-t border-zinc-200 bg-zinc-50 px-5 py-3 dark:border-white/5 dark:bg-[#1a1a1a]">
          <span className="text-[12px] font-medium text-zinc-500">
            {pageStart}-{pageEnd} of {total}
          </span>
          <div className="flex items-center gap-2">
            <Link
              aria-disabled={!canGoPrevious}
              href={
                canGoPrevious
                  ? buildHref({ offset: Math.max(0, offset - limit) })
                  : "#"
              }
              className={`inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-200 transition-colors dark:border-white/10 ${
                canGoPrevious
                  ? "text-zinc-500 hover:bg-white hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                  : "pointer-events-none text-zinc-300 dark:text-zinc-700"
              }`}
            >
              <ChevronLeft size={16} />
            </Link>
            <Link
              aria-disabled={!canGoNext}
              href={canGoNext ? buildHref({ offset: offset + limit }) : "#"}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-200 transition-colors dark:border-white/10 ${
                canGoNext
                  ? "text-zinc-500 hover:bg-white hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                  : "pointer-events-none text-zinc-300 dark:text-zinc-700"
              }`}
            >
              <ChevronRight size={16} />
            </Link>
          </div>
        </div>
      </main>

      {editor && (
        <DocumentEditorPanel
          editor={editor}
          disabled={!canWriteDocuments}
          isPending={isPending}
          onClose={() => setEditor(null)}
          onSave={saveEditor}
        />
      )}

      {deleteTargets.length > 0 && (
        <Modal
          title={
            deleteTargets.length === 1 ? "Delete document" : "Delete documents"
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
                disabled={!canWriteDocuments || isPending || !canConfirmDelete}
                onClick={confirmDelete}
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
                    {deleteTargets[0].id}
                  </span>
                ) : (
                  <span className="font-semibold text-red-900 dark:text-red-100">
                    {deleteTargets.length} documents
                  </span>
                )}{" "}
                from{" "}
                <span className="font-mono text-red-900 dark:text-red-100">
                  {selectedCollection}
                </span>
                .
              </span>
            </div>
            <div>
              <label
                htmlFor="delete-documents-confirm"
                className="mb-2 block text-[12px] font-medium text-zinc-700 dark:text-zinc-300"
              >
                Type <span className="font-mono">delete</span> to confirm
              </label>
              <input
                id="delete-documents-confirm"
                value={deleteConfirm}
                onChange={(event) => setDeleteConfirm(event.target.value)}
                className="w-full rounded-md border border-zinc-200 bg-zinc-50 px-4 py-2.5 font-mono text-[13px] text-zinc-900 shadow-inner transition-colors focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-white/10 dark:bg-[#121212] dark:text-zinc-100"
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function EmptyDocumentsState({ hasCollections }: { hasCollections: boolean }) {
  return (
    <div className="mx-auto flex max-w-[420px] flex-col items-center text-center">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-white/10 dark:bg-[#161616] dark:text-zinc-400">
        <Database size={17} />
      </div>
      <h2 className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">
        {hasCollections ? "Choose a collection" : "No collections yet"}
      </h2>
      <p className="mt-2 text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">
        {hasCollections
          ? "Select a collection from the sidebar to view documents."
          : "Create a collection before adding documents."}
      </p>
      {!hasCollections && (
        <Link
          href="/dashboard/collections"
          className="mt-5 inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-[13px] font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 dark:border-white/10 dark:bg-[#1e1e1e] dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          <Plus size={14} />
          New collection
        </Link>
      )}
    </div>
  );
}

function EmptyCollectionState({
  canCreate,
  onCreate,
}: {
  canCreate: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-[420px] flex-col items-center text-center">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-white/10 dark:bg-[#161616] dark:text-zinc-400">
        <Code2 size={17} />
      </div>
      <h2 className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">
        No documents yet
      </h2>
      <p className="mt-2 text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">
        Insert the first JSON object for this collection.
      </p>
      {canCreate && (
        <button
          type="button"
          onClick={onCreate}
          className="mt-5 inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-[13px] font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 dark:border-white/10 dark:bg-[#1e1e1e] dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          <Plus size={14} />
          Create document
        </button>
      )}
    </div>
  );
}

function documentPreview(document: Record<string, unknown>): string {
  const value = JSON.stringify(document);
  if (value.length <= 220) return value;
  return `${value.slice(0, 217)}...`;
}
