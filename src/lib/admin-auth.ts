import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Verify the current user is an admin or manager.
 * Returns the auth user if authorized, null otherwise.
 */
export async function verifyAdmin() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("is_admin, is_manager")
    .eq("id", user.id)
    .single();

  return (profile?.is_admin || profile?.is_manager) ? user : null;
}

/**
 * Get a Supabase client with the service role key (bypasses RLS).
 */
export function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
