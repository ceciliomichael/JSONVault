import type { Capability, MeResponse } from "./types";

export function hasCapability(me: MeResponse | null, cap: Capability): boolean {
  if (!me) return false;
  if (me.scope === "admin") return true;
  return me.capabilities?.includes(cap) ?? false;
}

export function hasAnyCapability(
  me: MeResponse | null,
  caps: readonly Capability[],
): boolean {
  return caps.some((cap) => hasCapability(me, cap));
}

export function isAdmin(me: MeResponse | null): boolean {
  return me?.scope === "admin";
}

export function canWrite(me: MeResponse | null): boolean {
  if (!me) return false;
  if (me.scope === "admin") return true;
  return me.scope === "read_write" || hasCapability(me, "documents:write");
}

export function getScopeBadgeClasses(scope: string): string {
  const base =
    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide";
  switch (scope) {
    case "admin":
      return `${base} bg-red-100 text-red-800`;
    case "project_admin":
      return `${base} bg-amber-100 text-amber-800`;
    case "read_write":
      return `${base} bg-blue-100 text-blue-800`;
    case "read_only":
      return `${base} bg-slate-100 text-slate-600 border border-slate-200`;
    default:
      return `${base} bg-slate-100 text-slate-600`;
  }
}

export function formatScope(scope: string): string {
  const map: Record<string, string> = {
    admin: "Root Admin",
    project_admin: "Project Owner",
    read_write: "Read / Write",
    read_only: "Read Only",
  };
  return map[scope] ?? scope;
}

export function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function truncate(str: string, max = 40): string {
  return str.length <= max ? str : `${str.slice(0, max)}…`;
}

export async function copyToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}
