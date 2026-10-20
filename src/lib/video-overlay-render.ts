/**
 * Renders an edited video — burned-in text, and optionally clips cut,
 * reordered and/or muted — entirely in the browser.
 *
 * Decoding and encoding go through WebCodecs (the browser's hardware video
 * encoder) via Mediabunny. The output keeps the source's resolution and frame
 * timing, copies the audio untouched, and encodes constant-quality H.264 far
 * above what Meta keeps after its own re-encode — so the burned-in file is
 * visually indistinguishable from the original. Text is drawn at the video's native
 * pixel size, never upscaled from the on-screen editor.
 */

import type { OverlayFont, TextOverlay, VideoEdit } from "@/types/meta-ads";
import { clipLength, outputDuration, overlayVisible } from "@/lib/video-edit";

/** CSS font shorthand pieces per overlay font — shared by the editor and the renderer. */
export const OVERLAY_FONTS: Record<
  OverlayFont,
  { label: string; weight: number; style: "normal" | "italic"; family: string }
> = {
  "sans-bold": {
    label: "Sans bold",
    weight: 700,
    style: "normal",
    family: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  },
  sans: {
    label: "Sans",
    weight: 400,
    style: "normal",
    family: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  },
  serif: { label: "Serif", weight: 400, style: "normal", family: 'Georgia, "Times New Roman", serif' },
  "serif-italic": {
    label: "Serif italic",
    weight: 400,
    style: "italic",
    family: 'Georgia, "Times New Roman", serif',
  },
};

/** Line height as a multiple of font size — the CSS layer uses the same value. */
export const OVERLAY_LINE_HEIGHT = 1.2;

/**
 * Draws overlays onto a canvas that holds a frame of the given size. With `t`
 * (output seconds), text outside its in/out time is skipped.
 */
export function drawOverlays(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  overlays: TextOverlay[],
  frameW: number,
  frameH: number,
  t?: number
) {
  for (const o of overlays) {
    const lines = o.text.split("\n");
    if (!o.text.trim()) continue;
    if (t !== undefined && !overlayVisible(o, t)) continue;
    const f = OVERLAY_FONTS[o.font] || OVERLAY_FONTS["sans-bold"];
    const px = o.size * frameW;
    const lineH = px * OVERLAY_LINE_HEIGHT;
    ctx.font = `${f.style} ${f.weight} ${px}px ${f.family}`;
    ctx.fillStyle = o.color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const top = o.y * frameH - (lines.length * lineH) / 2;
    lines.forEach((line, i) => {
      ctx.fillText(line, o.x * frameW, top + (i + 0.5) * lineH);
    });
  }
}

export function canBurnInText(): boolean {
  return typeof window !== "undefined" && "VideoEncoder" in window && "VideoDecoder" in window;
}

/**
 * Constant-quality H.264 quantizer (like x264's CRF; lower = better). 20 kept
 * every test clip at 40–45 dB PSNR against its source — visually lossless —
 * while letting file size follow the footage (~14 Mbps for 1080p30 iPhone
 * video, ~35 Mbps for grainy 1080p60).
 */
const QUANTIZER = 20;
/** Bitrate fallback where the encoder can't do quantizer mode: ~12 Mbps at 1080×1920×30. */
const BITS_PER_PIXEL_FRAME = 0.2;
/** AAC bitrate when cuts force an audio re-encode — transparent for speech and music. */
const AUDIO_BITRATE = 256_000;

type Mediabunny = typeof import("mediabunny");

/**
 * Renders `source` with its edit applied and returns an MP4 blob. Without an
 * edit (text only) the audio is copied untouched; cuts or mute re-assemble the
 * video clip by clip and re-encode the audio. `onProgress` receives 0–1.
 */
export async function renderEditedVideo(
  source: Blob,
  overlays: TextOverlay[],
  edit: VideoEdit | null | undefined,
  onProgress?: (p: number) => void
): Promise<Blob> {
  const mb = await import("mediabunny");
  const { ALL_FORMATS, BlobSource, BufferTarget, Input, Mp4OutputFormat, Output, Quality } = mb;

  // System fonts are always present, but make sure any web font has loaded
  // before the first frame is drawn.
  await document.fonts?.ready;

  const input = new Input({ source: new BlobSource(source), formats: ALL_FORMATS });
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error("No video track found");

  const w = track.displayWidth;
  const h = track.displayHeight;
  const stats = await track.computePacketStats(100).catch(() => null);
  const fps = stats?.averagePacketRate && stats.averagePacketRate > 0 ? stats.averagePacketRate : 30;
  const bitrate = Math.round(
    Math.min(40_000_000, Math.max(8_000_000, w * h * fps * BITS_PER_PIXEL_FRAME))
  );
  const quality = new Quality({ quantizer: QUANTIZER, bitrate });

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");

  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target: new BufferTarget(),
  });

  if (edit?.clips.length) {
    await renderClips(mb, input, track, output, canvas, ctx, overlays, edit, quality, onProgress);
  } else {
    await renderTextOnly(mb, input, output, canvas, ctx, overlays, quality, onProgress);
  }

  const buffer = (output.target as InstanceType<typeof BufferTarget>).buffer;
  if (!buffer) throw new Error("Render produced no output");
  return new Blob([buffer], { type: "video/mp4" });
}

/** Whole video, text only: transcode video through the overlay, copy audio packets. */
async function renderTextOnly(
  { Conversion }: Mediabunny,
  input: InstanceType<Mediabunny["Input"]>,
  output: InstanceType<Mediabunny["Output"]>,
  canvas: OffscreenCanvas,
  ctx: OffscreenCanvasRenderingContext2D,
  overlays: TextOverlay[],
  quality: InstanceType<Mediabunny["Quality"]>,
  onProgress?: (p: number) => void
) {
  const { width: w, height: h } = canvas;
  let firstTs: number | null = null;
  const conversion = await Conversion.init({
    input,
    output,
    tracks: "primary",
    video: {
      codec: "avc",
      quality,
      // Bake rotation into the pixels so the overlay lands where it was placed.
      allowTransformationMetadata: false,
      forceTranscode: true,
      processedWidth: w,
      processedHeight: h,
      process: (sample) => {
        if (firstTs === null) firstTs = sample.timestamp;
        ctx.clearRect(0, 0, w, h);
        sample.draw(ctx, 0, 0, w, h);
        drawOverlays(ctx, overlays, w, h, sample.timestamp - firstTs);
        return canvas;
      },
    },
    // Audio is copied packet-for-packet whenever the container allows it.
    audio: {},
    showWarnings: false,
  });
  if (!conversion.isValid) {
    const reason = conversion.discardedTracks.map((d) => d.reason).join(", ");
    throw new Error(`This browser can't re-encode this video${reason ? ` (${reason})` : ""}`);
  }
  if (onProgress) conversion.onProgress = (p) => onProgress(p);
  await conversion.execute();
}

/**
 * Cuts: walk the clips in order, decoding each source range and laying its
 * frames (and audio) back to back on the output timeline.
 */
async function renderClips(
  { AudioSampleSink, AudioSampleSource, CanvasSource, VideoSampleSink, canEncodeAudio }: Mediabunny,
  input: InstanceType<Mediabunny["Input"]>,
  track: InstanceType<Mediabunny["InputVideoTrack"]>,
  output: InstanceType<Mediabunny["Output"]>,
  canvas: OffscreenCanvas,
  ctx: OffscreenCanvasRenderingContext2D,
  overlays: TextOverlay[],
  edit: VideoEdit,
  quality: InstanceType<Mediabunny["Quality"]>,
  onProgress?: (p: number) => void
) {
  const { width: w, height: h } = canvas;
  const clips = edit.clips.filter((c) => clipLength(c) > 0);
  const total = outputDuration(clips);
  if (total <= 0) throw new Error("The edit has no video left in it");

  const videoSource = new CanvasSource(canvas, { codec: "avc", quality });
  output.addVideoTrack(videoSource);

  const audioTrack = edit.muted ? null : await input.getPrimaryAudioTrack();
  let audioSource: InstanceType<Mediabunny["AudioSampleSource"]> | null = null;
  if (audioTrack) {
    if (!(await canEncodeAudio("aac", { bitrate: AUDIO_BITRATE }))) {
      throw new Error("This browser can't re-encode audio — mute the video or use Chrome");
    }
    audioSource = new AudioSampleSource({ codec: "aac", bitrate: AUDIO_BITRATE });
    output.addAudioTrack(audioSource);
  }

  await output.start();
  const videoSink = new VideoSampleSink(track);
  const audioSink = audioTrack ? new AudioSampleSink(audioTrack) : null;

  let offset = 0;
  for (const clip of clips) {
    const len = clipLength(clip);

    // Video: the first sample may start before clip.start (it's the frame on
    // screen at that moment) — it's pinned to the clip's first instant.
    for await (const sample of videoSink.samples(clip.start, clip.end)) {
      const within = Math.max(0, sample.timestamp - clip.start);
      if (within >= len) {
        sample.close();
        break;
      }
      const dur = Math.min(sample.duration || 1 / 30, len - within);
      const t = offset + within;
      ctx.clearRect(0, 0, w, h);
      sample.draw(ctx, 0, 0, w, h);
      sample.close();
      drawOverlays(ctx, overlays, w, h, t);
      await videoSource.add(t, dur);
      onProgress?.(Math.min(1, (offset + within + dur) / total));
    }

    // Audio: trim the boundary samples to the exact clip edges so cuts don't
    // overlap or leave gaps.
    if (audioSink && audioSource) {
      for await (const sample of audioSink.samples(clip.start, clip.end)) {
        const sr = sample.sampleRate;
        const from = Math.max(0, Math.round((clip.start - sample.timestamp) * sr));
        const to = Math.min(sample.numberOfFrames, Math.round((clip.end - sample.timestamp) * sr));
        if (to > from) {
          const piece = sample.trim(from, to);
          piece.setTimestamp(offset + Math.max(0, piece.timestamp - clip.start));
          await audioSource.add(piece);
          piece.close();
        }
        sample.close();
      }
    }

    offset += len;
  }

  videoSource.close();
  audioSource?.close();
  await output.finalize();
}
