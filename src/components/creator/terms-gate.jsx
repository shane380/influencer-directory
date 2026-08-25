'use client'

import { useEffect, useState } from 'react'
import { CREATOR_TERMS_COMPONENTS } from '@/app/terms/creator/versions/registry'
import { CREATOR_TERMS_KEY, creatorTermsPath } from '@/lib/terms/versions'

const CSS = `
.tg-overlay { position: fixed; inset: 0; z-index: 10000; background: rgba(0,0,0,0.55); display: flex; align-items: center; justify-content: center; padding: 32px 20px; overflow-y: auto; }
@media (max-width: 768px) { .tg-overlay { padding: 0; align-items: stretch; } }
.tg-panel { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #111; background: #fff; width: 100%; max-width: 640px; max-height: 100%; display: flex; flex-direction: column; animation: tg-up 0.22s ease; }
/* 100% of the fixed, inset:0 overlay — not 100dvh, which resolves taller than
   the overlay on mobile and pushed the panel below the fold. */
/* No slide-up on mobile: the panel is the full screen, so a transform that
   stalls leaves it offset and pushes the button toward the edge. */
@media (max-width: 768px) { .tg-panel { max-width: none; height: 100%; max-height: 100%; animation: none; } }
.tg-scroll { display: flex; flex-direction: column; flex: 1; min-height: 0; }
@keyframes tg-up { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
.tg-head { padding: 32px 32px 20px; border-bottom: 1px solid #ebebeb; flex-shrink: 0; }
@media (max-width: 768px) { .tg-head { padding: 28px 22px 18px; } }
.tg-eyebrow { font-size: 9px; letter-spacing: 0.4em; text-transform: uppercase; color: #aaa; margin-bottom: 14px; }
.tg-title { font-family: 'Playfair Display', serif; font-size: 26px; font-weight: 300; line-height: 1.15; margin-bottom: 10px; }
@media (max-width: 768px) { .tg-title { font-size: 22px; } }
.tg-lede { font-size: 13.5px; color: #666; font-weight: 300; line-height: 1.75; }
.tg-doc { flex: 1; overflow-y: auto; padding: 28px 32px; border-bottom: 1px solid #ebebeb; -webkit-overflow-scrolling: touch; }
@media (max-width: 768px) { .tg-doc { padding: 24px 22px; } }
/* The document component ships the full-page terms styling; scale the
   headings down so it reads as a panel rather than a standalone page. */
.tg-doc .ct-title { font-size: 20px; margin-bottom: 6px; }
.tg-doc .ct-meta { font-size: 11.5px; margin-bottom: 24px; }
.tg-doc .ct-section-title { font-size: 15px; }
.tg-doc .ct-section { margin-bottom: 24px; }
.tg-doc .ct-body { font-size: 13.5px; }
.tg-foot { padding: 22px 32px 28px; flex-shrink: 0; background: #fff; }
@media (max-width: 768px) { .tg-foot { padding: 20px 22px calc(24px + env(safe-area-inset-bottom)); } }
/* Mobile: the intro scrolls away with the document instead of staying pinned.
   A fixed header held a third of the screen for a lede already read, leaving
   ~390px to read 10,000px of terms through. The checkbox and button stay put. */
@media (max-width: 768px) {
  .tg-scroll { overflow-y: auto; -webkit-overflow-scrolling: touch; }
  .tg-head { border-bottom: none; padding-bottom: 4px; }
  .tg-doc { flex: none; overflow: visible; border-bottom: none; }
  .tg-foot { border-top: 1px solid #ebebeb; }
}
.tg-openlink { display: inline-block; font-size: 11.5px; color: #888; text-decoration: underline; text-underline-offset: 2px; margin-bottom: 18px; }
.tg-openlink:hover { color: #111; }
.tg-agree-row { display: flex; gap: 14px; align-items: flex-start; margin-bottom: 20px; }
.tg-agree-box { width: 18px !important; height: 18px !important; min-width: 18px; border-radius: 4px !important; border: 1.5px solid #ccc !important; flex-shrink: 0; margin-top: 2px; background: white !important; appearance: none !important; -webkit-appearance: none !important; cursor: pointer; position: relative; transition: all 0.15s; padding: 0 !important; }
.tg-agree-box:checked { background: #111 !important; border-color: #111 !important; }
.tg-agree-box:checked::after { content: "\\2713"; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: white; font-size: 10px; line-height: 1; }
.tg-agree-text { font-size: 12px; color: #777; line-height: 1.75; font-weight: 300; }
.tg-btn { width: 100%; background: #111; color: #fff; border: none; padding: 15px 20px; font-size: 10px; letter-spacing: 0.24em; text-transform: uppercase; cursor: pointer; transition: opacity 0.15s; font-family: inherit; }
.tg-btn:hover:not(:disabled) { opacity: 0.85; }
.tg-btn:disabled { background: #ddd; color: #fff; cursor: not-allowed; }
.tg-error { font-size: 12px; color: #b23c3c; margin-top: 12px; font-weight: 300; line-height: 1.6; }
`

/**
 * Blocking re-acceptance gate. Shown when an affiliate has not accepted the
 * current Creator Terms of Use. Deliberately has no close
 * affordance: no X, no Escape handler, no backdrop dismiss. Clearing it is the
 * only way past.
 */
export default function TermsGate({ version, onAccepted }) {
  const [agreed, setAgreed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const Doc = CREATOR_TERMS_COMPONENTS[version]

  // Lock the page behind the overlay so the dashboard can't be scrolled or read.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [])

  async function accept() {
    if (!agreed || saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/creators/accept-terms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentKey: CREATOR_TERMS_KEY, documentVersion: version }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Something went wrong. Please try again.')
      }
      onAccepted()
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  if (!Doc) return null

  return (
    <div className="tg-overlay" role="dialog" aria-modal="true" aria-labelledby="tg-title">
      <style>{CSS}</style>

      <div className="tg-panel">
        <div className="tg-scroll">
        <div className="tg-head">
          <div className="tg-eyebrow">Updated Terms</div>
          <div className="tg-title" id="tg-title">We&apos;ve updated our Creator Terms</div>
          <p className="tg-lede">
            Please read and accept the updated Creator Terms of Use to continue to your dashboard.
            The main change is payment timing: partner payments now land by the end of the
            following calendar month. Section 13 covers the Affiliate Program. Your partnership
            and rates are otherwise unchanged.
          </p>
        </div>

        <div className="tg-doc">
          <Doc />
        </div>
        </div>

        <div className="tg-foot">
          <a
            className="tg-openlink"
            href={creatorTermsPath(version)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open the full terms in a new tab
          </a>

          <div className="tg-agree-row">
            <input
              type="checkbox"
              className="tg-agree-box"
              id="tg-agree"
              checked={agreed}
              onChange={e => setAgreed(e.target.checked)}
            />
            <label className="tg-agree-text" htmlFor="tg-agree">
              I have read and agree to the updated Creator Terms of Use
            </label>
          </div>

          <button className="tg-btn" disabled={!agreed || saving} onClick={accept}>
            {saving ? 'Saving…' : 'Accept & Continue'}
          </button>

          {error && <p className="tg-error">{error}</p>}
        </div>
      </div>
    </div>
  )
}
