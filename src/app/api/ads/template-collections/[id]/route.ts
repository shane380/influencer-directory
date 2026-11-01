import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/admin-auth";
import { getAdsUser } from "@/lib/ads-guard";

/** Rename a folder. */
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

  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Folder name is required" }, { status: 400 });

  const supabase = getAdminClient();
  const { data, error } = await (supabase.from("ad_template_collections") as any)
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, name, parent_id")
    .single();
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "A folder with that name already exists here" },
        { status: 409 }
      );
    }
    console.error("[ads/template-collections] rename failed:", error.message);
    return NextResponse.json({ error: "Could not rename the folder" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Folder not found" }, { status: 404 });

  return NextResponse.json({
    collection: { id: data.id, name: data.name, parentId: data.parent_id ?? null },
  });
}

/** Delete a folder; its subfolders and templates cascade via FK. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAdsUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const supabase = getAdminClient();
  const { error } = await (supabase.from("ad_template_collections") as any)
    .delete()
    .eq("id", id);
  if (error) {
    console.error("[ads/template-collections] delete failed:", error.message);
    return NextResponse.json({ error: "Could not delete the folder" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
