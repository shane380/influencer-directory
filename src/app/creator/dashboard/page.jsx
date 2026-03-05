'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const S = {
  page: {
    minHeight: '100vh',
    background: '#FFFFFF',
    fontFamily: "'Helvetica Neue', Helvetica, sans-serif",
    fontWeight: 300,
    padding: '40px 20px',
    boxSizing: 'border-box',
  },
  container: {
    maxWidth: 720,
    margin: '0 auto',
    width: '100%',
  },
  logo: {
    width: 80,
    display: 'block',
    marginBottom: 32,
  },
  sectionTitle: {
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    fontSize: 'clamp(22px, 5vw, 28px)',
    fontWeight: 300,
    color: '#111111',
    marginBottom: 20,
  },
  section: {
    marginBottom: 48,
    paddingBottom: 48,
    borderBottom: '1px solid #e8e8e8',
  },
  sectionLast: {
    marginBottom: 48,
    paddingBottom: 0,
    borderBottom: 'none',
  },
  label: {
    fontSize: 10,
    letterSpacing: '0.15em',
    textTransform: 'uppercase',
    color: '#888888',
    marginBottom: 4,
  },
  value: {
    fontSize: 15,
    color: '#111111',
    marginBottom: 16,
    lineHeight: 1.5,
  },
  badge: {
    display: 'inline-block',
    fontSize: 10,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    padding: '4px 10px',
    borderRadius: 2,
    fontWeight: 400,
  },
  badgeActive: { background: '#111111', color: '#ffffff' },
  badgePending: { background: '#e8e8e8', color: '#888888' },
  badgeGreen: { background: '#e6f4ea', color: '#1e7e34' },
  badgeYellow: { background: '#fff8e1', color: '#a68307' },
  badgeRed: { background: '#fde8e8', color: '#c0392b' },
  row: {
    display: 'flex',
    gap: 24,
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  col: { flex: '1 1 200px' },
  card: {
    border: '1px solid #e8e8e8',
    borderRadius: 4,
    padding: '16px 20px',
    marginBottom: 12,
  },
  input: {
    border: '1px solid #e8e8e8',
    borderRadius: 2,
    padding: '12px 14px',
    fontSize: 16,
    fontFamily: 'inherit',
    color: '#111111',
    outline: 'none',
    background: '#ffffff',
    width: '100%',
    boxSizing: 'border-box',
    minHeight: 44,
  },
  textarea: {
    border: '1px solid #e8e8e8',
    borderRadius: 2,
    padding: '12px 14px',
    fontSize: 14,
    fontFamily: 'inherit',
    color: '#111111',
    outline: 'none',
    background: '#ffffff',
    width: '100%',
    boxSizing: 'border-box',
    minHeight: 80,
    resize: 'vertical',
  },
  btn: {
    background: '#111111',
    color: '#ffffff',
    border: 'none',
    borderRadius: 2,
    padding: '12px 20px',
    fontSize: 11,
    letterSpacing: '0.15em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    minHeight: 44,
    transition: 'background 0.15s',
  },
  btnSmall: {
    background: '#111111',
    color: '#ffffff',
    border: 'none',
    borderRadius: 2,
    padding: '8px 14px',
    fontSize: 10,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    minHeight: 36,
  },
  btnOutline: {
    background: 'transparent',
    color: '#111111',
    border: '1px solid #e8e8e8',
    borderRadius: 2,
    padding: '8px 14px',
    fontSize: 10,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    minHeight: 36,
  },
  btnDisabled: { background: '#cccccc', cursor: 'not-allowed' },
  empty: {
    color: '#888888',
    fontSize: 13,
    padding: '20px 0',
  },
  profileRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    marginBottom: 20,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: '50%',
    objectFit: 'cover',
    background: '#e8e8e8',
    flexShrink: 0,
  },
  profileName: {
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    fontSize: 22,
    fontWeight: 300,
    color: '#111111',
  },
  profileHandle: {
    fontSize: 13,
    color: '#888888',
  },
  copyBtn: {
    background: 'transparent',
    border: '1px solid #e8e8e8',
    borderRadius: 2,
    padding: '6px 12px',
    fontSize: 10,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    color: '#888888',
    marginLeft: 8,
  },
  adCard: {
    border: '1px solid #e8e8e8',
    borderRadius: 12,
    overflow: 'hidden',
    maxWidth: 320,
  },
  adPreviewWrap: {
    width: 320,
    height: 570,
    overflow: 'hidden',
    borderRadius: '12px 12px 0 0',
    background: '#f5f5f5',
  },
  adPreview: {
    width: 320,
    height: 570,
    border: 'none',
    display: 'block',
  },
  adInfo: {
    padding: '14px 16px',
  },
  searchResult: {
    border: '1px solid #e8e8e8',
    borderRadius: 4,
    padding: '12px 16px',
    marginBottom: 8,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  cartItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 0',
    borderBottom: '1px solid #e8e8e8',
    fontSize: 13,
  },
}

export default function CreatorDashboard() {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [creator, setCreator] = useState(null)
  const [invite, setInvite] = useState(null)
  const [influencer, setInfluencer] = useState(null)
  const [orders, setOrders] = useState([])

  // Request styles
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [cart, setCart] = useState([])
  const [requestSubmitting, setRequestSubmitting] = useState(false)
  const [requestSuccess, setRequestSuccess] = useState(false)
  const [pastRequests, setPastRequests] = useState([])

  // Meta ads
  const [ads, setAds] = useState([])
  const [adsLoading, setAdsLoading] = useState(false)

  // Content submissions
  const [contentMonth, setContentMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [contentUrl, setContentUrl] = useState('')
  const [contentNotes, setContentNotes] = useState('')
  const [contentSubmitting, setContentSubmitting] = useState(false)
  const [contentSuccess, setContentSuccess] = useState(false)
  const [submissions, setSubmissions] = useState([])

  const [copied, setCopied] = useState(false)

  // Load creator data
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/invite')
        return
      }

      // Fetch creator
      const { data: creatorData } = await supabase
        .from('creators')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (!creatorData) {
        router.push('/invite')
        return
      }
      setCreator(creatorData)

      // Fetch invite with terms
      const { data: inviteData } = await supabase
        .from('creator_invites')
        .select('*')
        .eq('id', creatorData.invite_id)
        .single()
      setInvite(inviteData)

      // Fetch influencer profile if linked
      if (inviteData?.influencer_id) {
        const { data: infData } = await supabase
          .from('influencers')
          .select('*')
          .eq('id', inviteData.influencer_id)
          .single()
        setInfluencer(infData)

        // Fetch orders
        if (infData) {
          const { data: orderData } = await supabase
            .from('influencer_orders')
            .select('*')
            .eq('influencer_id', infData.id)
            .order('order_date', { ascending: false })
          setOrders(orderData || [])
        }

        // Fetch Meta ads
        if (infData?.instagram_handle) {
          setAdsLoading(true)
          try {
            const res = await fetch(`/api/meta/creator-ads?handle=${encodeURIComponent(infData.instagram_handle)}`)
            const data = await res.json()
            setAds(data.ads || [])
          } catch {}
          setAdsLoading(false)
        }
      }

      // Fetch past sample requests
      const { data: reqData } = await supabase
        .from('creator_sample_requests')
        .select('*')
        .eq('creator_id', creatorData.id)
        .order('created_at', { ascending: false })
      setPastRequests(reqData || [])

      // Fetch content submissions
      const { data: subData } = await supabase
        .from('creator_content_submissions')
        .select('*')
        .eq('creator_id', creatorData.id)
        .order('created_at', { ascending: false })
      setSubmissions(subData || [])

      setLoading(false)
    }
    load()
  }, [])

  // Product search
  const searchProducts = useCallback(async () => {
    if (!searchQuery.trim()) return
    setSearching(true)
    try {
      const res = await fetch(`/api/shopify/products?query=${encodeURIComponent(searchQuery)}`)
      const data = await res.json()
      setSearchResults(data.products || [])
    } catch {}
    setSearching(false)
  }, [searchQuery])

  function addToCart(product) {
    if (cart.find(c => c.variant_id === product.variant_id)) return
    setCart(prev => [...prev, {
      shopify_variant_id: product.variant_id,
      product_title: product.title,
      variant_title: product.variant_title,
      quantity: 1,
    }])
  }

  function removeFromCart(variantId) {
    setCart(prev => prev.filter(c => c.shopify_variant_id !== variantId))
  }

  async function submitRequest() {
    if (!cart.length || !creator) return
    setRequestSubmitting(true)
    const { error } = await supabase.from('creator_sample_requests').insert({
      creator_id: creator.id,
      influencer_id: influencer?.id || null,
      selections: cart,
      status: 'pending',
    })
    if (!error) {
      setRequestSuccess(true)
      setCart([])
      setSearchResults([])
      setSearchQuery('')
      const { data } = await supabase
        .from('creator_sample_requests')
        .select('*')
        .eq('creator_id', creator.id)
        .order('created_at', { ascending: false })
      setPastRequests(data || [])
    }
    setRequestSubmitting(false)
  }

  async function submitContent() {
    if (!contentUrl.trim() || !creator) return
    setContentSubmitting(true)
    const { error } = await supabase.from('creator_content_submissions').insert({
      creator_id: creator.id,
      month: contentMonth,
      video_url: contentUrl,
      notes: contentNotes || null,
      status: 'submitted',
    })
    if (!error) {
      setContentSuccess(true)
      setContentUrl('')
      setContentNotes('')
      const { data } = await supabase
        .from('creator_content_submissions')
        .select('*')
        .eq('creator_id', creator.id)
        .order('created_at', { ascending: false })
      setSubmissions(data || [])
      setTimeout(() => setContentSuccess(false), 3000)
    }
    setContentSubmitting(false)
  }

  function copyCode() {
    navigator.clipboard.writeText(creator?.affiliate_code || '')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <div style={S.page}>
        <div style={S.container}>
          <div style={{ color: '#888888', fontSize: 13 }}>Loading...</div>
        </div>
      </div>
    )
  }

  const statusBadge = (status) => {
    const map = {
      pending: S.badgePending,
      approved: S.badgeGreen,
      rejected: S.badgeRed,
      submitted: S.badgePending,
      revision_requested: S.badgeYellow,
      ACTIVE: S.badgeGreen,
      PAUSED: S.badgePending,
    }
    return { ...S.badge, ...(map[status] || S.badgePending) }
  }

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&display=swap" rel="stylesheet" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <style>{`
        @media (max-width: 480px) {
          .nama-dash-container { padding: 24px 16px !important; }
        }
      `}</style>
      <div style={S.page} className="nama-dash-container">
        <div style={S.container}>
          <img src="/nama-logo.svg" alt="Nama" style={S.logo} />

          {/* Section 1: Partnership */}
          <div style={S.section}>
            <h2 style={S.sectionTitle}>Partnership</h2>

            {influencer && (
              <div style={S.profileRow}>
                {influencer.profile_photo_url ? (
                  <img src={influencer.profile_photo_url} alt="" style={S.avatar} />
                ) : (
                  <div style={S.avatar} />
                )}
                <div>
                  <div style={S.profileName}>{influencer.name}</div>
                  <div style={S.profileHandle}>@{influencer.instagram_handle}</div>
                </div>
              </div>
            )}

            {creator?.affiliate_code && (
              <div style={{ marginBottom: 16 }}>
                <div style={S.label}>Affiliate Code</div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span style={{ ...S.value, marginBottom: 0, fontFamily: 'monospace', fontSize: 16 }}>
                    {creator.affiliate_code}
                  </span>
                  <button style={S.copyBtn} onClick={copyCode}>
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            )}

            <div style={S.row}>
              <div style={S.col}>
                <div style={S.label}>Commission</div>
                <div style={S.value}>{invite?.commission_rate || creator?.commission_rate}%</div>
              </div>
              <div style={S.col}>
                <div style={S.label}>Videos / Month</div>
                <div style={S.value}>{invite?.videos_per_month || '—'}</div>
              </div>
            </div>
            <div style={S.row}>
              <div style={S.col}>
                <div style={S.label}>Usage Rights</div>
                <div style={S.value}>{invite?.usage_rights || '—'}</div>
              </div>
              <div style={S.col}>
                <div style={S.label}>Status</div>
                <div style={S.value}>
                  <span style={{ ...S.badge, ...S.badgeActive }}>Active</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Wardrobe */}
          <div style={S.section}>
            <h2 style={S.sectionTitle}>Wardrobe</h2>
            {orders.length === 0 ? (
              <p style={S.empty}>No orders yet - your outfits will show up here once shipped.</p>
            ) : (
              orders.map(order => (
                <div key={order.id} style={S.card}>
                  <div style={{ fontSize: 11, color: '#888888', marginBottom: 6 }}>
                    {new Date(order.order_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {order.order_number && ` — #${order.order_number}`}
                  </div>
                  {(order.line_items || []).map((item, i) => (
                    <div key={i} style={{ fontSize: 14, color: '#111111', marginBottom: 2 }}>
                      {item.product_name}
                      {item.variant_title && <span style={{ color: '#888888' }}> — {item.variant_title}</span>}
                      {item.quantity > 1 && <span style={{ color: '#888888' }}> x{item.quantity}</span>}
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>

          {/* Section 3: Request Styles */}
          <div style={S.section}>
            <h2 style={S.sectionTitle}>Request Styles</h2>

            {requestSuccess ? (
              <div style={{ padding: '20px 0' }}>
                <p style={{ fontSize: 15, color: '#111111', marginBottom: 8 }}>Your request has been sent - we'll confirm shortly.</p>
                <button style={S.btnSmall} onClick={() => setRequestSuccess(false)}>Request More</button>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  <input
                    style={{ ...S.input, flex: 1 }}
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && searchProducts()}
                    placeholder="Search by product name or SKU..."
                  />
                  <button
                    style={S.btn}
                    onClick={searchProducts}
                    disabled={searching}
                  >
                    {searching ? '...' : 'Search'}
                  </button>
                </div>

                {searchResults.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    {searchResults.slice(0, 20).map(product => (
                      <div key={product.variant_id} style={S.searchResult}>
                        <div>
                          <div style={{ fontSize: 14, color: '#111111' }}>{product.title}</div>
                          <div style={{ fontSize: 12, color: '#888888' }}>
                            {product.variant_title && `${product.variant_title} — `}
                            {product.sku && `SKU: ${product.sku} — `}
                            {product.inventory != null && `${product.inventory} in stock`}
                          </div>
                        </div>
                        <button
                          style={cart.find(c => c.shopify_variant_id === product.variant_id) ? { ...S.btnSmall, ...S.btnDisabled } : S.btnSmall}
                          onClick={() => addToCart(product)}
                          disabled={cart.find(c => c.shopify_variant_id === product.variant_id)}
                        >
                          {cart.find(c => c.shopify_variant_id === product.variant_id) ? 'Added' : 'Add'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {cart.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={S.label}>Your Request ({cart.length} items)</div>
                    {cart.map(item => (
                      <div key={item.shopify_variant_id} style={S.cartItem}>
                        <span>
                          {item.product_title}
                          {item.variant_title && ` — ${item.variant_title}`}
                        </span>
                        <button
                          style={{ ...S.copyBtn, color: '#c0392b', borderColor: '#e8c8c5' }}
                          onClick={() => removeFromCart(item.shopify_variant_id)}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <button
                      style={{ ...S.btn, marginTop: 12, width: '100%' }}
                      onClick={submitRequest}
                      disabled={requestSubmitting}
                    >
                      {requestSubmitting ? 'Submitting...' : 'Submit Request'}
                    </button>
                  </div>
                )}
              </>
            )}

            {pastRequests.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <div style={S.label}>Past Requests</div>
                {pastRequests.map(req => (
                  <div key={req.id} style={S.card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 11, color: '#888888' }}>
                        {new Date(req.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                      <span style={statusBadge(req.status)}>{req.status}</span>
                    </div>
                    {(req.selections || []).map((sel, i) => (
                      <div key={i} style={{ fontSize: 13, color: '#111111' }}>
                        {sel.product_title}{sel.variant_title && ` — ${sel.variant_title}`}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 4: Live Ads */}
          <div style={S.section}>
            <h2 style={S.sectionTitle}>Live Ads</h2>
            {adsLoading ? (
              <p style={S.empty}>Loading ads...</p>
            ) : ads.length === 0 ? (
              <p style={S.empty}>No ads running with your content yet.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 320px))', gap: 16 }}>
                {ads.map((ad, i) => (
                  <div key={i} style={S.adCard}>
                    {ad.previewHtml ? (
                      <div style={S.adPreviewWrap}>
                        <iframe
                          srcDoc={ad.previewHtml}
                          width="320"
                          height="570"
                          style={S.adPreview}
                          sandbox="allow-scripts allow-same-origin"
                          scrolling="no"
                        />
                      </div>
                    ) : (
                      <div style={{ ...S.adPreviewWrap, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888888', fontSize: 13 }}>
                        Preview unavailable
                      </div>
                    )}
                    <div style={S.adInfo}>
                      <div style={{ fontSize: 14, color: '#111111', marginBottom: 8, lineHeight: 1.4 }}>{ad.name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <span style={{
                          fontSize: 10,
                          letterSpacing: '0.05em',
                          textTransform: 'uppercase',
                          padding: '3px 8px',
                          borderRadius: 3,
                          fontWeight: 500,
                          ...(ad.status === 'ACTIVE'
                            ? { background: '#ecfdf5', color: '#059669' }
                            : { background: '#f3f4f6', color: '#6b7280' }),
                        }}>{ad.status}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#888888' }}>
                        <span>${parseFloat(ad.spend).toLocaleString('en-US', { minimumFractionDigits: 2 })} spent</span>
                        <span>{parseInt(ad.impressions).toLocaleString()} impressions</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 5: Content Submissions */}
          <div style={S.sectionLast}>
            <h2 style={S.sectionTitle}>Content Submissions</h2>

            <div style={{ display: 'grid', gap: 12, marginBottom: 20 }}>
              <div>
                <div style={S.label}>Month</div>
                <input
                  style={S.input}
                  type="month"
                  value={contentMonth}
                  onChange={e => setContentMonth(e.target.value)}
                />
              </div>
              <div>
                <div style={S.label}>Video URL</div>
                <input
                  style={S.input}
                  value={contentUrl}
                  onChange={e => setContentUrl(e.target.value)}
                  placeholder="Google Drive, Dropbox, or direct link..."
                />
              </div>
              <div>
                <div style={S.label}>Notes (optional)</div>
                <textarea
                  style={S.textarea}
                  value={contentNotes}
                  onChange={e => setContentNotes(e.target.value)}
                  placeholder="Any notes about this video..."
                />
              </div>
              {contentSuccess && (
                <div style={{ fontSize: 13, color: '#1e7e34' }}>Submitted successfully.</div>
              )}
              <button
                style={!contentUrl.trim() || contentSubmitting ? { ...S.btn, ...S.btnDisabled } : S.btn}
                onClick={submitContent}
                disabled={!contentUrl.trim() || contentSubmitting}
              >
                {contentSubmitting ? 'Submitting...' : 'Submit Content'}
              </button>
            </div>

            {submissions.length > 0 && (
              <div>
                <div style={S.label}>Past Submissions</div>
                {submissions.map(sub => (
                  <div key={sub.id} style={S.card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: '#888888' }}>{sub.month}</span>
                      <span style={statusBadge(sub.status)}>{sub.status.replace('_', ' ')}</span>
                    </div>
                    <a href={sub.video_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: '#111111', wordBreak: 'break-all' }}>
                      {sub.video_url}
                    </a>
                    {sub.notes && <div style={{ fontSize: 12, color: '#888888', marginTop: 4 }}>{sub.notes}</div>}
                    {sub.reviewer_notes && (
                      <div style={{ fontSize: 12, color: '#a68307', marginTop: 4, padding: '6px 8px', background: '#fff8e1', borderRadius: 2 }}>
                        Feedback: {sub.reviewer_notes}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
