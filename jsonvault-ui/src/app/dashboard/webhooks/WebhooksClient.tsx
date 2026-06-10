"use client";

import { AlertTriangle, Plus, RefreshCw, Search, Webhook } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  Badge,
  CheckboxControl,
  ConfirmModal,
  CopyButton,
  EmptyState,
  InfoTooltip,
  PrimaryButton,
  SecondaryButton,
  SelectionCheckbox,
  SidePanel,
  ToastNotice,
} from "@/components/ui";
import {
  CollectionPanel,
  WorkspacePage,
  WorkspaceTable,
} from "@/components/Workspace";
import type { WebhookConfig, WebhookDelivery } from "@/lib/core/types";
import { formatDate } from "@/lib/utils";
import { retryDeliveryAction, saveWebhooksAction } from "./actions";

const DELIVERY_BADGE: Record<
  string,
  { variant: "success" | "danger" | "neutral" | "info"; label: string }
> = {
  delivered: { variant: "success", label: "Delivered" },
  failed: { variant: "danger", label: "Failed" },
  pending: { variant: "neutral", label: "Pending" },
  delivering: { variant: "info", label: "Sending" },
};

const EVENT_OPTIONS = ["insert", "update", "delete", "publish", "*"] as const;

export default function WebhooksClient({
  projectId,
  database,
  collections,
  selectedCollection,
  webhooks,
  allDeliveries,
}: {
  projectId: string;
  database: string;
  collections: string[];
  selectedCollection: string;
  webhooks: WebhookConfig[];
  allDeliveries: WebhookDelivery[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [tab, setTab] = useState<"targets" | "deliveries">("targets");
  const [showAdd, setShowAdd] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newEvents, setNewEvents] = useState<string[]>([
    "insert",
    "update",
    "delete",
  ]);
  const [notice, setNotice] = useState<{
    status: "success" | "danger" | "warning";
    message: string;
  } | null>(null);
  const [secret, setSecret] = useState("");
  const [collectionSearch, setCollectionSearch] = useState("");
  const [targetSearch, setTargetSearch] = useState("");
  const [selectedTargetUrls, setSelectedTargetUrls] = useState<string[]>([]);
  const [targetRemoveUrls, setTargetRemoveUrls] = useState<string[]>([]);
  const [targetRemoveConfirm, setTargetRemoveConfirm] = useState("");
  const [saveConfirm, setSaveConfirm] = useState(false);

  const deliveries = useMemo(
    () =>
      allDeliveries.filter(
        (delivery) => delivery.event.collection === selectedCollection,
      ),
    [allDeliveries, selectedCollection],
  );

  const visibleTargets = useMemo(() => {
    const query = targetSearch.trim().toLowerCase();
    if (!query) return webhooks;
    return webhooks.filter(
      (target) =>
        target.url.toLowerCase().includes(query) ||
        target.events.some((eventName) =>
          eventName.toLowerCase().includes(query),
        ),
    );
  }, [webhooks, targetSearch]);

  const visibleTargetUrls = visibleTargets.map((target) => target.url);
  const allVisibleTargetsSelected =
    visibleTargetUrls.length > 0 &&
    visibleTargetUrls.every((url) => selectedTargetUrls.includes(url));
  const someVisibleTargetsSelected =
    !allVisibleTargetsSelected &&
    visibleTargetUrls.some((url) => selectedTargetUrls.includes(url));

  function handleCollectionSelect(collection: string) {
    setSelectedTargetUrls([]);
    setTargetSearch("");
    setNotice(null);
    setSecret("");
    router.push(
      `/dashboard/webhooks?collection=${encodeURIComponent(collection)}`,
    );
  }

  function openAddTarget() {
    setNewUrl("");
    setNewEvents(["insert", "update", "delete"]);
    setSaveConfirm(false);
    setSecret("");
    setShowAdd(true);
  }

  function toggleEvent(eventName: string) {
    if (eventName === "*") {
      setNewEvents(newEvents.includes("*") ? [] : ["*"]);
      return;
    }
    const withoutAll = newEvents.filter((item) => item !== "*");
    setNewEvents(
      withoutAll.includes(eventName)
        ? withoutAll.filter((item) => item !== eventName)
        : [...withoutAll, eventName],
    );
  }

  function handleSaveTarget() {
    setSaveConfirm(false);
    startTransition(async () => {
      // Append the new target to existing targets
      const nextWebhooks = [...webhooks, { url: newUrl, events: newEvents }];

      const result = await saveWebhooksAction(
        projectId,
        database,
        selectedCollection,
        nextWebhooks,
      );

      if (result.success) {
        setNotice({ status: "success", message: result.message });
        setSecret(result.webhookSecret ?? "");
        setNewUrl("");
        setNewEvents(["insert", "update", "delete"]);
        setShowAdd(false);
      } else {
        setNotice({ status: "danger", message: result.message });
      }
    });
  }

  function removeSelectedTargets() {
    setTargetRemoveUrls(selectedTargetUrls);
    setTargetRemoveConfirm("");
  }

  function confirmRemoveSelectedTargets() {
    if (targetRemoveConfirm !== "delete") return;
    if (targetRemoveUrls.length === 0) return;

    startTransition(async () => {
      const urlsToRemove = new Set(targetRemoveUrls);
      const nextWebhooks = webhooks.filter((w) => !urlsToRemove.has(w.url));

      const result = await saveWebhooksAction(
        projectId,
        database,
        selectedCollection,
        nextWebhooks,
      );

      if (result.success) {
        setNotice({
          status: "success",
          message:
            targetRemoveUrls.length === 1
              ? "Removed webhook target."
              : `Removed ${targetRemoveUrls.length} webhook targets.`,
        });
        setSelectedTargetUrls([]);
        setTargetRemoveUrls([]);
        setTargetRemoveConfirm("");
        setSecret(""); // clear secret on remove to avoid confusion
      } else {
        setNotice({ status: "danger", message: result.message });
      }
    });
  }

  function toggleTargetSelection(url: string) {
    setSelectedTargetUrls((current) =>
      current.includes(url)
        ? current.filter((item) => item !== url)
        : [...current, url],
    );
  }

  function toggleVisibleTargetSelection() {
    if (allVisibleTargetsSelected) {
      setSelectedTargetUrls((current) =>
        current.filter((url) => !visibleTargetUrls.includes(url)),
      );
      return;
    }
    setSelectedTargetUrls((current) =>
      Array.from(new Set([...current, ...visibleTargetUrls])),
    );
  }

  function handleRetry(sequence: string | number) {
    startTransition(async () => {
      const result = await retryDeliveryAction(projectId, database, sequence);
      setNotice({
        status: result.success ? "success" : "danger",
        message: result.message,
      });
    });
  }

  return (
    <WorkspacePage
      hideHeader
      title="Webhooks"
      description={
        <>
          Send document changes from{" "}
          <span className="font-mono text-zinc-700 dark:text-zinc-300">
            {selectedCollection || "collection"}
          </span>{" "}
          to your app
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

      <div className="h-full flex min-h-0 min-w-0 overflow-hidden">
        <CollectionPanel
          title="Webhooks"
          collections={collections.map((c) => ({ name: c }))}
          selectedCollection={selectedCollection}
          onSelect={handleCollectionSelect}
          search={collectionSearch}
          onSearch={setCollectionSearch}
        />

        <div className="flex-1 flex flex-col min-w-0">
          <div className="h-12 shrink-0 flex items-center justify-between px-4 border-b border-zinc-200 dark:border-white/5 bg-zinc-50 dark:bg-[#1a1a1a]">
            <div className="flex h-full items-center gap-6">
              {(["targets", "deliveries"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setTab(item)}
                  className={`h-full text-[13px] font-medium transition-colors relative ${
                    tab === item
                      ? "text-zinc-900 dark:text-zinc-100"
                      : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
                  }`}
                >
                  {item === "targets" ? "Targets" : "Deliveries"}
                  {tab === item && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-900 dark:bg-zinc-100 rounded-t-full" />
                  )}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              {tab === "targets" && (
                <InfoTooltip label="Use a public HTTPS endpoint. Local and private network addresses are blocked by JSONVault for safety." />
              )}
              {tab === "deliveries" && (
                <button
                  type="button"
                  aria-label="Refresh deliveries"
                  onClick={() => {
                    startTransition(() => {
                      router.refresh();
                      setNotice({
                        status: "success",
                        message: "Delivery records are up to date.",
                      });
                    });
                  }}
                  disabled={isPending}
                  className="p-1.5 rounded-md text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
                >
                  <RefreshCw size={16} />
                </button>
              )}
            </div>
          </div>

          {secret && (
            <div className="shrink-0 px-4 py-3 border-b border-zinc-200 dark:border-white/5 bg-white dark:bg-[#161616] text-[13px] text-zinc-600 dark:text-zinc-300">
              <span className="inline-flex items-center gap-2 flex-wrap">
                Webhook secret shown once:
                <span className="font-mono text-zinc-800 dark:text-zinc-100">
                  {secret}
                </span>
                <CopyButton text={secret} />
              </span>
            </div>
          )}

          {tab === "targets" && (
            <div className="flex-1 min-h-0 min-w-0 overflow-hidden flex flex-col">
              <div className="h-12 shrink-0 flex items-center gap-3 px-4 border-b border-zinc-200 dark:border-white/5 bg-white dark:bg-[#121212]">
                {selectedTargetUrls.length > 0 ? (
                  <>
                    <span className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300">
                      {selectedTargetUrls.length} selected
                    </span>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={removeSelectedTargets}
                      className="ml-auto h-8 inline-flex items-center rounded-md border border-red-200 bg-red-50 px-3 text-[13px] font-medium text-red-700 hover:bg-red-100 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20 transition-colors disabled:opacity-50"
                    >
                      Remove {selectedTargetUrls.length}{" "}
                      {selectedTargetUrls.length === 1 ? "target" : "targets"}
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
                        value={targetSearch}
                        onChange={(event) =>
                          setTargetSearch(event.target.value)
                        }
                        placeholder="Filter targets..."
                        className="w-full h-10 pl-7 pr-3 text-[13px] bg-transparent border-0 focus:outline-none placeholder:text-zinc-400 text-zinc-900 dark:text-zinc-100"
                      />
                    </div>
                    <PrimaryButton
                      icon={Plus}
                      disabled={isPending}
                      onClick={openAddTarget}
                      className="ml-auto shrink-0 py-1.5"
                    >
                      Add target
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
                          checked={allVisibleTargetsSelected}
                          mixed={someVisibleTargetsSelected}
                          checkedIcon="dash"
                          disabled={visibleTargetUrls.length === 0}
                          label="Select visible webhook targets"
                          onClick={toggleVisibleTargetSelection}
                        />
                      </th>
                      {["Target URL", "Events"].map((heading) => (
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
                    className={`divide-y divide-zinc-100 dark:divide-white/5 ${visibleTargets.length > 0 ? "border-b border-zinc-100 dark:border-white/5" : ""}`}
                  >
                    {webhooks.length === 0 ? (
                      <tr>
                        <td colSpan={3}>
                          <EmptyState
                            icon={Webhook}
                            title="No webhook targets"
                            description="Add a target URL to receive document change events."
                            action={
                              <PrimaryButton
                                icon={Plus}
                                onClick={openAddTarget}
                                disabled={isPending}
                              >
                                Add target
                              </PrimaryButton>
                            }
                          />
                        </td>
                      </tr>
                    ) : visibleTargets.length === 0 ? (
                      <tr>
                        <td
                          colSpan={3}
                          className="px-6 py-16 text-center text-zinc-500"
                        >
                          No matching targets.
                        </td>
                      </tr>
                    ) : (
                      visibleTargets.map((target) => (
                        <tr
                          key={target.url}
                          className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors"
                        >
                          <td className="px-4 py-3 text-center border-r border-zinc-100 dark:border-white/5">
                            <SelectionCheckbox
                              checked={selectedTargetUrls.includes(target.url)}
                              label={`Select ${target.url}`}
                              onClick={() => toggleTargetSelection(target.url)}
                            />
                          </td>
                          <td className="px-4 py-3 border-r border-zinc-100 dark:border-white/5">
                            <span className="font-mono text-[13px] font-medium text-zinc-800 dark:text-zinc-200 break-all">
                              {target.url}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2 flex-wrap">
                              {target.events.map((eventName) => (
                                <span
                                  key={eventName}
                                  className="font-mono text-[12px] px-2.5 py-1 rounded-md bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-white/5 text-zinc-500 dark:text-zinc-400"
                                >
                                  {eventName === "*" ? "all events" : eventName}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "deliveries" && (
            <div className="flex-1 min-h-0">
              <WorkspaceTable
                headings={[
                  "Sequence",
                  "Event",
                  "Collection",
                  "Status",
                  "Attempts",
                  "Updated",
                  "",
                ]}
                hasItems={deliveries.length > 0}
              >
                {deliveries.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <EmptyState
                        icon={Webhook}
                        title="No delivery records"
                        description="Document changes will create delivery records."
                      />
                    </td>
                  </tr>
                ) : (
                  deliveries.map((delivery) => {
                    const badge =
                      DELIVERY_BADGE[delivery.status] ?? DELIVERY_BADGE.pending;
                    return (
                      <tr
                        key={delivery.sequence}
                        className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors group"
                      >
                        <td className="px-4 py-3 border-r border-zinc-100 dark:border-white/5">
                          <span className="font-mono text-[13px] text-zinc-700 dark:text-zinc-300">
                            {delivery.sequence}
                          </span>
                        </td>
                        <td className="px-4 py-3 border-r border-zinc-100 dark:border-white/5">
                          <span className="font-mono text-[13px] text-zinc-700 dark:text-zinc-300">
                            {String(delivery.event.action)}
                          </span>
                        </td>
                        <td className="px-4 py-3 border-r border-zinc-100 dark:border-white/5">
                          <span className="font-mono text-[13px] text-zinc-500 dark:text-zinc-400">
                            {String(delivery.event.collection)}
                          </span>
                        </td>
                        <td className="px-4 py-3 border-r border-zinc-100 dark:border-white/5">
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                        </td>
                        <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400 border-r border-zinc-100 dark:border-white/5">
                          {delivery.attempts}
                        </td>
                        <td className="px-4 py-3 text-zinc-500 text-[12px] whitespace-nowrap border-r border-zinc-100 dark:border-white/5">
                          {formatDate(
                            new Date(delivery.updated_at * 1000).toISOString(),
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {delivery.status === "failed" && (
                            <button
                              type="button"
                              onClick={() => handleRetry(delivery.sequence)}
                              disabled={isPending}
                              className="px-2.5 py-1 rounded-md text-[11px] font-medium border border-zinc-200 dark:border-white/10 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 opacity-0 group-hover:opacity-100 transition-all shadow-sm bg-white dark:bg-[#1a1a1a] disabled:opacity-50"
                            >
                              Retry
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </WorkspaceTable>
            </div>
          )}
        </div>
      </div>

      {targetRemoveUrls.length > 0 && (
        <ConfirmModal
          title={
            targetRemoveUrls.length === 1
              ? "Remove webhook target"
              : "Remove webhook targets"
          }
          description={
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-3 p-4 rounded-lg bg-red-50 dark:bg-red-500/5 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-300 text-[13px] leading-relaxed shadow-sm">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <span>
                  This removes{" "}
                  {targetRemoveUrls.length === 1 ? (
                    <span className="font-mono font-semibold text-red-900 dark:text-red-100 break-all">
                      {targetRemoveUrls[0]}
                    </span>
                  ) : (
                    <span className="font-semibold text-red-900 dark:text-red-100">
                      {targetRemoveUrls.length} webhook targets
                    </span>
                  )}{" "}
                  from this collection.
                </span>
              </div>
              <div>
                <label
                  htmlFor="remove-webhook-targets-confirm"
                  className="block text-[12px] font-medium text-zinc-700 dark:text-zinc-300 mb-2"
                >
                  Type{" "}
                  <span className="font-mono text-zinc-800 dark:text-zinc-200">
                    delete
                  </span>{" "}
                  to confirm
                </label>
                <input
                  id="remove-webhook-targets-confirm"
                  value={targetRemoveConfirm}
                  onChange={(event) =>
                    setTargetRemoveConfirm(event.target.value)
                  }
                  className="w-full font-mono text-[13px] bg-zinc-50 dark:bg-[#121212] border border-zinc-200 dark:border-white/10 rounded-md px-4 py-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-500 shadow-inner transition-colors"
                />
              </div>
            </div>
          }
          confirmLabel={
            targetRemoveUrls.length === 1 ? "Remove target" : "Remove targets"
          }
          danger
          onConfirm={confirmRemoveSelectedTargets}
          onClose={() => {
            setTargetRemoveUrls([]);
            setTargetRemoveConfirm("");
          }}
        />
      )}

      {showAdd && (
        <SidePanel
          title="Add webhook target"
          onClose={() => setShowAdd(false)}
          hasUnsavedChanges={
            !!newUrl.trim() ||
            newEvents.join(",") !== ["insert", "update", "delete"].join(",")
          }
          footer={
            <>
              <SecondaryButton onClick={() => setShowAdd(false)}>
                Cancel
              </SecondaryButton>
              <PrimaryButton
                disabled={!newUrl.trim() || isPending}
                onClick={() => setSaveConfirm(true)}
              >
                Save target
              </PrimaryButton>
            </>
          }
        >
          <div>
            <label
              htmlFor="webhook-url"
              className="block text-[12px] font-medium text-zinc-700 dark:text-zinc-300 mb-2"
            >
              Target URL
            </label>
            <input
              id="webhook-url"
              type="url"
              value={newUrl}
              onChange={(event) => setNewUrl(event.target.value)}
              placeholder="https://api.example.com/webhook"
              className="w-full font-mono text-[13px] bg-zinc-50 dark:bg-[#121212] border border-zinc-200 dark:border-white/10 rounded-md px-4 py-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-colors shadow-inner"
            />
          </div>
          <div>
            <p className="block text-[12px] font-medium text-zinc-700 dark:text-zinc-300 mb-3">
              Events to send
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {EVENT_OPTIONS.map((eventName) => (
                <CheckboxControl
                  key={eventName}
                  checked={newEvents.includes(eventName)}
                  onChange={() => toggleEvent(eventName)}
                  label={eventName === "*" ? "All events" : eventName}
                  className="rounded-md border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-[#121212] px-3 py-2.5 hover:bg-zinc-100 dark:hover:bg-zinc-800/50"
                />
              ))}
            </div>
          </div>
          <div className="text-[12px] leading-relaxed text-zinc-500">
            The webhook secret will be shown once after saving. Store it with
            your receiving app.
          </div>
        </SidePanel>
      )}
      {saveConfirm && (
        <ConfirmModal
          title="Save webhook target?"
          description={
            <p className="text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">
              Confirm before saving this webhook target and generating its
              signing secret.
            </p>
          }
          confirmLabel="Save target"
          onClose={() => setSaveConfirm(false)}
          onConfirm={handleSaveTarget}
        />
      )}
    </WorkspacePage>
  );
}
