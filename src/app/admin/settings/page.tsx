"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft, Loader2, Mail } from "lucide-react";
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
  const supabase = createClient();
  const router = useRouter();

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/settings");
      if (res.ok) {
        const data = await res.json();
        setTriggers(data.email_triggers || {});
      }
    } catch {}
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      const { data: profile } = await (supabase.from("profiles") as any)
        .select("is_admin")
        .eq("id", user.id)
        .single();

      if (!profile?.is_admin) { router.push("/"); return; }
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
              Emails are sent from <span className="font-medium text-gray-500">partners@namaclo.com</span> via Resend. Partners can also opt out individually from their notification preferences.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
