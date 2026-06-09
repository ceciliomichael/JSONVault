"use client";

import {
  AlertTriangle,
  Check,
  ChevronDown,
  Code2,
  Database,
  Plus,
  Search,
  ShieldCheck,
  Table2,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Alert,
  Badge,
  CheckboxControl,
  ConfirmModal,
  Dropdown,
  DropdownItem,
  EmptyState,
  PrimaryButton,
  SecondaryButton,
  SelectionCheckbox,
  ToastNotice,
} from "@/components/ui";
import { handleTextareaIndent } from "@/lib/textarea-indent";
import {
  deleteSchemaAction,
  saveSchemaAction,
  validateSchemaAction,
} from "./actions";
import type { SchemaActionResult } from "./schema-state";

const EMPTY_SCHEMA = `{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {},
  "additionalProperties": true
}`;

const SCHEMA_TYPES = [
  "string",
  "number",
  "integer",
  "boolean",
  "object",
  "array",
] as const;

type SchemaTab = "fields" | "json";
type SchemaType = (typeof SCHEMA_TYPES)[number];

interface SchemaField {
  id: string;
  name: string;
  type: SchemaType;
  required: boolean;
}

export default function SchemasClient({
  database,
  collections,
  selectedCollection,
  schemaText,
  canReadSchemas,
  canManageSchemas,
  loadError = "",
}: {
  database: string;
  collections: string[];
  selectedCollection?: string;
  schemaText: string | null;
  canReadSchemas: boolean;
  canManageSchemas: boolean;
  loadError?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [schema, setSchema] = useState(schemaText ?? EMPTY_SCHEMA);
  const [schemaFields, setSchemaFields] = useState<SchemaField[]>(
    () => schemaToFields(schemaText ?? EMPTY_SCHEMA).fields,
  );
  const [allowExtra, setAllowExtra] = useState(
    () => schemaToFields(schemaText ?? EMPTY_SCHEMA).allowExtra,
  );
  const [schemaTab, setSchemaTab] = useState<SchemaTab>("fields");
  const [collectionSearch, setCollectionSearch] = useState("");
  const [fieldSearch, setFieldSearch] = useState("");
  const [selectedFieldIds, setSelectedFieldIds] = useState<string[]>([]);
  const [schemaError, setSchemaError] = useState("");
  const [schemaNotice, setSchemaNotice] = useState<SchemaActionResult | null>(
    null,
  );
  const [schemaWasSaved, setSchemaWasSaved] = useState(!!schemaText);
  const [deleting, setDeleting] = useState(false);

  const visibleCollections = useMemo(() => {
    const query = collectionSearch.trim().toLowerCase();
    if (!query) return collections;
    return collections.filter((collection) =>
      collection.toLowerCase().includes(query),
    );
  }, [collections, collectionSearch]);

  const visibleSchemaFields = useMemo(() => {
    const query = fieldSearch.trim().toLowerCase();
    if (!query) return schemaFields;
    return schemaFields.filter(
      (field) =>
        field.name.toLowerCase().includes(query) ||
        field.type.toLowerCase().includes(query),
    );
  }, [fieldSearch, schemaFields]);

  const visibleFieldIds = visibleSchemaFields.map((field) => field.id);
  const selectedVisibleCount = visibleFieldIds.filter((id) =>
    selectedFieldIds.includes(id),
  ).length;
  const allVisibleSelected =
    visibleFieldIds.length > 0 &&
    selectedVisibleCount === visibleFieldIds.length;
  const someVisibleSelected =
    selectedVisibleCount > 0 && selectedVisibleCount < visibleFieldIds.length;
  const canEditSchema = !!selectedCollection && canManageSchemas && !isPending;

  useEffect(() => {
    const nextSchema = selectedCollection
      ? (schemaText ?? EMPTY_SCHEMA)
      : EMPTY_SCHEMA;
    const nextModel = schemaToFields(nextSchema);
    setSchema(nextSchema);
    setSchemaFields(nextModel.fields);
    setAllowExtra(nextModel.allowExtra);
    setSchemaTab("fields");
    setFieldSearch("");
    setSelectedFieldIds([]);
    setSchemaError("");
    setSchemaNotice(null);
    setSchemaWasSaved(!!schemaText);
  }, [schemaText, selectedCollection]);

  function selectCollection(collection: string) {
    const params = new URLSearchParams();
    params.set("collection", collection);
    router.push(`/dashboard/schemas?${params.toString()}`);
  }

  function syncSchemaModel(
    nextFields: SchemaField[],
    nextAllowExtra = allowExtra,
  ) {
    setSchemaFields(nextFields);
    setSelectedFieldIds((current) =>
      current.filter((id) => nextFields.some((field) => field.id === id)),
    );
    setAllowExtra(nextAllowExtra);
    const result = fieldsToSchemaText(nextFields, nextAllowExtra);
    if (result.value) {
      setSchema(result.value);
      setSchemaError("");
      setSchemaNotice(null);
      return;
    }
    setSchemaError(result.error ?? "Schema fields are invalid.");
  }

  function handleSchemaChange(value: string) {
    setSchema(value);
    setSchemaNotice(null);
    try {
      JSON.parse(value);
      setSchemaError("");
      const nextModel = schemaToFields(value);
      setSchemaFields(nextModel.fields);
      setSelectedFieldIds((current) =>
        current.filter((id) =>
          nextModel.fields.some((field) => field.id === id),
        ),
      );
      setAllowExtra(nextModel.allowExtra);
    } catch (error) {
      setSchemaError(error instanceof Error ? error.message : String(error));
    }
  }

  function currentSchemaText() {
    if (schemaTab === "json") return schema;
    const result = fieldsToSchemaText(schemaFields, allowExtra);
    if (result.error || !result.value) {
      setSchemaError(result.error ?? "Schema fields are invalid.");
      return "";
    }
    setSchema(result.value);
    return result.value;
  }

  function handleSchemaTabChange(nextTab: SchemaTab) {
    if (nextTab === "json" && schemaTab === "fields") currentSchemaText();
    setSchemaTab(nextTab);
  }

  function handleValidateSchema() {
    if (!selectedCollection) return;
    const text = currentSchemaText();
    if (!text) return;

    startTransition(async () => {
      const result = await validateSchemaAction(selectedCollection, text);
      setSchemaNotice(result);
      if (result.status === "success") {
        setSchemaError("");
      } else {
        setSchemaError(result.message);
      }
    });
  }

  function handleSaveSchema() {
    if (!selectedCollection) return;
    const text = currentSchemaText();
    if (!text) return;

    startTransition(async () => {
      const result = await saveSchemaAction(selectedCollection, text);
      setSchemaNotice(result);
      if (result.status === "success") {
        setSchemaWasSaved(true);
        setSchemaError("");
        router.refresh();
      } else {
        setSchemaError(result.message);
      }
    });
  }

  function handleDeleteSchema() {
    if (!selectedCollection) return;

    startTransition(async () => {
      const result = await deleteSchemaAction(selectedCollection);
      setSchemaNotice(result);
      setDeleting(false);
      if (result.status === "success") {
        const nextModel = schemaToFields(EMPTY_SCHEMA);
        setSchema(EMPTY_SCHEMA);
        setSchemaFields(nextModel.fields);
        setAllowExtra(nextModel.allowExtra);
        setSchemaWasSaved(false);
        setSchemaError("");
        router.refresh();
      }
    });
  }

  function updateField(id: string, patch: Partial<SchemaField>) {
    syncSchemaModel(
      schemaFields.map((field) =>
        field.id === id ? { ...field, ...patch } : field,
      ),
    );
  }

  function addField() {
    syncSchemaModel([...schemaFields, defaultSchemaField(schemaFields)]);
  }

  function deleteSelectedFields() {
    const selected = new Set(selectedFieldIds);
    syncSchemaModel(schemaFields.filter((field) => !selected.has(field.id)));
    setSelectedFieldIds([]);
    setSchemaNotice({
      status: "warning",
      message: "Removed selected fields from the draft. Save to apply.",
    });
  }

  function toggleFieldSelection(id: string) {
    setSelectedFieldIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function toggleVisibleFieldSelection() {
    if (visibleFieldIds.length === 0) return;
    setSelectedFieldIds((current) => {
      if (allVisibleSelected) {
        return current.filter((id) => !visibleFieldIds.includes(id));
      }
      return Array.from(new Set([...current, ...visibleFieldIds]));
    });
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 animate-in overflow-hidden bg-white fade-in duration-500 dark:bg-[#121212]">
      {schemaNotice?.message && (
        <ToastNotice
          message={schemaNotice.message}
          variant={
            schemaNotice.status === "error" ? "danger" : schemaNotice.status
          }
          onClose={() => setSchemaNotice(null)}
        />
      )}

      <aside className="flex w-[260px] shrink-0 flex-col overflow-hidden border-r border-zinc-200 bg-white dark:border-white/5 dark:bg-[#161616]">
        <div className="border-b border-zinc-200 px-4 py-4 dark:border-white/5">
          <h2 className="text-[16px] font-semibold text-zinc-900 dark:text-zinc-100">
            Schema Editor
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
                  <Table2 size={14} className="text-zinc-400" />
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
                  <Table2 size={14} />
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

        {!canReadSchemas && !loadError && (
          <div className="border-b border-zinc-200 px-4 py-3 dark:border-white/5">
            <Alert variant="warning">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>The selected project token cannot read schemas.</span>
            </Alert>
          </div>
        )}

        {!canManageSchemas && selectedCollection && !loadError && (
          <div className="border-b border-zinc-200 px-4 py-3 dark:border-white/5">
            <Alert variant="warning">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>The selected project token cannot manage schemas.</span>
            </Alert>
          </div>
        )}

        {!selectedCollection ? (
          <div className="min-h-0 flex-1">
            <EmptyState
              icon={Table2}
              title={
                collections.length === 0
                  ? "No collections yet"
                  : "Choose a collection"
              }
              description={
                collections.length === 0
                  ? "Create a collection before attaching a schema."
                  : "Select a collection from the sidebar to manage its schema."
              }
            />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col bg-white dark:bg-[#161616]">
            <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-white/5">
              <div className="flex gap-6">
                {[
                  { id: "fields" as const, label: "Builder", icon: Table2 },
                  { id: "json" as const, label: "Raw JSON", icon: Code2 },
                ].map((tab) => {
                  const Icon = tab.icon;
                  const active = schemaTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => handleSchemaTabChange(tab.id)}
                      className={`inline-flex items-center gap-2 text-[13px] font-medium transition-colors ${
                        active
                          ? "text-zinc-900 dark:text-zinc-100"
                          : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                      }`}
                    >
                      <Icon size={14} />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {schemaWasSaved ? (
                  <Badge variant="success">
                    <ShieldCheck size={12} /> Saved
                  </Badge>
                ) : (
                  <span className="text-[12px] text-zinc-500">
                    Not saved yet
                  </span>
                )}
                <SecondaryButton
                  icon={Trash2}
                  disabled={!schemaWasSaved || !canEditSchema}
                  onClick={() => setDeleting(true)}
                  className="hover:border-red-500/50 hover:text-red-500"
                >
                  Delete schema
                </SecondaryButton>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {schemaTab === "fields" ? (
                <SchemaFieldsEditor
                  fields={schemaFields}
                  visibleFields={visibleSchemaFields}
                  selectedFieldIds={selectedFieldIds}
                  allVisibleSelected={allVisibleSelected}
                  someVisibleSelected={someVisibleSelected}
                  fieldSearch={fieldSearch}
                  disabled={!canEditSchema}
                  schemaWasSaved={schemaWasSaved}
                  onSearch={setFieldSearch}
                  onAddField={addField}
                  onUpdateField={updateField}
                  onToggleField={toggleFieldSelection}
                  onToggleVisible={toggleVisibleFieldSelection}
                  onDeleteSelected={deleteSelectedFields}
                />
              ) : (
                <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-6 custom-scrollbar">
                  <label
                    htmlFor="schema-json"
                    className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300"
                  >
                    Advanced JSON Schema
                  </label>
                  <textarea
                    id="schema-json"
                    value={schema}
                    onChange={(event) => handleSchemaChange(event.target.value)}
                    onKeyDown={(event) =>
                      handleTextareaIndent(event, handleSchemaChange)
                    }
                    rows={20}
                    spellCheck={false}
                    disabled={!canEditSchema}
                    className="w-full resize-y rounded-md border border-zinc-200 bg-zinc-50 p-4 font-mono text-[13px] text-zinc-700 shadow-inner transition-colors focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-[#121212] dark:text-zinc-300 custom-scrollbar"
                  />
                </div>
              )}

              {schemaError && (
                <p className="mx-4 mb-3 font-mono text-[12px] text-red-500">
                  {schemaError}
                </p>
              )}
            </div>

            <div className="sticky bottom-0 z-20 flex shrink-0 items-center justify-between gap-4 border-t border-zinc-200 bg-zinc-50 px-6 py-4 dark:border-white/5 dark:bg-[#1a1a1a]">
              <div className="min-w-0">
                {schemaTab === "fields" &&
                  (schemaFields.length > 0 || schemaWasSaved) && (
                    <div
                      className={
                        canEditSchema ? "" : "pointer-events-none opacity-60"
                      }
                    >
                      <CheckboxControl
                        checked={allowExtra}
                        onChange={() =>
                          syncSchemaModel(schemaFields, !allowExtra)
                        }
                        label="Allow fields not listed above"
                        className="rounded-md px-2 py-1.5 whitespace-nowrap"
                      />
                    </div>
                  )}
              </div>
              <div className="flex shrink-0 items-center justify-end gap-3">
                <SecondaryButton
                  disabled={!canEditSchema || !!schemaError}
                  onClick={handleValidateSchema}
                >
                  {isPending ? "Validating..." : "Validate schema"}
                </SecondaryButton>
                <PrimaryButton
                  disabled={!canEditSchema || !!schemaError}
                  onClick={handleSaveSchema}
                >
                  {isPending ? "Saving..." : "Save schema"}
                </PrimaryButton>
              </div>
            </div>
          </div>
        )}
      </main>

      {deleting && (
        <ConfirmModal
          title="Delete schema"
          description="Remove the schema from this collection? New writes will no longer be checked by this schema."
          confirmLabel="Delete schema"
          danger
          onConfirm={handleDeleteSchema}
          onClose={() => setDeleting(false)}
        />
      )}
    </div>
  );
}

function SchemaFieldsEditor({
  fields,
  visibleFields,
  selectedFieldIds,
  allVisibleSelected,
  someVisibleSelected,
  fieldSearch,
  disabled,
  schemaWasSaved,
  onSearch,
  onAddField,
  onUpdateField,
  onToggleField,
  onToggleVisible,
  onDeleteSelected,
}: {
  fields: SchemaField[];
  visibleFields: SchemaField[];
  selectedFieldIds: string[];
  allVisibleSelected: boolean;
  someVisibleSelected: boolean;
  fieldSearch: string;
  disabled: boolean;
  schemaWasSaved: boolean;
  onSearch: (value: string) => void;
  onAddField: () => void;
  onUpdateField: (id: string, patch: Partial<SchemaField>) => void;
  onToggleField: (id: string) => void;
  onToggleVisible: () => void;
  onDeleteSelected: () => void;
}) {
  const hasSelection = selectedFieldIds.length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-zinc-200 bg-white px-4 dark:border-white/5 dark:bg-[#121212]">
        {hasSelection ? (
          <>
            <span className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300">
              {selectedFieldIds.length} selected
            </span>
            <button
              type="button"
              disabled={disabled}
              onClick={onDeleteSelected}
              className="ml-auto inline-flex h-8 items-center rounded-md border border-red-200 bg-red-50 px-3 text-[13px] font-medium text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20"
            >
              Delete {selectedFieldIds.length}{" "}
              {selectedFieldIds.length === 1 ? "row" : "rows"}
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
                value={fieldSearch}
                onChange={(event) => onSearch(event.target.value)}
                placeholder="Filter fields..."
                className="h-10 w-full border-0 bg-transparent pl-7 pr-3 text-[13px] text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:text-zinc-100"
              />
            </div>
            <PrimaryButton
              icon={Plus}
              disabled={disabled}
              onClick={onAddField}
              className="ml-auto shrink-0 py-1.5"
            >
              Add field
            </PrimaryButton>
          </>
        )}
      </div>

      <div className="shrink-0 overflow-hidden">
        <div className="grid min-w-[594px] grid-cols-[44px_minmax(220px,1fr)_180px_150px] border-b border-zinc-200 bg-zinc-50 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:border-white/5 dark:bg-[#1a1a1a]">
          <div className="flex items-center justify-center border-r border-zinc-200 px-4 py-3 dark:border-white/5">
            <SelectionCheckbox
              checked={allVisibleSelected}
              mixed={someVisibleSelected}
              checkedIcon="dash"
              disabled={visibleFields.length === 0 || disabled}
              label="Select visible schema fields"
              onClick={onToggleVisible}
            />
          </div>
          <div className="border-r border-zinc-200 px-4 py-3 dark:border-white/5">
            Field
          </div>
          <div className="border-r border-zinc-200 px-4 py-3 dark:border-white/5">
            Type
          </div>
          <div className="px-4 py-3">Required</div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto pb-20 custom-scrollbar">
        <div className="divide-y divide-zinc-100 dark:divide-white/5">
          {fields.length === 0 ? (
            <div className="min-h-[280px]">
              <EmptyState
                icon={Table2}
                title="No schema fields"
                description={
                  schemaWasSaved
                    ? "This saved schema has no top-level fields in the builder."
                    : "Add fields to validate documents in this collection."
                }
              />
            </div>
          ) : visibleFields.length === 0 ? (
            <div className="min-h-[220px]">
              <EmptyState
                icon={Search}
                title="No matching fields"
                description="Adjust the field filter to show schema fields."
              />
            </div>
          ) : (
            visibleFields.map((field) => (
              <div
                key={field.id}
                className="grid min-w-[594px] grid-cols-[44px_minmax(220px,1fr)_180px_150px] items-center"
              >
                <div className="flex h-11 items-center justify-center border-r border-zinc-100 dark:border-white/5">
                  <SelectionCheckbox
                    checked={selectedFieldIds.includes(field.id)}
                    disabled={disabled}
                    label={`Select ${field.name || "field"}`}
                    onClick={() => onToggleField(field.id)}
                  />
                </div>
                <input
                  value={field.name}
                  onChange={(event) =>
                    onUpdateField(field.id, { name: event.target.value })
                  }
                  placeholder="field_name"
                  disabled={disabled}
                  className="h-11 border-r border-zinc-100 bg-transparent px-4 font-mono text-[13px] text-zinc-900 focus:bg-zinc-50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/5 dark:text-zinc-100 dark:focus:bg-[#121212]"
                />
                <div className="h-11 border-r border-zinc-100 dark:border-white/5">
                  <Dropdown
                    fullWidth
                    trigger={
                      <button
                        type="button"
                        disabled={disabled}
                        className="flex h-11 w-full items-center justify-between px-4 text-[13px] text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:text-zinc-300 dark:hover:bg-[#121212]"
                      >
                        {field.type}
                        <ChevronDown size={14} className="text-zinc-400" />
                      </button>
                    }
                  >
                    {SCHEMA_TYPES.map((type) => (
                      <DropdownItem
                        key={type}
                        onClick={() => onUpdateField(field.id, { type })}
                      >
                        <div className="flex w-full items-center justify-between">
                          {type}
                          {field.type === type && (
                            <Check size={14} className="text-emerald-500" />
                          )}
                        </div>
                      </DropdownItem>
                    ))}
                  </Dropdown>
                </div>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    onUpdateField(field.id, { required: !field.required })
                  }
                  className="flex h-11 items-center gap-2 px-4 text-[13px] text-zinc-600 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:text-zinc-300 dark:hover:bg-[#121212]"
                >
                  <span
                    className={`grid h-4 w-4 place-items-center rounded border leading-none ${
                      field.required
                        ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-black"
                        : "border-zinc-300 dark:border-zinc-600"
                    }`}
                  >
                    {field.required && <Check size={11} strokeWidth={3} />}
                  </span>
                  Yes
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function fieldId() {
  return `schema_field_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function schemaToFields(schemaText: string): {
  fields: SchemaField[];
  allowExtra: boolean;
} {
  try {
    const parsed = JSON.parse(schemaText) as {
      properties?: Record<string, { type?: string }>;
      required?: string[];
      additionalProperties?: boolean;
    };
    const required = new Set(parsed.required ?? []);
    const fields = Object.entries(parsed.properties ?? {}).map(
      ([name, property]) => ({
        id: fieldId(),
        name,
        type: SCHEMA_TYPES.includes(property.type as SchemaType)
          ? (property.type as SchemaType)
          : "string",
        required: required.has(name),
      }),
    );
    return {
      fields,
      allowExtra: parsed.additionalProperties !== false,
    };
  } catch {
    return { fields: [], allowExtra: true };
  }
}

function fieldsToSchemaText(
  fields: SchemaField[],
  allowExtra: boolean,
): { value?: string; error?: string } {
  const properties: Record<string, { type: SchemaType }> = {};
  const required: string[] = [];
  for (const field of fields) {
    const name = field.name.trim();
    if (!name) return { error: "Field names cannot be empty." };
    if (properties[name]) return { error: `Field "${name}" is duplicated.` };
    properties[name] = { type: field.type };
    if (field.required) required.push(name);
  }
  const schema: Record<string, unknown> = {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties,
    additionalProperties: allowExtra,
  };
  if (required.length > 0) schema.required = required;
  return { value: JSON.stringify(schema, null, 2) };
}

function defaultSchemaField(existingFields: SchemaField[] = []): SchemaField {
  const existingNames = new Set(
    existingFields.map((field) => field.name.trim()).filter(Boolean),
  );
  const baseName = existingNames.has("name") ? "field" : "name";
  let nextName = baseName;
  let suffix = 2;
  while (existingNames.has(nextName)) {
    nextName = `${baseName}_${suffix}`;
    suffix += 1;
  }
  return { id: fieldId(), name: nextName, type: "string", required: true };
}
