import type { MetadataRoute } from "next";
import { getPublicContentTree } from "@/lib/content/service";
import { absoluteUrl } from "@/lib/seo";

function flattenChapters(
  chapters: Awaited<ReturnType<typeof getPublicContentTree>>["books"][number]["chapters"],
): Awaited<ReturnType<typeof getPublicContentTree>>["books"][number]["chapters"] {
  return chapters.flatMap((chapter) => [chapter, ...flattenChapters(chapter.children)]);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const tree = await getPublicContentTree();

  return [
    {
      url: absoluteUrl("/").toString(),
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    ...tree.books.flatMap((book) => [
      {
        url: absoluteUrl(`/books/${book.meta.slug}`).toString(),
        lastModified: new Date(book.meta.updatedAt),
        changeFrequency: "weekly" as const,
        priority: 0.9,
      },
      ...flattenChapters(book.chapters).map((chapter) => ({
        url: absoluteUrl(`/books/${book.meta.slug}/${chapter.path.join("/")}`).toString(),
        lastModified: new Date(chapter.meta.updatedAt),
        changeFrequency: "weekly" as const,
        priority: 0.8,
      })),
    ]),
    ...tree.notes.map((note) => ({
      url: absoluteUrl(`/notes/${note.meta.slug}`).toString(),
      lastModified: new Date(note.meta.updatedAt),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
