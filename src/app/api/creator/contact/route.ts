import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function PATCH(request: NextRequest) {
  const supabaseAuth = await createServerClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Verify the user is a creator
  const { data: creator } = await supabase
    .from("creators")
    .select("id, creator_name, invite_id")
    .eq("user_id", user.id)
    .single();

  if (!creator) {
    return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  }

  const body = await request.json();
  const { influencer_id, email, phone, mailing_address } = body;

  if (!influencer_id) {
    return NextResponse.json(
      { error: "influencer_id is required" },
      { status: 400 }
    );
  }

  // Verify this influencer is linked to the creator's invite
  const { data: invite } = await supabase
    .from("creator_invites")
    .select("influencer_id")
    .eq("id", creator.invite_id)
    .single();

  if (invite?.influencer_id !== influencer_id) {
    return NextResponse.json(
      { error: "Not authorized to update this profile" },
      { status: 403 }
    );
  }

  // Get current values to build a change note
  const { data: current } = await supabase
    .from("influencers")
    .select("email, phone, mailing_address, notes")
    .eq("id", influencer_id)
    .single();

  const changes: string[] = [];
  if ((email || null) !== (current?.email || null)) changes.push("email");
  if ((phone || null) !== (current?.phone || null)) changes.push("phone");
  if ((mailing_address || null) !== (current?.mailing_address || null))
    changes.push("mailing address");

  const updateData: Record<string, unknown> = {
    email: email || null,
    phone: phone || null,
    mailing_address: mailing_address || null,
  };

  // Append a note if anything changed
  if (changes.length > 0) {
    const date = new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const changeNote = `[${date}] ${changes.join(", ")} updated by ${creator.creator_name} (creator)`;
    const existingNotes = current?.notes || "";
    updateData.notes = existingNotes
      ? `${existingNotes}\n${changeNote}`
      : changeNote;
  }

  const { data, error } = await (supabase.from("influencers") as any)
    .update(updateData)
    .eq("id", influencer_id)
    .select()
    .single();

  if (error) {
    console.error("Contact update failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ influencer: data });
}
