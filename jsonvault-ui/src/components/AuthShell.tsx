"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { BrandMark } from "@/components/BrandMark";

const TESTIMONIALS = [
  {
    quote:
      "JSONVault is a joy to work with. Document storage that actually makes sense - fast, lightweight, and the API is refreshingly intuitive.",
    handle: "@devmarco",
    initials: "DM",
  },
  {
    quote:
      "We replaced our entire cache layer with JSONVault in a weekend. The performance improvements were immediate and the setup was trivial.",
    handle: "@lenatech",
    initials: "LT",
  },
  {
    quote:
      "Finally a document database that doesn't try to do everything. JSONVault is focused, fast, and the DX is excellent.",
    handle: "@0xriku",
    initials: "RK",
  },
];

type AuthShellProps = {
  children: ReactNode;
};

export function AuthShell({ children }: AuthShellProps) {
  const [quoteIdx, setQuoteIdx] = useState(0);

  useEffect(() => {
    setQuoteIdx(Math.floor(Math.random() * TESTIMONIALS.length));
  }, []);

  const testimonial = TESTIMONIALS[quoteIdx];

  return (
    <div className="min-h-screen flex bg-white dark:bg-[#121212]">
      <div className="flex min-h-screen w-full shrink-0 flex-col px-6 py-7 sm:px-10 lg:w-[560px] lg:px-12 xl:w-[600px]">
        <div className="flex items-center gap-2 pb-10">
          <BrandMark />
          <span className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300">
            JSONVault
          </span>
        </div>

        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center pb-14">
          {children}
        </div>

        <p className="mt-auto pt-4 text-center text-[11px] text-zinc-400 dark:text-zinc-600">
          By continuing, you agree to the{" "}
          <span className="cursor-pointer underline underline-offset-2 transition-colors hover:text-zinc-600 dark:hover:text-zinc-400">
            Terms of Service
          </span>{" "}
          and{" "}
          <span className="cursor-pointer underline underline-offset-2 transition-colors hover:text-zinc-600 dark:hover:text-zinc-400">
            Privacy Policy
          </span>
          .
        </p>
      </div>

      <div className="relative hidden flex-1 items-center justify-center overflow-hidden border-l border-zinc-200 bg-zinc-50 px-16 dark:border-white/5 dark:bg-[#161616] lg:flex">
        <div
          className="absolute inset-0 opacity-50 dark:opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(circle, #d4d4d8 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-50 via-transparent to-zinc-50 dark:from-[#161616] dark:to-[#161616]" />

        <div className="relative max-w-[420px]">
          <div className="mb-5 select-none font-serif text-[64px] leading-none text-zinc-300 dark:text-zinc-700">
            &ldquo;
          </div>
          <p className="mb-8 text-[18px] font-light leading-relaxed text-zinc-700 dark:text-zinc-300">
            {testimonial.quote}
          </p>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 select-none items-center justify-center rounded-full border border-zinc-300 bg-zinc-200 text-[11px] font-semibold text-zinc-600 dark:border-white/10 dark:bg-zinc-700 dark:text-zinc-300">
              {testimonial.initials}
            </div>
            <span className="text-[13px] text-zinc-500 dark:text-zinc-400">
              {testimonial.handle}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
