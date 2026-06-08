"use client";

import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthShell } from "@/components/AuthShell";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      setError("Email and password are required.");
      return;
    }
    setError("");
    setLoading(true);
    await new Promise((r) => setTimeout(r, 500));
    setLoading(false);
    router.push("/projects");
  }

  return (
    <AuthShell>
      <h1 className="mb-1 text-[22px] font-semibold text-zinc-900 dark:text-zinc-100">
        Welcome back
      </h1>
      <p className="mb-8 text-[13px] text-zinc-500">Sign in to your account</p>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {error && (
          <div className="rounded-md border border-red-500/20 bg-red-500/5 px-3.5 py-2.5 text-[12px] leading-relaxed text-red-500 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="email"
            className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300"
          >
            Email address
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-[13px] text-zinc-900 transition-colors placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-white/10 dark:bg-[#1a1a1a] dark:text-zinc-100"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label
              htmlFor="password"
              className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300"
            >
              Password
            </label>
            <button
              type="button"
              className="text-[12px] text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              Forgot password?
            </button>
          </div>
          <div className="relative">
            <input
              id="password"
              type={showPwd ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-md border border-zinc-200 bg-zinc-50 py-2.5 pl-3 pr-10 text-[13px] text-zinc-900 transition-colors placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-white/10 dark:bg-[#1a1a1a] dark:text-zinc-100"
            />
            <button
              type="button"
              onClick={() => setShowPwd(!showPwd)}
              aria-label={showPwd ? "Hide password" : "Show password"}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 transition-colors hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-md bg-zinc-900 px-4 py-2.5 text-[13px] font-medium text-white shadow-sm transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          {loading && (
            <span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin dark:border-black/30 dark:border-t-black" />
          )}
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>

      <p className="mt-6 text-center text-[12px] text-zinc-500">
        Don&apos;t have an account?{" "}
        <Link
          href="/register"
          className="font-medium text-zinc-700 underline underline-offset-2 transition-colors hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white"
        >
          Sign up
        </Link>
      </p>
    </AuthShell>
  );
}
