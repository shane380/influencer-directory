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
    name: row.name,
    content: row.content,
  };
}

/** The whole shared library in one call — collections with their templates. */
export async function GET() {
  const user = await getAdsUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getAdminClient();
  const [colsRes, tplsRes] = await Promise.all([
    (supabase.from("ad_template_collections") as any)
      .select("id, name")
      .order("name", { ascending: true }),
    (supabase.from("ad_templates") as any)
      .select("id, collection_id, field_type, name, content")
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
    templates: [],
  }));
  const byId = new Map(collections.map((c) => [c.id, c]));
  for (const row of tplsRes.data || []) {
    byId.get(row.collection_id)?.templates.push(rowToTemplate(row));
  }

  return NextResponse.json({ collections });
}

/**
 * Save a template. Upserts by (collection, field type, name) so re-saving under
 * an existing name overwrites its content. Creates the collection inline when
 * collectionName is given instead of collectionId.
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
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  const collectionName =
    typeof body?.collectionName === "string" ? body.collectionName.trim() : "";
  let collectionId = typeof body?.collectionId === "string" ? body.collectionId : "";

  if (!FIELD_TYPES.includes(fieldType)) {
    return NextResponse.json({ error: "Invalid field type" }, { status: 400 });
  }
  if (!name) return NextResponse.json({ error: "Template name is required" }, { status: 400 });
  if (!content) return NextResponse.json({ error: "Content is empty" }, { status: 400 });
  if (!collectionId && !collectionName) {
    return NextResponse.json({ error: "Collection is required" }, { status: 400 });
  }

  const supabase = getAdminClient();
  let createdCollection: { id: string; name: string } | null = null;

  if (!collectionId) {
    // Reuse an existing collection with the same name (case-insensitive),
    // otherwise create it.
    const { data: existingCols, error: colErr } = await (
      supabase.from("ad_template_collections") as any
    ).select("id, name");
    if (colErr) {
      console.error("[ads/templates] collections lookup failed:", colErr.message);
      return NextResponse.json({ error: "Could not save the template" }, { status: 500 });
    }
    const match = (existingCols || []).find(
      (c: any) => c.name.toLowerCase() === collectionName.toLowerCase()
    );
    if (match) {
      collectionId = match.id;
    } else {
      const { data: created, error: createErr } = await (
        supabase.from("ad_template_collections") as any
      )
        .insert({ name: collectionName, created_by: user.userId })
        .select("id, name")
        .single();
      if (createErr || !created) {
        console.error("[ads/templates] collection create failed:", createErr?.message);
        return NextResponse.json({ error: "Could not create the collection" }, { status: 500 });
      }
      createdCollection = created;
      collectionId = created.id;
    }
  }

  const { data: siblings, error: sibErr } = await (supabase.from("ad_templates") as any)
    .select("id, name")
    .eq("collection_id", collectionId)
    .eq("field_type", fieldType);
  if (sibErr) {
    console.error("[ads/templates] lookup failed:", sibErr.message);
    return NextResponse.json({ error: "Could not save the template" }, { status: 500 });
  }
  const existing = (siblings || []).find(
    (t: any) => t.name.toLowerCase() === name.toLowerCase()
  );

  if (existing) {
    const { data: updated, error } = await (supabase.from("ad_templates") as any)
      .update({ name, content, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .select("id, collection_id, field_type, name, content")
      .single();
    if (error || !updated) {
      console.error("[ads/templates] update failed:", error?.message);
      return NextResponse.json({ error: "Could not save the template" }, { status: 500 });
    }
    return NextResponse.json({
      collection: createdCollection,
      template: rowToTemplate(updated),
      updated: true,
    });
  }

  const { data: inserted, error } = await (supabase.from("ad_templates") as any)
    .insert({
      collection_id: collectionId,
      field_type: fieldType,
      name,
      content,
      created_by: user.userId,
    })
    .select("id, collection_id, field_type, name, content")
    .single();
  if (error || !inserted) {
    console.error("[ads/templates] insert failed:", error?.message);
    return NextResponse.json({ error: "Could not save the template" }, { status: 500 });
  }

  return NextResponse.json({
    collection: createdCollection,
    template: rowToTemplate(inserted),
    updated: false,
  });
}
