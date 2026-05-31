"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Sidebar } from "@/components/sidebar";
import { Gift } from "lucide-react";

export default function GiftingDashboardPage() {
  const router = useRouter();
  const supabase = createClient();
  const [currentUser, setCurrentUser] = useState<{
    displayName: string;
    email: string;
    profilePhotoUrl: string | null;
    isAdmin: boolean;
    isManager: boolean;
  } | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await (supabase.from("profiles") as any)
          .select("display_name, profile_photo_url, is_admin, is_manager")
          .eq("id", user.id)
          .single();
        setCurrentUser({
          displayName: profile?.display_name || user.email?.split("@")[0] || "User",
          email: user.email || "",
          profilePhotoUrl: profile?.profile_photo_url || null,
          isAdmin: profile?.is_admin || false,
          isManager: profile?.is_manager || false,
        });
      }
    }
    load();
  }, [supabase]);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar
        activeTab="gifting"
        onTabChange={() => {}}
        currentUser={currentUser}
        onLogout={async () => {
          await supabase.auth.signOut();
          router.push("/login");
        }}
      />
      <main className="flex-1 px-8 pt-12 pb-8">
        <div>
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-semibold text-gray-900">Gifting/PR</h1>
          </div>

          {/* Placeholder empty state — stats and recurring PR list coming soon */}
          <div className="flex flex-col items-center justify-center text-center border border-dashed border-gray-300 rounded-lg bg-white py-20 px-6">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <Gift className="h-6 w-6 text-gray-400" />
            </div>
            <h2 className="text-lg font-medium text-gray-900 mb-1">
              Gifting/PR dashboard
            </h2>
            <p className="text-sm text-gray-500 max-w-md">
              This is where you&apos;ll see gifting stats and manage the recurring PR
              list. Coming soon — use the Campaigns menu in the sidebar for now.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
