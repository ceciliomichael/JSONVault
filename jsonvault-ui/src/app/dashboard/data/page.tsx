"use client";

import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Code2,
  Database,
  FolderOpen,
  Info,
  Plus,
  RefreshCw,
  Search,
  Table2,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  ConfirmModal,
  Dropdown,
  DropdownItem,
  EmptyState,
  PrimaryButton,
  SecondaryButton,
  SelectionCheckbox,
  ToastNotice,
} from "@/components/ui";
import type { MockDocument } from "@/lib/mock-dashboard-store";
import { useDashboardMock } from "@/lib/mock-dashboard-store";
import { handleTextareaIndent } from "@/lib/textarea-indent";
import { formatDate } from "@/lib/utils";

const LIMITS = [10, 25, 50, 100];
const FIELD_KINDS = ["string", "number", "boolean", "json"] as const;

type FieldKind = (typeof FIELD_KINDS)[number];
type EditorTab = "fields" | "json";

interface EditableField {
  id: string;
  key: string;
  kind: FieldKind;
  value: string;
}

function statusBadge(value: unknown) {
  if (value === "active" || value === "published") {
    return { variant: "success" as const, label: String(value) };
  }
  if (typeof value === "string" && value.length > 0) {
    return { variant: "neutral" as const, label: value };
  }
  return { variant: "neutral" as const, label: "document" };
}

function cellValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function fieldId() {
  return `field_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function fieldKindForValue(value: unknown): FieldKind {
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "string") return "string";
  return "json";
}

function fieldValueForEdit(value: unknown) {
  if (value === null || typeof value === "object" || Array.isArray(value)) {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

function documentToFields(document: Record<string, unknown>): EditableField[] {
  return Object.entries(document).map(([key, value]) => ({
    id: fieldId(),
    key,
    kind: fieldKindForValue(value),
    value: fieldValueForEdit(value),
  }));
}

function fieldsToDocument(fields: EditableField[]): {
  value?: Record<string, unknown>;
  error?: string;
} {
  const document: Record<string, unknown> = {};
  for (const field of fields) {
    const key = field.key.trim();
    if (!key) return { error: "Field names cannot be empty." };
    if (Object.hasOwn(document, key)) {
      return { error: `Field "${key}" is duplicated.` };
    }
    if (field.kind === "number") {
      const numeric = Number(field.value);
      if (!Number.isFinite(numeric)) {
        return { error: `${key} must be a valid number.` };
      }
      document[key] = numeric;
      continue;
    }
    if (field.kind === "boolean") {
      document[key] = field.value === "true";
      continue;
    }
    if (field.kind === "json") {
      try {
        document[key] = JSON.parse(field.value) as unknown;
      } catch (error) {
        return {
          error:
            error instanceof Error
              ? `${key}: ${error.message}`
              : `${key}: ${String(error)}`,
        };
      }
      continue;
    }
    document[key] = field.value;
  }
  return { value: document };
}

function defaultFields(): EditableField[] {
  return [
    { id: fieldId(), key: "name", kind: "string", value: "New document" },
  ];
}

function fieldRowsFingerprint(fields: EditableField[]) {
  return JSON.stringify(
    fields.map((field) => ({
      key: field.key,
      kind: field.kind,
      value: field.value,
    })),
  );
}

export default function DataPage() {
  const {
    selectedCollection,
    collections,
    setSelectedCollection,
    createDocument,
    updateDocument,
    deleteDocument,
  } = useDashboardMock();
  const [search, setSearch] = useState("");
  const [collectionSearch, setCollectionSearch] = useState("");
  const [limit, setLimit] = useState(10);
  const [offset, setOffset] = useState(0);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [docDeleteTargets, setDocDeleteTargets] = useState<string[]>([]);
  const [docDeleteConfirm, setDocDeleteConfirm] = useState("");
  const [editing, setEditing] = useState<MockDocument | "new" | null>(null);
  const [editorLocked, setEditorLocked] = useState(false);
  const [editorTab, setEditorTab] = useState<EditorTab>("fields");
  const [fieldRows, setFieldRows] = useState<EditableField[]>(defaultFields);
  const [editJson, setEditJson] = useState("");
  const [editorBaseline, setEditorBaseline] = useState({
    fields: fieldRowsFingerprint(defaultFields()),
    json: JSON.stringify(fieldsToDocument(defaultFields()).value, null, 2),
  });
  const [editorDiscardConfirm, setEditorDiscardConfirm] = useState<
    "close" | "cancel" | null
  >(null);
  const [editorSaveConfirm, setEditorSaveConfirm] = useState(false);
  const [jsonError, setJsonError] = useState("");
  const [notice, setNotice] = useState("");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return selectedCollection.documents;
    return selectedCollection.documents.filter(
      (doc) =>
        doc.id.toLowerCase().includes(query) ||
        JSON.stringify(doc.document).toLowerCase().includes(query),
    );
  }, [search, selectedCollection.documents]);
  const filteredCollections = useMemo(() => {
    const query = collectionSearch.trim().toLowerCase();
    if (!query) return collections;
    return collections.filter((collection) =>
      collection.name.toLowerCase().includes(query),
    );
  }, [collections, collectionSearch]);

  const total = filtered.length;
  const page = filtered.slice(offset, offset + limit);
  const columnKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const doc of selectedCollection.documents) {
      for (const key of Object.keys(doc.document)) keys.add(key);
    }
    const preferred = ["name", "title", "email", "status", "score"];
    return [
      ...preferred.filter((key) => keys.has(key)),
      ...Array.from(keys)
        .filter((key) => !preferred.includes(key))
        .sort(),
    ].slice(0, 6);
  }, [selectedCollection.documents]);
  const pageIds = page.map((doc) => doc.id);
  const selectedVisibleCount = pageIds.filter((id) =>
    selectedDocIds.includes(id),
  ).length;
  const allVisibleSelected =
    pageIds.length > 0 && selectedVisibleCount === pageIds.length;
  const someVisibleSelected =
    selectedVisibleCount > 0 && selectedVisibleCount < pageIds.length;
  const selectedCollectionName = selectedCollection.name;

  useEffect(() => {
    if (!selectedCollectionName) return;
    setSelectedDocIds([]);
    setOffset(0);
  }, [selectedCollectionName]);

  function selectedDocuments() {
    const selected = new Set(selectedDocIds);
    return selectedCollection.documents.filter((doc) => selected.has(doc.id));
  }

  function selectedDocumentsAsCsv() {
    const csvEscape = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const headings = ["id", ...columnKeys, "updated_at"];
    return [
      headings.map(csvEscape).join(","),
      ...selectedDocuments().map((doc) =>
        headings
          .map((heading) =>
            csvEscape(
              heading === "id"
                ? doc.id
                : heading === "updated_at"
                  ? doc.updated_at
                  : cellValue(doc.document[heading]),
            ),
          )
          .join(","),
      ),
    ].join("\n");
  }

  function selectedDocumentsAsJson() {
    return JSON.stringify(
      selectedDocuments().map((doc) => ({
        id: doc.id,
        document: doc.document,
        updated_at: doc.updated_at,
      })),
      null,
      2,
    );
  }

  async function copySelectedDocuments(format: "csv" | "json") {
    const text =
      format === "csv" ? selectedDocumentsAsCsv() : selectedDocumentsAsJson();
    await navigator.clipboard.writeText(text);
    setNotice(
      `Copied ${selectedDocIds.length} document ${selectedDocIds.length === 1 ? "row" : "rows"} as ${format.toUpperCase()}.`,
    );
  }

  function exportSelectedDocuments(format: "csv" | "json") {
    const text =
      format === "csv" ? selectedDocumentsAsCsv() : selectedDocumentsAsJson();
    const blob = new Blob([text], {
      type: format === "csv" ? "text/csv" : "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selectedCollection.name}-documents.${format}`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice(
      `Exported ${selectedDocIds.length} document ${selectedDocIds.length === 1 ? "row" : "rows"} as ${format.toUpperCase()}.`,
    );
  }

  function deleteSelectedDocuments() {
    setDocDeleteTargets(selectedDocIds);
    setDocDeleteConfirm("");
  }

  function confirmDeleteSelectedDocuments() {
    if (docDeleteConfirm !== "delete") return;
    const ids = [...docDeleteTargets];
    for (const id of ids) deleteDocument(id);
    setSelectedDocIds([]);
    setDocDeleteTargets([]);
    setDocDeleteConfirm("");
    setNotice(
      `Deleted ${ids.length} document ${ids.length === 1 ? "row" : "rows"}.`,
    );
  }

  function toggleDocumentSelection(id: string) {
    setSelectedDocIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function toggleVisibleDocumentSelection() {
    if (pageIds.length === 0) return;
    setSelectedDocIds((current) => {
      if (allVisibleSelected) {
        return current.filter((id) => !pageIds.includes(id));
      }
      return Array.from(new Set([...current, ...pageIds]));
    });
  }

  function openCreate() {
    const fields = defaultFields();
    const json = JSON.stringify(fieldsToDocument(fields).value, null, 2);
    setEditing("new");
    setEditorLocked(false);
    setEditorTab("fields");
    setFieldRows(fields);
    setEditJson(json);
    setEditorBaseline({
      fields: fieldRowsFingerprint(fields),
      json,
    });
    setEditorDiscardConfirm(null);
    setEditorSaveConfirm(false);
    setJsonError("");
    setNotice("");
  }

  function openEdit(doc: MockDocument) {
    const fields = documentToFields(doc.document);
    const json = JSON.stringify(doc.document, null, 2);
    setEditing(doc);
    setEditorLocked(true);
    setEditorTab("fields");
    setFieldRows(fields);
    setEditJson(json);
    setEditorBaseline({
      fields: fieldRowsFingerprint(fields),
      json,
    });
    setEditorDiscardConfirm(null);
    setEditorSaveConfirm(false);
    setJsonError("");
    setNotice("");
  }

  function validateJson(value: string) {
    setEditJson(value);
    try {
      const parsed = JSON.parse(value) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setJsonError("Document JSON must be an object.");
        return;
      }
      setJsonError("");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        setFieldRows(documentToFields(parsed as Record<string, unknown>));
      }
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : String(error));
    }
  }

  function syncFields(nextFields: EditableField[]) {
    setFieldRows(nextFields);
    const parsed = fieldsToDocument(nextFields);
    if (parsed.value) {
      setEditJson(JSON.stringify(parsed.value, null, 2));
      setJsonError("");
    }
  }

  function updateField(
    id: string,
    patch: Partial<Pick<EditableField, "key" | "kind" | "value">>,
  ) {
    syncFields(
      fieldRows.map((field) => {
        if (field.id !== id) return field;
        const next = { ...field, ...patch };
        if (patch.kind && patch.kind !== field.kind) {
          next.value =
            patch.kind === "boolean"
              ? "true"
              : patch.kind === "number"
                ? "0"
                : patch.kind === "json"
                  ? "{}"
                  : "";
        }
        return next;
      }),
    );
  }

  function removeField(id: string) {
    syncFields(fieldRows.filter((field) => field.id !== id));
  }

  function addField() {
    syncFields([
      ...fieldRows,
      { id: fieldId(), key: "", kind: "string", value: "" },
    ]);
  }

  function saveDocument() {
    const body =
      editorTab === "fields"
        ? (() => {
            const parsed = fieldsToDocument(fieldRows);
            if (parsed.error || !parsed.value) {
              setJsonError(parsed.error ?? "Document fields are invalid.");
              return "";
            }
            return JSON.stringify(parsed.value, null, 2);
          })()
        : editJson;
    if (!body) return;
    const result =
      editing === "new"
        ? createDocument(body)
        : editing
          ? updateDocument(editing.id, body)
          : { ok: false, message: "No document selected." };
    setNotice(result.message);
    if (!result.ok) return;
    if (result.data) {
      const fields = documentToFields(result.data.document);
      const json = JSON.stringify(result.data.document, null, 2);
      setEditing(result.data);
      setEditorLocked(true);
      setEditorTab("fields");
      setFieldRows(fields);
      setEditJson(json);
      setEditorBaseline({
        fields: fieldRowsFingerprint(fields),
        json,
      });
      setEditorSaveConfirm(false);
      setJsonError("");
    }
  }

  function cancelEditorChanges() {
    if (editing === "new" || !editing) {
      setEditing(null);
      return;
    }
    const fields = documentToFields(editing.document);
    const json = JSON.stringify(editing.document, null, 2);
    setEditorLocked(true);
    setEditorTab("fields");
    setFieldRows(fields);
    setEditJson(json);
    setEditorBaseline({
      fields: fieldRowsFingerprint(fields),
      json,
    });
    setEditorDiscardConfirm(null);
    setJsonError("");
  }

  const editorReadOnly = editing !== "new" && editorLocked;
  const hasEditorDraftChanges =
    !!editing &&
    !editorReadOnly &&
    (editorTab === "fields"
      ? fieldRowsFingerprint(fieldRows) !== editorBaseline.fields
      : editJson !== editorBaseline.json);

  function closeEditor() {
    setEditing(null);
    setEditorDiscardConfirm(null);
    setEditorSaveConfirm(false);
  }

  function requestEditorClose(action: "close" | "cancel") {
    if (hasEditorDraftChanges) {
      setEditorDiscardConfirm(action);
      return;
    }
    if (action === "cancel") {
      cancelEditorChanges();
      return;
    }
    closeEditor();
  }

  function confirmDiscardEditorChanges() {
    const action = editorDiscardConfirm;
    setEditorDiscardConfirm(null);
    if (action === "cancel") {
      cancelEditorChanges();
      return;
    }
    closeEditor();
  }

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-500">
      <div className="hidden">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
            Documents
          </h1>
          <p className="text-[14px] text-zinc-500 mt-1">
            Browse and edit documents in{" "}
            <span className="font-mono text-zinc-700 dark:text-zinc-300">
              {selectedCollection.name}
            </span>
            .
          </p>
        </div>
        <PrimaryButton icon={Plus} onClick={openCreate}>
          Create document
        </PrimaryButton>
      </div>

      {notice && (
        <ToastNotice
          message={notice}
          variant={notice.includes("match") ? "warning" : "success"}
          onClose={() => setNotice("")}
        />
      )}

      <div className="hidden">
        {[
          { label: "Rows", href: "/dashboard/data", active: true },
          { label: "Schema", href: "/dashboard/schemas", active: false },
          { label: "Indexes", href: "/dashboard/indexes", active: false },
        ].map((tab) => (
          <Link
            key={tab.label}
            href={tab.href}
            className={`pb-3 text-[13px] font-medium border-b-2 transition-colors ${
              tab.active
                ? "border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100"
                : "border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <div className="hidden">
        <div className="relative flex-1 max-w-sm">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
          />
          <input
            type="search"
            placeholder="Search documents..."
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setOffset(0);
            }}
            className="w-full pl-9 pr-4 py-2 text-[13px] bg-white dark:bg-[#161616] border border-zinc-200 dark:border-white/10 rounded-md focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 placeholder:text-zinc-500 text-zinc-900 dark:text-zinc-100 transition-colors shadow-sm"
          />
        </div>
        <Dropdown
          align="right"
          trigger={
            <button
              type="button"
              className="flex items-center gap-2 bg-white dark:bg-[#161616] border border-zinc-200 dark:border-white/10 rounded-md px-3 py-2 text-[13px] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shadow-sm"
            >
              {limit} rows
              <ChevronDown size={14} className="text-zinc-500" />
            </button>
          }
        >
          {LIMITS.map((value) => (
            <DropdownItem
              key={value}
              onClick={() => {
                setLimit(value);
                setOffset(0);
              }}
            >
              <div className="flex items-center justify-between w-full">
                {value} rows{" "}
                {limit === value && (
                  <Check size={14} className="text-emerald-500" />
                )}
              </div>
            </DropdownItem>
          ))}
        </Dropdown>
        <SecondaryButton
          icon={RefreshCw}
          className="px-3"
          aria-label="Refresh documents"
          onClick={() => setNotice("Documents are up to date.")}
        />
      </div>

      <div className="flex-1 flex gap-0 min-h-0 min-w-0 overflow-hidden">
        <aside className="w-[260px] shrink-0 bg-white dark:bg-[#161616] border-r border-zinc-200 dark:border-white/5 flex flex-col overflow-hidden">
          <div className="px-4 py-4 border-b border-zinc-200 dark:border-white/5">
            <h2 className="text-[16px] font-semibold text-zinc-900 dark:text-zinc-100">
              Documents
            </h2>
            <button
              type="button"
              className="mt-4 w-full h-9 px-3 rounded-md border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-[#121212] text-left text-[13px] text-zinc-600 dark:text-zinc-300 flex items-center justify-between"
            >
              schema public
              <ChevronDown size={14} className="text-zinc-400" />
            </button>
            <Link
              href="/dashboard/collections"
              className="mt-2 w-full h-9 px-3 rounded-md border border-zinc-200 dark:border-white/10 text-[13px] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors flex items-center gap-2"
            >
              <Plus size={14} />
              New collection
            </Link>
          </div>
          <div className="p-3">
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
              />
              <input
                type="search"
                value={collectionSearch}
                onChange={(event) => setCollectionSearch(event.target.value)}
                placeholder="Search tables..."
                className="w-full pl-9 pr-3 py-2 rounded-md border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-[#121212] text-[13px] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar pt-2 pb-16">
            {filteredCollections.length === 0 ? (
              <div className="px-4 py-8 text-center text-[12px] text-zinc-500">
                No matching tables.
              </div>
            ) : (
              filteredCollections.map((collection) => {
                const active = collection.name === selectedCollection.name;
                return (
                  <button
                    key={collection.name}
                    type="button"
                    onClick={() => setSelectedCollection(collection.name)}
                    className={`w-full h-9 px-4 grid grid-cols-[18px_1fr_18px] items-center gap-2 text-left text-[13px] transition-colors ${
                      active
                        ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                        : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                    }`}
                  >
                    <Table2 size={14} className="text-zinc-400" />
                    <span className="truncate">{collection.name}</span>
                    <FolderOpen size={13} className="text-zinc-400" />
                  </button>
                );
              })
            )}
          </div>
        </aside>
        <div className="flex-1 min-w-0 bg-white dark:bg-[#161616] overflow-hidden flex flex-col">
          <div className="h-12 shrink-0 flex items-stretch overflow-x-auto overflow-y-hidden custom-scrollbar border-b border-zinc-200 dark:border-white/5 bg-zinc-50 dark:bg-[#161616]">
            {collections.slice(0, 4).map((collection) => {
              const active = collection.name === selectedCollection.name;
              return (
                <button
                  key={collection.name}
                  type="button"
                  onClick={() => setSelectedCollection(collection.name)}
                  className={`min-w-[180px] px-4 border-r border-zinc-200 dark:border-white/5 text-left text-[13px] font-medium transition-colors ${
                    active
                      ? "bg-white dark:bg-[#121212] text-zinc-900 dark:text-zinc-100 border-t-2 border-t-zinc-900 dark:border-t-zinc-100"
                      : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-white dark:hover:bg-[#121212]"
                  }`}
                >
                  <span className="inline-flex items-center gap-2">
                    <Table2 size={14} />
                    {collection.name}
                  </span>
                </button>
              );
            })}
            <Link
              href="/dashboard/collections"
              className="w-12 flex items-center justify-center text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
              aria-label="Manage collections"
            >
              <Plus size={16} />
            </Link>
          </div>
          <div className="h-12 shrink-0 flex items-center gap-3 px-4 border-b border-zinc-200 dark:border-white/5 bg-white dark:bg-[#121212]">
            {selectedDocIds.length > 0 ? (
              <>
                <div className="flex items-center gap-2">
                  <Dropdown
                    align="left"
                    trigger={
                      <button
                        type="button"
                        className="h-8 inline-flex items-center gap-2 rounded-md border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#161616] px-3 text-[13px] font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                      >
                        Copy
                        <ChevronDown size={14} className="text-zinc-400" />
                      </button>
                    }
                  >
                    <DropdownItem onClick={() => copySelectedDocuments("csv")}>
                      Copy as CSV
                    </DropdownItem>
                    <DropdownItem onClick={() => copySelectedDocuments("json")}>
                      Copy as JSON
                    </DropdownItem>
                  </Dropdown>
                  <Dropdown
                    align="left"
                    trigger={
                      <button
                        type="button"
                        className="h-8 inline-flex items-center gap-2 rounded-md border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#161616] px-3 text-[13px] font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                      >
                        Export
                        <ChevronDown size={14} className="text-zinc-400" />
                      </button>
                    }
                  >
                    <DropdownItem
                      onClick={() => exportSelectedDocuments("csv")}
                    >
                      Export as CSV
                    </DropdownItem>
                    <DropdownItem
                      onClick={() => exportSelectedDocuments("json")}
                    >
                      Export as JSON
                    </DropdownItem>
                  </Dropdown>
                </div>
                <button
                  type="button"
                  onClick={deleteSelectedDocuments}
                  className="ml-auto h-8 inline-flex items-center rounded-md border border-red-200 bg-red-50 px-3 text-[13px] font-medium text-red-700 hover:bg-red-100 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20 transition-colors"
                >
                  Delete {selectedDocIds.length}{" "}
                  {selectedDocIds.length === 1 ? "row" : "rows"}
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
                    placeholder="Filter by id, fields, or value"
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setOffset(0);
                    }}
                    className="w-full h-10 pl-7 pr-3 text-[13px] bg-transparent border-0 focus:outline-none placeholder:text-zinc-400 text-zinc-900 dark:text-zinc-100"
                  />
                </div>
                <div className="ml-auto flex items-center gap-3">
                  <Dropdown
                    align="right"
                    trigger={
                      <button
                        type="button"
                        className="flex items-center gap-2 border border-zinc-200 dark:border-white/10 rounded-md px-3 py-2 text-[13px] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                      >
                        {limit} rows
                        <ChevronDown size={14} className="text-zinc-500" />
                      </button>
                    }
                  >
                    {LIMITS.map((value) => (
                      <DropdownItem
                        key={value}
                        onClick={() => {
                          setLimit(value);
                          setOffset(0);
                        }}
                      >
                        <div className="flex items-center justify-between w-full">
                          {value} rows{" "}
                          {limit === value && (
                            <Check size={14} className="text-emerald-500" />
                          )}
                        </div>
                      </DropdownItem>
                    ))}
                  </Dropdown>
                  <SecondaryButton
                    icon={RefreshCw}
                    className="px-3"
                    aria-label="Refresh documents"
                    onClick={() => setNotice("Documents are up to date.")}
                  />
                  <PrimaryButton icon={Plus} onClick={openCreate}>
                    Insert
                  </PrimaryButton>
                </div>
              </>
            )}
          </div>
          <div className="flex-1 min-w-0 max-w-full overflow-auto custom-scrollbar pb-16">
            <table className="min-w-max w-full text-[13px] text-left border-collapse">
              <thead className="sticky top-0 bg-white dark:bg-[#161616] z-10">
                <tr className="border-b border-zinc-200 dark:border-white/5">
                  <th className="w-11 px-4 py-3 bg-zinc-50 dark:bg-[#1a1a1a] border-r border-zinc-200 dark:border-white/5">
                    <div className="flex items-center justify-center">
                      <SelectionCheckbox
                        checked={allVisibleSelected}
                        mixed={someVisibleSelected}
                        checkedIcon="dash"
                        disabled={pageIds.length === 0}
                        label="Select visible documents"
                        onClick={toggleVisibleDocumentSelection}
                      />
                    </div>
                  </th>
                  <th className="px-4 py-3 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider whitespace-nowrap bg-zinc-50 dark:bg-[#1a1a1a] border-r border-zinc-200 dark:border-white/5">
                    id
                  </th>
                  {columnKeys.map((heading) => (
                    <th
                      key={heading}
                      className="px-4 py-3 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider whitespace-nowrap bg-zinc-50 dark:bg-[#1a1a1a] border-r border-zinc-200 dark:border-white/5"
                    >
                      {heading}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider whitespace-nowrap bg-zinc-50 dark:bg-[#1a1a1a]">
                    updated
                  </th>
                </tr>
              </thead>
              <tbody className="[&_tr]:border-b [&_tr]:border-zinc-100 dark:[&_tr]:border-white/5">
                {page.length === 0 ? (
                  <tr>
                    <td colSpan={columnKeys.length + 3}>
                      <EmptyState
                        icon={Database}
                        title="No documents found"
                        description="Create a document or adjust your search."
                        action={
                          <PrimaryButton icon={Plus} onClick={openCreate}>
                            Create document
                          </PrimaryButton>
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  page.map((doc) => {
                    const badge = statusBadge(doc.document.status);
                    return (
                      <tr
                        key={doc.id}
                        className="transition-colors cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                        onClick={() => openEdit(doc)}
                      >
                        <td className="px-4 py-3 border-r border-zinc-100 dark:border-white/5">
                          <div className="flex items-center justify-center">
                            <SelectionCheckbox
                              checked={selectedDocIds.includes(doc.id)}
                              label={`Select ${doc.id}`}
                              onClick={() => toggleDocumentSelection(doc.id)}
                            />
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap border-r border-zinc-100 dark:border-white/5">
                          <span className="font-mono text-[12px] text-zinc-500 dark:text-zinc-400">
                            {doc.id}
                          </span>
                        </td>
                        {columnKeys.map((key) => {
                          const value = doc.document[key];
                          return (
                            <td
                              key={key}
                              className="px-4 py-3 min-w-[160px] max-w-[260px] border-r border-zinc-100 dark:border-white/5"
                            >
                              {key === "status" ? (
                                <Badge variant={badge.variant}>
                                  {badge.label}
                                </Badge>
                              ) : (
                                <span className="block truncate text-zinc-800 dark:text-zinc-200">
                                  {cellValue(value) || "-"}
                                </span>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-4 py-3 text-zinc-500 whitespace-nowrap text-[12px]">
                          {formatDate(doc.updated_at)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between px-5 py-3 border-t border-zinc-200 dark:border-white/5 bg-zinc-50 dark:bg-[#1a1a1a] shrink-0">
            <span className="text-[12px] text-zinc-500 font-medium">
              {total === 0
                ? "0"
                : `${offset + 1}-${Math.min(offset + limit, total)}`}{" "}
              of {total}
            </span>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Previous page"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                  className="p-1.5 rounded-md text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  aria-label="Next page"
                  disabled={offset + limit >= total}
                  onClick={() => setOffset(offset + limit)}
                  className="p-1.5 rounded-md text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
              <div className="hidden md:flex items-center rounded-md border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#121212] p-0.5 text-[12px] font-medium">
                <span className="px-3 py-1 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100">
                  Data
                </span>
                <Link
                  href="/dashboard/schemas"
                  className="px-3 py-1 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                >
                  Definition
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {editing && (
        <div className="fixed inset-x-0 top-12 bottom-0 z-40">
          <button
            type="button"
            aria-label="Close editor"
            className="absolute inset-0 bg-black/20"
            onClick={() => requestEditorClose("close")}
            tabIndex={-1}
          />
          <aside
            aria-modal="true"
            className="absolute right-0 top-0 bottom-0 w-full max-w-[720px] overflow-hidden bg-white dark:bg-[#161616] border-l border-zinc-200 dark:border-white/10 shadow-2xl flex flex-col animate-in slide-in-from-right-4 duration-200"
            onKeyDown={(event) =>
              event.key === "Escape" && requestEditorClose("close")
            }
            role="dialog"
            tabIndex={-1}
          >
            <div className="h-14 shrink-0 flex items-center justify-between px-5 border-b border-zinc-200 dark:border-white/5 bg-white dark:bg-[#161616]">
              <h2 className="text-[16px] font-semibold text-zinc-900 dark:text-zinc-100">
                {editing === "new"
                  ? "Create document"
                  : editorLocked
                    ? "View document"
                    : "Edit document"}
              </h2>
              <button
                type="button"
                onClick={() => requestEditorClose("close")}
                aria-label="Close editor"
                className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden px-6 pt-6 pb-0">
              {editing !== "new" && (
                <div className="shrink-0 mb-4">
                  <Alert variant="info">
                    <Info size={14} className="shrink-0 mt-0.5" />
                    <span>
                      This document uses change protection. If another edit
                      happens first, refresh before saving again.
                    </span>
                  </Alert>
                </div>
              )}
              <div className="flex flex-col gap-4 flex-1 min-h-0">
                <div className="h-12 shrink-0 flex items-center justify-between gap-4 border-b border-zinc-200 dark:border-white/5">
                  <div className="h-full flex gap-6">
                    {[
                      { id: "fields" as const, label: "Fields", icon: Table2 },
                      { id: "json" as const, label: "JSON", icon: Code2 },
                    ].map((tab) => {
                      const Icon = tab.icon;
                      const active = editorTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setEditorTab(tab.id)}
                          className={`h-full inline-flex items-center gap-2 text-[13px] font-medium border-b-2 transition-colors ${
                            active
                              ? "border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100"
                              : "border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                          }`}
                        >
                          <Icon size={14} />
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>
                  {editorTab === "fields" && (
                    <div className="h-8 min-w-[104px] shrink-0 flex items-center justify-end">
                      {!editorReadOnly && (
                        <SecondaryButton
                          icon={Plus}
                          onClick={addField}
                          className="h-8 !py-0 px-3"
                        >
                          Add field
                        </SecondaryButton>
                      )}
                    </div>
                  )}
                </div>

                {editorTab === "fields" ? (
                  <div className="-mx-6 flex-1 min-h-0 border-y border-zinc-200 dark:border-white/10 overflow-hidden flex flex-col">
                    <div className="shrink-0 grid grid-cols-[minmax(0,1fr)_140px_minmax(0,1.4fr)_44px] gap-0 bg-zinc-50 dark:bg-[#1a1a1a] border-b border-zinc-200 dark:border-white/5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                      <div className="px-3 py-2 border-r border-zinc-200 dark:border-white/5">
                        Field
                      </div>
                      <div className="px-3 py-2 border-r border-zinc-200 dark:border-white/5">
                        Type
                      </div>
                      <div className="px-3 py-2 border-r border-zinc-200 dark:border-white/5">
                        Value
                      </div>
                      <div />
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pb-20 [&>*]:border-b [&>*]:border-zinc-100 dark:[&>*]:border-white/5">
                      {fieldRows.map((field) => (
                        <div
                          key={field.id}
                          className="grid grid-cols-[minmax(0,1fr)_140px_minmax(0,1.4fr)_44px] gap-0 items-center"
                        >
                          <input
                            disabled={editorReadOnly}
                            value={field.key}
                            onChange={(event) =>
                              updateField(field.id, { key: event.target.value })
                            }
                            placeholder="field_name"
                            className="h-11 min-w-0 px-3 font-mono text-[13px] bg-transparent border-r border-zinc-100 dark:border-white/5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:bg-zinc-50 dark:focus:bg-[#121212] disabled:text-zinc-500 disabled:cursor-default"
                          />
                          <select
                            disabled={editorReadOnly}
                            value={field.kind}
                            onChange={(event) =>
                              updateField(field.id, {
                                kind: event.target.value as FieldKind,
                              })
                            }
                            className="h-11 min-w-0 px-3 text-[13px] bg-transparent border-r border-zinc-100 dark:border-white/5 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:bg-zinc-50 dark:focus:bg-[#121212] disabled:text-zinc-500 disabled:cursor-default"
                          >
                            {FIELD_KINDS.map((kind) => (
                              <option key={kind} value={kind}>
                                {kind}
                              </option>
                            ))}
                          </select>
                          {field.kind === "boolean" ? (
                            <select
                              disabled={editorReadOnly}
                              value={field.value}
                              onChange={(event) =>
                                updateField(field.id, {
                                  value: event.target.value,
                                })
                              }
                              className="h-11 min-w-0 px-3 text-[13px] bg-transparent border-r border-zinc-100 dark:border-white/5 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:bg-zinc-50 dark:focus:bg-[#121212] disabled:text-zinc-500 disabled:cursor-default"
                            >
                              <option value="true">true</option>
                              <option value="false">false</option>
                            </select>
                          ) : (
                            <input
                              disabled={editorReadOnly}
                              value={field.value}
                              onChange={(event) =>
                                updateField(field.id, {
                                  value: event.target.value,
                                })
                              }
                              placeholder={
                                field.kind === "json" ? "{}" : "Value"
                              }
                              className="h-11 min-w-0 px-3 text-[13px] bg-transparent border-r border-zinc-100 dark:border-white/5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:bg-zinc-50 dark:focus:bg-[#121212] disabled:text-zinc-500 disabled:cursor-default"
                            />
                          )}
                          {editorReadOnly ? (
                            <div className="h-11" />
                          ) : (
                            <button
                              type="button"
                              aria-label={`Remove ${field.key || "field"}`}
                              onClick={() => removeField(field.id)}
                              className="h-11 flex items-center justify-center text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 min-h-0 flex flex-col">
                    <label
                      htmlFor="document-json"
                      className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300 mb-2"
                    >
                      Advanced JSON
                    </label>
                    <textarea
                      id="document-json"
                      value={editJson}
                      onChange={(event) => validateJson(event.target.value)}
                      onKeyDown={(event) =>
                        handleTextareaIndent(event, validateJson)
                      }
                      readOnly={editorReadOnly}
                      rows={16}
                      className="w-full flex-1 min-h-0 font-mono text-[13px] border border-zinc-200 dark:border-white/10 rounded-md p-4 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 bg-zinc-50 dark:bg-[#121212] text-zinc-700 dark:text-zinc-300 resize-none shadow-inner custom-scrollbar read-only:cursor-default"
                      spellCheck={false}
                    />
                  </div>
                )}

                {jsonError && (
                  <p className="text-[12px] text-red-400 font-mono">
                    {jsonError}
                  </p>
                )}
              </div>
            </div>
            <div className="sticky bottom-0 z-20 flex items-center justify-between gap-4 px-6 py-4 border-t border-zinc-200 dark:border-white/5 bg-zinc-50 dark:bg-[#1a1a1a] shrink-0">
              <div className="min-w-0" />
              <div className="flex items-center justify-end gap-3 shrink-0">
                {editorReadOnly ? (
                  <PrimaryButton onClick={() => setEditorLocked(false)}>
                    Edit document
                  </PrimaryButton>
                ) : (
                  <>
                    <SecondaryButton
                      onClick={() => requestEditorClose("cancel")}
                    >
                      Cancel
                    </SecondaryButton>
                    <PrimaryButton
                      disabled={!!jsonError}
                      onClick={() => setEditorSaveConfirm(true)}
                    >
                      {editing === "new" ? "Create document" : "Save changes"}
                    </PrimaryButton>
                  </>
                )}
              </div>
            </div>
          </aside>
        </div>
      )}

      {editorSaveConfirm && editing && (
        <ConfirmModal
          title={
            editing === "new" ? "Create document?" : "Save document changes?"
          }
          description={
            <p className="text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">
              Confirm before writing this document to{" "}
              <span className="font-mono text-zinc-800 dark:text-zinc-200">
                {selectedCollection.name}
              </span>
              .
            </p>
          }
          confirmLabel={editing === "new" ? "Create document" : "Save changes"}
          onClose={() => setEditorSaveConfirm(false)}
          onConfirm={saveDocument}
        />
      )}

      {editorDiscardConfirm && (
        <ConfirmModal
          title="Discard unsaved changes?"
          description={
            <p className="text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">
              This editor has draft changes that have not been saved.
            </p>
          }
          confirmLabel="Discard changes"
          danger
          onClose={() => setEditorDiscardConfirm(null)}
          onConfirm={confirmDiscardEditorChanges}
        />
      )}

      {docDeleteTargets.length > 0 && (
        <ConfirmModal
          title={
            docDeleteTargets.length === 1
              ? "Delete document"
              : "Delete documents"
          }
          description={
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-3 p-4 rounded-lg bg-red-50 dark:bg-red-500/5 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-300 text-[13px] leading-relaxed shadow-sm">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <span>
                  This deletes{" "}
                  {docDeleteTargets.length === 1 ? (
                    <span className="font-mono font-semibold text-red-900 dark:text-red-100">
                      {docDeleteTargets[0]}
                    </span>
                  ) : (
                    <span className="font-semibold text-red-900 dark:text-red-100">
                      {docDeleteTargets.length} documents
                    </span>
                  )}{" "}
                  from this collection.
                </span>
              </div>
              <div>
                <label
                  htmlFor="delete-documents-confirm"
                  className="block text-[12px] font-medium text-zinc-700 dark:text-zinc-300 mb-2"
                >
                  Type{" "}
                  <span className="font-mono text-zinc-800 dark:text-zinc-200">
                    delete
                  </span>{" "}
                  to confirm
                </label>
                <input
                  id="delete-documents-confirm"
                  value={docDeleteConfirm}
                  onChange={(event) => setDocDeleteConfirm(event.target.value)}
                  className="w-full font-mono text-[13px] bg-zinc-50 dark:bg-[#121212] border border-zinc-200 dark:border-white/10 rounded-md px-4 py-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-500 shadow-inner transition-colors"
                />
              </div>
            </div>
          }
          confirmLabel={
            docDeleteTargets.length === 1
              ? "Delete document"
              : "Delete documents"
          }
          danger
          onConfirm={confirmDeleteSelectedDocuments}
          onClose={() => {
            setDocDeleteTargets([]);
            setDocDeleteConfirm("");
          }}
        />
      )}
    </div>
  );
}
