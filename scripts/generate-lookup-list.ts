import * as fs from "fs";
import Papa from "papaparse";

const csvPath = "/Users/shanepetersen/Downloads/Campaigns 25'-OCT25 (FW collection) (1).csv";
const content = fs.readFileSync(csvPath, "utf-8");
const parsed = Papa.parse(content, {
  header: true,
  skipEmptyLines: true,
  transformHeader: (h) => h.trim().replace(/^\uFEFF/, ""),
});

const results: { name: string; postUrl: string; handle: string }[] = [];
const seen = new Set<string>();

for (const row of parsed.data as Record<string, string>[]) {
  const name = (row["Name"] || "").trim();
  const igValue = row["IG"] || row["Instagram Handle"] || "";

  if (name && (igValue.includes("/p/") || igValue.includes("/reel/"))) {
    const key = name.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      const url = igValue.trim().split(/\s+/)[0];
      results.push({ name, postUrl: url, handle: "" });
    }
  }
}

// Save CSV for manual entry
const outputPath = "/Users/shanepetersen/Downloads/handles-to-lookup.csv";
const csvOutput = Papa.unparse(results);
fs.writeFileSync(outputPath, csvOutput);

console.log(`Saved ${results.length} entries to ${outputPath}\n`);
console.log("=== Post URLs to Lookup ===\n");
results.forEach((r, i) => {
  console.log(`${i + 1}. ${r.name}`);
  console.log(`   ${r.postUrl}\n`);
});
