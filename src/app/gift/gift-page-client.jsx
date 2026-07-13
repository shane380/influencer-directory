'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { getCountries } from '@/lib/countries'

// Public gift selection page — opened from an Instagram DM or email, usually
// inside the IG in-app browser. No login, no storage APIs; all state lives in
// memory and a single POST submits everything at the end.
//
// Two modes share this component: the personal tokenized link (/gift/[token],
// API /api/gift/t/) and the campaign-level open link (/gift/g/[token], API
// /api/gift/g/) for creators with no influencer record yet — the open link is
// reusable, collects an optional IG handle, and returns a personal status URL.

const BOTTOMS_RE = /pant|short|legging|skirt|bottom|jogger|trouser/i

const CSS = `
.gf-wrap { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #111; background: #fff; min-height: 100vh; -webkit-font-smoothing: antialiased; }
.gf-wrap *, .gf-wrap *::before, .gf-wrap *::after { box-sizing: border-box; margin: 0; padding: 0; }
.gf-col { max-width: 480px; margin: 0 auto; min-height: 100vh; display: flex; flex-direction: column; background: #fff; }
.gf-hero { width: 100%; aspect-ratio: 5/4; object-fit: cover; display: block; background: #f0ece4; }
@media (min-width: 560px) { .gf-hero { aspect-ratio: 16/10; } }
.gf-masthead { padding: 30px 34px 26px; border-bottom: 1px solid #eee; }
.gf-mast-eyebrow { font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; color: #A89F94; margin-bottom: 12px; }
.gf-mast-title { font-family: 'Cormorant Garamond', serif; font-weight: 500; font-size: 58px; line-height: 0.94; letter-spacing: -0.01em; color: #201D1A; }
.gf-mast-title span { display: block; white-space: nowrap; }
.gf-letter { padding: 26px 34px 8px; }
.gf-letter-greeting { font-family: 'Cormorant Garamond', serif; font-style: italic; font-size: 33px; font-weight: 400; line-height: 1.08; color: #201D1A; margin-bottom: 18px; }
.gf-letter-body { font-size: 16.5px; line-height: 1.55; color: #4A453D; max-width: 34ch; margin-bottom: 18px; }
.gf-sign { font-family: 'Cormorant Garamond', serif; font-style: italic; font-size: 19px; color: #8A8177; margin: 0; }
.gf-landing .gf-body { padding: 26px 34px 40px; }
.gf-landing .gf-coll-row { margin: 0 -34px; padding: 0 34px 4px; }
.gf-collection { margin-bottom: 26px; }
.gf-coll-row { display: flex; gap: 10px; overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; margin: 0 -24px; padding: 0 24px 4px; }
.gf-coll-row::-webkit-scrollbar { display: none; }
.gf-coll-item { flex: 0 0 96px; min-width: 0; max-width: 96px; cursor: pointer; }
@media (min-width: 560px) { .gf-coll-item { flex: 0 0 124px; max-width: 124px; } }
.gf-coll-imgwrap { position: relative; aspect-ratio: 2/3; overflow: hidden; background: #f5f2ec; }
.gf-coll-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
.gf-coll-name { font-size: 10.5px; color: #555; margin-top: 5px; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gf-details { border-top: 1px solid #eee; margin-bottom: 26px; }
.gf-detail-row { display: flex; align-items: center; gap: 14px; padding: 13px 0; border-bottom: 1px solid #f2f2f2; }
.gf-detail-icon { width: 20px; height: 20px; color: #999; flex-shrink: 0; }
.gf-detail-label { font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: #999; margin-bottom: 2px; }
.gf-detail-value { font-size: 13.5px; color: #111; }
.gf-body { padding: 28px 24px 40px; flex: 1; display: flex; flex-direction: column; }
.gf-eyebrow { font-size: 10px; letter-spacing: 0.34em; text-transform: uppercase; color: #999; margin-bottom: 14px; }
.gf-headline { font-family: 'Playfair Display', serif; font-size: 32px; font-weight: 300; line-height: 1.08; color: #111; margin-bottom: 16px; }
.gf-headline em { font-style: italic; }
.gf-hero-title { font-family: 'Playfair Display', serif; font-size: 42px; font-weight: 300; line-height: 1.04; color: #111; margin-bottom: 12px; }
.gf-greeting { font-family: 'Playfair Display', serif; font-style: italic; font-size: 22px; font-weight: 300; color: #111; line-height: 1.2; margin-bottom: 8px; }
.gf-sub { font-size: 13.5px; color: #555; line-height: 1.65; margin-bottom: 28px; }
.gf-btn { display: block; width: 100%; background: #111; color: #fff; border: none; text-align: center; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; font-weight: 500; letter-spacing: 0.24em; text-transform: uppercase; padding: 17px 0; cursor: pointer; }
.gf-btn:disabled { background: #ccc; cursor: default; }
.gf-btn-ghost { background: none; border: none; color: #888; font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; padding: 14px 0; width: 100%; cursor: pointer; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
.gf-counterbar { position: sticky; top: 0; z-index: 10; background: rgba(255,255,255,0.96); backdrop-filter: blur(4px); border-bottom: 1px solid #eee; padding: 14px 24px; display: flex; justify-content: space-between; align-items: baseline; }
.gf-counter { font-family: 'Playfair Display', serif; font-size: 17px; }
.gf-counter span { font-size: 12px; color: #999; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
.gf-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 18px 24px 24px; }
.gf-card { border: 1px solid #e8e8e8; position: relative; cursor: pointer; }
.gf-card.sel { border-color: #111; box-shadow: 0 0 0 1px #111; }
.gf-card-img { width: 100%; aspect-ratio: 2/3; object-fit: cover; display: block; background: #f5f2ec; }
.gf-card-body { padding: 10px 10px 12px; }
.gf-card-title { font-size: 12px; line-height: 1.35; color: #111; }
.gf-card-size { font-size: 11px; color: #666; margin-top: 3px; }
.gf-check { position: absolute; top: 8px; right: 8px; width: 22px; height: 22px; border-radius: 50%; background: #111; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 12px; z-index: 2; }
.gf-uncheck { position: absolute; top: 8px; left: 8px; width: 22px; height: 22px; border-radius: 50%; background: rgba(255,255,255,0.94); border: 1px solid #d8d8d8; color: #555; display: flex; align-items: center; justify-content: center; font-size: 13px; line-height: 1; z-index: 2; cursor: pointer; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
.gf-opts { padding: 0 10px 12px; }
.gf-opts.pulse { animation: gf-pulse 0.5s ease 2; }
@keyframes gf-pulse { 50% { transform: scale(1.03); } }
.gf-optrow { margin-bottom: 8px; }
.gf-optrow:last-child { margin-bottom: 0; }
.gf-optlabel { font-size: 9px; letter-spacing: 0.16em; text-transform: uppercase; color: #aaa; margin-bottom: 5px; }
.gf-chips { display: flex; flex-wrap: wrap; gap: 5px; }
.gf-add-btn { display: block; width: calc(100% - 20px); margin: 0 10px 12px; border: 1px solid #111; background: #fff; color: #111; font-size: 10.5px; letter-spacing: 0.18em; text-transform: uppercase; padding: 9px 0; cursor: pointer; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
.gf-add-btn.on { background: #111; color: #fff; }
.gf-chip { flex: 1 1 auto; min-width: 34px; border: 1px solid #ddd; background: #fff; font-size: 11.5px; color: #555; padding: 8px 4px; text-align: center; cursor: pointer; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
.gf-chip.on { border-color: #111; color: #111; font-weight: 500; background: #faf9f7; }
.gf-chip:disabled { color: #ccc; border-color: #eee; cursor: default; text-decoration: line-through; }
.gf-sheet-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.35); z-index: 40; }
.gf-sheet { position: fixed; left: 0; right: 0; bottom: 0; background: #fff; z-index: 41; padding: 18px 20px calc(22px + env(safe-area-inset-bottom)); border-top: 1px solid #eee; max-width: 480px; margin: 0 auto; animation: gf-up 0.22s ease; }
@keyframes gf-up { from { transform: translateY(100%); } }
.gf-sheet-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; gap: 12px; }
.gf-sheet-title { font-family: 'Playfair Display', serif; font-size: 18px; font-weight: 400; }
.gf-sheet-sub { font-size: 11.5px; color: #666; margin-top: 3px; }
.gf-sheet-close { background: none; border: none; font-size: 16px; color: #999; cursor: pointer; padding: 2px 4px; flex-shrink: 0; }
.gf-sheet .gf-chip { padding: 12px 4px; font-size: 13px; }
.gf-sheet-remove { margin-top: 16px; background: none; border: none; color: #c0392b; font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; cursor: pointer; padding: 2px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
.gf-footer { position: sticky; bottom: 0; background: #fff; border-top: 1px solid #eee; padding: 14px 24px calc(14px + env(safe-area-inset-bottom)); z-index: 10; }
.gf-hint { font-size: 11.5px; color: #b06a2c; text-align: center; padding: 8px 0 0; }
.gf-section-label { font-size: 10px; letter-spacing: 0.26em; text-transform: uppercase; color: #999; margin: 0 0 12px; }
.gf-cart-row { display: flex; gap: 12px; align-items: center; padding: 10px 0; border-bottom: 1px solid #f2f2f2; }
.gf-cart-img { width: 52px; height: 68px; object-fit: cover; background: #f5f2ec; flex-shrink: 0; }
.gf-cart-title { font-size: 12.5px; color: #111; }
.gf-cart-variant { font-size: 11.5px; color: #666; margin-top: 2px; }
.gf-cart-remove { margin-left: auto; background: none; border: none; color: #999; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; cursor: pointer; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; flex-shrink: 0; }
.gf-form { margin-top: 26px; }
.gf-note { font-size: 12px; color: #666; background: #faf8f4; border: 1px solid #f0ece4; padding: 10px 12px; margin-bottom: 16px; line-height: 1.5; }
.gf-field { margin-bottom: 12px; }
.gf-label { display: block; font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: #999; margin-bottom: 6px; }
.gf-input, .gf-select { width: 100%; border: 1px solid #e2e2e2; background: #fafafa; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 16px; color: #111; padding: 11px 13px; outline: none; border-radius: 0; -webkit-appearance: none; appearance: none; }
.gf-input:focus, .gf-select:focus { border-color: #999; }
.gf-select { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23999'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 13px center; }
.gf-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.gf-error { font-size: 12.5px; color: #c0392b; margin: 10px 0; line-height: 1.5; }
.gf-done-icon { width: 54px; height: 54px; border-radius: 50%; background: #111; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 22px; margin: 0 auto 22px; }
.gf-steps { margin-top: 30px; border-top: 1px solid #eee; }
.gf-step { display: flex; gap: 16px; padding: 16px 0; border-bottom: 1px solid #f2f2f2; align-items: baseline; }
.gf-step-num { font-family: 'Playfair Display', serif; font-size: 19px; color: #ccc; min-width: 20px; }
.gf-step-text { font-size: 13px; color: #444; line-height: 1.55; }
.gf-timeline { display: flex; align-items: flex-start; margin: 22px 0 8px; }
.gf-tl-item { flex: 1; text-align: center; position: relative; }
.gf-tl-dot { width: 14px; height: 14px; border-radius: 50%; background: #eee; border: 1px solid #ddd; margin: 0 auto 8px; position: relative; z-index: 2; }
.gf-tl-item.on .gf-tl-dot { background: #111; border-color: #111; }
.gf-tl-item::before { content: ''; position: absolute; top: 7px; left: -50%; width: 100%; height: 1px; background: #e5e5e5; }
.gf-tl-item:first-child::before { display: none; }
.gf-tl-label { font-size: 9.5px; letter-spacing: 0.12em; text-transform: uppercase; color: #999; }
.gf-tl-item.on .gf-tl-label { color: #111; }
.gf-addr { font-size: 13px; color: #444; line-height: 1.7; border: 1px solid #eee; padding: 12px 14px; }
.gf-center { min-height: 70vh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 40px 24px; }
@media (min-width: 560px) { .gf-col { border-left: 1px solid #eee; border-right: 1px solid #eee; } }
@media (min-width: 768px) {
  .gf-col { max-width: 980px; }
  .gf-grid { grid-template-columns: repeat(4, 1fr); gap: 16px; padding: 24px 32px 32px; }
  .gf-counterbar { padding: 14px 32px; }
  .gf-footer { padding-left: 32px; padding-right: 32px; }
  .gf-body { max-width: 520px; margin: 0 auto; width: 100%; }
}
`

export default function GiftPageClient({ token, generic = false }) {
  const apiBase = generic ? '/api/gift/g' : '/api/gift/t'

  const [loadState, setLoadState] = useState('loading') // loading | ok | invalid | error
  const [data, setData] = useState(null)
  const [step, setStep] = useState('landing') // landing | select | confirm | done | status
  const [picks, setPicks] = useState([]) // { product_id, variant_id, title, variant_title, image }
  const [openProduct, setOpenProduct] = useState(null)
  const [sheetProduct, setSheetProduct] = useState(null) // product_id shown in the size sheet

  // Every step opens at the top — the previous step's scroll offset otherwise
  // carries over (e.g. tapping the CTA at the bottom of the landing page).
  useEffect(() => { window.scrollTo(0, 0) }, [step])
  const [optSel, setOptSel] = useState({}) // { [product_id]: { [optionName]: value } }
  const [editingPick, setEditingPick] = useState(null) // product_id being size-edited on the confirm step
  const [maxHint, setMaxHint] = useState(false)
  const [form, setForm] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [submitted, setSubmitted] = useState(null)
  const [personalUrl, setPersonalUrl] = useState(null)
  const titleRef = useRef(null)

  // Campaign titles shrink before they ever wrap to a second line.
  useEffect(() => {
    if (step !== 'landing' || loadState !== 'ok') return
    const el = titleRef.current
    if (!el) return
    const fit = () => {
      const parent = el.parentElement
      if (!parent) return
      let size = parseFloat(el.getAttribute('data-base') || '34')
      el.style.fontSize = size + 'px'
      const max = parent.clientWidth
      while (el.scrollWidth > max && size > 15) {
        size -= 1
        el.style.fontSize = size + 'px'
      }
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [step, loadState, data])

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/${encodeURIComponent(token)}`)
      if (res.status === 404) { setLoadState('invalid'); return }
      if (!res.ok) { setLoadState('error'); return }
      const d = await res.json()
      setData(d)
      if (d.state === 'submitted') {
        setSubmitted(d.submitted)
        setStep('status')
      } else {
        setForm({
          name: d.prefill?.name || '',
          email: d.prefill?.email || '',
          phone: d.prefill?.phone || '',
          address1: d.prefill?.address1 || '',
          address2: d.prefill?.address2 || '',
          city: d.prefill?.city || '',
          province: d.prefill?.province || '',
          zip: d.prefill?.zip || '',
          country_code: d.prefill?.country_code || '',
          instagram_handle: '',
          source: d.prefill?.source || 'none',
        })
        if (!generic) fetch(`${apiBase}/${encodeURIComponent(token)}/view`, { method: 'POST' }).catch(() => {})
      }
      setLoadState('ok')
    } catch {
      setLoadState('error')
    }
  }, [token, apiBase, generic])

  useEffect(() => { load() }, [load])

  const maxSelects = data?.campaign?.max_selects || 3 // hard piece cap (outfits × 3)
  const outfits = data?.campaign?.outfits || 1

  function preferredSize(product) {
    const size = BOTTOMS_RE.test(product.title) ? data?.influencer?.bottoms_size : data?.influencer?.top_size
    if (!size) return null
    const hasIt = product.variants.some(v => v.selected_options?.some(o => o.value === size) && v.available)
    return hasIt ? size : null
  }

  function pickFor(productId) {
    return picks.find(p => p.product_id === productId) || null
  }

  function selectVariant(product, variant) {
    setMaxHint(false)
    setPicks(prev => {
      const existing = prev.find(p => p.product_id === product.product_id)
      if (existing && existing.variant_id === variant.variant_id) {
        return prev.filter(p => p.product_id !== product.product_id)
      }
      const next = {
        product_id: product.product_id,
        variant_id: variant.variant_id,
        title: product.title,
        variant_title: variant.title,
        image: product.image,
      }
      if (existing) return prev.map(p => (p.product_id === product.product_id ? next : p))
      if (prev.length >= maxSelects) { setMaxHint(true); return prev }
      return [...prev, next]
    })
  }

  function variantFor(product, chosen) {
    return product.variants.find(v =>
      product.options.every(o => (v.selected_options.find(x => x.name === o.name) || {}).value === chosen[o.name])
    ) || null
  }

  function valueEnabled(product, chosen, optName, value) {
    return product.variants.some(v => {
      if (!v.available) return false
      const so = n => (v.selected_options.find(x => x.name === n) || {}).value
      if (so(optName) !== value) return false
      return product.options.every(o => o.name === optName || !chosen[o.name] || so(o.name) === chosen[o.name])
    })
  }

  function tapOption(product, optName, value) {
    setMaxHint(false)
    const pid = product.product_id
    const chosen = { ...(optSel[pid] || {}) }
    if (chosen[optName] === value) delete chosen[optName]
    else chosen[optName] = value
    setOptSel(prev => ({ ...prev, [pid]: chosen }))
    const existing = pickFor(pid)
    const complete = product.options.every(o => chosen[o.name])
    if (!complete) {
      if (existing) setPicks(prev => prev.filter(x => x.product_id !== pid))
      return
    }
    const v = variantFor(product, chosen)
    if (!v || !v.available) return
    if (!existing && picks.length >= maxSelects) { setMaxHint(true); return }
    const next = { product_id: pid, variant_id: v.variant_id, title: product.title, variant_title: v.title, image: product.image }
    setPicks(prev => (existing ? prev.map(x => (x.product_id === pid ? next : x)) : [...prev, next]))
  }

  function startEdit(pick, product) {
    if (editingPick === pick.product_id) { setEditingPick(null); return }
    const v = product.variants.find(x => x.variant_id === pick.variant_id)
    if (v) {
      setOptSel(prev => ({
        ...prev,
        [pick.product_id]: Object.fromEntries((v.selected_options || []).map(o => [o.name, o.value])),
      }))
    }
    setEditingPick(pick.product_id)
  }

  function removePick(pick) {
    setPicks(prev => prev.filter(x => x.variant_id !== pick.variant_id))
    setOptSel(prev => ({ ...prev, [pick.product_id]: {} }))
  }

  function tapProduct(product) {
    setMaxHint(false)
    // Single-variant products toggle directly; sized products open the size sheet.
    if (product.variants.length === 1) {
      selectVariant(product, product.variants[0])
      return
    }
    setSheetProduct(product.product_id)
  }

  async function submit() {
    if (submitting) return
    setSubmitError(null)
    const f = form
    if (!f.name.trim()) return setSubmitError('Please enter your full name.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) return setSubmitError('Please enter a valid email.')
    if ((f.phone.match(/\d/g) || []).length < 7) return setSubmitError('Please enter a valid phone number — the carrier needs it for delivery.')
    if (!f.address1.trim() || !f.city.trim() || !f.zip.trim() || !f.country_code) return setSubmitError('Please complete your shipping address.')
    if (['US', 'CA'].includes(f.country_code) && !f.province.trim()) return setSubmitError('Please enter your state / province.')
    setSubmitting(true)
    try {
      const res = await fetch(`${apiBase}/${encodeURIComponent(token)}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selections: picks.map(p => ({ product_id: p.product_id, variant_id: p.variant_id })),
          ...(generic ? { instagram_handle: f.instagram_handle || '' } : {}),
          shipping: {
            name: f.name, email: f.email, phone: f.phone,
            address1: f.address1, address2: f.address2, city: f.city,
            province: f.province, zip: f.zip, country_code: f.country_code,
          },
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (res.status === 409) {
        if (generic) {
          setSubmitError('Looks like selects were already submitted for this campaign — reach out to the Nama team to make changes.')
          return
        }
        await load()
        return
      }
      if (res.status === 400 && body.error === 'selections_stale') {
        setSubmitError('One of your picks just changed on our side — please head back and reselect.')
        return
      }
      if (!res.ok) {
        setSubmitError(body.detail || 'Something went wrong — please try again.')
        return
      }
      setSubmitted(body.submitted)
      if (body.personal_url) setPersonalUrl(body.personal_url)
      setStep('done')
    } catch {
      setSubmitError('Something went wrong — please check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function field(label, key, opts = {}) {
    return (
      <div className="gf-field">
        <label className="gf-label">{label}{opts.required ? ' *' : ''}</label>
        <input
          className="gf-input"
          type={opts.type || 'text'}
          value={form[key]}
          autoComplete={opts.autoComplete}
          inputMode={opts.inputMode}
          placeholder={opts.placeholder}
          onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
        />
      </div>
    )
  }

  // ---- screens ----

  if (loadState === 'loading') {
    return (
      <div className="gf-wrap"><style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="gf-col"><div className="gf-center"><div className="gf-eyebrow">Nama</div><div className="gf-sub">Loading…</div></div></div>
      </div>
    )
  }

  if (loadState === 'invalid' || loadState === 'error') {
    return (
      <div className="gf-wrap"><style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="gf-col"><div className="gf-center">
          <div className="gf-eyebrow">Nama</div>
          <div className="gf-headline">This link isn&rsquo;t active.</div>
          <div className="gf-sub">{loadState === 'invalid'
            ? 'It may have been replaced with a new one — reach out to your Nama contact and we’ll sort it.'
            : 'Something went wrong loading this page — please try again in a moment.'}</div>
        </div></div>
      </div>
    )
  }

  const c = data.campaign

  return (
    <div className="gf-wrap"><style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="gf-col">

        {step === 'landing' && (
          <div className="gf-landing">
            {c.hero_image_url && <img className="gf-hero" src={c.hero_image_url} alt={c.name} />}
            <div className="gf-masthead">
              <div className="gf-mast-eyebrow">Nama{(() => {
                if (!c.launch_date) return ''
                const d = new Date(c.launch_date + 'T00:00:00')
                const m = d.getMonth() + 1
                const season = m === 12 || m <= 2 ? 'Winter' : m <= 5 ? 'Spring' : m <= 8 ? 'Summer' : 'Fall'
                return ` · ${season} '${String(d.getFullYear()).slice(2)}`
              })()}</div>
              <div className="gf-mast-title" ref={titleRef} data-base="58">
                {c.name.split(/\s+/).map((w, i) => <span key={i}>{w}</span>)}
              </div>
            </div>
            <div className="gf-letter">
              <div className="gf-letter-greeting">{data.influencer.first_name ? <>{data.influencer.first_name}, you&rsquo;re on the list.</> : <>You&rsquo;re on the list.</>}</div>
              <div className="gf-letter-body">{c.blurb || `${c.name} is almost here — before it goes live, we'd love you in it. Pick your pieces below.`}</div>
              <div className="gf-sign">— Daisy &amp; the Nama team</div>
            </div>
            <div className="gf-body" style={{ flex: 'none' }}>
              <div className="gf-details">
                <div className="gf-detail-row">
                  <svg className="gf-detail-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
                  <div>
                    <div className="gf-detail-label">Your picks</div>
                    <div className="gf-detail-value">{outfits} {outfits === 1 ? 'outfit' : 'outfits'} (up to 3 pieces each)</div>
                  </div>
                </div>
                {c.launch_date && (
                  <div className="gf-detail-row">
                    <svg className="gf-detail-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                    <div>
                      <div className="gf-detail-label">Campaign launches</div>
                      <div className="gf-detail-value">{new Date(c.launch_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</div>
                    </div>
                  </div>
                )}
                <div className="gf-detail-row">
                  <svg className="gf-detail-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8l-9-5-9 5v8l9 5 9-5V8z" /><path d="M3.3 8.3L12 13l8.7-4.7" /><line x1="12" y1="13" x2="12" y2="21" /></svg>
                  <div>
                    <div className="gf-detail-label">Ships</div>
                    <div className="gf-detail-value">Within 5 days</div>
                  </div>
                </div>
              </div>
              {(data.products || []).length > 0 && (
                <div className="gf-collection">
                  <div className="gf-section-label">The Collection</div>
                  <div className="gf-coll-row">
                    {data.products.map((p) => (
                      <div key={p.product_id} className="gf-coll-item" onClick={() => setStep('select')}>
                        <div className="gf-coll-imgwrap">
                          <img className="gf-coll-img" src={p.image || ''} alt={p.title} />
                        </div>
                        <div className="gf-coll-name">{p.title}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <button className="gf-btn" onClick={() => setStep('select')}>Select Your Pieces</button>
            </div>
          </div>
        )}

        {step === 'select' && (
          <>
            <div className="gf-counterbar">
              <div className="gf-counter">{picks.length} <span>of {maxSelects} pieces · {outfits} {outfits === 1 ? 'outfit' : 'outfits'}</span></div>
              <button className="gf-btn-ghost" style={{ width: 'auto', padding: 0 }} onClick={() => setStep('landing')}>Back</button>
            </div>
            <div className="gf-grid">
              {data.products.map(product => {
                const picked = pickFor(product.product_id)
                const open = openProduct === product.product_id
                return (
                  <div key={product.product_id} className={`gf-card${picked ? ' sel' : ''}`}>
                    {picked && <div className="gf-check">✓</div>}
                    {picked && (
                      <button className="gf-uncheck" title="Remove" onClick={(e) => { e.stopPropagation(); removePick(picked) }}>×</button>
                    )}
                    <img className="gf-card-img" src={product.image || ''} alt={product.title} onClick={() => tapProduct(product)} />
                    <div className="gf-card-body" onClick={() => tapProduct(product)}>
                      <div className="gf-card-title">{product.title}</div>
                      <div className="gf-card-size">{picked ? (picked.variant_title ? `${picked.variant_title} — selected` : 'Selected') : (product.variants.length > 1 ? 'Tap to select your size' : 'Tap to select')}</div>
                    </div>
                  </div>
                )
              })}
            </div>
            {sheetProduct && (() => {
              const product = data.products.find(x => x.product_id === sheetProduct)
              if (!product) return null
              const picked = pickFor(product.product_id)
              const chosen = optSel[product.product_id] || {}
              return (
                <>
                  <div className="gf-sheet-backdrop" onClick={() => setSheetProduct(null)} />
                  <div className="gf-sheet">
                    <div className="gf-sheet-head">
                      <div>
                        <div className="gf-sheet-title">{product.title}</div>
                        <div className="gf-sheet-sub">
                          {picked
                            ? `${picked.variant_title || 'Selected'} — selected ✓`
                            : (() => {
                                const missing = product.options.filter(o => !chosen[o.name]).map(o => o.name.toLowerCase())
                                if (missing.length === product.options.length) return `Choose your ${missing.join(' and ')}`
                                if (missing.length > 0) return `Now choose your ${missing.join(' and ')}`
                                return 'Choose your size'
                              })()}
                        </div>
                      </div>
                      <button className="gf-sheet-close" onClick={() => setSheetProduct(null)}>✕</button>
                    </div>
                    {product.options.map(o => (
                      <div key={o.name} className="gf-optrow">
                        {product.options.length > 1 && <div className="gf-optlabel">{o.name}</div>}
                        <div className="gf-chips">
                          {o.values.map(val => (
                            <button
                              key={val}
                              className={`gf-chip${chosen[o.name] === val ? ' on' : ''}`}
                              disabled={!valueEnabled(product, chosen, o.name, val)}
                              onClick={() => {
                                const next = { ...chosen }
                                if (next[o.name] === val) delete next[o.name]
                                else next[o.name] = val
                                tapOption(product, o.name, val)
                                if (product.options.every(x => next[x.name])) {
                                  setTimeout(() => setSheetProduct(prev => (prev === product.product_id ? null : prev)), 280)
                                }
                              }}
                            >{val}</button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )
            })()}
            <div className="gf-footer">
              {maxHint && <div className="gf-hint" style={{ paddingBottom: 8 }}>That&rsquo;s {outfits} {outfits === 1 ? 'outfit' : 'outfits'}&rsquo; worth ({maxSelects} pieces) — remove a piece to swap.</div>}
              <button className="gf-btn" disabled={picks.length === 0} onClick={() => { setStep('confirm'); window.scrollTo(0, 0) }}>
                {picks.length === 0 ? 'Pick your styles' : `Continue with ${picks.length} ${picks.length === 1 ? 'style' : 'styles'} →`}
              </button>
            </div>
          </>
        )}

        {step === 'confirm' && (
          <div className="gf-body">
            <div className="gf-eyebrow">Almost done</div>
            <div className="gf-headline">Confirm your <em>picks.</em></div>
            <div>
              {picks.map(p => {
                const product = (data.products || []).find(x => x.product_id === p.product_id)
                const editing = editingPick === p.product_id
                const editable = product && product.variants.length > 1
                return (
                  <div key={p.product_id}>
                    <div className="gf-cart-row" style={editing ? { borderBottom: 'none' } : undefined}>
                      <img className="gf-cart-img" src={p.image || ''} alt={p.title} />
                      <div>
                        <div className="gf-cart-title">{p.title}</div>
                        {p.variant_title && <div className="gf-cart-variant">Size {p.variant_title}</div>}
                      </div>
                      <div style={{ marginLeft: 'auto', display: 'flex', gap: 16, flexShrink: 0 }}>
                        {editable && (
                          <button className="gf-cart-remove" style={editing ? { color: '#111', fontWeight: 500 } : undefined} onClick={() => startEdit(p, product)}>
                            {editing ? 'Done' : 'Edit'}
                          </button>
                        )}
                        <button className="gf-cart-remove" onClick={() => { setEditingPick(null); removePick(p); if (picks.length === 1) setStep('select') }}>Remove</button>
                      </div>
                    </div>
                    {editing && product && (
                      <div className="gf-opts" style={{ padding: '0 0 14px', borderBottom: '1px solid #f2f2f2', marginBottom: 4 }}>
                        {product.options.map(o => (
                          <div key={o.name} className="gf-optrow">
                            {product.options.length > 1 && <div className="gf-optlabel">{o.name}</div>}
                            <div className="gf-chips">
                              {o.values.map(val => (
                                <button
                                  key={val}
                                  className={`gf-chip${(optSel[p.product_id] || {})[o.name] === val ? ' on' : ''}`}
                                  disabled={!valueEnabled(product, optSel[p.product_id] || {}, o.name, val)}
                                  onClick={() => {
                                    if ((optSel[p.product_id] || {})[o.name] === val) return
                                    tapOption(product, o.name, val)
                                  }}
                                >{val}</button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <button className="gf-btn-ghost" style={{ textAlign: 'left', padding: '12px 0 0' }} onClick={() => setStep('select')}>← Change selection</button>

            <div className="gf-form">
              <div className="gf-section-label">Shipping</div>
              {form.source !== 'none' && form.address1.trim() !== '' && (
                <div className="gf-note">We&rsquo;ve filled in what we have on file — please make sure it&rsquo;s still current.</div>
              )}
              {field('Full name', 'name', { required: true, autoComplete: 'name' })}
              {field('Email', 'email', { required: true, type: 'email', autoComplete: 'email', inputMode: 'email' })}
              {field('Phone', 'phone', { required: true, type: 'tel', autoComplete: 'tel', inputMode: 'tel' })}
              {generic && field('Instagram handle (optional)', 'instagram_handle', { autoComplete: 'off', placeholder: '@yourhandle' })}
              {field('Address', 'address1', { required: true, autoComplete: 'address-line1' })}
              {field('Apt / unit (optional)', 'address2', { autoComplete: 'address-line2' })}
              <div className="gf-row2">
                {field('City', 'city', { required: true, autoComplete: 'address-level2' })}
                {field(['US', 'CA'].includes(form.country_code) ? 'State / Province' : 'Region', 'province', { required: ['US', 'CA'].includes(form.country_code), autoComplete: 'address-level1' })}
              </div>
              <div className="gf-row2">
                {field('Postal / ZIP', 'zip', { required: true, autoComplete: 'postal-code' })}
                <div className="gf-field">
                  <label className="gf-label">Country *</label>
                  <select className="gf-select" value={form.country_code} onChange={e => setForm(prev => ({ ...prev, country_code: e.target.value }))}>
                    <option value="">Select…</option>
                    {getCountries().map(cc => <option key={cc.code} value={cc.code}>{cc.name}</option>)}
                  </select>
                </div>
              </div>
              {submitError && <div className="gf-error">{submitError}</div>}
              <button className="gf-btn" style={{ marginTop: 10 }} disabled={submitting} onClick={submit}>
                {submitting ? 'Sending…' : 'Confirm My Picks'}
              </button>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="gf-body" style={{ paddingTop: 56 }}>
            <div className="gf-done-icon">✓</div>
            <div className="gf-headline" style={{ textAlign: 'center' }}>You&rsquo;re all set.</div>
            <div className="gf-sub" style={{ textAlign: 'center' }}>Your picks are in — here&rsquo;s what happens next.</div>
            <div className="gf-steps">
              <div className="gf-step"><div className="gf-step-num">1</div><div className="gf-step-text">Our team confirms your order.</div></div>
              <div className="gf-step"><div className="gf-step-num">2</div><div className="gf-step-text">Your pieces ship within 5–7 business days.</div></div>
              <div className="gf-step"><div className="gf-step-num">3</div><div className="gf-step-text">Tracking goes to {submitted?.shipping?.email || 'your email'}.</div></div>
              <div className="gf-step" style={{ borderBottom: 'none' }}><div className="gf-step-num">4</div><div className="gf-step-text">Tag <strong>@nama</strong> when they arrive — we&rsquo;d love to reshare you 🤍</div></div>
            </div>
            {generic && personalUrl ? (
              <a className="gf-btn-ghost" href={personalUrl} style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
                View my order status — save this link
              </a>
            ) : (
              <button className="gf-btn-ghost" onClick={() => setStep('status')}>View my order status</button>
            )}
          </div>
        )}

        {step === 'status' && submitted && (
          <div className="gf-body" style={{ paddingTop: 40 }}>
            <div className="gf-eyebrow">Nama — {c.name}</div>
            <div className="gf-headline">Your <em>picks.</em></div>
            <div className="gf-timeline">
              {[
                ['Submitted', true],
                ['Order placed', !!submitted.order_status],
                ['Shipped', submitted.order_status === 'shipped' || submitted.order_status === 'delivered' || !!submitted.tracking_url],
                ['Delivered', submitted.order_status === 'delivered'],
              ].map(([label, on]) => (
                <div key={label} className={`gf-tl-item${on ? ' on' : ''}`}><div className="gf-tl-dot" /><div className="gf-tl-label">{label}</div></div>
              ))}
            </div>
            {submitted.tracking_url && (
              <a href={submitted.tracking_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: '#111', textDecoration: 'underline', display: 'block', margin: '4px 0 14px' }}>
                Track your package {submitted.tracking_number ? `(${submitted.tracking_number})` : ''} →
              </a>
            )}
            <div style={{ margin: '18px 0' }}>
              {(submitted.selections || []).map((p, i) => (
                <div key={i} className="gf-cart-row">
                  {p.image ? <img className="gf-cart-img" src={p.image} alt={p.title} /> : <div className="gf-cart-img" />}
                  <div>
                    <div className="gf-cart-title">{p.title}</div>
                    {p.variant_title && <div className="gf-cart-variant">Size {p.variant_title}</div>}
                  </div>
                </div>
              ))}
            </div>
            {submitted.shipping && (
              <>
                <div className="gf-section-label">Shipping to</div>
                <div className="gf-addr">
                  {submitted.shipping.name}<br />
                  {submitted.shipping.address1}{submitted.shipping.address2 ? `, ${submitted.shipping.address2}` : ''}<br />
                  {[submitted.shipping.city, submitted.shipping.province, submitted.shipping.zip].filter(Boolean).join(', ')} {submitted.shipping.country_code}
                </div>
                <div className="gf-sub" style={{ marginTop: 14 }}>Need to change something? Reply to your Nama contact and we&rsquo;ll fix it before it ships.</div>
              </>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
