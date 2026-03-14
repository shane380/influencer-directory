import { NextRequest, NextResponse } from "next/server";
import mux from "@/lib/mux";

export const maxDuration = 60;

// POST: Create a Mux asset from an R2 URL
export async function POST(request: NextRequest) {
  const { url } = await request.json();

  if (!url) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  try {
    const asset = await mux.video.assets.create({
      inputs: [{ url }],
      playback_policies: ["public"],
    });

    const playbackId = asset.playback_ids?.[0]?.id || null;

    return NextResponse.json({
      assetId: asset.id,
      playbackId,
      status: asset.status,
    });
  } catch (err: any) {
    console.error("Mux asset creation failed:", err);
    return NextResponse.json(
      { error: err.message || "Failed to create Mux asset" },
      { status: 500 }
    );
  }
}
