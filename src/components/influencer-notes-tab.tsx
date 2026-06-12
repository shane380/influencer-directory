"use client";

import { useState, useEffect, useCallback } from "react";
import { Pin, Pencil, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InfluencerNote } from "@/types/database";

interface Props {
  influencerId: string;
  // Called after a note is posted or the summary is edited, so the parent
  // (e.g. the campaign table) can refresh its preview text.
  onNotesChanged?: () => void;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p.charAt(0))
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function InfluencerNotesTab({ influencerId, onNotesChanged }: Props) {
  const [summary, setSummary] = useState<string | null>(null);
  const [activity, setActivity] = useState<InfluencerNote[]>([]);
  const [loading, setLoading] = useState(true);

  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [savingSummary, setSavingSummary] = useState(false);

  const [noteDraft, setNoteDraft] = useState("");
  const [posting, setPosting] = useState(false);

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/influencers/${influencerId}/notes`);
      if (res.ok) {
        const data = await res.json();
        setSummary(data.summary ?? null);
        setActivity(data.activity || []);
      }
    } catch (err) {
      console.error("Failed to load notes:", err);
    } finally {
      setLoading(false);
    }
  }, [influencerId]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  async function handleSaveSummary() {
    setSavingSummary(true);
    try {
      const res = await fetch(`/api/influencers/${influencerId}/notes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary: summaryDraft.trim() || null }),
      });
      if (res.ok) {
        setEditingSummary(false);
        await fetchNotes();
        onNotesChanged?.();
      }
    } catch (err) {
      console.error("Failed to save summary:", err);
    } finally {
      setSavingSummary(false);
    }
  }

  async function handlePostNote() {
    const body = noteDraft.trim();
    if (!body) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/influencers/${influencerId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (res.ok) {
        setNoteDraft("");
        await fetchNotes();
        onNotesChanged?.();
      }
    } catch (err) {
      console.error("Failed to post note:", err);
    } finally {
      setPosting(false);
    }
  }

  const noteCount = activity.filter((a) => a.type === "note").length;

  if (loading) {
    return <div className="p-6 text-center text-gray-500">Loading notes...</div>;
  }

  return (
    <div className="p-4 space-y-6">
      {/* Pinned summary */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Pin className="h-4 w-4 text-purple-600" />
            <span className="text-sm font-semibold text-gray-900">Pinned summary</span>
          </div>
          {!editingSummary && (
            <button
              type="button"
              onClick={() => {
                setSummaryDraft(summary || "");
                setEditingSummary(true);
              }}
              className="flex items-center gap-1 text-xs font-medium text-purple-600 hover:text-purple-700"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
          )}
        </div>

        {editingSummary ? (
          <div className="space-y-2">
            <textarea
              value={summaryDraft}
              onChange={(e) => setSummaryDraft(e.target.value)}
              rows={4}
              autoFocus
              placeholder="Who is this person? Add the context anyone reaching out should know…"
              className="w-full rounded-xl border border-purple-100 bg-purple-50/40 px-4 py-3 text-sm text-gray-700 leading-relaxed focus:outline-none focus:ring-2 focus:ring-purple-200"
            />
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" onClick={handleSaveSummary} disabled={savingSummary}>
                {savingSummary ? "Saving..." : "Save"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setEditingSummary(false)}
                disabled={savingSummary}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : summary ? (
          <div className="rounded-xl border border-purple-100 bg-purple-50/40 px-4 py-3 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
            {summary}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-gray-200 px-4 py-3 text-sm text-gray-400">
            No summary yet. Click Edit to add the &ldquo;who is this person&rdquo; context.
          </div>
        )}
      </div>

      {/* Activity log */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900">Activity</span>
          {noteCount > 0 && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
              {noteCount} {noteCount === 1 ? "note" : "notes"}
            </span>
          )}
        </div>

        {activity.length === 0 ? (
          <p className="text-sm text-gray-400">No notes yet — add the first one below.</p>
        ) : (
          <div className="space-y-5">
            {activity.map((entry) => (
              <div key={entry.id} className="flex gap-3">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-purple-100 text-xs font-medium text-purple-700">
                  {initials(entry.author_name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold text-gray-900">{entry.author_name}</span>
                    <span className="text-xs text-gray-400 tabular-nums">{formatDate(entry.created_at)}</span>
                  </div>
                  {entry.type === "summary_edit" ? (
                    <p className="text-sm italic text-gray-400">{entry.body}</p>
                  ) : (
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{entry.body}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="flex items-center gap-2 pt-2">
        <MessageCircle className="h-5 w-5 flex-shrink-0 text-gray-300" />
        <input
          type="text"
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handlePostNote();
            }
          }}
          placeholder="Add a note for the team…"
          className="flex-1 rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-200"
        />
        <Button type="button" size="sm" onClick={handlePostNote} disabled={posting || !noteDraft.trim()}>
          {posting ? "Posting..." : "Post"}
        </Button>
      </div>
    </div>
  );
}
