// Canonical country list for the customer address picker, built from
// Intl.DisplayNames so it stays current without a hand-maintained table.
// Codes are ISO-2, matching what Shopify stores as address.country_code.

export interface Country {
  code: string;
  name: string;
}

// Region codes that Intl.DisplayNames returns but which are not selectable
// shipping destinations (unions, aggregates, "unknown").
const NON_COUNTRY = new Set(["EU", "UN", "ZZ", "QO", "XA", "XB", "EZ"]);

let cached: Country[] | null = null;

export function getCountries(): Country[] {
  if (cached) return cached;
  const list: Country[] = [];
  try {
    const display = new Intl.DisplayNames(["en"], { type: "region" });
    for (let a = 65; a <= 90; a++) {
      for (let b = 65; b <= 90; b++) {
        const code = String.fromCharCode(a) + String.fromCharCode(b);
        if (NON_COUNTRY.has(code)) continue;
        const name = display.of(code);
        if (name && name !== code) list.push({ code, name });
      }
    }
  } catch {
    // Intl.DisplayNames unavailable — fall through with whatever we have.
  }
  list.sort((x, y) => x.name.localeCompare(y.name));
  // Pin the two most common destinations to the top.
  const pinnedCodes = ["US", "CA"];
  const pinned = pinnedCodes
    .map((c) => list.find((x) => x.code === c))
    .filter((c): c is Country => !!c);
  const rest = list.filter((c) => !pinnedCodes.includes(c.code));
  cached = [...pinned, ...rest];
  return cached;
}

export function countryName(code: string | null | undefined): string | null {
  if (!code) return null;
  return getCountries().find((c) => c.code === code.toUpperCase())?.name ?? null;
}
