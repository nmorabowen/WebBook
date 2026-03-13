import JSZip from "jszip";
import { requireSession } from "@/lib/auth";
import { getBook, isMissingWorkspaceContentError } from "@/lib/content/service";
import { buildWorkspaceAccessScope, canAccessBook } from "@/lib/workspace-access";

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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookSlug: string }> },
) {
  const session = await requireSession();
  const { bookSlug } = await params;
  try {
    const book = await getBook(bookSlug);
    const scope = await buildWorkspaceAccessScope(session);
    if (!canAccessBook(scope, book)) {
      return new Response("Not found", { status: 404 });
    }
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
  } catch (error) {
    if (isMissingWorkspaceContentError(error)) {
      return new Response("Not found", { status: 404 });
    }
    throw error;
  }
}
