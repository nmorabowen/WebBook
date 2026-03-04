import { requireSession } from "@/lib/auth";
import { getNote } from "@/lib/content/service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  await requireSession();
  const { slug } = await params;
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
