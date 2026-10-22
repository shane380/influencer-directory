// Cleanup for creator-typed contact details before they go to Shopify, which
// rejects emoji/decorative symbols in address names and unknown provinces.

// Keep letters, marks, digits and the punctuation real names use; drop the
// sparkles/dingbats people decorate Instagram names with ("·˚✶· Jord ·✶˚。·").
export function cleanShopifyName(value: unknown): string {
  return String(value || "")
    .replace(/[^\p{L}\p{M}\p{N}\s'.\-]/gu, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s'.\-]+|[\s'.\-]+$/g, "");
}

// First/last after cleaning; when the first part was all decoration, the
// last part becomes the first name rather than leaving it blank.
export function cleanShopifyNames(first: unknown, last: unknown): { first_name?: string; last_name?: string } {
  const f = cleanShopifyName(first);
  const l = cleanShopifyName(last);
  if (!f && l) return { first_name: l };
  return { first_name: f || undefined, last_name: l || undefined };
}

const AU_STATES: Record<string, string> = {
  NSW: "new south wales",
  VIC: "victoria",
  QLD: "queensland",
  SA: "south australia",
  WA: "western australia",
  TAS: "tasmania",
  ACT: "australian capital territory",
  NT: "northern territory",
};

function auStateFromPostcode(zip: string): string | undefined {
  const pc = Number(String(zip).replace(/\D/g, ""));
  if (!pc) return undefined;
  if ((pc >= 200 && pc <= 299) || (pc >= 2600 && pc <= 2619) || (pc >= 2900 && pc <= 2920)) return "ACT";
  if (pc >= 800 && pc <= 999) return "NT";
  if (pc >= 1000 && pc <= 2999) return "NSW";
  if ((pc >= 3000 && pc <= 3999) || (pc >= 8000 && pc <= 8999)) return "VIC";
  if ((pc >= 4000 && pc <= 4999) || (pc >= 9000 && pc <= 9999)) return "QLD";
  if (pc >= 5000 && pc <= 5999) return "SA";
  if (pc >= 6000 && pc <= 6999) return "WA";
  if (pc >= 7000 && pc <= 7999) return "TAS";
  return undefined;
}

// The gift page's region field is free text, so AU creators sometimes type
// their suburb there. Shopify needs a real state, which the postcode gives us.
export function normalizeShopifyProvince(
  province: string | undefined,
  zip: string | undefined,
  countryCode: string | undefined
): string | undefined {
  if (String(countryCode || "").toUpperCase() !== "AU") return province || undefined;
  const p = String(province || "").trim();
  const code = Object.keys(AU_STATES).find(
    (k) => k === p.toUpperCase() || AU_STATES[k] === p.toLowerCase()
  );
  if (code) return code;
  return auStateFromPostcode(zip || "") || p || undefined;
}
