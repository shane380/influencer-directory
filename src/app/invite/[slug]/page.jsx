'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const S = {
  root: {
    minHeight: '100vh',
    background: '#F0F0F0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'Helvetica Neue', Helvetica, sans-serif",
    fontWeight: 300,
    padding: '40px 20px',
    boxSizing: 'border-box',
  },
  card: {
    background: '#ffffff',
    border: '1px solid #e8e8e8',
    borderRadius: 4,
    maxWidth: 560,
    width: '100%',
    padding: '56px 48px',
  },
  eyebrow: {
    fontSize: 11,
    letterSpacing: '0.15em',
    textTransform: 'uppercase',
    color: '#888888',
    marginBottom: 12,
  },
  headline: {
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    fontSize: 'clamp(28px, 8vw, 38px)',
    fontWeight: 300,
    lineHeight: 1.15,
    color: '#111111',
    marginBottom: 8,
  },
  headlineEm: {
    fontStyle: 'italic',
    color: '#111111',
  },
  intro: {
    fontSize: 14,
    color: '#888888',
    lineHeight: 1.75,
    marginBottom: 36,
    borderBottom: '1px solid #e8e8e8',
    paddingBottom: 28,
  },
  termsGrid: {
    display: 'grid',
    gap: 18,
    marginBottom: 32,
  },
  termLabel: {
    fontSize: 10,
    letterSpacing: '0.15em',
    textTransform: 'uppercase',
    color: '#888888',
    paddingTop: 3,
  },
  termValue: {
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    fontSize: 18,
    color: '#111111',
    lineHeight: 1.4,
  },
  termNote: {
    fontSize: 12,
    color: '#888888',
    marginTop: 2,
    fontFamily: 'inherit',
  },
  commissionDesc: {
    fontSize: 13,
    color: '#ffffff',
    lineHeight: 1.6,
    opacity: 0.7,
  },
  sectionLabel: {
    fontSize: 10,
    letterSpacing: '0.15em',
    textTransform: 'uppercase',
    color: '#888888',
    marginBottom: 20,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  rule: {
    flex: 1,
    height: 1,
    background: '#e8e8e8',
  },
  checkboxWrap: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 20,
    cursor: 'pointer',
    minHeight: 44,
  },
  checkboxLabel: {
    fontSize: 12,
    color: '#888888',
    lineHeight: 1.6,
    userSelect: 'none',
  },
  form: { display: 'grid', gap: 14 },
  inputWrap: { display: 'grid', gap: 6 },
  inputLabel: {
    fontSize: 10,
    letterSpacing: '0.15em',
    textTransform: 'uppercase',
    color: '#888888',
  },
  input: {
    border: '1px solid #e8e8e8',
    borderRadius: 2,
    padding: '12px 14px',
    minHeight: 44,
    fontSize: 16,
    fontFamily: 'inherit',
    color: '#111111',
    outline: 'none',
    background: '#ffffff',
    width: '100%',
    transition: 'border-color 0.15s',
    boxSizing: 'border-box',
  },
  btn: {
    width: '100%',
    background: '#111111',
    color: '#ffffff',
    border: 'none',
    borderRadius: 2,
    padding: '14px 24px',
    minHeight: 44,
    fontSize: 12,
    letterSpacing: '0.15em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    marginTop: 4,
    transition: 'background 0.15s',
    boxSizing: 'border-box',
  },
  btnDisabled: {
    background: '#cccccc',
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
    color: '#111111',
    marginBottom: 8,
  },
  successText: {
    fontSize: 14,
    color: '#888888',
    lineHeight: 1.7,
  },
  notFound: {
    textAlign: 'center',
    color: '#888888',
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
  const [agreed, setAgreed] = useState(false)

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

    // If email confirmation is required, user will be null — show confirmation message
    if (!authData.user) {
      await supabase
        .from('creator_invites')
        .update({ status: 'accepted', accepted_at: new Date().toISOString() })
        .eq('id', invite.id)

      setStep('confirm-email')
      setSubmitting(false)
      return
    }

    const affiliateCode = form.name.toUpperCase().replace(/\s+/g, '') + invite.commission_rate
    try {
      const res = await fetch('/api/creators/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inviteId: invite.id,
          userId: authData.user.id,
          creatorName: form.name,
          email: form.email,
          commissionRate: invite.commission_rate,
          affiliateCode,
        }),
      })
      const result = await res.json()
      if (!res.ok) {
        setError(result.error || 'Something went wrong creating your profile.')
        setSubmitting(false)
        return
      }
    } catch (err) {
      setError('Something went wrong creating your profile. Please try again.')
      setSubmitting(false)
      return
    }

    setStep('done')
    setSubmitting(false)
  }

  if (loading) {
    return (
      <div style={S.root}>
        <div style={{ color: '#888888', fontSize: 13, letterSpacing: '0.1em' }}>Loading…</div>
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
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&display=swap" rel="stylesheet" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <style>{`
        .nama-checkbox {
          width: 16px;
          height: 16px;
          min-width: 16px;
          appearance: none;
          -webkit-appearance: none;
          border: 1px solid #111111;
          border-radius: 2px;
          background: transparent;
          cursor: pointer;
          position: relative;
          margin-top: 2px;
          padding: 0;
        }
        .nama-checkbox:checked {
          background: #111111;
        }
        .nama-checkbox:checked::after {
          content: '';
          position: absolute;
          left: 4px;
          top: 1.5px;
          width: 5px;
          height: 8px;
          border: solid #ffffff;
          border-width: 0 1.5px 1.5px 0;
          transform: rotate(45deg);
        }
        .nama-card {
          background: #ffffff;
          border: 1px solid #e8e8e8;
          border-radius: 4px;
          max-width: 560px;
          width: 100%;
          padding: 56px 48px;
        }
        .nama-term-row {
          display: grid;
          grid-template-columns: 140px 1fr;
          gap: 12px;
          align-items: start;
        }
        .nama-commission-block {
          background: #111111;
          border-radius: 2px;
          padding: 24px 28px;
          margin-bottom: 32px;
          display: flex;
          align-items: center;
          gap: 20px;
        }
        .nama-commission-rate {
          font-family: 'Cormorant Garamond', Georgia, serif;
          font-size: 48px;
          font-weight: 300;
          color: #ffffff;
          line-height: 1;
          flex-shrink: 0;
        }
        @media (max-width: 480px) {
          .nama-card {
            padding: 32px 24px;
          }
          .nama-term-row {
            grid-template-columns: 1fr;
            gap: 4px;
          }
          .nama-commission-block {
            flex-direction: column;
            align-items: flex-start;
            padding: 20px 20px;
            gap: 12px;
          }
          .nama-commission-rate {
            font-size: 36px;
          }
          .nama-signup-headline {
            font-size: clamp(22px, 6vw, 28px) !important;
          }
        }
      `}</style>
      <div style={S.root}>
        <div className="nama-card">
          <div style={{ marginBottom: 32 }}>
            <img src="/nama-logo.svg" alt="Nama" style={{ width: 80, display: 'block' }} />
          </div>

          {step === 'done' && (
            <div style={S.success}>
              <div style={S.successIcon}>✦</div>
              <h2 style={S.successTitle}>You're in, {invite.creator_name.split(' ')[0]}.</h2>
              <p style={S.successText}>Welcome to the Nama creator family. We'll be in touch with next steps - outfits incoming. 🌿</p>
            </div>
          )}

          {step === 'confirm-email' && (
            <div style={S.success}>
              <div style={S.successIcon}>✉</div>
              <h2 style={S.successTitle}>Check your email</h2>
              <p style={S.successText}>We've sent a confirmation link to <strong>{form.email}</strong>. Click the link to confirm your account and complete signup.</p>
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
                <div className="nama-term-row">
                  <span style={S.termLabel}>Content</span>
                  <div>
                    <div style={S.termValue}>{invite.videos_per_month} videos / month</div>
                    <div style={S.termNote}>{invite.content_type}</div>
                  </div>
                </div>
                <div className="nama-term-row">
                  <span style={S.termLabel}>Posting</span>
                  <div>
                    <div style={S.termValue}>No posting required</div>
                    <div style={S.termNote}>Content is used for paid ads only.</div>
                  </div>
                </div>
                <div className="nama-term-row">
                  <span style={S.termLabel}>Outfits</span>
                  <div>
                    <div style={S.termValue}>Fully provided</div>
                    <div style={S.termNote}>New & upcoming drops included — always filming in the latest.</div>
                  </div>
                </div>
                <div className="nama-term-row">
                  <span style={S.termLabel}>Usage Rights</span>
                  <div>
                    <div style={S.termValue}>{invite.usage_rights}</div>
                  </div>
                </div>
              </div>

              <div className="nama-commission-block">
                <div className="nama-commission-rate">{invite.commission_rate}%</div>
                <div style={S.commissionDesc}>
                  Affiliate commission on every sale through your link. No cap — tracked automatically, paid monthly.
                </div>
              </div>

              <label style={S.checkboxWrap}>
                <input
                  type="checkbox"
                  className="nama-checkbox"
                  checked={agreed}
                  onChange={e => setAgreed(e.target.checked)}
                />
                <span style={S.checkboxLabel}>
                  {`I agree to the partnership terms above, including providing ${invite.videos_per_month} UGC videos per month, ${invite.usage_rights}, and ${invite.commission_rate}% affiliate commission on sales.`}
                </span>
              </label>

              <button
                style={!agreed ? { ...S.btn, ...S.btnDisabled } : S.btn}
                onClick={() => setStep('signup')}
                disabled={!agreed}
              >
                Accept & Create Account →
              </button>
            </>
          )}

          {step === 'signup' && (
            <>
              <p style={S.eyebrow}>Create your account</p>
              <h2 className="nama-signup-headline" style={{ ...S.headline, fontSize: 28, marginBottom: 24 }}>
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

                <button style={{ ...S.btn, background: 'transparent', color: '#888888', fontSize: 11 }} onClick={() => setStep('view')}>
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
