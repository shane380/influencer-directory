import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { fetchProductsByIds } from "@/lib/shopify-products";

// Admin/manager-only: current Shopify featured image per product, so the
// Selects Page settings can refresh pool thumbnails that were snapshotted
// before the (often draft) product had photos. Images only — no prices.
// NOT under /api/gift/t/ — this route stays behind the auth wall.

export async function GET(request: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: profile } = await (supabase.from("profiles") as any)
    .select("is_admin, is_manager")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin && !profile?.is_manager) {
    return NextResponse.json({ error: "Admin or manager access required" }, { status: 403 });
  }

  const ids = (request.nextUrl.searchParams.get("ids") || "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => /^\d+$/.test(id))
    .slice(0, 100);
  if (ids.length === 0) return NextResponse.json({ images: {} });

  try {
    const products = await fetchProductsByIds(ids);
    const images: Record<string, string | null> = {};
    for (const p of products) images[p.product_id] = p.image;
    return NextResponse.json({ images });
  } catch (err) {
    console.error("[gift] pool image refresh failed:", err);
    return NextResponse.json({ error: "Products unavailable" }, { status: 503 });
  }
}
