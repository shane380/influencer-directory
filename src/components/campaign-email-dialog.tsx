"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CalendarClock, CheckCircle, Eye, Loader2, Send, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// Compose an email to the people in a campaign: send now or schedule it.
// Mirrors the partner Email Blast page, scoped to one campaign's roster.

type Audience = "all" | "submitted" | "not_submitted" | "selected";

interface Recipient {
  influencerId: string;
  name: string;
  email: string | null;
  submitted: boolean;
  unsubscribed: boolean;
}

interface Blast {
  id: string;
  subject: string;
  audience: Audience | null;
  status: "scheduled" | "sending" | "sent" | "cancelled";
  scheduled_for: string | null;
  sent_at: string | null;
  created_at: string;
  sent: number;
  failed: number;
  skipped: number;
}

interface SendResult {
  influencerId: string;
  email: string;
  status: string;
  error?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  campaignId: string;
  campaignName: string;
  // Influencer ids ticked in the campaign table, offered as an audience.
  selectedInfluencerIds: string[];
  defaultTestEmail?: string;
}

const TEMPLATES = [
  {
    label: "Event confirmation",
    subject: "You're confirmed for {{eventDate}}",
    heading: "You're on the list",
    body:
      "Hi {{firstName}},\n\nYour spot is confirmed, and your outfit will be waiting for you when you arrive.\n\n{{eventDate}} at {{eventTime}}\n{{eventLocation}}\n\nWe can't wait to see you there.",
  },
  {
    label: "Event reminder",
    subject: "See you {{eventDate}}",
    heading: "Almost time",
    body:
      "Hi {{firstName}},\n\nA quick reminder that we're seeing you soon.\n\n{{eventDate}} at {{eventTime}}\n{{eventLocation}}\n\nReply to this email if anything has changed on your end.",
  },
];

const AUDIENCE_LABELS: Record<Audience, string> = {
  all: "Everyone in this campaign",
  submitted: "Submitted their selects",
  not_submitted: "Haven't submitted yet",
  selected: "Selected in the table",
};

const inputClass =
  "w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black";

function formatWhen(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

// Value for <input type="datetime-local"> in the browser's own timezone.
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function CampaignEmailDialog({ open, onClose, campaignId, campaignName, selectedInfluencerIds, defaultTestEmail }: Props) {
  const endpoint = `/api/campaigns/${campaignId}/email-blast`;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [blasts, setBlasts] = useState<Blast[]>([]);
  const [vars, setVars] = useState<Record<string, string>>({});
  const [eventMode, setEventMode] = useState(false);
  const [ready, setReady] = useState(true);

  const [subject, setSubject] = useState("");
  const [heading, setHeading] = useState("");
  const [body, setBody] = useState("");
  const [ctaText, setCtaText] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [audience, setAudience] = useState<Audience>("all");
  const [showRecipients, setShowRecipients] = useState(false);

  const [when, setWhen] = useState<"now" | "later">("now");
  const [scheduleAt, setScheduleAt] = useState("");

  const [testEmail, setTestEmail] = useState("");
  const [busy, setBusy] = useState<"test" | "preview" | "send" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);
  const [results, setResults] = useState<SendResult[] | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(endpoint);
      const data = await res.json();
      if (!res.ok) {
        setLoadError(data.error || "Failed to load");
        return;
      }
      setLoadError(null);
      setRecipients(data.recipients || []);
      setBlasts(data.blasts || []);
      setVars(data.vars || {});
      setEventMode(!!data.eventMode);
      setReady(data.ready !== false);
    } catch {
      setLoadError("Failed to load");
    }
  }, [endpoint]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setNotice(null);
    setResults(null);
    setConfirming(false);
    setPreviewHtml(null);
    setTestEmail((prev) => prev || defaultTestEmail || "");
    setAudience(selectedInfluencerIds.length > 0 ? "selected" : "all");
    fetchData().finally(() => setLoading(false));
    // Only re-run when the dialog opens; the selection is read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fetchData]);

  const audienceRecipients = useMemo(() => {
    if (audience === "submitted") return recipients.filter((r) => r.submitted);
    if (audience === "not_submitted") return recipients.filter((r) => !r.submitted);
    if (audience === "selected") {
      const ids = new Set(selectedInfluencerIds);
      return recipients.filter((r) => ids.has(r.influencerId));
    }
    return recipients;
  }, [audience, recipients, selectedInfluencerIds]);

  const reachable = audienceRecipients.filter((r) => r.email && !r.unsubscribed);
  const excluded = audienceRecipients.length - reachable.length;
  const contentReady = !!(subject.trim() && heading.trim() && body.trim());
  const scheduleDate = when === "later" && scheduleAt ? new Date(scheduleAt) : null;
  const scheduleValid = when === "now" || (!!scheduleDate && scheduleDate.getTime() > Date.now() + 60_000);
  const canSend = ready && contentReady && scheduleValid && (when === "later" || reachable.length > 0);

  const content = () => ({
    subject: subject.trim(),
    heading: heading.trim(),
    body: body.trim(),
    ctaText: ctaText.trim(),
    ctaUrl: ctaUrl.trim(),
  });

  const post = async (payload: Record<string, unknown>) => {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...content(), ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  };

  const run = async (kind: "test" | "preview" | "send", fn: () => Promise<void>) => {
    setBusy(kind);
    setNotice(null);
    try {
      await fn();
    } catch (err) {
      setNotice({ ok: false, message: err instanceof Error ? err.message : "Something went wrong" });
    }
    setBusy(null);
  };

  const showPreview = () =>
    run("preview", async () => {
      const data = await post({ action: "preview", previewName: reachable[0]?.name || "" });
      setPreviewHtml(data.html);
    });

  const sendTest = () =>
    run("test", async () => {
      await post({ action: "test", to: testEmail.trim() });
      setNotice({ ok: true, message: `Test sent to ${testEmail.trim()}` });
    });

  const send = () =>
    run("send", async () => {
      setConfirming(false);
      setResults(null);
      const data = await post({
        action: "send",
        audience,
        recipientIds: audience === "selected" ? selectedInfluencerIds : [],
        scheduledFor: scheduleDate ? scheduleDate.toISOString() : null,
      });
      if (data.scheduled) {
        setNotice({ ok: true, message: `Scheduled for ${formatWhen(scheduleDate!.toISOString())}` });
      } else {
        setResults(data.results || []);
        if (data.done === false) {
          setNotice({ ok: true, message: "Still sending — the rest will go out automatically within a few minutes." });
        }
      }
      // Clear the draft so the same email can't be sent twice by accident.
      setSubject("");
      setHeading("");
      setBody("");
      setCtaText("");
      setCtaUrl("");
      setPreviewHtml(null);
      await fetchData();
    });

  const cancelBlast = async (blastId: string) => {
    if (!window.confirm("Cancel this scheduled email?")) return;
    const res = await fetch(`${endpoint}?blastId=${blastId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setNotice({ ok: false, message: data.error || "Failed to cancel" });
    }
    await fetchData();
  };

  const applyTemplate = (t: (typeof TEMPLATES)[number]) => {
    if ((subject || heading || body) && !window.confirm("Replace what you've written with this template?")) return;
    setSubject(t.subject);
    setHeading(t.heading);
    setBody(t.body);
  };

  const sentCount = results?.filter((r) => r.status === "sent").length || 0;
  const problemResults = results?.filter((r) => r.status !== "sent") || [];
  const scheduled = blasts.filter((b) => b.status === "scheduled" || b.status === "sending");
  const past = blasts.filter((b) => b.status === "sent" || b.status === "cancelled");
  const audienceOptions = (Object.keys(AUDIENCE_LABELS) as Audience[]).filter(
    (a) => a !== "selected" || selectedInfluencerIds.length > 0,
  );
  const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent onClose={onClose} className="w-[94vw] max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Email campaign</DialogTitle>
          <DialogDescription>
            Email the people in {campaignName} — confirmations, reminders, updates. Send now or schedule it.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : loadError ? (
          <p className="py-8 text-sm text-red-600">{loadError}</p>
        ) : (
          <div className="space-y-5 mt-2">
            {!ready && (
              <p className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                Sending is off until the database migration for campaign emails has been run. Test sends and previews
                work in the meantime.
              </p>
            )}

            {/* Compose */}
            <div className="space-y-3">
              {eventMode && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-gray-500">Start from:</span>
                  {TEMPLATES.map((t) => (
                    <button
                      key={t.label}
                      type="button"
                      onClick={() => applyTemplate(t)}
                      className="rounded-full border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                <input className={inputClass} value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Heading</label>
                <input className={inputClass} value={heading} onChange={(e) => setHeading(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Body</label>
                <textarea
                  className={`${inputClass} font-mono`}
                  rows={9}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={"Hi {{firstName}},\n\n…"}
                />
                <p className="text-xs text-gray-400 mt-1">
                  Blank line = new paragraph. Links: [text](https://url). Fills in per person: {"{{firstName}}"},{" "}
                  {"{{campaignName}}"}
                  {eventMode && (
                    <>
                      , {"{{eventDate}}"} ({vars.eventDate || "not set"}), {"{{eventTime}}"} (
                      {vars.eventTime || "not set"}), {"{{eventLocation}}"} ({vars.eventLocation ? "set" : "not set"})
                    </>
                  )}
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Button text <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <input className={inputClass} value={ctaText} onChange={(e) => setCtaText(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Button link <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <input
                    className={inputClass}
                    type="url"
                    value={ctaUrl}
                    onChange={(e) => setCtaUrl(e.target.value)}
                    placeholder="https://"
                  />
                </div>
              </div>
            </div>

            {/* Preview + test */}
            <div className="border-t pt-4 space-y-2">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={showPreview} disabled={!contentReady || busy !== null}>
                  {busy === "preview" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Eye className="h-4 w-4 mr-2" />}
                  Preview
                </Button>
                <input
                  className={`${inputClass} flex-1 min-w-[180px] !py-1.5`}
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="Send a test to…"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={sendTest}
                  disabled={!contentReady || !testEmail.trim() || busy !== null}
                >
                  {busy === "test" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                  Send test
                </Button>
              </div>
              {previewHtml && (
                <div className="relative rounded-md border">
                  <button
                    type="button"
                    onClick={() => setPreviewHtml(null)}
                    className="absolute right-2 top-2 rounded bg-white/90 p-1 text-gray-500 hover:text-gray-900"
                    aria-label="Close preview"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <iframe title="Email preview" sandbox="" srcDoc={previewHtml} className="h-[420px] w-full rounded-md" />
                </div>
              )}
            </div>

            {/* Audience */}
            <div className="border-t pt-4 space-y-2">
              <label className="block text-sm font-medium text-gray-700">Send to</label>
              <select
                className={inputClass}
                value={audience}
                onChange={(e) => setAudience(e.target.value as Audience)}
              >
                {audienceOptions.map((a) => (
                  <option key={a} value={a}>
                    {AUDIENCE_LABELS[a]}
                  </option>
                ))}
              </select>
              <p className="text-sm text-gray-500">
                {people(reachable.length)} will get this
                {excluded > 0 && ` · ${excluded} left out (no email or unsubscribed)`}
                {audienceRecipients.length > 0 && (
                  <>
                    {" · "}
                    <button type="button" className="underline" onClick={() => setShowRecipients((v) => !v)}>
                      {showRecipients ? "hide list" : "show list"}
                    </button>
                  </>
                )}
              </p>
              {when === "later" && audience !== "selected" && (
                <p className="text-xs text-gray-400">
                  The list is worked out again at send time, so anyone who joins this group before then is included.
                </p>
              )}
              {showRecipients && (
                <div className="max-h-40 overflow-y-auto rounded-md border divide-y divide-gray-100">
                  {audienceRecipients.map((r) => (
                    <div
                      key={r.influencerId}
                      className={`flex justify-between gap-3 px-3 py-1.5 text-xs ${
                        !r.email || r.unsubscribed ? "text-gray-400" : "text-gray-700"
                      }`}
                    >
                      <span className="truncate">{r.name}</span>
                      <span className="truncate">
                        {!r.email ? "no email" : r.unsubscribed ? `${r.email} · unsubscribed` : r.email}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* When */}
            <div className="border-t pt-4 space-y-2">
              <label className="block text-sm font-medium text-gray-700">When</label>
              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-700">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" className="accent-black" checked={when === "now"} onChange={() => setWhen("now")} />
                  Send now
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    className="accent-black"
                    checked={when === "later"}
                    onChange={() => {
                      setWhen("later");
                      if (!scheduleAt) {
                        const d = new Date(Date.now() + 60 * 60 * 1000);
                        d.setMinutes(0, 0, 0);
                        d.setHours(d.getHours() + 1);
                        setScheduleAt(toLocalInput(d));
                      }
                    }}
                  />
                  Schedule for later
                </label>
                {when === "later" && (
                  <input
                    type="datetime-local"
                    className={`${inputClass} !w-auto !py-1.5`}
                    value={scheduleAt}
                    min={toLocalInput(new Date())}
                    onChange={(e) => setScheduleAt(e.target.value)}
                  />
                )}
              </div>
              {when === "later" && (
                <p className={`text-xs ${scheduleValid ? "text-gray-400" : "text-red-600"}`}>
                  {scheduleValid
                    ? `Your local time (${formatWhen(scheduleDate!.toISOString())}). Goes out within about 5 minutes of it.`
                    : "Pick a time in the future."}
                </p>
              )}
            </div>

            {/* Send */}
            <div className="border-t pt-4 space-y-3">
              {busy === "send" ? (
                <p className="flex items-center gap-2 text-sm text-gray-700">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {when === "later" ? "Scheduling…" : `Sending to ${people(reachable.length)}… keep this open.`}
                </p>
              ) : confirming ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-gray-700">
                    {when === "later" ? "Schedule" : "Send"}{" "}
                    <span className="font-semibold">&ldquo;{subject.trim()}&rdquo;</span> to{" "}
                    <span className="font-semibold">{people(reachable.length)}</span>
                    {when === "later" ? ` for ${formatWhen(scheduleDate!.toISOString())}?` : "? This can't be undone."}
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>
                      Back
                    </Button>
                    <Button size="sm" onClick={send}>
                      {when === "later" ? "Confirm schedule" : "Confirm send"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-end">
                  <Button onClick={() => setConfirming(true)} disabled={!canSend || busy !== null}>
                    {when === "later" ? <CalendarClock className="h-4 w-4 mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                    {when === "later" ? "Schedule email" : `Send to ${people(reachable.length)}`}
                  </Button>
                </div>
              )}

              {notice && (
                <p className={`flex items-center gap-1.5 text-sm ${notice.ok ? "text-green-600" : "text-red-600"}`}>
                  {notice.ok ? <CheckCircle className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
                  {notice.message}
                </p>
              )}
              {results && (
                <div className="space-y-1">
                  <p className="flex items-center gap-1.5 text-sm text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    Sent to {people(sentCount)}
                  </p>
                  {problemResults.map((r) => (
                    <p key={r.influencerId} className="flex items-center gap-1.5 text-sm text-red-600">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      {r.email || "No email"}: {r.error || r.status}
                    </p>
                  ))}
                </div>
              )}
            </div>

            {/* Scheduled + history */}
            {(scheduled.length > 0 || past.length > 0) && (
              <div className="border-t pt-4 space-y-3">
                {scheduled.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-900 mb-1">Scheduled</h3>
                    <div className="rounded-md border divide-y divide-gray-100">
                      {scheduled.map((b) => (
                        <div key={b.id} className="flex items-center justify-between gap-3 px-3 py-2">
                          <div className="min-w-0">
                            <p className="text-sm text-gray-900 truncate">{b.subject}</p>
                            <p className="text-xs text-gray-500">
                              {b.status === "sending" ? "Sending now" : formatWhen(b.scheduled_for)}
                              {b.audience && ` · ${AUDIENCE_LABELS[b.audience]}`}
                            </p>
                          </div>
                          {b.status === "scheduled" && (
                            <Button variant="outline" size="sm" onClick={() => cancelBlast(b.id)}>
                              Cancel
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {past.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-900 mb-1">Sent</h3>
                    <div className="rounded-md border divide-y divide-gray-100">
                      {past.map((b) => (
                        <div key={b.id} className="px-3 py-2">
                          <p className="text-sm text-gray-900 truncate">{b.subject}</p>
                          <p className="text-xs text-gray-500">
                            {b.status === "cancelled"
                              ? `Cancelled · was scheduled for ${formatWhen(b.scheduled_for)}`
                              : `${formatWhen(b.sent_at || b.created_at)} · ${b.sent} sent`}
                            {b.failed > 0 && ` · ${b.failed} failed`}
                            {b.skipped > 0 && ` · ${b.skipped} skipped`}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
