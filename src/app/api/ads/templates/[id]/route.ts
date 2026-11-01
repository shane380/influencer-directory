import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/admin-auth";
import { getAdsUser } from "@/lib/ads-guard";
import type { AdTemplate } from "@/types/meta-ads";

function rowToTemplate(row: any): AdTemplate {
  return {
    id: row.id,
    collectionId: row.collection_id,
    fieldType: row.field_type,
    content: row.content,
  };
}

/** Edit a template's content or move it to another folder. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAdsUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: Record<string, string> = {};
  if (body?.content !== undefined) {
    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!content) return NextResponse.json({ error: "Content is empty" }, { status: 400 });
    patch.content = content;
  }
  if (body?.collectionId !== undefined) {
    const collectionId = typeof body.collectionId === "string" ? body.collectionId : "";
    if (!collectionId) return NextResponse.json({ error: "Folder is required" }, { status: 400 });
    patch.collection_id = collectionId;
  }
  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  patch.updated_at = new Date().toISOString();

  const supabase = getAdminClient();
  const { data, error } = await (supabase.from("ad_templates") as any)
    .update(patch)
    .eq("id", id)
    .select("id, collection_id, field_type, content")
    .single();
  if (error) {
    console.error("[ads/templates] patch failed:", error.message);
    return NextResponse.json({ error: "Could not update the template" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  return NextResponse.json({ template: rowToTemplate(data) });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAdsUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const supabase = getAdminClient();
  const { error } = await (supabase.from("ad_templates") as any).delete().eq("id", id);
  if (error) {
    console.error("[ads/templates] delete failed:", error.message);
    return NextResponse.json({ error: "Could not delete the template" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
