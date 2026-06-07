"use client";

import {
  AlertTriangle,
  Check,
  ChevronDown,
  Code2,
  Info,
  Plus,
  Search,
  ShieldCheck,
  Table2,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
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
import { CollectionTabs } from "@/components/Workspace";
import { useDashboardMock } from "@/lib/mock-dashboard-store";
import { handleTextareaIndent } from "@/lib/textarea-indent";

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

export default function SchemasPage() {
  const {
    selectedCollection,
    collections,
    setSelectedCollection,
    saveSchema,
    deleteSchema,
    validateSchemaText,
    validateDocumentAgainstSchema,
  } = useDashboardMock();
  const initialSchema = selectedCollection.schema ?? EMPTY_SCHEMA;
  const initialModel = schemaToFields(initialSchema);
  const [schema, setSchema] = useState(initialSchema);
  const [schemaFields, setSchemaFields] = useState<SchemaField[]>(
    initialModel.fields,
  );
  const [allowExtra, setAllowExtra] = useState(initialModel.allowExtra);
  const [schemaTab, setSchemaTab] = useState<SchemaTab>("fields");
  const [collectionSearch, setCollectionSearch] = useState("");
  const [fieldSearch, setFieldSearch] = useState("");
  const [selectedFieldIds, setSelectedFieldIds] = useState<string[]>([]);
  const [fieldDeleteIds, setFieldDeleteIds] = useState<string[]>([]);
  const [fieldDeleteConfirm, setFieldDeleteConfirm] = useState("");
  const [schemaError, setSchemaError] = useState("");
  const [schemaNotice, setSchemaNotice] = useState("");
  const [validated, setValidated] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [testDoc, setTestDoc] = useState('{\n  "name": "Alice Johnson"\n}');
  const [testResult, setTestResult] = useState("");
  const filteredCollections = collections.filter((collection) =>
    collection.name
      .toLowerCase()
      .includes(collectionSearch.trim().toLowerCase()),
  );
  const fieldQuery = fieldSearch.trim().toLowerCase();
  const visibleSchemaFields = fieldQuery
    ? schemaFields.filter(
        (field) =>
          field.name.toLowerCase().includes(fieldQuery) ||
          field.type.toLowerCase().includes(fieldQuery),
      )
    : schemaFields;
  const visibleFieldIds = visibleSchemaFields.map((field) => field.id);
  const fieldDeleteNames = schemaFields
    .filter((field) => fieldDeleteIds.includes(field.id))
    .map((field) => field.name || "field");
  const selectedVisibleCount = visibleFieldIds.filter((id) =>
    selectedFieldIds.includes(id),
  ).length;
  const allVisibleSelected =
    visibleFieldIds.length > 0 &&
    selectedVisibleCount === visibleFieldIds.length;
  const someVisibleSelected =
    selectedVisibleCount > 0 && selectedVisibleCount < visibleFieldIds.length;

  useEffect(() => {
    const nextSchema = selectedCollection.schema ?? EMPTY_SCHEMA;
    const nextModel = schemaToFields(nextSchema);
    setSchema(nextSchema);
    setSchemaFields(nextModel.fields);
    setAllowExtra(nextModel.allowExtra);
    setSchemaTab("fields");
    setSchemaError("");
    setSchemaNotice("");
    setFieldSearch("");
    setSelectedFieldIds([]);
    setValidated(false);
    setTestResult("");
  }, [selectedCollection]);

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
      setSchemaNotice("");
      setValidated(false);
      return;
    }
    setSchemaError(result.error ?? "Schema fields are invalid.");
    setValidated(false);
  }

  function handleSchemaChange(value: string) {
    setSchema(value);
    setValidated(false);
    setSchemaNotice("");
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
    const text = currentSchemaText();
    if (!text) return;
    const result = validateSchemaText(text);
    setSchemaNotice(result.message);
    setValidated(result.ok);
    if (!result.ok) setSchemaError(result.message);
  }

  function handleSave() {
    const text = currentSchemaText();
    if (!text) return;
    const result = saveSchema(text);
    setSchemaNotice(result.message);
    setValidated(result.ok);
    if (!result.ok) setSchemaError(result.message);
  }

  function handleDelete() {
    const result = deleteSchema();
    setSchemaNotice(result.message);
    setDeleting(false);
  }

  function handleTestDocument() {
    const result = validateDocumentAgainstSchema(testDoc);
    setTestResult(result.message);
  }

  function updateField(id: string, patch: Partial<SchemaField>) {
    syncSchemaModel(
      schemaFields.map((field) =>
        field.id === id ? { ...field, ...patch } : field,
      ),
    );
  }

  function selectedFields() {
    const selected = new Set(selectedFieldIds);
    return schemaFields.filter((field) => selected.has(field.id));
  }

  function selectedFieldsAsCsv() {
    const csvEscape = (value: string) => `"${value.replaceAll('"', '""')}"`;
    return [
      ["field", "type", "required"].map(csvEscape).join(","),
      ...selectedFields().map((field) =>
        [field.name, field.type, String(field.required)]
          .map(csvEscape)
          .join(","),
      ),
    ].join("\n");
  }

  function selectedFieldsAsJson() {
    return JSON.stringify(
      selectedFields().map((field) => ({
        field: field.name,
        type: field.type,
        required: field.required,
      })),
      null,
      2,
    );
  }

  async function copySelectedFields(format: "csv" | "json") {
    const text =
      format === "csv" ? selectedFieldsAsCsv() : selectedFieldsAsJson();
    await navigator.clipboard.writeText(text);
    setValidated(true);
    setSchemaNotice(
      `Copied ${selectedFieldIds.length} schema ${selectedFieldIds.length === 1 ? "row" : "rows"} as ${format.toUpperCase()}.`,
    );
  }

  function exportSelectedFields(format: "csv" | "json") {
    const text =
      format === "csv" ? selectedFieldsAsCsv() : selectedFieldsAsJson();
    const blob = new Blob([text], {
      type: format === "csv" ? "text/csv" : "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selectedCollection.name}-schema-fields.${format}`;
    link.click();
    URL.revokeObjectURL(url);
    setValidated(true);
    setSchemaNotice(
      `Exported ${selectedFieldIds.length} schema ${selectedFieldIds.length === 1 ? "row" : "rows"} as ${format.toUpperCase()}.`,
    );
  }

  function deleteSelectedFields() {
    setFieldDeleteIds(selectedFieldIds);
    setFieldDeleteConfirm("");
  }

  function confirmDeleteSelectedFields() {
    if (fieldDeleteConfirm !== "delete") return;
    const selected = new Set(fieldDeleteIds);
    const count = fieldDeleteIds.length;
    syncSchemaModel(schemaFields.filter((field) => !selected.has(field.id)));
    setSelectedFieldIds([]);
    setFieldDeleteIds([]);
    setFieldDeleteConfirm("");
    setValidated(true);
    setSchemaNotice(`Deleted ${count} schema ${count === 1 ? "row" : "rows"}.`);
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
    <div className="h-full flex flex-col animate-in fade-in duration-500">
      <div className="hidden">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
            Table Schema
          </h1>
          <p className="text-[14px] text-zinc-500 mt-1">
            Add write protection for documents in{" "}
            <span className="font-mono text-zinc-700 dark:text-zinc-300">
              {selectedCollection.name}
            </span>
            .
          </p>
        </div>
        <SecondaryButton
          icon={Trash2}
          onClick={() => setDeleting(true)}
          disabled={!selectedCollection.schema}
          className="hover:border-red-500/50 hover:text-red-400"
        >
          Delete schema
        </SecondaryButton>
      </div>

      <div className="hidden">
        <Alert variant="info">
          <Info size={16} className="shrink-0 mt-0.5" />
          <span>
            This schema checks new and edited documents in this collection.
            Existing documents are not changed.
          </span>
        </Alert>
      </div>

      {schemaNotice && (
        <ToastNotice
          message={schemaNotice}
          variant={validated ? "success" : "warning"}
          onClose={() => setSchemaNotice("")}
        />
      )}

      <div className="mt-0 flex-1 min-h-0 min-w-0 overflow-hidden flex gap-0">
        <aside className="w-[260px] shrink-0 bg-white dark:bg-[#161616] border-r border-zinc-200 dark:border-white/5 flex flex-col overflow-hidden">
          <div className="px-4 py-4 border-b border-zinc-200 dark:border-white/5">
            <h2 className="text-[16px] font-semibold text-zinc-900 dark:text-zinc-100">
              Schema Editor
            </h2>
            <div className="mt-4 h-9 px-3 rounded-md border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-[#121212] text-[13px] text-zinc-600 dark:text-zinc-300 flex items-center justify-between">
              Collection schemas
            </div>
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
                    className={`w-full h-9 px-4 grid grid-cols-[18px_1fr] items-center gap-2 text-left text-[13px] transition-colors ${
                      active
                        ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                        : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                    }`}
                  >
                    <Table2 size={14} className="text-zinc-400" />
                    <span className="truncate">{collection.name}</span>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <div className="flex-1 min-h-0 min-w-0 overflow-hidden flex flex-col">
          <CollectionTabs
            collections={collections}
            selectedCollection={selectedCollection.name}
            onSelect={setSelectedCollection}
          />
          <div className="flex-1 min-h-0 overflow-hidden bg-white dark:bg-[#161616] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-white/5 shrink-0">
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
              {selectedCollection.schema ? (
                <Badge variant="success">
                  <ShieldCheck size={12} /> Saved
                </Badge>
              ) : (
                <span className="text-[12px] text-zinc-500">Not saved yet</span>
              )}
            </div>

            <div className="flex flex-col gap-4 flex-1 min-h-0 overflow-hidden">
              {schemaTab === "fields" ? (
                <div className="flex-1 min-h-0 flex flex-col gap-4">
                  <div
                    className={`flex-1 min-h-0 w-full overflow-hidden flex flex-col ${
                      schemaFields.length > 0
                        ? "border-b border-zinc-200 dark:border-white/5"
                        : ""
                    }`}
                  >
                    <div className="h-12 shrink-0 flex items-center gap-3 px-4 border-b border-zinc-200 dark:border-white/5 bg-white dark:bg-[#121212]">
                      {selectedFieldIds.length > 0 ? (
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
                                  <ChevronDown
                                    size={14}
                                    className="text-zinc-400"
                                  />
                                </button>
                              }
                            >
                              <DropdownItem
                                onClick={() => copySelectedFields("csv")}
                              >
                                Copy as CSV
                              </DropdownItem>
                              <DropdownItem
                                onClick={() => copySelectedFields("json")}
                              >
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
                                  <ChevronDown
                                    size={14}
                                    className="text-zinc-400"
                                  />
                                </button>
                              }
                            >
                              <DropdownItem
                                onClick={() => exportSelectedFields("csv")}
                              >
                                Export as CSV
                              </DropdownItem>
                              <DropdownItem
                                onClick={() => exportSelectedFields("json")}
                              >
                                Export as JSON
                              </DropdownItem>
                            </Dropdown>
                          </div>
                          <button
                            type="button"
                            onClick={deleteSelectedFields}
                            className="ml-auto h-8 inline-flex items-center rounded-md border border-red-200 bg-red-50 px-3 text-[13px] font-medium text-red-700 hover:bg-red-100 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20 transition-colors"
                          >
                            Delete {selectedFieldIds.length}{" "}
                            {selectedFieldIds.length === 1 ? "row" : "rows"}
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
                              placeholder="Filter fields..."
                              className="w-full h-10 pl-7 pr-3 text-[13px] bg-transparent border-0 focus:outline-none placeholder:text-zinc-400 text-zinc-900 dark:text-zinc-100"
                            />
                          </div>
                          <PrimaryButton
                            icon={Plus}
                            onClick={() =>
                              syncSchemaModel([
                                ...schemaFields,
                                defaultSchemaField(schemaFields),
                              ])
                            }
                            className="ml-auto shrink-0 py-1.5"
                          >
                            Add field
                          </PrimaryButton>
                        </>
                      )}
                    </div>
                    <div className="shrink-0 overflow-hidden">
                      <div className="min-w-[594px] grid grid-cols-[44px_minmax(220px,1fr)_180px_150px] bg-zinc-50 dark:bg-[#1a1a1a] border-b border-zinc-200 dark:border-white/5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                        <div className="px-4 py-3 flex items-center justify-center border-r border-zinc-200 dark:border-white/5">
                          <SelectionCheckbox
                            checked={allVisibleSelected}
                            mixed={someVisibleSelected}
                            checkedIcon="dash"
                            disabled={visibleFieldIds.length === 0}
                            label="Select visible schema fields"
                            onClick={toggleVisibleFieldSelection}
                          />
                        </div>
                        <div className="px-4 py-3 border-r border-zinc-200 dark:border-white/5">
                          Field
                        </div>
                        <div className="px-4 py-3 border-r border-zinc-200 dark:border-white/5">
                          Type
                        </div>
                        <div className="px-4 py-3">Required</div>
                      </div>
                    </div>
                    <div className="flex-1 min-h-0 overflow-auto custom-scrollbar pb-20">
                      <div className="[&>*]:border-b [&>*]:border-zinc-100 dark:[&>*]:border-white/5">
                        {schemaFields.length === 0 ? (
                          <div className="min-h-[280px]">
                            <EmptyState
                              icon={Table2}
                              title="No schema fields"
                              description="Add fields to validate documents in this collection."
                            />
                          </div>
                        ) : visibleSchemaFields.length === 0 ? (
                          <div className="min-h-[220px]">
                            <EmptyState
                              icon={Search}
                              title="No matching fields"
                              description="Adjust the field filter to show schema fields."
                            />
                          </div>
                        ) : (
                          visibleSchemaFields.map((field) => (
                            <div
                              key={field.id}
                              className="min-w-[594px] grid grid-cols-[44px_minmax(220px,1fr)_180px_150px] items-center"
                            >
                              <div className="h-11 flex items-center justify-center border-r border-zinc-100 dark:border-white/5">
                                <SelectionCheckbox
                                  checked={selectedFieldIds.includes(field.id)}
                                  label={`Select ${field.name || "field"}`}
                                  onClick={() => toggleFieldSelection(field.id)}
                                />
                              </div>
                              <input
                                value={field.name}
                                onChange={(event) =>
                                  updateField(field.id, {
                                    name: event.target.value,
                                  })
                                }
                                placeholder="field_name"
                                className="h-11 px-4 font-mono text-[13px] bg-transparent border-r border-zinc-100 dark:border-white/5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:bg-zinc-50 dark:focus:bg-[#121212]"
                              />
                              <div className="h-11 border-r border-zinc-100 dark:border-white/5">
                                <Dropdown
                                  fullWidth
                                  trigger={
                                    <button
                                      type="button"
                                      className="w-full h-11 px-4 flex items-center justify-between text-[13px] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-[#121212] transition-colors"
                                    >
                                      {field.type}
                                      <ChevronDown
                                        size={14}
                                        className="text-zinc-400"
                                      />
                                    </button>
                                  }
                                >
                                  {SCHEMA_TYPES.map((type) => (
                                    <DropdownItem
                                      key={type}
                                      onClick={() =>
                                        updateField(field.id, { type })
                                      }
                                    >
                                      <div className="flex items-center justify-between w-full">
                                        {type}
                                        {field.type === type && (
                                          <Check
                                            size={14}
                                            className="text-emerald-500"
                                          />
                                        )}
                                      </div>
                                    </DropdownItem>
                                  ))}
                                </Dropdown>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  updateField(field.id, {
                                    required: !field.required,
                                  })
                                }
                                className="h-11 px-4 flex items-center gap-2 text-[13px] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-[#121212] transition-colors"
                              >
                                <span
                                  className={`w-4 h-4 rounded border grid place-items-center leading-none ${
                                    field.required
                                      ? "bg-zinc-900 border-zinc-900 text-white dark:bg-white dark:border-white dark:text-black"
                                      : "border-zinc-300 dark:border-zinc-600"
                                  }`}
                                >
                                  {field.required && (
                                    <Check size={11} strokeWidth={3} />
                                  )}
                                </span>
                                Yes
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col gap-3 p-6">
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
                    className="w-full font-mono text-[13px] bg-zinc-50 dark:bg-[#121212] border border-zinc-200 dark:border-white/10 rounded-md p-4 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 resize-y shadow-inner custom-scrollbar"
                  />
                </div>
              )}

              {schemaError && (
                <p className="mx-4 text-[12px] text-red-400 font-mono">
                  {schemaError}
                </p>
              )}
            </div>

            <div className="sticky bottom-0 z-20 flex items-center justify-between gap-4 px-6 py-4 border-t border-zinc-200 dark:border-white/5 bg-zinc-50 dark:bg-[#1a1a1a] rounded-b-lg shrink-0">
              <div className="min-w-0">
                {schemaTab === "fields" &&
                  (schemaFields.length > 0 || selectedCollection.schema) && (
                    <CheckboxControl
                      checked={allowExtra}
                      onChange={() =>
                        syncSchemaModel(schemaFields, !allowExtra)
                      }
                      label="Allow fields not listed above"
                      className="rounded-md px-2 py-1.5 whitespace-nowrap"
                    />
                  )}
              </div>
              <div className="flex items-center justify-end gap-3 shrink-0">
                <SecondaryButton
                  onClick={handleValidateSchema}
                  disabled={!!schemaError}
                >
                  Validate schema
                </SecondaryButton>
                <PrimaryButton disabled={!!schemaError} onClick={handleSave}>
                  Save schema
                </PrimaryButton>
              </div>
            </div>
          </div>

          <div className="hidden">
            <div className="bg-white dark:bg-[#161616] rounded-lg border border-zinc-200 dark:border-white/5 p-6 shadow-sm">
              <h3 className="text-[13px] font-semibold text-zinc-800 dark:text-zinc-200 mb-4">
                Test a document
              </h3>
              <div className="flex flex-col gap-3">
                <label
                  htmlFor="schema-test-document"
                  className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Document JSON
                </label>
                <textarea
                  id="schema-test-document"
                  value={testDoc}
                  rows={8}
                  onKeyDown={(event) =>
                    handleTextareaIndent(event, (value) => {
                      setTestDoc(value);
                      setTestResult("");
                    })
                  }
                  onChange={(event) => {
                    setTestDoc(event.target.value);
                    setTestResult("");
                  }}
                  spellCheck={false}
                  className="w-full font-mono text-[12px] bg-zinc-50 dark:bg-[#121212] border border-zinc-200 dark:border-white/10 rounded-md p-3 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 resize-y shadow-inner custom-scrollbar"
                />
                <SecondaryButton onClick={handleTestDocument}>
                  Test document
                </SecondaryButton>
                {testResult && (
                  <Alert
                    variant={
                      testResult.includes("matches") ? "success" : "warning"
                    }
                  >
                    <span>{testResult}</span>
                  </Alert>
                )}
              </div>
            </div>

            <div className="bg-white dark:bg-[#161616] rounded-lg border border-zinc-200 dark:border-white/5 p-6 shadow-sm">
              <h3 className="text-[13px] font-semibold text-zinc-800 dark:text-zinc-200 mb-4">
                What this affects
              </h3>
              <ul className="flex flex-col gap-3 text-[13px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                <li className="flex items-start gap-3">
                  <ShieldCheck
                    size={17}
                    className="text-emerald-500 mt-0.5 shrink-0"
                  />
                  <span>New documents are checked before they are saved.</span>
                </li>
                <li className="flex items-start gap-3">
                  <ShieldCheck
                    size={17}
                    className="text-emerald-500 mt-0.5 shrink-0"
                  />
                  <span>Edits must also match the saved schema.</span>
                </li>
                <li className="flex items-start gap-3">
                  <ShieldCheck
                    size={17}
                    className="text-emerald-500 mt-0.5 shrink-0"
                  />
                  <span>
                    Removing the schema turns off validation for this
                    collection.
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {fieldDeleteIds.length > 0 && (
        <ConfirmModal
          title={
            fieldDeleteIds.length === 1
              ? "Delete schema row"
              : "Delete schema rows"
          }
          description={
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-3 p-4 rounded-lg bg-red-50 dark:bg-red-500/5 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-300 text-[13px] leading-relaxed shadow-sm">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <span>
                  This removes{" "}
                  {fieldDeleteIds.length === 1 ? (
                    <span className="font-mono font-semibold text-red-900 dark:text-red-100">
                      {fieldDeleteNames[0]}
                    </span>
                  ) : (
                    <span className="font-semibold text-red-900 dark:text-red-100">
                      {fieldDeleteIds.length} schema rows
                    </span>
                  )}{" "}
                  from the schema builder.
                </span>
              </div>
              <div>
                <label
                  htmlFor="delete-schema-fields-confirm"
                  className="block text-[12px] font-medium text-zinc-700 dark:text-zinc-300 mb-2"
                >
                  Type{" "}
                  <span className="font-mono text-zinc-800 dark:text-zinc-200">
                    delete
                  </span>{" "}
                  to confirm
                </label>
                <input
                  id="delete-schema-fields-confirm"
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
            fieldDeleteIds.length === 1 ? "Delete row" : "Delete rows"
          }
          danger
          onConfirm={confirmDeleteSelectedFields}
          onClose={() => {
            setFieldDeleteIds([]);
            setFieldDeleteConfirm("");
          }}
        />
      )}

      {deleting && (
        <ConfirmModal
          title="Delete schema"
          description="Remove the schema from this collection? New writes will no longer be checked by this schema."
          confirmLabel="Delete schema"
          danger
          onConfirm={handleDelete}
          onClose={() => setDeleting(false)}
        />
      )}
    </div>
  );
}
