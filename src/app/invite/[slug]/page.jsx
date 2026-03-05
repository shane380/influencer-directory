'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const S = {
  root: {
    minHeight: '100vh',
    background: '#f8f7f5',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'Didact Gothic', sans-serif",
    fontWeight: 400,
    padding: '60px 20px',
  },
  wrapper: {
    maxWidth: 520,
    width: '100%',
  },
  logoArea: {
    textAlign: 'center',
    marginBottom: 40,
  },
  logoText: {
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    fontSize: 13,
    letterSpacing: '0.55em',
    textTransform: 'uppercase',
    color: '#0a0a0a',
    marginBottom: 10,
  },
  dots: {
    display: 'flex',
    justifyContent: 'center',
    gap: 5,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: '50%',
    background: '#0a0a0a',
  },
  diamondRule: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    marginBottom: 36,
  },
  ruleLine: {
    flex: 1,
    height: 1,
    background: '#d8d8d8',
  },
  diamond: {
    width: 5,
    height: 5,
    background: '#0a0a0a',
    transform: 'rotate(45deg)',
    flexShrink: 0,
  },
  eyebrow: {
    fontSize: 9,
    letterSpacing: '0.4em',
    textTransform: 'uppercase',
    color: '#999',
    marginBottom: 14,
  },
  headline: {
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    fontSize: 52,
    fontWeight: 300,
    lineHeight: 1.08,
    color: '#0a0a0a',
    marginBottom: 10,
  },
  headlineEm: {
    fontStyle: 'italic',
    color: '#0a0a0a',
  },
  intro: {
    fontSize: 13,
    color: '#999',
    lineHeight: 1.8,
    marginBottom: 40,
    paddingBottom: 0,
  },
  sectionLabel: {
    fontSize: 8.5,
    letterSpacing: '0.45em',
    textTransform: 'uppercase',
    color: '#999',
    marginBottom: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  sectionRule: {
    flex: 1,
    height: 1,
    background: '#d8d8d8',
  },
  termsGrid: {
    display: 'grid',
    gap: 0,
    marginBottom: 32,
  },
  termRow: {
    display: 'grid',
    gridTemplateColumns: '130px 1fr',
    gap: 12,
    alignItems: 'start',
    borderTop: '1px solid #d8d8d8',
    padding: '18px 0',
  },
  termRowLast: {
    borderBottom: '1px solid #d8d8d8',
  },
  termLabel: {
    fontSize: 8.5,
    letterSpacing: '0.3em',
    textTransform: 'uppercase',
    color: '#999',
    paddingTop: 4,
  },
  termValue: {
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    fontSize: 20,
    color: '#0a0a0a',
    lineHeight: 1.4,
  },
  termNote: {
    fontSize: 11,
    color: '#999',
    marginTop: 3,
  },
  commissionBlock: {
    background: '#0a0a0a',
    padding: '32px 36px',
    marginBottom: 32,
    display: 'flex',
    alignItems: 'center',
    gap: 24,
    position: 'relative',
    overflow: 'hidden',
  },
  commissionNumber: {
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    fontSize: 72,
    fontWeight: 300,
    color: '#ffffff',
    lineHeight: 1,
    flexShrink: 0,
  },
  commissionPercent: {
    fontSize: 28,
    color: 'rgba(255,255,255,0.5)',
    verticalAlign: 'super',
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    fontWeight: 300,
  },
  commissionSep: {
    width: 1,
    height: 48,
    background: 'rgba(255,255,255,0.12)',
    flexShrink: 0,
  },
  commissionDesc: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 1.8,
  },
  commissionGhost: {
    position: 'absolute',
    right: -4,
    top: '50%',
    transform: 'translateY(-50%) rotate(90deg)',
    fontSize: 9,
    letterSpacing: '0.4em',
    color: 'rgba(255,255,255,0.06)',
    textTransform: 'uppercase',
    fontFamily: "'Didact Gothic', sans-serif",
  },
  checkboxWrap: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 20,
    cursor: 'pointer',
  },
  checkboxLabel: {
    fontSize: 12,
    color: '#999',
    lineHeight: 1.6,
    userSelect: 'none',
  },
  btn: {
    width: '100%',
    background: '#0a0a0a',
    color: '#ffffff',
    border: 'none',
    padding: '18px 24px',
    fontSize: 9.5,
    letterSpacing: '0.4em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    fontFamily: "'Didact Gothic', sans-serif",
    transition: 'background 0.15s',
  },
  btnDisabled: {
    background: '#d8d8d8',
    color: '#999',
    cursor: 'not-allowed',
  },
  footer: {
    marginTop: 40,
    textAlign: 'center',
  },
  footerText: {
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    fontSize: 14,
    fontStyle: 'italic',
    color: '#999',
    marginTop: 20,
  },
  form: { display: 'grid', gap: 14 },
  inputWrap: { display: 'grid', gap: 6 },
  inputLabel: {
    fontSize: 8.5,
    letterSpacing: '0.3em',
    textTransform: 'uppercase',
    color: '#999',
  },
  input: {
    border: '1px solid #d8d8d8',
    padding: '12px 14px',
    fontSize: 14,
    fontFamily: "'Didact Gothic', sans-serif",
    color: '#0a0a0a',
    outline: 'none',
    background: 'transparent',
    width: '100%',
    transition: 'border-color 0.15s',
  },
  error: {
    fontSize: 13,
    color: '#c0392b',
    padding: '10px 14px',
    background: '#fdf3f2',
    border: '1px solid #e8c8c5',
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
    color: '#0a0a0a',
    marginBottom: 8,
  },
  successText: {
    fontSize: 14,
    color: '#999',
    lineHeight: 1.7,
  },
  notFound: {
    textAlign: 'center',
    color: '#999',
    fontSize: 14,
  },
}

const fadeStyle = (delay) => ({
  animation: `fadeUp 0.5s ${delay}ms both`,
})

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
        <div style={{ color: '#999', fontSize: 13, letterSpacing: '0.1em' }}>Loading…</div>
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

  const DiamondRule = () => (
    <div style={S.diamondRule}>
      <div style={S.ruleLine} />
      <div style={S.diamond} />
      <div style={S.ruleLine} />
    </div>
  )

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&family=Didact+Gothic&display=swap" rel="stylesheet" />
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .nama-checkbox {
          width: 14px;
          height: 14px;
          min-width: 14px;
          appearance: none;
          -webkit-appearance: none;
          border: 1px solid #0a0a0a;
          background: transparent;
          cursor: pointer;
          position: relative;
          margin-top: 3px;
        }
        .nama-checkbox:checked {
          background: #0a0a0a;
        }
        .nama-checkbox:checked::after {
          content: '';
          position: absolute;
          left: 3.5px;
          top: 1px;
          width: 4px;
          height: 7px;
          border: solid #ffffff;
          border-width: 0 1.5px 1.5px 0;
          transform: rotate(45deg);
        }
      `}</style>
      <div style={S.root}>
        <div style={S.wrapper}>

          {step === 'done' && (
            <>
              <div style={{ ...S.logoArea, ...fadeStyle(0) }}>
                <div style={S.logoText}>NAMA</div>
                <div style={S.dots}><div style={S.dot} /><div style={S.dot} /><div style={S.dot} /></div>
              </div>
              <div style={S.success}>
                <div style={S.successIcon}>✦</div>
                <h2 style={S.successTitle}>You're in, {invite.creator_name.split(' ')[0]}.</h2>
                <p style={S.successText}>Welcome to the Nama creator family. We'll be in touch with next steps — outfits incoming. 🌿</p>
              </div>
              <div style={S.footer}>
                <DiamondRule />
                <div style={S.footerText}>With love, Daisy & the Nama team</div>
              </div>
            </>
          )}

          {step === 'view' && (
            <>
              <div style={{ ...S.logoArea, ...fadeStyle(0) }}>
                <div style={S.logoText}>NAMA</div>
                <div style={S.dots}><div style={S.dot} /><div style={S.dot} /><div style={S.dot} /></div>
              </div>

              <div style={fadeStyle(80)}>
                <DiamondRule />
              </div>

              <div style={fadeStyle(160)}>
                <p style={S.eyebrow}>A private invitation</p>
                <h1 style={S.headline}>
                  Hi {invite.creator_name.split(' ')[0]},<br />
                  <span style={S.headlineEm}>let's make it official.</span>
                </h1>
                <p style={S.intro}>
                  We've truly loved working with you — and we'd love to make this an ongoing partnership. Here's everything we're proposing, all in one place.
                </p>
              </div>

              <div style={fadeStyle(240)}>
                <div style={{ ...S.sectionLabel, marginBottom: 0 }}>
                  <span>Partnership Terms</span>
                  <div style={S.sectionRule} />
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
                  <div style={{ ...S.termRow, ...S.termRowLast }}>
                    <span style={S.termLabel}>Usage Rights</span>
                    <div>
                      <div style={S.termValue}>{invite.usage_rights}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div style={fadeStyle(320)}>
                <div style={S.commissionBlock}>
                  <div style={S.commissionNumber}>
                    {invite.commission_rate}<span style={S.commissionPercent}>%</span>
                  </div>
                  <div style={S.commissionSep} />
                  <div style={S.commissionDesc}>
                    Affiliate commission on every sale through your link. No cap — tracked automatically, paid monthly.
                  </div>
                  <div style={S.commissionGhost}>AFFILIATE</div>
                </div>
              </div>

              <div style={fadeStyle(400)}>
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
              </div>

              <div style={{ ...S.footer, ...fadeStyle(480) }}>
                <DiamondRule />
                <div style={S.footerText}>With love, Daisy & the Nama team</div>
              </div>
            </>
          )}

          {step === 'signup' && (
            <>
              <div style={{ ...S.logoArea, ...fadeStyle(0) }}>
                <div style={S.logoText}>NAMA</div>
                <div style={S.dots}><div style={S.dot} /><div style={S.dot} /><div style={S.dot} /></div>
              </div>

              <div style={fadeStyle(80)}>
                <DiamondRule />
              </div>

              <div style={fadeStyle(160)}>
                <p style={S.eyebrow}>Create your account</p>
                <h2 style={{ ...S.headline, fontSize: 32, marginBottom: 24 }}>
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

                  <button style={{ ...S.btn, background: 'transparent', color: '#999', fontSize: 9.5 }} onClick={() => setStep('view')}>
                    ← Back
                  </button>
                </div>
              </div>

              <div style={{ ...S.footer, ...fadeStyle(240) }}>
                <DiamondRule />
                <div style={S.footerText}>With love, Daisy & the Nama team</div>
              </div>
            </>
          )}

        </div>
      </div>
    </>
  )
}
