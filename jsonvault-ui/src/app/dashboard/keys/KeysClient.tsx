"use client";

import { ChevronDown, Info, KeyRound, Plus, Search } from "lucide-react";
import { useState, useTransition } from "react";
import {
  Alert,
  ConfirmModal,
  CopyButton,
  Dropdown,
  DropdownItem,
  PrimaryButton,
  SecondaryButton,
  SidePanel,
  ToastNotice,
} from "@/components/ui";
import { WorkspacePage } from "@/components/Workspace";
import type {
  ApiKeyScope,
  DashboardApiKeyRecord,
  GeneratedApiKey,
} from "@/lib/api-keys";
import { generateRuntimeApiKeyAction } from "./actions";
import type { KeyActionResult } from "./key-state";

const SCOPE_OPTIONS: {
  scope: ApiKeyScope;
  title: string;
  description: string;
}[] = [
  {
    scope: "read_write",
    title: "Read/write app key",
    description: "Let your app read, write, and use realtime.",
  },
  {
    scope: "read_only",
    title: "Read-only app key",
    description: "Let your app read project data safely.",
  },
];

export default function KeysClient({
  database,
  collections,
  keys,
  canManageKeys,
  loadError = "",
}: {
  database: string;
  collections: string[];
  keys: DashboardApiKeyRecord[];
  canManageKeys: boolean;
  loadError?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const [scope, setScope] = useState<ApiKeyScope>("read_write");
  const [collection, setCollection] = useState("*");
  const [notice, setNotice] = useState<KeyActionResult | null>(null);
  const [createdKey, setCreatedKey] = useState<GeneratedApiKey | null>(null);
  const [keyRecords, setKeyRecords] = useState<DashboardApiKeyRecord[]>(keys);
  const [keySearch, setKeySearch] = useState("");
  const [generateConfirm, setGenerateConfirm] = useState(false);

  const searchQuery = keySearch.trim().toLowerCase();
  const visibleKeys = searchQuery
    ? keyRecords.filter((record) => matchesKeySearch(record, searchQuery))
    : keyRecords;

  function openCreate() {
    setScope("read_write");
    setCollection("*");
    setNotice(null);
    setCreatedKey(null);
    setGenerateConfirm(false);
    setCreating(true);
  }

  function handleGenerate() {
    setGenerateConfirm(false);
    if (!canManageKeys) return;

    startTransition(async () => {
      const result = await generateRuntimeApiKeyAction(scope, collection);
      setNotice(result);
      if (result.key) {
        setCreatedKey(result.key);
      }
      const record = result.record;
      if (record) {
        setKeyRecords((current) => [
          record,
          ...current.filter((existing) => existing.id !== record.id),
        ]);
      }
    });
  }

  return (
    <WorkspacePage
      hideHeader
      title="API Keys"
      description={
        <>
          Create read-only and read/write keys for{" "}
          <span className="font-mono text-zinc-700 dark:text-zinc-300">
            {database}
          </span>
        </>
      }
    >
      {notice?.message && !creating && (
        <ToastNotice
          message={notice.message}
          variant={notice.status === "error" ? "danger" : notice.status}
          onClose={() => setNotice(null)}
        />
      )}

      <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
        <div className="flex h-12 shrink-0 items-center gap-3 border-b border-zinc-200 bg-white px-4 dark:border-white/5 dark:bg-[#121212]">
          <div className="relative max-w-xl flex-1">
            <Search
              size={14}
              className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 text-zinc-400"
            />
            <input
              type="search"
              value={keySearch}
              onChange={(event) => setKeySearch(event.target.value)}
              placeholder="Filter generated key metadata..."
              className="h-10 w-full border-0 bg-transparent pl-7 pr-3 text-[13px] text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:text-zinc-100"
            />
          </div>
          <PrimaryButton
            icon={Plus}
            disabled={!canManageKeys || isPending}
            onClick={openCreate}
            className="ml-auto shrink-0 py-1.5"
          >
            Generate key
          </PrimaryButton>
        </div>

        {loadError && (
          <div className="border-b border-zinc-200 px-4 py-3 dark:border-white/5">
            <Alert variant="danger">
              <span>{loadError}</span>
            </Alert>
          </div>
        )}

        {!canManageKeys && !loadError && (
          <div className="border-b border-zinc-200 px-4 py-3 dark:border-white/5">
            <Alert variant="warning">
              <span>The selected project token cannot generate API keys.</span>
            </Alert>
          </div>
        )}

        <div className="min-h-0 min-w-0 flex-1 overflow-auto pb-16 custom-scrollbar">
          <table className="min-w-max w-full border-collapse text-left text-[13px]">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-white/5 dark:bg-[#1a1a1a]">
                {[
                  "Token",
                  "Token ID",
                  "Use",
                  "Database",
                  "Collection",
                  "Expires",
                ].map((heading) => (
                  <th
                    key={heading}
                    className="border-r border-zinc-200 px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 last:border-r-0 dark:border-white/5 dark:text-zinc-400"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody
              className={`divide-y divide-zinc-100 dark:divide-white/5 ${visibleKeys.length > 0 ? "border-b border-zinc-100 dark:border-white/5" : ""}`}
            >
              {visibleKeys.length > 0 ? (
                visibleKeys.map((record) => (
                  <tr
                    key={record.id}
                    className="bg-white text-zinc-700 transition-colors hover:bg-zinc-50 dark:bg-[#121212] dark:text-zinc-300 dark:hover:bg-white/[0.03]"
                  >
                    <td className="border-r border-zinc-100 px-4 py-3 align-top dark:border-white/5">
                      <span className="font-mono text-[12px] text-zinc-900 dark:text-zinc-100">
                        {formatTokenPrefix(record.tokenPrefix)}
                      </span>
                    </td>
                    <td className="border-r border-zinc-100 px-4 py-3 align-top dark:border-white/5">
                      <span
                        className="block max-w-[220px] truncate font-mono text-[12px] text-zinc-700 dark:text-zinc-300"
                        title={record.tokenId}
                      >
                        {record.tokenId}
                      </span>
                    </td>
                    <td className="border-r border-zinc-100 px-4 py-3 align-top dark:border-white/5">
                      <div className="flex min-w-[180px] flex-col gap-1">
                        <span className="font-medium text-zinc-900 dark:text-zinc-100">
                          {formatScope(record.scope)}
                        </span>
                        <span
                          className="max-w-[260px] truncate text-[12px] text-zinc-500"
                          title={record.capabilities.join(", ")}
                        >
                          {record.capabilities.join(", ") || "default"}
                        </span>
                      </div>
                    </td>
                    <td className="border-r border-zinc-100 px-4 py-3 align-top dark:border-white/5">
                      <span className="font-mono text-[12px]">
                        {record.database}
                      </span>
                    </td>
                    <td className="border-r border-zinc-100 px-4 py-3 align-top dark:border-white/5">
                      <span className="font-mono text-[12px]">
                        {record.collection}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span title={record.expiresAt}>
                        {formatDate(record.expiresAt)}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-3 text-zinc-500">
                      <KeyRound size={22} />
                      <span>
                        {keyRecords.length === 0
                          ? "No generated key metadata yet."
                          : "No key metadata matches this filter."}
                      </span>
                      <span className="max-w-[420px] text-[12px] leading-relaxed">
                        {keyRecords.length === 0
                          ? "Generate a key to store its non-secret prefix, token ID, scope, and expiration here."
                          : "Adjust the filter to find a stored key metadata record."}
                      </span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {creating && (
        <SidePanel
          title="Generate API key"
          onClose={() => setCreating(false)}
          hasUnsavedChanges={!!createdKey?.token}
          discardTitle="Close generated key?"
          discardDescription="Generated keys are only shown once. Make sure you copied it before closing this panel."
          size="lg"
          footer={
            <>
              <SecondaryButton type="button" onClick={() => setCreating(false)}>
                Close
              </SecondaryButton>
              {!createdKey && (
                <PrimaryButton
                  type="button"
                  disabled={!canManageKeys || isPending}
                  onClick={() => setGenerateConfirm(true)}
                >
                  {isPending ? "Generating..." : "Generate key"}
                </PrimaryButton>
              )}
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

          {createdKey?.token ? (
            <div className="flex flex-col gap-5">
              <p className="text-[13px] text-zinc-500">
                Copy this key now. Generated keys are only shown once.
              </p>
              <div className="flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-white/10 dark:bg-[#121212]">
                <code className="flex-1 break-all font-mono text-[12px] text-zinc-800 dark:text-zinc-200">
                  {createdKey.token}
                </code>
                <CopyButton text={createdKey.token} />
              </div>
              <dl className="grid gap-3 text-[13px] sm:grid-cols-2">
                <KeyFact label="Token ID" value={createdKey.jti} mono />
                <KeyFact label="Scope" value={createdKey.scope} mono />
                <KeyFact label="Database" value={createdKey.database} mono />
                <KeyFact
                  label="Collection"
                  value={createdKey.collection}
                  mono
                />
                <KeyFact label="Expires" value={createdKey.expires_at} mono />
                <KeyFact
                  label="Capabilities"
                  value={createdKey.capabilities.join(", ") || "default"}
                />
              </dl>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-1">
                <p className="block text-[12px] font-medium text-zinc-700 dark:text-zinc-300">
                  What will this key be used for?
                </p>
                <Dropdown
                  fullWidth
                  trigger={
                    <button
                      type="button"
                      className="flex w-full items-center justify-between rounded-md border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-[13px] text-zinc-900 shadow-inner transition-colors focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-white/10 dark:bg-[#121212] dark:text-zinc-100"
                    >
                      <span>
                        {SCOPE_OPTIONS.find((option) => option.scope === scope)
                          ?.title || scope}
                      </span>
                      <ChevronDown size={14} className="text-zinc-400" />
                    </button>
                  }
                >
                  <div className="p-1">
                    {SCOPE_OPTIONS.map((option) => (
                      <DropdownItem
                        key={option.scope}
                        onClick={() => setScope(option.scope)}
                      >
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium text-zinc-900 dark:text-zinc-100">
                            {option.title}
                          </span>
                          <span className="text-zinc-500">
                            {option.description}
                          </span>
                        </div>
                      </DropdownItem>
                    ))}
                  </div>
                </Dropdown>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="key-database"
                    className="mb-2 block text-[12px] font-medium text-zinc-700 dark:text-zinc-300"
                  >
                    Database
                  </label>
                  <input
                    id="key-database"
                    type="text"
                    value={database}
                    readOnly
                    className="w-full rounded-md border border-zinc-200 bg-zinc-50 px-4 py-2.5 font-mono text-[13px] text-zinc-900 shadow-inner transition-colors dark:border-white/10 dark:bg-[#121212] dark:text-zinc-100"
                  />
                </div>
                <div>
                  <label
                    htmlFor="key-collection"
                    className="mb-2 block text-[12px] font-medium text-zinc-700 dark:text-zinc-300"
                  >
                    Collection
                  </label>
                  <select
                    id="key-collection"
                    value={collection}
                    onChange={(event) => setCollection(event.target.value)}
                    className="w-full rounded-md border border-zinc-200 bg-zinc-50 px-4 py-2.5 font-mono text-[13px] text-zinc-900 shadow-inner transition-colors focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-white/10 dark:bg-[#121212] dark:text-zinc-100"
                  >
                    <option value="*">* for all</option>
                    {collections.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <Alert variant="info">
                <Info size={16} />
                <span>
                  Generated app keys are constrained to the selected project
                  database and chosen collection scope.
                </span>
              </Alert>
            </div>
          )}
        </SidePanel>
      )}

      {generateConfirm && (
        <ConfirmModal
          title="Generate API key?"
          description={
            <p className="text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">
              Confirm before creating this key. The token will only be shown
              once.
            </p>
          }
          confirmLabel="Generate key"
          onClose={() => setGenerateConfirm(false)}
          onConfirm={handleGenerate}
        />
      )}
    </WorkspacePage>
  );
}

function KeyFact({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase text-zinc-500">
        {label}
      </dt>
      <dd
        className={`mt-1 truncate text-zinc-800 dark:text-zinc-200 ${
          mono ? "font-mono text-[12px]" : ""
        }`}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

function matchesKeySearch(
  record: DashboardApiKeyRecord,
  searchQuery: string,
): boolean {
  return [
    record.tokenPrefix,
    record.tokenId,
    record.scope,
    record.database,
    record.collection,
    record.expiresAt,
    ...record.capabilities,
  ].some((value) => value.toLowerCase().includes(searchQuery));
}

function formatTokenPrefix(prefix: string): string {
  return `${prefix.slice(0, 5)}...`;
}

function formatScope(scope: ApiKeyScope): string {
  return scope === "read_only" ? "Read-only" : "Read/write";
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return value;
  }
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
