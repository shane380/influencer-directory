import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";
import { campaignAssignedEmail } from "@/lib/email-templates";
import { isEmailTriggerEnabled } from "@/lib/app-settings";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// GET: List campaigns (admin) or creator's assignments
export async function GET(request: NextRequest) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const creatorId = request.nextUrl.searchParams.get("creator_id");

  if (creatorId) {
    // Creator view: get assignments with campaign data
    const { data, error } = await supabase
      .from("campaign_assignments")
      .select("*, campaign:creator_campaigns(*)")
      .eq("creator_id", creatorId)
      .order("sent_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ assignments: data || [] });
  }

  // Admin view: all campaigns with assignment counts
  const { data: campaigns, error } = await supabase
    .from("creator_campaigns")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Get assignment counts per campaign
  const campaignIds = (campaigns || []).map((c: { id: string }) => c.id);
  let assignmentCounts: Record<string, { total: number; confirmed: number; content_submitted: number; complete: number }> = {};

  if (campaignIds.length > 0) {
    const { data: assignments } = await supabase
      .from("campaign_assignments")
      .select("campaign_id, status")
      .in("campaign_id", campaignIds);

    for (const a of assignments || []) {
      if (!assignmentCounts[a.campaign_id]) {
        assignmentCounts[a.campaign_id] = { total: 0, confirmed: 0, content_submitted: 0, complete: 0 };
      }
      assignmentCounts[a.campaign_id].total++;
      if (a.status === "confirmed") assignmentCounts[a.campaign_id].confirmed++;
      if (a.status === "content_submitted") assignmentCounts[a.campaign_id].content_submitted++;
      if (a.status === "complete") assignmentCounts[a.campaign_id].complete++;
    }
  }

  const enriched = (campaigns || []).map((c: { id: string }) => ({
    ...c,
    counts: assignmentCounts[c.id] || { total: 0, confirmed: 0, content_submitted: 0, complete: 0 },
  }));

  return NextResponse.json({ campaigns: enriched });
}

// POST: Create a new campaign (admin)
export async function POST(request: NextRequest) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const body = await request.json();

  const {
    title,
    description,
    brief_url,
    brief_images,
    due_date,
    available_products,
    max_selects,
    campaign_type,
    status,
    created_by,
    assignments, // array of { influencer_id, creator_id }
  } = body;

  if (!title) {
    return NextResponse.json({ error: "Title required" }, { status: 400 });
  }

  const { data: campaign, error } = await supabase
    .from("creator_campaigns")
    .insert({
      title,
      description: description || null,
      brief_url: brief_url || null,
      brief_images: brief_images || [],
      due_date: due_date || null,
      available_products: available_products || [],
      max_selects: max_selects || 2,
      campaign_type: campaign_type || "mass",
      status: status || "draft",
      created_by: created_by || null,
    })
    .select()
    .single();

  if (error) {
    console.error("Campaign create error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Create assignments if publishing
  if (status === "active" && assignments?.length > 0) {
    const rows = assignments.map((a: { influencer_id: string; creator_id: string }) => ({
      campaign_id: campaign.id,
      influencer_id: a.influencer_id || null,
      creator_id: a.creator_id || null,
      status: "sent",
    }));

    const { error: assignErr } = await supabase
      .from("campaign_assignments")
      .insert(rows);

    if (assignErr) {
      console.error("Assignment create error:", assignErr);
    } else {
      console.log(`Campaign "${title}" published with ${rows.length} assignments`);

      // Fire-and-forget: send campaign assigned emails to creators
      const creatorIds = rows
        .map((r: { creator_id: string | null }) => r.creator_id)
        .filter(Boolean);
      if (creatorIds.length > 0) {
        (async () => {
          try {
            const enabled = await isEmailTriggerEnabled("campaign_assigned");
            if (!enabled) return;
            const { data: creators } = await supabase
              .from("creators")
              .select("id, creator_name, email, notification_preferences")
              .in("id", creatorIds);
            for (const creator of creators || []) {
              if (!creator.email) continue;
              const prefs = creator.notification_preferences as Record<string, boolean> | null;
              if (prefs && prefs.email_campaigns === false) continue;
              const firstName = (creator.creator_name || "").split(" ")[0] || "there";
              const { subject, html } = campaignAssignedEmail({
                firstName,
                campaignName: title,
                description: description || undefined,
              });
              sendEmail({ to: creator.email, subject, html }).catch((err) =>
                console.error(`Failed to email creator ${creator.id}:`, err)
              );
            }
          } catch (err) {
            console.error("Failed to send campaign emails:", err);
          }
        })();
      }
    }
  }

  return NextResponse.json({ campaign });
}

// PATCH: Update campaign (admin)
export async function PATCH(request: NextRequest) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const body = await request.json();
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  // If publishing, also create assignments
  if (updates.status === "active" && updates.assignments?.length > 0) {
    const rows = updates.assignments.map((a: { influencer_id: string; creator_id: string }) => ({
      campaign_id: id,
      influencer_id: a.influencer_id || null,
      creator_id: a.creator_id || null,
      status: "sent",
    }));

    const { error: patchAssignErr } = await supabase.from("campaign_assignments").insert(rows);

    if (!patchAssignErr) {
      // Fire-and-forget: send campaign assigned emails to creators
      const creatorIds = rows
        .map((r: { creator_id: string | null }) => r.creator_id)
        .filter(Boolean);
      if (creatorIds.length > 0) {
        (async () => {
          try {
            const enabled = await isEmailTriggerEnabled("campaign_assigned");
            if (!enabled) return;
            const { data: creators } = await supabase
              .from("creators")
              .select("id, creator_name, email, notification_preferences")
              .in("id", creatorIds);
            for (const creator of creators || []) {
              if (!creator.email) continue;
              const prefs = creator.notification_preferences as Record<string, boolean> | null;
              if (prefs && prefs.email_campaigns === false) continue;
              const firstName = (creator.creator_name || "").split(" ")[0] || "there";
              const { subject, html } = campaignAssignedEmail({
                firstName,
                campaignName: updates.title || "a new campaign",
                description: updates.description || undefined,
              });
              sendEmail({ to: creator.email, subject, html }).catch((err) =>
                console.error(`Failed to email creator ${creator.id}:`, err)
              );
            }
          } catch (err) {
            console.error("Failed to send campaign emails:", err);
          }
        })();
      }
    }

    delete updates.assignments;
  } else {
    delete updates.assignments;
  }

  const { data, error } = await supabase
    .from("creator_campaigns")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaign: data });
}
