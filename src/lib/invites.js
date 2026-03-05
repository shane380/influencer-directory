import { createClient } from '@/lib/supabase/client'

export async function createInvite({
  creatorName,
  creatorEmail = null,
  slug = null,
  commissionRate = 10,
  videosPerMonth = '3–5',
  contentType = 'Talking-style UGC',
  usageRights = '90 days per campaign, renewable',
  notes = null,
  expiryDays = null,
  influencerId = null,
}) {
  const supabase = createClient()

  const resolvedSlug = slug || creatorName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

  const expiresAt = expiryDays
    ? new Date(Date.now() + expiryDays * 86400000).toISOString()
    : null

  const insertData = {
    slug: resolvedSlug,
    creator_name: creatorName,
    creator_email: creatorEmail,
    commission_rate: commissionRate,
    videos_per_month: videosPerMonth,
    content_type: contentType,
    usage_rights: usageRights,
    notes,
    expires_at: expiresAt,
    status: 'pending',
  }
  if (influencerId) insertData.influencer_id = influencerId

  const { data, error } = await supabase
    .from('creator_invites')
    .insert(insertData)
    .select()
    .single()

  if (error) throw new Error(`Failed to create invite: ${error.message}`)

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://nama-inventory.vercel.app'
  const url = `${baseUrl}/invite/${resolvedSlug}`

  return { url, invite: data }
}

export async function listInvites() {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('creator_invites')
    .select('*, creators(id, affiliate_code, status)')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data
}

export async function revokeInvite(inviteId) {
  const supabase = createClient()
  const { error } = await supabase
    .from('creator_invites')
    .update({ status: 'expired', expires_at: new Date().toISOString() })
    .eq('id', inviteId)

  if (error) throw new Error(error.message)
}
