"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Search, Send } from "lucide-react";

// Partnership ads access panel: send account-level partnership requests to
// creators (they approve in the Instagram app) and track statuses. Meta is
// the source of truth — statuses come from branded_content_ad_permissions
// on every load; approved creators appear in the Ad Launcher's partner
// picker automatically.

interface PermissionRow {
  creator_username: string | null;
  creator_ig_id: string | null;
  permission_status: string;
  permission_url: string | null;
  influencer: { id: string; name: string; profile_photo_url: string | null } | null;
}

interface Suggestion {
  id: string;
  name: string;
  instagram_handle: string;
  profile_photo_url: string | null;
}

const STATUS_STYLE: Record<string, string> = {
  APPROVED: "bg-green-50 text-green-700 border-green-200",
  PENDING: "bg-amber-50 text-amber-700 border-amber-200",
  REVOKED: "bg-red-50 text-red-600 border-red-200",
};

function statusChip(status: string) {
  const cls = STATUS_STYLE[status] || "bg-gray-50 text-gray-500 border-gray-200";
  const label = status.charAt(0) + status.slice(1).toLowerCase();
  return <span className={`text-[11px] px-2 py-0.5 rounded-full border ${cls}`}>{label}</span>;
}

function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="text-[11px] text-gray-400 hover:text-gray-700 underline flex-shrink-0"
      title="Copy the Instagram approval link to DM them"
      onClick={() => {
        navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}

export function PartnersPanel() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [permissions, setPermissions] = useState<PermissionRow[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sending, setSending] = useState<string | null>(null);
  const [confirmHandle, setConfirmHandle] = useState<string | null>(null);
  const [justSent, setJustSent] = useState<Set<string>>(new Set());
  const loadedOnce = useRef(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ads/partners");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setPermissions(data.permissions || []);
      setSuggestions(data.suggestions || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && !loadedOnce.current) {
      loadedOnce.current = true;
      load();
    }
  }, [open]);

  async function sendRequest(handle: string) {
    const clean = handle.trim().replace(/^@+/, "").toLowerCase();
    if (!clean) return;
    setSending(clean);
    setError(null);
    try {
      const res = await fetch("/api/ads/partners/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instagram_handle: clean }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setJustSent((prev) => new Set(prev).add(clean));
      setQuery("");
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSending(null);
    }
  }

  const q = query.trim().replace(/^@+/, "").toLowerCase();
  const matchedSuggestions = useMemo(() => {
    if (!q) return suggestions.slice(0, 6);
    return suggestions
      .filter(
        (s) =>
          s.instagram_handle.toLowerCase().includes(q) ||
          s.name.toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [q, suggestions]);

  const validFreeHandle = /^[a-z0-9._]{1,30}$/.test(q);

  return (
    <div className="mb-5 bg-white border rounded-xl">
      <button
        className="w-full flex items-center justify-between px-5 py-4 text-left"
        onClick={() => setOpen(!open)}
      >
        <div>
          <div className="text-sm font-semibold text-gray-900">Partnership ads access</div>
          <div className="text-xs text-gray-500 mt-0.5">
            Request permission to run ads with a creator&rsquo;s handle — they approve in the Instagram app.
          </div>
        </div>
        <span className="text-gray-400 text-sm">{open ? "Hide" : "Show"}</span>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4 border-t pt-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search whitelisters or type any @handle…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button
              onClick={() => setConfirmHandle(q)}
              disabled={!validFreeHandle || sending !== null}
              title="Send a request to this handle"
            >
              {sending === q ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
              Send request
            </Button>
            <Button variant="outline" onClick={load} disabled={loading} title="Refresh statuses">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>

          {confirmHandle && (
            <div className="flex items-center gap-3 border border-amber-200 bg-amber-50 rounded-md px-3 py-2.5">
              <span className="flex-1 text-sm text-amber-800">
                Send a partnership request to <span className="font-medium">@{confirmHandle}</span>? Meta can&rsquo;t
                preview accounts from here — double-check the spelling. It must be a business or creator account
                (personal accounts are rejected).
              </span>
              <Button
                size="sm"
                disabled={sending !== null}
                onClick={async () => {
                  const h = confirmHandle;
                  setConfirmHandle(null);
                  await sendRequest(h);
                }}
              >
                {sending === confirmHandle ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Confirm & send"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmHandle(null)}>
                Cancel
              </Button>
            </div>
          )}

          {matchedSuggestions.length > 0 && (
            <div className="border rounded-md divide-y">
              <div className="px-3 py-1.5 text-[11px] uppercase tracking-wide text-gray-400">
                Whitelisters without access
              </div>
              {matchedSuggestions.map((s) => {
                const handle = s.instagram_handle.toLowerCase();
                const sent = justSent.has(handle);
                return (
                  <div key={s.id} className="flex items-center gap-3 px-3 py-2">
                    {s.profile_photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.profile_photo_url} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-[11px] text-gray-500 flex-shrink-0">
                        {s.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm truncate">{s.name}</span>
                      <span className="block text-xs text-gray-500 truncate">@{s.instagram_handle}</span>
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={sent || sending !== null}
                      onClick={() => sendRequest(s.instagram_handle)}
                    >
                      {sending === handle ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : sent ? (
                        "Sent"
                      ) : (
                        "Send request"
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          {error && <div className="text-sm text-red-600">{error}</div>}

          <div>
            <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-1.5">
              Access statuses
            </div>
            {loading && permissions.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-gray-400 py-3">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading from Meta…
              </div>
            ) : permissions.length === 0 ? (
              <div className="text-sm text-gray-400 border border-dashed rounded-md px-3 py-4 text-center">
                No partnership requests yet.
              </div>
            ) : (
              <div className="border rounded-md divide-y">
                {permissions.map((p, i) => (
                  <div key={`${p.creator_ig_id || p.creator_username || i}`} className="flex items-center gap-3 px-3 py-2">
                    {p.influencer?.profile_photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.influencer.profile_photo_url} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-[11px] text-gray-500 flex-shrink-0">
                        {(p.influencer?.name || p.creator_username || "?").charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm truncate">
                        {p.influencer?.name || (p.creator_username ? `@${p.creator_username}` : p.creator_ig_id)}
                      </span>
                      {p.influencer && p.creator_username && (
                        <span className="block text-xs text-gray-500 truncate">@{p.creator_username}</span>
                      )}
                    </span>
                    {p.permission_url && p.permission_status !== "APPROVED" && (
                      <CopyLinkButton url={p.permission_url} />
                    )}
                    {statusChip(p.permission_status)}
                  </div>
                ))}
              </div>
            )}
            <div className="text-xs text-gray-400 mt-2">
              Approved creators show up in the ad builder&rsquo;s partnership picker automatically — you can run ads with their handle even if they&rsquo;ve never had an ad before.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
