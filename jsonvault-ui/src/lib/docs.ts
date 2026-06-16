import fs from "fs/promises";
import path from "path";

export interface DocPage {
  slug: string;
  title: string;
}

export const DOCS_DIR = path.join(process.cwd(), "src/content/docs");

export const docsNavigation: DocPage[] = [
  { slug: "core-principles", title: "1. Core Principles" },
  { slug: "authentication", title: "2. Authentication" },
  { slug: "realtime", title: "3. Real-Time Subscriptions" },
  { slug: "documents", title: "4. Documents (CRUD)" },
  { slug: "schemas-and-indexes", title: "5. Schemas & Indexes" },
  { slug: "full-text-search", title: "6. Full-Text Search" },
  { slug: "transactions", title: "7. Atomic Transactions" },
  { slug: "webhooks", title: "8. Webhooks" },
  { slug: "discovery-endpoints", title: "9. Discovery" },
  { slug: "error-handling", title: "10. Error Handling" },
];

export async function getDocContent(slug: string): Promise<string | null> {
  try {
    const filePath = path.join(DOCS_DIR, `${slug}.mdx`);
    const content = await fs.readFile(filePath, "utf-8");
    return content;
  } catch (error) {
    return null;
  }
}
