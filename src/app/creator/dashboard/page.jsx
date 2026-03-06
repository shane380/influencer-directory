'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,300;0,400;0,500;1,300;1,400;1,500&display=swap');

.cd-wrap { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #111; margin: 0; padding: 0; }
.cd-wrap *, .cd-wrap *::before, .cd-wrap *::after { box-sizing: border-box; margin: 0; padding: 0; }

/* Desktop */
.cd-desktop { display: block; }
.cd-mobile { display: none; }
@media (max-width: 768px) {
  .cd-desktop { display: none !important; }
  .cd-mobile { display: block !important; }
}

/* TOP NAV */
.cd-topnav { position: fixed; top: 0; left: 0; right: 0; height: 56px; background: #fff; border-bottom: 1px solid #e8e8e8; display: flex; align-items: center; justify-content: space-between; z-index: 100; }
.cd-topnav-logo { height: 28px; display: block; width: fit-content; padding: 0 32px; }
.cd-topnav-links { display: flex; height: 100%; }
.cd-topnav-link { display: flex; align-items: center; padding: 0 24px; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: #aaa; cursor: pointer; text-decoration: none; border-left: 1px solid #e8e8e8; transition: color 0.15s; background: none; border-top: none; border-bottom: none; border-right: none; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
.cd-topnav-link:hover { color: #111; }
.cd-topnav-link.active { color: #111; }
.cd-topnav-right { display: flex; align-items: center; height: 100%; border-left: 1px solid #e8e8e8; padding: 0 24px; }
.cd-topnav-avatar { width: 28px; height: 28px; border-radius: 50%; border: 1px solid #e8e8e8; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #555; letter-spacing: 0.04em; overflow: hidden; }
.cd-topnav-avatar img { width: 100%; height: 100%; object-fit: cover; }

/* LAYOUT */
.cd-layout { display: grid; grid-template-columns: 300px 1fr; min-height: calc(100vh - 56px); }
.cd-page { background: #f7f7f7; min-height: 100vh; padding-top: 56px; }

/* SIDEBAR */
.cd-sidebar { background: #fff; border-right: 1px solid #e8e8e8; position: sticky; top: 56px; height: calc(100vh - 56px); overflow-y: auto; display: flex; flex-direction: column; }
.cd-identity { padding: 36px 32px 28px; border-bottom: 1px solid #e8e8e8; }
.cd-eyebrow { font-size: 9px; letter-spacing: 0.38em; text-transform: uppercase; color: #aaa; margin-bottom: 14px; }
.cd-creator-name { font-family: 'Playfair Display', serif; font-size: 30px; font-weight: 400; color: #111; line-height: 1.0; margin-bottom: 4px; }
.cd-creator-handle { font-size: 11px; color: #aaa; margin-bottom: 18px; letter-spacing: 0.03em; }
.cd-profile-photo { width: 72px; height: 72px; border-radius: 50%; object-fit: cover; display: block; border: 1px solid #e8e8e8; margin-bottom: 16px; }
.cd-status-pill { display: inline-flex; align-items: center; gap: 6px; border: 1px solid #e8e8e8; font-size: 9px; letter-spacing: 0.18em; text-transform: uppercase; color: #555; padding: 4px 12px; border-radius: 100px; }
.cd-dot { width: 5px; height: 5px; border-radius: 50%; background: #5db075; flex-shrink: 0; }

/* STATS */
.cd-stats { border-bottom: 1px solid #e8e8e8; }
.cd-stat-row { display: flex; align-items: baseline; justify-content: space-between; padding: 13px 32px; border-bottom: 1px solid #e8e8e8; }
.cd-stat-row:last-child { border-bottom: none; }
.cd-stat-label { font-size: 9px; letter-spacing: 0.22em; text-transform: uppercase; color: #aaa; }
.cd-stat-val { font-family: 'Playfair Display', serif; font-size: 20px; font-weight: 400; color: #111; }

/* AFFILIATE */
.cd-aff-wrap { padding: 24px 32px; border-bottom: 1px solid #e8e8e8; }
.cd-aff-block { background: #111; padding: 18px 20px; border-radius: 4px; }
.cd-aff-label { font-size: 8.5px; letter-spacing: 0.32em; text-transform: uppercase; color: rgba(255,255,255,0.35); margin-bottom: 8px; }
.cd-aff-row { display: flex; align-items: center; justify-content: space-between; }
.cd-aff-code { font-family: 'Playfair Display', serif; font-size: 26px; color: white; letter-spacing: 0.08em; }
.cd-aff-copy { padding: 5px 12px; border: 1px solid rgba(255,255,255,0.2); background: transparent; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 9px; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(255,255,255,0.45); cursor: pointer; border-radius: 2px; transition: all 0.2s; }
.cd-aff-copy:hover { border-color: rgba(255,255,255,0.4); color: rgba(255,255,255,0.7); }

/* SIDENAV */
.cd-sidenav { flex: 1; }
.cd-nav-item { display: flex; align-items: center; justify-content: space-between; padding: 14px 32px; border-bottom: 1px solid #e8e8e8; cursor: pointer; transition: background 0.12s; background: none; width: 100%; text-align: left; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
.cd-nav-item:hover { background: #f5f5f5; }
.cd-nav-item.active { background: #f5f5f5; }
.cd-nav-label { font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: #aaa; }
.cd-nav-item.active .cd-nav-label { color: #111; }
.cd-nav-arrow { font-size: 11px; color: #e8e8e8; }
.cd-nav-item.active .cd-nav-arrow { color: #999; }

/* CONTENT */
.cd-content { padding: 40px 48px 80px; display: flex; flex-direction: column; gap: 20px; }

/* CARDS */
.cd-card { background: #fff; border: 1px solid #e8e8e8; }
.cd-card-head { padding: 32px 36px 0; margin-bottom: 24px; display: flex; align-items: flex-start; justify-content: space-between; }
.cd-card-eyebrow { font-size: 9px; letter-spacing: 0.4em; text-transform: uppercase; color: #aaa; margin-bottom: 10px; display: flex; align-items: center; gap: 14px; }
.cd-card-eyebrow::after { content: ''; width: 32px; height: 1px; background: #e8e8e8; }
.cd-card-title { font-family: 'Playfair Display', serif; font-size: 30px; font-weight: 300; color: #111; line-height: 1; }
.cd-card-sub { font-size: 11px; color: #aaa; margin-top: 4px; }
.cd-card-body { padding: 0 36px 36px; }

/* BADGE */
.cd-badge { display: inline-flex; align-items: center; gap: 5px; border: 1px solid #d4edda; font-size: 9px; letter-spacing: 0.16em; text-transform: uppercase; color: #2e7d32; padding: 4px 10px; border-radius: 100px; background: #f0faf0; }
.cd-badge-pending { border-color: #e8e8e8; color: #888; background: #f5f5f5; }
.cd-badge-yellow { border-color: #ffeeba; color: #a68307; background: #fff8e1; }

/* EMPTY */
.cd-empty { padding: 52px 36px; text-align: center; border-top: 1px solid #e8e8e8; }
.cd-empty-title { font-family: 'Playfair Display', serif; font-size: 22px; font-weight: 300; font-style: italic; color: #111; margin-bottom: 8px; }
.cd-empty-sub { font-size: 12px; color: #aaa; line-height: 1.85; font-weight: 300; }

/* SEARCH */
.cd-search { display: flex; border: 1px solid #e8e8e8; margin-bottom: 20px; }
.cd-search-input { flex: 1; padding: 12px 16px; border: none; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 13px; color: #111; background: #f5f5f5; outline: none; }
.cd-search-input::placeholder { color: #ccc; }
.cd-search-btn { padding: 12px 24px; background: #111; color: white; border: none; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 9.5px; font-weight: 500; letter-spacing: 0.2em; text-transform: uppercase; cursor: pointer; }

/* PRODUCTS */
.cd-products { display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; }
.cd-product { border: 1px solid #e8e8e8; cursor: pointer; transition: border-color 0.2s; }
.cd-product:hover { border-color: #ccc; }
.cd-product-img { aspect-ratio: 4/5; background: #f5f5f5; display: flex; align-items: center; justify-content: center; border-bottom: 1px solid #e8e8e8; overflow: hidden; }
.cd-product-img img { width: 100%; height: 100%; object-fit: cover; }
.cd-product-info { padding: 12px 14px 14px; }
.cd-product-name { font-size: 12px; color: #111; margin-bottom: 2px; }
.cd-product-variant { font-size: 10.5px; color: #aaa; font-weight: 300; }
.cd-product-cta { font-size: 9px; letter-spacing: 0.16em; text-transform: uppercase; color: #999; margin-top: 8px; cursor: pointer; }
.cd-product-cta.added { color: #ccc; }

/* CART */
.cd-cart { border: 1px solid #e8e8e8; padding: 18px 22px; margin-bottom: 20px; }
.cd-cart-label { font-size: 9px; letter-spacing: 0.22em; text-transform: uppercase; color: #aaa; margin-bottom: 12px; }
.cd-cart-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #f2f2f2; font-size: 12px; color: #111; }
.cd-cart-item:last-child { border-bottom: none; }
.cd-cart-remove { font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; color: #c0392b; cursor: pointer; background: none; border: none; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
.cd-cart-submit { width: 100%; padding: 14px; background: #111; color: white; border: none; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 9.5px; font-weight: 500; letter-spacing: 0.22em; text-transform: uppercase; cursor: pointer; margin-top: 12px; }
.cd-cart-submit:disabled { background: #ccc; cursor: not-allowed; }

/* AD */
.cd-ad { border: 1px solid #e8e8e8; margin-bottom: 16px; overflow: hidden; max-width: 420px; }
.cd-ad:last-child { margin-bottom: 0; }
.cd-ad-preview { height: 320px; overflow: hidden; position: relative; }
.cd-ad-preview iframe { width: 100%; height: 320px; border: none; }
.cd-ad-preview-txt { font-size: 9.5px; color: #ccc; letter-spacing: 0.22em; text-transform: uppercase; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); }
.cd-ad-footer { padding: 18px 22px; display: flex; align-items: center; justify-content: space-between; border-top: 1px solid #e8e8e8; }
.cd-ad-name { font-size: 13px; color: #555; font-weight: 300; line-height: 1.4; }
.cd-ad-stats { display: flex; gap: 28px; align-items: center; }
.cd-ad-stat-l { font-size: 8.5px; letter-spacing: 0.22em; text-transform: uppercase; color: #aaa; margin-bottom: 3px; }
.cd-ad-stat-v { font-family: 'Playfair Display', serif; font-size: 22px; color: #111; }
.cd-ad-status { font-size: 9px; letter-spacing: 0.18em; text-transform: uppercase; padding: 4px 10px; border-radius: 100px; font-weight: 500; }
.cd-ad-status-active { background: #e6f4ea; color: #1e7e34; }
.cd-ad-status-paused { background: #f0f0f0; color: #888; }

/* FORM */
.cd-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 14px; }
.cd-field-label { font-size: 9px; letter-spacing: 0.25em; text-transform: uppercase; color: #aaa; display: block; margin-bottom: 7px; }
.cd-field-input { width: 100%; padding: 12px 14px; border: 1px solid #e8e8e8; background: #f5f5f5; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 13px; color: #111; outline: none; transition: border-color 0.2s; }
.cd-field-input:focus { border-color: #aaa; }
.cd-field-textarea { width: 100%; padding: 12px 14px; border: 1px solid #e8e8e8; background: #f5f5f5; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 13px; color: #111; outline: none; resize: vertical; min-height: 80px; display: block; margin-bottom: 20px; }
.cd-field-textarea:focus { border-color: #aaa; }
.cd-submit { padding: 14px 36px; background: #111; color: white; border: none; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 9.5px; font-weight: 500; letter-spacing: 0.22em; text-transform: uppercase; cursor: pointer; }
.cd-submit:disabled { background: #ccc; cursor: not-allowed; }

/* PAST ITEMS */
.cd-past-item { display: flex; justify-content: space-between; align-items: flex-start; padding: 14px 0; border-bottom: 1px solid #f2f2f2; }
.cd-past-item:last-child { border-bottom: none; }
.cd-past-label { font-size: 11px; color: #aaa; margin-bottom: 2px; }
.cd-past-text { font-size: 13px; color: #111; line-height: 1.4; }
.cd-past-link { font-size: 12px; color: #111; word-break: break-all; text-decoration: none; }
.cd-past-link:hover { text-decoration: underline; }
.cd-past-notes { font-size: 11px; color: #aaa; margin-top: 3px; }

/* WARDROBE TABLE */
.cd-order-row { display: flex; justify-content: space-between; align-items: flex-start; padding: 14px 0; border-bottom: 1px solid #f2f2f2; }
.cd-order-row:last-child { border-bottom: none; }

/* SUCCESS MSG */
.cd-success { font-size: 12px; color: #2e7d32; padding: 10px 14px; background: #f0faf0; border: 1px solid #d4edda; margin-bottom: 16px; }

/* ===================== */
/*        MOBILE         */
/* ===================== */
.cd-m-wrap { background: #f7f7f7; min-height: 100vh; }
.cd-m-topbar { padding: 0 20px; height: 52px; background: #fff; border-bottom: 1px solid #e8e8e8; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 100; }
.cd-m-logo { height: 24px; display: block; width: fit-content; }
.cd-m-avatar { width: 28px; height: 28px; border-radius: 50%; border: 1px solid #e8e8e8; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #555; overflow: hidden; }
.cd-m-avatar img { width: 100%; height: 100%; object-fit: cover; }

.cd-m-hero { padding: 28px 20px 24px; border-bottom: 1px solid #e8e8e8; background: #fff; }
.cd-m-eyebrow { font-size: 9px; letter-spacing: 0.38em; text-transform: uppercase; color: #aaa; margin-bottom: 12px; }
.cd-m-name { font-family: 'Playfair Display', serif; font-size: 34px; font-weight: 400; color: #111; line-height: 1.05; margin-bottom: 4px; }
.cd-m-handle { font-size: 11px; color: #aaa; margin-bottom: 16px; }
.cd-m-profile-photo { width: 64px; height: 64px; border-radius: 50%; object-fit: cover; display: block; border: 1px solid #e8e8e8; margin-bottom: 14px; }
.cd-m-status { display: inline-flex; align-items: center; gap: 6px; border: 1px solid #e8e8e8; font-size: 9px; letter-spacing: 0.16em; text-transform: uppercase; color: #555; padding: 4px 12px; border-radius: 100px; }

.cd-m-stats { display: flex; border-bottom: 1px solid #e8e8e8; background: #fff; }
.cd-m-stat { flex: 1; padding: 14px 0; text-align: center; border-right: 1px solid #e8e8e8; }
.cd-m-stat:last-child { border-right: none; }
.cd-m-stat-l { font-size: 8px; letter-spacing: 0.2em; text-transform: uppercase; color: #aaa; margin-bottom: 3px; }
.cd-m-stat-v { font-family: 'Playfair Display', serif; font-size: 20px; color: #111; }

.cd-m-aff-wrap { padding: 20px; border-bottom: 1px solid #e8e8e8; background: #fff; }
.cd-m-aff { background: #111; padding: 16px 18px; border-radius: 4px; display: flex; align-items: center; justify-content: space-between; }
.cd-m-aff-label { font-size: 8.5px; letter-spacing: 0.28em; text-transform: uppercase; color: rgba(255,255,255,0.35); margin-bottom: 5px; }
.cd-m-aff-code { font-family: 'Playfair Display', serif; font-size: 24px; color: white; letter-spacing: 0.08em; }
.cd-m-aff-copy { padding: 6px 14px; border: 1px solid rgba(255,255,255,0.2); background: transparent; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,0.4); cursor: pointer; border-radius: 2px; }

.cd-m-sections { padding-bottom: 90px; }
.cd-m-section { background: #fff; border-bottom: 8px solid #f7f7f7; }
.cd-m-section-head { padding: 24px 20px 0; margin-bottom: 16px; }
.cd-m-section-eyebrow { font-size: 9px; letter-spacing: 0.38em; text-transform: uppercase; color: #aaa; margin-bottom: 8px; }
.cd-m-section-title { font-family: 'Playfair Display', serif; font-size: 26px; font-weight: 300; color: #111; line-height: 1; }
.cd-m-section-body { padding: 0 20px 24px; }

.cd-m-empty { padding: 32px 0; text-align: center; }
.cd-m-empty-title { font-family: 'Playfair Display', serif; font-size: 20px; font-weight: 300; font-style: italic; color: #111; margin-bottom: 6px; }
.cd-m-empty-sub { font-size: 12px; color: #aaa; line-height: 1.8; }

.cd-m-search { display: flex; border: 1px solid #e8e8e8; margin-bottom: 14px; }
.cd-m-search-input { flex: 1; padding: 11px 14px; border: none; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 13px; color: #111; background: #f5f5f5; outline: none; }
.cd-m-search-btn { padding: 11px 18px; background: #111; color: white; border: none; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 9.5px; font-weight: 500; letter-spacing: 0.15em; text-transform: uppercase; cursor: pointer; }

.cd-m-products { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.cd-m-product { border: 1px solid #e8e8e8; cursor: pointer; }
.cd-m-product-img { aspect-ratio: 4/5; background: #f5f5f5; display: flex; align-items: center; justify-content: center; border-bottom: 1px solid #e8e8e8; overflow: hidden; }
.cd-m-product-img img { width: 100%; height: 100%; object-fit: cover; }
.cd-m-product-info { padding: 10px 12px 12px; }
.cd-m-product-name { font-size: 11.5px; color: #111; margin-bottom: 2px; }
.cd-m-product-variant { font-size: 10px; color: #aaa; font-weight: 300; }
.cd-m-product-cta { font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; color: #999; margin-top: 6px; }

.cd-m-ad { border: 1px solid #e8e8e8; margin-bottom: 14px; overflow: hidden; }
.cd-m-ad:last-child { margin-bottom: 0; }
.cd-m-ad-preview { height: 240px; overflow: hidden; position: relative; }
.cd-m-ad-preview iframe { width: 100%; height: 240px; border: none; }
.cd-m-ad-preview-txt { font-size: 9.5px; color: #ccc; letter-spacing: 0.22em; text-transform: uppercase; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); }
.cd-m-ad-meta { padding: 14px 16px; border-top: 1px solid #e8e8e8; }
.cd-m-ad-name { font-size: 12px; color: #555; font-weight: 300; line-height: 1.45; margin-bottom: 12px; }
.cd-m-ad-stats { display: flex; gap: 20px; align-items: center; }
.cd-m-ad-stat-l { font-size: 8.5px; letter-spacing: 0.2em; text-transform: uppercase; color: #aaa; margin-bottom: 2px; }
.cd-m-ad-stat-v { font-family: 'Playfair Display', serif; font-size: 20px; color: #111; }
.cd-m-ad-status { font-size: 8px; letter-spacing: 0.16em; text-transform: uppercase; padding: 3px 8px; border-radius: 100px; font-weight: 500; }
.cd-m-ad-status-active { background: #e6f4ea; color: #1e7e34; }
.cd-m-ad-status-paused { background: #f0f0f0; color: #888; }

.cd-m-field-label { font-size: 9px; letter-spacing: 0.22em; text-transform: uppercase; color: #aaa; display: block; margin-bottom: 6px; }
.cd-m-field-input { width: 100%; padding: 11px 14px; border: 1px solid #e8e8e8; background: #f5f5f5; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 13px; color: #111; outline: none; display: block; margin-bottom: 12px; }
.cd-m-submit { width: 100%; padding: 14px; background: #111; color: white; border: none; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 9.5px; font-weight: 500; letter-spacing: 0.22em; text-transform: uppercase; cursor: pointer; margin-top: 4px; }
.cd-m-submit:disabled { background: #ccc; cursor: not-allowed; }

/* MOBILE BOTTOM NAV */
.cd-m-bottom-nav { position: fixed; bottom: 0; left: 0; right: 0; background: #fff; border-top: 1px solid #e8e8e8; display: flex; padding: 10px 0 20px; z-index: 50; }
.cd-m-nav-item { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 5px; cursor: pointer; background: none; border: none; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
.cd-m-nav-label { font-size: 8.5px; letter-spacing: 0.12em; text-transform: uppercase; color: #aaa; }
.cd-m-nav-item.active .cd-m-nav-label { color: #111; }
.cd-m-nav-tick { width: 16px; height: 1px; background: transparent; }
.cd-m-nav-item.active .cd-m-nav-tick { background: #111; }

/* LOADING */
.cd-loading { display: flex; align-items: center; justify-content: center; min-height: 100vh; font-size: 12px; color: #aaa; letter-spacing: 0.15em; text-transform: uppercase; }
`

const TABS = ['wardrobe', 'request', 'ads', 'submit']
const TAB_LABELS = { wardrobe: 'Wardrobe', request: 'Request Styles', ads: 'Ads', submit: 'Submit' }
const TAB_LABELS_SHORT = { wardrobe: 'Wardrobe', request: 'Request', ads: 'Ads', submit: 'Submit' }

export default function CreatorDashboard() {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [creator, setCreator] = useState(null)
  const [invite, setInvite] = useState(null)
  const [influencer, setInfluencer] = useState(null)
  const [orders, setOrders] = useState([])
  const [activeTab, setActiveTab] = useState('wardrobe')

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

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/creator/login'); return }

      const { data: creatorData } = await supabase.from('creators').select('*').eq('user_id', user.id).single()
      if (!creatorData) { router.push('/creator/login'); return }
      setCreator(creatorData)

      const { data: inviteData } = await supabase.from('creator_invites').select('*').eq('id', creatorData.invite_id).single()
      setInvite(inviteData)

      // Find linked influencer — by invite's influencer_id, or fallback to name match
      let infData = null
      if (inviteData?.influencer_id) {
        const { data } = await supabase.from('influencers').select('*').eq('id', inviteData.influencer_id).single()
        infData = data
      }
      if (!infData && creatorData.creator_name) {
        const { data } = await supabase.from('influencers').select('*').ilike('name', creatorData.creator_name).single()
        infData = data
      }
      if (infData) {
        setInfluencer(infData)
        const { data: orderData } = await supabase.from('influencer_orders').select('*').eq('influencer_id', infData.id).order('order_date', { ascending: false })
        setOrders(orderData || [])
        if (infData.instagram_handle) {
          setAdsLoading(true)
          try {
            const res = await fetch(`/api/meta/creator-ads?handle=${encodeURIComponent(infData.instagram_handle)}`)
            const data = await res.json()
            setAds(data.ads || [])
          } catch {}
          setAdsLoading(false)
        }
      }

      const { data: reqData } = await supabase.from('creator_sample_requests').select('*').eq('creator_id', creatorData.id).order('created_at', { ascending: false })
      setPastRequests(reqData || [])

      const { data: subData } = await supabase.from('creator_content_submissions').select('*').eq('creator_id', creatorData.id).order('created_at', { ascending: false })
      setSubmissions(subData || [])

      setLoading(false)
    }
    load()
  }, [])

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
    if (cart.find(c => c.shopify_variant_id === product.variant_id)) return
    setCart(prev => [...prev, {
      shopify_variant_id: product.variant_id,
      product_title: product.title,
      variant_title: product.variant_title,
      image_url: product.image,
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
      const { data } = await supabase.from('creator_sample_requests').select('*').eq('creator_id', creator.id).order('created_at', { ascending: false })
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
      const { data } = await supabase.from('creator_content_submissions').select('*').eq('creator_id', creator.id).order('created_at', { ascending: false })
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

  function formatSpend(val) {
    const n = parseFloat(val)
    if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`
    return `$${n.toLocaleString('en-US', { minimumFractionDigits: 0 })}`
  }

  function formatImpressions(val) {
    const n = parseInt(val)
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
    return n.toLocaleString()
  }

  if (loading) {
    return (
      <div className="cd-wrap">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="cd-loading">Loading…</div>
      </div>
    )
  }

  const creatorName = influencer?.name || creator?.creator_name || ''
  const handle = influencer?.instagram_handle ? `@${influencer.instagram_handle}` : ''
  const photoUrl = influencer?.profile_photo_url
  const initials = creatorName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const commissionRate = invite?.commission_rate || creator?.commission_rate || 0
  const videosPerMonth = invite?.videos_per_month || '—'
  const affiliateCode = creator?.affiliate_code || ''
  const adsRunning = ads.filter(a => a.status === 'ACTIVE').length

  // --- SHARED SECTION RENDERERS ---

  function renderWardrobe(mobile) {
    if (orders.length === 0) {
      return mobile ? (
        <div className="cd-m-empty">
          <div className="cd-m-empty-title">Your first pieces are coming.</div>
          <div className="cd-m-empty-sub">Once your styles ship, they&apos;ll appear here.</div>
        </div>
      ) : (
        <div className="cd-empty">
          <div className="cd-empty-title">Your first pieces are coming.</div>
          <div className="cd-empty-sub">Once your styles ship, they&apos;ll appear here.<br />Expect something in your first box shortly.</div>
        </div>
      )
    }
    return (
      <div style={{ padding: mobile ? 0 : undefined }}>
        {orders.map(order => (
          <div key={order.id} className="cd-order-row">
            <div>
              {(order.line_items || []).map((item, i) => (
                <div key={i}>
                  <div className="cd-past-text">{item.product_name}{item.variant_title && <span style={{ color: '#aaa' }}> — {item.variant_title}</span>}{item.quantity > 1 && <span style={{ color: '#aaa' }}> x{item.quantity}</span>}</div>
                </div>
              ))}
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div className="cd-past-label">
                {new Date(order.order_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  function renderRequestStyles(mobile) {
    if (requestSuccess) {
      return (
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: mobile ? 20 : 22, fontWeight: 300, fontStyle: 'italic', color: '#111', marginBottom: 8 }}>Request sent.</div>
          <div style={{ fontSize: 12, color: '#aaa', marginBottom: 16 }}>We&apos;ll confirm your selections shortly.</div>
          <button className={mobile ? 'cd-m-submit' : 'cd-submit'} style={{ width: 'auto', padding: '10px 24px' }} onClick={() => setRequestSuccess(false)}>Request More</button>
        </div>
      )
    }

    const prefix = mobile ? 'cd-m-' : 'cd-'
    return (
      <>
        <div className={`${prefix}search`}>
          <input
            className={`${prefix}search-input`}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && searchProducts()}
            placeholder="Search by product name or SKU…"
          />
          <button className={`${prefix}search-btn`} onClick={searchProducts} disabled={searching}>
            {searching ? '…' : 'Search'}
          </button>
        </div>

        {searchResults.length > 0 && (
          <div className={mobile ? 'cd-m-products' : 'cd-products'}>
            {searchResults.slice(0, mobile ? 6 : 9).map(product => {
              const inCart = cart.find(c => c.shopify_variant_id === product.variant_id)
              return (
                <div key={product.variant_id} className={mobile ? 'cd-m-product' : 'cd-product'} onClick={() => !inCart && addToCart(product)}>
                  <div className={mobile ? 'cd-m-product-img' : 'cd-product-img'}>
                    {product.image ? <img src={product.image} alt="" /> : <span style={{ fontSize: 9, color: '#ccc', letterSpacing: '0.1em', textTransform: 'uppercase' }}>No image</span>}
                  </div>
                  <div className={mobile ? 'cd-m-product-info' : 'cd-product-info'}>
                    <div className={mobile ? 'cd-m-product-name' : 'cd-product-name'}>{product.title}</div>
                    {product.variant_title && <div className={mobile ? 'cd-m-product-variant' : 'cd-product-variant'}>{product.variant_title}</div>}
                    <div className={`${mobile ? 'cd-m-product-cta' : 'cd-product-cta'}${inCart ? ' added' : ''}`}>
                      {inCart ? '✓ Added' : '+ Request this style'}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {cart.length > 0 && (
          <div className="cd-cart" style={{ marginTop: 16 }}>
            <div className="cd-cart-label">Your Request ({cart.length} {cart.length === 1 ? 'item' : 'items'})</div>
            {cart.map(item => (
              <div key={item.shopify_variant_id} className="cd-cart-item">
                <span>{item.product_title}{item.variant_title && ` — ${item.variant_title}`}</span>
                <button className="cd-cart-remove" onClick={() => removeFromCart(item.shopify_variant_id)}>Remove</button>
              </div>
            ))}
            <button className="cd-cart-submit" onClick={submitRequest} disabled={requestSubmitting}>
              {requestSubmitting ? 'Submitting…' : 'Submit Request →'}
            </button>
          </div>
        )}

        {pastRequests.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div className="cd-cart-label">Past Requests</div>
            {pastRequests.map(req => (
              <div key={req.id} className="cd-past-item">
                <div>
                  {(req.selections || []).map((sel, i) => (
                    <div key={i} className="cd-past-text">{sel.product_title}{sel.variant_title && ` — ${sel.variant_title}`}</div>
                  ))}
                  <div className="cd-past-label">{new Date(req.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</div>
                </div>
                <span className={`cd-badge${req.status === 'pending' ? ' cd-badge-pending' : ''}`}>{req.status}</span>
              </div>
            ))}
          </div>
        )}
      </>
    )
  }

  function renderAds(mobile) {
    if (adsLoading) {
      return <div style={{ fontSize: 12, color: '#aaa', padding: '20px 0' }}>Loading ads…</div>
    }
    if (ads.length === 0) {
      return mobile ? (
        <div className="cd-m-empty">
          <div className="cd-m-empty-title">No ads yet.</div>
          <div className="cd-m-empty-sub">Once we start running your content,<br />they&apos;ll show up here.</div>
        </div>
      ) : (
        <div className="cd-empty">
          <div className="cd-empty-title">No ads running yet.</div>
          <div className="cd-empty-sub">Once we start running your content as paid media, they&apos;ll appear here.</div>
        </div>
      )
    }

    return ads.map((ad, i) => {
      // Clean up ad name: take first product, title-case it
      const cleanName = (ad.name || '')
        .split(',')[0]
        .trim()
        .replace(/\b\w/g, c => c.toUpperCase())
        .replace(/\s+(Washed|In|With)\s+/g, (m, w) => ` — ${w.charAt(0).toUpperCase() + w.slice(1)} `)
        .trim()

      const isActive = ad.status === 'ACTIVE'
      const p = mobile ? 'cd-m' : 'cd'

      return (
        <div key={i} className={`${p}-ad`}>
          <div className={`${p}-ad-preview`}>
            {ad.previewHtml ? (
              <iframe srcDoc={ad.previewHtml} sandbox="allow-scripts allow-same-origin" scrolling="no" />
            ) : (
              <div className={`${p}-ad-preview-txt`}>Preview unavailable</div>
            )}
          </div>
          {mobile ? (
            <div className="cd-m-ad-meta">
              <div className="cd-m-ad-name">{cleanName}</div>
              <div className="cd-m-ad-stats">
                <span className={`cd-m-ad-status ${isActive ? 'cd-m-ad-status-active' : 'cd-m-ad-status-paused'}`}>{isActive ? 'Active' : 'Paused'}</span>
                <div><div className="cd-m-ad-stat-l">Spent</div><div className="cd-m-ad-stat-v">{formatSpend(ad.spend)}</div></div>
                <div><div className="cd-m-ad-stat-l">Reach</div><div className="cd-m-ad-stat-v">{formatImpressions(ad.impressions)}</div></div>
              </div>
            </div>
          ) : (
            <div className="cd-ad-footer">
              <div className="cd-ad-name">{cleanName}</div>
              <div className="cd-ad-stats">
                <span className={`cd-ad-status ${isActive ? 'cd-ad-status-active' : 'cd-ad-status-paused'}`}>{isActive ? 'Active' : 'Paused'}</span>
                <div><div className="cd-ad-stat-l">Total Spent</div><div className="cd-ad-stat-v">{formatSpend(ad.spend)}</div></div>
                <div><div className="cd-ad-stat-l">Impressions</div><div className="cd-ad-stat-v">{formatImpressions(ad.impressions)}</div></div>
              </div>
            </div>
          )}
        </div>
      )
    })
  }

  function renderSubmitContent(mobile) {
    return (
      <>
        {mobile ? (
          <>
            <label className="cd-m-field-label">Month</label>
            <input className="cd-m-field-input" type="month" value={contentMonth} onChange={e => setContentMonth(e.target.value)} />
            <label className="cd-m-field-label">Video URL</label>
            <input className="cd-m-field-input" value={contentUrl} onChange={e => setContentUrl(e.target.value)} placeholder="Google Drive, Dropbox…" />
            <label className="cd-m-field-label">Notes (optional)</label>
            <input className="cd-m-field-input" value={contentNotes} onChange={e => setContentNotes(e.target.value)} placeholder="Anything we should know…" />
            {contentSuccess && <div className="cd-success">Submitted successfully.</div>}
            <button className="cd-m-submit" onClick={submitContent} disabled={!contentUrl.trim() || contentSubmitting}>
              {contentSubmitting ? 'Submitting…' : 'Submit Content →'}
            </button>
          </>
        ) : (
          <>
            <div className="cd-form-row">
              <div>
                <label className="cd-field-label">Month</label>
                <input className="cd-field-input" type="month" value={contentMonth} onChange={e => setContentMonth(e.target.value)} />
              </div>
              <div>
                <label className="cd-field-label">Video URL</label>
                <input className="cd-field-input" value={contentUrl} onChange={e => setContentUrl(e.target.value)} placeholder="Google Drive, Dropbox…" />
              </div>
            </div>
            <label className="cd-field-label">Notes (optional)</label>
            <textarea className="cd-field-textarea" value={contentNotes} onChange={e => setContentNotes(e.target.value)} placeholder="Anything we should know about this video…" />
            {contentSuccess && <div className="cd-success">Submitted successfully.</div>}
            <button className="cd-submit" onClick={submitContent} disabled={!contentUrl.trim() || contentSubmitting}>
              {contentSubmitting ? 'Submitting…' : 'Submit Content →'}
            </button>
          </>
        )}

        {submissions.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <div className="cd-cart-label">Past Submissions</div>
            {submissions.map(sub => (
              <div key={sub.id} className="cd-past-item">
                <div>
                  <a href={sub.video_url} target="_blank" rel="noopener noreferrer" className="cd-past-link">{sub.video_url}</a>
                  <div className="cd-past-label">{sub.month}</div>
                  {sub.notes && <div className="cd-past-notes">{sub.notes}</div>}
                  {sub.reviewer_notes && <div style={{ fontSize: 11, color: '#a68307', marginTop: 3 }}>Feedback: {sub.reviewer_notes}</div>}
                </div>
                <span className={`cd-badge${sub.status === 'submitted' ? ' cd-badge-pending' : sub.status === 'revision_requested' ? ' cd-badge-yellow' : ''}`}>
                  {sub.status.replace('_', ' ')}
                </span>
              </div>
            ))}
          </div>
        )}
      </>
    )
  }

  // --- DESKTOP RENDER ---
  function renderDesktopCard() {
    const config = {
      wardrobe: { eyebrow: 'Your Collection', title: 'Wardrobe', sub: `${orders.length} piece${orders.length !== 1 ? 's' : ''}` },
      request: { eyebrow: 'Monthly Allowance', title: 'Request Styles' },
      ads: { eyebrow: 'Paid Media', title: 'Live Ads', badge: adsRunning > 0 },
      submit: { eyebrow: 'Monthly Delivery', title: 'Submit Content' },
    }
    const c = config[activeTab]
    return (
      <div className="cd-card">
        <div className="cd-card-head">
          <div>
            <div className="cd-card-eyebrow">{c.eyebrow}</div>
            <div className="cd-card-title">{c.title}</div>
            {c.sub && <div className="cd-card-sub">{c.sub}</div>}
          </div>
          {c.badge && <div className="cd-badge"><span className="cd-dot" /> {adsRunning} Running</div>}
        </div>
        {activeTab === 'wardrobe' && orders.length === 0 ? renderWardrobe(false) : (
          <div className="cd-card-body">
            {activeTab === 'wardrobe' && renderWardrobe(false)}
            {activeTab === 'request' && renderRequestStyles(false)}
            {activeTab === 'ads' && renderAds(false)}
            {activeTab === 'submit' && renderSubmitContent(false)}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="cd-wrap">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ====== DESKTOP ====== */}
      <div className="cd-desktop">
        <div className="cd-page">
          <nav className="cd-topnav">
            <img src="/nama-logo.svg" alt="Nama" className="cd-topnav-logo" />
            <div className="cd-topnav-links">
              {TABS.map(tab => (
                <button key={tab} className={`cd-topnav-link${activeTab === tab ? ' active' : ''}`} onClick={() => setActiveTab(tab)}>
                  {TAB_LABELS[tab]}
                </button>
              ))}
            </div>
            <div className="cd-topnav-right">
              <div className="cd-topnav-avatar">
                {photoUrl ? <img src={photoUrl} alt="" /> : initials}
              </div>
            </div>
          </nav>

          <div className="cd-layout">
            <div className="cd-sidebar">
              <div className="cd-identity">
                <div className="cd-eyebrow">Creator Portal</div>
                {photoUrl ? (
                  <img className="cd-profile-photo" src={photoUrl} alt={creatorName} />
                ) : (
                  <div className="cd-profile-photo" style={{ background: '#e8e8e8' }} />
                )}
                <div className="cd-creator-name">{creatorName}</div>
                {handle && <div className="cd-creator-handle">{handle}</div>}
                <div className="cd-status-pill"><span className="cd-dot" /> Active Partner</div>
              </div>

              <div className="cd-stats">
                {commissionRate > 0 && (
                  <div className="cd-stat-row">
                    <span className="cd-stat-label">Commission</span>
                    <span className="cd-stat-val">{commissionRate}%</span>
                  </div>
                )}
                <div className="cd-stat-row">
                  <span className="cd-stat-label">Videos / Month</span>
                  <span className="cd-stat-val">{videosPerMonth}</span>
                </div>
                <div className="cd-stat-row">
                  <span className="cd-stat-label">Ads Running</span>
                  <span className="cd-stat-val">{adsRunning}</span>
                </div>
              </div>

              {affiliateCode && (
                <div className="cd-aff-wrap">
                  <div className="cd-aff-block">
                    <div className="cd-aff-label">Your Affiliate Code</div>
                    <div className="cd-aff-row">
                      <div className="cd-aff-code">{affiliateCode.toUpperCase()}</div>
                      <button className="cd-aff-copy" onClick={copyCode}>{copied ? 'Copied' : 'Copy'}</button>
                    </div>
                  </div>
                </div>
              )}

              <div className="cd-sidenav">
                {TABS.map((tab, i) => (
                  <button
                    key={tab}
                    className={`cd-nav-item${activeTab === tab ? ' active' : ''}`}
                    style={i === TABS.length - 1 ? { borderBottom: 'none' } : undefined}
                    onClick={() => setActiveTab(tab)}
                  >
                    <span className="cd-nav-label">{TAB_LABELS[tab]}</span>
                    <span className="cd-nav-arrow">→</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="cd-content">
              {renderDesktopCard()}
            </div>
          </div>
        </div>
      </div>

      {/* ====== MOBILE ====== */}
      <div className="cd-mobile">
        <div className="cd-m-wrap">
          <div className="cd-m-topbar">
            <img src="/nama-logo.svg" alt="Nama" className="cd-m-logo" />
            <div className="cd-m-avatar">
              {photoUrl ? <img src={photoUrl} alt="" /> : initials}
            </div>
          </div>

          <div className="cd-m-hero">
            <div className="cd-m-eyebrow">Creator Portal</div>
            {photoUrl ? (
              <img className="cd-m-profile-photo" src={photoUrl} alt={creatorName} />
            ) : (
              <div className="cd-m-profile-photo" style={{ background: '#e8e8e8' }} />
            )}
            <div className="cd-m-name">{creatorName}</div>
            {handle && <div className="cd-m-handle">{handle}</div>}
            <div className="cd-m-status"><span className="cd-dot" /> Active Partner</div>
          </div>

          <div className="cd-m-stats">
            {commissionRate > 0 && (
              <div className="cd-m-stat"><div className="cd-m-stat-l">Commission</div><div className="cd-m-stat-v">{commissionRate}%</div></div>
            )}
            <div className="cd-m-stat"><div className="cd-m-stat-l">Videos</div><div className="cd-m-stat-v">{videosPerMonth}</div></div>
            <div className="cd-m-stat"><div className="cd-m-stat-l">Ads Live</div><div className="cd-m-stat-v">{adsRunning}</div></div>
          </div>

          {affiliateCode && (
            <div className="cd-m-aff-wrap">
              <div className="cd-m-aff">
                <div>
                  <div className="cd-m-aff-label">Affiliate Code</div>
                  <div className="cd-m-aff-code">{affiliateCode.toUpperCase()}</div>
                </div>
                <button className="cd-m-aff-copy" onClick={copyCode}>{copied ? 'Copied' : 'Copy'}</button>
              </div>
            </div>
          )}

          <div className="cd-m-sections">
            {/* Wardrobe */}
            <div className="cd-m-section" style={activeTab !== 'wardrobe' ? { display: 'none' } : undefined}>
              <div className="cd-m-section-head">
                <div className="cd-m-section-eyebrow">Your Collection</div>
                <div className="cd-m-section-title">Wardrobe</div>
              </div>
              <div className="cd-m-section-body">{renderWardrobe(true)}</div>
            </div>

            {/* Request Styles */}
            <div className="cd-m-section" style={activeTab !== 'request' ? { display: 'none' } : undefined}>
              <div className="cd-m-section-head">
                <div className="cd-m-section-eyebrow">Monthly Allowance</div>
                <div className="cd-m-section-title">Request Styles</div>
              </div>
              <div className="cd-m-section-body">{renderRequestStyles(true)}</div>
            </div>

            {/* Live Ads */}
            <div className="cd-m-section" style={activeTab !== 'ads' ? { display: 'none' } : undefined}>
              <div className="cd-m-section-head">
                <div className="cd-m-section-eyebrow">Paid Media</div>
                <div className="cd-m-section-title">Live Ads</div>
              </div>
              <div className="cd-m-section-body">{renderAds(true)}</div>
            </div>

            {/* Submit Content */}
            <div className="cd-m-section" style={activeTab !== 'submit' ? { display: 'none' } : undefined}>
              <div className="cd-m-section-head">
                <div className="cd-m-section-eyebrow">Monthly Delivery</div>
                <div className="cd-m-section-title">Submit Content</div>
              </div>
              <div className="cd-m-section-body">{renderSubmitContent(true)}</div>
            </div>
          </div>

          <div className="cd-m-bottom-nav">
            {TABS.map(tab => (
              <button key={tab} className={`cd-m-nav-item${activeTab === tab ? ' active' : ''}`} onClick={() => setActiveTab(tab)}>
                <div className="cd-m-nav-tick" />
                <div className="cd-m-nav-label">{TAB_LABELS_SHORT[tab]}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
