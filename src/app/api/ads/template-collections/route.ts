import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/admin-auth";
import { getAdsUser } from "@/lib/ads-guard";

/** Create a template collection. */
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
  if (!name) return NextResponse.json({ error: "Collection name is required" }, { status: 400 });

  const supabase = getAdminClient();
  const { data, error } = await (supabase.from("ad_template_collections") as any)
    .insert({ name, created_by: user.userId })
    .select("id, name")
    .single();
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "A collection with that name already exists" },
        { status: 409 }
      );
    }
    console.error("[ads/template-collections] create failed:", error.message);
    return NextResponse.json({ error: "Could not create the collection" }, { status: 500 });
  }

  return NextResponse.json({ collection: { id: data.id, name: data.name } });
}
