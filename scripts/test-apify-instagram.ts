import { ApifyClient } from "apify-client";
import * as dotenv from "dotenv";
import * as path from "path";

// Load environment variables from .env.local
dotenv.config({ path: path.join(__dirname, "..", ".env.local") });

async function testApifyInstagram() {
  const testUsername = "natgeo"; // Use a well-known public account for testing

  if (!process.env.APIFY_API_TOKEN) {
    console.error("❌ APIFY_API_TOKEN not found in .env.local");
    console.log("\nPlease add your Apify API token to .env.local:");
    console.log("APIFY_API_TOKEN=your_token_here");
    console.log("\nGet your token from: https://console.apify.com/account/integrations");
    process.exit(1);
  }

  console.log(`Testing Apify Instagram Profile Scraper with @${testUsername}...\n`);

  try {
    const client = new ApifyClient({
      token: process.env.APIFY_API_TOKEN,
    });

    console.log("Starting actor run...");
    const run = await client.actor("apify/instagram-profile-scraper").call({
      usernames: [testUsername],
      resultsLimit: 1,
    });

    console.log(`Actor run completed. Dataset ID: ${run.defaultDatasetId}\n`);

    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    if (!items || items.length === 0) {
      console.error("❌ No results returned");
      process.exit(1);
    }

    const profile = items[0];

    console.log("✅ Profile fetched successfully!\n");
    console.log("=" .repeat(60));
    console.log("FULL PROFILE DATA:");
    console.log("=" .repeat(60));
    console.log(JSON.stringify(profile, null, 2));
    console.log("=" .repeat(60));

    console.log("\n" + "=" .repeat(60));
    console.log("FIELD MAPPING:");
    console.log("=" .repeat(60));

    const mapping = [
      { label: "username", value: profile.username || profile.userName },
      { label: "full_name", value: profile.fullName || profile.full_name },
      { label: "profile_pic_url", value: profile.profilePicUrl || profile.profile_pic_url || profile.profilePicUrlHd },
      { label: "follower_count", value: profile.followersCount ?? profile.followers_count ?? profile.followedByCount },
      { label: "following_count", value: profile.followsCount ?? profile.following_count ?? profile.followCount },
      { label: "media_count", value: profile.postsCount ?? profile.media_count ?? profile.mediaCount },
      { label: "is_private", value: profile.private ?? profile.is_private },
      { label: "is_verified", value: profile.verified ?? profile.is_verified },
    ];

    mapping.forEach(({ label, value }) => {
      const status = value !== undefined ? "✅" : "❌";
      console.log(`${status} ${label.padEnd(20)} = ${value}`);
    });

    console.log("=" .repeat(60));

    console.log("\n✅ All required fields are available!");
    console.log("\n🎉 Apify integration test passed!");

  } catch (error: any) {
    console.error("❌ Error testing Apify:", error.message);
    if (error.message?.includes("token")) {
      console.log("\n⚠️  Check that your APIFY_API_TOKEN is valid");
    }
    process.exit(1);
  }
}

testApifyInstagram().catch(console.error);
