// Shared influencer/creator lookups for the partnerships overview APIs.
// `db` is a service-role Supabase client.

export type Profile = { name: string | null; handle: string | null; photo: string | null };

// influencer_id -> { name, handle, photo } from the canonical influencers table.
export async function loadProfiles(db: any, influencerIds: string[]): Promise<Map<string, Profile>> {
  if (influencerIds.length === 0) return new Map();
  const { data } = await db
    .from("influencers")
    .select("id, name, instagram_handle, profile_photo_url")
    .in("id", influencerIds);
  return new Map(
    ((data as any[]) || []).map((i) => [
      String(i.id),
      { name: i.name ?? null, handle: i.instagram_handle ?? null, photo: i.profile_photo_url ?? null },
    ]),
  );
}

// influencer_id -> creator_id via the invite chain (creators.invite_id ->
// creator_invites.influencer_id). Best-effort; unlinked influencers are absent.
export async function resolveCreatorIds(db: any, influencerIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (influencerIds.length === 0) return out;
  const { data: invites } = await db
    .from("creator_invites")
    .select("id, influencer_id")
    .in("influencer_id", influencerIds);
  const inviteToInfluencer = new Map<string, string>();
  const inviteIds = ((invites as any[]) || []).map((i) => {
    inviteToInfluencer.set(String(i.id), String(i.influencer_id));
    return String(i.id);
  });
  if (inviteIds.length === 0) return out;
  const { data: creators } = await db.from("creators").select("id, invite_id").in("invite_id", inviteIds);
  for (const c of (creators as any[]) || []) {
    const infId = c.invite_id ? inviteToInfluencer.get(String(c.invite_id)) : null;
    if (infId && !out.has(infId)) out.set(infId, String(c.id));
  }
  return out;
}
