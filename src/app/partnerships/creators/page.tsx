"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Sidebar } from "@/components/sidebar";

interface Creator {
  id: string;
  creator_name: string;
  email: string;
  commission_rate: number;
  affiliate_code: string;
  invite_id: string;
  created_at: string;
  influencer?: {
    id: string;
    name: string;
    instagram_handle: string;
    profile_photo_url: string | null;
  } | null;
  pending_requests: number;
  last_submission: string | null;
}

export default function CreatorsListPage() {
  const router = useRouter();
  const supabase = createClient();
  const [creators, setCreators] = useState<Creator[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUser({
          displayName: user.user_metadata?.full_name || user.email || "",
          email: user.email || "",
          profilePhotoUrl: null,
          isAdmin: user.user_metadata?.role === "admin",
        });
      }

      // Fetch creators with linked invite → influencer
      const { data: creatorsData } = await supabase
        .from("creators" as any)
        .select("*")
        .order("created_at", { ascending: false });

      if (!creatorsData) {
        setLoading(false);
        return;
      }

      // For each creator, fetch linked influencer, pending requests count, last submission
      const enriched = await Promise.all(
        creatorsData.map(async (c: any) => {
          let influencer = null;

          // Get invite to find influencer_id
          if (c.invite_id) {
            const { data: invite } = await supabase
              .from("creator_invites" as any)
              .select("influencer_id")
              .eq("id", c.invite_id)
              .single() as any;

            if (invite?.influencer_id) {
              const { data: inf } = await supabase
                .from("influencers")
                .select("id, name, instagram_handle, profile_photo_url")
                .eq("id", invite.influencer_id)
                .single();
              influencer = inf;
            }
          }

          // Pending sample requests count
          const { count } = await supabase
            .from("creator_sample_requests" as any)
            .select("id", { count: "exact", head: true })
            .eq("creator_id", c.id)
            .eq("status", "pending") as any;

          // Last content submission
          const { data: lastSub } = await supabase
            .from("creator_content_submissions" as any)
            .select("created_at")
            .eq("creator_id", c.id)
            .order("created_at", { ascending: false })
            .limit(1) as any;

          return {
            ...c,
            influencer,
            pending_requests: count || 0,
            last_submission: lastSub?.[0]?.created_at || null,
          } as Creator;
        })
      );

      setCreators(enriched);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar
        activeTab="creators"
        onTabChange={() => {}}
        currentUser={currentUser}
        onLogout={async () => {
          await supabase.auth.signOut();
          router.push("/login");
        }}
      />
      <main className="flex-1 ml-48 px-8 pt-12 pb-8">
        <div className="max-w-5xl">
          <h1 className="text-2xl font-semibold text-gray-900 mb-6">Creators</h1>

          {loading ? (
            <p className="text-gray-500 text-sm">Loading...</p>
          ) : creators.length === 0 ? (
            <p className="text-gray-500 text-sm">No creators yet.</p>
          ) : (
            <div className="bg-white border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Creator</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Commission</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Affiliate Code</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Pending Requests</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Last Submission</th>
                  </tr>
                </thead>
                <tbody>
                  {creators.map((creator) => (
                    <tr
                      key={creator.id}
                      className="border-b hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => router.push(`/partnerships/creators/${creator.id}`)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {creator.influencer?.profile_photo_url ? (
                            <img
                              src={creator.influencer.profile_photo_url}
                              alt=""
                              className="w-8 h-8 rounded-full object-cover bg-gray-200"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-gray-200" />
                          )}
                          <div>
                            <div className="font-medium text-gray-900">
                              {creator.influencer?.name || creator.creator_name}
                            </div>
                            {creator.influencer?.instagram_handle && (
                              <div className="text-gray-500 text-xs">
                                @{creator.influencer.instagram_handle}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{creator.commission_rate}%</td>
                      <td className="px-4 py-3">
                        <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                          {creator.affiliate_code}
                        </code>
                      </td>
                      <td className="px-4 py-3">
                        {creator.pending_requests > 0 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                            {creator.pending_requests} pending
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {creator.last_submission
                          ? new Date(creator.last_submission).toLocaleDateString("en-AU", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
