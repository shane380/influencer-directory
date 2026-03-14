import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { deleteFromR2 } from "@/lib/r2";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// DELETE: Remove a content row and its R2 file
export async function DELETE(request: NextRequest) {
  const { content_id } = await request.json();

  if (!content_id) {
    return NextResponse.json({ error: "content_id required" }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Get content row to find R2 key
    const { data: content } = await supabase
      .from("content")
      .select("*")
      .eq("id", content_id)
      .single();

    if (!content) {
      return NextResponse.json({ error: "Content not found" }, { status: 404 });
    }

    const row = content as any;

    // Delete from R2 if we have a key
    if (row.r2_key) {
      await deleteFromR2(row.r2_key);
    }

    // Delete additional files if carousel
    if (row.metadata?.additional_r2_keys) {
      for (const key of row.metadata.additional_r2_keys) {
        try {
          await deleteFromR2(key);
        } catch {}
      }
    }

    // Delete DB row
    const { error } = await supabase
      .from("content")
      .delete()
      .eq("id", content_id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Content delete failed:", err);
    return NextResponse.json(
      { error: err.message || "Delete failed" },
      { status: 500 }
    );
  }
}
