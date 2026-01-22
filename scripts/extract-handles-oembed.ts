import * as fs from "fs";
import Papa from "papaparse";

// Extract post URLs from CSV
function getPostUrlsFromCSV(filePath: string): { name: string; postUrl: string }[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const parsed = Papa.parse(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().replace(/^\uFEFF/, ""),
  });

  const results: { name: string; postUrl: string }[] = [];
  const seen = new Set<string>();

  for (const row of parsed.data as Record<string, string>[]) {
    const name = (row["Name"] || "").trim();
    const igValue = row["IG"] || row["Instagram Handle"] || "";

    if (name && (igValue.includes("/p/") || igValue.includes("/reel/"))) {
      if (!seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase());
        results.push({ name, postUrl: igValue.trim().split(/\s+/)[0] });
      }
    }
  }

  return results;
}

// Use Instagram's oEmbed API to get author info
async function fetchOEmbed(postUrl: string): Promise<string | null> {
  try {
    // Clean the URL
    const cleanUrl = postUrl.split("?")[0];
    const oembedUrl = `https://api.instagram.com/oembed/?url=${encodeURIComponent(cleanUrl)}`;

    const response = await fetch(oembedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    // oEmbed returns author_name which is the username
    if (data.author_name) {
      return data.author_name.toLowerCase();
    }

    return null;
  } catch {
    return null;
  }
}

async function main() {
  const csvPath = "/Users/shanepetersen/Downloads/Campaigns 25'-OCT25 (FW collection) (1).csv";

  console.log("Extracting post URLs from CSV...\n");
  const postUrls = getPostUrlsFromCSV(csvPath);
  console.log(`Found ${postUrls.length} unique post URLs to process\n`);

  const results: { name: string; postUrl: string; handle: string | null; status: string }[] = [];

  for (let i = 0; i < postUrls.length; i++) {
    const { name, postUrl } = postUrls[i];

    console.log(`[${i + 1}/${postUrls.length}] ${name}`);

    const handle = await fetchOEmbed(postUrl);

    if (handle) {
      console.log(`  @${handle}`);
      results.push({ name, postUrl, handle, status: "found" });
    } else {
      console.log(`  Not found`);
      results.push({ name, postUrl, handle: null, status: "not_found" });
    }

    // Rate limit - 2 second delay
    await new Promise(r => setTimeout(r, 2000));
  }

  // Save results to CSV
  const outputPath = "/Users/shanepetersen/Downloads/extracted-handles.csv";
  const csvOutput = Papa.unparse(results);
  fs.writeFileSync(outputPath, csvOutput);
  console.log(`\nResults saved to: ${outputPath}`);

  // Summary
  const found = results.filter(r => r.handle).length;
  const notFound = results.filter(r => !r.handle).length;
  console.log(`\nSummary: ${found} handles found, ${notFound} not found`);

  // Show found handles
  if (found > 0) {
    console.log("\n=== Found Handles ===");
    results.filter(r => r.handle).forEach(r => {
      console.log(`${r.name}: @${r.handle}`);
    });
  }

  // Show not found
  if (notFound > 0) {
    console.log(`\n=== Not Found (${notFound}) ===`);
    results.filter(r => !r.handle).forEach(r => {
      console.log(`${r.name}`);
    });
  }
}

main().catch(console.error);
