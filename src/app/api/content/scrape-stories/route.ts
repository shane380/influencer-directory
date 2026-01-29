import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ApifyClient } from "apify-client";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const NAMA_TAG = "nama";
const BATCH_SIZE = 20;

interface StoryResult {
  id?: string;
  url?: string;
  mediaUrl?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  type?: string;
  caption?: string;
  takenAt?: string;
  timestamp?: string;
  mentions?: string[];
  stickers?: Array<{ type?: string; text?: string; mention?: string }>;
  owner?: { username?: string };
  username?: string;
  [key: string]: unknown;
}

function hasNamaMention(story: StoryResult): boolean {
  const tag = NAMA_TAG.toLowerCase();

  // Check mentions array
  if (story.mentions?.some((m) => m.toLowerCase().includes(tag))) {
    return true;
  }

  // Check caption
  if (story.caption?.toLowerCase().includes(`@${tag}`)) {
    return true;
  }

  // Check stickers for mentions
  if (
    story.stickers?.some(
      (s) =>
        s.mention?.toLowerCase().includes(tag) ||
        s.text?.toLowerCase().includes(`@${tag}`)
    )
  ) {
    return true;
  }

  return false;
}

function getMediaExtension(contentType: string | null, url: string): string {
  if (contentType?.includes("video")) return "mp4";
  if (contentType?.includes("png")) return "png";
  if (contentType?.includes("webp")) return "webp";
  // Check URL for extension hints
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

async function downloadAndUpload(
  supabase: any,
  mediaUrl: string,
  handle: string,
  retryCount = 0
): Promise<{ storedUrl: string; thumbnailUrl?: string } | null> {
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

    return { storedUrl: urlData.publicUrl };
  } catch (err) {
    if (retryCount === 0) {
      return downloadAndUpload(supabase, mediaUrl, handle, 1);
    }
    console.error(`Download failed for ${handle}:`, err);
    return null;
  }
}

async function processStories(
  supabase: any,
  items: StoryResult[],
  influencerMap: Map<string, string>
): Promise<{ processed: number; skipped: number; errors: string[] }> {
  let processed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const story of items) {
    try {
      if (!hasNamaMention(story)) {
        skipped++;
        continue;
      }

      const handle = (
        story.username ||
        story.owner?.username ||
        ""
      ).toLowerCase();
      const influencerId = influencerMap.get(handle);

      if (!influencerId) {
        skipped++;
        continue;
      }

      const originalUrl =
        story.url || story.mediaUrl || story.videoUrl || "";
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

      const sourceMediaUrl = story.videoUrl || story.mediaUrl || "";
      if (!sourceMediaUrl) {
        skipped++;
        continue;
      }

      const uploadResult = await downloadAndUpload(
        supabase,
        sourceMediaUrl,
        handle
      );
      if (!uploadResult) {
        errors.push(`Failed to download media for ${handle}: ${originalUrl}`);
        continue;
      }

      // Upload thumbnail separately if it's a video
      let thumbnailUrl: string | undefined;
      if (story.videoUrl && story.thumbnailUrl) {
        const thumbResult = await downloadAndUpload(
          supabase,
          story.thumbnailUrl,
          handle
        );
        thumbnailUrl = thumbResult?.storedUrl;
      }

      const contentType = story.videoUrl
        ? "story"
        : story.type?.toLowerCase() === "reel"
        ? "reel"
        : story.type?.toLowerCase() === "post"
        ? "post"
        : "story";

      const postedAt =
        story.takenAt || story.timestamp
          ? new Date(
              story.takenAt || story.timestamp || ""
            ).toISOString()
          : null;

      // Try to find active campaign for this influencer during posted_at
      let campaignId: string | null = null;
      if (postedAt) {
        const { data: activeCampaign } = await supabase
          .from("campaign_influencers")
          .select("campaign_id, campaigns!inner(start_date, end_date, status)")
          .eq("influencer_id", influencerId)
          .limit(1)
          .maybeSingle();

        if (activeCampaign) {
          campaignId = activeCampaign.campaign_id;
        }
      }

      const { error: insertError } = await supabase.from("content").insert({
        influencer_id: influencerId,
        type: contentType,
        media_url: uploadResult.storedUrl,
        original_url: originalUrl,
        thumbnail_url: thumbnailUrl || null,
        caption: story.caption || null,
        posted_at: postedAt,
        campaign_id: campaignId,
        metadata: {
          mentions: story.mentions || [],
          stickers: story.stickers || [],
        },
      });

      if (insertError) {
        // Unique constraint violation means duplicate - skip silently
        if (insertError.code === "23505") {
          skipped++;
        } else {
          errors.push(
            `Insert error for ${handle}: ${insertError.message}`
          );
        }
        continue;
      }

      processed++;
    } catch (err: any) {
      errors.push(`Error processing story: ${err.message}`);
    }
  }

  return { processed, skipped, errors };
}

// GET handler for Vercel cron
export async function GET(request: NextRequest) {
  // Verify cron secret if configured
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

  // Fetch all influencer handles
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

  if (!influencers || influencers.length === 0) {
    return NextResponse.json({ message: "No influencers found", results: [] });
  }

  // Build handle -> id map (case-insensitive)
  const influencerMap = new Map<string, string>();
  for (const inf of influencers) {
    influencerMap.set(inf.instagram_handle.toLowerCase(), inf.id);
  }

  const handles = influencers.map((i) => i.instagram_handle);
  const allResults: {
    batch: number;
    processed: number;
    skipped: number;
    errors: string[];
  }[] = [];

  // Process in batches
  for (let i = 0; i < handles.length; i += BATCH_SIZE) {
    const batch = handles.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;

    try {
      const run = await apify
        .actor("apify/instagram-story-scraper")
        .call({
          usernames: batch,
          resultsLimit: 50,
        });

      const { items } = await apify
        .dataset(run.defaultDatasetId)
        .listItems();

      const result = await processStories(
        supabase,
        items as StoryResult[],
        influencerMap
      );

      allResults.push({ batch: batchNum, ...result });
    } catch (err: any) {
      console.error(`Batch ${batchNum} failed:`, err.message);
      allResults.push({
        batch: batchNum,
        processed: 0,
        skipped: 0,
        errors: [`Batch failed: ${err.message}`],
      });
    }
  }

  const totalProcessed = allResults.reduce((s, r) => s + r.processed, 0);
  const totalSkipped = allResults.reduce((s, r) => s + r.skipped, 0);
  const totalErrors = allResults.flatMap((r) => r.errors);

  return NextResponse.json({
    message: `Scrape complete: ${totalProcessed} new items, ${totalSkipped} skipped`,
    totalProcessed,
    totalSkipped,
    totalErrors: totalErrors.length,
    results: allResults,
  });
}
