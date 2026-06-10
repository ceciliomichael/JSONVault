"use client";

import { CodeBlock, CopyButton, SidePanel } from "./ui";

function StepRow({
  step,
  title,
  description,
  children,
}: {
  step: number;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-6 py-6 border-b border-zinc-100 dark:border-white/5 last:border-0">
      <div className="flex flex-col items-center shrink-0 gap-2">
        <span className="w-6 h-6 rounded-md border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-[#1a1a1a] text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 flex items-center justify-center shrink-0">
          {step}
        </span>
      </div>
      <div className="flex flex-1 min-w-0 gap-6 flex-col sm:flex-row">
        <div className="sm:w-[200px] shrink-0 flex flex-col gap-1">
          <p className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
            {title}
          </p>
          <p className="text-[12px] text-zinc-500 leading-relaxed">
            {description}
          </p>
        </div>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}

function InlineCodeBlock({ code }: { code: string }) {
  return (
    <div className="relative group rounded-lg bg-zinc-50 dark:bg-[#1a1a1a] border border-zinc-200 dark:border-white/10 overflow-hidden">
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <CopyButton text={code} />
      </div>
      <pre className="text-zinc-700 dark:text-zinc-300 font-mono text-[12px] leading-relaxed p-4 overflow-x-auto">
        {code}
      </pre>
    </div>
  );
}

export function ConnectPanel({
  database,
  isOpen,
  apiUrl,
  onClose,
}: {
  database: string;
  isOpen: boolean;
  apiUrl?: string;
  onClose: () => void;
}) {
  if (!isOpen) return null;

  const dbName = database || "your_project";
  let finalApiUrl = apiUrl || "http://localhost:8080";
  if (!finalApiUrl.endsWith("/api/v1")) {
    finalApiUrl = `${finalApiUrl}/api/v1`;
  }
  finalApiUrl = `${finalApiUrl}/${dbName}`;

  const envBlock = `JSONVAULT_API_URL="${finalApiUrl}"
JSONVAULT_API_KEY="<your-api-key>"`;

  const initBlock = `import { EventSource } from "eventsource"; // Node.js

const BASE_URL = process.env.JSONVAULT_API_URL;
const API_KEY  = process.env.JSONVAULT_API_KEY;

// Helper — authenticated fetch
export async function jsonvault(path: string, init?: RequestInit) {
  const res = await fetch(\`\${BASE_URL}/\${path}\`, {
    ...init,
    headers: {
      "Authorization": \`Bearer \${API_KEY}\`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}`;

  const realtimeBlock = `// Subscribe to real-time changes in a collection
const url = \`\${BASE_URL}/messages/subscribe\`;
const es = new EventSource(url, {
  headers: { Authorization: \`Bearer \${API_KEY}\` },
});

es.onmessage = (e) => {
  const event = JSON.parse(e.data);
  // event.action => "insert" | "update" | "delete"
  // event.document_id, event.document, event.etag
  console.log(event);
};`;

  const curlBlock = `curl -X GET ${finalApiUrl}/collections \\
  -H "Authorization: Bearer $JSONVAULT_API_KEY"`;

  return (
    <SidePanel title="Connect to your project" onClose={onClose} size="xl">
      <div className="flex flex-col gap-0 -mt-2">
        <p className="text-[13px] text-zinc-500 mb-6 -mt-1">
          Get started by connecting your app to this JSONVault database.
        </p>

        <StepRow
          step={1}
          title="Set environment variables"
          description="Add these to your app's .env file. Keep your API key server-side only."
        >
          <InlineCodeBlock code={envBlock} />
        </StepRow>

        <StepRow
          step={2}
          title="Create a client helper"
          description="A thin authenticated fetch wrapper to call the REST API."
        >
          <InlineCodeBlock code={initBlock} />
        </StepRow>

        <StepRow
          step={3}
          title="Subscribe to real-time events"
          description="Open a persistent SSE connection to stream inserts, updates, and deletes."
        >
          <InlineCodeBlock code={realtimeBlock} />
        </StepRow>

        <StepRow
          step={4}
          title="Verify connection"
          description="Test your setup by listing collections in this database."
        >
          <InlineCodeBlock code={curlBlock} />
        </StepRow>
      </div>
    </SidePanel>
  );
}
