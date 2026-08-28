/**
 * Retired affiliate codes, so rotating a leaked code doesn't erase what was
 * earned under it.
 *
 * Commission matches an order's discount_codes against the owner's code string.
 * A rotation changes that string, so without aliases every order placed on the
 * previous code stops resolving and the creator is silently underpaid for the
 * part of the month before the rotation.
 */

export interface CodeAliases {
  /** Retired codes keyed by creators.id */
  byCreator: Map<string, string[]>;
  /** Retired codes keyed by legacy_affiliates.id */
  byLegacyAffiliate: Map<string, string[]>;
  /** Every retired code, upper-cased — for sweeps that work code-first. */
  all: string[];
}

/**
 * Load every retired code, grouped by owner. One query; callers resolving many
 * owners should call this once rather than per owner.
 *
 * A missing or unreadable table yields empty maps rather than throwing: before
 * any rotation has happened there are no aliases, and a payment run must not
 * fail because a code has never been rotated.
 */
export async function loadCodeAliases(db: any): Promise<CodeAliases> {
  const byCreator = new Map<string, string[]>();
  const byLegacyAffiliate = new Map<string, string[]>();
  const all: string[] = [];

  const { data, error } = await (db.from("affiliate_code_history") as any)
    .select("code, creator_id, legacy_affiliate_id");

  if (error || !data) {
    if (error) console.warn(`[affiliate-code-aliases] ${error.message}`);
    return { byCreator, byLegacyAffiliate, all };
  }

  for (const row of data) {
    const code = String(row.code || "").toUpperCase();
    if (!code) continue;
    all.push(code);
    const target = row.creator_id ? byCreator : byLegacyAffiliate;
    const key = row.creator_id || row.legacy_affiliate_id;
    if (!key) continue;
    target.set(key, [...(target.get(key) || []), code]);
  }

  return { byCreator, byLegacyAffiliate, all };
}

/**
 * The full set of codes to match orders against for one owner: the code they
 * use now plus everything they've rotated away from. Upper-cased and
 * de-duplicated; returns [] when there is no current code.
 */
export function codesForOwner(
  currentCode: string | null | undefined,
  retired: string[] | undefined,
): string[] {
  const out = new Set<string>();
  if (currentCode && currentCode.trim()) out.add(currentCode.trim().toUpperCase());
  for (const c of retired || []) {
    if (c && c.trim()) out.add(c.trim().toUpperCase());
  }
  return Array.from(out);
}
