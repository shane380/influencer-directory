'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Sidebar } from '@/components/sidebar'

export default function AdminCreatorProfile() {
  const { id } = useParams()
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState(null)
  const [creator, setCreator] = useState(null)
  const [invite, setInvite] = useState(null)
  const [influencer, setInfluencer] = useState(null)
  const [orders, setOrders] = useState([])
  const [sampleRequests, setSampleRequests] = useState([])
  const [submissions, setSubmissions] = useState([])
  const [ads, setAds] = useState([])
  const [adsLoading, setAdsLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState({})

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setCurrentUser({
          displayName: user.user_metadata?.full_name || user.email || '',
          email: user.email || '',
          profilePhotoUrl: null,
          isAdmin: user.user_metadata?.role === 'admin',
        })
      }

      // Fetch creator
      const { data: c } = await supabase
        .from('creators')
        .select('*')
        .eq('id', id)
        .single()
      if (!c) { setLoading(false); return }
      setCreator(c)

      // Fetch invite
      if (c.invite_id) {
        const { data: inv } = await supabase
          .from('creator_invites')
          .select('*')
          .eq('id', c.invite_id)
          .single()
        setInvite(inv)

        // Fetch influencer
        if (inv?.influencer_id) {
          const { data: inf } = await supabase
            .from('influencers')
            .select('*')
            .eq('id', inv.influencer_id)
            .single()
          setInfluencer(inf)

          // Fetch orders
          if (inf) {
            const { data: orderData } = await supabase
              .from('influencer_orders')
              .select('*')
              .eq('influencer_id', inf.id)
              .order('order_date', { ascending: false })
            setOrders(orderData || [])
          }

          // Fetch ads
          if (inf?.instagram_handle) {
            setAdsLoading(true)
            try {
              const res = await fetch(`/api/meta/creator-ads?handle=${encodeURIComponent(inf.instagram_handle)}`)
              const data = await res.json()
              setAds(data.ads || [])
            } catch {}
            setAdsLoading(false)
          }
        }
      }

      // Fetch sample requests
      const { data: reqData } = await supabase
        .from('creator_sample_requests')
        .select('*')
        .eq('creator_id', id)
        .order('created_at', { ascending: false })
      setSampleRequests(reqData || [])

      // Fetch content submissions
      const { data: subData } = await supabase
        .from('creator_content_submissions')
        .select('*')
        .eq('creator_id', id)
        .order('created_at', { ascending: false })
      setSubmissions(subData || [])

      setLoading(false)
    }
    if (id) load()
  }, [id])

  async function approveRequest(req) {
    setActionLoading(prev => ({ ...prev, [req.id]: 'approving' }))

    // Create draft order via Shopify using the influencer's Shopify customer
    if (influencer?.shopify_customer_id) {
      try {
        const lineItems = (req.selections || []).map(sel => ({
          variant_id: sel.shopify_variant_id,
          quantity: sel.quantity || 1,
        }))
        await fetch('/api/shopify/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer_id: influencer.shopify_customer_id,
            line_items: lineItems,
            note: `Sample request from creator: ${creator.creator_name}`,
          }),
        })
      } catch (err) {
        console.error('Draft order creation failed:', err)
      }
    }

    await supabase
      .from('creator_sample_requests')
      .update({ status: 'approved', reviewed_at: new Date().toISOString() })
      .eq('id', req.id)

    setSampleRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: 'approved', reviewed_at: new Date().toISOString() } : r))
    setActionLoading(prev => ({ ...prev, [req.id]: null }))
  }

  async function rejectRequest(reqId) {
    setActionLoading(prev => ({ ...prev, [reqId]: 'rejecting' }))
    await supabase
      .from('creator_sample_requests')
      .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
      .eq('id', reqId)
    setSampleRequests(prev => prev.map(r => r.id === reqId ? { ...r, status: 'rejected', reviewed_at: new Date().toISOString() } : r))
    setActionLoading(prev => ({ ...prev, [reqId]: null }))
  }

  async function updateSubmissionStatus(subId, status, reviewerNotes = null) {
    setActionLoading(prev => ({ ...prev, [subId]: 'updating' }))
    const update = { status, reviewed_at: new Date().toISOString() }
    if (reviewerNotes !== null) update.reviewer_notes = reviewerNotes
    await supabase
      .from('creator_content_submissions')
      .update(update)
      .eq('id', subId)
    setSubmissions(prev => prev.map(s => s.id === subId ? { ...s, ...update } : s))
    setActionLoading(prev => ({ ...prev, [subId]: null }))
  }

  const statusBadge = (status) => {
    const colors = {
      pending: 'bg-amber-100 text-amber-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
      submitted: 'bg-gray-100 text-gray-600',
      revision_requested: 'bg-amber-100 text-amber-800',
      ACTIVE: 'bg-green-100 text-green-800',
      PAUSED: 'bg-gray-100 text-gray-600',
    }
    return `inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-600'}`
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex">
        <Sidebar activeTab="creators" onTabChange={() => {}} currentUser={currentUser} onLogout={async () => { await supabase.auth.signOut(); router.push('/login') }} />
        <main className="flex-1 ml-48 px-8 pt-12 pb-8">
          <p className="text-gray-500 text-sm">Loading...</p>
        </main>
      </div>
    )
  }

  if (!creator) {
    return (
      <div className="min-h-screen bg-gray-50 flex">
        <Sidebar activeTab="creators" onTabChange={() => {}} currentUser={currentUser} onLogout={async () => { await supabase.auth.signOut(); router.push('/login') }} />
        <main className="flex-1 ml-48 px-8 pt-12 pb-8">
          <p className="text-gray-500 text-sm">Creator not found.</p>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar activeTab="creators" onTabChange={() => {}} currentUser={currentUser} onLogout={async () => { await supabase.auth.signOut(); router.push('/login') }} />
      <main className="flex-1 ml-48 px-8 pt-12 pb-8">
        <div className="max-w-4xl">
          {/* Back link */}
          <button onClick={() => router.push('/partnerships/creators')} className="text-sm text-gray-500 hover:text-gray-700 mb-6 flex items-center gap-1">
            ← Back to Creators
          </button>

          {/* Profile Header */}
          <div className="bg-white border rounded-lg p-6 mb-6">
            <div className="flex items-center gap-4 mb-4">
              {influencer?.profile_photo_url ? (
                <img src={influencer.profile_photo_url} alt="" className="w-16 h-16 rounded-full object-cover bg-gray-200" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-gray-200" />
              )}
              <div>
                <h1 className="text-xl font-semibold text-gray-900">
                  {influencer?.name || creator.creator_name}
                </h1>
                {influencer?.instagram_handle && (
                  <p className="text-gray-500 text-sm">@{influencer.instagram_handle}</p>
                )}
              </div>
              <span className="ml-auto inline-flex items-center px-3 py-1 rounded text-xs font-medium bg-green-100 text-green-800 uppercase tracking-wider">
                Active
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-gray-500 text-xs uppercase tracking-wider mb-1">Affiliate Code</div>
                <code className="bg-gray-100 px-2 py-1 rounded text-xs">{creator.affiliate_code}</code>
              </div>
              <div>
                <div className="text-gray-500 text-xs uppercase tracking-wider mb-1">Commission</div>
                <div className="text-gray-900">{creator.commission_rate}%</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs uppercase tracking-wider mb-1">Videos / Month</div>
                <div className="text-gray-900">{invite?.videos_per_month || '—'}</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs uppercase tracking-wider mb-1">Usage Rights</div>
                <div className="text-gray-900">{invite?.usage_rights || '—'}</div>
              </div>
            </div>
          </div>

          {/* Sample Requests */}
          <div className="bg-white border rounded-lg p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Sample Requests</h2>
            {sampleRequests.length === 0 ? (
              <p className="text-gray-500 text-sm">No sample requests yet.</p>
            ) : (
              <div className="space-y-3">
                {sampleRequests.map(req => (
                  <div key={req.id} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div className="text-xs text-gray-500">
                        {new Date(req.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                      <span className={statusBadge(req.status)}>{req.status}</span>
                    </div>
                    <div className="space-y-1 mb-3">
                      {(req.selections || []).map((sel, i) => (
                        <div key={i} className="text-sm text-gray-900">
                          {sel.product_title}
                          {sel.variant_title && <span className="text-gray-500"> — {sel.variant_title}</span>}
                          {sel.quantity > 1 && <span className="text-gray-500"> x{sel.quantity}</span>}
                        </div>
                      ))}
                    </div>
                    {req.status === 'pending' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => approveRequest(req)}
                          disabled={actionLoading[req.id]}
                          className="px-3 py-1.5 bg-green-600 text-white text-xs rounded hover:bg-green-700 disabled:opacity-50"
                        >
                          {actionLoading[req.id] === 'approving' ? 'Approving...' : 'Approve & Create Order'}
                        </button>
                        <button
                          onClick={() => rejectRequest(req.id)}
                          disabled={actionLoading[req.id]}
                          className="px-3 py-1.5 bg-white border border-red-300 text-red-600 text-xs rounded hover:bg-red-50 disabled:opacity-50"
                        >
                          {actionLoading[req.id] === 'rejecting' ? 'Rejecting...' : 'Reject'}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Content Submissions */}
          <div className="bg-white border rounded-lg p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Content Submissions</h2>
            {submissions.length === 0 ? (
              <p className="text-gray-500 text-sm">No content submitted yet.</p>
            ) : (
              <div className="space-y-3">
                {submissions.map(sub => (
                  <div key={sub.id} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div className="text-xs text-gray-500">{sub.month}</div>
                      <span className={statusBadge(sub.status)}>{sub.status.replace('_', ' ')}</span>
                    </div>
                    <a href={sub.video_url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline break-all">
                      {sub.video_url}
                    </a>
                    {sub.notes && <p className="text-xs text-gray-500 mt-1">{sub.notes}</p>}
                    {sub.reviewer_notes && (
                      <p className="text-xs text-amber-700 mt-1 bg-amber-50 px-2 py-1 rounded">Feedback: {sub.reviewer_notes}</p>
                    )}
                    <div className="flex gap-2 mt-3">
                      {sub.status !== 'approved' && (
                        <button
                          onClick={() => updateSubmissionStatus(sub.id, 'approved')}
                          disabled={actionLoading[sub.id]}
                          className="px-3 py-1.5 bg-green-600 text-white text-xs rounded hover:bg-green-700 disabled:opacity-50"
                        >
                          Approve
                        </button>
                      )}
                      {sub.status !== 'revision_requested' && (
                        <button
                          onClick={() => {
                            const notes = prompt('Revision notes:')
                            if (notes) updateSubmissionStatus(sub.id, 'revision_requested', notes)
                          }}
                          disabled={actionLoading[sub.id]}
                          className="px-3 py-1.5 bg-white border border-amber-300 text-amber-700 text-xs rounded hover:bg-amber-50 disabled:opacity-50"
                        >
                          Request Revision
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Wardrobe */}
          <div className="bg-white border rounded-lg p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Wardrobe</h2>
            {orders.length === 0 ? (
              <p className="text-gray-500 text-sm">No orders yet.</p>
            ) : (
              <div className="space-y-3">
                {orders.map(order => (
                  <div key={order.id} className="border rounded-lg p-4">
                    <div className="text-xs text-gray-500 mb-2">
                      {new Date(order.order_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {order.order_number && ` — #${order.order_number}`}
                    </div>
                    {(order.line_items || []).map((item, i) => (
                      <div key={i} className="text-sm text-gray-900">
                        {item.product_name}
                        {item.variant_title && <span className="text-gray-500"> — {item.variant_title}</span>}
                        {item.quantity > 1 && <span className="text-gray-500"> x{item.quantity}</span>}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Live Ads */}
          <div className="bg-white border rounded-lg p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Live Ads</h2>
            {adsLoading ? (
              <p className="text-gray-500 text-sm">Loading ads...</p>
            ) : ads.length === 0 ? (
              <p className="text-gray-500 text-sm">No ads running yet.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {ads.map((ad, i) => (
                  <div key={i} className="border rounded-lg overflow-hidden">
                    {ad.thumbnail && (
                      <img src={ad.thumbnail} alt="" className="w-full h-40 object-cover bg-gray-100" />
                    )}
                    <div className="p-3">
                      <div className="text-sm text-gray-900 mb-2">{ad.name}</div>
                      <div className="flex justify-between items-center">
                        <span className={statusBadge(ad.status)}>{ad.status}</span>
                        <span className="text-xs text-gray-500">${ad.spend}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
