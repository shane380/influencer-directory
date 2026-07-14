import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2Client, R2_BUCKET, R2_PUBLIC_URL } from "@/lib/r2";

// GET: Redirect to a presigned R2 URL that forces download (attachment disposition).
// Accepts ?url=<public R2 url>&name=<filename>. Only URLs under R2_PUBLIC_URL are allowed.
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  const name = request.nextUrl.searchParams.get("name") || "";

  if (!url || !url.startsWith(`${R2_PUBLIC_URL}/`)) {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  const key = decodeURIComponent(
    url.slice(R2_PUBLIC_URL.length + 1).split("?")[0]
  );
  const filename =
    (name || key.split("/").pop() || "download").replace(/[^\w.\- ()]/g, "_");

  try {
    const command = new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${filename}"`,
    });
    const signedUrl = await getSignedUrl(r2Client, command, { expiresIn: 300 });
    return NextResponse.redirect(signedUrl);
  } catch (err: any) {
    console.error("Download redirect failed:", err);
    return NextResponse.json(
      { error: err.message || "Failed to generate download URL" },
      { status: 500 }
    );
  }
}
