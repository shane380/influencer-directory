import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Resolve the signed-in user and their display name (for note authorship).
async function getAuthor() {
  const supabaseAuth = await createServerClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) return null;

  const admin = createClient(supabaseUrl, supabaseServiceKey);
  const { data: profile } = await (admin.from("profiles") as any)
    .select("display_name")
    .eq("id", user.id)
    .single();

  return {
    id: user.id,
    name: profile?.display_name || user.email || "Team member",
  };
}

// GET - pinned summary + dated activity log (newest first) for an influencer.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: influencerId } = await params;
    if (!influencerId) {
      return NextResponse.json({ error: "Influencer ID is required" }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: influencer } = await (supabase.from("influencers") as any)
      .select("notes_summary")
      .eq("id", influencerId)
      .single();

    const { data: activity, error } = await (supabase.from("influencer_notes") as any)
      .select("*")
      .eq("influencer_id", influencerId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Notes fetch error:", error);
      return NextResponse.json({ error: "Failed to fetch notes" }, { status: 500 });
    }

    return NextResponse.json({
      summary: influencer?.notes_summary ?? null,
      activity: activity || [],
    });
  } catch (err) {
    console.error("Notes GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST - append a new note to the activity log.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: influencerId } = await params;
    const author = await getAuthor();
    if (!author) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { body } = await request.json();
    if (!body || !body.trim()) {
      return NextResponse.json({ error: "Note body is required" }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data, error } = await (supabase.from("influencer_notes") as any)
      .insert({
        influencer_id: influencerId,
        author_id: author.id,
        author_name: author.name,
        body: body.trim(),
        type: "note",
      })
      .select()
      .single();

    if (error) {
      console.error("Note insert error:", error);
      return NextResponse.json({ error: "Failed to add note" }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("Notes POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT - update the pinned summary and log a "summary_edit" activity entry.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: influencerId } = await params;
    const author = await getAuthor();
    if (!author) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { summary } = await request.json();
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { error: updateError } = await (supabase.from("influencers") as any)
      .update({ notes_summary: summary ?? null })
      .eq("id", influencerId);

    if (updateError) {
      console.error("Summary update error:", updateError);
      return NextResponse.json({ error: "Failed to update summary" }, { status: 500 });
    }

    await (supabase.from("influencer_notes") as any).insert({
      influencer_id: influencerId,
      author_id: author.id,
      author_name: author.name,
      body: "Edited the pinned summary.",
      type: "summary_edit",
    });

    return NextResponse.json({ summary: summary ?? null });
  } catch (err) {
    console.error("Notes PUT error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
