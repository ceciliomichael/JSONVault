"use client";

import { Radio, Send, Users, Wifi, WifiOff } from "lucide-react";
import { useState } from "react";
import { Badge, PrimaryButton, ToastNotice } from "@/components/ui";
import { CollectionPanel, WorkspacePage } from "@/components/Workspace";
import { useDashboardMock } from "@/lib/mock-dashboard-store";
import { handleTextareaIndent } from "@/lib/textarea-indent";

export default function RealtimePage() {
  const {
    selectedCollection,
    collections,
    setSelectedCollection,
    state,
    startRealtime,
    stopRealtime,
    publishRealtime,
  } = useDashboardMock();
  const [collectionSearch, setCollectionSearch] = useState("");
  const [publishData, setPublishData] = useState('{\n  "message": "hello"\n}');
  const [jsonError, setJsonError] = useState("");
  const [notice, setNotice] = useState("");

  const connected =
    state.realtime.connected &&
    state.realtime.collection === selectedCollection.name;

  function handleToggleListening() {
    const result = connected ? stopRealtime() : startRealtime();
    setNotice(result.message);
  }

  function handlePublish() {
    const result = publishRealtime(publishData);
    setNotice(result.message);
  }

  function handlePayloadChange(value: string) {
    setPublishData(value);
    try {
      const parsed = JSON.parse(value) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setJsonError("Event JSON must be an object.");
        return;
      }
      setJsonError("");
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <WorkspacePage
      hideHeader
      title="Realtime"
      description={
        <>
          Stream live updates for{" "}
          <span className="font-mono text-zinc-700 dark:text-zinc-300">
            {selectedCollection.name}
          </span>
        </>
      }
      action={
        connected ? (
          <Badge variant="success">
            <Wifi size={14} className="mr-1" /> Listening
          </Badge>
        ) : (
          <Badge variant="neutral">
            <WifiOff size={14} className="mr-1" /> Not listening
          </Badge>
        )
      }
    >
      {notice && (
        <ToastNotice
          message={notice}
          variant={notice.includes("Start listening") ? "warning" : "success"}
          onClose={() => setNotice("")}
        />
      )}

      <div className="h-full flex min-h-0 min-w-0 overflow-hidden">
        <CollectionPanel
          title="Realtime"
          collections={collections}
          selectedCollection={selectedCollection.name}
          onSelect={setSelectedCollection}
          search={collectionSearch}
          onSearch={setCollectionSearch}
        />

        <div className="flex-1 grid grid-cols-1 xl:grid-cols-[360px_1fr] min-w-0">
          <aside className="bg-white dark:bg-[#161616] border-r border-zinc-200 dark:border-white/5 overflow-y-auto custom-scrollbar">
            <section className="px-6 py-5 border-b border-zinc-200 dark:border-white/5">
              <h2 className="text-[14px] font-medium text-zinc-800 dark:text-zinc-200">
                Live change feed
              </h2>
              <div className="mt-4 flex flex-col gap-4">
                <div>
                  <p className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                    Subscription URL
                  </p>
                  <code className="block font-mono text-[12px] text-zinc-700 dark:text-zinc-300 bg-zinc-50 dark:bg-[#121212] border border-zinc-200 dark:border-white/10 rounded-md p-3 break-all shadow-inner">
                    GET /api/v1/{state.selectedDb}/{selectedCollection.name}
                    /subscribe
                  </code>
                </div>
                <PrimaryButton
                  onClick={handleToggleListening}
                  className={`w-full justify-center ${
                    connected
                      ? "!bg-red-500/10 !text-red-500 dark:!text-red-400 hover:!bg-red-500/20 border border-red-500/20"
                      : ""
                  }`}
                >
                  {connected ? "Stop listening" : "Start listening"}
                </PrimaryButton>
              </div>
            </section>

            <section className="px-6 py-5 border-b border-zinc-200 dark:border-white/5">
              <h2 className="text-[14px] font-medium text-zinc-800 dark:text-zinc-200">
                Connected clients
              </h2>
              <div className="mt-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-md bg-zinc-100 dark:bg-zinc-800/50 flex items-center justify-center text-zinc-500 dark:text-zinc-400">
                  <Users size={18} />
                </div>
                <div>
                  <div className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
                    {connected ? state.realtime.presence : 0}
                  </div>
                  <div className="text-[12px] text-zinc-500">
                    clients listening
                  </div>
                </div>
              </div>
              <code className="mt-4 block font-mono text-[11px] text-zinc-500 break-all">
                GET /api/v1/{state.selectedDb}/{selectedCollection.name}
                /presence
              </code>
            </section>

            <section className="px-6 py-5">
              <h2 className="text-[14px] font-medium text-zinc-800 dark:text-zinc-200">
                Send temporary event
              </h2>
              <div className="mt-4 flex flex-col gap-4">
                <div className="flex flex-col">
                  <label
                    htmlFor="realtime-payload"
                    className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300 mb-2"
                  >
                    Event JSON
                  </label>
                  <textarea
                    id="realtime-payload"
                    value={publishData}
                    onChange={(event) =>
                      handlePayloadChange(event.target.value)
                    }
                    onKeyDown={(event) =>
                      handleTextareaIndent(event, handlePayloadChange)
                    }
                    spellCheck={false}
                    className="w-full h-56 font-mono text-[12px] bg-zinc-50 dark:bg-[#121212] border border-zinc-200 dark:border-white/10 rounded-md p-3 text-zinc-700 dark:text-zinc-300 resize-none focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 shadow-inner custom-scrollbar"
                  />
                  {jsonError && (
                    <p className="text-[11px] text-red-400 mt-2 font-mono">
                      {jsonError}
                    </p>
                  )}
                </div>
                <PrimaryButton
                  disabled={!!jsonError || !connected}
                  onClick={handlePublish}
                  icon={Send}
                  className="w-full justify-center"
                >
                  Send event
                </PrimaryButton>
                {!connected && (
                  <p className="text-[12px] text-zinc-500 text-center">
                    Start listening before sending a temporary event.
                  </p>
                )}
              </div>
            </section>
          </aside>

          <section className="min-w-0 bg-white dark:bg-[#161616] flex flex-col">
            <div className="h-12 shrink-0 flex items-center justify-between px-4 border-b border-zinc-200 dark:border-white/5 bg-zinc-50 dark:bg-[#1a1a1a]">
              <h2 className="text-[14px] font-medium text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
                <Radio
                  size={16}
                  className={connected ? "text-emerald-500" : "text-zinc-500"}
                />
                Live events
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto font-mono text-[13px] bg-white dark:bg-[#121212] p-4 leading-relaxed custom-scrollbar">
              {state.realtime.events.length === 0 ? (
                <div className="flex items-center justify-center h-full text-zinc-600 text-[13px] font-sans text-center">
                  Start listening to see events. Creating or editing documents
                  while listening will add events here.
                </div>
              ) : (
                state.realtime.events.map((event) => (
                  <div
                    key={event.id}
                    className="flex gap-3 mb-2 hover:bg-zinc-100 dark:hover:bg-white/5 px-2 py-1 rounded transition-colors -mx-2"
                  >
                    <span className="text-zinc-600 shrink-0">{event.ts}</span>
                    <span className="text-emerald-600 dark:text-emerald-400/80 shrink-0">
                      [{event.type}]
                    </span>
                    <span className="text-zinc-700 dark:text-zinc-300 break-all">
                      {event.data}
                    </span>
                  </div>
                ))
              )}
            </div>
            <div className="h-10 shrink-0 flex items-center px-4 border-t border-zinc-200 dark:border-white/5 text-[12px] text-zinc-500 bg-zinc-50 dark:bg-[#161616]">
              Temporary events are not saved for replay.
            </div>
          </section>
        </div>
      </div>
    </WorkspacePage>
  );
}
