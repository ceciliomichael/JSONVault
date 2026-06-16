import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import { useMDXComponents } from "@/components/mdx-components";
import { docsNavigation, getDocContent } from "@/lib/docs";
import { RightSidebar } from "@/components/RightSidebar";

export async function generateStaticParams() {
  return docsNavigation.map((doc) => ({
    slug: doc.slug,
  }));
}

export default async function DocPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const content = await getDocContent(slug);

  if (!content) {
    notFound();
  }

  const components = useMDXComponents({});

  return (
    <div className="flex w-full">
      <div className="min-w-0 flex-1 pb-24 pr-8">
        <MDXRemote source={content} components={components} />
      </div>

      <div className="hidden w-56 shrink-0 xl:block">
        <RightSidebar content={content} />
      </div>
    </div>
  );
}
