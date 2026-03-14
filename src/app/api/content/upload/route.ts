import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// POST: Create a content row after file has been uploaded to R2
export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    influencer_id,
    r2_key,
    r2_url,
    file_name,
    file_size,
    type,
    campaign_id,
    deal_id,
    total_files,
    additional_r2_keys,
  } = body;

  if (!influencer_id || !r2_url) {
    return NextResponse.json(
      { error: "influencer_id and r2_url required" },
      { status: 400 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const metadata: Record<string, unknown> = {};
    if (total_files > 1 && additional_r2_keys?.length) {
      metadata.additional_r2_keys = additional_r2_keys;
      metadata.total_files = total_files;
    }

    const { data, error } = await supabase
      .from("content")
      .insert({
        influencer_id,
        media_url: r2_url,
        r2_key: r2_key || null,
        file_name: file_name || null,
        file_size: file_size || null,
        type: type || "content",
        platform: "r2",
        campaign_id: campaign_id || null,
        deal_id: deal_id || null,
        uploaded_at: new Date().toISOString(),
        metadata,
      } as any)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ content: data });
  } catch (err: any) {
    console.error("Content creation failed:", err);
    return NextResponse.json(
      { error: err.message || "Failed to create content" },
      { status: 500 }
    );
  }
}
