// Canonical country list for the customer address picker. Names come from
// Intl.DisplayNames so they stay current without a hand-maintained table, but
// the codes are an explicit ISO-3166-1 alpha-2 allowlist: Intl also resolves
// deprecated and non-country region codes (DD, SU, UK, AN, ...) to a modern
// country name, and Shopify rejects those with "addresses.country: is invalid".
// Codes are ISO-2, matching what Shopify stores as address.country_code.

export interface Country {
  code: string;
  name: string;
}

// ISO-3166-1 alpha-2 officially assigned codes, plus XK (Kosovo), which has no
// ISO code but is what Shopify uses for it.
const ISO_3166_1_ALPHA_2 = [
  "AD","AE","AF","AG","AI","AL","AM","AO","AQ","AR","AS","AT","AU","AW","AX","AZ",
  "BA","BB","BD","BE","BF","BG","BH","BI","BJ","BL","BM","BN","BO","BQ","BR","BS",
  "BT","BV","BW","BY","BZ","CA","CC","CD","CF","CG","CH","CI","CK","CL","CM","CN",
  "CO","CR","CU","CV","CW","CX","CY","CZ","DE","DJ","DK","DM","DO","DZ","EC","EE",
  "EG","EH","ER","ES","ET","FI","FJ","FK","FM","FO","FR","GA","GB","GD","GE","GF",
  "GG","GH","GI","GL","GM","GN","GP","GQ","GR","GS","GT","GU","GW","GY","HK","HM",
  "HN","HR","HT","HU","ID","IE","IL","IM","IN","IO","IQ","IR","IS","IT","JE","JM",
  "JO","JP","KE","KG","KH","KI","KM","KN","KP","KR","KW","KY","KZ","LA","LB","LC",
  "LI","LK","LR","LS","LT","LU","LV","LY","MA","MC","MD","ME","MF","MG","MH","MK",
  "ML","MM","MN","MO","MP","MQ","MR","MS","MT","MU","MV","MW","MX","MY","MZ","NA",
  "NC","NE","NF","NG","NI","NL","NO","NP","NR","NU","NZ","OM","PA","PE","PF","PG",
  "PH","PK","PL","PM","PN","PR","PS","PT","PW","PY","QA","RE","RO","RS","RU","RW",
  "SA","SB","SC","SD","SE","SG","SH","SI","SJ","SK","SL","SM","SN","SO","SR","SS",
  "ST","SV","SX","SY","SZ","TC","TD","TF","TG","TH","TJ","TK","TL","TM","TN","TO",
  "TR","TT","TV","TW","TZ","UA","UG","UM","US","UY","UZ","VA","VC","VE","VG","VI",
  "VN","VU","WF","WS","XK","YE","YT","ZA","ZM","ZW",
];

let cached: Country[] | null = null;

export function getCountries(): Country[] {
  if (cached) return cached;
  let display: Intl.DisplayNames | null = null;
  try {
    display = new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    // Intl.DisplayNames unavailable — fall back to showing the bare codes.
  }
  const list: Country[] = ISO_3166_1_ALPHA_2.map((code) => ({
    code,
    name: display?.of(code) ?? code,
  }));
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
