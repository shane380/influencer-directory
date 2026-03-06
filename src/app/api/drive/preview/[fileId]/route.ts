import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

function getCredentials(): { email: string; key: string } {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (b64) {
    const json = JSON.parse(Buffer.from(b64, "base64").toString("utf-8"));
    return { email: json.client_email, key: json.private_key };
  }
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "";
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "";
  const key = raw.replace(/\\n/g, "\n").replace(/^["']|["']$/g, "").trim();
  return { email, key };
}

function getDrive() {
  const { email, key } = getCredentials();
  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
  return google.drive({ version: "v3", auth });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const { fileId } = await params;

  if (!fileId) {
    return NextResponse.json({ error: "fileId required" }, { status: 400 });
  }

  try {
    const drive = getDrive();

    // Get file metadata for mimeType and size
    const meta = await drive.files.get({
      fileId,
      supportsAllDrives: true,
      fields: "mimeType,size,name",
    });

    const mimeType = meta.data.mimeType || "application/octet-stream";
    const fileSize = parseInt(meta.data.size || "0", 10);
    const rangeHeader = request.headers.get("range");

    // Handle range requests for video seeking
    if (rangeHeader && fileSize > 0) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (match) {
        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
        const chunkSize = end - start + 1;

        const res = await drive.files.get(
          { fileId, supportsAllDrives: true, alt: "media" },
          {
            responseType: "stream",
            headers: { Range: `bytes=${start}-${end}` },
          }
        );

        const chunks: Uint8Array[] = [];
        for await (const chunk of res.data as AsyncIterable<Uint8Array>) {
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);

        return new NextResponse(buffer, {
          status: 206,
          headers: {
            "Content-Type": mimeType,
            "Content-Range": `bytes ${start}-${end}/${fileSize}`,
            "Content-Length": String(chunkSize),
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=3600",
          },
        });
      }
    }

    // Full file download
    const res = await drive.files.get(
      { fileId, supportsAllDrives: true, alt: "media" },
      { responseType: "stream" }
    );

    const chunks: Uint8Array[] = [];
    for await (const chunk of res.data as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    const headers: Record<string, string> = {
      "Content-Type": mimeType,
      "Content-Length": String(buffer.length),
      "Cache-Control": "public, max-age=3600",
    };

    if (fileSize > 0) {
      headers["Accept-Ranges"] = "bytes";
    }

    return new NextResponse(buffer, { status: 200, headers });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch file";
    console.error("Drive preview error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
