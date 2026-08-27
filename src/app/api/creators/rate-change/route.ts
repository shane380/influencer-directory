import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Does the signed-in partner have a commission rate change coming? The terms
// gate asks so it can say so plainly, rather than leaving someone to discover a
// halved rate after accepting a document that only states the program standard.
//
// Deliberately checks BOTH identities. A partner's affiliate earnings may sit on
// a legacy_affiliates row that shares an influencer with their creators row but
// is otherwise unlinked -- their portal account can read 0% commission while the
// code they actually earn on is on a different rate entirely.
export async function GET(_request: NextRequest) {
  const supabaseAuth = await createServerClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const db = createClient(supabaseUrl, supabaseServiceKey);

  const { data: creator } = await db
    .from("creators")
    .select("id, invite_id, commission_rate")
    .eq("user_id", user.id)
    .single();

  if (!creator) {
    return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  }

  // Resolve the person's other affiliate identity, if there is one.
  let legacy: { id: string; commission_rate: number | null } | null = null;
  if ((creator as any).invite_id) {
    const { data: invite } = await db
      .from("creator_invites")
      .select("influencer_id")
      .eq("id", (creator as any).invite_id)
      .single();
    const influencerId = (invite as any)?.influencer_id;
    if (influencerId) {
      const { data: rows } = await db
        .from("legacy_affiliates")
        .select("id, commission_rate")
        .eq("influencer_id", influencerId)
        .eq("status", "active")
        .limit(1);
      legacy = (rows?.[0] as any) ?? null;
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  // Soonest scheduled change across either identity.
  const lookups: { subject: "creator" | "legacy"; column: string; id: string; currentRate: number }[] = [
    { subject: "creator", column: "creator_id", id: (creator as any).id, currentRate: Number((creator as any).commission_rate) || 0 },
  ];
  if (legacy) {
    lookups.push({
      subject: "legacy",
      column: "legacy_affiliate_id",
      id: legacy.id,
      currentRate: Number(legacy.commission_rate) || 0,
    });
  }

  let pending: { effectiveFrom: string; newRate: number; currentRate: number } | null = null;

  for (const l of lookups) {
    const { data } = await db
      .from("affiliate_commission_rates")
      .select("commission_rate, effective_from")
      .eq(l.column, l.id)
      .gt("effective_from", today)
      .order("effective_from", { ascending: true })
      .limit(1);

    const row = data?.[0] as any;
    if (!row) continue;

    const newRate = Number(row.commission_rate);
    // Nothing to announce if the rate isn't actually moving for them.
    if (newRate === l.currentRate) continue;

    if (!pending || row.effective_from < pending.effectiveFrom) {
      pending = { effectiveFrom: row.effective_from, newRate, currentRate: l.currentRate };
    }
  }

  return NextResponse.json({ pending });
}
