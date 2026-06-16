import {
  Activity,
  BookOpen,
  CheckCircle2,
  Database,
  FileText,
  FolderOpen,
  KeyRound,
  Radio,
  Search,
  ShieldCheck,
  Table2,
  TerminalSquare,
  Webhook,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  createProjectCoreClient,
  getCoreApiBaseUrl,
  isCoreApiError,
} from "@/lib/core";
import { getSelectedDashboardProject } from "@/lib/projects";
import { requireDashboardSession } from "@/lib/session";
import { formatDate } from "@/lib/utils";
import CopyEndpointButton from "./CopyEndpointButton";

const SECTION_HANDLE_DOTS = [
  "dot-1",
  "dot-2",
  "dot-3",
  "dot-4",
  "dot-5",
  "dot-6",
];

export default async function OverviewPage() {
  const session = await requireDashboardSession();
  const project = await getSelectedDashboardProject(session);
  if (!project) {
    redirect("/projects");
  }

  const client = createProjectCoreClient(project.database);
  const identity = await getProjectIdentity(client);
  const collections = identity
    ? await listCollectionsForProject(client, project.database)
    : [];
  const apiBaseUrl = getCoreApiBaseUrl();
  const apiEndpoint = `${apiBaseUrl}/api/v1/${project.database}`;
  const projectReady = Boolean(identity);

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-9 pb-10">
      <section className="grid gap-10 xl:grid-cols-[minmax(0,560px)_minmax(420px,1fr)]">
        <div className="flex min-h-[360px] flex-col justify-center">
          <div className="mb-5">
            <h1 className="text-[30px] font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              {project.displayName}
            </h1>
            <div className="mt-4 flex max-w-full items-center gap-2">
              <code className="min-w-0 truncate rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1.5 font-mono text-[13px] text-zinc-700 dark:border-white/10 dark:bg-[#161616] dark:text-zinc-300">
                {apiEndpoint}
              </code>
              <CopyEndpointButton
                text={apiEndpoint}
                database={project.database}
                apiBaseUrl={apiBaseUrl}
              />
            </div>
          </div>

          <div className="grid gap-x-10 gap-y-5 sm:grid-cols-2">
            <ProjectFact
              icon={CheckCircle2}
              label="Status"
              value={projectReady ? "Ready" : "Setup needed"}
              tone={projectReady ? "success" : "warning"}
            />
            <ProjectFact
              icon={Database}
              label="Database"
              value={project.database}
              mono
            />
            <ProjectFact
              icon={Table2}
              label="Collections"
              value={String(collections.length)}
            />
            <ProjectFact icon={TerminalSquare} label="API" value="REST + SSE" />
            <ProjectFact
              icon={Radio}
              label="Realtime"
              value={projectReady ? "Enabled" : "Waiting for setup"}
            />
            <ProjectFact
              icon={CheckCircle2}
              label="Created"
              value={formatDate(project.createdAt)}
            />
          </div>
        </div>

        <div className="flex min-h-[360px] items-center justify-center rounded-lg border border-zinc-200 bg-[radial-gradient(circle_at_1px_1px,rgba(113,113,122,0.22)_1px,transparent_0)] [background-size:18px_18px] dark:border-white/10 dark:bg-[radial-gradient(circle_at_1px_1px,rgba(244,244,245,0.16)_1px,transparent_0)]">
          <div className="w-[360px] max-w-[calc(100%-3rem)] rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#161616]">
            <div className="flex items-start gap-3 border-b border-zinc-200 px-4 py-3 dark:border-white/5">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-emerald-500 text-white">
                <Database size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
                    Primary Database
                  </p>
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      projectReady ? "bg-emerald-500" : "bg-amber-500"
                    }`}
                  />
                </div>
                <p className="mt-1 truncate font-mono text-[12px] text-zinc-500">
                  {project.database}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 divide-x divide-zinc-200 text-[12px] dark:divide-white/5">
              <div className="px-3 py-2">
                <span className="text-zinc-500">Collections</span>{" "}
                <span className="font-medium text-zinc-800 dark:text-zinc-200">
                  {collections.length}
                </span>
              </div>
              <div className="px-3 py-2">
                <span className="text-zinc-500">API</span>{" "}
                <span className="font-medium text-zinc-800 dark:text-zinc-200">
                  REST
                </span>
              </div>
              <div className="px-3 py-2">
                <span className="text-zinc-500">Host</span>{" "}
                <span className="font-medium text-zinc-800 dark:text-zinc-200">
                  local
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <OverviewSection title="Get connected">
        <div className="grid overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#161616] md:grid-cols-3 xl:grid-cols-6">
          <ConnectCard
            icon={FileText}
            title="Documents"
            description="Browse JSON data"
            href="/dashboard/data"
          />
          <ConnectCard
            icon={FolderOpen}
            title="Collections"
            description="Manage collections"
            href="/dashboard/collections"
          />
          <ConnectCard
            icon={TerminalSquare}
            title="REST API"
            description="Use HTTP endpoints"
          />
          <ConnectCard
            icon={Radio}
            title="Realtime"
            description="Stream changes"
            href="/dashboard/realtime"
          />
          <ConnectCard
            icon={Search}
            title="Search"
            description="Full-text queries"
            href="/dashboard/fts"
          />
          <ConnectCard
            icon={KeyRound}
            title="API Keys"
            description="Manage project keys"
            href="/dashboard/keys"
          />
        </div>
      </OverviewSection>

      <OverviewSection title="Project features">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <FeatureTile
            icon={ShieldCheck}
            title="Schemas"
            description="Validate document shape"
            href="/dashboard/schemas"
          />
          <FeatureTile
            icon={Zap}
            title="Indexes"
            description="Speed up filters"
            href="/dashboard/indexes"
          />
          <FeatureTile
            icon={Webhook}
            title="Webhooks"
            description="Send change events"
            href="/dashboard/webhooks"
          />
          <FeatureTile
            icon={Activity}
            title="Operations"
            description="Track background work"
            href="/dashboard/operations"
          />
        </div>
      </OverviewSection>

      <OverviewSection title="Resources">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <FeatureTile
            icon={BookOpen}
            title="Documentation"
            description="Integration guide & API reference"
            href="/docs/core-principles"
          />
        </div>
      </OverviewSection>
    </div>
  );
}

function ProjectFact({
  icon: Icon,
  label,
  value,
  mono = false,
  tone = "neutral",
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  mono?: boolean;
  tone?: "neutral" | "success" | "warning";
}) {
  const iconClass =
    tone === "success"
      ? "text-emerald-500"
      : tone === "warning"
        ? "text-amber-500"
        : "text-zinc-500";

  return (
    <div className="grid grid-cols-[48px_1fr] items-center gap-4">
      <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500 shadow-sm dark:border-white/10 dark:bg-[#161616]">
        <Icon size={18} className={iconClass} />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase text-zinc-500">
          {label}
        </div>
        <div
          className={`mt-1 truncate text-[14px] font-medium text-zinc-800 dark:text-zinc-200 ${
            mono ? "font-mono" : ""
          }`}
          title={value}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

function OverviewSection({
  title,
  children,
  badge,
  action,
}: {
  title: string;
  children: React.ReactNode;
  badge?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid h-4 w-2 grid-cols-2 gap-0.5">
            {SECTION_HANDLE_DOTS.map((dot) => (
              <span
                key={dot}
                className="h-0.5 w-0.5 rounded-full bg-zinc-300 dark:bg-zinc-700"
              />
            ))}
          </span>
          <h2 className="text-[20px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            {title}
          </h2>
          {badge}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function ConnectCard({
  icon: Icon,
  title,
  description,
  href,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  href?: string;
}) {
  const content = (
    <div className="flex min-h-[112px] flex-col items-center justify-center border-zinc-200 px-5 py-6 text-center transition-colors dark:border-white/10 md:border-r md:last:border-r-0">
      <Icon size={17} className="mb-3 text-zinc-500" />
      <div className="text-[13px] font-medium text-zinc-800 dark:text-zinc-200">
        {title}
      </div>
      <div className="mt-1 text-[13px] text-zinc-500">{description}</div>
    </div>
  );

  return href ? (
    <Link href={href} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/40">
      {content}
    </Link>
  ) : (
    content
  );
}

function FeatureTile({
  icon: Icon,
  title,
  description,
  href,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-[132px] flex-col justify-between rounded-lg border border-zinc-200 bg-white p-5 shadow-sm transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-white/10 dark:bg-[#161616] dark:hover:bg-zinc-900/40"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-zinc-100 text-zinc-500 dark:bg-zinc-800/60">
        <Icon size={17} />
      </div>
      <div>
        <div className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100">
          {title}
        </div>
        <p className="mt-1 text-[13px] text-zinc-500">{description}</p>
      </div>
    </Link>
  );
}

async function getProjectIdentity(
  client: ReturnType<typeof createProjectCoreClient>,
) {
  try {
    return await client.getMe();
  } catch {
    return null;
  }
}

async function listCollectionsForProject(
  client: ReturnType<typeof createProjectCoreClient>,
  database: string,
): Promise<string[]> {
  try {
    return await client.listCollections({ database });
  } catch (error) {
    if (isCoreApiError(error) && error.status === 404) {
      return [];
    }
    return [];
  }
}
