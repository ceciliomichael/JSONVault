"use client";

import {
  AlertTriangle,
  CheckCircle,
  Eye,
  EyeOff,
  Loader2,
  Server,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui";

export default function ConnectServerPage() {
  const router = useRouter();
  const [baseUrl, setBaseUrl] = useState("https://");
  const [adminKey, setAdminKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"ok" | "fail" | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function handleTest() {
    setMessage("");
    let parsed: URL;
    try {
      parsed = new URL(baseUrl);
    } catch {
      setTestResult("fail");
      setMessage("Enter a valid HTTP or HTTPS URL.");
      return;
    }
    if (!["http:", "https:"].includes(parsed.protocol)) {
      setTestResult("fail");
      setMessage("Only HTTP and HTTPS JSONVault API URLs are supported.");
      return;
    }

    setTesting(true);
    setTestResult(null);
    try {
      const healthUrl = new URL("/healthz", parsed);
      const res = await fetch(healthUrl, { method: "GET", cache: "no-store" });
      setTestResult(res.ok ? "ok" : "fail");
      setMessage(
        res.ok
          ? "Connection successful."
          : `Health check returned HTTP ${res.status}.`,
      );
    } catch {
      setTestResult("fail");
      setMessage(
        "Could not reach /healthz from the browser. Check URL, server status, and CORS.",
      );
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    localStorage.setItem("jsonvault:apiBaseUrl", baseUrl.trim());
    setMessage("Connection URL saved.");
    await new Promise((r) => setTimeout(r, 300));
    setSaving(false);
    router.push("/projects");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2.5 mb-8">
          <div className="w-8 h-8 rounded-lg bg-green-700 flex items-center justify-center text-white font-black text-[15px] select-none">
            JV
          </div>
          <div>
            <div className="text-[17px] font-bold text-slate-900 leading-tight">
              JSONVault
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              Operator Setup
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8">
          <h1 className="text-xl font-bold text-slate-900 mb-1">
            Connect Server
          </h1>
          <p className="text-[13px] text-slate-500 mb-6">
            Link your self-hosted JSONVault instance to this dashboard.
          </p>

          <Alert variant="danger">
            <AlertTriangle size={13} className="shrink-0 mt-0.5" />
            <span>
              <strong>Operator-only.</strong> The root admin key grants full
              server control. Keep it secret. It will not be shown again after
              saving.
            </span>
          </Alert>

          <div className="flex flex-col gap-4 mt-5">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="base-url"
                className="text-[12px] font-semibold text-slate-700"
              >
                API Base URL
              </label>
              <div className="flex gap-2">
                <input
                  id="base-url"
                  type="url"
                  value={baseUrl}
                  onChange={(e) => {
                    setBaseUrl(e.target.value);
                    setTestResult(null);
                  }}
                  placeholder="https://jsonvault.yourserver.com"
                  className="flex-1 font-mono text-[13px] border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/20"
                />
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={testing || !baseUrl.trim()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-slate-200 bg-white text-slate-700 text-[13px] font-medium hover:bg-slate-50 disabled:opacity-50 transition-colors shrink-0"
                >
                  {testing ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    "Test"
                  )}
                </button>
              </div>
              {testResult === "ok" && (
                <div className="flex items-center gap-1.5 text-[12px] text-green-700">
                  <CheckCircle size={13} /> {message}
                </div>
              )}
              {testResult === "fail" && (
                <div className="flex items-center gap-1.5 text-[12px] text-red-600">
                  <XCircle size={13} /> {message}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="admin-key"
                className="text-[12px] font-semibold text-slate-700"
              >
                Root Admin Key{" "}
                <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <div className="relative">
                <input
                  id="admin-key"
                  type={showKey ? "text" : "password"}
                  value={adminKey}
                  onChange={(e) => setAdminKey(e.target.value)}
                  placeholder="JSONVAULT_ADMIN_KEY value"
                  className="w-full font-mono text-[12px] border border-slate-200 rounded-md pl-3 pr-10 py-2 focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/20"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  aria-label={showKey ? "Hide key" : "Show key"}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors"
                >
                  {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <p className="text-[11px] text-slate-500">
                Leave blank if you will connect with a project_admin token
                instead.
              </p>
            </div>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !baseUrl.trim() || testResult !== "ok"}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-md bg-green-700 text-white text-sm font-semibold hover:bg-green-800 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Server size={15} />
              )}
              {saving ? "Saving…" : "Save connection"}
            </button>
            {testResult === "ok" && message && (
              <p className="text-[11px] text-slate-500">{message}</p>
            )}
          </div>
        </div>

        <p className="text-center text-[12px] text-slate-500 mt-4">
          <Link href="/login" className="text-green-700 hover:underline">
            ← Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
