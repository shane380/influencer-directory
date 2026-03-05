'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const S = {
  root: {
    minHeight: '100vh',
    background: '#faf8f4',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'Jost', 'Inter', sans-serif",
    fontWeight: 300,
    padding: '40px 20px',
  },
  card: {
    background: '#fff',
    border: '1px solid #d6cfc4',
    borderRadius: 4,
    maxWidth: 560,
    width: '100%',
    padding: '56px 48px',
    position: 'relative',
    overflow: 'hidden',
  },
  cardAccent: {
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
    width: 3,
    background: '#c9a87c',
  },
  eyebrow: {
    fontSize: 11,
    letterSpacing: '0.25em',
    textTransform: 'uppercase',
    color: '#b5a99a',
    marginBottom: 12,
  },
  headline: {
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    fontSize: 38,
    fontWeight: 300,
    lineHeight: 1.15,
    color: '#1a1512',
    marginBottom: 8,
  },
  headlineEm: {
    fontStyle: 'italic',
    color: '#7a6a5a',
  },
  intro: {
    fontSize: 14,
    color: '#7a6a5a',
    lineHeight: 1.75,
    marginBottom: 36,
    borderBottom: '1px solid #e8e2db',
    paddingBottom: 28,
  },
  termsGrid: {
    display: 'grid',
    gap: 18,
    marginBottom: 32,
  },
  termRow: {
    display: 'grid',
    gridTemplateColumns: '140px 1fr',
    gap: 12,
    alignItems: 'start',
  },
  termLabel: {
    fontSize: 10,
    letterSpacing: '0.2em',
    textTransform: 'uppercase',
    color: '#b5a99a',
    paddingTop: 3,
  },
  termValue: {
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    fontSize: 18,
    color: '#2c2620',
    lineHeight: 1.4,
  },
  termNote: {
    fontSize: 12,
    color: '#b5a99a',
    marginTop: 2,
    fontFamily: 'inherit',
  },
  commissionBlock: {
    background: '#1a1512',
    borderRadius: 2,
    padding: '24px 28px',
    marginBottom: 32,
    display: 'flex',
    alignItems: 'center',
    gap: 20,
  },
  commissionRate: {
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    fontSize: 48,
    fontWeight: 300,
    color: '#c9a87c',
    lineHeight: 1,
    flexShrink: 0,
  },
  commissionDesc: {
    fontSize: 13,
    color: '#b5a99a',
    lineHeight: 1.6,
  },
  sectionLabel: {
    fontSize: 10,
    letterSpacing: '0.25em',
    textTransform: 'uppercase',
    color: '#b5a99a',
    marginBottom: 20,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  rule: {
    flex: 1,
    height: 1,
    background: '#e8e2db',
  },
  form: { display: 'grid', gap: 14 },
  inputWrap: { display: 'grid', gap: 6 },
  inputLabel: {
    fontSize: 10,
    letterSpacing: '0.2em',
    textTransform: 'uppercase',
    color: '#b5a99a',
  },
  input: {
    border: '1px solid #d6cfc4',
    borderRadius: 2,
    padding: '12px 14px',
    fontSize: 14,
    fontFamily: 'inherit',
    color: '#1a1512',
    outline: 'none',
    background: '#faf8f4',
    width: '100%',
    transition: 'border-color 0.15s',
  },
  btn: {
    background: '#1a1512',
    color: '#faf8f4',
    border: 'none',
    borderRadius: 2,
    padding: '14px 24px',
    fontSize: 12,
    letterSpacing: '0.2em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    marginTop: 4,
    transition: 'background 0.15s',
  },
  btnDisabled: {
    background: '#b5a99a',
    cursor: 'not-allowed',
  },
  error: {
    fontSize: 13,
    color: '#c0392b',
    padding: '10px 14px',
    background: '#fdf3f2',
    border: '1px solid #e8c8c5',
    borderRadius: 2,
  },
  success: {
    textAlign: 'center',
    padding: '32px 0 0',
  },
  successIcon: {
    fontSize: 36,
    marginBottom: 16,
  },
  successTitle: {
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    fontSize: 28,
    fontWeight: 300,
    color: '#1a1512',
    marginBottom: 8,
  },
  successText: {
    fontSize: 14,
    color: '#7a6a5a',
    lineHeight: 1.7,
  },
  notFound: {
    textAlign: 'center',
    color: '#b5a99a',
    fontSize: 14,
  },
}

export default function InvitePage() {
  const { slug } = useParams()
  const router = useRouter()
  const supabase = createClient()

  const [invite, setInvite] = useState(null)
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState('view')

  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('creator_invites')
        .select('*')
        .eq('slug', slug)
        .single()

      if (!error && data) {
        setInvite(data)
        setForm(f => ({ ...f, name: data.creator_name, email: data.creator_email || '' }))
      }
      setLoading(false)
    }
    if (slug) load()
  }, [slug])

  async function handleSignup() {
    setError(null)
    setSubmitting(true)

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: { data: { full_name: form.name, role: 'creator' } },
    })

    if (authError) {
      setError(authError.message)
      setSubmitting(false)
      return
    }

    const affiliateCode = form.name.toUpperCase().replace(/\s+/g, '') + invite.commission_rate
    const { error: creatorError } = await supabase.from('creators').insert({
      invite_id: invite.id,
      user_id: authData.user.id,
      creator_name: form.name,
      email: form.email,
      commission_rate: invite.commission_rate,
      affiliate_code: affiliateCode,
    })

    if (creatorError) {
      setError(creatorError.message)
      setSubmitting(false)
      return
    }

    await supabase
      .from('creator_invites')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', invite.id)

    setStep('done')
    setSubmitting(false)
  }

  if (loading) {
    return (
      <div style={S.root}>
        <div style={{ color: '#b5a99a', fontSize: 13, letterSpacing: '0.1em' }}>Loading…</div>
      </div>
    )
  }

  if (!invite) {
    return (
      <div style={S.root}>
        <div style={S.notFound}>
          <p style={{ fontSize: 32, marginBottom: 12 }}>🌸</p>
          <p>This invite link doesn't exist or has expired.</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&family=Jost:wght@300;400&display=swap" rel="stylesheet" />
      <div style={S.root}>
        <div style={S.card}>
          <div style={S.cardAccent} />

          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <img src="/nama-logo.svg" alt="Nama" style={{ width: 80, display: 'inline-block' }} />
          </div>

          {step === 'done' && (
            <div style={S.success}>
              <div style={S.successIcon}>✦</div>
              <h2 style={S.successTitle}>You're in, {invite.creator_name.split(' ')[0]}.</h2>
              <p style={S.successText}>Welcome to the Nama creator family. We'll be in touch with next steps — outfits incoming. 🌿</p>
            </div>
          )}

          {step === 'view' && (
            <>
              <p style={S.eyebrow}>You're invited</p>
              <h1 style={S.headline}>
                Hi {invite.creator_name.split(' ')[0]},<br />
                <span style={S.headlineEm}>let's make it official.</span>
              </h1>
              <p style={S.intro}>
                We've truly loved working with you — and we'd love to make this an ongoing partnership. Here's everything we're proposing, all in one place.
              </p>

              <div style={{ ...S.sectionLabel, marginBottom: 20 }}>
                <span>Partnership Terms</span>
                <div style={S.rule} />
              </div>
              <div style={S.termsGrid}>
                <div style={S.termRow}>
                  <span style={S.termLabel}>Content</span>
                  <div>
                    <div style={S.termValue}>{invite.videos_per_month} videos / month</div>
                    <div style={S.termNote}>{invite.content_type}</div>
                  </div>
                </div>
                <div style={S.termRow}>
                  <span style={S.termLabel}>Posting</span>
                  <div>
                    <div style={S.termValue}>No posting required</div>
                    <div style={S.termNote}>Content is used for paid ads only.</div>
                  </div>
                </div>
                <div style={S.termRow}>
                  <span style={S.termLabel}>Outfits</span>
                  <div>
                    <div style={S.termValue}>Fully provided</div>
                    <div style={S.termNote}>New & upcoming drops included — always filming in the latest.</div>
                  </div>
                </div>
                <div style={S.termRow}>
                  <span style={S.termLabel}>Usage Rights</span>
                  <div>
                    <div style={S.termValue}>{invite.usage_rights}</div>
                  </div>
                </div>
              </div>

              <div style={S.commissionBlock}>
                <div style={S.commissionRate}>{invite.commission_rate}%</div>
                <div style={S.commissionDesc}>
                  Affiliate commission on every sale through your link. No cap — tracked automatically, paid monthly.
                </div>
              </div>

              <button style={S.btn} onClick={() => setStep('signup')}>
                Accept & Create Account →
              </button>
            </>
          )}

          {step === 'signup' && (
            <>
              <p style={S.eyebrow}>Create your account</p>
              <h2 style={{ ...S.headline, fontSize: 28, marginBottom: 24 }}>
                Almost there, <span style={S.headlineEm}>{invite.creator_name.split(' ')[0]}.</span>
              </h2>

              <div style={S.form}>
                <div style={S.inputWrap}>
                  <label style={S.inputLabel}>Your Name</label>
                  <input style={S.input} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Charlee" />
                </div>
                <div style={S.inputWrap}>
                  <label style={S.inputLabel}>Email</label>
                  <input style={S.input} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="charlee@email.com" />
                </div>
                <div style={S.inputWrap}>
                  <label style={S.inputLabel}>Password</label>
                  <input style={S.input} type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Choose a password" />
                </div>

                {error && <div style={S.error}>{error}</div>}

                <button
                  style={submitting ? { ...S.btn, ...S.btnDisabled } : S.btn}
                  onClick={handleSignup}
                  disabled={submitting || !form.email || !form.password}
                >
                  {submitting ? 'Creating account…' : 'Create Account →'}
                </button>

                <button style={{ ...S.btn, background: 'transparent', color: '#b5a99a', fontSize: 11 }} onClick={() => setStep('view')}>
                  ← Back
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
