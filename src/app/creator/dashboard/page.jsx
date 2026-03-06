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
.cd-layout { display: grid; grid-template-columns: 300px 1fr; min-height: 100vh; }
.cd-page { background: #f7f7f7; min-height: 100vh; }

/* SIDEBAR */
.cd-sidebar { background: #fff; border-right: 1px solid #e8e8e8; position: sticky; top: 0; height: 100vh; overflow-y: auto; display: flex; flex-direction: column; }
.cd-sidebar-logo { padding: 28px 32px 24px; border-bottom: 1px solid #e8e8e8; }
.cd-logo-lockup { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.cd-logo-img { height: 28px; display: block; }
.cd-logo-sub { font-size: 8px; letter-spacing: 0.4em; text-transform: uppercase; color: #aaa; text-align: center; }
.cd-identity { padding: 36px 32px 28px; border-bottom: 1px solid #e8e8e8; }
.cd-eyebrow { font-size: 9px; letter-spacing: 0.38em; text-transform: uppercase; color: #aaa; margin-bottom: 14px; }
.cd-creator-name { font-family: 'Playfair Display', serif; font-size: 30px; font-weight: 400; color: #111; line-height: 1.0; margin-bottom: 4px; }
.cd-creator-handle { font-size: 11px; color: #aaa; margin-bottom: 18px; letter-spacing: 0.03em; }
.cd-profile-photo { width: 72px; height: 72px; border-radius: 50%; object-fit: cover; display: block; border: 1px solid #e8e8e8; margin-bottom: 16px; }
.cd-status-pill { display: inline-flex; align-items: center; gap: 6px; border: 1px solid #e8e8e8; font-size: 9px; letter-spacing: 0.18em; text-transform: uppercase; color: #555; padding: 4px 12px; border-radius: 100px; }
.cd-dot { width: 5px; height: 5px; border-radius: 50%; background: #5db075; flex-shrink: 0; }

/* STATS BAR */
.cd-stats-bar { display: flex; border-bottom: 1px solid #e8e8e8; background: #fff; padding: 16px 0; }
.cd-stats-bar-item { flex: 1; text-align: center; position: relative; }
.cd-stats-bar-item + .cd-stats-bar-item::before { content: ''; position: absolute; left: 0; top: 4px; bottom: 4px; width: 1px; background: #e8e8e8; }
.cd-stats-bar-label { font-size: 9px; letter-spacing: 0.22em; text-transform: uppercase; color: #aaa; margin-bottom: 4px; }
.cd-stats-bar-val { font-family: 'Playfair Display', serif; font-size: 18px; font-weight: 400; color: #111; }

/* AFFILIATE */
.cd-aff-wrap { padding: 24px 32px; border-top: 1px solid #e8e8e8; }
.cd-aff-block { border: 1px solid #e8e8e8; padding: 16px 18px; border-radius: 0; }
.cd-aff-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.cd-aff-label { font-size: 9px; letter-spacing: 0.32em; text-transform: uppercase; color: #aaa; }
.cd-aff-code { font-family: 'Playfair Display', serif; font-size: 22px; color: #111; letter-spacing: 0.06em; }
.cd-aff-copy { padding: 4px 10px; border: 1px solid #e8e8e8; background: transparent; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 8.5px; letter-spacing: 0.12em; text-transform: uppercase; color: #999; cursor: pointer; border-radius: 2px; transition: all 0.2s; }
.cd-aff-copy:hover { border-color: #111; color: #111; }
.cd-aff-divider { border: none; border-top: 1px solid #e8e8e8; margin: 14px 0; }
.cd-aff-link-row { display: flex; align-items: flex-start; justify-content: space-between; }
.cd-aff-link-label { font-size: 9px; letter-spacing: 0.32em; text-transform: uppercase; color: #aaa; margin-bottom: 5px; }
.cd-aff-link-url { font-size: 11px; color: #999; font-weight: 300; }

/* SIDENAV */
.cd-sidenav { flex: 1; }
.cd-nav-item { display: flex; align-items: center; justify-content: space-between; padding: 14px 32px; border-bottom: 1px solid #e8e8e8; cursor: pointer; transition: background 0.12s; background: none; width: 100%; text-align: left; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
.cd-nav-item:hover { background: #f5f5f5; }
.cd-nav-item.active { background: #f5f5f5; }
.cd-nav-label { font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: #aaa; }
.cd-nav-item.active .cd-nav-label { color: #111; }
.cd-nav-arrow { font-size: 11px; color: #999; }
.cd-nav-item.active .cd-nav-arrow { color: #111; }

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
.cd-badge-green { border-color: #d4edda; color: #2e7d32; background: #f0faf0; }
.cd-badge-red { border-color: #f5c6cb; color: #c62828; background: #fef2f2; }

/* UPLOAD */
.cd-upload-sub { font-size: 13px; color: #888; margin-bottom: 20px; line-height: 1.5; }
.cd-dropzone { border: 2px dashed #e0e0e0; padding: 36px 24px; text-align: center; cursor: pointer; transition: border-color 0.2s, background 0.2s; margin-bottom: 16px; }
.cd-dropzone:hover { border-color: #bbb; background: #fafafa; }
.cd-dropzone-icon { font-size: 24px; color: #ccc; margin-bottom: 8px; }
.cd-dropzone-text { font-size: 13px; color: #666; margin-bottom: 4px; }
.cd-dropzone-hint { font-size: 11px; color: #aaa; }
.cd-file-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px; }
.cd-file-item { display: flex; align-items: center; gap: 12px; padding: 10px 12px; background: #f9f9f9; border: 1px solid #eee; }
.cd-file-thumb { width: 44px; height: 44px; flex-shrink: 0; overflow: hidden; background: #eee; display: flex; align-items: center; justify-content: center; }
.cd-file-thumb img { width: 100%; height: 100%; object-fit: cover; }
.cd-file-video-icon { font-size: 16px; color: #888; }
.cd-file-info { flex: 1; min-width: 0; }
.cd-file-name { font-size: 12px; color: #111; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cd-file-size { font-size: 11px; color: #aaa; margin-top: 2px; }
.cd-file-remove { background: none; border: none; font-size: 18px; color: #ccc; cursor: pointer; padding: 4px 8px; line-height: 1; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
.cd-file-remove:hover { color: #888; }
.cd-upload-progress { margin-top: 12px; margin-bottom: 4px; }
.cd-upload-progress-bar { height: 3px; background: #111; transition: width 0.3s; }
.cd-upload-progress-text { font-size: 11px; color: #888; margin-top: 6px; }
.cd-upload-success { text-align: center; padding: 32px 0; }
.cd-upload-success-icon { width: 48px; height: 48px; border-radius: 50%; background: #111; color: white; display: flex; align-items: center; justify-content: center; font-size: 22px; margin: 0 auto 16px; }
.cd-upload-success-title { font-family: 'Playfair Display', serif; font-size: 24px; font-weight: 300; color: #111; margin-bottom: 6px; }
.cd-upload-success-sub { font-size: 13px; color: #888; margin-bottom: 12px; }
.cd-upload-success-link { font-size: 12px; color: #111; text-decoration: none; letter-spacing: 0.04em; }
.cd-upload-success-link:hover { text-decoration: underline; }

/* SUBMISSION PREVIEWS */
.cd-sub-previews { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; margin-bottom: 4px; }
.cd-sub-preview-wrap { position: relative; }
.cd-sub-preview-img { max-height: 120px; border: 1px solid #eee; object-fit: contain; cursor: pointer; display: block; }
.cd-sub-preview-video { max-height: 180px; max-width: 100%; border: 1px solid #eee; display: block; }
.cd-sub-preview-name { font-size: 10px; color: #aaa; margin-top: 3px; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cd-sub-drive-link { font-size: 10px; color: #888; text-decoration: none; }
.cd-sub-drive-link:hover { text-decoration: underline; }

/* LIGHTBOX */
.cd-lightbox { position: fixed; inset: 0; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; z-index: 9999; cursor: pointer; }
.cd-lightbox img, .cd-lightbox video { max-width: 90vw; max-height: 90vh; object-fit: contain; cursor: default; }
.cd-lightbox-close { position: absolute; top: 16px; right: 16px; background: none; border: none; color: #fff; font-size: 28px; cursor: pointer; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; line-height: 1; z-index: 10; }

/* EMPTY */
.cd-empty { padding: 52px 36px; text-align: center; border-top: 1px solid #e8e8e8; }
.cd-empty-title { font-family: 'Playfair Display', serif; font-size: 22px; font-weight: 300; font-style: italic; color: #111; margin-bottom: 8px; }
.cd-empty-sub { font-size: 12px; color: #aaa; line-height: 1.85; font-weight: 300; }

/* SEARCH */
.cd-search { display: flex; border: 1px solid #e8e8e8; margin-bottom: 20px; }
.cd-search-input { flex: 1; padding: 12px 16px; border: none; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 13px; color: #111; background: #f5f5f5; outline: none; }
.cd-search-input::placeholder { color: #ccc; }
.cd-search-btn { padding: 12px 24px; background: #111; color: white; border: none; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 9.5px; font-weight: 500; letter-spacing: 0.2em; text-transform: uppercase; cursor: pointer; }

/* CAMPAIGNS */
.cd-campaign-card { background: #fff; border: 1px solid #e8e8e8; margin-bottom: 16px; }
.cd-campaign-head { padding: 28px 32px 0; }
.cd-campaign-eyebrow { font-size: 9px; letter-spacing: 0.35em; text-transform: uppercase; color: #aaa; display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
.cd-campaign-title { font-family: 'Playfair Display', serif; font-size: 24px; font-weight: 300; color: #111; line-height: 1.2; margin-bottom: 4px; }
.cd-campaign-due { font-size: 11px; color: #888; margin-bottom: 12px; }
.cd-campaign-desc { font-size: 13px; color: #555; line-height: 1.6; margin-bottom: 0; padding: 0 32px 20px; }
.cd-campaign-brief { display: flex; gap: 8px; overflow-x: auto; padding: 0 32px 16px; }
.cd-campaign-brief img { height: 200px; border: 1px solid #eee; object-fit: contain; flex-shrink: 0; }
.cd-campaign-brief-link { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: #111; text-decoration: none; letter-spacing: 0.06em; padding: 8px 16px; border: 1px solid #e8e8e8; margin: 0 32px 16px; }
.cd-campaign-brief-link:hover { border-color: #aaa; }
.cd-campaign-status { display: inline-flex; align-items: center; gap: 6px; font-size: 9px; letter-spacing: 0.16em; text-transform: uppercase; padding: 5px 14px; border-radius: 100px; border: 1px solid; }
.cd-campaign-status-sent { color: #1565c0; border-color: #bbdefb; background: #e3f2fd; }
.cd-campaign-status-confirmed { color: #e65100; border-color: #ffe0b2; background: #fff3e0; }
.cd-campaign-status-content { color: #6a1b9a; border-color: #e1bee7; background: #f3e5f5; }
.cd-campaign-status-complete { color: #2e7d32; border-color: #d4edda; background: #f0faf0; }
.cd-campaign-status-declined { color: #888; border-color: #e8e8e8; background: #f5f5f5; }
.cd-campaign-body { padding: 0 32px 28px; }
.cd-campaign-products { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; margin-top: 12px; }
.cd-campaign-product { border: 1px solid #e8e8e8; cursor: pointer; transition: border-color 0.2s; position: relative; }
.cd-campaign-product.selected { border-color: #111; }
.cd-campaign-product-check { position: absolute; top: 8px; right: 8px; width: 20px; height: 20px; border-radius: 50%; background: #111; color: #fff; font-size: 10px; display: flex; align-items: center; justify-content: center; z-index: 1; }
.cd-campaign-product-img { aspect-ratio: 4/5; background: #f5f5f5; overflow: hidden; }
.cd-campaign-product-img img { width: 100%; height: 100%; object-fit: cover; }
.cd-campaign-product-info { padding: 8px 10px; }
.cd-campaign-product-name { font-size: 11px; color: #111; line-height: 1.3; margin-bottom: 4px; }
.cd-campaign-max { font-size: 10px; color: #aaa; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 10px; }
.cd-campaign-confirm-msg { font-size: 13px; color: #555; line-height: 1.6; padding: 20px 0; }
.cd-campaign-content-link { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: #111; text-decoration: none; letter-spacing: 0.08em; text-transform: uppercase; padding: 8px 0; margin-top: 8px; }
.cd-campaign-content-link:hover { text-decoration: underline; }
.cd-campaign-section-label { font-size: 9px; letter-spacing: 0.3em; text-transform: uppercase; color: #aaa; margin-bottom: 10px; margin-top: 16px; cursor: pointer; }
.cd-campaign-submitted-thumbs { display: flex; gap: 6px; flex-wrap: wrap; }
.cd-campaign-submitted-thumb { width: 48px; height: 48px; background: #f5f5f5; border: 1px solid #eee; overflow: hidden; display: flex; align-items: center; justify-content: center; }
.cd-campaign-submitted-thumb img { width: 100%; height: 100%; object-fit: cover; }

/* PRODUCTS */
.cd-products { display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; }
.cd-product { border: 1px solid #e8e8e8; cursor: pointer; transition: border-color 0.2s; }
.cd-product:hover { border-color: #ccc; }
.cd-product-img { aspect-ratio: 4/5; background: #f5f5f5; display: flex; align-items: center; justify-content: center; border-bottom: 1px solid #e8e8e8; overflow: hidden; }
.cd-product-img img { width: 100%; height: 100%; object-fit: cover; }
.cd-product-info { padding: 12px 14px 14px; }
.cd-product-name { font-size: 12px; color: #111; margin-bottom: 2px; }
.cd-product-variant { font-size: 10.5px; color: #aaa; font-weight: 300; }
.cd-product-cta { display: inline-block; font-size: 9px; letter-spacing: 0.16em; text-transform: uppercase; margin-top: 10px; cursor: pointer; padding: 7px 16px; background: #111; color: #fff; border: 1px solid #111; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
.cd-product-cta.added { background: transparent; color: #ccc; border-color: #e8e8e8; cursor: default; }
.cd-size-row { display: flex; gap: 4px; margin-top: 8px; flex-wrap: wrap; }
.cd-size-pill { padding: 3px 10px; border: 1px solid #e8e8e8; background: #fff; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; color: #555; cursor: pointer; border-radius: 100px; transition: all 0.15s; letter-spacing: 0.04em; }
.cd-size-pill:hover { border-color: #aaa; }
.cd-size-pill.selected { background: #111; color: white; border-color: #111; }
.cd-size-prompt { font-size: 10px; color: #c0392b; margin-top: 4px; }

/* CART */
.cd-cart { border: 1px solid #e8e8e8; padding: 18px 22px; margin-bottom: 20px; display: flex; align-items: flex-start; gap: 20px; }
.cd-cart-left { flex: 1; min-width: 0; }
.cd-cart-label { font-size: 9px; letter-spacing: 0.22em; text-transform: uppercase; color: #aaa; margin-bottom: 8px; }
.cd-cart-item { display: flex; justify-content: space-between; align-items: center; padding: 5px 0; font-size: 12px; color: #111; }
.cd-cart-remove { font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; color: #c0392b; cursor: pointer; background: none; border: none; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; margin-left: 12px; }
.cd-cart-submit { padding: 14px 28px; background: #111; color: white; border: none; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 9.5px; font-weight: 500; letter-spacing: 0.22em; text-transform: uppercase; cursor: pointer; flex-shrink: 0; align-self: center; white-space: nowrap; }
.cd-cart-submit:disabled { background: #ccc; cursor: not-allowed; }

/* EARNINGS CARD */
.cd-earnings { background: #fff; border: 1px solid #e8e8e8; }
.cd-earnings-head { padding: 32px 36px 0; margin-bottom: 24px; display: flex; align-items: flex-start; justify-content: space-between; }
.cd-earnings-title { font-family: 'Playfair Display', serif; font-size: 30px; font-weight: 300; color: #111; line-height: 1; }
.cd-earnings-eyebrow { font-size: 9px; letter-spacing: 0.4em; text-transform: uppercase; color: #aaa; display: flex; align-items: center; gap: 14px; margin-bottom: 10px; }
.cd-earnings-eyebrow::after { content: ''; width: 32px; height: 1px; background: #e8e8e8; }
.cd-earnings-hero { padding: 0 36px 28px; display: flex; align-items: flex-end; justify-content: space-between; gap: 32px; border-bottom: 1px solid #e8e8e8; margin-bottom: 28px; }
.cd-earnings-sublabel { font-size: 9px; letter-spacing: 0.32em; text-transform: uppercase; color: #aaa; margin-bottom: 12px; }
.cd-earnings-amount { display: flex; align-items: baseline; gap: 6px; margin-bottom: 6px; }
.cd-earnings-currency { font-family: 'Playfair Display', serif; font-size: 22px; font-weight: 300; color: #999; line-height: 1; align-self: flex-start; margin-top: 10px; }
.cd-earnings-val { font-family: 'Playfair Display', serif; font-size: 72px; font-weight: 300; color: #111; line-height: 1; }
.cd-earnings-context { font-size: 12px; color: #999; font-weight: 300; }
.cd-earnings-right { text-align: right; padding-bottom: 8px; flex-shrink: 0; }
.cd-earnings-proj-label { font-size: 9px; letter-spacing: 0.22em; text-transform: uppercase; color: #aaa; margin-bottom: 6px; }
.cd-earnings-proj-val { font-family: 'Playfair Display', serif; font-size: 32px; color: #111; font-weight: 300; }
.cd-earnings-proj-note { font-size: 11px; color: #999; margin-top: 3px; }
.cd-progress-wrap { padding: 0 36px 28px; border-bottom: 1px solid #e8e8e8; }
.cd-progress-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; }
.cd-progress-label { font-size: 9px; letter-spacing: 0.22em; text-transform: uppercase; color: #aaa; }
.cd-progress-val { font-family: 'Playfair Display', serif; font-size: 15px; color: #111; }
.cd-progress-track { height: 3px; background: #e8e8e8; border-radius: 2px; overflow: hidden; }
.cd-progress-fill { height: 100%; background: #111; border-radius: 2px; transition: width 1s ease; }
.cd-progress-note { font-size: 11px; color: #aaa; margin-top: 8px; }
.cd-breakdown { padding: 0 36px 28px; }
.cd-breakdown-label { font-size: 9px; letter-spacing: 0.22em; text-transform: uppercase; color: #aaa; margin: 24px 0 14px; }
.cd-breakdown-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e8e8e8; }
.cd-breakdown-row:last-child { border-bottom: none; }
.cd-breakdown-month { font-size: 12px; color: #555; }
.cd-breakdown-right { display: flex; align-items: center; gap: 20px; }
.cd-breakdown-spend { font-size: 11px; color: #aaa; }
.cd-breakdown-earned { font-family: 'Playfair Display', serif; font-size: 17px; color: #111; }
.cd-breakdown-bar-wrap { width: 80px; height: 2px; background: #e8e8e8; border-radius: 2px; }
.cd-breakdown-bar { height: 100%; background: #111; border-radius: 2px; }
.cd-breakdown-current .cd-breakdown-month { color: #111; font-weight: 500; }
.cd-current-badge { font-size: 8.5px; letter-spacing: 0.14em; text-transform: uppercase; color: #2e7d32; background: #f0faf0; border: 1px solid #d4edda; padding: 2px 8px; border-radius: 100px; margin-left: 8px; }
.cd-payment-strip { padding: 16px 36px; background: #f5f5f5; border-top: 1px solid #e8e8e8; display: flex; align-items: center; justify-content: space-between; }
.cd-payment-left { font-size: 12px; color: #555; font-weight: 300; }
.cd-payment-date { font-size: 11px; color: #999; margin-top: 2px; }
.cd-payment-amount { font-family: 'Playfair Display', serif; font-size: 20px; color: #111; }

/* MOMENTUM / LIVE ADS CARD */
.cd-momentum { background: #fff; border: 1px solid #e8e8e8; }
.cd-momentum-head { padding: 32px 36px 0; margin-bottom: 24px; display: flex; align-items: flex-start; justify-content: space-between; }
.cd-momentum-title { font-family: 'Playfair Display', serif; font-size: 30px; font-weight: 300; color: #111; line-height: 1; }
.cd-momentum-eyebrow { font-size: 9px; letter-spacing: 0.4em; text-transform: uppercase; color: #aaa; display: flex; align-items: center; gap: 14px; margin-bottom: 10px; }
.cd-momentum-eyebrow::after { content: ''; width: 32px; height: 1px; background: #e8e8e8; }
.cd-momentum-top { padding: 28px 36px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0; border-bottom: 1px solid #e8e8e8; }
.cd-momentum-stat { padding: 0 28px 0 0; border-right: 1px solid #e8e8e8; margin-right: 28px; }
.cd-momentum-stat:last-child { border-right: none; margin-right: 0; padding-right: 0; }
.cd-momentum-stat-label { font-size: 9px; letter-spacing: 0.22em; text-transform: uppercase; color: #aaa; margin-bottom: 8px; }
.cd-momentum-stat-val { font-family: 'Playfair Display', serif; font-size: 36px; color: #111; font-weight: 300; line-height: 1; margin-bottom: 4px; }
.cd-momentum-stat-sub { font-size: 11px; color: #999; }
.cd-momentum-delta { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; color: #2e7d32; margin-top: 4px; }
.cd-momentum-delta-neg { color: #c0392b; }
.cd-percentile { margin: 0 36px 28px; padding: 20px 0; display: flex; align-items: center; justify-content: space-between; gap: 24px; }
.cd-percentile-eyebrow { font-size: 9px; letter-spacing: 0.28em; text-transform: uppercase; color: #aaa; margin-bottom: 6px; }
.cd-percentile-headline { font-family: 'Playfair Display', serif; font-size: 22px; color: #111; font-weight: 400; line-height: 1.2; }
.cd-percentile-sub { font-size: 12px; color: #999; margin-top: 4px; font-weight: 300; }
.cd-percentile-number { font-family: 'Playfair Display', serif; font-size: 56px; font-weight: 300; color: #111; line-height: 1; }
.cd-percentile-pct { font-size: 22px; font-weight: 300; color: #999; }
.cd-streak { padding: 0 36px 28px; border-top: 1px solid #e8e8e8; padding-top: 24px; }
.cd-streak-label { font-size: 9px; letter-spacing: 0.22em; text-transform: uppercase; color: #aaa; margin-bottom: 14px; }
.cd-streak-months { display: flex; gap: 8px; }
.cd-streak-month { flex: 1; text-align: center; }
.cd-streak-dot { width: 32px; height: 32px; border-radius: 50%; background: #111; margin: 0 auto 6px; display: flex; align-items: center; justify-content: center; }
.cd-streak-dot svg { opacity: 0.8; }
.cd-streak-dot.empty { background: #f5f5f5; border: 1px solid #e8e8e8; }
.cd-streak-month-label { font-size: 9px; color: #aaa; letter-spacing: 0.08em; }
.cd-streak-month.active .cd-streak-month-label { color: #111; }
.cd-streak-note { font-size: 11px; color: #999; margin-top: 14px; font-weight: 300; }
.cd-ads-section { padding: 0 36px 36px; border-top: 1px solid #e8e8e8; padding-top: 24px; }
.cd-ads-section-label { font-size: 9px; letter-spacing: 0.22em; text-transform: uppercase; color: #aaa; margin-bottom: 14px; }
.cd-ads-row { display: flex; gap: 16px; overflow-x: auto; padding-bottom: 8px; }
.cd-ad-card { border: 1px solid #e8e8e8; flex-shrink: 0; width: 320px; }
.cd-ad-preview { width: 320px; height: 620px; overflow: hidden; background: #fff; display: flex; align-items: center; justify-content: center; }
.cd-ad-preview iframe { width: 320px; height: 620px; border: none; display: block; }
.cd-ad-thumb { position: relative; height: 360px; width: 100%; overflow: hidden; background: #1a1a1a; }
.cd-ad-thumb img { width: 100%; height: 100%; object-fit: cover; object-position: center; opacity: 0.85; display: block; }
.cd-ad-thumb-overlay { position: absolute; bottom: 0; left: 0; right: 0; padding: 16px 20px; background: linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 100%); display: flex; align-items: flex-end; justify-content: space-between; }
.cd-ad-thumb-name { font-size: 13px; color: white; font-weight: 300; }
.cd-ad-thumb-status { font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; color: #5db075; background: rgba(0,0,0,0.4); padding: 4px 10px; border-radius: 100px; border: 1px solid rgba(93,176,117,0.4); }
.cd-ad-thumb-status-paused { color: #aaa; border-color: rgba(170,170,170,0.4); }
.cd-ad-stats-strip { display: flex; border-top: 1px solid #e8e8e8; }
.cd-ad-stat { flex: 1; padding: 14px 20px; border-right: 1px solid #e8e8e8; }
.cd-ad-stat:last-child { border-right: none; }
.cd-ad-stat-l { font-size: 8.5px; letter-spacing: 0.22em; text-transform: uppercase; color: #aaa; margin-bottom: 4px; }
.cd-ad-stat-v { font-family: 'Playfair Display', serif; font-size: 22px; color: #111; }
.cd-score-pill { display: inline-flex; align-items: center; gap: 6px; font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; padding: 4px 12px; border-radius: 100px; border: 1px solid; }
.cd-score-strong { color: #2e7d32; border-color: #d4edda; background: #f0faf0; }
.cd-score-scaling { color: #1565c0; border-color: #bbdefb; background: #e3f2fd; }
.cd-score-testing { color: #e65100; border-color: #ffe0b2; background: #fff3e0; }

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

/* WARDROBE GRID */
.cd-wardrobe { background: #fff; border: 1px solid #e8e8e8; }
.cd-wardrobe-head { padding: 32px 36px 0; margin-bottom: 28px; display: flex; align-items: flex-start; justify-content: space-between; }
.cd-wardrobe-title { font-family: 'Playfair Display', serif; font-size: 30px; font-weight: 300; color: #111; line-height: 1; }
.cd-wardrobe-eyebrow { font-size: 9px; letter-spacing: 0.4em; text-transform: uppercase; color: #aaa; display: flex; align-items: center; gap: 14px; margin-bottom: 10px; }
.cd-wardrobe-eyebrow::after { content: ''; width: 32px; height: 1px; background: #e8e8e8; }
.cd-wardrobe-sub { font-size: 11px; color: #aaa; margin-top: 4px; }
.cd-wardrobe-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: #e8e8e8; border-top: 1px solid #e8e8e8; }
.cd-wardrobe-item { background: #fff; position: relative; }
.cd-wardrobe-img { aspect-ratio: 3/4; overflow: hidden; position: relative; }
.cd-wardrobe-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
.cd-wardrobe-img-placeholder { width: 100%; height: 100%; background: #f5f5f5; display: flex; align-items: center; justify-content: center; font-size: 9px; color: #ccc; letter-spacing: 0.1em; text-transform: uppercase; }
.cd-wardrobe-info { padding: 14px 16px 18px; }
.cd-wardrobe-name { font-size: 13px; color: #111; margin-bottom: 3px; line-height: 1.3; }
.cd-wardrobe-variant { font-size: 11px; color: #aaa; font-weight: 300; margin-bottom: 10px; }
.cd-wardrobe-status { display: inline-flex; align-items: center; gap: 5px; font-size: 8.5px; letter-spacing: 0.14em; text-transform: uppercase; padding: 3px 10px; border-radius: 100px; border: 1px solid; }
.cd-status-shipped { color: #2e7d32; border-color: #d4edda; background: #f0faf0; }
.cd-status-transit { color: #1565c0; border-color: #bbdefb; background: #e3f2fd; }
.cd-status-processing { color: #e65100; border-color: #ffe0b2; background: #fff3e0; }
.cd-feedback-toggle { position: absolute; bottom: 10px; right: 10px; background: rgba(255,255,255,0.92); border: 1px solid #e8e8e8; padding: 4px 10px; border-radius: 100px; font-size: 9px; letter-spacing: 0.12em; text-transform: uppercase; color: #555; cursor: pointer; backdrop-filter: blur(4px); font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; z-index: 1; }
.cd-feedback-panel { border-top: 1px solid #e8e8e8; padding: 20px 16px; background: #f5f5f5; }
.cd-feedback-label { font-size: 9px; letter-spacing: 0.22em; text-transform: uppercase; color: #aaa; margin-bottom: 6px; display: block; }
.cd-feedback-reactions { display: flex; gap: 6px; margin-bottom: 14px; flex-wrap: wrap; }
.cd-feedback-reaction { padding: 4px 12px; border: 1px solid #e8e8e8; background: #fff; font-size: 11px; color: #555; cursor: pointer; border-radius: 100px; transition: all 0.15s; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
.cd-feedback-reaction:hover, .cd-feedback-reaction.selected { background: #111; color: white; border-color: #111; }
.cd-feedback-input { width: 100%; padding: 9px 12px; border: 1px solid #e8e8e8; background: #fff; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; color: #111; outline: none; margin-bottom: 10px; display: block; resize: none; }
.cd-feedback-input:focus { border-color: #aaa; }
.cd-feedback-submit { padding: 8px 18px; background: #111; color: white; border: none; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 9px; font-weight: 500; letter-spacing: 0.18em; text-transform: uppercase; cursor: pointer; }
.cd-feedback-done { font-size: 12px; color: #2e7d32; display: flex; align-items: center; gap: 6px; }

/* ORDERS CARD */
.cd-orders { background: #fff; border: 1px solid #e8e8e8; }
.cd-orders-head { padding: 32px 36px 0; margin-bottom: 28px; display: flex; align-items: flex-start; justify-content: space-between; }
.cd-exchange-btn { font-size: 9px; letter-spacing: 0.16em; text-transform: uppercase; color: #999; padding: 5px 14px; border: 1px solid #e8e8e8; background: none; text-decoration: none; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; transition: all 0.15s; white-space: nowrap; }
.cd-exchange-btn:hover { border-color: #111; color: #111; }
.cd-orders-title { font-family: 'Playfair Display', serif; font-size: 30px; font-weight: 300; color: #111; line-height: 1; }
.cd-orders-eyebrow { font-size: 9px; letter-spacing: 0.4em; text-transform: uppercase; color: #aaa; display: flex; align-items: center; gap: 14px; margin-bottom: 10px; }
.cd-orders-eyebrow::after { content: ''; width: 32px; height: 1px; background: #e8e8e8; }
.cd-order-list { border-top: 1px solid #e8e8e8; }
.cd-order-row { display: flex; align-items: flex-start; justify-content: space-between; padding: 20px 36px; border-bottom: 1px solid #e8e8e8; gap: 20px; }
.cd-order-row:last-child { border-bottom: none; }
.cd-order-num { font-size: 11px; color: #999; letter-spacing: 0.06em; margin-bottom: 6px; }
.cd-order-items { font-size: 13px; color: #111; line-height: 1.7; font-weight: 300; }
.cd-order-right { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; flex-shrink: 0; }
.cd-tracking-link { font-size: 11px; color: #111; text-decoration: none; display: flex; align-items: center; gap: 4px; letter-spacing: 0.02em; border-bottom: 1px solid #e8e8e8; padding-bottom: 1px; }
.cd-tracking-link:hover { border-color: #111; }
.cd-tracking-pending { font-size: 11px; color: #aaa; }

/* SUCCESS MSG */
.cd-success { font-size: 12px; color: #2e7d32; padding: 10px 14px; background: #f0faf0; border: 1px solid #d4edda; margin-bottom: 16px; }

/* ===================== */
/*        MOBILE         */
/* ===================== */
.cd-m-wrap { background: #f7f7f7; min-height: 100vh; }
.cd-m-topbar { padding: 0 20px; height: 56px; background: #fff; border-bottom: 1px solid #e8e8e8; display: flex; align-items: center; justify-content: center; position: sticky; top: 0; z-index: 100; }
.cd-m-logo-lockup { display: flex; flex-direction: column; align-items: center; }
.cd-m-logo { height: 28px; display: block; width: fit-content; }
.cd-m-logo-sub { font-size: 7.5px; letter-spacing: 0.4em; text-transform: uppercase; color: #aaa; margin-top: 2px; }
.cd-m-avatar { width: 36px; height: 36px; min-width: 36px; border-radius: 50%; border: 1px solid #e8e8e8; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #555; overflow: hidden; flex-shrink: 0; position: absolute; right: 20px; }
.cd-m-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }

.cd-m-hero { padding: 28px 20px 24px; border-bottom: 1px solid #e8e8e8; background: #fff; display: none; }
.cd-m-eyebrow { font-size: 9px; letter-spacing: 0.38em; text-transform: uppercase; color: #aaa; margin-bottom: 12px; }
.cd-m-name { font-family: 'Playfair Display', serif; font-size: 34px; font-weight: 400; color: #111; line-height: 1.05; margin-bottom: 4px; }
.cd-m-handle { font-size: 11px; color: #aaa; margin-bottom: 16px; }
.cd-m-profile-photo { width: 64px; height: 64px; border-radius: 50%; object-fit: cover; display: block; border: 1px solid #e8e8e8; margin-bottom: 14px; }
.cd-m-status { display: inline-flex; align-items: center; gap: 6px; border: 1px solid #e8e8e8; font-size: 9px; letter-spacing: 0.16em; text-transform: uppercase; color: #555; padding: 4px 12px; border-radius: 100px; }

.cd-m-stats { display: none; border-bottom: 1px solid #e8e8e8; background: #fff; }
.cd-m-stat { flex: 1; padding: 14px 0; text-align: center; border-right: 1px solid #e8e8e8; }
.cd-m-stat:last-child { border-right: none; }
.cd-m-stat-l { font-size: 8px; letter-spacing: 0.2em; text-transform: uppercase; color: #aaa; margin-bottom: 3px; }
.cd-m-stat-v { font-family: 'Playfair Display', serif; font-size: 20px; color: #111; }

.cd-m-aff-wrap { padding: 20px; border-bottom: 1px solid #e8e8e8; background: #fff; display: none; }
.cd-m-aff { border: 1px solid #e8e8e8; padding: 14px 16px; }
.cd-m-aff-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.cd-m-aff-label { font-size: 9px; letter-spacing: 0.28em; text-transform: uppercase; color: #aaa; }
.cd-m-aff-code { font-family: 'Playfair Display', serif; font-size: 22px; color: #111; letter-spacing: 0.06em; }
.cd-m-aff-copy { padding: 4px 10px; border: 1px solid #e8e8e8; background: transparent; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 8.5px; letter-spacing: 0.1em; text-transform: uppercase; color: #999; cursor: pointer; border-radius: 2px; transition: all 0.2s; }
.cd-m-aff-copy:hover { border-color: #111; color: #111; }
.cd-m-aff-divider { border: none; border-top: 1px solid #e8e8e8; margin: 12px 0; }
.cd-m-aff-link-row { display: flex; align-items: flex-start; justify-content: space-between; }
.cd-m-aff-link-label { font-size: 9px; letter-spacing: 0.32em; text-transform: uppercase; color: #aaa; margin-bottom: 5px; }
.cd-m-aff-link-url { font-size: 11px; color: #999; font-weight: 300; }

.cd-m-sections { padding-bottom: 80px; }
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
.cd-m-product-cta { display: inline-block; font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; margin-top: 8px; cursor: pointer; padding: 6px 14px; background: #111; color: #fff; border: 1px solid #111; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
.cd-m-product-cta.added { background: transparent; color: #ccc; border-color: #e8e8e8; cursor: default; }

/* MOBILE EARNINGS */
.cd-m-earnings { background: #fff; border: 1px solid #e8e8e8; margin-bottom: 14px; }
.cd-m-earnings-head { padding: 20px 20px 0; margin-bottom: 16px; }
.cd-m-earnings-eyebrow { font-size: 9px; letter-spacing: 0.32em; text-transform: uppercase; color: #aaa; margin-bottom: 8px; }
.cd-m-earnings-title { font-family: 'Playfair Display', serif; font-size: 24px; font-weight: 300; color: #111; }
.cd-m-earnings-hero { padding: 0 20px 20px; border-bottom: 1px solid #e8e8e8; }
.cd-m-earnings-sublabel { font-size: 9px; letter-spacing: 0.28em; text-transform: uppercase; color: #aaa; margin-bottom: 10px; }
.cd-m-earnings-amount { display: flex; align-items: baseline; gap: 4px; margin-bottom: 4px; }
.cd-m-earnings-currency { font-family: 'Playfair Display', serif; font-size: 18px; font-weight: 300; color: #999; align-self: flex-start; margin-top: 6px; }
.cd-m-earnings-val { font-family: 'Playfair Display', serif; font-size: 52px; font-weight: 300; color: #111; line-height: 1; }
.cd-m-earnings-context { font-size: 11px; color: #999; font-weight: 300; }
.cd-m-earnings-proj { padding: 14px 20px; border-bottom: 1px solid #e8e8e8; display: flex; justify-content: space-between; align-items: center; }
.cd-m-earnings-proj-label { font-size: 9px; letter-spacing: 0.18em; text-transform: uppercase; color: #aaa; }
.cd-m-earnings-proj-val { font-family: 'Playfair Display', serif; font-size: 22px; color: #111; font-weight: 300; }
.cd-m-progress { padding: 16px 20px; border-bottom: 1px solid #e8e8e8; }
.cd-m-progress-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
.cd-m-progress-label { font-size: 9px; letter-spacing: 0.18em; text-transform: uppercase; color: #aaa; }
.cd-m-progress-val { font-size: 12px; color: #111; }
.cd-m-progress-track { height: 3px; background: #e8e8e8; border-radius: 2px; overflow: hidden; }
.cd-m-progress-fill { height: 100%; background: #111; border-radius: 2px; }
.cd-m-payment { padding: 14px 20px; background: #f5f5f5; display: flex; align-items: center; justify-content: space-between; }
.cd-m-payment-left { font-size: 11px; color: #555; }
.cd-m-payment-amount { font-family: 'Playfair Display', serif; font-size: 18px; color: #111; }

/* MOBILE MOMENTUM */
.cd-m-momentum { background: #fff; border: 1px solid #e8e8e8; }
.cd-m-momentum-head { padding: 20px 20px 0; margin-bottom: 16px; }
.cd-m-momentum-eyebrow { font-size: 9px; letter-spacing: 0.32em; text-transform: uppercase; color: #aaa; margin-bottom: 8px; }
.cd-m-momentum-title { font-family: 'Playfair Display', serif; font-size: 24px; font-weight: 300; color: #111; }
.cd-m-momentum-stats { display: flex; border-bottom: 1px solid #e8e8e8; }
.cd-m-momentum-stat { flex: 1; padding: 14px 16px; border-right: 1px solid #e8e8e8; }
.cd-m-momentum-stat:last-child { border-right: none; }
.cd-m-momentum-stat-label { font-size: 8px; letter-spacing: 0.18em; text-transform: uppercase; color: #aaa; margin-bottom: 6px; }
.cd-m-momentum-stat-val { font-family: 'Playfair Display', serif; font-size: 24px; color: #111; font-weight: 300; line-height: 1; }
.cd-m-momentum-delta { font-size: 9px; color: #2e7d32; margin-top: 4px; }
.cd-m-momentum-delta-neg { color: #c0392b; }
.cd-m-percentile { margin: 16px 20px; padding: 16px 0; display: flex; align-items: center; justify-content: space-between; }
.cd-m-percentile-headline { font-family: 'Playfair Display', serif; font-size: 17px; color: #111; font-weight: 400; line-height: 1.2; }
.cd-m-percentile-sub { font-size: 11px; color: #999; margin-top: 3px; font-weight: 300; }
.cd-m-percentile-number { font-family: 'Playfair Display', serif; font-size: 40px; font-weight: 300; color: #111; line-height: 1; }
.cd-m-percentile-pct { font-size: 18px; font-weight: 300; color: #999; }
.cd-m-streak { padding: 16px 20px; border-top: 1px solid #e8e8e8; }
.cd-m-streak-label { font-size: 9px; letter-spacing: 0.18em; text-transform: uppercase; color: #aaa; margin-bottom: 12px; }
.cd-m-streak-months { display: flex; gap: 6px; }
.cd-m-streak-month { flex: 1; text-align: center; }
.cd-m-streak-dot { width: 28px; height: 28px; border-radius: 50%; background: #111; margin: 0 auto 4px; display: flex; align-items: center; justify-content: center; }
.cd-m-streak-dot svg { opacity: 0.8; }
.cd-m-streak-dot.empty { background: #f5f5f5; border: 1px solid #e8e8e8; }
.cd-m-streak-month-label { font-size: 8px; color: #aaa; letter-spacing: 0.06em; }
.cd-m-streak-month.active .cd-m-streak-month-label { color: #111; }
.cd-m-streak-note { font-size: 10px; color: #999; margin-top: 12px; font-weight: 300; }
.cd-m-ads-section { padding: 16px 20px 20px; border-top: 1px solid #e8e8e8; }
.cd-m-ads-label { font-size: 9px; letter-spacing: 0.18em; text-transform: uppercase; color: #aaa; margin-bottom: 12px; }
.cd-m-ads-row { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 8px; }
.cd-m-ad-card { border: 1px solid #e8e8e8; flex-shrink: 0; width: 280px; }
.cd-m-ad-preview { width: 280px; height: 540px; overflow: hidden; background: #fff; display: flex; align-items: center; justify-content: center; }
.cd-m-ad-preview iframe { width: 320px; height: 620px; border: none; display: block; transform: scale(0.875); transform-origin: top left; }
.cd-m-ad-thumb { position: relative; height: 300px; width: 100%; overflow: hidden; background: #1a1a1a; }
.cd-m-ad-thumb img { width: 100%; height: 100%; object-fit: cover; object-position: center; opacity: 0.85; display: block; }
.cd-m-ad-thumb-overlay { position: absolute; bottom: 0; left: 0; right: 0; padding: 12px 16px; background: linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 100%); display: flex; align-items: flex-end; justify-content: space-between; }
.cd-m-ad-thumb-name { font-size: 12px; color: white; font-weight: 300; }
.cd-m-ad-thumb-status { font-size: 8px; letter-spacing: 0.12em; text-transform: uppercase; color: #5db075; background: rgba(0,0,0,0.4); padding: 3px 8px; border-radius: 100px; border: 1px solid rgba(93,176,117,0.4); }
.cd-m-ad-thumb-status-paused { color: #aaa; border-color: rgba(170,170,170,0.4); }
.cd-m-ad-stats-strip { display: flex; border-top: 1px solid #e8e8e8; }
.cd-m-ad-stat { flex: 1; padding: 10px 14px; border-right: 1px solid #e8e8e8; }
.cd-m-ad-stat:last-child { border-right: none; }
.cd-m-ad-stat-l { font-size: 8px; letter-spacing: 0.18em; text-transform: uppercase; color: #aaa; margin-bottom: 3px; }
.cd-m-ad-stat-v { font-family: 'Playfair Display', serif; font-size: 18px; color: #111; }
.cd-m-score-pill { display: inline-flex; align-items: center; gap: 4px; font-size: 8px; letter-spacing: 0.12em; text-transform: uppercase; padding: 3px 10px; border-radius: 100px; border: 1px solid; }
.cd-m-score-strong { color: #2e7d32; border-color: #d4edda; background: #f0faf0; }
.cd-m-score-scaling { color: #1565c0; border-color: #bbdefb; background: #e3f2fd; }
.cd-m-score-testing { color: #e65100; border-color: #ffe0b2; background: #fff3e0; }

/* MOBILE WARDROBE */
.cd-m-wardrobe-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1px; background: #e8e8e8; border-top: 1px solid #e8e8e8; }
.cd-m-wardrobe-item { background: #fff; position: relative; }
.cd-m-wardrobe-img { aspect-ratio: 3/4; overflow: hidden; position: relative; }
.cd-m-wardrobe-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
.cd-m-wardrobe-img-placeholder { width: 100%; height: 100%; background: #f5f5f5; display: flex; align-items: center; justify-content: center; font-size: 8px; color: #ccc; letter-spacing: 0.08em; text-transform: uppercase; }
.cd-m-wardrobe-info { padding: 10px 12px 14px; }
.cd-m-wardrobe-name { font-size: 12px; color: #111; margin-bottom: 2px; line-height: 1.3; }
.cd-m-wardrobe-variant { font-size: 10px; color: #aaa; font-weight: 300; margin-bottom: 8px; }
.cd-m-feedback-toggle { position: absolute; bottom: 8px; right: 8px; background: rgba(255,255,255,0.92); border: 1px solid #e8e8e8; padding: 3px 8px; border-radius: 100px; font-size: 8px; letter-spacing: 0.1em; text-transform: uppercase; color: #555; cursor: pointer; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; z-index: 1; }
.cd-m-feedback-panel { border-top: 1px solid #e8e8e8; padding: 14px 12px; background: #f5f5f5; }
.cd-m-feedback-reactions { display: flex; gap: 5px; margin-bottom: 12px; flex-wrap: wrap; }
.cd-m-feedback-reaction { padding: 3px 10px; border: 1px solid #e8e8e8; background: #fff; font-size: 10px; color: #555; cursor: pointer; border-radius: 100px; transition: all 0.15s; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
.cd-m-feedback-reaction:hover, .cd-m-feedback-reaction.selected { background: #111; color: white; border-color: #111; }

/* MOBILE ORDERS */
.cd-m-order-row { padding: 16px 0; border-bottom: 1px solid #e8e8e8; }
.cd-m-order-row:last-child { border-bottom: none; }
.cd-m-order-num { font-size: 10px; color: #999; letter-spacing: 0.04em; margin-bottom: 4px; }
.cd-m-order-items { font-size: 12px; color: #111; line-height: 1.7; font-weight: 300; margin-bottom: 8px; }
.cd-m-order-meta { display: flex; align-items: center; gap: 10px; }

.cd-m-field-label { font-size: 9px; letter-spacing: 0.22em; text-transform: uppercase; color: #aaa; display: block; margin-bottom: 6px; }
.cd-m-field-input { width: 100%; padding: 11px 14px; border: 1px solid #e8e8e8; background: #f5f5f5; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 13px; color: #111; outline: none; display: block; margin-bottom: 12px; }
.cd-m-submit { width: 100%; padding: 14px; background: #111; color: white; border: none; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 9.5px; font-weight: 500; letter-spacing: 0.22em; text-transform: uppercase; cursor: pointer; margin-top: 4px; }
.cd-m-submit:disabled { background: #ccc; cursor: not-allowed; }

/* MOBILE BOTTOM TAB BAR */
.cd-m-tabbar { display: none; }
@media (max-width: 768px) {
  .cd-m-tabbar { display: flex; position: fixed; bottom: 0; left: 0; right: 0; height: 68px; background: #fff; border-top: 1px solid #e8e8e8; z-index: 50; padding-top: 10px; }
}
.cd-m-tabbar-item { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; cursor: pointer; background: none; border: none; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 0; }
.cd-m-tabbar-icon svg { width: 22px; height: 22px; stroke: #ccc; fill: none; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.cd-m-tabbar-item.active .cd-m-tabbar-icon svg { stroke: #111; }
.cd-m-tabbar-label { font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; color: #aaa; }
.cd-m-tabbar-item.active .cd-m-tabbar-label { color: #111; }

/* HIDE OLD MOBILE NAV */
.cd-m-bottom-nav { display: none; }

/* LOADING */
.cd-loading { display: flex; align-items: center; justify-content: center; min-height: 100vh; font-size: 12px; color: #aaa; letter-spacing: 0.15em; text-transform: uppercase; }
`

const TABS = ['ads', 'campaigns', 'wardrobe', 'request', 'submit', 'settings']
const TAB_LABELS = { wardrobe: 'Wardrobe & Orders', request: 'Request New Styles', ads: 'Ads', campaigns: 'Campaigns', submit: 'Submit Content', settings: 'Payment Info' }
const TAB_LABELS_SHORT = { wardrobe: 'Wardrobe', request: 'Request', ads: 'Ads', campaigns: 'Campaigns', submit: 'Submit Content', settings: 'Payment' }

export default function CreatorDashboard() {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [creator, setCreator] = useState(null)
  const [invite, setInvite] = useState(null)
  const [influencer, setInfluencer] = useState(null)
  const [orders, setOrders] = useState([])
  const [activeTab, setActiveTab] = useState('ads')

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
  const [adsTotals, setAdsTotals] = useState({ spend: 0, impressions: 0 })
  const [adsMonthly, setAdsMonthly] = useState([])
  const [adsMtd, setAdsMtd] = useState({ spend: 0, impressions: 0 })
  const [adsLastMtd, setAdsLastMtd] = useState({ spend: 0, impressions: 0 })
  const [adsLoading, setAdsLoading] = useState(false)

  // Content submissions
  const [contentMonth, setContentMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [contentFiles, setContentFiles] = useState([])
  const [contentNotes, setContentNotes] = useState('')
  const [contentSubmitting, setContentSubmitting] = useState(false)
  const [contentProgress, setContentProgress] = useState(0)
  const [contentSuccess, setContentSuccess] = useState(null) // null | { folderUrl }
  const [submissions, setSubmissions] = useState([])

  const [copied, setCopied] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)

  // Feedback state: keyed by "orderId-itemIndex"
  const [feedbackOpen, setFeedbackOpen] = useState({})
  const [feedbackData, setFeedbackData] = useState({})
  const [feedbackDone, setFeedbackDone] = useState({})

  // Campaigns
  const [campaignAssignments, setCampaignAssignments] = useState([])
  const [campaignsLoading, setCampaignsLoading] = useState(false)
  const [campaignSelects, setCampaignSelects] = useState({}) // { [assignmentId]: { sizes: {}, products: [] } }
  const [campaignNotes, setCampaignNotes] = useState({})
  const [campaignConfirming, setCampaignConfirming] = useState(null)
  const [showPastCampaigns, setShowPastCampaigns] = useState(false)
  const [lightboxFile, setLightboxFile] = useState(null) // { drive_file_id, name, mime_type }
  const [campaignContentTarget, setCampaignContentTarget] = useState(null) // assignment ID to tag content with

  // Payment settings
  const [paymentEditing, setPaymentEditing] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState(null)
  const [paymentForm, setPaymentForm] = useState({ paypalEmail: '', bankName: '', bankInstitution: '', bankAccount: '', bankRouting: '' })
  const [paymentSaving, setPaymentSaving] = useState(false)
  const [paymentSaved, setPaymentSaved] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/creator/login'); return }

      const { data: creatorData } = await supabase.from('creators').select('*').eq('user_id', user.id).single()
      if (!creatorData) { router.push('/creator/login'); return }
      setCreator(creatorData)

      // Initialize payment form from saved data
      if (creatorData.payment_method) {
        setPaymentMethod(creatorData.payment_method)
        if (creatorData.payment_method === 'paypal') {
          setPaymentForm(f => ({ ...f, paypalEmail: creatorData.paypal_email || '' }))
        } else {
          setPaymentForm(f => ({ ...f, bankName: creatorData.bank_account_name || '', bankInstitution: creatorData.bank_institution || '', bankAccount: creatorData.bank_account_number || '', bankRouting: creatorData.bank_routing_number || '' }))
        }
      }

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

        // Sync orders from Shopify if the influencer has a customer ID
        if (infData.shopify_customer_id) {
          try {
            const syncRes = await fetch('/api/shopify/orders/sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ influencer_id: infData.id, shopify_customer_id: infData.shopify_customer_id }),
            })
            const syncData = await syncRes.json()
            if (syncData.orders) {
              setOrders(syncData.orders)
            }
          } catch {
            // Fallback to reading from DB if sync fails
            const { data: orderData } = await supabase.from('influencer_orders').select('*').eq('influencer_id', infData.id).order('order_date', { ascending: false })
            setOrders(orderData || [])
          }
        } else {
          const { data: orderData } = await supabase.from('influencer_orders').select('*').eq('influencer_id', infData.id).order('order_date', { ascending: false })
          setOrders(orderData || [])
        }
        if (infData.instagram_handle) {
          setAdsLoading(true)
          try {
            const res = await fetch(`/api/meta/creator-ads?handle=${encodeURIComponent(infData.instagram_handle)}`)
            const data = await res.json()
            setAds(data.ads || [])
            setAdsTotals(data.totals || { spend: 0, impressions: 0 })
            setAdsMonthly(data.monthly || [])
            setAdsMtd(data.mtd || { spend: 0, impressions: 0 })
            setAdsLastMtd(data.lastMtd || { spend: 0, impressions: 0 })
          } catch {}
          setAdsLoading(false)
        }
      }

      const { data: reqData } = await supabase.from('creator_sample_requests').select('*').eq('creator_id', creatorData.id).order('created_at', { ascending: false })
      setPastRequests(reqData || [])

      const { data: subData } = await supabase.from('creator_content_submissions').select('*').eq('creator_id', creatorData.id).order('created_at', { ascending: false })
      setSubmissions(subData || [])

      // Fetch campaign assignments
      try {
        const campRes = await fetch(`/api/creator/campaigns?creator_id=${creatorData.id}`)
        const campData = await campRes.json()
        setCampaignAssignments(campData.assignments || [])
      } catch {}

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

  const [selectedSizes, setSelectedSizes] = useState({})
  const [sizePrompts, setSizePrompts] = useState({})

  function groupProducts(results) {
    const map = {}
    for (const p of results) {
      if (!map[p.product_id]) {
        map[p.product_id] = { product_id: p.product_id, title: p.title, image: p.image, variants: [] }
      }
      map[p.product_id].variants.push({ variant_id: p.variant_id, variant_title: p.variant_title, sku: p.sku, price: p.price })
    }
    return Object.values(map)
  }

  function getDefaultSize(product) {
    const sizes = product.variants.map(v => v.variant_title).filter(Boolean)
    if (!sizes.length) return null
    const name = product.title.toLowerCase()
    const isBottoms = /pant|short|skirt|legging|bottom|jogger|trouser/i.test(name)
    const preferred = isBottoms ? influencer?.bottoms_size : influencer?.top_size
    if (preferred && sizes.includes(preferred)) return preferred
    return null
  }

  function addToCart(product, variant) {
    if (cart.find(c => c.shopify_variant_id === variant.variant_id)) return
    setCart(prev => [...prev, {
      shopify_variant_id: variant.variant_id,
      product_title: product.title,
      variant_title: variant.variant_title,
      image_url: product.image,
      quantity: 1,
    }])
  }

  function handleAddToCart(product) {
    const variants = product.variants
    if (variants.length === 1 && !variants[0].variant_title) {
      addToCart(product, variants[0])
      return
    }
    const size = selectedSizes[product.product_id] || getDefaultSize(product)
    if (!size) {
      setSizePrompts(prev => ({ ...prev, [product.product_id]: true }))
      setTimeout(() => setSizePrompts(prev => ({ ...prev, [product.product_id]: false })), 2000)
      return
    }
    const variant = variants.find(v => v.variant_title === size)
    if (variant) addToCart(product, variant)
  }

  function removeFromCart(variantId) {
    setCart(prev => prev.filter(c => c.shopify_variant_id !== variantId))
  }

  async function submitRequest() {
    if (!cart.length || !creator) return
    setRequestSubmitting(true)

    // Create individual campaign + assignment for this allowance request
    const now = new Date()
    const monthLabel = now.toLocaleString('en', { month: 'long', year: 'numeric' })
    const creatorName = creator.creator_name || 'Creator'

    try {
      const campRes = await fetch('/api/creator/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${creatorName} — ${monthLabel} Allowance`,
          campaign_type: 'individual',
          status: 'active',
          available_products: cart.map(c => ({
            variant_id: c.shopify_variant_id,
            product_title: c.product_title,
            variant_title: c.variant_title,
            image_url: c.image_url,
          })),
          assignments: [{
            influencer_id: influencer?.id || null,
            creator_id: creator.id,
          }],
        }),
      })
      const campData = await campRes.json()

      // Get the assignment ID
      let assignmentId = null
      if (campData.campaign?.id) {
        const assignRes = await fetch(`/api/creator/campaigns/assignments?campaign_id=${campData.campaign.id}`)
        const assignData = await assignRes.json()
        if (assignData.assignments?.[0]) {
          assignmentId = assignData.assignments[0].id
          // Mark as confirmed since they already picked products
          await fetch('/api/creator/campaigns/assignments', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: assignmentId,
              status: 'confirmed',
              selected_products: cart,
            }),
          })
        }
      }

      const insertData = {
        creator_id: creator.id,
        influencer_id: influencer?.id || null,
        selections: cart,
        status: 'pending',
      }
      if (assignmentId) insertData.campaign_assignment_id = assignmentId

      const { error } = await supabase.from('creator_sample_requests').insert(insertData)
      if (!error) {
        setRequestSuccess(true)
        setCart([])
        setSearchResults([])
        setSearchQuery('')
        const { data } = await supabase.from('creator_sample_requests').select('*').eq('creator_id', creator.id).order('created_at', { ascending: false })
        setPastRequests(data || [])
      }
    } catch (err) {
      console.error('Submit request error:', err)
    }
    setRequestSubmitting(false)
  }

  async function submitContent() {
    if (!contentFiles.length || !creator) return
    setContentSubmitting(true)
    setContentProgress(0)
    try {
      const formData = new FormData()
      formData.append('month', contentMonth)
      if (contentNotes.trim()) formData.append('notes', contentNotes)
      if (campaignContentTarget) formData.append('campaign_assignment_id', campaignContentTarget)
      contentFiles.forEach(f => formData.append('files', f))

      const xhr = new XMLHttpRequest()
      const result = await new Promise((resolve, reject) => {
        xhr.upload.addEventListener('progress', e => {
          if (e.lengthComputable) setContentProgress(Math.round((e.loaded / e.total) * 100))
        })
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText))
          } else {
            reject(new Error(xhr.responseText || 'Upload failed'))
          }
        })
        xhr.addEventListener('error', () => reject(new Error('Upload failed')))
        xhr.open('POST', '/api/creator/submit-content')
        xhr.send(formData)
      })

      setContentSuccess({ folderUrl: result.submission?.drive_folder_url })
      setContentFiles([])
      setContentNotes('')
      setCampaignContentTarget(null)
      const { data } = await supabase.from('creator_content_submissions').select('*').eq('creator_id', creator.id).order('created_at', { ascending: false })
      setSubmissions(data || [])
      // Refresh campaign assignments in case status changed
      try {
        const campRes = await fetch(`/api/creator/campaigns?creator_id=${creator.id}`)
        const campData = await campRes.json()
        setCampaignAssignments(campData.assignments || [])
      } catch {}
    } catch (err) {
      console.error('Submit content error:', err)
    }
    setContentSubmitting(false)
    setContentProgress(0)
  }

  function handleContentFileDrop(e) {
    e.preventDefault()
    const allowed = ['video/mp4', 'video/quicktime', 'image/jpeg', 'image/png', 'image/webp']
    const dropped = Array.from(e.dataTransfer?.files || []).filter(f => allowed.includes(f.type))
    if (dropped.length) setContentFiles(prev => [...prev, ...dropped])
  }

  function handleContentFileSelect(e) {
    const selected = Array.from(e.target.files || [])
    if (selected.length) setContentFiles(prev => [...prev, ...selected])
    e.target.value = ''
  }

  function removeContentFile(index) {
    setContentFiles(prev => prev.filter((_, i) => i !== index))
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  function copyCode() {
    navigator.clipboard.writeText(creator?.affiliate_code || '')
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  function copyLink() {
    const code = (creator?.affiliate_code || '').toLowerCase()
    navigator.clipboard.writeText(`namaclo.com/?ref=${code}`)
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 1500)
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


  function getStatusInfo(fulfillmentStatus) {
    if (fulfillmentStatus === 'fulfilled') return { label: 'Shipped', cls: 'shipped' }
    if (fulfillmentStatus === 'in_transit' || fulfillmentStatus === 'partial') return { label: 'In Transit', cls: 'transit' }
    return { label: 'Processing', cls: 'processing' }
  }

  function getAllLineItems() {
    const items = []
    for (const order of orders) {
      for (let i = 0; i < (order.line_items || []).length; i++) {
        const item = order.line_items[i]
        items.push({
          key: `${order.id}-${i}`,
          orderId: order.id,
          productName: item.product_name,
          variantTitle: item.variant_title,
          sku: item.sku,
          quantity: item.quantity,
          imageUrl: item.image_url || null,
          fulfillmentStatus: order.fulfillment_status,
        })
      }
    }
    return items
  }

  async function submitFeedback(key, item) {
    const data = feedbackData[key] || {}
    try {
      await supabase.from('creator_product_feedback').insert({
        creator_id: creator.id,
        influencer_order_id: item.orderId,
        product_name: item.productName,
        reactions: data.reactions ? [data.reactions] : [],
        wear_context: data.wearContext ? [data.wearContext] : [],
        notes: data.notes || '',
      })
      setFeedbackDone(prev => ({ ...prev, [key]: true }))
    } catch {}
  }

  function renderWardrobeGrid(mobile) {
    const allItems = getAllLineItems()
    if (allItems.length === 0) {
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

    const p = mobile ? 'cd-m-' : 'cd-'
    const status = getStatusInfo

    return (
      <div className={`${p}wardrobe-grid`}>
        {allItems.map(item => {
          const s = status(item.fulfillmentStatus)
          const isOpen = feedbackOpen[item.key]
          const isDone = feedbackDone[item.key]
          const fb = feedbackData[item.key] || { reactions: '', wearContext: '', notes: '' }

          return (
            <div key={item.key} className={`${p}wardrobe-item`}>
              <div className={`${p}wardrobe-img`}>
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.productName} />
                ) : (
                  <div className={`${p}wardrobe-img-placeholder`}>No image</div>
                )}
              </div>
              <button
                className={mobile ? 'cd-m-feedback-toggle' : 'cd-feedback-toggle'}
                onClick={() => setFeedbackOpen(prev => ({ ...prev, [item.key]: !prev[item.key] }))}
              >
                {isDone ? '✓ Done' : isOpen ? '− Close' : '+ Feedback'}
              </button>
              <div className={`${p}wardrobe-info`}>
                <div className={`${p}wardrobe-name`}>{item.productName}</div>
                {item.variantTitle && <div className={`${p}wardrobe-variant`}>{item.variantTitle}</div>}
                <div className={`cd-wardrobe-status cd-status-${s.cls}`}>● {s.label}</div>
              </div>
              {isOpen && (
                isDone ? (
                  <div className={mobile ? 'cd-m-feedback-panel' : 'cd-feedback-panel'}>
                    <div className="cd-feedback-done">✓ Thanks — noted.</div>
                  </div>
                ) : (
                  <div className={mobile ? 'cd-m-feedback-panel' : 'cd-feedback-panel'}>
                    <span className={mobile ? 'cd-m-field-label' : 'cd-feedback-label'}>What did you think?</span>
                    <input
                      className="cd-feedback-input"
                      placeholder="Love it, fits well, runs small…"
                      value={fb.reactions}
                      onChange={e => setFeedbackData(prev => ({ ...prev, [item.key]: { ...fb, reactions: e.target.value } }))}
                    />
                    <span className={mobile ? 'cd-m-field-label' : 'cd-feedback-label'}>Where do you wear it most?</span>
                    <input
                      className="cd-feedback-input"
                      placeholder="Pilates, gym, errands…"
                      value={fb.wearContext}
                      onChange={e => setFeedbackData(prev => ({ ...prev, [item.key]: { ...fb, wearContext: e.target.value } }))}
                    />
                    <span className={mobile ? 'cd-m-field-label' : 'cd-feedback-label'}>Anything else?</span>
                    <textarea
                      className="cd-feedback-input"
                      rows={2}
                      placeholder="What would you change, or what do your followers ask about it?"
                      value={fb.notes}
                      onChange={e => setFeedbackData(prev => ({ ...prev, [item.key]: { ...fb, notes: e.target.value } }))}
                    />
                    <button className="cd-feedback-submit" onClick={() => submitFeedback(item.key, item)}>Submit →</button>
                  </div>
                )
              )}
            </div>
          )
        })}
      </div>
    )
  }

  function renderOrderHistory(mobile) {
    if (orders.length === 0) return null

    const p = mobile ? 'cd-m-' : 'cd-'

    if (mobile) {
      return (
        <div>
          {orders.map(order => {
            const s = getStatusInfo(order.fulfillment_status)
            return (
              <div key={order.id} className="cd-m-order-row">
                <div className="cd-m-order-num">
                  {order.order_number} · {new Date(order.order_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
                <div className="cd-m-order-items">
                  {(order.line_items || []).map((item, i) => (
                    <span key={i}>{item.product_name}{item.variant_title ? ` — ${item.variant_title}` : ''}{i < order.line_items.length - 1 ? <br /> : null}</span>
                  ))}
                </div>
                <div className="cd-m-order-meta">
                  <div className={`cd-wardrobe-status cd-status-${s.cls}`}>● {s.label}</div>
                  {order.tracking_url ? (
                    <a href={order.tracking_url} target="_blank" rel="noopener noreferrer" className="cd-tracking-link">Track package →</a>
                  ) : (
                    <span className="cd-tracking-pending">Tracking pending</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )
    }

    return (
      <div className="cd-order-list">
        {orders.map(order => {
          const s = getStatusInfo(order.fulfillment_status)
          return (
            <div key={order.id} className="cd-order-row">
              <div>
                <div className="cd-order-num">
                  {order.order_number} · {new Date(order.order_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
                <div className="cd-order-items">
                  {(order.line_items || []).map((item, i) => (
                    <span key={i}>{item.product_name}{item.variant_title ? ` — ${item.variant_title}` : ''}{i < order.line_items.length - 1 ? <br /> : null}</span>
                  ))}
                </div>
              </div>
              <div className="cd-order-right">
                <div className={`cd-wardrobe-status cd-status-${s.cls}`}>● {s.label}</div>
                {order.tracking_url ? (
                  <a href={order.tracking_url} target="_blank" rel="noopener noreferrer" className="cd-tracking-link">Track package →</a>
                ) : (
                  <span className="cd-tracking-pending">Tracking pending</span>
                )}
              </div>
            </div>
          )
        })}
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
    const grouped = groupProducts(searchResults)

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

        {cart.length > 0 && (
          <div className="cd-cart">
            <div className="cd-cart-left">
              <div className="cd-cart-label">Your Request — {cart.length} {cart.length === 1 ? 'item' : 'items'}</div>
              {cart.map(item => (
                <div key={item.shopify_variant_id} className="cd-cart-item">
                  <span>{item.product_title}{item.variant_title && ` — ${item.variant_title}`}</span>
                  <button className="cd-cart-remove" onClick={() => removeFromCart(item.shopify_variant_id)}>Remove</button>
                </div>
              ))}
            </div>
            <button className="cd-cart-submit" onClick={submitRequest} disabled={requestSubmitting}>
              {requestSubmitting ? 'Submitting…' : 'Submit Request →'}
            </button>
          </div>
        )}

        {grouped.length > 0 && (
          <div className={mobile ? 'cd-m-products' : 'cd-products'}>
            {grouped.slice(0, mobile ? 6 : 9).map(product => {
              const sizes = product.variants.filter(v => v.variant_title).map(v => v.variant_title)
              const hasSizes = sizes.length > 0
              const currentSize = selectedSizes[product.product_id] || getDefaultSize(product)
              const selectedVariant = currentSize ? product.variants.find(v => v.variant_title === currentSize) : (product.variants.length === 1 ? product.variants[0] : null)
              const inCart = selectedVariant ? cart.find(c => c.shopify_variant_id === selectedVariant.variant_id) : false
              const anyInCart = product.variants.some(v => cart.find(c => c.shopify_variant_id === v.variant_id))

              return (
                <div key={product.product_id} className={mobile ? 'cd-m-product' : 'cd-product'}>
                  <div className={mobile ? 'cd-m-product-img' : 'cd-product-img'}>
                    {product.image ? <img src={product.image} alt="" /> : <span style={{ fontSize: 9, color: '#ccc', letterSpacing: '0.1em', textTransform: 'uppercase' }}>No image</span>}
                  </div>
                  <div className={mobile ? 'cd-m-product-info' : 'cd-product-info'}>
                    <div className={mobile ? 'cd-m-product-name' : 'cd-product-name'}>{product.title}</div>
                    {hasSizes && (
                      <div className="cd-size-row">
                        {sizes.map(size => (
                          <button
                            key={size}
                            className={`cd-size-pill${currentSize === size ? ' selected' : ''}`}
                            onClick={e => { e.stopPropagation(); setSelectedSizes(prev => ({ ...prev, [product.product_id]: size })); setSizePrompts(prev => ({ ...prev, [product.product_id]: false })) }}
                          >{size}</button>
                        ))}
                      </div>
                    )}
                    {sizePrompts[product.product_id] && <div className="cd-size-prompt">Select a size</div>}
                    <div
                      className={`${mobile ? 'cd-m-product-cta' : 'cd-product-cta'}${inCart || anyInCart ? ' added' : ''}`}
                      onClick={() => !inCart && !anyInCart && handleAddToCart(product)}
                    >
                      {inCart || anyInCart ? '✓ Added' : 'Add'}
                    </div>
                  </div>
                </div>
              )
            })}
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

  function cleanAdName(name) {
    return (name || '')
      .split(',')[0]
      .trim()
      .replace(/\b\w/g, c => c.toUpperCase())
      .replace(/\s+(Washed|In|With)\s+/g, (m, w) => ` — ${w.charAt(0).toUpperCase() + w.slice(1)} `)
      .trim()
  }

  function getScorePill(spend, mobile) {
    const n = parseFloat(spend)
    const p = mobile ? 'cd-m-score' : 'cd-score'
    if (n > 2000) return <span className={`${p}-pill ${p}-strong`}>Strong</span>
    if (n > 500) return <span className={`${p}-pill ${p}-scaling`}>Scaling</span>
    return <span className={`${p}-pill ${p}-testing`}>Testing</span>
  }

  function getPercentile(totalSpend) {
    if (totalSpend > 3000) return { rank: 10, label: 'top performers' }
    if (totalSpend > 1000) return { rank: 25, label: 'top quarter' }
    return { rank: 50, label: 'active creators' }
  }

  function getStreakMonths() {
    const now = new Date()
    const months = []
    for (let i = -2; i <= 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
      months.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleString('en', { month: 'short' }),
        isCurrent: i === 0,
        isFuture: i > 0,
      })
    }
    // Count submissions per month
    const subMonths = new Set(submissions.map(s => {
      const d = new Date(s.created_at)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    }))
    return months.map(m => ({ ...m, active: subMonths.has(m.key) || m.isCurrent }))
  }

  function renderEarnings(mobile) {
    const dealType = invite?.deal_type
    if (dealType !== 'ad_spend') return null

    const rate = (invite?.ad_spend_percentage || commissionRate || 10) / 100
    const totalSpend = adsTotals.spend
    const earned = Math.round(totalSpend * rate)

    // Current month data
    const now = new Date()
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const currentMonthData = adsMonthly.find(m => m.month === currentMonthKey)
    const currentSpend = currentMonthData?.spend || totalSpend
    const currentEarned = Math.round(currentSpend * rate)

    // Projection
    const dayOfMonth = now.getDate()
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    const projection = dayOfMonth > 0 ? Math.round((currentSpend / dayOfMonth) * daysInMonth * rate) : 0

    // Milestone
    const milestone = Math.ceil((currentEarned + 1) / 500) * 500
    const progress = milestone > 0 ? Math.min((currentEarned / milestone) * 100, 100) : 0
    const remaining = milestone - currentEarned

    // Next payment date
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const nextPayDate = nextMonth.toLocaleString('en', { month: 'long', day: 'numeric' })

    const monthName = now.toLocaleString('en', { month: 'long', year: 'numeric' })

    const checkSvg = <svg width="12" height="10" viewBox="0 0 12 10" fill="none"><path d="M1 5L4.5 8.5L11 1.5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg>

    if (mobile) {
      return (
        <div className="cd-m-earnings">
          <div className="cd-m-earnings-head">
            <div className="cd-m-earnings-eyebrow">Ad Spend Commission</div>
            <div className="cd-m-earnings-title">Your Earnings</div>
          </div>
          <div className="cd-m-earnings-hero">
            <div className="cd-m-earnings-sublabel">{monthName} — In Progress</div>
            <div className="cd-m-earnings-amount">
              <span className="cd-m-earnings-currency">$</span>
              <span className="cd-m-earnings-val">{currentEarned.toLocaleString()}</span>
            </div>
            <div className="cd-m-earnings-context">from ${currentSpend.toLocaleString()} in ad spend</div>
          </div>
          <div className="cd-m-earnings-proj">
            <div className="cd-m-earnings-proj-label">Month-end projection</div>
            <div className="cd-m-earnings-proj-val">${projection.toLocaleString()}</div>
          </div>
          <div className="cd-m-progress">
            <div className="cd-m-progress-header">
              <span className="cd-m-progress-label">Progress to ${milestone}</span>
              <span className="cd-m-progress-val">${currentEarned} of ${milestone}</span>
            </div>
            <div className="cd-m-progress-track"><div className="cd-m-progress-fill" style={{ width: `${progress}%` }} /></div>
          </div>
          <div className="cd-m-payment">
            <div className="cd-m-payment-left">Next payment — {nextPayDate}</div>
            <div className="cd-m-payment-amount">~${projection.toLocaleString()}</div>
          </div>
        </div>
      )
    }

    return (
      <div className="cd-earnings">
        <div className="cd-earnings-head">
          <div>
            <div className="cd-earnings-eyebrow">Ad Spend Commission</div>
            <div className="cd-earnings-title">Your Earnings</div>
          </div>
          {getScorePill(totalSpend, false)}
        </div>
        <div className="cd-earnings-hero">
          <div>
            <div className="cd-earnings-sublabel">{monthName} — In Progress</div>
            <div className="cd-earnings-amount">
              <span className="cd-earnings-currency">$</span>
              <span className="cd-earnings-val">{currentEarned.toLocaleString()}</span>
            </div>
            <div className="cd-earnings-context">from ${currentSpend.toLocaleString()} in ad spend on your content</div>
          </div>
          <div className="cd-earnings-right">
            <div className="cd-earnings-proj-label">Month-end projection</div>
            <div className="cd-earnings-proj-val">${projection.toLocaleString()}</div>
            <div className="cd-earnings-proj-note">Based on current spend velocity</div>
          </div>
        </div>
        <div className="cd-progress-wrap">
          <div className="cd-progress-header">
            <span className="cd-progress-label">Progress to ${milestone} milestone</span>
            <span className="cd-progress-val">${currentEarned.toLocaleString()} of ${milestone.toLocaleString()}</span>
          </div>
          <div className="cd-progress-track"><div className="cd-progress-fill" style={{ width: `${progress}%` }} /></div>
          <div className="cd-progress-note">${remaining.toLocaleString()} away{projection >= milestone ? ` — on track to hit this in ${now.toLocaleString('en', { month: 'long' })}.` : '.'}</div>
        </div>
        {adsMonthly.length > 0 && (
          <div className="cd-breakdown">
            <div className="cd-breakdown-label">Monthly History</div>
            <div>
              {adsMonthly.map((m, i) => {
                const mEarned = Math.round(m.spend * rate)
                const maxSpend = Math.max(...adsMonthly.map(x => x.spend))
                const barPct = maxSpend > 0 ? (m.spend / maxSpend) * 100 : 0
                const isCurrent = m.month === currentMonthKey
                const mDate = new Date(m.month + '-01')
                const mLabel = mDate.toLocaleString('en', { month: 'long', year: 'numeric' })
                return (
                  <div key={i} className={`cd-breakdown-row${isCurrent ? ' cd-breakdown-current' : ''}`}>
                    <div>
                      <span className="cd-breakdown-month">{mLabel}</span>
                      {isCurrent && <span className="cd-current-badge">Current</span>}
                    </div>
                    <div className="cd-breakdown-right">
                      <span className="cd-breakdown-spend">${m.spend.toLocaleString(undefined, { maximumFractionDigits: 0 })} spend</span>
                      <div className="cd-breakdown-bar-wrap"><div className="cd-breakdown-bar" style={{ width: `${barPct}%` }} /></div>
                      <span className="cd-breakdown-earned">${mEarned.toLocaleString()}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
        <div className="cd-payment-strip">
          <div>
            <div className="cd-payment-left">Next payment</div>
            <div className="cd-payment-date">Paid {nextPayDate} via e-transfer</div>
          </div>
          <div className="cd-payment-amount">~${projection.toLocaleString()}</div>
        </div>
      </div>
    )
  }

  function renderMomentum(mobile) {
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

    const totalSpend = adsTotals.spend
    const totalImps = adsTotals.impressions
    const activeCount = ads.filter(a => a.status === 'ACTIVE').length

    // Delta: MTD vs same date range last month
    const spendDelta = adsLastMtd.spend > 0 ? Math.round((adsMtd.spend - adsLastMtd.spend) / adsLastMtd.spend * 100) : null
    const impsDelta = adsLastMtd.impressions > 0 ? Math.round((adsMtd.impressions - adsLastMtd.impressions) / adsLastMtd.impressions * 100) : null

    const percentile = getPercentile(totalSpend)
    const streakMonths = getStreakMonths()
    const streakCount = streakMonths.filter(m => m.active && !m.isFuture).length

    const checkSvg = <svg width="12" height="10" viewBox="0 0 12 10" fill="none"><path d="M1 5L4.5 8.5L11 1.5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg>

    if (mobile) {
      return (
        <div className="cd-m-momentum">
          <div className="cd-m-momentum-head">
            <div className="cd-m-momentum-eyebrow">Paid Media</div>
            <div className="cd-m-momentum-title">Live Ads</div>
          </div>
          <div className="cd-m-momentum-stats">
            <div className="cd-m-momentum-stat">
              <div className="cd-m-momentum-stat-label">Spent</div>
              <div className="cd-m-momentum-stat-val">{formatSpend(totalSpend)}</div>
              {spendDelta !== null && <div className={`cd-m-momentum-delta${spendDelta < 0 ? ' cd-m-momentum-delta-neg' : ''}`}>{spendDelta >= 0 ? '↑' : '↓'} {spendDelta >= 0 ? '+' : ''}{spendDelta}%</div>}
            </div>
            <div className="cd-m-momentum-stat">
              <div className="cd-m-momentum-stat-label">Impressions</div>
              <div className="cd-m-momentum-stat-val">{formatImpressions(totalImps)}</div>
              {impsDelta !== null && <div className={`cd-m-momentum-delta${impsDelta < 0 ? ' cd-m-momentum-delta-neg' : ''}`}>{impsDelta >= 0 ? '↑' : '↓'} {impsDelta >= 0 ? '+' : ''}{impsDelta}%</div>}
            </div>
            <div className="cd-m-momentum-stat">
              <div className="cd-m-momentum-stat-label">Active</div>
              <div className="cd-m-momentum-stat-val">{activeCount}</div>
            </div>
          </div>
          <div className="cd-m-percentile">
            <div>
              <div className="cd-m-percentile-headline">Your content is in the {percentile.label}.</div>
              <div className="cd-m-percentile-sub">Nama is scaling spend on your videos.</div>
            </div>
            <div>
              <span className="cd-m-percentile-number">Top {percentile.rank}</span><span className="cd-m-percentile-pct">%</span>
              <div className="cd-m-percentile-sub" style={{ textAlign: 'right', marginTop: '3px' }}>of Nama creators</div>
            </div>
          </div>
          <div className="cd-m-streak">
            <div className="cd-m-streak-label">Active Months — {streakCount} month streak</div>
            <div className="cd-m-streak-months">
              {streakMonths.map((m, i) => (
                <div key={i} className={`cd-m-streak-month${m.active && !m.isFuture ? ' active' : ''}`}>
                  <div className={`cd-m-streak-dot${!m.active || m.isFuture ? ' empty' : ''}${m.isCurrent ? ' current' : ''}`}>
                    {m.active && !m.isFuture && checkSvg}
                  </div>
                  <div className="cd-m-streak-month-label">{m.label}</div>
                </div>
              ))}
            </div>
            <div className="cd-m-streak-note">Keep submitting content each month. Longer streaks = higher spend priority.</div>
          </div>
          <div className="cd-m-ads-section">
            <div className="cd-m-ads-label">Running Now</div>
            <div className="cd-m-ads-row">
              {ads.map((ad, i) => {
                const name = cleanAdName(ad.name)
                const isActive = ad.status === 'ACTIVE'
                return (
                  <div key={i} className="cd-m-ad-card">
                    {ad.previewHtml ? (
                      <div className="cd-m-ad-preview" dangerouslySetInnerHTML={{ __html: ad.previewHtml }} />
                    ) : (
                      <div className="cd-m-ad-thumb">
                        {ad.thumbnailUrl ? <img src={ad.thumbnailUrl} alt={name} /> : <div style={{ width: '100%', height: '100%', background: '#222' }} />}
                        <div className="cd-m-ad-thumb-overlay">
                          <div className="cd-m-ad-thumb-name">{name}</div>
                          <div className={`cd-m-ad-thumb-status${!isActive ? ' cd-m-ad-thumb-status-paused' : ''}`}>● {isActive ? 'Active' : 'Paused'}</div>
                        </div>
                      </div>
                    )}
                    <div className="cd-m-ad-stats-strip">
                      <div className="cd-m-ad-stat"><div className="cd-m-ad-stat-l">Spent</div><div className="cd-m-ad-stat-v">{formatSpend(ad.spend)}</div></div>
                      <div className="cd-m-ad-stat"><div className="cd-m-ad-stat-l">Impressions</div><div className="cd-m-ad-stat-v">{formatImpressions(ad.impressions)}</div></div>
                      <div className="cd-m-ad-stat"><div className="cd-m-ad-stat-l">Performance</div><div style={{ marginTop: 4 }}>{getScorePill(ad.spend, true)}</div></div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="cd-momentum">
        <div className="cd-momentum-head">
          <div>
            <div className="cd-momentum-eyebrow">Paid Media</div>
            <div className="cd-momentum-title">Live Ads</div>
          </div>
        </div>
        <div className="cd-momentum-top">
          <div className="cd-momentum-stat">
            <div className="cd-momentum-stat-label">Total Spent on Your Content</div>
            <div className="cd-momentum-stat-val">{formatSpend(totalSpend)}</div>
            {spendDelta !== null && <div className={`cd-momentum-delta${spendDelta < 0 ? ' cd-momentum-delta-neg' : ''}`}>{spendDelta >= 0 ? '↑' : '↓'} {spendDelta >= 0 ? '+' : ''}{spendDelta}% vs last month</div>}
          </div>
          <div className="cd-momentum-stat">
            <div className="cd-momentum-stat-label">Impressions</div>
            <div className="cd-momentum-stat-val">{formatImpressions(totalImps)}</div>
            {impsDelta !== null && <div className={`cd-momentum-delta${impsDelta < 0 ? ' cd-momentum-delta-neg' : ''}`}>{impsDelta >= 0 ? '↑' : '↓'} {impsDelta >= 0 ? '+' : ''}{impsDelta}% vs last month</div>}
          </div>
          <div className="cd-momentum-stat">
            <div className="cd-momentum-stat-label">Ads Active</div>
            <div className="cd-momentum-stat-val">{activeCount}</div>
          </div>
        </div>
        <div className="cd-percentile">
          <div>
            <div className="cd-percentile-eyebrow">Creator Ranking</div>
            <div className="cd-percentile-headline">Your content is in the<br />{percentile.label}.</div>
            <div className="cd-percentile-sub">Nama is scaling spend on your videos.</div>
          </div>
          <div>
            <span className="cd-percentile-number">Top {percentile.rank}</span><span className="cd-percentile-pct">%</span>
            <div className="cd-percentile-sub" style={{ textAlign: 'right', marginTop: '4px' }}>of Nama creators</div>
          </div>
        </div>
        <div className="cd-streak">
          <div className="cd-streak-label">Active Months — {streakCount} month streak</div>
          <div className="cd-streak-months">
            {streakMonths.map((m, i) => (
              <div key={i} className={`cd-streak-month${m.active && !m.isFuture ? ' active' : ''}`}>
                <div className={`cd-streak-dot${!m.active || m.isFuture ? ' empty' : ''}${m.isCurrent ? ' current' : ''}`}>
                  {m.active && !m.isFuture && checkSvg}
                </div>
                <div className="cd-streak-month-label">{m.label}</div>
              </div>
            ))}
          </div>
          <div className="cd-streak-note">Keep submitting content each month to maintain your streak. Longer streaks = higher spend priority.</div>
        </div>
        <div className="cd-ads-section">
          <div className="cd-ads-section-label">Running Now</div>
          <div className="cd-ads-row">
            {ads.map((ad, i) => {
              const name = cleanAdName(ad.name)
              const isActive = ad.status === 'ACTIVE'
              return (
                <div key={i} className="cd-ad-card">
                  {ad.previewHtml ? (
                    <div className="cd-ad-preview" dangerouslySetInnerHTML={{ __html: ad.previewHtml }} />
                  ) : (
                    <div className="cd-ad-thumb">
                      {ad.thumbnailUrl ? <img src={ad.thumbnailUrl} alt={name} /> : <div style={{ width: '100%', height: '100%', background: '#222' }} />}
                      <div className="cd-ad-thumb-overlay">
                        <div className="cd-ad-thumb-name">{name}</div>
                        <div className={`cd-ad-thumb-status${!isActive ? ' cd-ad-thumb-status-paused' : ''}`}>● {isActive ? 'Active' : 'Paused'}</div>
                      </div>
                    </div>
                  )}
                  <div className="cd-ad-stats-strip">
                    <div className="cd-ad-stat"><div className="cd-ad-stat-l">Total Spent</div><div className="cd-ad-stat-v">${parseFloat(ad.spend).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div></div>
                    <div className="cd-ad-stat"><div className="cd-ad-stat-l">Impressions</div><div className="cd-ad-stat-v">{formatImpressions(ad.impressions)}</div></div>
                    <div className="cd-ad-stat"><div className="cd-ad-stat-l">Performance</div><div style={{ marginTop: 4 }}>{getScorePill(ad.spend, false)}</div></div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  function getCampaignStatusInfo(status) {
    const map = {
      sent: { label: 'Awaiting your confirmation', cls: 'cd-campaign-status-sent' },
      confirmed: { label: 'Confirmed — order coming', cls: 'cd-campaign-status-confirmed' },
      content_submitted: { label: 'Content submitted', cls: 'cd-campaign-status-content' },
      complete: { label: 'Complete', cls: 'cd-campaign-status-complete' },
      declined: { label: 'Declined', cls: 'cd-campaign-status-declined' },
    }
    return map[status] || map.sent
  }

  function toggleCampaignProduct(assignmentId, product, maxSelects) {
    setCampaignSelects(prev => {
      const current = prev[assignmentId]?.products || []
      const exists = current.find(p => p.variant_id === product.variant_id)
      let updated
      if (exists) {
        updated = current.filter(p => p.variant_id !== product.variant_id)
      } else {
        if (current.length >= maxSelects) return prev
        updated = [...current, product]
      }
      return { ...prev, [assignmentId]: { ...prev[assignmentId], products: updated } }
    })
  }

  async function confirmCampaignSelects(assignment) {
    const selects = campaignSelects[assignment.id]?.products || []
    if (!selects.length) return
    setCampaignConfirming(assignment.id)
    try {
      await fetch('/api/creator/campaigns/assignments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: assignment.id,
          status: 'confirmed',
          selected_products: selects,
          creator_notes: campaignNotes[assignment.id] || null,
        }),
      })
      // Refresh assignments
      const campRes = await fetch(`/api/creator/campaigns?creator_id=${creator.id}`)
      const campData = await campRes.json()
      setCampaignAssignments(campData.assignments || [])
    } catch (err) {
      console.error('Confirm error:', err)
    }
    setCampaignConfirming(null)
  }

  function renderCampaignCard(assignment, mobile) {
    const campaign = assignment.campaign
    if (!campaign) return null
    const statusInfo = getCampaignStatusInfo(assignment.status)
    const products = campaign.available_products || []
    const maxSelects = campaign.max_selects || 2
    const briefImages = campaign.brief_images || []
    const dueDate = campaign.due_date ? new Date(campaign.due_date + 'T00:00:00').toLocaleDateString('en', { month: 'long', day: 'numeric' }) : null

    return (
      <div key={assignment.id} className="cd-campaign-card">
        <div className="cd-campaign-head">
          <div className="cd-campaign-eyebrow">Campaign</div>
          <div className="cd-campaign-title">{campaign.title}</div>
          {dueDate && <div className="cd-campaign-due">Due {dueDate}</div>}
          <span className={`cd-campaign-status ${statusInfo.cls}`}>{statusInfo.label}</span>
        </div>

        {campaign.description && <div className="cd-campaign-desc">{campaign.description}</div>}

        {briefImages.length > 0 && (
          <div className="cd-campaign-brief">
            {briefImages.map((img, i) => (
              <img key={i} src={img.url || img} alt={`Brief ${i + 1}`} />
            ))}
          </div>
        )}

        {campaign.brief_url && (
          <a href={campaign.brief_url} target="_blank" rel="noopener noreferrer" className="cd-campaign-brief-link">
            View Brief →
          </a>
        )}

        <div className="cd-campaign-body">
          {/* Status: Sent — show product selection */}
          {assignment.status === 'sent' && products.length > 0 && (
            <>
              <div className="cd-campaign-max">Select up to {maxSelects} item{maxSelects !== 1 ? 's' : ''}</div>
              <div className="cd-campaign-products">
                {products.map((p, i) => {
                  const selects = campaignSelects[assignment.id]?.products || []
                  const isSelected = selects.find(s => s.variant_id === p.variant_id)
                  return (
                    <div
                      key={i}
                      className={`cd-campaign-product${isSelected ? ' selected' : ''}`}
                      onClick={() => toggleCampaignProduct(assignment.id, p, maxSelects)}
                    >
                      {isSelected && <div className="cd-campaign-product-check">✓</div>}
                      <div className="cd-campaign-product-img">
                        {p.image_url ? <img src={p.image_url} alt={p.product_title} /> : <div style={{ width: '100%', height: '100%', background: '#eee' }} />}
                      </div>
                      <div className="cd-campaign-product-info">
                        <div className="cd-campaign-product-name">{p.product_title}</div>
                        {p.variant_title && <div style={{ fontSize: 10, color: '#aaa' }}>{p.variant_title}</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
              <div style={{ marginTop: 14 }}>
                <label className="cd-field-label">Notes (optional)</label>
                <input
                  className="cd-field-input"
                  value={campaignNotes[assignment.id] || ''}
                  onChange={e => setCampaignNotes(prev => ({ ...prev, [assignment.id]: e.target.value }))}
                  placeholder="Anything to add?"
                  style={{ marginBottom: 14 }}
                />
              </div>
              <button
                className="cd-submit"
                onClick={() => confirmCampaignSelects(assignment)}
                disabled={!(campaignSelects[assignment.id]?.products?.length) || campaignConfirming === assignment.id}
              >
                {campaignConfirming === assignment.id ? 'Confirming…' : 'Confirm Selects →'}
              </button>
            </>
          )}

          {/* Status: Confirmed — show confirmed selects */}
          {assignment.status === 'confirmed' && (
            <>
              <div className="cd-campaign-confirm-msg">Your order is being prepared. We&apos;ll ship your pieces soon.</div>
              {(assignment.selected_products || []).length > 0 && (
                <div className="cd-campaign-products">
                  {assignment.selected_products.map((p, i) => (
                    <div key={i} className="cd-campaign-product selected" style={{ cursor: 'default' }}>
                      <div className="cd-campaign-product-img">
                        {p.image_url ? <img src={p.image_url} alt={p.product_title} /> : <div style={{ width: '100%', height: '100%', background: '#eee' }} />}
                      </div>
                      <div className="cd-campaign-product-info">
                        <div className="cd-campaign-product-name">{p.product_title}</div>
                        {p.variant_title && <div style={{ fontSize: 10, color: '#aaa' }}>{p.variant_title}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <a className="cd-campaign-content-link" href="#" onClick={e => { e.preventDefault(); setActiveTab('submit'); setCampaignContentTarget(assignment.id) }}>
                Submit Content →
              </a>
            </>
          )}

          {/* Status: Content Submitted */}
          {assignment.status === 'content_submitted' && (
            <div className="cd-campaign-confirm-msg">Content submitted — under review.</div>
          )}

          {/* Status: Complete */}
          {assignment.status === 'complete' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 0' }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#2e7d32', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>✓</div>
              <span style={{ fontSize: 13, color: '#2e7d32' }}>Campaign complete</span>
            </div>
          )}
        </div>
      </div>
    )
  }

  function renderCampaigns(mobile) {
    const active = campaignAssignments.filter(a => ['sent', 'confirmed'].includes(a.status))
    const past = campaignAssignments.filter(a => ['content_submitted', 'complete', 'declined'].includes(a.status))

    if (campaignAssignments.length === 0) {
      return (
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 300, fontStyle: 'italic', color: '#111', marginBottom: 8 }}>No campaigns yet.</div>
          <div style={{ fontSize: 13, color: '#aaa' }}>When we send you a campaign brief, it&apos;ll show up here.</div>
        </div>
      )
    }

    return (
      <>
        {active.map(a => renderCampaignCard(a, mobile))}
        {past.length > 0 && (
          <div style={{ marginTop: active.length ? 24 : 0 }}>
            <div className="cd-campaign-section-label" onClick={() => setShowPastCampaigns(!showPastCampaigns)}>
              Past Campaigns ({past.length}) {showPastCampaigns ? '▼' : '▶'}
            </div>
            {showPastCampaigns && past.map(a => renderCampaignCard(a, mobile))}
          </div>
        )}
      </>
    )
  }

  function getMonthOptions() {
    const options = []
    const now = new Date()
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const label = d.toLocaleString('en', { month: 'long', year: 'numeric' })
      options.push({ value: val, label })
    }
    return options
  }

  function getStatusBadgeClass(status) {
    if (status === 'approved') return ' cd-badge-green'
    if (status === 'revision_requested') return ' cd-badge-yellow'
    if (status === 'rejected') return ' cd-badge-red'
    return ' cd-badge-pending'
  }

  function getFilePreview(file) {
    if (file.type.startsWith('image/')) {
      return URL.createObjectURL(file)
    }
    return null
  }

  function renderSubmitContent(mobile) {
    const prefix = mobile ? 'cd-m-' : 'cd-'
    const monthOptions = getMonthOptions()

    if (contentSuccess) {
      return (
        <div className="cd-upload-success">
          <div className="cd-upload-success-icon">✓</div>
          <div className="cd-upload-success-title">Submitted</div>
          <div className="cd-upload-success-sub">We&apos;ll review within 48 hours.</div>
          {contentSuccess.folderUrl && (
            <a href={contentSuccess.folderUrl} target="_blank" rel="noopener noreferrer" className="cd-upload-success-link">
              View in Google Drive →
            </a>
          )}
          <button className={mobile ? 'cd-m-submit' : 'cd-submit'} style={{ marginTop: 20 }} onClick={() => setContentSuccess(null)}>
            Submit More Content
          </button>
        </div>
      )
    }

    return (
      <>
        <div className="cd-upload-sub">Upload your videos or photos below. We&apos;ll review within 48 hours.</div>

        {(() => {
          const confirmedAssignments = campaignAssignments.filter(a => a.status === 'confirmed' && a.campaign)
          if (confirmedAssignments.length > 0 || campaignContentTarget) {
            return (
              <>
                <label className={mobile ? 'cd-m-field-label' : 'cd-field-label'}>Campaign</label>
                <select
                  className={mobile ? 'cd-m-field-input' : 'cd-field-input'}
                  value={campaignContentTarget || ''}
                  onChange={e => setCampaignContentTarget(e.target.value || null)}
                  disabled={!!campaignContentTarget && campaignAssignments.find(a => a.id === campaignContentTarget)}
                  style={{ marginBottom: 16 }}
                >
                  <option value="">Not campaign related</option>
                  {confirmedAssignments.map(a => (
                    <option key={a.id} value={a.id}>{a.campaign?.title || 'Campaign'}</option>
                  ))}
                </select>
              </>
            )
          }
          return null
        })()}

        <label className={mobile ? 'cd-m-field-label' : 'cd-field-label'}>Month</label>
        <select className={mobile ? 'cd-m-field-input' : 'cd-field-input'} value={contentMonth} onChange={e => setContentMonth(e.target.value)} style={{ marginBottom: 16 }}>
          {monthOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <label className={mobile ? 'cd-m-field-label' : 'cd-field-label'}>Files</label>
        <div
          className="cd-dropzone"
          onDragOver={e => e.preventDefault()}
          onDrop={handleContentFileDrop}
          onClick={() => document.getElementById(mobile ? 'cd-m-file-input' : 'cd-file-input')?.click()}
        >
          <div className="cd-dropzone-icon">↑</div>
          <div className="cd-dropzone-text">Drag & drop files here or click to browse</div>
          <div className="cd-dropzone-hint">MP4, MOV, JPG, PNG, WebP</div>
          <input
            id={mobile ? 'cd-m-file-input' : 'cd-file-input'}
            type="file"
            multiple
            accept="video/mp4,video/quicktime,image/jpeg,image/png,image/webp"
            style={{ display: 'none' }}
            onChange={handleContentFileSelect}
          />
        </div>

        {contentFiles.length > 0 && (
          <div className="cd-file-list">
            {contentFiles.map((file, i) => {
              const preview = getFilePreview(file)
              const isVideo = file.type.startsWith('video/')
              return (
                <div key={i} className="cd-file-item">
                  <div className="cd-file-thumb">
                    {preview ? (
                      <img src={preview} alt={file.name} />
                    ) : isVideo ? (
                      <div className="cd-file-video-icon">▶</div>
                    ) : null}
                  </div>
                  <div className="cd-file-info">
                    <div className="cd-file-name">{file.name}</div>
                    <div className="cd-file-size">{formatFileSize(file.size)}</div>
                  </div>
                  <button className="cd-file-remove" onClick={() => removeContentFile(i)}>×</button>
                </div>
              )
            })}
          </div>
        )}

        <label className={mobile ? 'cd-m-field-label' : 'cd-field-label'} style={{ marginTop: 16 }}>Notes (optional)</label>
        <textarea
          className={mobile ? 'cd-m-field-input' : 'cd-field-textarea'}
          value={contentNotes}
          onChange={e => setContentNotes(e.target.value)}
          placeholder="Anything we should know about these videos?"
          style={mobile ? { minHeight: 60 } : undefined}
        />

        {contentSubmitting && (
          <div className="cd-upload-progress">
            <div className="cd-upload-progress-bar" style={{ width: `${contentProgress}%` }} />
            <div className="cd-upload-progress-text">Uploading… {contentProgress}%</div>
          </div>
        )}

        <button
          className={mobile ? 'cd-m-submit' : 'cd-submit'}
          onClick={submitContent}
          disabled={!contentFiles.length || contentSubmitting}
          style={{ marginTop: 16 }}
        >
          {contentSubmitting ? 'Uploading…' : 'Submit Content →'}
        </button>

        {submissions.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <div className="cd-cart-label">Past Submissions</div>
            {submissions.map(sub => {
              const files = Array.isArray(sub.files) ? sub.files : []
              const [yr, mo] = (sub.month || '').split('-')
              const monthLabel = yr && mo ? new Date(parseInt(yr), parseInt(mo) - 1).toLocaleString('en', { month: 'long', year: 'numeric' }) : sub.month
              return (
                <div key={sub.id} style={{ paddingBottom: 16, marginBottom: 16, borderBottom: '1px solid #f2f2f2' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div>
                      <div className="cd-past-text">{monthLabel}</div>
                      <div className="cd-past-label">{files.length} file{files.length !== 1 ? 's' : ''}</div>
                    </div>
                    <span className={`cd-badge${getStatusBadgeClass(sub.status)}`}>
                      {(sub.status || '').replace(/_/g, ' ')}
                    </span>
                  </div>
                  {files.length > 0 && (
                    <div className="cd-sub-previews">
                      {files.map((file, fi) => {
                        const isImage = file.mime_type?.startsWith('image/')
                        const isVideo = file.mime_type?.startsWith('video/')
                        const previewUrl = `/api/drive/preview/${file.drive_file_id}`
                        return (
                          <div key={fi} className="cd-sub-preview-wrap">
                            {isImage ? (
                              <img src={previewUrl} alt={file.name} className="cd-sub-preview-img" onClick={() => setLightboxFile(file)} />
                            ) : isVideo ? (
                              <video controls preload="metadata" src={previewUrl} className="cd-sub-preview-video" />
                            ) : (
                              <div style={{ width: 48, height: 48, background: '#f5f5f5', border: '1px solid #eee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#ccc' }}>FILE</div>
                            )}
                            <div className="cd-sub-preview-name">{file.name}</div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {sub.drive_folder_url && (
                    <a href={sub.drive_folder_url} target="_blank" rel="noopener noreferrer" className="cd-sub-drive-link">
                      Open in Drive →
                    </a>
                  )}
                  {sub.notes && <div className="cd-past-notes">{sub.notes}</div>}
                  {sub.admin_feedback && (
                    <div style={{ fontSize: 11, color: sub.status === 'revision_requested' ? '#a68307' : sub.status === 'rejected' ? '#c62828' : '#2e7d32', marginTop: 3 }}>
                      Feedback: {sub.admin_feedback}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </>
    )
  }

  async function savePayment() {
    setPaymentSaving(true)
    try {
      const body = { payment_method: paymentMethod }
      if (paymentMethod === 'paypal') {
        body.paypal_email = paymentForm.paypalEmail
      } else {
        body.bank_account_name = paymentForm.bankName
        body.bank_institution = paymentForm.bankInstitution
        body.bank_account_number = paymentForm.bankAccount
        body.bank_routing_number = paymentForm.bankRouting
      }
      const res = await fetch('/api/creators/payment', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        const data = await res.json()
        setCreator(data.creator)
        setPaymentEditing(false)
        setPaymentSaved(true)
        setTimeout(() => setPaymentSaved(false), 3000)
      }
    } catch {}
    setPaymentSaving(false)
  }

  function isPaymentValid() {
    if (!paymentMethod) return false
    if (paymentMethod === 'paypal') return paymentForm.paypalEmail.trim().length > 0
    return paymentForm.bankName.trim().length > 0 && paymentForm.bankAccount.trim().length > 0 && paymentForm.bankRouting.trim().length > 0
  }

  function renderPaymentForm(mobile) {
    const fl = mobile ? 'cd-m-field-label' : 'cd-feedback-label'
    const fi = mobile ? 'cd-m-field-input' : 'cd-field-input'
    return (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          <div
            style={{ border: `1.5px solid ${paymentMethod === 'paypal' ? '#111' : '#e8e8e8'}`, borderRadius: 14, padding: '20px 18px', cursor: 'pointer', position: 'relative', transition: 'border-color 0.2s' }}
            onClick={() => setPaymentMethod('paypal')}
          >
            {paymentMethod === 'paypal' && <div style={{ position: 'absolute', top: 12, right: 12, width: 20, height: 20, borderRadius: '50%', background: '#111', color: '#fff', fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</div>}
            <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#888', marginBottom: 10 }}>PayPal</div>
            <div style={{ height: 1, background: '#f0f0f0', marginBottom: 10 }} />
            <div style={{ fontSize: 11.5, color: '#666', fontWeight: 300, lineHeight: 1.7 }}>Fast, simple. We send directly to your PayPal.</div>
          </div>
          <div
            style={{ border: `1.5px solid ${paymentMethod === 'bank' ? '#111' : '#e8e8e8'}`, borderRadius: 14, padding: '20px 18px', cursor: 'pointer', position: 'relative', transition: 'border-color 0.2s' }}
            onClick={() => setPaymentMethod('bank')}
          >
            {paymentMethod === 'bank' && <div style={{ position: 'absolute', top: 12, right: 12, width: 20, height: 20, borderRadius: '50%', background: '#111', color: '#fff', fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</div>}
            <div style={{ fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#888', marginBottom: 10 }}>Bank Transfer</div>
            <div style={{ height: 1, background: '#f0f0f0', marginBottom: 10 }} />
            <div style={{ fontSize: 11.5, color: '#666', fontWeight: 300, lineHeight: 1.7 }}>Direct deposit to your bank account.</div>
          </div>
        </div>
        {paymentMethod === 'paypal' && (
          <div style={{ marginBottom: 20 }}>
            <label className={fl} style={{ display: 'block', marginBottom: 7 }}>PayPal Email Address</label>
            <input className={fi} type="email" value={paymentForm.paypalEmail} onChange={e => setPaymentForm(f => ({ ...f, paypalEmail: e.target.value }))} placeholder="your@paypal.com" />
          </div>
        )}
        {paymentMethod === 'bank' && (
          <>
            <div style={{ marginBottom: 14 }}><label className={fl} style={{ display: 'block', marginBottom: 7 }}>Account Holder Name</label><input className={fi} value={paymentForm.bankName} onChange={e => setPaymentForm(f => ({ ...f, bankName: e.target.value }))} /></div>
            <div style={{ marginBottom: 14 }}><label className={fl} style={{ display: 'block', marginBottom: 7 }}>Institution Name</label><input className={fi} value={paymentForm.bankInstitution} onChange={e => setPaymentForm(f => ({ ...f, bankInstitution: e.target.value }))} placeholder="e.g. TD Bank" /></div>
            <div style={{ marginBottom: 14 }}><label className={fl} style={{ display: 'block', marginBottom: 7 }}>Account Number</label><input className={fi} value={paymentForm.bankAccount} onChange={e => setPaymentForm(f => ({ ...f, bankAccount: e.target.value }))} /></div>
            <div style={{ marginBottom: 20 }}><label className={fl} style={{ display: 'block', marginBottom: 7 }}>Routing / Transit Number</label><input className={fi} value={paymentForm.bankRouting} onChange={e => setPaymentForm(f => ({ ...f, bankRouting: e.target.value }))} /></div>
          </>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="cd-submit" onClick={savePayment} disabled={paymentSaving || !isPaymentValid()}>
            {paymentSaving ? 'Saving…' : 'Save Payment Info'}
          </button>
          <button style={{ padding: '14px 24px', background: 'transparent', border: '1px solid #e8e8e8', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: '9.5px', fontWeight: 500, letterSpacing: '0.22em', textTransform: 'uppercase', cursor: 'pointer', color: '#999' }} onClick={() => setPaymentEditing(false)}>Cancel</button>
        </div>
      </>
    )
  }

  function renderSettings(mobile) {
    const hasSaved = creator?.payment_method
    const maskedAccount = creator?.bank_account_number ? '···' + creator.bank_account_number.slice(-4) : ''
    const updatedAt = creator?.payment_updated_at ? new Date(creator.payment_updated_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : null

    return (
      <div>
        <div style={{ fontSize: 9, letterSpacing: '0.4em', textTransform: 'uppercase', color: '#aaa', display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22 }}>
          Payment Info
          <span style={{ flex: 1, height: 1, background: '#e8e8e8' }} />
        </div>

        {paymentSaved && <div className="cd-success" style={{ marginBottom: 16 }}>Payment info updated.</div>}

        {!paymentEditing ? (
          <div>
            {hasSaved ? (
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#111', marginBottom: 4 }}>
                    {creator.payment_method === 'paypal' ? `PayPal — ${creator.paypal_email}` : `Bank Transfer — ${creator.bank_institution || 'Bank'} ${maskedAccount}`}
                  </div>
                  {updatedAt && <div style={{ fontSize: 11, color: '#aaa', fontWeight: 300 }}>Last updated {updatedAt}</div>}
                </div>
                <button
                  style={{ padding: '6px 14px', border: '1px solid #e8e8e8', background: 'transparent', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: '8.5px', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#999', cursor: 'pointer', borderRadius: 2 }}
                  onClick={() => setPaymentEditing(true)}
                >Edit</button>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 13, color: '#aaa', fontWeight: 300, marginBottom: 14 }}>No payment method set yet.</div>
                <button
                  style={{ padding: '10px 20px', background: '#111', color: 'white', border: 'none', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: '9.5px', fontWeight: 500, letterSpacing: '0.22em', textTransform: 'uppercase', cursor: 'pointer' }}
                  onClick={() => setPaymentEditing(true)}
                >Add Payment Info</button>
              </div>
            )}
          </div>
        ) : (
          renderPaymentForm(mobile)
        )}
      </div>
    )
  }

  // --- DESKTOP RENDER ---
  function renderDesktopCard() {
    // Ads tab renders its own card structure (earnings + momentum)
    if (activeTab === 'ads') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {renderEarnings(false)}
          {renderMomentum(false)}
        </div>
      )
    }

    // Campaigns tab
    if (activeTab === 'campaigns') {
      return (
        <div className="cd-card">
          <div className="cd-card-head">
            <div>
              <div className="cd-card-eyebrow">Creator Campaigns</div>
              <div className="cd-card-title">Campaigns</div>
            </div>
          </div>
          <div className="cd-card-body">
            {renderCampaigns(false)}
          </div>
        </div>
      )
    }

    // Wardrobe tab renders wardrobe grid + orders card
    if (activeTab === 'wardrobe') {
      const totalItems = orders.reduce((sum, o) => sum + (o.line_items?.length || 0), 0)
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="cd-wardrobe">
            <div className="cd-wardrobe-head">
              <div>
                <div className="cd-wardrobe-eyebrow">Your Collection</div>
                <div className="cd-wardrobe-title">Wardrobe</div>
                {totalItems > 0 && <div className="cd-wardrobe-sub">{totalItems} piece{totalItems !== 1 ? 's' : ''} from Nama</div>}
              </div>
            </div>
            {renderWardrobeGrid(false)}
          </div>
          {orders.length > 0 && (
            <div className="cd-orders">
              <div className="cd-orders-head">
                <div>
                  <div className="cd-orders-eyebrow">Shipment History</div>
                  <div className="cd-orders-title">Orders</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <a href="https://namaclo.returnlogic.com/" target="_blank" rel="noopener noreferrer" className="cd-exchange-btn">Start an Exchange →</a>
                  {influencer?.email && (
                    <div style={{ fontSize: '11px', color: '#aaa', marginTop: '6px' }}>Use the email your order was placed with: {influencer.email}</div>
                  )}
                </div>
              </div>
              {renderOrderHistory(false)}
            </div>
          )}
        </div>
      )
    }

    if (activeTab === 'settings') {
      return (
        <div className="cd-card">
          <div className="cd-card-head">
            <div>
              <div className="cd-card-eyebrow">Account</div>
              <div className="cd-card-title">Payment Info</div>
            </div>
          </div>
          <div className="cd-card-body">
            {renderSettings(false)}
          </div>
        </div>
      )
    }

    const config = {
      request: { eyebrow: 'Monthly Allowance', title: 'Request New Styles' },
      submit: { eyebrow: 'Monthly Delivery', title: 'Submit Content' },
    }
    const c = config[activeTab]
    return (
      <div className="cd-card">
        <div className="cd-card-head">
          <div>
            <div className="cd-card-eyebrow">{c.eyebrow}</div>
            <div className="cd-card-title">{c.title}</div>
          </div>
        </div>
        <div className="cd-card-body">
          {activeTab === 'request' && renderRequestStyles(false)}
          {activeTab === 'submit' && renderSubmitContent(false)}
        </div>
      </div>
    )
  }

  return (
    <div className="cd-wrap">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ====== DESKTOP ====== */}
      <div className="cd-desktop">
        <div className="cd-page">

          <div className="cd-layout">
            <div className="cd-sidebar">
              <div className="cd-sidebar-logo">
                <div className="cd-logo-lockup">
                  <img src="/nama-logo.svg" alt="Nama" className="cd-logo-img" />
                  <div className="cd-logo-sub">Partners</div>
                </div>
              </div>
              <div className="cd-identity">
                {photoUrl ? (
                  <img className="cd-profile-photo" src={photoUrl} alt={creatorName} />
                ) : (
                  <div className="cd-profile-photo" style={{ background: '#e8e8e8' }} />
                )}
                <div className="cd-creator-name">{creatorName}</div>
                {handle && <div className="cd-creator-handle">{handle}</div>}
                <div className="cd-status-pill"><span className="cd-dot" /> Active Partner</div>
              </div>

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

              {affiliateCode && (
                <div className="cd-aff-wrap">
                  <div className="cd-aff-block">
                    <div className="cd-aff-top">
                      <div className="cd-aff-label">Your Affiliate Code</div>
                      <button className="cd-aff-copy" onClick={copyCode}>{copied ? 'Copied' : 'Copy'}</button>
                    </div>
                    <div className="cd-aff-code">{affiliateCode.toUpperCase()}</div>
                    <hr className="cd-aff-divider" />
                    <div className="cd-aff-link-row">
                      <div>
                        <div className="cd-aff-link-label">Your Link</div>
                        <div className="cd-aff-link-url">namaclo.com/?ref={affiliateCode.toLowerCase()}</div>
                      </div>
                      <button className="cd-aff-copy" onClick={copyLink}>{copiedLink ? 'Copied' : 'Copy'}</button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="cd-content">
              <div className="cd-stats-bar">
                {commissionRate > 0 && (
                  <div className="cd-stats-bar-item">
                    <div className="cd-stats-bar-label">Commission</div>
                    <div className="cd-stats-bar-val">{commissionRate}%</div>
                  </div>
                )}
                <div className="cd-stats-bar-item">
                  <div className="cd-stats-bar-label">Videos / Month</div>
                  <div className="cd-stats-bar-val">{videosPerMonth}</div>
                </div>
                <div className="cd-stats-bar-item">
                  <div className="cd-stats-bar-label">Ads Running</div>
                  <div className="cd-stats-bar-val">{adsRunning}</div>
                </div>
              </div>
              {renderDesktopCard()}
            </div>
          </div>
        </div>
      </div>

      {/* ====== MOBILE ====== */}
      <div className="cd-mobile">
        <div className="cd-m-wrap">
          <div className="cd-m-topbar">
            <div className="cd-m-logo-lockup">
              <img src="/nama-logo.svg" alt="Nama" className="cd-m-logo" />
              <div className="cd-m-logo-sub">Partners</div>
            </div>
            <div className="cd-m-avatar">
              {photoUrl ? <img src={photoUrl} alt="" /> : initials}
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
                <div className="cd-m-aff-top">
                  <div className="cd-m-aff-label">Affiliate Code</div>
                  <button className="cd-m-aff-copy" onClick={copyCode}>{copied ? 'Copied' : 'Copy'}</button>
                </div>
                <div className="cd-m-aff-code">{affiliateCode.toUpperCase()}</div>
                <hr className="cd-m-aff-divider" />
                <div className="cd-m-aff-link-row">
                  <div>
                    <div className="cd-m-aff-link-label">Your Link</div>
                    <div className="cd-m-aff-link-url">namaclo.com/?ref={affiliateCode.toLowerCase()}</div>
                  </div>
                  <button className="cd-m-aff-copy" onClick={copyLink}>{copiedLink ? 'Copied' : 'Copy'}</button>
                </div>
              </div>
            </div>
          )}

          <div className="cd-m-sections">
            {/* Campaigns */}
            <div className="cd-m-section" style={activeTab !== 'campaigns' ? { display: 'none' } : undefined}>
              <div className="cd-m-section-head">
                <div className="cd-m-section-eyebrow">Creator Campaigns</div>
                <div className="cd-m-section-title">Campaigns</div>
              </div>
              <div className="cd-m-section-body">{renderCampaigns(true)}</div>
            </div>

            {/* Wardrobe */}
            <div style={activeTab !== 'wardrobe' ? { display: 'none' } : undefined}>
              <div className="cd-m-section">
                <div className="cd-m-section-head">
                  <div className="cd-m-section-eyebrow">Your Collection</div>
                  <div className="cd-m-section-title">Wardrobe</div>
                </div>
                {renderWardrobeGrid(true)}
              </div>
              {orders.length > 0 && (
                <div className="cd-m-section">
                  <div className="cd-m-section-head">
                    <div className="cd-m-section-eyebrow">Shipment History</div>
                    <div className="cd-m-section-title">Orders</div>
                  </div>
                  <div className="cd-m-section-body">{renderOrderHistory(true)}</div>
                </div>
              )}
            </div>

            {/* Request Styles */}
            <div className="cd-m-section" style={activeTab !== 'request' ? { display: 'none' } : undefined}>
              <div className="cd-m-section-head">
                <div className="cd-m-section-eyebrow">Monthly Allowance</div>
                <div className="cd-m-section-title">Request New Styles</div>
              </div>
              <div className="cd-m-section-body">{renderRequestStyles(true)}</div>
            </div>

            {/* Live Ads */}
            <div style={activeTab !== 'ads' ? { display: 'none' } : undefined}>
              <div className="cd-m-section-body" style={{ padding: '16px 0' }}>
                {renderEarnings(true)}
                {renderMomentum(true)}
              </div>
            </div>

            {/* Submit Content */}
            <div className="cd-m-section" style={activeTab !== 'submit' ? { display: 'none' } : undefined}>
              <div className="cd-m-section-head">
                <div className="cd-m-section-eyebrow">Monthly Delivery</div>
                <div className="cd-m-section-title">Submit Content</div>
              </div>
              <div className="cd-m-section-body">{renderSubmitContent(true)}</div>
            </div>

            {/* Settings */}
            <div className="cd-m-section" style={activeTab !== 'settings' ? { display: 'none' } : undefined}>
              <div className="cd-m-section-head">
                <div className="cd-m-section-eyebrow">Account</div>
                <div className="cd-m-section-title">Payment Info</div>
              </div>
              <div className="cd-m-section-body">{renderSettings(true)}</div>
            </div>
          </div>

          <div className="cd-m-tabbar">
            <button className={`cd-m-tabbar-item${activeTab === 'ads' ? ' active' : ''}`} onClick={() => setActiveTab('ads')}>
              <div className="cd-m-tabbar-icon"><svg viewBox="0 0 24 24"><rect x="4" y="14" width="4" height="6" rx="0.5" /><rect x="10" y="10" width="4" height="10" rx="0.5" /><rect x="16" y="4" width="4" height="16" rx="0.5" /></svg></div>
              <div className="cd-m-tabbar-label">Ads</div>
            </button>
            <button className={`cd-m-tabbar-item${activeTab === 'campaigns' ? ' active' : ''}`} onClick={() => setActiveTab('campaigns')}>
              <div className="cd-m-tabbar-icon"><svg viewBox="0 0 24 24"><path d="M4 15V9l8-4v14l-8-4z" /><path d="M12 7l5-2v14l-5-2" /><line x1="20" y1="10" x2="22" y2="9" /><line x1="20" y1="12" x2="22" y2="12" /><line x1="20" y1="14" x2="22" y2="15" /></svg></div>
              <div className="cd-m-tabbar-label">Campaigns</div>
            </button>
            <button className={`cd-m-tabbar-item${activeTab === 'wardrobe' ? ' active' : ''}`} onClick={() => setActiveTab('wardrobe')}>
              <div className="cd-m-tabbar-icon"><svg viewBox="0 0 24 24"><path d="M12 2a4 4 0 0 1 4 4" /><path d="M12 2a4 4 0 0 0-4 4" /><path d="M8 6l-5 4h18l-5-4" /><line x1="12" y1="2" x2="12" y2="6" /></svg></div>
              <div className="cd-m-tabbar-label">Wardrobe</div>
            </button>
            <button className={`cd-m-tabbar-item${activeTab === 'submit' ? ' active' : ''}`} onClick={() => setActiveTab('submit')}>
              <div className="cd-m-tabbar-icon"><svg viewBox="0 0 24 24"><line x1="12" y1="15" x2="12" y2="3" /><polyline points="5 10 12 3 19 10" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg></div>
              <div className="cd-m-tabbar-label">Submit</div>
            </button>
            <button className={`cd-m-tabbar-item${activeTab === 'settings' ? ' active' : ''}`} onClick={() => setActiveTab('settings')}>
              <div className="cd-m-tabbar-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" /></svg></div>
              <div className="cd-m-tabbar-label">Account</div>
            </button>
          </div>

        </div>
      </div>

      {/* Lightbox */}
      {lightboxFile && (
        <div className="cd-lightbox" onClick={() => setLightboxFile(null)}>
          <button className="cd-lightbox-close" onClick={() => setLightboxFile(null)}>×</button>
          {lightboxFile.mime_type?.startsWith('image/') ? (
            <img src={`/api/drive/preview/${lightboxFile.drive_file_id}`} alt={lightboxFile.name} onClick={e => e.stopPropagation()} />
          ) : (
            <video controls autoPlay src={`/api/drive/preview/${lightboxFile.drive_file_id}`} onClick={e => e.stopPropagation()} />
          )}
        </div>
      )}
    </div>
  )
}
