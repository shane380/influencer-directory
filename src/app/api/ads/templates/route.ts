import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/admin-auth";
import { getAdsUser } from "@/lib/ads-guard";
import type { AdTemplate, AdTemplateCollection, TemplateFieldType } from "@/types/meta-ads";

const FIELD_TYPES: TemplateFieldType[] = ["primaryText", "headline", "description", "link"];

function rowToTemplate(row: any): AdTemplate {
  return {
    id: row.id,
    collectionId: row.collection_id,
    fieldType: row.field_type,
    content: row.content,
  };
}

/** The whole shared library in one call — folders (flat, with parentId) and their templates. */
export async function GET() {
  const user = await getAdsUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getAdminClient();
  const [colsRes, tplsRes] = await Promise.all([
    (supabase.from("ad_template_collections") as any)
      .select("id, name, parent_id")
      .order("name", { ascending: true }),
    (supabase.from("ad_templates") as any)
      .select("id, collection_id, field_type, content")
      .order("created_at", { ascending: true }),
  ]);
  if (colsRes.error || tplsRes.error) {
    console.error(
      "[ads/templates] load failed:",
      colsRes.error?.message || tplsRes.error?.message
    );
    return NextResponse.json({ error: "Could not load templates" }, { status: 500 });
  }

  const collections: AdTemplateCollection[] = (colsRes.data || []).map((c: any) => ({
    id: c.id,
    name: c.name,
    parentId: c.parent_id ?? null,
    templates: [],
  }));
  const byId = new Map(collections.map((c) => [c.id, c]));
  for (const row of tplsRes.data || []) {
    byId.get(row.collection_id)?.templates.push(rowToTemplate(row));
  }

  return NextResponse.json({ collections });
}

/**
 * Save a piece of copy into a folder. Templates have no name: saving content
 * that already exists in that folder (same field type) just returns the
 * existing row. Creates the folder inline when collectionName (+ optional
 * parentId) is given instead of collectionId.
 */
export async function POST(request: Request) {
  const user = await getAdsUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const fieldType = body?.fieldType as TemplateFieldType;
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  const collectionName =
    typeof body?.collectionName === "string" ? body.collectionName.trim() : "";
  const parentId = typeof body?.parentId === "string" && body.parentId ? body.parentId : null;
  let collectionId = typeof body?.collectionId === "string" ? body.collectionId : "";

  if (!FIELD_TYPES.includes(fieldType)) {
    return NextResponse.json({ error: "Invalid field type" }, { status: 400 });
  }
  if (!content) return NextResponse.json({ error: "Content is empty" }, { status: 400 });
  if (!collectionId && !collectionName) {
    return NextResponse.json({ error: "Folder is required" }, { status: 400 });
  }

  const supabase = getAdminClient();
  let createdCollection: { id: string; name: string; parentId: string | null } | null = null;

  if (!collectionId) {
    // Reuse a sibling folder with the same name (case-insensitive), otherwise
    // create it under the requested parent.
    let lookup = (supabase.from("ad_template_collections") as any).select("id, name, parent_id");
    lookup = parentId ? lookup.eq("parent_id", parentId) : lookup.is("parent_id", null);
    const { data: siblingsCols, error: colErr } = await lookup;
    if (colErr) {
      console.error("[ads/templates] folder lookup failed:", colErr.message);
      return NextResponse.json({ error: "Could not save the template" }, { status: 500 });
    }
    const match = (siblingsCols || []).find(
      (c: any) => c.name.toLowerCase() === collectionName.toLowerCase()
    );
    if (match) {
      collectionId = match.id;
    } else {
      const { data: created, error: createErr } = await (
        supabase.from("ad_template_collections") as any
      )
        .insert({ name: collectionName, parent_id: parentId, created_by: user.userId })
        .select("id, name, parent_id")
        .single();
      if (createErr || !created) {
        console.error("[ads/templates] folder create failed:", createErr?.message);
        return NextResponse.json({ error: "Could not create the folder" }, { status: 500 });
      }
      createdCollection = { id: created.id, name: created.name, parentId: created.parent_id ?? null };
      collectionId = created.id;
    }
  }

  const { data: siblings, error: sibErr } = await (supabase.from("ad_templates") as any)
    .select("id, collection_id, field_type, content")
    .eq("collection_id", collectionId)
    .eq("field_type", fieldType);
  if (sibErr) {
    console.error("[ads/templates] lookup failed:", sibErr.message);
    return NextResponse.json({ error: "Could not save the template" }, { status: 500 });
  }
  const existing = (siblings || []).find((t: any) => (t.content || "").trim() === content);
  if (existing) {
    return NextResponse.json({
      collection: createdCollection,
      template: rowToTemplate(existing),
      duplicate: true,
    });
  }

  const { data: inserted, error } = await (supabase.from("ad_templates") as any)
    .insert({
      collection_id: collectionId,
      field_type: fieldType,
      content,
      created_by: user.userId,
    })
    .select("id, collection_id, field_type, content")
    .single();
  if (error || !inserted) {
    console.error("[ads/templates] insert failed:", error?.message);
    return NextResponse.json({ error: "Could not save the template" }, { status: 500 });
  }

  return NextResponse.json({
    collection: createdCollection,
    template: rowToTemplate(inserted),
    duplicate: false,
  });
}
