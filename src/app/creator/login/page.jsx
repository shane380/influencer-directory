'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const S = {
  root: {
    minHeight: '100vh',
    background: '#FFFFFF',
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
    maxWidth: 440,
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
    fontSize: 32,
    fontWeight: 300,
    lineHeight: 1.15,
    color: '#111111',
    marginBottom: 8,
  },
  intro: {
    fontSize: 14,
    color: '#888888',
    lineHeight: 1.75,
    marginBottom: 32,
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
  note: {
    fontSize: 12,
    color: '#888888',
    textAlign: 'center',
    marginTop: 20,
    lineHeight: 1.6,
  },
}

export default function CreatorLoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleLogin(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    router.push('/creator/dashboard')
    router.refresh()
  }

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&display=swap" rel="stylesheet" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <style>{`
        @media (max-width: 480px) {
          .creator-login-card {
            padding: 32px 24px !important;
          }
        }
      `}</style>
      <div style={S.root}>
        <div className="creator-login-card" style={S.card}>
          <div style={{ marginBottom: 32 }}>
            <img src="/nama-logo.svg" alt="Nama" style={{ width: 80, display: 'block' }} />
          </div>
          <p style={S.eyebrow}>Creator Portal</p>
          <h1 style={S.headline}>Welcome back.</h1>
          <p style={S.intro}>Sign in to your creator dashboard.</p>

          <form style={S.form} onSubmit={handleLogin}>
            <div style={S.inputWrap}>
              <label style={S.inputLabel}>Email</label>
              <input
                style={S.input}
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@email.com"
                required
              />
            </div>
            <div style={S.inputWrap}>
              <label style={S.inputLabel}>Password</label>
              <input
                style={S.input}
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Your password"
                required
              />
            </div>

            {error && <div style={S.error}>{error}</div>}

            <button
              type="submit"
              style={loading ? { ...S.btn, ...S.btnDisabled } : S.btn}
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <p style={S.note}>
            Don't have an account? You need an invite from Nama.
          </p>
        </div>
      </div>
    </>
  )
}
