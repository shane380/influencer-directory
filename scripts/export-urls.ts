import * as fs from "fs";
import Papa from "papaparse";

const csvPath = "/Users/shanepetersen/Downloads/Campaigns 25'-OCT25 (FW collection) (1).csv";
const content = fs.readFileSync(csvPath, "utf-8");
const parsed = Papa.parse(content, {
  header: true,
  skipEmptyLines: true,
  transformHeader: (h) => h.trim().replace(/^\uFEFF/, ""),
});

const urls: string[] = [];
const seen = new Set<string>();

for (const row of parsed.data as Record<string, string>[]) {
  const name = (row["Name"] || "").trim();
  const igValue = row["IG"] || row["Instagram Handle"] || "";

  if (name && (igValue.includes("/p/") || igValue.includes("/reel/"))) {
    const key = name.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      urls.push(igValue.trim().split(/\s+/)[0]);
    }
  }
}

const outputPath = "/Users/shanepetersen/Downloads/post-urls.txt";
fs.writeFileSync(outputPath, urls.join("\n"));
console.log(`Saved ${urls.length} URLs to ${outputPath}`);
