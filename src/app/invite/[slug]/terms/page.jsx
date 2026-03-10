'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500&display=swap');
.pt-page { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #111; max-width: 680px; margin: 0 auto; padding: 56px 32px 80px; min-height: 100vh; background: white; }
@media (max-width: 768px) { .pt-page { padding: 40px 24px 64px; } }
.pt-back { font-size: 12px; color: #999; text-decoration: none; display: inline-flex; align-items: center; gap: 4px; margin-bottom: 40px; }
.pt-back:hover { color: #333; }
.pt-logo-lockup { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; margin-bottom: 40px; }
.pt-logo { height: 28px; display: block; }
.pt-logo-sub { font-size: 8.5px; letter-spacing: 0.4em; text-transform: uppercase; color: #aaa; }
.pt-title { font-family: 'Playfair Display', serif; font-size: 36px; font-weight: 300; color: #111; line-height: 1.1; margin-bottom: 8px; }
@media (max-width: 768px) { .pt-title { font-size: 30px; } }
.pt-meta { font-size: 12px; color: #999; margin-bottom: 40px; }
.pt-section { margin-bottom: 32px; }
.pt-section-label { font-size: 9px; letter-spacing: 0.4em; text-transform: uppercase; color: #888; margin-bottom: 16px; display: flex; align-items: center; gap: 12px; }
.pt-section-label::after { content: ''; flex: 1; height: 1px; background: #ebebeb; }
.pt-body { font-size: 14px; color: #555; font-weight: 300; line-height: 1.85; }
.pt-body p { margin-bottom: 12px; }
.pt-body p:last-child { margin-bottom: 0; }
.pt-footer { margin-top: 48px; padding-top: 24px; border-top: 1px solid #ebebeb; }
`

export default function PartnershipTermsPage() {
  const { slug } = useParams()
  const supabase = createClient()
  const [invite, setInvite] = useState(null)
  const [dealParam, setDealParam] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setDealParam(params.get('deal'))
  }, [])

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('creator_invites')
        .select('*')
        .eq('slug', slug)
        .single()
      if (data) setInvite(data)
      setLoading(false)
    }
    if (slug) load()
  }, [slug])

  if (loading) {
    return (
      <div className="pt-page">
        <style>{CSS}</style>
        <div style={{ color: '#888', fontSize: 13, letterSpacing: '0.1em' }}>Loading...</div>
      </div>
    )
  }

  if (!invite) {
    return (
      <div className="pt-page">
        <style>{CSS}</style>
        <p style={{ color: '#888', fontSize: 14 }}>This invite link doesn&apos;t exist or has expired.</p>
      </div>
    )
  }

  const retainerAmount = invite.retainer_amount
  const adSpendPct = invite.ad_spend_percentage
  const commissionRate = invite.commission_rate || 10
  const videos = invite.videos_per_month
  const contentType = invite.content_type || 'talking-style UGC'
  const minimumCommitment = invite.minimum_commitment || null
  const adSpendMin = invite.ad_spend_minimum
  const createdDate = invite.created_at
    ? new Date(invite.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
    : ''

  // Determine which deal components to show
  // If offer_choice, the deal param narrows to the selected option
  // Otherwise, show whatever flags are set on the invite
  const selectedDeal = dealParam || (invite.has_retainer ? 'retainer' : invite.has_ad_spend ? 'ad_spend' : 'affiliate')
  const showRetainer = selectedDeal === 'retainer' && invite.has_retainer && retainerAmount
  const showAdSpend = selectedDeal === 'ad_spend' && invite.has_ad_spend && adSpendPct > 0
  const showAffiliate = invite.has_affiliate || (!invite.has_retainer && !invite.has_ad_spend)
  const showAdSpendMin = showAdSpend && adSpendMin > 0

  // For non-offer-choice invites, show all flags
  const isOfferChoice = invite.offer_choice
  const showRetainerSection = isOfferChoice ? showRetainer : (invite.has_retainer && retainerAmount)
  const showAdSpendSection = isOfferChoice ? showAdSpend : (invite.has_ad_spend && adSpendPct > 0)
  const showAdSpendMinSection = isOfferChoice ? showAdSpendMin : (adSpendMin > 0)

  // Partnership type label
  const dealLabel = showRetainerSection ? 'Retainer Partnership' : showAdSpendSection ? 'Ad Spend Partnership' : 'Affiliate Partnership'

  return (
    <div className="pt-page">
      <style>{CSS}</style>

      <a href={`/invite/${slug}`} className="pt-back">&larr; Back to offer</a>

      <div className="pt-logo-lockup">
        <img src="/nama-logo.svg" alt="Nama" className="pt-logo" />
        <div className="pt-logo-sub">Partners</div>
      </div>

      <div className="pt-title">Partnership Terms</div>
      <div className="pt-meta">
        {invite.creator_name} &middot; {dealLabel}{createdDate && <> &middot; {createdDate}</>}
      </div>

      {/* Compensation */}
      <div className="pt-section">
        <div className="pt-section-label">Compensation</div>
        <div className="pt-body">
          {showRetainerSection && (
            <p>Nama will pay you a fixed retainer of ${retainerAmount.toLocaleString()} per month. Payment is made by the 5th of the following month via your selected payment method.</p>
          )}
          {showAdSpendSection && (
            <p>You will earn {adSpendPct}% of monthly advertising spend attributed to your content.</p>
          )}
          {showAffiliate && (
            <p>You will earn {commissionRate}% commission on all completed sales attributed to your unique link or discount code. Returned, refunded, or cancelled orders are excluded. Commissions from sales made through coupon aggregator sites, deal forums, or browser extensions are excluded.</p>
          )}
          {showAdSpendMinSection && (
            <p>Your monthly earnings are subject to a minimum guarantee of ${adSpendMin.toLocaleString()} in month 1.</p>
          )}
        </div>
      </div>

      {/* Deliverables */}
      {videos && (showRetainerSection || showAdSpendSection) && (
        <div className="pt-section">
          <div className="pt-section-label">Deliverables</div>
          <div className="pt-body">
            <p>You agree to provide {videos} {contentType} videos per month.</p>
            <p>Each video includes one round of minor edits (text changes, music swaps, colour correction). Structural re-shoots or concept changes are by mutual agreement.</p>
          </div>
        </div>
      )}

      {/* Contract Term */}
      <div className="pt-section">
        <div className="pt-section-label">Contract Term</div>
        <div className="pt-body">
          {minimumCommitment ? (
            <p>This partnership has a {minimumCommitment}-month minimum commitment. After the initial term, it continues month-to-month with 2 weeks written notice to end.</p>
          ) : (
            <p>This partnership is month-to-month. Either party can end the partnership with 2 weeks written notice.</p>
          )}
        </div>
      </div>

      {/* Payment */}
      <div className="pt-section">
        <div className="pt-section-label">Payment</div>
        <div className="pt-body">
          <p>All payments are made by the 5th of the following month via your selected payment method (PayPal or bank transfer).</p>
        </div>
      </div>

      {/* Content Ownership & Usage Rights */}
      <div className="pt-section">
        <div className="pt-section-label">Content Ownership &amp; Usage Rights</div>
        <div className="pt-body">
          <p>You retain full ownership of your original content. Nama is licensed to use it for paid media and organic channels during the partnership, and for 6 months following the conclusion of the partnership.</p>
        </div>
      </div>

      <div className="pt-footer">
        <a href={`/invite/${slug}`} className="pt-back">&larr; Back to offer</a>
      </div>
    </div>
  )
}
