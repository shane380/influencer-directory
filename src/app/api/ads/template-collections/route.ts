import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/admin-auth";
import { getAdsUser } from "@/lib/ads-guard";

/** Create a template folder, optionally inside another folder (parentId). */
export async function POST(request: Request) {
  const user = await getAdsUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const parentId = typeof body?.parentId === "string" && body.parentId ? body.parentId : null;
  if (!name) return NextResponse.json({ error: "Folder name is required" }, { status: 400 });

  const supabase = getAdminClient();
  const { data, error } = await (supabase.from("ad_template_collections") as any)
    .insert({ name, parent_id: parentId, created_by: user.userId })
    .select("id, name, parent_id")
    .single();
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "A folder with that name already exists here" },
        { status: 409 }
      );
    }
    if (error.code === "23503") {
      return NextResponse.json({ error: "Parent folder not found" }, { status: 404 });
    }
    console.error("[ads/template-collections] create failed:", error.message);
    return NextResponse.json({ error: "Could not create the folder" }, { status: 500 });
  }

  return NextResponse.json({
    collection: { id: data.id, name: data.name, parentId: data.parent_id ?? null },
  });
}
