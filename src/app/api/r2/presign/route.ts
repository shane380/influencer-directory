import { NextRequest, NextResponse } from "next/server";
import { getPresignedUploadUrl, getPresignedDownloadUrl, getPublicUrl } from "@/lib/r2";

// POST: Generate a presigned PUT URL for uploading
export async function POST(request: NextRequest) {
  const { key, contentType } = await request.json();

  if (!key || !contentType) {
    return NextResponse.json(
      { error: "key and contentType required" },
      { status: 400 }
    );
  }

  try {
    const uploadUrl = await getPresignedUploadUrl(key, contentType);
    const publicUrl = getPublicUrl(key);
    return NextResponse.json({ uploadUrl, publicUrl });
  } catch (err: any) {
    console.error("Presign failed:", err);
    return NextResponse.json(
      { error: err.message || "Failed to generate upload URL" },
      { status: 500 }
    );
  }
}
