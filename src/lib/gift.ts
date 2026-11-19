import type { CampaignInfluencer, GiftPoolProduct, ProductSelection } from "@/types/database";

// Gift selection link helpers, shared by the coordinator UI and the
// admin send-invite route.

export function generateGiftToken(): string {
  // 32 hex chars ≈ 122 bits of entropy — non-enumerable, unlike the
  // name-derived invite slugs.
  return crypto.randomUUID().replace(/-/g, "");
}

export function giftUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://creators.namaclo.com").trim().replace(/\/$/, "");
  return `${base}/gift/${token}`;
}

// Campaign-level open link — reusable by creators who have no influencer
// record yet; submissions match-or-create records server-side.
export function giftGenericUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://creators.namaclo.com").trim().replace(/\/$/, "");
  return `${base}/gift/g/${token}`;
}

// Preview (/gift/preview/[campaignId]) reads the settings dialog's unsaved
// draft from this localStorage key — same origin as the dashboard.
export function giftPreviewDraftKey(campaignId: string): string {
  return `gift-preview-draft:${campaignId}`;
}

// Event-mode arrival time is stored as 24h "HH:MM"; shown as "6:00 PM".
export function formatGiftEventTime(value: string | null | undefined): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(value || "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const minutes = m[2];
  if (h > 23 || Number(minutes) > 59) return null;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${minutes} ${h < 12 ? "AM" : "PM"}`;
}

export function giftDmSnippet(firstName: string, campaignName: string, url: string): string {
  const name = firstName ? `Hey ${firstName}!` : "Hey!";
  return `${name} We'd love to send you pieces from our ${campaignName} drop 🤍 pick your styles + drop your address here (takes 1 min): ${url}`;
}

export type GiftStage = "not_invited" | "invited" | "opened" | "submitted" | "ordered";

// A creator gift-invited in another campaign within this many days is flagged
// on the roster and in the bulk "Add to campaign" warning.
export const RECENT_GIFT_DAYS = 30;

// A view logged within 30 seconds of the invite is the sender loading the page
// (copying the link, an email scanner), not the creator. Only later views count
// as the creator opening it.
export const GENUINE_OPEN_DELAY_MS = 30_000;

export function isGenuineOpen(
  ci: Pick<CampaignInfluencer, "gift_invited_at" | "gift_viewed_at">,
): boolean {
  if (!ci.gift_viewed_at) return false;
  if (!ci.gift_invited_at) return true;
  return (
    new Date(ci.gift_viewed_at).getTime() - new Date(ci.gift_invited_at).getTime() >=
    GENUINE_OPEN_DELAY_MS
  );
}

export function giftStage(
  ci: Pick<
    CampaignInfluencer,
    "gift_token" | "gift_invited_at" | "gift_viewed_at" | "gift_submitted_at" | "shopify_order_id"
  >,
): GiftStage {
  if (ci.shopify_order_id) return "ordered";
  if (ci.gift_submitted_at) return "submitted";
  if (isGenuineOpen(ci)) return "opened";
  if (ci.gift_token || ci.gift_invited_at) return "invited";
  return "not_invited";
}

// --- Bulk order export -------------------------------------------------------
// For event gifting: every submitted pick in the campaign, rolled up by
// variant so the team can place one Shopify order for the whole lot.

export interface GiftOrderLine {
  product: string;
  color: string;
  size: string;
  sku: string;
  variant_id: string;
  quantity: number;
  picked_by: string[];
}

// Submitted picks carry variant_title (the size) on top of the base shape.
type GiftPick = ProductSelection & { variant_title?: string | null };
type SelectionRow = {
  gift_submitted_at?: string | null;
  product_selections?: GiftPick[] | null;
  influencer?: { name?: string | null } | null;
};

// Picks don't store the colour; the pool does (per product) and the SKU
// embeds it. Try the SKU against every pool colour first, then the pool
// entry with the same title, so multi-colour pools still resolve.
function selectionColor(sel: GiftPick, pool: GiftPoolProduct[]): string {
  const sku = String(sel.sku || "").toLowerCase();
  const colors = Array.from(new Set(pool.map((p) => (p.color || "").trim()).filter(Boolean)));
  const fromSku = colors.find((c) => sku.includes(c.toLowerCase().replace(/\s+/g, "-")));
  if (fromSku) return fromSku;
  const title = String(sel.title || "");
  const byTitle = pool.find((p) => p.product_title === title && p.color);
  return byTitle?.color || "";
}

export function giftOrderLines(rows: SelectionRow[], pool: GiftPoolProduct[] | null | undefined): GiftOrderLine[] {
  const lines = new Map<string, GiftOrderLine>();
  for (const row of rows) {
    if (!row.gift_submitted_at) continue;
    const name = (row.influencer?.name || "").trim();
    for (const sel of row.product_selections || []) {
      const key = String(sel.variant_id || sel.sku || `${sel.title}|${sel.variant_title}`);
      const qty = Math.max(1, Number(sel.quantity) || 1);
      const line = lines.get(key) || {
        product: String(sel.title || ""),
        color: selectionColor(sel, pool || []),
        size: String(sel.variant_title || ""),
        sku: String(sel.sku || ""),
        variant_id: String(sel.variant_id || ""),
        quantity: 0,
        picked_by: [],
      };
      line.quantity += qty;
      if (name) line.picked_by.push(qty > 1 ? `${name} ×${qty}` : name);
      lines.set(key, line);
    }
  }
  return Array.from(lines.values()).sort(
    (a, b) => a.product.localeCompare(b.product) || a.color.localeCompare(b.color) || sizeRank(a.size) - sizeRank(b.size)
  );
}

const SIZE_ORDER = ["xxs", "xs", "s", "m", "l", "xl", "xxl", "2xl", "3xl"];
function sizeRank(size: string): number {
  const i = SIZE_ORDER.indexOf(size.trim().toLowerCase());
  return i === -1 ? SIZE_ORDER.length : i;
}

export function giftOrderCsv(lines: GiftOrderLine[]): string {
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ["Product", "Color", "Size", "Quantity", "SKU", "Variant ID", "Picked by"];
  const body = lines.map((l) =>
    [l.product, l.color, l.size, l.quantity, l.sku, l.variant_id, l.picked_by.join("; ")].map(esc).join(",")
  );
  return [header.join(","), ...body].join("\n");
}
