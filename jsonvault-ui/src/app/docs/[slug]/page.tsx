import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import { useMDXComponents } from "@/components/mdx-components";
import { docsNavigation, getDocContent } from "@/lib/docs";

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
    <div className="pb-24">
      <MDXRemote source={content} components={components} />
    </div>
  );
}
