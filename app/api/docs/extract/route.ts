import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { extractDocumentText, UnsupportedDocumentTypeError } from "@/lib/extract-document-text";

export const runtime = "nodejs";

// POST /api/docs/extract — any authenticated member; reads a PDF or .docx
// upload and returns Markdown-ish text to seed a new Doc's content with,
// before the doc itself is created. Doesn't touch the database.
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  try {
    const content = await extractDocumentText(file);
    return NextResponse.json({ content });
  } catch (error) {
    if (error instanceof UnsupportedDocumentTypeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Failed to extract document text", error);
    return NextResponse.json(
      { error: "Couldn't read that file — it may be corrupted or password-protected." },
      { status: 422 },
    );
  }
}
