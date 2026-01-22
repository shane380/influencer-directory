import * as fs from "fs";
import Papa from "papaparse";

const rapidApiKey = process.env.RAPIDAPI_KEY!;

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
      // Deduplicate by name
      if (!seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase());
        results.push({ name, postUrl: igValue.trim().split(/\s+/)[0] });
      }
    }
  }

  return results;
}

// Extract shortcode from URL
function extractShortcode(url: string): string | null {
  // Match /p/SHORTCODE or /reel/SHORTCODE
  const match = url.match(/\/(p|reel|reels)\/([A-Za-z0-9_-]+)/);
  return match ? match[2] : null;
}

// Fetch post info from API
async function fetchPostInfo(shortcode: string): Promise<string | null> {
  try {
    const response = await fetch(
      `https://instagram-scraper-stable-api.p.rapidapi.com/ig_get_media_info.php?code=${encodeURIComponent(shortcode)}`,
      {
        method: "GET",
        headers: {
          "x-rapidapi-key": rapidApiKey,
          "x-rapidapi-host": "instagram-scraper-stable-api.p.rapidapi.com",
        },
      }
    );

    if (!response.ok) {
      console.log(`  API error: ${response.status}`);
      return null;
    }

    const data = await response.json();

    // Try to extract username from various response formats
    if (data.user?.username) {
      return data.user.username.toLowerCase();
    }
    if (data.owner?.username) {
      return data.owner.username.toLowerCase();
    }
    if (data.data?.user?.username) {
      return data.data.user.username.toLowerCase();
    }
    if (data.data?.owner?.username) {
      return data.data.owner.username.toLowerCase();
    }

    // Log response structure for debugging
    console.log(`  Response keys: ${Object.keys(data).join(", ")}`);

    return null;
  } catch (error) {
    console.log(`  Fetch error: ${error}`);
    return null;
  }
}

async function main() {
  const csvPath = "/Users/shanepetersen/Downloads/Campaigns 25'-OCT25 (FW collection) (1).csv";

  console.log("Extracting post URLs from CSV...\n");
  const postUrls = getPostUrlsFromCSV(csvPath);
  console.log(`Found ${postUrls.length} unique post URLs to process\n`);

  const results: { name: string; postUrl: string; shortcode: string; handle: string | null; status: string }[] = [];

  for (let i = 0; i < postUrls.length; i++) {
    const { name, postUrl } = postUrls[i];
    const shortcode = extractShortcode(postUrl);

    console.log(`[${i + 1}/${postUrls.length}] ${name}`);

    if (!shortcode) {
      console.log(`  Could not extract shortcode from: ${postUrl}`);
      results.push({ name, postUrl, shortcode: "", handle: null, status: "no_shortcode" });
      continue;
    }

    console.log(`  Shortcode: ${shortcode}`);

    const handle = await fetchPostInfo(shortcode);

    if (handle) {
      console.log(`  Handle: @${handle}`);
      results.push({ name, postUrl, shortcode, handle, status: "found" });
    } else {
      console.log(`  Could not extract handle`);
      results.push({ name, postUrl, shortcode, handle: null, status: "not_found" });
    }

    // Rate limit - 1.5 second delay
    await new Promise(r => setTimeout(r, 1500));
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
    console.log("\n=== Not Found ===");
    results.filter(r => !r.handle).forEach(r => {
      console.log(`${r.name}`);
    });
  }
}

main().catch(console.error);
