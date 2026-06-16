import type { MDXComponents } from "mdx/types";
import { CodeBlock } from "./CodeBlock";
import { AlertCircle, Lightbulb, Info, AlertTriangle } from "lucide-react";
import React from "react";

function getAlertConfig(text: string) {
  if (text.includes("[!WARNING]")) return { type: "warning", title: "Warning", icon: AlertTriangle, bg: "bg-orange-50 dark:bg-orange-500/10", border: "border-orange-200 dark:border-orange-500/20", text: "text-orange-800 dark:text-orange-300", iconColor: "text-orange-500" };
  if (text.includes("[!TIP]")) return { type: "tip", title: "Tip", icon: Lightbulb, bg: "bg-emerald-50 dark:bg-emerald-500/10", border: "border-emerald-200 dark:border-emerald-500/20", text: "text-emerald-800 dark:text-emerald-300", iconColor: "text-emerald-500" };
  if (text.includes("[!NOTE]")) return { type: "note", title: "Note", icon: Info, bg: "bg-blue-50 dark:bg-blue-500/10", border: "border-blue-200 dark:border-blue-500/20", text: "text-blue-800 dark:text-blue-300", iconColor: "text-blue-500" };
  if (text.includes("[!IMPORTANT]")) return { type: "important", title: "Important", icon: AlertCircle, bg: "bg-purple-50 dark:bg-purple-500/10", border: "border-purple-200 dark:border-purple-500/20", text: "text-purple-800 dark:text-purple-300", iconColor: "text-purple-500" };
  return null;
}

function extractText(node: any): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (node && node.props && node.props.children) return extractText(node.props.children);
  return "";
}

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    h1: ({ children }) => (
      <h1 className="mb-8 text-[36px] font-bold tracking-tight text-zinc-950 dark:text-zinc-50 leading-tight">
        {children}
      </h1>
    ),
    h2: ({ children, id }) => (
      <h2 id={id} className="mb-6 mt-16 text-[24px] font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 flex items-center group">
        {children}
        <a href={`#${id}`} className="ml-2 opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-blue-500 transition-opacity">#</a>
      </h2>
    ),
    h3: ({ children, id }) => (
      <h3 id={id} className="mb-4 mt-8 text-[18px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
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
      <ul className="mb-6 list-disc space-y-2 pl-5 text-[15px] leading-7 text-zinc-600 marker:text-zinc-400 dark:text-zinc-400">
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className="mb-6 list-decimal space-y-2 pl-5 text-[15px] leading-7 text-zinc-600 marker:text-zinc-400 dark:text-zinc-400">
        {children}
      </ol>
    ),
    li: ({ children }) => <li className="leading-7 pl-1">{children}</li>,
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
      const text = extractText(children);
      const config = getAlertConfig(text);
      
      if (config) {
        const processNode = (node: any): any => {
          if (typeof node === "string") {
            return node.replace(/\[!(WARNING|TIP|NOTE|IMPORTANT)\]/, "").trim();
          }
          if (Array.isArray(node)) {
            return node.map(processNode);
          }
          if (React.isValidElement(node)) {
            return React.cloneElement(node as React.ReactElement, {
              ...(node.props as any),
              children: processNode((node.props as any).children),
            } as any);
          }
          return node;
        };

        const cleanedChildren = processNode(children);
        const Icon = config.icon;

        return (
          <div className={`my-8 flex gap-3 rounded-xl border p-4 ${config.bg} ${config.border}`}>
            <div className={`mt-0.5 shrink-0 ${config.iconColor}`}>
              <Icon size={18} />
            </div>
            <div className={`flex-1 text-[14.5px] leading-relaxed ${config.text}`}>
              <div className="font-semibold mb-1">{config.title}</div>
              <div className="[&>p]:mb-0">{cleanedChildren}</div>
            </div>
          </div>
        );
      }

      return (
        <blockquote className="my-6 border-l-2 border-zinc-200 pl-4 text-[15px] italic text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
          {children}
        </blockquote>
      );
    },
    pre: ({ children }: any) => {
      if (children?.type === "code") {
        const code = children.props.children;
        const className = children.props.className || "";
        const language = className.replace(/language-/, "") || "text";
        return <CodeBlock code={code} language={language} />;
      }
      return <pre className="mb-6 mt-6 overflow-x-auto rounded-lg">{children}</pre>;
    },
    code: ({ children, className }) => {
      return (
        <code className="rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[13px] text-zinc-900 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200">
          {children}
        </code>
      );
    },
    hr: () => <hr className="my-10 border-zinc-200 dark:border-white/10" />,
    ...components,
  };
}
