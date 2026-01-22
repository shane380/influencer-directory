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

  for (const row of parsed.data as Record<string, string>[]) {
    const name = (row["Name"] || "").trim();
    const igValue = row["IG"] || row["Instagram Handle"] || "";

    if (name && (igValue.includes("/p/") || igValue.includes("/reel/"))) {
      results.push({ name, postUrl: igValue.trim() });
    }
  }

  return results;
}

// Extract username from Instagram post page HTML
async function extractUsernameFromPost(postUrl: string): Promise<string | null> {
  try {
    // Clean URL - get first URL if multiple
    const url = postUrl.split(/\s+/)[0].trim();

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
    });

    if (!response.ok) {
      return null;
    }

    const html = await response.text();

    // Try multiple patterns to extract username
    const patterns = [
      // og:title often has "Username on Instagram"
      /<meta\s+property="og:title"\s+content="([^"]+)\s+on\s+Instagram[^"]*"/i,
      /<meta\s+content="([^"]+)\s+on\s+Instagram[^"]*"\s+property="og:title"/i,
      // al:ios:url has instagram://user?username=xxx
      /instagram:\/\/user\?username=([a-zA-Z0-9._]+)/i,
      // Link in page
      /"username":"([a-zA-Z0-9._]+)"/i,
      // Alternate meta patterns
      /<meta\s+property="instapp:owner_user_id"\s+content="\d+"[^>]*>/i,
      // Profile link in page
      /instagram\.com\/([a-zA-Z0-9._]+)\/?\?/,
      // Twitter creator
      /<meta\s+name="twitter:creator"\s+content="@([a-zA-Z0-9._]+)"/i,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        // For og:title, need to extract just the username part
        if (pattern.toString().includes("og:title")) {
          // "Photos shared by Name (@username)" or "Name (@username)"
          const usernameMatch = match[1].match(/@([a-zA-Z0-9._]+)/);
          if (usernameMatch) {
            return usernameMatch[1].toLowerCase();
          }
          // Sometimes it's just the display name, skip
          continue;
        }
        return match[1].toLowerCase();
      }
    }

    // Try to find username in JSON-LD or other structured data
    const jsonLdMatch = html.match(/"author":\s*\{[^}]*"identifier":\s*"([a-zA-Z0-9._]+)"/);
    if (jsonLdMatch) {
      return jsonLdMatch[1].toLowerCase();
    }

    return null;
  } catch (error) {
    return null;
  }
}

async function main() {
  const csvPath = "/Users/shanepetersen/Downloads/Campaigns 25'-OCT25 (FW collection) (1).csv";

  console.log("Extracting post URLs from CSV...\n");
  const postUrls = getPostUrlsFromCSV(csvPath);
  console.log(`Found ${postUrls.length} post URLs to process\n`);

  const results: { name: string; postUrl: string; handle: string | null; status: string }[] = [];

  for (let i = 0; i < postUrls.length; i++) {
    const { name, postUrl } = postUrls[i];
    console.log(`[${i + 1}/${postUrls.length}] ${name}`);
    console.log(`  URL: ${postUrl.substring(0, 60)}...`);

    const handle = await extractUsernameFromPost(postUrl);

    if (handle) {
      console.log(`  Handle: @${handle}`);
      results.push({ name, postUrl, handle, status: "found" });
    } else {
      console.log(`  Could not extract handle`);
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
  console.log("\n=== Found Handles ===");
  results.filter(r => r.handle).forEach(r => {
    console.log(`${r.name}: @${r.handle}`);
  });

  // Show not found
  if (notFound > 0) {
    console.log("\n=== Not Found ===");
    results.filter(r => !r.handle).forEach(r => {
      console.log(`${r.name}: ${r.postUrl.substring(0, 50)}...`);
    });
  }
}

main().catch(console.error);
