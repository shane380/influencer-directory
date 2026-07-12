"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Sidebar } from "@/components/sidebar";
import { AdLauncher } from "@/components/ads/ad-launcher";
import { Loader2 } from "lucide-react";

export default function AdsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [currentUser, setCurrentUser] = useState<{
    displayName: string;
    email: string;
    profilePhotoUrl: string | null;
    isAdmin: boolean;
    isManager: boolean;
  } | null>(null);
  const [loaded, setLoaded] = useState(false);

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
      setLoaded(true);
    }
    load();
  }, [supabase]);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar
        activeTab="ads"
        onTabChange={() => {}}
        currentUser={currentUser}
        onLogout={async () => {
          await supabase.auth.signOut();
          router.push("/login");
        }}
      />
      <main className="flex-1 px-8 pt-10 pb-8 min-w-0">
        <div className="mb-5">
          <h1 className="text-2xl font-semibold text-gray-900">Ads</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Create and publish Meta ads without touching Ads Manager.
          </p>
        </div>
        {!loaded ? (
          <div className="flex items-center gap-2 text-sm text-gray-400 py-16 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <Suspense fallback={null}>
            <AdLauncher isAdmin={currentUser?.isAdmin || false} />
          </Suspense>
        )}
      </main>
    </div>
  );
}
