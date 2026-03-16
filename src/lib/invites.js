import { createClient } from '@/lib/supabase/client'

export async function createInvite({
  creatorName,
  creatorEmail = null,
  slug = null,
  commissionRate = 10,
  videosPerMonth = '3–5',
  contentType = null,
  usageRights = '90 days per campaign, renewable',
  notes = null,
  expiryDays = null,
  influencerId = null,
  dealStructure = null,
  dealType = null,
  retainerAmount = null,
  adSpendPercentage = null,
  adSpendMinimum = null,
  offerChoice = false,
  isExistingCreator = false,
  minimumCommitment = null,
  hasRetainer = false,
  hasAdSpend = false,
  hasAffiliate = false,
}) {
  const supabase = createClient()

  const resolvedSlug = slug || creatorName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

  const expiresAt = expiryDays
    ? new Date(Date.now() + expiryDays * 86400000).toISOString()
    : null

  const upsertData = {
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
  upsertData.influencer_id = influencerId || null
  if (dealStructure) upsertData.deal_structure = dealStructure
  if (dealType) upsertData.deal_type = dealType
  if (retainerAmount != null) upsertData.retainer_amount = retainerAmount
  if (adSpendPercentage != null) upsertData.ad_spend_percentage = adSpendPercentage
  if (adSpendMinimum != null) upsertData.ad_spend_minimum = adSpendMinimum
  upsertData.offer_choice = offerChoice
  upsertData.is_existing_creator = isExistingCreator
  if (minimumCommitment != null) upsertData.minimum_commitment = minimumCommitment
  upsertData.has_retainer = hasRetainer
  upsertData.has_ad_spend = hasAdSpend
  upsertData.has_affiliate = hasAffiliate

  // Remove any expired/revoked invite with the same slug so we can create fresh
  await supabase
    .from('creator_invites')
    .delete()
    .eq('slug', resolvedSlug)
    .in('status', ['expired', 'revoked'])

  const { data, error } = await supabase
    .from('creator_invites')
    .upsert(upsertData, { onConflict: 'slug' })
    .select()
    .single()

  if (error) throw new Error(`Failed to create invite: ${error.message}`)

  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://creators.namaclo.com').trim()
  const url = `${baseUrl}/invite/${resolvedSlug}`

  // Send invite email if an email was provided
  if (creatorEmail) {
    try {
      const firstName = creatorName.split(' ')[0] || creatorName
      const res = await fetch(`${baseUrl}/api/invite-email/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, inviteUrl: url, recipientEmail: creatorEmail }),
      })
      if (!res.ok) {
        console.error('Failed to send invite email:', await res.text())
      }
    } catch (err) {
      console.error('Failed to send invite email:', err)
    }
  }

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
