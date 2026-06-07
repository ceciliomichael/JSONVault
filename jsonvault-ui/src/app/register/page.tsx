"use client";

import { Eye, EyeOff, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
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
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setError("");
    setLoading(true);
    await new Promise((r) => setTimeout(r, 300));
    setLoading(false);
    router.push("/projects");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-8">
          <div className="w-8 h-8 rounded-lg bg-green-700 flex items-center justify-center text-white font-black text-[15px] select-none">
            JV
          </div>
          <div>
            <div className="text-[17px] font-bold text-slate-900 leading-tight">
              JSONVault
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              Dashboard
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8">
          <h1 className="text-xl font-bold text-slate-900 mb-1">
            Create account
          </h1>
          <p className="text-[13px] text-slate-500 mb-6">
            Get started with JSONVault Dashboard.
          </p>

          <form
            onSubmit={handleSubmit}
            noValidate
            className="flex flex-col gap-4"
          >
            {error && (
              <div className="px-3 py-2.5 rounded-md bg-red-50 border border-red-200 text-red-800 text-[12px]">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="name"
                className="text-[12px] font-semibold text-slate-700"
              >
                Name{" "}
                <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <input
                id="name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="w-full px-3 py-2 text-[13px] border border-slate-200 rounded-md focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/20 placeholder:text-slate-400"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="email"
                className="text-[12px] font-semibold text-slate-700"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3 py-2 text-[13px] border border-slate-200 rounded-md focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/20 placeholder:text-slate-400"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="password"
                className="text-[12px] font-semibold text-slate-700"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPwd ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  className="w-full pl-3 pr-10 py-2 text-[13px] border border-slate-200 rounded-md focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/20 placeholder:text-slate-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  aria-label={showPwd ? "Hide password" : "Show password"}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors"
                >
                  {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <p className="text-[11px] text-slate-500">
              By creating an account you agree to the terms of service. No
              credit card required. We will not ask for your JSONVault JWT
              secret or admin key during registration.
            </p>

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-md bg-green-700 text-white text-sm font-semibold hover:bg-green-800 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <UserPlus size={15} />
              )}
              {loading ? "Checking…" : "Create account"}
            </button>
          </form>
        </div>

        <p className="text-center text-[12px] text-slate-500 mt-4">
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-green-700 font-semibold hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
