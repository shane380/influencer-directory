import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type GiftStatus = "green" | "yellow" | "red";

// RAG status from weeks since last gift. Target cadence: a gift every 30-45 days.
//   green  < 4 weeks (on track)
//   yellow 4-9 weeks (due soon)
//   red    >= 10 weeks, or never gifted (overdue)
function statusForWeeks(weeks: number | null): GiftStatus {
  if (weeks === null) return "red";
  if (weeks < 4) return "green";
  if (weeks < 10) return "yellow";
  return "red";
}

function firstProductName(lineItems: any): string | null {
  if (!Array.isArray(lineItems) || lineItems.length === 0) return null;
  const first = lineItems[0];
  const name = first?.product_name || first?.title || null;
  if (!name) return null;
  const extra = lineItems.length - 1;
  return extra > 0 ? `${name} +${extra} more` : name;
}

// The PR list: influencers graduated to partnership_type 'pr_list', each with the
// date/product of their most recent order (any order) and a RAG cadence status.
export async function GET() {
  const auth = await createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const db = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: influencers } = await (db.from("influencers") as any)
    .select("id, name, instagram_handle, profile_photo_url")
    .eq("partnership_type", "pr_list");

  const list = (influencers as any[]) || [];
  if (list.length === 0) {
    return NextResponse.json({ partners: [] });
  }

  const ids = list.map((i) => i.id);

  // Most recent gift per influencer (orders tagged "influencer"). Pull ordered
  // desc and keep the first seen.
  const { data: orders } = await (db.from("gift_orders") as any)
    .select("influencer_id, order_date, line_items")
    .in("influencer_id", ids)
    .order("order_date", { ascending: false });

  const lastOrderByInfluencer = new Map<string, { order_date: string; line_items: any }>();
  for (const o of (orders as any[]) || []) {
    if (!lastOrderByInfluencer.has(o.influencer_id)) {
      lastOrderByInfluencer.set(o.influencer_id, {
        order_date: o.order_date,
        line_items: o.line_items,
      });
    }
  }

  const now = Date.now();
  const partners = list.map((inf) => {
    const last = lastOrderByInfluencer.get(inf.id) || null;
    let weeksSince: number | null = null;
    if (last?.order_date) {
      const ms = now - new Date(last.order_date).getTime();
      weeksSince = Math.max(0, Math.floor(ms / (7 * 24 * 60 * 60 * 1000)));
    }
    return {
      influencer_id: inf.id,
      name: inf.name as string,
      handle: inf.instagram_handle as string | null,
      photo: inf.profile_photo_url as string | null,
      last_gift_date: last?.order_date || null,
      last_product: last ? firstProductName(last.line_items) : null,
      weeks_since: weeksSince,
      status: statusForWeeks(weeksSince),
    };
  });

  // Most overdue first; never-gifted (null weeks) sort to the very top.
  partners.sort((a, b) => {
    const aw = a.weeks_since === null ? Infinity : a.weeks_since;
    const bw = b.weeks_since === null ? Infinity : b.weeks_since;
    return bw - aw;
  });

  return NextResponse.json({ partners });
}
