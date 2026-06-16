import type { MDXComponents } from "mdx/types";

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    h1: ({ children }) => (
      <h1 className="mb-8 text-[32px] font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2 className="mb-6 mt-12 text-[24px] font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="mb-4 mt-8 text-[18px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        {children}
      </h3>
    ),
    h4: ({ children }) => (
      <h4 className="mb-3 mt-6 text-[15px] font-medium tracking-tight text-zinc-900 dark:text-zinc-100">
        {children}
      </h4>
    ),
    p: ({ children }) => (
      <p className="mb-6 text-[15px] leading-7 text-zinc-600 dark:text-zinc-400">
        {children}
      </p>
    ),
    ul: ({ children }) => (
      <ul className="mb-6 list-disc space-y-2 pl-5 text-[15px] text-zinc-600 marker:text-zinc-400 dark:text-zinc-400">
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className="mb-6 list-decimal space-y-2 pl-5 text-[15px] text-zinc-600 marker:text-zinc-400 dark:text-zinc-400">
        {children}
      </ol>
    ),
    li: ({ children }) => <li className="leading-7">{children}</li>,
    strong: ({ children }) => (
      <strong className="font-semibold text-zinc-900 dark:text-zinc-100">
        {children}
      </strong>
    ),
    a: ({ href, children }) => (
      <a
        href={href}
        className="font-medium text-blue-600 underline-offset-4 hover:underline dark:text-blue-500"
      >
        {children}
      </a>
    ),
    blockquote: ({ children }) => {
      return (
        <blockquote className="my-6 border-l-2 border-zinc-200 pl-4 text-[15px] text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
          {children}
        </blockquote>
      );
    },
    code: ({ children, className }) => {
      if (className) {
        return (
          <code
            className={`${className} custom-scrollbar my-6 block overflow-x-auto rounded-lg border border-zinc-200 bg-[#fbfbfb] p-4 text-[13px] font-mono text-zinc-800 dark:border-white/5 dark:bg-[#111111] dark:text-zinc-300`}
          >
            {children}
          </code>
        );
      }
      return (
        <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[13px] text-zinc-900 dark:bg-white/10 dark:text-zinc-200">
          {children}
        </code>
      );
    },
    pre: ({ children }) => (
      <pre className="mb-6 mt-6 overflow-x-auto rounded-lg">
        {children}
      </pre>
    ),
    hr: () => <hr className="my-10 border-zinc-200 dark:border-white/5" />,
    ...components,
  };
}
