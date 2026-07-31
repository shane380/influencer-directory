"use client";

import { useEffect, useRef, useState } from "react";
import type { IgMediaItem, IgMediaResponse } from "@/types/meta-ads";
import { Images, Loader2, Play } from "lucide-react";

/** Grid of the brand IG account's organic posts (from /api/ads/ig-media). */
export function IgPostPicker({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (item: IgMediaItem) => void;
}) {
  const [items, setItems] = useState<IgMediaItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadedRef = useRef(false);

  const load = async (after: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const qs = after ? `?after=${encodeURIComponent(after)}` : "";
      const res = await fetch(`/api/ads/ig-media${qs}`);
      const data: IgMediaResponse & { error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load Instagram posts");
      setItems((prev) => (after ? [...prev, ...data.media] : data.media));
      setCursor(data.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Instagram posts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    load(null);
  }, []);

  if (error && items.length === 0) {
    return (
      <div className="text-[12.5px] text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
        {error}
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
        {items.map((item) => {
          const preview = item.mediaType === "VIDEO" ? item.thumbnailUrl : item.mediaUrl;
          const ineligible = item.eligibleToBoost === false;
          const selected = item.id === selectedId;
          return (
            <button
              key={item.id}
              onClick={() => !ineligible && onSelect(item)}
              disabled={ineligible}
              title={
                ineligible
                  ? "Meta says this post can't be promoted (e.g. copyrighted music)"
                  : item.caption || undefined
              }
              className={`relative aspect-square rounded-md overflow-hidden bg-gray-100 text-left ${
                selected
                  ? "ring-2 ring-gray-900 ring-offset-1"
                  : ineligible
                    ? "opacity-40 cursor-not-allowed"
                    : "hover:opacity-85"
              }`}
            >
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="w-full h-full flex items-center justify-center text-gray-400">
                  <Images className="h-5 w-5" />
                </span>
              )}
              {item.mediaType === "VIDEO" && (
                <span className="absolute top-1 right-1 bg-black/55 rounded-full p-1 text-white">
                  <Play className="h-2.5 w-2.5" />
                </span>
              )}
              {item.mediaType === "CAROUSEL_ALBUM" && (
                <span className="absolute top-1 right-1 bg-black/55 rounded-full p-1 text-white">
                  <Images className="h-2.5 w-2.5" />
                </span>
              )}
              {item.mediaProductType === "REELS" && (
                <span className="absolute bottom-1 left-1 bg-black/55 rounded px-1 py-px text-[9px] text-white uppercase tracking-wide">
                  Reel
                </span>
              )}
            </button>
          );
        })}
        {loading &&
          Array.from({ length: items.length ? 6 : 12 }).map((_, i) => (
            <div key={`s-${i}`} className="aspect-square rounded-md bg-gray-100 animate-pulse" />
          ))}
      </div>
      {!loading && items.length === 0 && (
        <p className="text-[12.5px] text-gray-400 py-6 text-center">No posts found</p>
      )}
      <div className="flex items-center gap-3 mt-2">
        {cursor && (
          <button
            onClick={() => load(cursor)}
            disabled={loading}
            className="text-[12px] text-gray-500 hover:text-gray-800 disabled:opacity-50 flex items-center gap-1"
          >
            {loading && <Loader2 className="h-3 w-3 animate-spin" />}
            Load more
          </button>
        )}
        {error && items.length > 0 && <span className="text-[11px] text-red-600">{error}</span>}
      </div>
    </div>
  );
}
