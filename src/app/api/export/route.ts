import JSZip from "jszip";
import { requireSession } from "@/lib/auth";
import { getBook, getNote } from "@/lib/content/service";

function addChaptersToZip(
  chapters: Awaited<ReturnType<typeof getBook>>["chapters"],
  chaptersFolder: JSZip,
) {
  for (const chapter of chapters) {
    const stem = `${String(chapter.meta.order).padStart(3, "0")}-${chapter.meta.slug}`;
    chaptersFolder.file(`${stem}.md`, chapter.raw);
    if (chapter.children.length > 0) {
      const nested = chaptersFolder.folder(stem)?.folder("chapters");
      if (nested) {
        addChaptersToZip(chapter.children, nested);
      }
    }
  }
}

export async function GET(request: Request) {
  await requireSession();
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  const slug = url.searchParams.get("slug");

  if (!kind || !slug) {
    return new Response("Missing kind or slug", { status: 400 });
  }

  if (kind === "note") {
    const note = await getNote(slug);
    if (!note) {
      return new Response("Not found", { status: 404 });
    }

    return new Response(note.raw, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${note.meta.slug}.md"`,
      },
    });
  }

  if (kind === "book") {
    const book = await getBook(slug);
    const zip = new JSZip();
    const root = zip.folder(book.meta.slug);

    root?.file("book.md", book.raw);
    const chaptersFolder = root?.folder("chapters");

    if (chaptersFolder) {
      addChaptersToZip(book.chapters, chaptersFolder);
    }

    const content = await zip.generateAsync({ type: "uint8array" });

    return new Response(Buffer.from(content), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${book.meta.slug}.zip"`,
      },
    });
  }

  return new Response("Unsupported export kind", { status: 400 });
}
