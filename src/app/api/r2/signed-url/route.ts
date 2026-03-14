import { NextRequest, NextResponse } from "next/server";
import { getPresignedDownloadUrl } from "@/lib/r2";

// POST: Generate a presigned GET URL for private file access
export async function POST(request: NextRequest) {
  const { key, expiresIn } = await request.json();

  if (!key) {
    return NextResponse.json({ error: "key required" }, { status: 400 });
  }

  try {
    const signedUrl = await getPresignedDownloadUrl(key, expiresIn || 60);
    return NextResponse.json({ signedUrl });
  } catch (err: any) {
    console.error("Signed URL generation failed:", err);
    return NextResponse.json(
      { error: err.message || "Failed to generate signed URL" },
      { status: 500 }
    );
  }
}
