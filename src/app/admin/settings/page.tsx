"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft, Loader2, Mail, Globe, X, Plus, Send, CheckCircle, AlertCircle } from "lucide-react";
import Link from "next/link";

interface TriggerConfig {
  key: string;
  name: string;
  description: string;
  recipient: string;
  event: string;
  wiredUp: boolean;
}

const EMAIL_TRIGGERS: TriggerConfig[] = [
  {
    key: "campaign_assigned",
    name: "Campaign Assigned",
    description: "Sent to partners when a new campaign is published and assigned to them.",
    recipient: "Partner",
    event: "Campaign published with assignments",
    wiredUp: true,
  },
  {
    key: "content_approved",
    name: "Content Approved",
    description: "Sent to partners when their content submission is approved by the team.",
    recipient: "Partner",
    event: "Admin approves a content submission",
    wiredUp: true,
  },
  {
    key: "revision_requested",
    name: "Revision Requested",
    description: "Sent to partners when a revision is requested on their content submission, including the feedback.",
    recipient: "Partner",
    event: "Admin requests revision on a submission",
    wiredUp: true,
  },
  {
    key: "partner_invite",
    name: "Partner Invite",
    description: "Sent to new partners with a link to view their offer and sign up.",
    recipient: "Partner",
    event: "Admin creates a partner invite",
    wiredUp: false,
  },
];

export default function AdminSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [triggers, setTriggers] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [suspendedCountries, setSuspendedCountries] = useState<string[]>([]);
  const [newCountry, setNewCountry] = useState("");
  const [savingCountries, setSavingCountries] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const supabase = createClient();
  const router = useRouter();

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/settings");
      if (res.ok) {
        const data = await res.json();
        setTriggers(data.email_triggers || {});
        setSuspendedCountries(data.suspended_shipping_countries || []);
      }
    } catch {}
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
      setIsAdmin(true);
      await fetchSettings();
      setLoading(false);
    })();
  }, [supabase, router, fetchSettings]);

  const toggleTrigger = async (key: string) => {
    const newValue = !triggers[key];
    const updated = { ...triggers, [key]: newValue };
    setTriggers(updated);
    setSaving(key);
    try {
      await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_triggers: updated }),
      });
    } catch {
      // Revert on failure
      setTriggers(triggers);
    }
    setSaving(null);
  };

  const saveCountries = async (updated: string[]) => {
    setSavingCountries(true);
    const previous = suspendedCountries;
    setSuspendedCountries(updated);
    try {
      await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suspended_shipping_countries: updated }),
      });
    } catch {
      setSuspendedCountries(previous);
    }
    setSavingCountries(false);
  };

  const addCountry = () => {
    const trimmed = newCountry.trim();
    if (!trimmed) return;
    if (suspendedCountries.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      setNewCountry("");
      return;
    }
    const updated = [...suspendedCountries, trimmed].sort((a, b) => a.localeCompare(b));
    setNewCountry("");
    saveCountries(updated);
  };

  const removeCountry = (country: string) => {
    saveCountries(suspendedCountries.filter((c) => c !== country));
  };

  const sendTestEmailFn = async () => {
    const to = testEmail.trim();
    if (!to) return;
    setSendingTest(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          subject: "Nama Partners - Test Email",
          html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:40px 20px;">
            <h2 style="margin:0 0 16px;font-size:20px;">Test Email</h2>
            <p style="margin:0 0 12px;color:#333;font-size:15px;">This is a test email from your Nama Partners app.</p>
            <p style="margin:0 0 12px;color:#333;font-size:15px;">If you're reading this, your Resend integration is working correctly.</p>
            <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0;" />
            <p style="margin:0;color:#999;font-size:13px;">Sent from App Settings at ${new Date().toLocaleString()}</p>
          </div>`,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setTestResult({ ok: true, message: `Test email sent to ${to}` });
      } else {
        setTestResult({ ok: false, message: data.error || "Failed to send" });
      }
    } catch (err) {
      setTestResult({ ok: false, message: "Network error — could not reach server" });
    }
    setSendingTest(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors">
              <ArrowLeft className="h-4 w-4" />
              <span className="text-sm">Back</span>
            </Link>
            <h1 className="text-xl font-semibold text-gray-900">App Settings</h1>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Email Notifications */}
        <div className="bg-white rounded-lg border">
          <div className="p-6 border-b">
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-gray-700" />
              <div>
                <h2 className="text-lg font-medium text-gray-900">Email Notifications</h2>
                <p className="text-sm text-gray-500 mt-1">Events that trigger emails to partners via Resend.</p>
              </div>
            </div>
          </div>

          <div className="divide-y divide-gray-100">
            {EMAIL_TRIGGERS.map((trigger) => {
              const isOn = !!triggers[trigger.key];
              const isWired = trigger.wiredUp;
              return (
                <div key={trigger.key} className="p-5 flex items-start gap-4">
                  <div className="mt-0.5 shrink-0">
                    <button
                      onClick={() => toggleTrigger(trigger.key)}
                      disabled={saving === trigger.key}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                        isOn ? "bg-green-500" : "bg-gray-300"
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow-sm ${
                          isOn ? "translate-x-[18px]" : "translate-x-[3px]"
                        }`}
                      />
                    </button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{trigger.name}</span>
                      {isOn ? (
                        <span className="text-[10px] tracking-wider uppercase px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
                          Active
                        </span>
                      ) : !isWired ? (
                        <span className="text-[10px] tracking-wider uppercase px-2 py-0.5 rounded-full bg-gray-50 text-gray-500 border border-gray-200">
                          Not wired up
                        </span>
                      ) : (
                        <span className="text-[10px] tracking-wider uppercase px-2 py-0.5 rounded-full bg-gray-50 text-gray-500 border border-gray-200">
                          Off
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mt-1">{trigger.description}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                      <span>To: {trigger.recipient}</span>
                      <span>Trigger: {trigger.event}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-4 bg-gray-50 border-t rounded-b-lg">
            <p className="text-xs text-gray-400">
              Emails are sent from <span className="font-medium text-gray-500">partners@partners.namaclo.com</span> via Resend. Partners can also opt out individually from their notification preferences.
            </p>
          </div>
        </div>

        {/* Send Test Email */}
        <div className="bg-white rounded-lg border">
          <div className="p-6 border-b">
            <div className="flex items-center gap-3">
              <Send className="h-5 w-5 text-gray-700" />
              <div>
                <h2 className="text-lg font-medium text-gray-900">Send Test Email</h2>
                <p className="text-sm text-gray-500 mt-1">Verify that Resend is configured correctly by sending a test email.</p>
              </div>
            </div>
          </div>

          <div className="p-5">
            <div className="flex gap-2">
              <input
                type="email"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
                value={testEmail}
                onChange={(e) => { setTestEmail(e.target.value); setTestResult(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") sendTestEmailFn(); }}
                placeholder="Enter email address..."
                disabled={sendingTest}
              />
              <button
                onClick={sendTestEmailFn}
                disabled={!testEmail.trim() || sendingTest}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sendingTest ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                Send
              </button>
            </div>

            {testResult && (
              <div className={`mt-3 flex items-center gap-2 text-sm ${testResult.ok ? "text-green-700" : "text-red-700"}`}>
                {testResult.ok ? (
                  <CheckCircle className="h-4 w-4 shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0" />
                )}
                <span>{testResult.message}</span>
              </div>
            )}
          </div>

          <div className="p-4 bg-gray-50 border-t rounded-b-lg">
            <p className="text-xs text-gray-400">
              Sends from <span className="font-medium text-gray-500">partners@partners.namaclo.com</span> via Resend. If the email doesn&apos;t arrive, check your Resend dashboard for delivery logs and domain verification.
            </p>
          </div>
        </div>

        {/* Suspended Shipping Countries */}
        <div className="bg-white rounded-lg border">
          <div className="p-6 border-b">
            <div className="flex items-center gap-3">
              <Globe className="h-5 w-5 text-gray-700" />
              <div>
                <h2 className="text-lg font-medium text-gray-900">Suspended Shipping Countries</h2>
                <p className="text-sm text-gray-500 mt-1">Countries where our couriers have suspended shipping. Draft orders to these countries will be blocked.</p>
              </div>
            </div>
          </div>

          <div className="p-5">
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
                value={newCountry}
                onChange={(e) => setNewCountry(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addCountry(); }}
                placeholder="Enter country name (e.g. Russia, Belarus)..."
                disabled={savingCountries}
              />
              <button
                onClick={addCountry}
                disabled={!newCountry.trim() || savingCountries}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </button>
            </div>

            {suspendedCountries.length === 0 ? (
              <div className="text-sm text-gray-400 py-4 text-center border border-dashed border-gray-200 rounded-lg">
                No countries suspended. All shipping destinations are active.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {suspendedCountries.map((country) => (
                  <span
                    key={country}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-red-50 text-red-700 border border-red-200 rounded-full"
                  >
                    {country}
                    <button
                      onClick={() => removeCountry(country)}
                      className="hover:bg-red-100 rounded-full p-0.5 transition-colors"
                      disabled={savingCountries}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="p-4 bg-gray-50 border-t rounded-b-lg">
            <p className="text-xs text-gray-400">
              When creating a draft order for an influencer whose Shopify address is in a suspended country, an error message will be shown and the order will be blocked.
              Country names must match exactly how they appear in Shopify (e.g. &quot;Russia&quot; not &quot;RU&quot;).
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
