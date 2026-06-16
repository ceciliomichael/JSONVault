"use client";

import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Loader2,
  Search,
  XCircle,
} from "lucide-react";
import { useState, useTransition } from "react";
import {
  Badge,
  PrimaryButton,
  SecondaryButton,
  SelectionCheckbox,
  SidePanel,
  ToastNotice,
} from "@/components/ui";
import { WorkspacePage } from "@/components/Workspace";
import type { OperationRecord } from "@/lib/core/types";
import { formatDate } from "@/lib/utils";
import { cancelOperationAction } from "./actions";

const STATE_META: Record<
  string,
  {
    icon: React.ElementType;
    cls: string;
    label: string;
    badgeVariant: "success" | "danger" | "info" | "warning" | "neutral";
  }
> = {
  ready: {
    icon: CheckCircle,
    cls: "text-emerald-500",
    label: "Ready",
    badgeVariant: "success",
  },
  running: {
    icon: Loader2,
    cls: "text-blue-400 animate-spin",
    label: "Running",
    badgeVariant: "info",
  },
  failed: {
    icon: XCircle,
    cls: "text-red-400",
    label: "Failed",
    badgeVariant: "danger",
  },
  queued: {
    icon: Clock,
    cls: "text-zinc-500",
    label: "Queued",
    badgeVariant: "neutral",
  },
  canceling: {
    icon: Clock,
    cls: "text-amber-400",
    label: "Canceling",
    badgeVariant: "warning",
  },
  canceled: {
    icon: AlertTriangle,
    cls: "text-amber-400",
    label: "Canceled",
    badgeVariant: "warning",
  },
};

export default function OperationsClient({
  projectId,
  database,
  allOperations,
}: {
  projectId: string;
  database: string;
  allOperations: OperationRecord[];
}) {
  const [isPending, startTransition] = useTransition();

  const [selected, setSelected] = useState<OperationRecord | null>(null);
  const [notice, setNotice] = useState<{
    status: "success" | "danger" | "warning";
    message: string;
  } | null>(null);
  const [operationSearch, setOperationSearch] = useState("");
  const [selectedOperationIds, setSelectedOperationIds] = useState<string[]>(
    [],
  );

  // Filter operations for the current database
  const operations = allOperations.filter(
    (operation) => operation.database === database,
  );

  const visibleOperations = operations.filter((operation) => {
    const query = operationSearch.trim().toLowerCase();
    if (!query) return true;
    return [
      operation.operation_id,
      operation.type,
      operation.collection,
      operation.state,
      operation.actor,
    ].some((value) =>
      String(value ?? "")
        .toLowerCase()
        .includes(query),
    );
  });

  const visibleOperationIds = visibleOperations.map(
    (operation) => operation.operation_id,
  );
  const allVisibleSelected =
    visibleOperationIds.length > 0 &&
    visibleOperationIds.every((id) => selectedOperationIds.includes(id));
  const someVisibleSelected =
    !allVisibleSelected &&
    visibleOperationIds.some((id) => selectedOperationIds.includes(id));

  const selectedOperations = operations.filter((operation) =>
    selectedOperationIds.includes(operation.operation_id),
  );
  const selectedCancellableOperations = selectedOperations.filter(
    (operation) =>
      operation.cancellable && ["queued", "running"].includes(operation.state),
  );

  function handleCancel(operationId: string) {
    startTransition(async () => {
      const result = await cancelOperationAction(
        projectId,
        database,
        operationId,
      );
      setNotice({
        status: result.success ? "success" : "danger",
        message: result.message,
      });
    });
  }

  function cancelSelectedOperations() {
    if (selectedCancellableOperations.length === 0) return;

    startTransition(async () => {
      let lastResult = null;
      for (const operation of selectedCancellableOperations) {
        lastResult = await cancelOperationAction(
          projectId,
          database,
          operation.operation_id,
        );
      }

      setNotice({
        status: lastResult?.success ? "success" : "danger",
        message:
          selectedCancellableOperations.length === 1
            ? lastResult?.message || "Operation canceled."
            : `Cancel requested for ${selectedCancellableOperations.length} operations.`,
      });
      setSelectedOperationIds([]);
    });
  }

  function toggleOperationSelection(id: string) {
    setSelectedOperationIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function toggleVisibleOperationSelection() {
    if (allVisibleSelected) {
      setSelectedOperationIds((current) =>
        current.filter((id) => !visibleOperationIds.includes(id)),
      );
      return;
    }
    setSelectedOperationIds((current) =>
      Array.from(new Set([...current, ...visibleOperationIds])),
    );
  }

  return (
    <WorkspacePage
      hideHeader
      title="Operations"
      description={
        <>
          Track background work for{" "}
          <span className="font-mono text-zinc-700 dark:text-zinc-300">
            {database}
          </span>
        </>
      }
    >
      {notice && (
        <ToastNotice
          message={notice.message}
          variant={notice.status}
          onClose={() => setNotice(null)}
        />
      )}

      <div className="h-full flex flex-col min-h-0 min-w-0 overflow-hidden">
        <div className="h-12 shrink-0 flex items-center gap-3 px-4 border-b border-zinc-200 dark:border-white/5 bg-white dark:bg-[#121212]">
          {selectedOperationIds.length > 0 ? (
            <>
              <span className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300">
                {selectedOperationIds.length} selected
              </span>
              <button
                type="button"
                onClick={cancelSelectedOperations}
                disabled={
                  selectedCancellableOperations.length === 0 || isPending
                }
                className="ml-auto h-8 inline-flex items-center rounded-md border border-red-200 bg-red-50 px-3 text-[13px] font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20 transition-colors"
              >
                {selectedCancellableOperations.length === 0
                  ? "No cancellable operations"
                  : `Cancel ${selectedCancellableOperations.length} ${
                      selectedCancellableOperations.length === 1
                        ? "operation"
                        : "operations"
                    }`}
              </button>
              <SecondaryButton
                onClick={() => setSelectedOperationIds([])}
                className="py-1.5"
                disabled={isPending}
              >
                Clear selection
              </SecondaryButton>
            </>
          ) : (
            <div className="relative flex-1 max-w-xl">
              <Search
                size={14}
                className="absolute left-0 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
              />
              <input
                type="search"
                value={operationSearch}
                onChange={(event) => setOperationSearch(event.target.value)}
                placeholder="Filter operations..."
                className="w-full h-10 pl-7 pr-3 text-[13px] bg-transparent border-0 focus:outline-none placeholder:text-zinc-400 text-zinc-900 dark:text-zinc-100"
              />
            </div>
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
                    disabled={visibleOperationIds.length === 0}
                    label="Select visible operations"
                    onClick={toggleVisibleOperationSelection}
                  />
                </th>
                {[
                  "ID",
                  "Type",
                  "Collection",
                  "State",
                  "Progress",
                  "Updated",
                ].map((heading) => (
                  <th
                    key={heading}
                    className="px-4 py-3 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider whitespace-nowrap border-r border-zinc-200 dark:border-white/5 last:border-r-0"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody
              className={`divide-y divide-zinc-100 dark:divide-white/5 ${visibleOperations.length > 0 ? "border-b border-zinc-100 dark:border-white/5" : ""}`}
            >
              {operations.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-16 text-center text-zinc-500"
                  >
                    No background tasks yet.
                  </td>
                </tr>
              ) : visibleOperations.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-16 text-center text-zinc-500"
                  >
                    No matching operations.
                  </td>
                </tr>
              ) : (
                visibleOperations.map((operation) => {
                  const meta = STATE_META[operation.state] ?? STATE_META.queued;
                  const Icon = meta.icon;
                  return (
                    // biome-ignore lint/a11y/useSemanticElements: Table rows stay semantic while supporting whole-row details.
                    <tr
                      key={operation.operation_id}
                      className="cursor-pointer hover:bg-zinc-50 focus-within:bg-zinc-50 dark:hover:bg-zinc-900/50 dark:focus-within:bg-zinc-900/50 transition-colors"
                      onClick={() => setSelected(operation)}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget) return;
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelected(operation);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <td className="px-4 py-3 text-center border-r border-zinc-100 dark:border-white/5">
                        <SelectionCheckbox
                          checked={selectedOperationIds.includes(
                            operation.operation_id,
                          )}
                          label={`Select ${operation.operation_id}`}
                          onClick={() => {
                            toggleOperationSelection(operation.operation_id);
                          }}
                        />
                      </td>
                      <td className="px-4 py-3 border-r border-zinc-100 dark:border-white/5">
                        <span className="font-mono text-[13px] text-zinc-500 dark:text-zinc-400">
                          {operation.operation_id}
                        </span>
                      </td>
                      <td className="px-4 py-3 border-r border-zinc-100 dark:border-white/5">
                        <span className="font-mono text-[13px] text-zinc-700 dark:text-zinc-300">
                          {operation.type.replace(".", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3 border-r border-zinc-100 dark:border-white/5">
                        <span className="font-mono text-[13px] text-zinc-700 dark:text-zinc-300">
                          {operation.collection || "-"}
                        </span>
                      </td>
                      <td className="px-4 py-3 border-r border-zinc-100 dark:border-white/5">
                        <div className="flex items-center gap-2">
                          <Icon size={14} className={meta.cls} />
                          <Badge variant={meta.badgeVariant}>
                            {meta.label}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-4 py-3 min-w-[140px] border-r border-zinc-100 dark:border-white/5">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                operation.state === "failed"
                                  ? "bg-red-500/60"
                                  : operation.state === "running"
                                    ? "bg-blue-500/60"
                                    : "bg-emerald-500/60"
                              }`}
                              style={{ width: `${operation.progress * 100}%` }}
                            />
                          </div>
                          <span className="font-mono text-[11px] text-zinc-500 w-8 text-right">
                            {Math.round(operation.progress * 100)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-zinc-500 whitespace-nowrap text-[12px]">
                        {formatDate(operation.updated_at)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="h-10 shrink-0 flex items-center px-4 border-t border-zinc-200 dark:border-white/5 text-[12px] text-zinc-500 bg-zinc-50 dark:bg-[#161616]">
          Operation history is temporary in this server version.
        </div>
      </div>

      {selected && (
        <SidePanel
          title="Operation details"
          onClose={() => setSelected(null)}
          size="lg"
          footer={
            <>
              <SecondaryButton onClick={() => setSelected(null)}>
                Close
              </SecondaryButton>
              {selected.cancellable &&
                ["queued", "running"].includes(selected.state) && (
                  <PrimaryButton
                    disabled={isPending}
                    onClick={() => {
                      handleCancel(selected.operation_id);
                      setSelected(null);
                    }}
                  >
                    Cancel operation
                  </PrimaryButton>
                )}
            </>
          }
        >
          <dl className="grid grid-cols-1 gap-3 text-[13px]">
            {[
              ["ID", selected.operation_id],
              ["Type", selected.type],
              ["Database", selected.database],
              ["Collection", selected.collection || "-"],
              ["State", selected.state],
              ["Actor", selected.actor],
              ["Created", formatDate(selected.created_at)],
              ["Updated", formatDate(selected.updated_at)],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4">
                <dt className="text-zinc-500">{label}</dt>
                <dd className="font-mono text-zinc-800 dark:text-zinc-200 text-right">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          {selected.last_error && (
            <div className="rounded-md border border-red-500/20 bg-red-500/5 p-3 text-[13px] text-red-300">
              {selected.last_error}
            </div>
          )}
        </SidePanel>
      )}
    </WorkspacePage>
  );
}
