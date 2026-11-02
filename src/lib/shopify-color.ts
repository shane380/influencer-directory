// Colour label for a Shopify product in this store.
//
// Colourways are separate products, and the colour is baked into every SKU
// just before the size (Body-Butter-Demi-Bra-Taupe-XS,
// BB-Twist-Crop-Ash-Heather-Grey-XS, Body-Soft-Staple-Bra-Velvet-Brown-XS).
// The "Black" / "Taupe" tags are hand-maintained and often stale: a product
// duplicated from the black one keeps the Black tag, and many products carry
// no colour tag at all. So: a Colour option on the variant wins, then the SKU,
// then a tag that is itself a colour word, else nothing.

const COLOR_WORDS = new Set([
  "black", "white", "ivory", "cream", "bone", "chalk", "off",
  "taupe", "beige", "sand", "stone", "oat", "oatmeal", "nude", "tan", "camel", "khaki", "cashmere", "latte", "caramel", "honey", "toffee",
  "brown", "mocha", "espresso", "chocolate", "cocoa", "velvet", "bronze", "copper", "rust", "terracotta",
  "grey", "gray", "charcoal", "graphite", "slate", "silver", "ash", "heather", "heathered", "marl", "melange", "smoke", "fog", "mist", "pearl",
  "navy", "blue", "cobalt", "denim", "indigo", "sky", "powder", "midnight", "teal", "aqua", "turquoise", "ocean",
  "burgundy", "wine", "plum", "berry", "cherry", "ruby", "scarlet", "crimson", "red", "magenta", "fuchsia", "maroon",
  "pink", "rose", "blush", "peach", "apricot", "coral", "mauve", "lilac", "lavender", "purple",
  "green", "olive", "sage", "forest", "emerald", "mint", "pistachio", "lime",
  "yellow", "mustard", "lemon", "gold", "orange",
  "light", "dark", "deep", "dusty", "pale", "soft", "on", "pinstripe", "stripe", "striped", "contrast", "metallic", "liquid", "twilight",
  // Legacy (pre-2022) colour names still on draft products.
  "haze", "palm", "water", "clay", "cloud", "oxblood", "thyme", "limestone", "raisin", "mahogany", "chicory", "coffee", "himalayan", "salt", "sapphire",
]);

// Trailing SKU tokens that are not part of the colour: sizes, lengths, and the
// "-1" Shopify appends to a duplicated SKU.
const TRAILING_RE = /^(xxs|xs|s|m|l|xl|xxl|xxxl|\dxl?|os|one|size|regular|reg|r|p|long|short|tall|petite|\d+)$/i;

function pretty(words: string[]): string {
  return words
    .map((w) => (w.toLowerCase() === "on" ? "on" : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");
}

export function colorFromSku(sku: string | null | undefined): string | null {
  if (!sku) return null;
  const tokens = sku.split(/[-_\s]+/).filter(Boolean);
  while (tokens.length && TRAILING_RE.test(tokens[tokens.length - 1])) tokens.pop();
  const colour: string[] = [];
  while (tokens.length && COLOR_WORDS.has(tokens[tokens.length - 1].toLowerCase())) {
    colour.unshift(tokens.pop()!);
  }
  // A bare modifier ("Light", "On") is not a colour.
  if (!colour.some((w) => !["light", "dark", "deep", "dusty", "pale", "soft", "on", "metallic", "liquid", "twilight"].includes(w.toLowerCase()))) return null;
  return pretty(colour);
}

export function colorFromTags(tags: string[] | null | undefined): string | null {
  const hits = (tags || [])
    .map((t) => t.trim())
    .filter((t) => t && t.split(/[-\s]+/).every((w) => COLOR_WORDS.has(w.toLowerCase())));
  return hits.length ? hits.map((t) => pretty(t.split(/[-\s]+/))).join(" / ") : null;
}

export function productColor(input: {
  sku?: string | null;
  selectedOptions?: { name: string; value: string }[] | null;
  tags?: string[] | null;
}): string | null {
  const option = (input.selectedOptions || []).find((o) => /^colou?r$/i.test(o.name));
  if (option?.value) return option.value;
  return colorFromSku(input.sku) ?? colorFromTags(input.tags);
}
