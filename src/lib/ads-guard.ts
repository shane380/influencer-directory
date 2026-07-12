import { createClient as createServerClient } from "@/lib/supabase/server";

export interface AdsUser {
  userId: string;
  displayName: string;
  isAdmin: boolean;
  isManager: boolean;
}

/**
 * Resolve the current staff user for /api/ads routes.
 * Any admin or manager may build and submit drafts; only admins publish.
 */
export async function getAdsUser(): Promise<AdsUser | null> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("display_name, is_admin, is_manager")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin && !profile?.is_manager) return null;

  return {
    userId: user.id,
    displayName: profile.display_name || user.email?.split("@")[0] || "User",
    isAdmin: !!profile.is_admin,
    isManager: !!profile.is_manager,
  };
}
