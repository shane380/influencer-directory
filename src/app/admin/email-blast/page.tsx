"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeft,
  Loader2,
  Mail,
  Users,
  Send,
  CheckCircle,
  AlertCircle,
  History,
} from "lucide-react";
import Link from "next/link";

interface Recipient {
  id: string;
  name: string;
  email: string;
  unsubscribed: boolean;
}

interface BlastSummary {
  id: string;
  subject: string;
  created_at: string;
  sent: number;
  failed: number;
}

interface SendResult {
  creatorId: string;
  email: string;
  status: string;
  error?: string;
}

const CHUNK_SIZE = 10;

export default function EmailBlastPage() {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [blasts, setBlasts] = useState<BlastSummary[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [subject, setSubject] = useState("");
  const [heading, setHeading] = useState("");
  const [body, setBody] = useState("");
  const [ctaText, setCtaText] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");

  const [testEmail, setTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<SendResult[] | null>(null);

  const supabase = createClient();
  const router = useRouter();

  const fetchData = useCallback(async () => {
    const res = await fetch("/api/admin/email-blast");
    if (res.ok) {
      const data = await res.json();
      setRecipients(data.recipients || []);
      setBlasts(data.blasts || []);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      const { data: profile } = await (supabase.from("profiles") as any)
        .select("is_admin, is_manager")
        .eq("id", user.id)
        .single();

      if (!profile?.is_admin && !profile?.is_manager) { router.push("/"); return; }
      setAuthorized(true);
      setTestEmail(user.email || "");
      await fetchData();
      setLoading(false);
    })();
  }, [supabase, router, fetchData]);

  const eligible = recipients.filter((r) => !r.unsubscribed);
  const unsubscribed = recipients.filter((r) => r.unsubscribed);
  const contentReady = subject.trim() && heading.trim() && body.trim();
  const allSelected = eligible.length > 0 && eligible.every((r) => selected.has(r.id));

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(eligible.map((r) => r.id)));
  };

  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const contentPayload = () => ({
    subject: subject.trim(),
    heading: heading.trim(),
    body: body.trim(),
    ctaText: ctaText.trim(),
    ctaUrl: ctaUrl.trim(),
  });

  const sendTest = async () => {
    if (!testEmail.trim() || !contentReady) return;
    setSendingTest(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/email-blast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...contentPayload(), test: true, to: testEmail.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setTestResult({ ok: true, message: `Test sent to ${testEmail.trim()}` });
      } else {
        setTestResult({ ok: false, message: data.error || "Failed to send test" });
      }
    } catch {
      setTestResult({ ok: false, message: "Failed to send test" });
    }
    setSendingTest(false);
  };

  const sendBlast = async () => {
    const ids = eligible.filter((r) => selected.has(r.id)).map((r) => r.id);
    if (ids.length === 0 || !contentReady) return;

    setConfirming(false);
    setSending(true);
    setResults(null);
    setProgress({ done: 0, total: ids.length });

    const allResults: SendResult[] = [];
    let blastId: string | null = null;

    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
      const chunk = ids.slice(i, i + CHUNK_SIZE);
      try {
        const res: Response = await fetch("/api/admin/email-blast", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...contentPayload(), creatorIds: chunk, blastId }),
        });
        const data: any = await res.json();
        if (res.ok) {
          blastId = data.blastId || blastId;
          allResults.push(...(data.results || []));
        } else {
          chunk.forEach((id) => {
            const r = recipients.find((x) => x.id === id);
            allResults.push({ creatorId: id, email: r?.email || "", status: "failed", error: data.error || "Request failed" });
          });
        }
      } catch {
        chunk.forEach((id) => {
          const r = recipients.find((x) => x.id === id);
          allResults.push({ creatorId: id, email: r?.email || "", status: "failed", error: "Request failed" });
        });
      }
      setProgress({ done: Math.min(i + CHUNK_SIZE, ids.length), total: ids.length });
    }

    setResults(allResults);
    setSending(false);
    setSelected(new Set());
    fetchData();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!authorized) return null;

  const selectedCount = eligible.filter((r) => selected.has(r.id)).length;
  const sentCount = results?.filter((r) => r.status === "sent").length || 0;
  const failedResults = results?.filter((r) => r.status !== "sent") || [];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors">
              <ArrowLeft className="h-4 w-4" />
              <span className="text-sm">Back</span>
            </Link>
            <h1 className="text-xl font-semibold text-gray-900">Email Blast</h1>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Compose */}
        <div className="bg-white rounded-lg border">
          <div className="p-6 border-b">
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-gray-700" />
              <div>
                <h2 className="text-lg font-medium text-gray-900">Compose</h2>
                <p className="text-sm text-gray-500 mt-1">
                  One-off email to your partners — restocks, launches, announcements. Use {"{{firstName}}"} to personalize. The branded layout (logo, footer, unsubscribe link) is added automatically.
                </p>
              </div>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Restock: our best sellers are back"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Heading</label>
              <input
                type="text"
                value={heading}
                onChange={(e) => setHeading(e.target.value)}
                placeholder="Back in Stock"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Body</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={8}
                placeholder={"Hi {{firstName}},\n\nGood news — the pieces you've been asking about are back in stock.\n\nUse [links like this](https://namaclo.com) anywhere in the text."}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black font-mono"
              />
              <p className="text-xs text-gray-400 mt-1">
                Blank line = new paragraph. Links: [text](https://url)
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Button text <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={ctaText}
                  onChange={(e) => setCtaText(e.target.value)}
                  placeholder="Shop the restock"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Button link <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="url"
                  value={ctaUrl}
                  onChange={(e) => setCtaUrl(e.target.value)}
                  placeholder="https://namaclo.com/collections/new"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black"
                />
              </div>
            </div>

            {/* Test send */}
            <div className="pt-4 border-t">
              <label className="block text-sm font-medium text-gray-700 mb-1">Send a test first</label>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="you@namaclo.com"
                  className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black"
                />
                <button
                  onClick={sendTest}
                  disabled={sendingTest || !contentReady || !testEmail.trim()}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  {sendingTest ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Send test
                </button>
              </div>
              {testResult && (
                <p className={`flex items-center gap-1.5 text-sm mt-2 ${testResult.ok ? "text-green-600" : "text-red-600"}`}>
                  {testResult.ok ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                  {testResult.message}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Recipients */}
        <div className="bg-white rounded-lg border">
          <div className="p-6 border-b">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-gray-700" />
              <div>
                <h2 className="text-lg font-medium text-gray-900">Recipients</h2>
                <p className="text-sm text-gray-500 mt-1">
                  {eligible.length} active partner{eligible.length === 1 ? "" : "s"} can receive campaign emails
                  {unsubscribed.length > 0 && ` · ${unsubscribed.length} unsubscribed (excluded)`}
                </p>
              </div>
            </div>
          </div>
          <div className="divide-y divide-gray-100">
            <label className="flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-50">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="h-4 w-4 rounded border-gray-300 accent-black"
              />
              <span className="text-sm font-medium text-gray-900">Select all</span>
            </label>
            {eligible.map((r) => (
              <label key={r.id} className="flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={selected.has(r.id)}
                  onChange={() => toggleOne(r.id)}
                  className="h-4 w-4 rounded border-gray-300 accent-black"
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{r.name}</p>
                  <p className="text-xs text-gray-500 truncate">{r.email}</p>
                </div>
              </label>
            ))}
            {unsubscribed.map((r) => (
              <div key={r.id} className="flex items-center gap-3 p-4 opacity-50">
                <input type="checkbox" disabled className="h-4 w-4 rounded border-gray-300" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{r.name}</p>
                  <p className="text-xs text-gray-500 truncate">{r.email} · unsubscribed</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Send */}
        <div className="bg-white rounded-lg border p-6">
          {sending ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <Loader2 className="h-4 w-4 animate-spin" />
                Sending {progress.done}/{progress.total}… keep this page open.
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-black h-2 rounded-full transition-all"
                  style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          ) : confirming ? (
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-gray-700">
                Send <span className="font-semibold">&ldquo;{subject.trim()}&rdquo;</span> to{" "}
                <span className="font-semibold">{selectedCount} partner{selectedCount === 1 ? "" : "s"}</span>? This cannot be undone.
              </p>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => setConfirming(false)}
                  className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={sendBlast}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-black text-white rounded-md hover:bg-gray-800 transition-colors"
                >
                  <Send className="h-4 w-4" />
                  Confirm send
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-gray-500">
                {selectedCount > 0
                  ? `${selectedCount} partner${selectedCount === 1 ? "" : "s"} selected`
                  : "Select recipients above"}
              </p>
              <button
                onClick={() => setConfirming(true)}
                disabled={selectedCount === 0 || !contentReady}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-black text-white rounded-md hover:bg-gray-800 disabled:opacity-50 transition-colors"
              >
                <Send className="h-4 w-4" />
                Send to {selectedCount || "…"} partner{selectedCount === 1 ? "" : "s"}
              </button>
            </div>
          )}

          {results && (
            <div className="mt-4 pt-4 border-t space-y-2">
              <p className="flex items-center gap-1.5 text-sm text-green-600">
                <CheckCircle className="h-4 w-4" />
                Sent to {sentCount} partner{sentCount === 1 ? "" : "s"}
              </p>
              {failedResults.map((r) => (
                <p key={r.creatorId} className="flex items-center gap-1.5 text-sm text-red-600">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {r.email}: {r.error || r.status}
                </p>
              ))}
            </div>
          )}
        </div>

        {/* History */}
        {blasts.length > 0 && (
          <div className="bg-white rounded-lg border">
            <div className="p-6 border-b">
              <div className="flex items-center gap-3">
                <History className="h-5 w-5 text-gray-700" />
                <h2 className="text-lg font-medium text-gray-900">Recent blasts</h2>
              </div>
            </div>
            <div className="divide-y divide-gray-100">
              {blasts.map((b) => (
                <div key={b.id} className="p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{b.subject}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(b.created_at).toLocaleString()} · {b.sent} sent
                      {b.failed > 0 && ` · ${b.failed} failed/skipped`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
