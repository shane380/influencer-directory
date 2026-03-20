"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft, Loader2, Mail, Globe, X, Plus, Send, CheckCircle, AlertCircle, FileText, ChevronDown, ChevronRight, Save, RefreshCw, BarChart3 } from "lucide-react";
import Link from "next/link";

interface TriggerConfig {
  key: string;
  name: string;
  description: string;
  recipient: string;
  event: string;
  wiredUp: boolean;
}

interface TemplateFields {
  subject: string;
  heading: string;
  body: string;
  ctaText: string;
}

interface TemplateConfig {
  key: string;
  name: string;
  description: string;
  placeholders: string[];
}

const DEFAULT_TEMPLATES: Record<string, TemplateFields> = {
  campaign_assigned: {
    subject: "You have a new campaign brief",
    heading: "New Campaign Brief",
    body: "Hi {{firstName}},\n\nA new campaign has been assigned to you: {{campaignName}}\n\n{{description}}\n\nHead to your dashboard to view the full brief and confirm your participation.",
    ctaText: "View Campaign",
  },
  content_approved: {
    subject: "Your content has been approved",
    heading: "Content Approved",
    body: "Hi {{firstName}},\n\nGreat news! Your content submission for {{campaignName}} has been approved.\n\nThank you for your work on this campaign.",
    ctaText: "View Details",
  },
  revision_requested: {
    subject: "Revision requested on your submission",
    heading: "Revision Requested",
    body: "Hi {{firstName}},\n\nA revision has been requested on your content submission for {{campaignName}}.\n\n{{feedback}}\n\nPlease review the feedback and resubmit your content.",
    ctaText: "View Details",
  },
  partner_invite: {
    subject: "You've been invited to join Nama Partners",
    heading: "You're Invited",
    body: "Hi {{firstName}},\n\nWe'd love to partner with you. We've put together an offer based on your content and audience.\n\nQuestions? Reply to this email.",
    ctaText: "View Your Offer",
  },
  welcome: {
    subject: "Welcome to Nama Partners",
    heading: "Welcome, {{firstName}}",
    body: "Hi {{firstName}},\n\nYour Nama Partners account is all set up. You can log in anytime to view your dashboard, track your earnings, and manage your content.\n\nYour login email: {{email}}",
    ctaText: "Go to My Dashboard →",
  },
};

const TEMPLATE_CONFIGS: TemplateConfig[] = [
  {
    key: "campaign_assigned",
    name: "Campaign Assigned",
    description: "Sent when a campaign is published and assigned to a partner.",
    placeholders: ["firstName", "campaignName", "description"],
  },
  {
    key: "content_approved",
    name: "Content Approved",
    description: "Sent when a partner's content submission is approved.",
    placeholders: ["firstName", "campaignName"],
  },
  {
    key: "revision_requested",
    name: "Revision Requested",
    description: "Sent when a revision is requested on a submission.",
    placeholders: ["firstName", "campaignName", "feedback"],
  },
  {
    key: "partner_invite",
    name: "Partner Invite",
    description: "Sent to new partners with their offer link.",
    placeholders: ["firstName"],
  },
  {
    key: "welcome",
    name: "Welcome",
    description: "Sent after a partner creates their account.",
    placeholders: ["firstName", "email"],
  },
];

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
  {
    key: "welcome",
    name: "Welcome",
    description: "Sent to partners after they create their account with a link to log in.",
    recipient: "Partner",
    event: "Partner creates their account",
    wiredUp: true,
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
  const [emailTemplates, setEmailTemplates] = useState<Record<string, Partial<TemplateFields>>>({});
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);
  const [templateDraft, setTemplateDraft] = useState<TemplateFields | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateSaved, setTemplateSaved] = useState<string | null>(null);
  const [previewEmail, setPreviewEmail] = useState("");
  const [sendingPreview, setSendingPreview] = useState(false);
  const [previewResult, setPreviewResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [metaSyncStatus, setMetaSyncStatus] = useState<any>(null);
  const [metaSyncing, setMetaSyncing] = useState(false);
  const [metaSyncResult, setMetaSyncResult] = useState<{ ok: boolean; message: string } | null>(null);
  const supabase = createClient();
  const router = useRouter();

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/settings");
      if (res.ok) {
        const data = await res.json();
        setTriggers(data.email_triggers || {});
        setSuspendedCountries(data.suspended_shipping_countries || []);
        setEmailTemplates(data.email_templates || {});
        setMetaSyncStatus(data.meta_sync_status || null);
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



  const openTemplateEditor = (key: string) => {
    if (editingTemplate === key) {
      setEditingTemplate(null);
      setTemplateDraft(null);
      return;
    }
    const saved = emailTemplates[key] || {};
    const defaults = DEFAULT_TEMPLATES[key];
    setTemplateDraft({
      subject: saved.subject ?? defaults.subject,
      heading: saved.heading ?? defaults.heading,
      body: saved.body ?? defaults.body,
      ctaText: saved.ctaText ?? defaults.ctaText,
    });
    setEditingTemplate(key);
    setTemplateSaved(null);
  };

  const saveTemplate = async () => {
    if (!editingTemplate || !templateDraft) return;
    setSavingTemplate(true);
    const defaults = DEFAULT_TEMPLATES[editingTemplate];
    // Only save fields that differ from defaults
    const override: Partial<TemplateFields> = {};
    if (templateDraft.subject !== defaults.subject) override.subject = templateDraft.subject;
    if (templateDraft.heading !== defaults.heading) override.heading = templateDraft.heading;
    if (templateDraft.body !== defaults.body) override.body = templateDraft.body;
    if (templateDraft.ctaText !== defaults.ctaText) override.ctaText = templateDraft.ctaText;

    const updated = { ...emailTemplates };
    if (Object.keys(override).length > 0) {
      updated[editingTemplate] = override;
    } else {
      delete updated[editingTemplate];
    }

    try {
      await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_templates: updated }),
      });
      setEmailTemplates(updated);
      setTemplateSaved(editingTemplate);
      setTimeout(() => setTemplateSaved(null), 2000);
    } catch {}
    setSavingTemplate(false);
  };

  const resetTemplate = () => {
    if (!editingTemplate) return;
    setTemplateDraft({ ...DEFAULT_TEMPLATES[editingTemplate] });
  };

  const sendPreview = async () => {
    const to = previewEmail.trim();
    if (!to || !templateDraft) return;
    setSendingPreview(true);
    setPreviewResult(null);
    try {
      const res = await fetch("/api/email/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, template: templateDraft }),
      });
      const data = await res.json();
      if (res.ok) {
        setPreviewResult({ ok: true, message: `Preview sent to ${to}` });
      } else {
        setPreviewResult({ ok: false, message: data.error || "Failed to send" });
      }
    } catch {
      setPreviewResult({ ok: false, message: "Network error" });
    }
    setSendingPreview(false);
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

        {/* Email Templates */}
        <div className="bg-white rounded-lg border">
          <div className="p-6 border-b">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-gray-700" />
              <div>
                <h2 className="text-lg font-medium text-gray-900">Email Templates</h2>
                <p className="text-sm text-gray-500 mt-1">Customize the subject, heading, and body text of each email. Use {"{{placeholders}}"} for dynamic content.</p>
              </div>
            </div>
          </div>

          <div className="divide-y divide-gray-100">
            {TEMPLATE_CONFIGS.map((config) => {
              const isOpen = editingTemplate === config.key;
              const hasOverride = !!emailTemplates[config.key] && Object.keys(emailTemplates[config.key]).length > 0;
              return (
                <div key={config.key}>
                  <button
                    onClick={() => openTemplateEditor(config.key)}
                    className="w-full p-5 flex items-center gap-4 hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="shrink-0">
                      {isOpen ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">{config.name}</span>
                        {hasOverride && (
                          <span className="text-[10px] tracking-wider uppercase px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                            Customized
                          </span>
                        )}
                        {templateSaved === config.key && (
                          <span className="text-[10px] tracking-wider uppercase px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
                            Saved
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 mt-0.5">{config.description}</p>
                    </div>
                  </button>

                  {isOpen && templateDraft && (
                    <div className="px-5 pb-5 space-y-4 border-t border-gray-50 bg-gray-50/50">
                      <div className="pt-4">
                        <label className="block text-xs font-medium text-gray-500 mb-1">Subject Line</label>
                        <input
                          type="text"
                          value={templateDraft.subject}
                          onChange={(e) => setTemplateDraft({ ...templateDraft, subject: e.target.value })}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Email Heading</label>
                        <input
                          type="text"
                          value={templateDraft.heading}
                          onChange={(e) => setTemplateDraft({ ...templateDraft, heading: e.target.value })}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Body Text</label>
                        <textarea
                          value={templateDraft.body}
                          onChange={(e) => setTemplateDraft({ ...templateDraft, body: e.target.value })}
                          rows={6}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 font-mono"
                        />
                        <p className="text-xs text-gray-400 mt-1">
                          Separate paragraphs with a blank line. Links: <code className="bg-gray-100 px-1 py-0.5 rounded text-gray-600">[link text](https://url)</code>. Placeholders:{" "}
                          {config.placeholders.map((p) => (
                            <code key={p} className="bg-gray-100 px-1 py-0.5 rounded text-gray-600 mx-0.5">{`{{${p}}}`}</code>
                          ))}
                        </p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Button Text</label>
                        <input
                          type="text"
                          value={templateDraft.ctaText}
                          onChange={(e) => setTemplateDraft({ ...templateDraft, ctaText: e.target.value })}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
                        />
                      </div>
                      <div className="flex items-center gap-3 pt-2">
                        <button
                          onClick={saveTemplate}
                          disabled={savingTemplate}
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
                        >
                          {savingTemplate ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                          Save Template
                        </button>
                        <button
                          onClick={resetTemplate}
                          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                        >
                          Reset to Default
                        </button>
                      </div>

                      <div className="border-t border-gray-200 pt-4 mt-2">
                        <label className="block text-xs font-medium text-gray-500 mb-2">Send Preview Email</label>
                        <div className="flex gap-2">
                          <input
                            type="email"
                            value={previewEmail}
                            onChange={(e) => { setPreviewEmail(e.target.value); setPreviewResult(null); }}
                            onKeyDown={(e) => { if (e.key === "Enter") sendPreview(); }}
                            placeholder="Enter email address..."
                            disabled={sendingPreview}
                            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
                          />
                          <button
                            onClick={sendPreview}
                            disabled={!previewEmail.trim() || sendingPreview}
                            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {sendingPreview ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                            Send Preview
                          </button>
                        </div>
                        {previewResult && (
                          <div className={`mt-2 flex items-center gap-2 text-xs ${previewResult.ok ? "text-green-700" : "text-red-700"}`}>
                            {previewResult.ok ? <CheckCircle className="h-3.5 w-3.5 shrink-0" /> : <AlertCircle className="h-3.5 w-3.5 shrink-0" />}
                            <span>{previewResult.message}</span>
                          </div>
                        )}
                        <p className="text-xs text-gray-400 mt-1.5">Sends this template with sample data so you can see how it looks. Subject will include [PREVIEW].</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="p-4 bg-gray-50 border-t rounded-b-lg">
            <p className="text-xs text-gray-400">
              Changes apply to all future emails. The email layout (logo, footer, styling) is managed by the app and cannot be changed here.
            </p>
          </div>
        </div>



        {/* Meta Ad Sync */}
        <div className="bg-white rounded-lg border">
          <div className="p-6 border-b">
            <div className="flex items-center gap-3">
              <BarChart3 className="h-5 w-5 text-gray-700" />
              <div>
                <h2 className="text-lg font-medium text-gray-900">Meta Ad Sync</h2>
                <p className="text-sm text-gray-500 mt-1">Ad performance data is synced daily at 6 AM UTC. You can also trigger a manual sync.</p>
              </div>
            </div>
          </div>

          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                {metaSyncStatus?.last_synced_at ? (
                  <>
                    <p className="text-sm text-gray-900">
                      Last synced: <span className="font-medium">{new Date(metaSyncStatus.last_synced_at).toLocaleString()}</span>
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {metaSyncStatus.creators_synced} of {metaSyncStatus.total_creators} creators synced
                      {metaSyncStatus.creators_failed > 0 && (
                        <span className="text-amber-600"> ({metaSyncStatus.creators_failed} failed)</span>
                      )}
                      {metaSyncStatus.stopped_early && (
                        <span className="text-amber-600"> — stopped early (rate limit)</span>
                      )}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-gray-500">No sync has been run yet.</p>
                )}
              </div>
              <button
                onClick={async () => {
                  setMetaSyncing(true);
                  setMetaSyncResult(null);
                  try {
                    const res = await fetch("/api/meta/sync", { method: "POST" });
                    const data = await res.json();
                    if (res.ok) {
                      setMetaSyncResult({
                        ok: true,
                        message: `Synced ${data.synced} creators${data.failed > 0 ? `, ${data.failed} failed` : ""} in ${(data.duration_ms / 1000).toFixed(1)}s`,
                      });
                      // Refresh the status
                      await fetchSettings();
                    } else {
                      setMetaSyncResult({ ok: false, message: data.error || "Sync failed" });
                    }
                  } catch {
                    setMetaSyncResult({ ok: false, message: "Network error" });
                  }
                  setMetaSyncing(false);
                }}
                disabled={metaSyncing}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {metaSyncing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                {metaSyncing ? "Syncing..." : "Sync Now"}
              </button>
            </div>

            {metaSyncResult && (
              <div className={`flex items-center gap-2 text-xs ${metaSyncResult.ok ? "text-green-700" : "text-red-700"}`}>
                {metaSyncResult.ok ? <CheckCircle className="h-3.5 w-3.5 shrink-0" /> : <AlertCircle className="h-3.5 w-3.5 shrink-0" />}
                <span>{metaSyncResult.message}</span>
              </div>
            )}
          </div>

          <div className="p-4 bg-gray-50 border-t rounded-b-lg">
            <p className="text-xs text-gray-400">
              Syncs ad data from Meta for all creators with ad spend deals. Data is cached in the database — page loads never call the Meta API directly.
              Rate limited to 200 API calls per hour with automatic retry on rate limit errors.
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
