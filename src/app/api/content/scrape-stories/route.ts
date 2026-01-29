import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ApifyClient } from "apify-client";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const NAMA_HANDLE = "nama";

interface TaggedPost {
  id?: string;
  url?: string;
  displayUrl?: string;
  videoUrl?: string;
  images?: string[];
  type?: string;
  productType?: string;
  caption?: string;
  timestamp?: string;
  mentions?: string[];
  ownerUsername?: string;
  ownerFullName?: string;
  ownerId?: string;
  likesCount?: number;
  commentsCount?: number;
  taggedUsers?: Array<{ username?: string }>;
  [key: string]: unknown;
}

function getMediaExtension(contentType: string | null, url: string): string {
  if (contentType?.includes("video")) return "mp4";
  if (contentType?.includes("png")) return "png";
  if (contentType?.includes("webp")) return "webp";
  if (url.includes(".mp4")) return "mp4";
  if (url.includes(".png")) return "png";
  if (url.includes(".webp")) return "webp";
  return "jpg";
}

function generateHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function getContentType(post: TaggedPost): string {
  if (post.productType === "clips" || post.type === "Video") return "reel";
  if (post.videoUrl) return "reel";
  return "post";
}

async function downloadAndUpload(
  supabase: any,
  mediaUrl: string,
  handle: string,
  retryCount = 0
): Promise<string | null> {
  try {
    const response = await fetch(mediaUrl);
    if (!response.ok) {
      if (retryCount === 0) {
        return downloadAndUpload(supabase, mediaUrl, handle, 1);
      }
      return null;
    }

    const contentType = response.headers.get("content-type");
    const ext = getMediaExtension(contentType, mediaUrl);
    const timestamp = Date.now();
    const hash = generateHash(mediaUrl);
    const fileName = `${handle}/${timestamp}-${hash}.${ext}`;

    const blob = await response.blob();
    const buffer = Buffer.from(await blob.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from("influencer-content")
      .upload(fileName, buffer, {
        contentType: contentType || "image/jpeg",
        upsert: false,
      });

    if (uploadError) {
      console.error(`Upload error for ${handle}:`, uploadError.message);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from("influencer-content")
      .getPublicUrl(fileName);

    return urlData.publicUrl;
  } catch (err) {
    if (retryCount === 0) {
      return downloadAndUpload(supabase, mediaUrl, handle, 1);
    }
    console.error(`Download failed for ${handle}:`, err);
    return null;
  }
}

// GET handler for Vercel cron
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return runScrape();
}

// POST handler for manual triggers
export async function POST() {
  return runScrape();
}

async function runScrape(): Promise<NextResponse> {
  if (!process.env.APIFY_API_TOKEN) {
    return NextResponse.json(
      { error: "APIFY_API_TOKEN not configured" },
      { status: 500 }
    );
  }

  if (!supabaseServiceKey) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY not configured" },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const apify = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

  // Fetch all influencer handles for matching
  const { data: influencers, error: fetchError } = await supabase
    .from("influencers")
    .select("id, instagram_handle")
    .neq("instagram_handle", "");

  if (fetchError) {
    return NextResponse.json(
      { error: `Failed to fetch influencers: ${fetchError.message}` },
      { status: 500 }
    );
  }

  // Build handle -> id map (case-insensitive)
  const influencerMap = new Map<string, string>();
  for (const inf of influencers || []) {
    influencerMap.set(inf.instagram_handle.toLowerCase(), inf.id);
  }

  // Scrape posts tagged @nama using the tagged posts scraper
  let items: TaggedPost[] = [];
  try {
    const run = await apify
      .actor("apify/instagram-tagged-scraper")
      .call({
        username: [NAMA_HANDLE],
        resultsLimit: 100,
      });

    const result = await apify
      .dataset(run.defaultDatasetId)
      .listItems();

    items = (result.items || []) as TaggedPost[];
  } catch (err: any) {
    console.error("Tagged scraper failed:", err.message);
    return NextResponse.json(
      { error: `Scraper failed: ${err.message}` },
      { status: 500 }
    );
  }

  let processed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const post of items) {
    try {
      const handle = (post.ownerUsername || "").toLowerCase();
      const influencerId = influencerMap.get(handle);

      if (!influencerId) {
        skipped++;
        continue;
      }

      const originalUrl = post.url || "";
      if (!originalUrl) {
        skipped++;
        continue;
      }

      // Check for duplicate
      const { data: existing } = await supabase
        .from("content")
        .select("id")
        .eq("original_url", originalUrl)
        .maybeSingle();

      if (existing) {
        skipped++;
        continue;
      }

      // Get media URL - video or first image
      const sourceMediaUrl =
        post.videoUrl || post.displayUrl || post.images?.[0] || "";
      if (!sourceMediaUrl) {
        skipped++;
        continue;
      }

      const storedUrl = await downloadAndUpload(supabase, sourceMediaUrl, handle);
      if (!storedUrl) {
        errors.push(`Failed to download media for ${handle}: ${originalUrl}`);
        continue;
      }

      // Upload thumbnail for videos
      let thumbnailUrl: string | null = null;
      if (post.videoUrl && post.displayUrl) {
        thumbnailUrl = await downloadAndUpload(supabase, post.displayUrl, handle);
      }

      const contentType = getContentType(post);
      const postedAt = post.timestamp
        ? new Date(post.timestamp).toISOString()
        : null;

      // Try to find active campaign for this influencer
      let campaignId: string | null = null;
      const { data: activeCampaign } = await supabase
        .from("campaign_influencers")
        .select("campaign_id")
        .eq("influencer_id", influencerId)
        .limit(1)
        .maybeSingle();

      if (activeCampaign) {
        campaignId = activeCampaign.campaign_id;
      }

      const { error: insertError } = await supabase.from("content").insert({
        influencer_id: influencerId,
        type: contentType,
        media_url: storedUrl,
        original_url: originalUrl,
        thumbnail_url: thumbnailUrl,
        caption: post.caption || null,
        posted_at: postedAt,
        campaign_id: campaignId,
        metadata: {
          mentions: post.mentions || [],
          taggedUsers: post.taggedUsers || [],
          likesCount: post.likesCount,
          commentsCount: post.commentsCount,
          ownerFullName: post.ownerFullName,
        },
      });

      if (insertError) {
        if (insertError.code === "23505") {
          skipped++;
        } else {
          errors.push(`Insert error for ${handle}: ${insertError.message}`);
        }
        continue;
      }

      processed++;
    } catch (err: any) {
      errors.push(`Error processing post: ${err.message}`);
    }
  }

  return NextResponse.json({
    message: `Scrape complete: ${processed} new items, ${skipped} skipped`,
    totalProcessed: processed,
    totalSkipped: skipped,
    totalErrors: errors.length,
    totalScraped: items.length,
    errors: errors.length > 0 ? errors : undefined,
  });
}
