import JSZip from "jszip";
import { requireSession } from "@/lib/auth";
import { getBook } from "@/lib/content/service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookSlug: string }> },
) {
  await requireSession();
  const { bookSlug } = await params;
  const book = await getBook(bookSlug);
  const zip = new JSZip();
  const root = zip.folder(book.meta.slug);

  root?.file("book.md", book.raw);
  const chaptersFolder = root?.folder("chapters");

  for (const chapter of book.chapters) {
    chaptersFolder?.file(
      `${String(chapter.meta.order).padStart(3, "0")}-${chapter.meta.slug}.md`,
      chapter.raw,
    );
  }

  const content = await zip.generateAsync({ type: "uint8array" });

  return new Response(Buffer.from(content), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${book.meta.slug}.zip"`,
    },
  });
}
