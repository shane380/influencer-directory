import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { CREATOR_TERMS_CURRENT, CREATOR_TERMS_KEY } from "@/lib/terms/versions";
import { recordTermsAcceptance, requestClientInfo } from "@/lib/terms/record-acceptance";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Records an affiliate clearing the terms gate on their dashboard. The creator is
// resolved from the session, never from the request body -- the body only says
// which document is being accepted, and that has to be the current one.
export async function POST(request: NextRequest) {
  const supabaseAuth = await createServerClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: creator } = await supabase
    .from("creators")
    .select("id, email")
    .eq("user_id", user.id)
    .single();

  if (!creator) {
    return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  }

  const body = await request.json();
  const { documentKey, documentVersion } = body;

  if (documentKey !== CREATOR_TERMS_KEY) {
    return NextResponse.json({ error: "Unknown document" }, { status: 400 });
  }

  // Accepting anything other than what is currently published would leave the
  // creator gated anyway, and would put a misleading row in the ledger.
  if (documentVersion !== CREATOR_TERMS_CURRENT) {
    return NextResponse.json(
      { error: "That version of the terms is not the current one" },
      { status: 400 }
    );
  }

  const { ip, userAgent } = requestClientInfo(request);

  const error = await recordTermsAcceptance(supabase, {
    creatorId: creator.id,
    userId: user.id,
    email: creator.email,
    version: CREATOR_TERMS_CURRENT,
    documentKey: CREATOR_TERMS_KEY,
    source: "portal_gate",
    ip,
    userAgent,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ accepted: true, version: CREATOR_TERMS_CURRENT });
}
