import { NextRequest, NextResponse } from "next/server";
import { ApifyClient } from "apify-client";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const handle = searchParams.get("handle");

  if (!handle) {
    return NextResponse.json({ error: "Handle is required" }, { status: 400 });
  }

  const cleanHandle = handle.replace("@", "").trim();

  if (!process.env.APIFY_API_TOKEN) {
    console.error("APIFY_API_TOKEN not configured");
    return NextResponse.json(
      { error: "Instagram API not configured" },
      { status: 500 }
    );
  }

  try {
    const client = new ApifyClient({
      token: process.env.APIFY_API_TOKEN,
    });

    // Run the Instagram Profile Scraper
    const run = await client.actor("apify/instagram-profile-scraper").call({
      usernames: [cleanHandle],
      resultsLimit: 1,
    });

    // Fetch results from the dataset
    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    if (!items || items.length === 0) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    const profile = items[0];

    // Map Apify fields to our expected format
    // Handle different possible field naming conventions
    const username = profile.username || profile.userName;
    const fullName = profile.fullName || profile.full_name || username;
    const profilePicUrl = profile.profilePicUrl || profile.profile_pic_url || profile.profilePicUrlHd;
    const followersCount = profile.followersCount ?? profile.followers_count ?? profile.followedByCount ?? 0;
    const followingCount = profile.followsCount ?? profile.following_count ?? profile.followCount ?? 0;
    const mediaCount = profile.postsCount ?? profile.media_count ?? profile.mediaCount ?? 0;
    const isPrivate = profile.private ?? profile.is_private ?? false;
    const isVerified = profile.verified ?? profile.is_verified ?? false;

    return NextResponse.json({
      username,
      full_name: fullName,
      profile_pic_url: profilePicUrl,
      follower_count: followersCount,
      following_count: followingCount,
      media_count: mediaCount,
      is_private: isPrivate,
      is_verified: isVerified,
    });
  } catch (error: any) {
    console.error("Apify Instagram lookup error:", error);

    // Provide more specific error messages
    if (error.message?.includes("not found")) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: "Failed to fetch Instagram profile" },
      { status: 500 }
    );
  }
}
