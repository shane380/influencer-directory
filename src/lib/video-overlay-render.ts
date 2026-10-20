/**
 * Burns static text overlays into a video, entirely in the browser.
 *
 * Decoding and encoding go through WebCodecs (the browser's hardware video
 * encoder) via Mediabunny. The output keeps the source's resolution and frame
 * timing, copies the audio untouched, and encodes constant-quality H.264 far
 * above what Meta keeps after its own re-encode — so the burned-in file is
 * visually indistinguishable from the original. Text is drawn at the video's native
 * pixel size, never upscaled from the on-screen editor.
 */

import type { OverlayFont, TextOverlay } from "@/types/meta-ads";

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

/** Draws overlays onto a canvas that holds a frame of the given size. */
export function drawOverlays(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  overlays: TextOverlay[],
  frameW: number,
  frameH: number
) {
  for (const o of overlays) {
    const lines = o.text.split("\n");
    if (!o.text.trim()) continue;
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

/**
 * Renders `source` with the overlays burned in and returns an MP4 blob.
 * `onProgress` receives 0–1.
 */
export async function renderWithOverlays(
  source: Blob,
  overlays: TextOverlay[],
  onProgress?: (p: number) => void
): Promise<Blob> {
  const {
    ALL_FORMATS,
    BlobSource,
    BufferTarget,
    Conversion,
    Input,
    Mp4OutputFormat,
    Output,
    Quality,
  } = await import("mediabunny");

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

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");

  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target: new BufferTarget(),
  });

  const conversion = await Conversion.init({
    input,
    output,
    tracks: "primary",
    video: {
      codec: "avc",
      quality: new Quality({ quantizer: QUANTIZER, bitrate }),
      // Bake rotation into the pixels so the overlay lands where it was placed.
      allowTransformationMetadata: false,
      forceTranscode: true,
      processedWidth: w,
      processedHeight: h,
      process: (sample) => {
        ctx.clearRect(0, 0, w, h);
        sample.draw(ctx, 0, 0, w, h);
        drawOverlays(ctx, overlays, w, h);
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

  const buffer = (output.target as InstanceType<typeof BufferTarget>).buffer;
  if (!buffer) throw new Error("Render produced no output");
  return new Blob([buffer], { type: "video/mp4" });
}
