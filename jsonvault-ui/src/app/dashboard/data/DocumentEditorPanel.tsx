"use client";

import { Check, ChevronDown, Code2, Plus, Table2, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Alert,
  Dropdown,
  DropdownItem,
  PrimaryButton,
  SecondaryButton,
  SidePanel,
} from "@/components/ui";
import { handleTextareaIndent } from "@/lib/textarea-indent";
import {
  createDefaultDocumentFields,
  DOCUMENT_FIELD_TYPES,
  type DocumentField,
  type DocumentFieldType,
  documentJsonToFields,
  EMPTY_DOCUMENT_JSON,
  fieldId,
  fieldsToDocumentJson,
  validateDocumentJson,
} from "./document-editor";

type EditorTab = "fields" | "json";

export type DocumentEditorContext =
  | { mode: "create"; json: string }
  | { mode: "edit"; id: string; etag?: string; json: string };

export function DocumentEditorPanel({
  editor,
  disabled,
  isPending,
  onClose,
  onSave,
}: {
  editor: DocumentEditorContext;
  disabled: boolean;
  isPending: boolean;
  onClose: () => void;
  onSave: (json: string) => void;
}) {
  const initialFields = useMemo(
    () =>
      editor.mode === "create"
        ? createDefaultDocumentFields()
        : documentJsonToFields(editor.json),
    [editor],
  );
  const [activeTab, setActiveTab] = useState<EditorTab>("fields");
  const [fields, setFields] = useState<DocumentField[]>(initialFields);
  const initialJson =
    editor.mode === "create" ? EMPTY_DOCUMENT_JSON : editor.json;
  const [json, setJson] = useState(
    editor.mode === "create" ? EMPTY_DOCUMENT_JSON : editor.json,
  );
  const [error, setError] = useState("");
  const [isDirty, setIsDirty] = useState(false);

  function setFieldsAndSync(nextFields: DocumentField[]) {
    setFields(nextFields);
    setIsDirty(true);
    const result = fieldsToDocumentJson(nextFields);
    if (result.value) {
      setJson(result.value);
      setError("");
      return;
    }
    setError(result.error ?? "Document fields are invalid.");
  }

  function handleJsonChange(value: string) {
    setJson(value);
    setIsDirty(value !== initialJson);
    const validationError = validateDocumentJson(value);
    setError(validationError);
    if (!validationError) {
      setFields(documentJsonToFields(value));
    }
  }

  function switchTab(tab: EditorTab) {
    if (tab === "json" && activeTab === "fields") {
      const result = fieldsToDocumentJson(fields);
      if (result.error || !result.value) {
        setError(result.error ?? "Document fields are invalid.");
        return;
      }
      setJson(result.value);
      setError("");
    }
    if (tab === "fields" && activeTab === "json") {
      const validationError = validateDocumentJson(json);
      if (validationError) {
        setError(validationError);
        return;
      }
      setFields(documentJsonToFields(json));
    }
    setActiveTab(tab);
  }

  function save() {
    const result =
      activeTab === "fields" ? fieldsToDocumentJson(fields) : { value: json };
    const value = result.value ?? "";
    const validationError = result.error ?? validateDocumentJson(value);
    if (validationError) {
      setError(validationError);
      return;
    }
    onSave(value);
  }

  function addField() {
    setFieldsAndSync([
      ...fields,
      {
        id: fieldId(),
        name: nextFieldName(fields),
        type: "string",
        value: "",
      },
    ]);
  }

  return (
    <SidePanel
      title={editor.mode === "create" ? "Create document" : "Edit document"}
      onClose={onClose}
      size="lg"
      bodyClassName="flex flex-col p-0"
      hasUnsavedChanges={isDirty || json !== initialJson}
      footer={
        <>
          <SecondaryButton type="button" onClick={onClose}>
            Cancel
          </SecondaryButton>
          <PrimaryButton
            disabled={disabled || isPending || !!error}
            onClick={save}
          >
            {isPending
              ? "Saving..."
              : editor.mode === "create"
                ? "Create document"
                : "Save changes"}
          </PrimaryButton>
        </>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-zinc-200 px-6 dark:border-white/5">
          <div className="flex h-14 gap-6">
            {[
              { id: "fields" as const, label: "Fields", icon: Table2 },
              { id: "json" as const, label: "Raw JSON", icon: Code2 },
            ].map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => switchTab(tab.id)}
                  className={`inline-flex h-14 items-center gap-2 border-b-2 text-[13px] font-medium transition-colors ${
                    active
                      ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                      : "border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                  }`}
                >
                  <Icon size={14} />
                  {tab.label}
                </button>
              );
            })}
          </div>
          {activeTab === "fields" && (
            <SecondaryButton
              type="button"
              icon={Plus}
              disabled={disabled}
              onClick={addField}
              className="h-8 px-3 py-0"
            >
              Add field
            </SecondaryButton>
          )}
        </div>

        {error && (
          <div className="border-b border-zinc-200 px-6 py-3 dark:border-white/5">
            <Alert variant="danger">
              <span className="font-mono text-[12px]">{error}</span>
            </Alert>
          </div>
        )}

        {activeTab === "fields" ? (
          <DocumentFieldEditor
            fields={fields}
            disabled={disabled}
            onChange={setFieldsAndSync}
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col px-6 py-6">
            <label
              htmlFor="document-json"
              className="mb-2 block text-[12px] font-medium text-zinc-700 dark:text-zinc-300"
            >
              Document JSON
            </label>
            <textarea
              id="document-json"
              value={json}
              onChange={(event) => handleJsonChange(event.target.value)}
              onKeyDown={(event) =>
                handleTextareaIndent(event, handleJsonChange)
              }
              className="min-h-0 flex-1 resize-none rounded-md border border-zinc-200 bg-zinc-50 p-4 font-mono text-[13px] text-zinc-800 shadow-inner transition-colors focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-[#121212] dark:text-zinc-200 custom-scrollbar"
              spellCheck={false}
              disabled={disabled}
            />
          </div>
        )}
      </div>
    </SidePanel>
  );
}

function DocumentFieldEditor({
  fields,
  disabled,
  onChange,
}: {
  fields: DocumentField[];
  disabled: boolean;
  onChange: (fields: DocumentField[]) => void;
}) {
  function updateField(id: string, patch: Partial<DocumentField>) {
    onChange(
      fields.map((field) => (field.id === id ? { ...field, ...patch } : field)),
    );
  }

  function removeField(id: string) {
    onChange(fields.filter((field) => field.id !== id));
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto custom-scrollbar">
      <table className="min-w-[560px] w-full border-collapse text-left text-[13px]">
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-white/5 dark:bg-[#1a1a1a]">
            {["Field", "Type", "Value", ""].map((heading) => (
              <th
                key={heading || "actions"}
                className="border-r border-zinc-200 px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 last:w-12 last:border-r-0 dark:border-white/5 dark:text-zinc-400"
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody
          className={`divide-y divide-zinc-100 dark:divide-white/5 ${fields.length > 0 ? "border-b border-zinc-100 dark:border-white/5" : ""}`}
        >
          {fields.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-6 py-10 text-center text-zinc-500">
                No fields.
              </td>
            </tr>
          ) : (
            fields.map((field) => (
              <tr
                key={field.id}
                className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
              >
                <td className="w-[34%] border-r border-zinc-100 px-3 py-2 dark:border-white/5">
                  <input
                    value={field.name}
                    onChange={(event) =>
                      updateField(field.id, { name: event.target.value })
                    }
                    placeholder="field_name"
                    disabled={disabled}
                    className="h-9 w-full bg-transparent font-mono text-[13px] text-zinc-900 transition-colors focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:text-zinc-100"
                  />
                </td>
                <td className="w-[132px] border-r border-zinc-100 px-3 py-2 dark:border-white/5">
                  <FieldTypeSelect
                    field={field}
                    disabled={disabled}
                    onChange={(type) => updateField(field.id, { type })}
                  />
                </td>
                <td className="border-r border-zinc-100 px-3 py-2 dark:border-white/5">
                  <FieldValueInput
                    field={field}
                    disabled={disabled}
                    onChange={(value) => updateField(field.id, { value })}
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    aria-label={`Remove ${field.name || "field"}`}
                    disabled={disabled}
                    onClick={() => removeField(field.id)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-red-500/10"
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
  );
}

function FieldTypeSelect({
  field,
  disabled,
  onChange,
}: {
  field: DocumentField;
  disabled: boolean;
  onChange: (type: DocumentFieldType) => void;
}) {
  return (
    <div className="h-9">
      <Dropdown
        fullWidth
        trigger={
          <button
            type="button"
            disabled={disabled}
            className="flex h-9 w-full items-center justify-between bg-transparent font-mono text-[13px] text-zinc-700 transition-colors disabled:cursor-not-allowed disabled:opacity-60 dark:text-zinc-300"
          >
            {field.type}
            <ChevronDown size={14} className="text-zinc-400" />
          </button>
        }
      >
        {DOCUMENT_FIELD_TYPES.map((type) => (
          <DropdownItem key={type} onClick={() => onChange(type)}>
            <div className="flex w-full items-center justify-between">
              {type}
              {field.type === type && <Check size={14} />}
            </div>
          </DropdownItem>
        ))}
      </Dropdown>
    </div>
  );
}

function FieldValueInput({
  field,
  disabled,
  onChange,
}: {
  field: DocumentField;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  if (field.type === "null") {
    return (
      <div className="flex h-9 w-full items-center font-mono text-[13px] text-zinc-400">
        null
      </div>
    );
  }

  if (field.type === "object" || field.type === "array") {
    return (
      <textarea
        value={field.value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        rows={3}
        className="min-h-9 w-full resize-y bg-transparent py-2 font-mono text-[12px] text-zinc-900 transition-colors focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:text-zinc-100 custom-scrollbar"
      />
    );
  }

  return (
    <input
      value={field.value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={field.type === "boolean" ? "true or false" : "value"}
      disabled={disabled}
      className="h-9 w-full bg-transparent font-mono text-[13px] text-zinc-900 transition-colors focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:text-zinc-100"
    />
  );
}

function nextFieldName(fields: DocumentField[]): string {
  const names = new Set(fields.map((field) => field.name.trim()));
  let index = fields.length + 1;
  let name = `field_${index}`;
  while (names.has(name)) {
    index += 1;
    name = `field_${index}`;
  }
  return name;
}
