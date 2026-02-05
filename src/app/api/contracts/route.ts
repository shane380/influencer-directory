import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const influencerId = searchParams.get("influencer_id");

  if (!influencerId) {
    return NextResponse.json({ error: "influencer_id required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("influencer_contracts")
    .select("*")
    .eq("influencer_id", influencerId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ contracts: data });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json();

  const { data: { user } } = await supabase.auth.getUser();

  const { influencer_id, contract_type, variables, status } = body;

  if (!influencer_id || !contract_type || !variables) {
    return NextResponse.json(
      { error: "influencer_id, contract_type, and variables required" },
      { status: 400 }
    );
  }

  const { data, error } = await (supabase
    .from("influencer_contracts") as any)
    .insert({
      influencer_id,
      contract_type,
      variables,
      status: status || "draft",
      created_by: user?.id || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ contract: data });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json();

  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const { data, error } = await (supabase
    .from("influencer_contracts") as any)
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ contract: data });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("influencer_contracts")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
