"use client";

import {
  AlertTriangle,
  Code2,
  FileSearch,
  Plus,
  Search,
  Table2,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import {
  Badge,
  ConfirmModal,
  EmptyState,
  PrimaryButton,
  SecondaryButton,
  SelectionCheckbox,
  ToastNotice,
} from "@/components/ui";
import {
  CollectionPanel,
  CollectionTabs,
  WorkspacePage,
} from "@/components/Workspace";
import { handleTextareaIndent } from "@/lib/textarea-indent";
import { saveFTSFieldsAction } from "./actions";

type DraftSearchField = {
  id: string;
  value: string;
};
type AddFieldTab = "fields" | "json";

function draftFieldId() {
  return `fts_field_${Math.random().toString(36).slice(2, 10)}`;
}

export default function FTSClient({
  projectId,
  database,
  collections,
  selectedCollection,
  initialFields,
  searchQuery,
  results,
}: {
  projectId: string;
  database: string;
  collections: string[];
  selectedCollection: string;
  initialFields: string[];
  searchQuery: string;
  results: Array<{ id: string; document: Record<string, unknown> }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [fields, setFields] = useState<string[]>(initialFields);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [fieldDeleteTargets, setFieldDeleteTargets] = useState<string[]>([]);
  const [fieldDeleteConfirm, setFieldDeleteConfirm] = useState("");
  const [collectionSearch, setCollectionSearch] = useState("");
  const [fieldSearch, setFieldSearch] = useState("");
  const [showAddField, setShowAddField] = useState(false);
  const [addFieldTab, setAddFieldTab] = useState<AddFieldTab>("fields");
  const [draftFields, setDraftFields] = useState<DraftSearchField[]>([]);
  const [draftJson, setDraftJson] = useState("[]");
  const [draftBaselineJson, setDraftBaselineJson] = useState("");
  const [draftJsonError, setDraftJsonError] = useState("");
  const [addFieldDiscardConfirm, setAddFieldDiscardConfirm] = useState(false);
  const [addFieldSaveConfirm, setAddFieldSaveConfirm] = useState(false);
  const [query, setQuery] = useState(searchQuery);
  const [notice, setNotice] = useState<{
    status: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    setFields(initialFields);
    setSelectedFields([]);
    setFieldSearch("");
    setQuery(searchQuery);
    setNotice(null);
  }, [initialFields, searchQuery]);

  const visibleFields = useMemo(() => {
    const term = fieldSearch.trim().toLowerCase();
    if (!term) return fields;
    return fields.filter((field) => field.toLowerCase().includes(term));
  }, [fieldSearch, fields]);

  const allVisibleSelected =
    visibleFields.length > 0 &&
    visibleFields.every((field) => selectedFields.includes(field));
  const someVisibleSelected =
    !allVisibleSelected &&
    visibleFields.some((field) => selectedFields.includes(field));
  const hasDraftFields = draftFields.some((field) => field.value.trim());

  function draftFieldsToJson(nextFields: DraftSearchField[]) {
    return JSON.stringify(
      nextFields.map((field) => field.value),
      null,
      2,
    );
  }

  function syncDraftFields(nextFields: DraftSearchField[]) {
    setDraftFields(nextFields);
    setDraftJson(draftFieldsToJson(nextFields));
    setDraftJsonError("");
  }

  function handleCollectionSelect(name: string) {
    router.push(`/dashboard/fts?collection=${encodeURIComponent(name)}`);
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (selectedCollection) params.set("collection", selectedCollection);
    if (query.trim()) params.set("q", query.trim());
    router.push(`/dashboard/fts?${params.toString()}`);
  }

  function openAddField() {
    const nextFields = [{ id: draftFieldId(), value: "" }];
    const nextJson = draftFieldsToJson(nextFields);
    setAddFieldTab("fields");
    setDraftFields(nextFields);
    setDraftJson(nextJson);
    setDraftBaselineJson(nextJson);
    setDraftJsonError("");
    setAddFieldDiscardConfirm(false);
    setAddFieldSaveConfirm(false);
    setShowAddField(true);
  }

  function updateDraftField(id: string, value: string) {
    syncDraftFields(
      draftFields.map((field) =>
        field.id === id ? { ...field, value } : field,
      ),
    );
  }

  function addDraftField() {
    syncDraftFields([...draftFields, { id: draftFieldId(), value: "" }]);
  }

  function removeDraftField(id: string) {
    syncDraftFields(
      draftFields.length === 1
        ? draftFields.map((field) =>
            field.id === id ? { ...field, value: "" } : field,
          )
        : draftFields.filter((field) => field.id !== id),
    );
  }

  function validateDraftJson(value: string) {
    setDraftJson(value);
    try {
      const parsed = JSON.parse(value) as unknown;
      if (
        !Array.isArray(parsed) ||
        parsed.some((item) => typeof item !== "string")
      ) {
        setDraftJsonError("Raw JSON must be an array of field names.");
        return;
      }
      setDraftFields(
        parsed.length === 0
          ? [{ id: draftFieldId(), value: "" }]
          : parsed.map((field) => ({
              id: draftFieldId(),
              value: field,
            })),
      );
      setDraftJsonError("");
    } catch (error) {
      setDraftJsonError(error instanceof Error ? error.message : String(error));
    }
  }

  function handleAddFieldTabChange(tab: AddFieldTab) {
    if (tab === "json") {
      setDraftJson(draftFieldsToJson(draftFields));
      setDraftJsonError("");
    }
    setAddFieldTab(tab);
  }

  function saveNewFields() {
    if (draftJsonError) return;
    const nextFields = draftFields
      .map((field) => field.value.trim())
      .filter((field) => field && !fields.includes(field));
    setAddFieldSaveConfirm(false);
    if (nextFields.length === 0) return;
    setFields([...fields, ...Array.from(new Set(nextFields))]);
    setDraftFields([]);
    setShowAddField(false);
  }

  const hasAddFieldDraftChanges =
    showAddField &&
    (addFieldTab === "json"
      ? draftJson !== draftBaselineJson
      : draftFieldsToJson(draftFields) !== draftBaselineJson);

  function closeAddField() {
    setShowAddField(false);
    setDraftFields([]);
    setDraftJson("[]");
    setDraftJsonError("");
    setAddFieldDiscardConfirm(false);
    setAddFieldSaveConfirm(false);
  }

  function requestAddFieldClose() {
    if (hasAddFieldDraftChanges) {
      setAddFieldDiscardConfirm(true);
      return;
    }
    closeAddField();
  }

  function requestSaveNewFields() {
    if (!hasDraftFields || draftJsonError) return;
    setAddFieldSaveConfirm(true);
  }

  function deleteSelectedFields() {
    setFieldDeleteTargets(selectedFields);
    setFieldDeleteConfirm("");
  }

  function confirmDeleteSelectedFields() {
    if (fieldDeleteConfirm !== "delete") return;
    setFields(fields.filter((field) => !fieldDeleteTargets.includes(field)));
    setSelectedFields([]);
    setFieldDeleteTargets([]);
    setFieldDeleteConfirm("");
  }

  function toggleFieldSelection(field: string) {
    setSelectedFields((current) =>
      current.includes(field)
        ? current.filter((item) => item !== field)
        : [...current, field],
    );
  }

  function toggleVisibleFieldSelection() {
    if (allVisibleSelected) {
      setSelectedFields((current) =>
        current.filter((field) => !visibleFields.includes(field)),
      );
      return;
    }
    setSelectedFields((current) =>
      Array.from(new Set([...current, ...visibleFields])),
    );
  }

  function saveFields() {
    startTransition(async () => {
      const result = await saveFTSFieldsAction(
        projectId,
        database,
        selectedCollection,
        fields,
      );
      setNotice({
        status: result.success ? "success" : "error",
        message: result.message,
      });
    });
  }

  return (
    <WorkspacePage
      hideHeader
      title="Search"
      description={
        <>
          Configure searchable fields for{" "}
          <span className="font-mono text-zinc-700 dark:text-zinc-300">
            {selectedCollection || "collection"}
          </span>
        </>
      }
      action={
        <Badge variant={initialFields.length > 0 ? "success" : "neutral"}>
          {initialFields.length > 0 ? "Configured" : "Not set"}
        </Badge>
      }
    >
      {notice && (
        <ToastNotice
          message={notice.message}
          variant={notice.status === "success" ? "success" : "danger"}
          onClose={() => setNotice(null)}
        />
      )}

      <div className="h-full flex min-h-0 min-w-0 overflow-hidden">
        <CollectionPanel
          title="Search"
          collections={collections.map((c) => ({ name: c }))}
          selectedCollection={selectedCollection}
          onSelect={handleCollectionSelect}
          search={collectionSearch}
          onSearch={setCollectionSearch}
        />

        <div className="flex-1 min-h-0 min-w-0 overflow-hidden flex flex-col">
          <CollectionTabs
            collections={collections.map((c) => ({ name: c }))}
            selectedCollection={selectedCollection}
            onSelect={handleCollectionSelect}
          />
          <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[minmax(520px,1.25fr)_minmax(320px,0.75fr)] min-w-0 overflow-hidden">
            <section className="bg-white dark:bg-[#161616] border-r border-zinc-200 dark:border-white/5 flex flex-col min-h-0 min-w-0 overflow-hidden">
              <div className="h-12 shrink-0 flex items-center px-6 border-b border-zinc-200 dark:border-white/5 bg-zinc-50 dark:bg-[#1a1a1a]">
                <h2 className="text-[14px] font-medium text-zinc-800 dark:text-zinc-200">
                  Searchable fields
                </h2>
              </div>
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                <div className="flex-1 min-h-0 flex flex-col">
                  <div className="h-12 shrink-0 flex items-center gap-3 px-4 border-b border-zinc-200 dark:border-white/5 bg-white dark:bg-[#121212]">
                    {selectedFields.length > 0 ? (
                      <>
                        <span className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300">
                          {selectedFields.length} selected
                        </span>
                        <button
                          type="button"
                          onClick={deleteSelectedFields}
                          disabled={isPending}
                          className="ml-auto h-8 inline-flex items-center rounded-md border border-red-200 bg-red-50 px-3 text-[13px] font-medium text-red-700 hover:bg-red-100 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20 disabled:opacity-50 transition-colors"
                        >
                          Delete {selectedFields.length}{" "}
                          {selectedFields.length === 1 ? "field" : "fields"}
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
                            value={fieldSearch}
                            onChange={(event) =>
                              setFieldSearch(event.target.value)
                            }
                            placeholder="Filter searchable fields..."
                            className="w-full h-10 pl-7 pr-8 text-[13px] bg-transparent border-0 focus:outline-none placeholder:text-zinc-400 text-zinc-900 dark:text-zinc-100"
                          />
                          {fieldSearch && (
                            <button
                              type="button"
                              aria-label="Clear field filter"
                              onClick={() => setFieldSearch("")}
                              className="absolute right-0 top-1/2 -translate-y-1/2 p-1 rounded-md text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                            >
                              <X size={13} />
                            </button>
                          )}
                        </div>
                        <PrimaryButton
                          icon={Plus}
                          onClick={openAddField}
                          disabled={isPending}
                          className="ml-auto shrink-0 py-1.5"
                        >
                          Add field
                        </PrimaryButton>
                      </>
                    )}
                  </div>

                  <div className="shrink-0 overflow-hidden">
                    <div className="min-w-[420px] grid grid-cols-[44px_minmax(220px,1fr)] border-b border-zinc-200 dark:border-white/5 bg-zinc-50 dark:bg-[#1a1a1a] text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                      <div className="px-4 py-3 flex items-center justify-center border-r border-zinc-200 dark:border-white/5">
                        <SelectionCheckbox
                          checked={allVisibleSelected}
                          mixed={someVisibleSelected}
                          checkedIcon="dash"
                          disabled={visibleFields.length === 0}
                          label="Select visible searchable fields"
                          onClick={toggleVisibleFieldSelection}
                        />
                      </div>
                      <div className="px-4 py-3 border-r border-zinc-200 dark:border-white/5">
                        Field
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 min-h-0 overflow-auto custom-scrollbar pb-20">
                    <div
                      className={
                        visibleFields.length > 0
                          ? "[&>*]:border-b [&>*]:border-zinc-100 dark:[&>*]:border-white/5"
                          : ""
                      }
                    >
                      {fields.length === 0 ? (
                        <div className="min-h-[260px] flex flex-col items-center justify-center gap-3 px-6 text-center">
                          <div className="w-9 h-9 rounded-md border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-[#161616] flex items-center justify-center text-zinc-500">
                            <FileSearch size={16} />
                          </div>
                          <div>
                            <p className="text-[13px] font-medium text-zinc-800 dark:text-zinc-200">
                              No searchable fields
                            </p>
                            <p className="mt-1 text-[12px] text-zinc-500">
                              Add at least one field before saving.
                            </p>
                          </div>
                        </div>
                      ) : visibleFields.length === 0 ? (
                        <div className="min-h-[260px] flex flex-col items-center justify-center gap-3 px-6 text-center">
                          <div className="w-9 h-9 rounded-md border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-[#161616] flex items-center justify-center text-zinc-500">
                            <Search size={16} />
                          </div>
                          <div>
                            <p className="text-[13px] font-medium text-zinc-800 dark:text-zinc-200">
                              No matching fields
                            </p>
                            <p className="mt-1 text-[12px] text-zinc-500">
                              Adjust the field filter to show searchable fields.
                            </p>
                          </div>
                        </div>
                      ) : (
                        visibleFields.map((field) => (
                          <div
                            key={field}
                            className="min-w-[420px] grid grid-cols-[44px_minmax(220px,1fr)] items-center hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors group"
                          >
                            <div className="h-11 flex items-center justify-center border-r border-zinc-100 dark:border-white/5">
                              <SelectionCheckbox
                                checked={selectedFields.includes(field)}
                                label={`Select ${field}`}
                                onClick={() => toggleFieldSelection(field)}
                              />
                            </div>
                            <div className="h-11 min-w-0 px-4 flex items-center">
                              <span className="font-mono text-[13px] font-medium text-zinc-800 dark:text-zinc-200 truncate">
                                {field}
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div className="sticky bottom-0 z-20 flex items-center justify-between gap-4 px-6 py-4 border-t border-zinc-200 dark:border-white/5 bg-zinc-50 dark:bg-[#1a1a1a] shrink-0">
                  <span className="min-w-0 text-[12px] text-zinc-500">
                    Save changes before testing them.
                  </span>
                  <PrimaryButton
                    disabled={fields.length === 0 || isPending}
                    onClick={saveFields}
                    className="shrink-0"
                  >
                    {isPending ? "Saving..." : "Save search fields"}
                  </PrimaryButton>
                </div>
              </div>
            </section>

            <section className="bg-white dark:bg-[#161616] flex flex-col min-h-0 min-w-0 overflow-hidden">
              <div className="h-12 shrink-0 flex items-center px-6 border-b border-zinc-200 dark:border-white/5 bg-zinc-50 dark:bg-[#1a1a1a]">
                <h2 className="text-[14px] font-medium text-zinc-800 dark:text-zinc-200">
                  Test search
                </h2>
              </div>
              <div className="p-6 flex flex-col gap-6 min-h-0 flex-1">
                <form onSubmit={submitSearch} className="relative shrink-0">
                  <Search
                    size={16}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
                  />
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Enter search query and press Enter..."
                    disabled={isPending}
                    className="w-full pl-10 pr-4 py-3 text-[14px] bg-zinc-50 dark:bg-[#121212] border border-zinc-200 dark:border-white/10 rounded-md focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 placeholder:text-zinc-500 text-zinc-900 dark:text-zinc-100 transition-colors shadow-inner disabled:opacity-50"
                  />
                </form>

                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pb-16">
                  {initialFields.length === 0 ? (
                    <EmptyState
                      icon={FileSearch}
                      title="Search is not configured"
                      description="Add at least one searchable field and save it before testing."
                    />
                  ) : searchQuery ? (
                    results.length === 0 ? (
                      <EmptyState
                        icon={FileSearch}
                        title="No results"
                        description={`No documents match "${searchQuery}".`}
                      />
                    ) : (
                      <div className="flex flex-col gap-3">
                        {results.map((doc) => (
                          <div
                            key={doc.id}
                            className="rounded-md border border-zinc-200 dark:border-white/5 bg-zinc-50 dark:bg-zinc-900/30 p-4"
                          >
                            <div className="font-mono text-[12px] text-zinc-500 mb-2">
                              {doc.id}
                            </div>
                            <pre className="text-[12px] text-zinc-700 dark:text-zinc-300 overflow-x-auto">
                              {JSON.stringify(doc.document, null, 2)}
                            </pre>
                          </div>
                        ))}
                      </div>
                    )
                  ) : (
                    <div className="h-full flex items-center justify-center p-8">
                      <div className="text-[13px] text-zinc-500 text-center">
                        Type a query and press Enter to test search against this
                        collection.
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
      {showAddField && (
        <div className="fixed inset-x-0 top-12 bottom-0 z-40">
          <button
            type="button"
            aria-label="Close editor"
            className="absolute inset-0 bg-black/20"
            onClick={requestAddFieldClose}
            tabIndex={-1}
          />
          <aside
            aria-modal="true"
            className="absolute right-0 top-0 bottom-0 w-full max-w-[720px] overflow-hidden bg-white dark:bg-[#161616] border-l border-zinc-200 dark:border-white/10 shadow-2xl flex flex-col animate-in slide-in-from-right-4 duration-200"
            onKeyDown={(event) =>
              event.key === "Escape" && requestAddFieldClose()
            }
            role="dialog"
            tabIndex={-1}
          >
            <div className="h-14 shrink-0 flex items-center justify-between px-5 border-b border-zinc-200 dark:border-white/5 bg-white dark:bg-[#161616]">
              <h2 className="text-[16px] font-semibold text-zinc-900 dark:text-zinc-100">
                Add searchable fields
              </h2>
              <button
                type="button"
                onClick={requestAddFieldClose}
                aria-label="Close editor"
                className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-col flex-1 min-h-0 overflow-hidden px-6 pt-6 pb-0">
              <div className="flex flex-col gap-4 flex-1 min-h-0">
                <div className="h-12 shrink-0 flex items-center justify-between gap-4 border-b border-zinc-200 dark:border-white/5">
                  <div className="h-full flex gap-6">
                    {[
                      { id: "fields" as const, label: "Fields", icon: Table2 },
                      { id: "json" as const, label: "Raw JSON", icon: Code2 },
                    ].map((tab) => {
                      const Icon = tab.icon;
                      const active = addFieldTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => handleAddFieldTabChange(tab.id)}
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
                  <div className="h-8 min-w-[104px] shrink-0 flex items-center justify-end">
                    {addFieldTab === "fields" && (
                      <SecondaryButton
                        icon={Plus}
                        onClick={addDraftField}
                        className="h-8 !py-0 px-3"
                      >
                        Add field
                      </SecondaryButton>
                    )}
                  </div>
                </div>

                {addFieldTab === "fields" ? (
                  <div className="-mx-6 flex-1 min-h-0 border-y border-zinc-200 dark:border-white/10 overflow-hidden flex flex-col">
                    <div className="shrink-0 grid grid-cols-[minmax(0,1fr)_44px] gap-0 bg-zinc-50 dark:bg-[#1a1a1a] border-b border-zinc-200 dark:border-white/5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                      <div className="px-3 py-2 border-r border-zinc-200 dark:border-white/5">
                        Field
                      </div>
                      <div />
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pb-20 [&>*]:border-b [&>*]:border-zinc-100 dark:[&>*]:border-white/5">
                      {draftFields.map((field) => (
                        <div
                          key={field.id}
                          className="grid grid-cols-[minmax(0,1fr)_44px] gap-0 items-center"
                        >
                          <input
                            value={field.value}
                            onChange={(event) =>
                              updateDraftField(field.id, event.target.value)
                            }
                            onKeyDown={(event) =>
                              event.key === "Enter" && requestSaveNewFields()
                            }
                            placeholder="field_name"
                            className="h-11 min-w-0 px-3 font-mono text-[13px] bg-transparent border-r border-zinc-100 dark:border-white/5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:bg-zinc-50 dark:focus:bg-[#121212]"
                          />
                          <button
                            type="button"
                            aria-label={`Remove ${field.value || "field"}`}
                            onClick={() => removeDraftField(field.id)}
                            className="h-11 flex items-center justify-center text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 min-h-0 flex flex-col">
                    <label
                      htmlFor="fts-fields-json"
                      className="mb-2 text-[12px] font-medium text-zinc-700 dark:text-zinc-300"
                    >
                      Raw JSON
                    </label>
                    <textarea
                      id="fts-fields-json"
                      value={draftJson}
                      onChange={(event) =>
                        validateDraftJson(event.target.value)
                      }
                      onKeyDown={(event) =>
                        handleTextareaIndent(event, validateDraftJson)
                      }
                      spellCheck={false}
                      className="w-full flex-1 min-h-0 resize-none rounded-md border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-[#121212] p-4 font-mono text-[13px] leading-6 text-zinc-900 dark:text-zinc-100 shadow-inner outline-none transition-colors focus:border-zinc-500 dark:focus:border-zinc-500 custom-scrollbar"
                    />
                    {draftJsonError && (
                      <p className="mt-2 text-[12px] font-mono text-red-600 dark:text-red-400">
                        {draftJsonError}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="sticky bottom-0 z-20 flex items-center justify-between gap-4 px-6 py-4 border-t border-zinc-200 dark:border-white/5 bg-zinc-50 dark:bg-[#1a1a1a] shrink-0">
              <div className="min-w-0" />
              <div className="flex items-center justify-end gap-3 shrink-0">
                <SecondaryButton onClick={requestAddFieldClose}>
                  Cancel
                </SecondaryButton>
                <PrimaryButton
                  disabled={!hasDraftFields || !!draftJsonError}
                  onClick={requestSaveNewFields}
                >
                  Add fields
                </PrimaryButton>
              </div>
            </div>
          </aside>
        </div>
      )}
      {addFieldSaveConfirm && (
        <ConfirmModal
          title="Add searchable fields?"
          description={
            <p className="text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">
              Confirm before adding these fields to the text search
              configuration.
            </p>
          }
          confirmLabel="Add fields"
          onClose={() => setAddFieldSaveConfirm(false)}
          onConfirm={saveNewFields}
        />
      )}
      {addFieldDiscardConfirm && (
        <ConfirmModal
          title="Discard unsaved fields?"
          description={
            <p className="text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">
              This add-fields sidebar has draft changes that have not been
              saved.
            </p>
          }
          confirmLabel="Discard changes"
          danger
          onClose={() => setAddFieldDiscardConfirm(false)}
          onConfirm={closeAddField}
        />
      )}
      {fieldDeleteTargets.length > 0 && (
        <ConfirmModal
          title={
            fieldDeleteTargets.length === 1 ? "Delete field" : "Delete fields"
          }
          description={
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-3 p-4 rounded-lg bg-red-50 dark:bg-red-500/5 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-300 text-[13px] leading-relaxed shadow-sm">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <span>
                  This removes{" "}
                  {fieldDeleteTargets.length === 1 ? (
                    <span className="font-mono font-semibold text-red-900 dark:text-red-100">
                      {fieldDeleteTargets[0]}
                    </span>
                  ) : (
                    <span className="font-semibold text-red-900 dark:text-red-100">
                      {fieldDeleteTargets.length} fields
                    </span>
                  )}{" "}
                  from the text search configuration.
                </span>
              </div>
              <div>
                <label
                  htmlFor="delete-fts-fields-confirm"
                  className="block text-[12px] font-medium text-zinc-700 dark:text-zinc-300 mb-2"
                >
                  Type{" "}
                  <span className="font-mono text-zinc-800 dark:text-zinc-200">
                    delete
                  </span>{" "}
                  to confirm
                </label>
                <input
                  id="delete-fts-fields-confirm"
                  value={fieldDeleteConfirm}
                  onChange={(event) =>
                    setFieldDeleteConfirm(event.target.value)
                  }
                  className="w-full font-mono text-[13px] bg-zinc-50 dark:bg-[#121212] border border-zinc-200 dark:border-white/10 rounded-md px-4 py-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-500 shadow-inner transition-colors"
                />
              </div>
            </div>
          }
          confirmLabel={
            fieldDeleteTargets.length === 1 ? "Delete field" : "Delete fields"
          }
          danger
          onConfirm={confirmDeleteSelectedFields}
          onClose={() => {
            setFieldDeleteTargets([]);
            setFieldDeleteConfirm("");
          }}
        />
      )}
    </WorkspacePage>
  );
}
