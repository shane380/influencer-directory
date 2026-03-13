'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const CSS = `
.cd-wrap { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #111; margin: 0; padding: 0; }
.cd-wrap *, .cd-wrap *::before, .cd-wrap *::after { box-sizing: border-box; margin: 0; padding: 0; }

/* Skeleton loaders */
@keyframes cd-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
.cd-skel { background: #f0f0f0; border-radius: 4px; animation: cd-pulse 1.5s ease-in-out infinite; }
.cd-skel-stat { width: 40px; height: 24px; }
.cd-skel-stat-lg { width: 80px; height: 48px; }
.cd-skel-line { width: 100%; height: 14px; margin-bottom: 6px; }
.cd-skel-line-sm { width: 60%; height: 10px; }
.cd-skel-ad { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
.cd-skel-spinner { width: 24px; height: 24px; border: 2px solid #e0e0e0; border-top-color: #bbb; border-radius: 50%; animation: cd-spin 0.8s linear infinite; }
@keyframes cd-spin { to { transform: rotate(360deg); } }

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
.cd-logo-img { height: 34px; display: block; }
.cd-logo-sub { font-size: 9.5px; letter-spacing: 0.4em; text-transform: uppercase; color: #aaa; text-align: center; }
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
.cd-code-change-link { font-size: 11px; color: #aaa; cursor: pointer; background: none; border: none; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 0; margin-top: 14px; display: block; }
.cd-code-change-link:hover { text-decoration: underline; }
.cd-code-change-form { margin-top: 14px; padding-top: 14px; border-top: 1px solid #e8e8e8; }
.cd-code-change-label { font-size: 9px; letter-spacing: 0.32em; text-transform: uppercase; color: #aaa; margin-bottom: 6px; }
.cd-code-change-input { width: 100%; padding: 10px 12px; border: 1px solid #e8e8e8; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; color: #111; letter-spacing: 0.06em; text-transform: uppercase; outline: none; background: #fafafa; }
.cd-code-change-input:focus { border-color: #aaa; }
.cd-code-change-note { font-size: 10px; color: #aaa; margin-top: 6px; line-height: 1.5; }
.cd-code-change-actions { display: flex; align-items: center; gap: 12px; margin-top: 12px; }
.cd-code-change-submit { padding: 8px 18px; background: #111; color: white; border: none; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 9px; font-weight: 500; letter-spacing: 0.18em; text-transform: uppercase; cursor: pointer; }
.cd-code-change-submit:disabled { background: #ccc; cursor: not-allowed; }
.cd-code-change-cancel { font-size: 10px; color: #aaa; cursor: pointer; background: none; border: none; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
.cd-code-change-cancel:hover { color: #555; }
.cd-code-change-pending { font-size: 11px; color: #555; margin-top: 12px; line-height: 1.6; }
.cd-code-change-pending-code { font-family: 'Playfair Display', serif; font-weight: 400; }
.cd-code-change-pending-cancel { font-size: 10px; color: #c0392b; cursor: pointer; background: none; border: none; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; margin-top: 4px; display: block; padding: 0; }
.cd-code-change-pending-cancel:hover { text-decoration: underline; }
.cd-code-change-rejected { font-size: 10px; color: #c0392b; margin-top: 6px; font-style: italic; }

/* SIDENAV */
.cd-sidenav { flex: 1; }
.cd-nav-item { display: flex; align-items: center; justify-content: space-between; padding: 14px 32px; border-bottom: 1px solid #e8e8e8; cursor: pointer; transition: background 0.12s; background: none; width: 100%; text-align: left; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; position: relative; }
.cd-nav-badge { min-width: 16px; height: 16px; border-radius: 8px; background: #ef4444; color: #fff; font-size: 9px; font-weight: 600; display: flex; align-items: center; justify-content: center; padding: 0 4px; line-height: 1; margin-right: 8px; }
.cd-nav-item:hover { background: #f5f5f5; }
.cd-nav-item.active { background: #f5f5f5; }
.cd-nav-label { font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: #aaa; }
.cd-nav-item.active .cd-nav-label { color: #111; }
.cd-nav-arrow { font-size: 11px; color: #999; }
.cd-nav-item.active .cd-nav-arrow { color: #111; }

/* NOTIFICATIONS */
.cd-notif-btn { display: flex; align-items: center; justify-content: space-between; padding: 14px 32px; border-top: 1px solid #e8e8e8; cursor: pointer; transition: background 0.12s; background: none; width: 100%; text-align: left; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; position: relative; }
.cd-notif-btn:hover { background: #f5f5f5; }
.cd-notif-btn-label { font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: #aaa; display: flex; align-items: center; gap: 8px; }
.cd-notif-badge { min-width: 16px; height: 16px; border-radius: 8px; background: #e74c3c; color: white; font-size: 9px; font-weight: 600; display: flex; align-items: center; justify-content: center; padding: 0 4px; }
.cd-notif-dropdown { position: absolute; bottom: 100%; left: 16px; right: 16px; background: white; border: 1px solid #e8e8e8; border-radius: 10px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); z-index: 50; max-height: 260px; overflow-y: auto; margin-bottom: 4px; }
.cd-notif-empty { padding: 16px; text-align: center; font-size: 11px; color: #ccc; }
.cd-notif-item { display: block; width: 100%; text-align: left; padding: 10px 14px; cursor: pointer; transition: background 0.12s; border-bottom: 1px solid #f5f5f5; background: none; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
.cd-notif-item:last-child { border-bottom: none; }
.cd-notif-item:hover { background: #f9f9f9; }
.cd-notif-item-title { font-size: 11px; font-weight: 600; color: #333; margin-bottom: 1px; }
.cd-notif-item-meta { font-size: 10px; color: #999; }
.cd-notif-item-feedback { font-size: 10px; color: #666; margin-top: 3px; font-style: italic; }

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

/* RESUBMIT */
.cd-resubmit-btn { display: inline-block; margin-top: 10px; padding: 8px 20px; font-size: 12px; font-weight: 600; letter-spacing: 0.04em; color: #111; background: #fff; border: 1px solid #111; cursor: pointer; transition: all 0.15s; }
.cd-resubmit-btn:hover { background: #111; color: #fff; }
.cd-resubmit-banner { background: #fefce8; border: 1px solid #e5d78e; padding: 12px 16px; margin-bottom: 16px; font-size: 13px; color: #333; }
.cd-resubmit-cancel { background: none; border: 1px solid #ccc; padding: 4px 14px; font-size: 12px; color: #666; cursor: pointer; }
.cd-resubmit-cancel:hover { border-color: #999; color: #333; }

/* CONTENT SPLIT LAYOUT (desktop) */
.cd-card-content .cd-card-body { padding: 0; }
.cd-content-split { display: flex; min-height: 400px; }
.cd-content-left { flex: 1; padding: 0 36px 36px; }
.cd-content-right { width: 340px; background: #fafafa; border-left: 1px solid #e8e8e8; display: flex; flex-direction: column; }
.cd-content-right-eyebrow { font-size: 9px; letter-spacing: 0.4em; text-transform: uppercase; color: #aaa; padding: 24px 24px 16px; }
.cd-content-right-scroll { flex: 1; overflow-y: auto; padding: 0 24px 24px; max-height: 600px; }
.cd-form-row { display: flex; gap: 12px; margin-bottom: 0; }
.cd-form-col { flex: 1; }
.cd-hist-card { padding: 16px 0; border-bottom: 1px solid #eee; }
.cd-hist-card:first-child { padding-top: 0; }
.cd-hist-card:last-child { border-bottom: none; }
.cd-hist-feedback { font-size: 11px; color: #a68307; background: #fefce8; border-left: 3px solid #e5d78e; padding: 8px 12px; margin-top: 8px; line-height: 1.5; }

/* CONTENT MOBILE TABS */
.cd-content-tabs { display: flex; border-bottom: 1px solid #e8e8e8; margin-bottom: 20px; }
.cd-content-tab { flex: 1; text-align: center; font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; padding: 10px 0; border: none; border-bottom: 2px solid transparent; background: none; color: #aaa; font-weight: 400; cursor: pointer; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
.cd-content-tab.active { color: #1a1a1a; font-weight: 600; border-bottom-color: #1a1a1a; }

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
.cd-campaign-section-hdr { font-size: 9px; letter-spacing: 0.4em; text-transform: uppercase; color: #aaa; display: flex; align-items: center; gap: 14px; margin-bottom: 18px; }
.cd-campaign-section-hdr span:last-child { flex: 1; height: 1px; background: #e8e8e8; }
.cd-campaign-section-count { font-size: 11px; letter-spacing: 0; text-transform: none; color: #aaa; }
.cd-campaign-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
.cd-campaign-card { background: #fff; border: 1px solid #e8e8e8; border-radius: 8px; padding: 24px 28px; }
.cd-campaign-card.for-you { border-left: 1.5px solid #1a1a1a; }
.cd-campaign-title { font-family: 'Playfair Display', serif; font-size: 20px; font-weight: 300; color: #111; line-height: 1.2; margin-bottom: 6px; }
.cd-campaign-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 4px; }
.cd-campaign-due { font-size: 11px; color: #aaa; }
.cd-campaign-status { display: inline-flex; align-items: center; font-size: 8px; letter-spacing: 0.04em; padding: 3px 10px; border-radius: 100px; border: 1px solid; background: transparent; }
.cd-campaign-status-sent { color: #1565c0; border-color: #90caf9; }
.cd-campaign-status-confirmed { color: #e65100; border-color: #ffcc80; }
.cd-campaign-status-content { color: #6a1b9a; border-color: #ce93d8; }
.cd-campaign-status-complete { color: #2e7d32; border-color: #a5d6a7; }
.cd-campaign-status-declined { color: #888; border-color: #ccc; }
.cd-campaign-desc { font-size: 12px; color: #888; line-height: 1.5; margin-bottom: 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.cd-campaign-card-thumbs { display: flex; gap: 6px; margin-top: 12px; }
.cd-campaign-card-thumb { width: 48px; height: 60px; object-fit: cover; border-radius: 4px; border: 1px solid #e8e8e8; }
.cd-campaign-card-thumb-more { width: 48px; height: 60px; border-radius: 4px; border: 1px solid #e8e8e8; display: flex; align-items: center; justify-content: center; font-size: 11px; color: #999; background: #f9f9f9; }
.cd-campaign-review-btn { display: inline-block; margin-top: 14px; padding: 8px 20px; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #fff; background: #111; border: none; border-radius: 4px; cursor: pointer; transition: background 0.15s; }
.cd-campaign-review-btn:hover { background: #333; }
.cd-campaign-brief-link { display: inline-flex; align-items: center; gap: 5px; font-size: 10px; color: #888; text-decoration: none; letter-spacing: 0.04em; margin-top: 8px; }
.cd-campaign-brief-link:hover { color: #111; }
.cd-campaign-product-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
.cd-campaign-chip { display: flex; align-items: center; gap: 6px; background: #f5f5f4; border-radius: 8px; padding: 4px 10px 4px 4px; font-size: 11px; color: #333; cursor: pointer; border: 1.5px solid transparent; transition: border-color 0.15s; }
.cd-campaign-chip.selected { border-color: #1a1a1a; }
.cd-campaign-chip-check { width: 14px; height: 14px; border-radius: 50%; background: #1a1a1a; color: #fff; font-size: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.cd-campaign-chip img { width: 26px; height: 26px; border-radius: 6px; object-fit: cover; flex-shrink: 0; }
.cd-campaign-chip-placeholder { width: 26px; height: 26px; border-radius: 6px; background: #e8e8e8; flex-shrink: 0; }
.cd-campaign-max { font-size: 10px; color: #aaa; letter-spacing: 0.08em; text-transform: uppercase; margin-top: 14px; margin-bottom: 2px; }
.cd-campaign-notes { margin-top: 12px; }
.cd-campaign-btn-fill { display: inline-block; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; font-weight: 500; letter-spacing: 2.5px; text-transform: uppercase; color: #fff; background: #1a1a1a; border: none; padding: 14px 28px; cursor: pointer; margin-top: 16px; transition: background 0.15s; }
.cd-campaign-btn-fill:hover { background: #333; }
.cd-campaign-btn-fill:disabled { opacity: 0.4; cursor: default; }
.cd-campaign-btn-outline { display: inline-block; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; font-weight: 500; letter-spacing: 2.5px; text-transform: uppercase; color: #1a1a1a; background: transparent; border: 1px solid #e8e8e8; padding: 14px 28px; cursor: pointer; margin-top: 16px; transition: border-color 0.15s; text-decoration: none; }
.cd-campaign-btn-outline:hover { border-color: #999; }
.cd-campaign-confirm-msg { font-size: 12px; color: #888; line-height: 1.5; padding-top: 10px; }
.cd-campaign-inv-indent { margin-left: 16px; border-left: 1px solid #e8e8e8; padding-left: 16px; margin-top: 0; }
.cd-campaign-inv-label { font-size: 9px; letter-spacing: 0.3em; text-transform: uppercase; color: #bbb; margin-bottom: 8px; margin-top: 16px; }

/* CAMPAIGN DETAIL */
.cd-camp-back { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #aaa; cursor: pointer; background: none; border: none; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 0; margin-bottom: 24px; transition: color 0.15s; }
.cd-camp-back:hover { color: #111; }
.cd-camp-detail { }
.cd-camp-banner { width: 100%; aspect-ratio: 20/17; object-fit: cover; display: block; margin-bottom: 28px; border-radius: 8px; }
.cd-camp-steps { display: flex; align-items: center; gap: 0; margin-bottom: 32px; }
.cd-camp-step { display: flex; align-items: center; gap: 8px; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: #ccc; padding: 10px 0; flex: 1; justify-content: center; border-bottom: 2px solid #e8e8e8; transition: all 0.2s; }
.cd-camp-step.active { color: #111; border-bottom-color: #111; font-weight: 500; }
.cd-camp-step.completed { color: #2e7d32; border-bottom-color: #2e7d32; }
.cd-camp-step-num { width: 20px; height: 20px; border-radius: 50%; border: 1.5px solid #e8e8e8; display: flex; align-items: center; justify-content: center; font-size: 9px; flex-shrink: 0; }
.cd-camp-step.active .cd-camp-step-num { border-color: #111; color: #111; }
.cd-camp-step.completed .cd-camp-step-num { border-color: #2e7d32; background: #2e7d32; color: #fff; }
.cd-camp-deliverables { margin-bottom: 28px; }
.cd-camp-deliverables-label { font-size: 9px; letter-spacing: 0.38em; text-transform: uppercase; color: #aaa; margin-bottom: 10px; }
.cd-camp-deliverables-text { font-size: 13px; color: #555; line-height: 1.7; white-space: pre-wrap; }
.cd-camp-card-banner-wrap { margin: -24px -28px 16px; overflow: hidden; border-radius: 8px 8px 0 0; }
.cd-camp-card-banner { width: 100%; aspect-ratio: 20/17; object-fit: cover; display: block; }
.cd-camp-go-live { font-size: 11px; color: #aaa; }
@media (max-width: 768px) {
  .cd-campaign-grid { grid-template-columns: 1fr; }
  .cd-campaign-card { padding: 20px; }
  .cd-campaign-title { font-size: 18px; }
  .cd-camp-banner { aspect-ratio: 20/17; margin-bottom: 20px; }
  .cd-camp-step { font-size: 8px; letter-spacing: 0.06em; gap: 4px; }
  .cd-camp-step-num { width: 16px; height: 16px; font-size: 8px; }
  .cd-camp-card-banner-wrap { margin: -20px -20px 12px; }
  .cd-camp-card-banner { aspect-ratio: 20/17; }
}

/* PRODUCTS */
.cd-products { display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; }
.cd-product { border: 1px solid #e8e8e8; cursor: pointer; transition: border-color 0.2s; }
.cd-product:hover { border-color: #ccc; }
.cd-product-img { aspect-ratio: 4/5; background: #f5f5f5; display: flex; align-items: center; justify-content: center; border-bottom: 1px solid #e8e8e8; overflow: hidden; }
.cd-product-img img { width: 100%; height: 100%; object-fit: cover; }
.cd-product-info { padding: 12px 14px 14px; }
.cd-product-name { font-size: 12px; color: #111; margin-bottom: 2px; }
.cd-product-variant { font-size: 10.5px; color: #aaa; font-weight: 300; }
.cd-load-more { display: inline-block; font-size: 9px; letter-spacing: 0.16em; text-transform: uppercase; cursor: pointer; padding: 8px 20px; background: transparent; color: #999; border: 1px solid #e8e8e8; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; transition: all 0.15s; }
.cd-load-more:hover { border-color: #111; color: #111; }
.cd-product-cta { display: inline-block; font-size: 9px; letter-spacing: 0.16em; text-transform: uppercase; margin-top: 10px; cursor: pointer; padding: 7px 16px; background: #111; color: #fff; border: 1px solid #111; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
.cd-product-cta.added { background: transparent; color: #ccc; border-color: #e8e8e8; cursor: default; }
.cd-size-row { display: flex; gap: 4px; margin-top: 8px; flex-wrap: wrap; }
.cd-size-pill { padding: 3px 10px; border: 1px solid #e8e8e8; background: #fff; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; color: #555; cursor: pointer; border-radius: 100px; transition: all 0.15s; letter-spacing: 0.04em; }
.cd-size-pill:hover { border-color: #aaa; }
.cd-size-pill.selected { background: #111; color: white; border-color: #111; }
.cd-size-pill.oos { opacity: 0.35; text-decoration: line-through; cursor: not-allowed; }
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
.cd-progress-fill { height: 100%; background: #2e7d32; border-radius: 2px; transition: width 1s ease; }
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

/* AFFILIATE SALES CARD — reuses cd-earnings styles with overrides */
.cd-aff-sales { background: #fff; border: 1px solid #e8e8e8; }
.cd-aff-sales-head { padding: 32px 36px 0; margin-bottom: 24px; }
.cd-aff-sales-eyebrow { font-size: 9px; letter-spacing: 0.4em; text-transform: uppercase; color: #aaa; display: flex; align-items: center; gap: 14px; margin-bottom: 10px; }
.cd-aff-sales-eyebrow::after { content: ''; width: 32px; height: 1px; background: #e8e8e8; }
.cd-aff-sales-title { font-family: 'Playfair Display', serif; font-size: 30px; font-weight: 300; color: #111; line-height: 1; }
.cd-aff-sales-hero { padding: 0 36px 28px; display: flex; align-items: flex-end; justify-content: space-between; gap: 32px; border-bottom: 1px solid #e8e8e8; }
.cd-aff-sales-stat { text-align: center; }
.cd-aff-sales-stat-label { font-size: 9px; letter-spacing: 0.22em; text-transform: uppercase; color: #aaa; margin-bottom: 6px; }
.cd-aff-sales-stat-val { font-family: 'Playfair Display', serif; font-size: 28px; font-weight: 300; color: #111; line-height: 1; }
.cd-aff-sales-orders { padding: 0 36px 28px; }
.cd-aff-sales-orders-label { font-size: 9px; letter-spacing: 0.22em; text-transform: uppercase; color: #aaa; margin: 24px 0 14px; }
.cd-aff-order-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e8e8e8; }
.cd-aff-order-row:last-child { border-bottom: none; }
.cd-aff-order-num { font-size: 12px; color: #555; }
.cd-aff-order-date { font-size: 11px; color: #aaa; }
.cd-aff-order-net { font-size: 12px; color: #555; }
.cd-aff-order-comm { font-family: 'Playfair Display', serif; font-size: 17px; color: #111; }

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
.cd-wardrobe-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: #e8e8e8; border-top: 1px solid #e8e8e8; }
.cd-wardrobe-item { background: #fff; position: relative; }
.cd-wardrobe-img { aspect-ratio: 3/4; overflow: hidden; position: relative; }
.cd-wardrobe-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
.cd-wardrobe-img-placeholder { width: 100%; height: 100%; background: #f5f5f5; display: flex; align-items: center; justify-content: center; font-size: 9px; color: #ccc; letter-spacing: 0.1em; text-transform: uppercase; }
.cd-wardrobe-info { padding: 14px 16px 18px; }
.cd-wardrobe-pills { display: flex; align-items: center; justify-content: space-between; margin-top: 10px; }
.cd-wardrobe-name { font-size: 13px; color: #111; margin-bottom: 3px; line-height: 1.3; }
.cd-wardrobe-variant { font-size: 11px; color: #aaa; font-weight: 300; margin-bottom: 10px; }
.cd-wardrobe-status { display: inline-flex; align-items: center; gap: 5px; font-size: 8.5px; letter-spacing: 0.14em; text-transform: uppercase; padding: 3px 10px; border-radius: 100px; border: 1px solid; }
.cd-status-delivered { color: #1a1a1a; border-color: #d4d4d4; background: #f5f5f5; }
.cd-status-shipped { color: #2e7d32; border-color: #d4edda; background: #f0faf0; }
.cd-status-transit { color: #1565c0; border-color: #bbdefb; background: #e3f2fd; }
.cd-status-processing { color: #e65100; border-color: #ffe0b2; background: #fff3e0; }
.cd-feedback-toggle { background: #fff; border: 1px solid #e8e8e8; padding: 4px 10px; border-radius: 100px; font-size: 9px; letter-spacing: 0.12em; text-transform: uppercase; color: #555; cursor: pointer; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; white-space: nowrap; }
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
.cd-m-topbar { padding: 0 20px; height: 64px; background: #fff; border-bottom: 1px solid #e8e8e8; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 100; }
.cd-m-logo-lockup { display: flex; flex-direction: column; align-items: center; justify-content: center; }
.cd-m-logo { height: 29px; display: block; width: fit-content; }
.cd-m-logo-sub { font-size: 8px; letter-spacing: 0.4em; text-transform: uppercase; color: #aaa; margin-top: 2px; }
.cd-m-topbar-account { display: flex; align-items: center; justify-content: center; background: none; border: none; cursor: pointer; padding: 4px; }

.cd-subtabs { display: flex; border-bottom: 1px solid #e8e8e8; margin-bottom: 20px; }
.cd-subtab { background: none; border: none; border-bottom: 2px solid transparent; padding: 12px 24px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #aaa; font-weight: 400; cursor: pointer; text-align: center; transition: all 0.15s; }
.cd-subtab.active { border-bottom-color: #1a1a1a; color: #1a1a1a; font-weight: 600; }

.cd-m-subtabs { display: flex; background: #fff; border-bottom: 1px solid #e8e8e8; position: sticky; top: 64px; z-index: 99; }
.cd-m-subtab { flex: 1; background: none; border: none; border-bottom: 2px solid transparent; padding: 12px 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #aaa; font-weight: 400; cursor: pointer; text-align: center; transition: all 0.15s; }
.cd-m-subtab.active { border-bottom-color: #1a1a1a; color: #1a1a1a; font-weight: 600; }

.cd-m-hero { padding: 16px 20px; border-bottom: 1px solid #e8e8e8; background: #fff; display: flex; flex-direction: row; align-items: center; gap: 14px; }
.cd-m-eyebrow { display: none; }
.cd-m-name { font-family: 'Playfair Display', serif; font-size: 20px; font-weight: 400; color: #111; line-height: 1.05; margin-bottom: 2px; }
.cd-m-handle { font-size: 11px; color: #aaa; margin-bottom: 6px; }
.cd-m-profile-photo { width: 48px; height: 48px; min-width: 48px; border-radius: 50%; object-fit: cover; display: block; border: 1px solid #e8e8e8; margin-bottom: 0; flex-shrink: 0; }
.cd-m-status { display: inline-flex; align-items: center; gap: 6px; border: 1px solid #e8e8e8; font-size: 9px; letter-spacing: 0.16em; text-transform: uppercase; color: #555; padding: 3px 10px; border-radius: 100px; }

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
.cd-m-progress-fill { height: 100%; background: #2e7d32; border-radius: 2px; }
.cd-m-payment { padding: 14px 20px; background: #f5f5f5; display: flex; align-items: center; justify-content: space-between; }
.cd-m-payment-left { font-size: 11px; color: #555; }
.cd-m-payment-amount { font-family: 'Playfair Display', serif; font-size: 18px; color: #111; }

/* MOBILE MOMENTUM */
.cd-m-aff-sales { background: #fff; border: 1px solid #e8e8e8; margin-bottom: 14px; }
.cd-m-aff-sales-head { padding: 20px 20px 0; margin-bottom: 16px; }
.cd-m-aff-sales-eyebrow { font-size: 9px; letter-spacing: 0.32em; text-transform: uppercase; color: #aaa; margin-bottom: 8px; }
.cd-m-aff-sales-title { font-family: 'Playfair Display', serif; font-size: 24px; font-weight: 300; color: #111; }
.cd-m-aff-sales-stats { display: flex; border-bottom: 1px solid #e8e8e8; border-top: 1px solid #e8e8e8; }
.cd-m-aff-sales-stat { flex: 1; padding: 14px 16px; border-right: 1px solid #e8e8e8; }
.cd-m-aff-sales-stat:last-child { border-right: none; }
.cd-m-aff-sales-stat-label { font-size: 8.5px; letter-spacing: 0.18em; text-transform: uppercase; color: #aaa; margin-bottom: 4px; }
.cd-m-aff-sales-stat-val { font-family: 'Playfair Display', serif; font-size: 22px; color: #111; font-weight: 300; line-height: 1; }
.cd-m-aff-sales-orders { padding: 0 20px 20px; }
.cd-m-aff-sales-orders-label { font-size: 9px; letter-spacing: 0.22em; text-transform: uppercase; color: #aaa; margin: 16px 0 10px; }
.cd-m-aff-order-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e8e8e8; }
.cd-m-aff-order-row:last-child { border-bottom: none; }
.cd-m-aff-order-left { }
.cd-m-aff-order-num { font-size: 11px; color: #555; }
.cd-m-aff-order-date { font-size: 10px; color: #aaa; }
.cd-m-aff-order-comm { font-family: 'Playfair Display', serif; font-size: 16px; color: #111; }
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
.cd-m-percentile-number { font-family: 'Playfair Display', serif; font-size: 28px; font-weight: 300; color: #111; line-height: 1; white-space: nowrap; }
.cd-m-percentile-pct { font-size: 14px; font-weight: 300; color: #999; }
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
.cd-m-ad-card { border: 1px solid #e8e8e8; flex-shrink: 0; width: 280px; overflow: hidden; }
.cd-m-ad-preview { width: 280px; height: 540px; overflow: hidden; background: #fff; display: flex; align-items: center; justify-content: center; }
.cd-m-ad-preview iframe { width: 320px; height: 620px; border: none; display: block; transform: scale(0.875); transform-origin: top left; }
.cd-m-ad-thumb { position: relative; height: 300px; width: 100%; overflow: hidden; background: #1a1a1a; }
.cd-m-ad-thumb img { width: 100%; height: 100%; object-fit: cover; object-position: center; opacity: 0.85; display: block; }
.cd-m-ad-thumb-overlay { position: absolute; bottom: 0; left: 0; right: 0; padding: 12px 16px; background: linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 100%); display: flex; align-items: flex-end; justify-content: space-between; }
.cd-m-ad-thumb-name { font-size: 12px; color: white; font-weight: 300; }
.cd-m-ad-thumb-status { font-size: 8px; letter-spacing: 0.12em; text-transform: uppercase; color: #5db075; background: rgba(0,0,0,0.4); padding: 3px 8px; border-radius: 100px; border: 1px solid rgba(93,176,117,0.4); }
.cd-m-ad-thumb-status-paused { color: #aaa; border-color: rgba(170,170,170,0.4); }
.cd-m-ad-stats-strip { display: flex; border-top: 1px solid #e8e8e8; width: 100%; min-width: 0; }
.cd-m-ad-stat { flex: 1; padding: 10px 12px; border-right: 1px solid #e8e8e8; min-width: 0; overflow: hidden; }
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
.cd-m-feedback-toggle { background: #fff; border: 1px solid #e8e8e8; padding: 3px 8px; border-radius: 100px; font-size: 8px; letter-spacing: 0.1em; text-transform: uppercase; color: #555; cursor: pointer; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; white-space: nowrap; }
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
.cd-m-tabbar-item { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; cursor: pointer; background: none; border: none; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 0; position: relative; }
.cd-m-tabbar-badge { position: absolute; top: -4px; right: 50%; margin-right: -16px; min-width: 16px; height: 16px; border-radius: 8px; background: #ef4444; color: #fff; font-size: 9px; font-weight: 600; display: flex; align-items: center; justify-content: center; padding: 0 4px; line-height: 1; }
.cd-m-tabbar-icon svg { width: 22px; height: 22px; stroke: #ccc; fill: none; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.cd-m-tabbar-item.active .cd-m-tabbar-icon svg { stroke: #111; }
.cd-m-tabbar-label { font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; color: #aaa; }
.cd-m-tabbar-item.active .cd-m-tabbar-label { color: #111; }

/* HIDE OLD MOBILE NAV */
.cd-m-bottom-nav { display: none; }

/* LOADING */
.cd-loading { display: flex; align-items: center; justify-content: center; min-height: 100vh; font-size: 12px; color: #aaa; letter-spacing: 0.15em; text-transform: uppercase; }
`

const TABS = ['ads', 'campaigns', 'wardrobe', 'submit', 'settings']
const TAB_LABELS = { wardrobe: 'Wardrobe & Orders', ads: 'Ads', campaigns: 'Campaigns', submit: 'Submit Content', settings: 'Payment Info' }
const TAB_LABELS_SHORT = { wardrobe: 'Wardrobe', ads: 'Ads', campaigns: 'Campaigns', submit: 'Submit Content', settings: 'Payment' }

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
  const [adsLoading, setAdsLoading] = useState(true)

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
  const [contentSubTab, setContentSubTab] = useState('submit') // 'submit' | 'history'
  const [notifOpen, setNotifOpen] = useState(false)
  const [lastSeenNotif, setLastSeenNotif] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('nama_notif_seen') || '1970-01-01T00:00:00Z'
    return '1970-01-01T00:00:00Z'
  })
  const [submissions, setSubmissions] = useState([])

  const [copied, setCopied] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)

  // Affiliate sales
  const [affiliateData, setAffiliateData] = useState(null) // { orders, summary }
  const [affiliateHistory, setAffiliateHistory] = useState([]) // [{ month, orders, summary }]
  const [affiliateLoading, setAffiliateLoading] = useState(false)

  // Code change request
  const [codeChangeOpen, setCodeChangeOpen] = useState(false)
  const [codeChangeInput, setCodeChangeInput] = useState('')
  const [codeChangeSubmitting, setCodeChangeSubmitting] = useState(false)
  const [codeChangeRequests, setCodeChangeRequests] = useState([])
  const [codeChangeCancelling, setCodeChangeCancelling] = useState(false)

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
  const [resubmitTarget, setResubmitTarget] = useState(null) // submission ID being resubmitted
  const [activeCampaignDetail, setActiveCampaignDetail] = useState(null) // assignment being viewed in detail
  const [campaignAccepted, setCampaignAccepted] = useState(false) // local state for Accept step
  const [campaignVariants, setCampaignVariants] = useState({}) // { [product_id]: variant[] }
  const [campaignVariantsLoading, setCampaignVariantsLoading] = useState(false)

  // Payment settings
  const [paymentEditing, setPaymentEditing] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState(null)
  const [paymentForm, setPaymentForm] = useState({ paypalEmail: '', bankName: '', bankInstitution: '', bankAccount: '', bankRouting: '' })
  const [paymentSaving, setPaymentSaving] = useState(false)
  const [paymentSaved, setPaymentSaved] = useState(false)
  const [wardrobeExpanded, setWardrobeExpanded] = useState(false)
  const [wardrobeSubTab, setWardrobeSubTab] = useState('wardrobe')

  useEffect(() => {
    async function load() {
      try {
      // Phase 1: Auth + core data (minimal, needed for page shell)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/creator/login'); return }

      const isAdmin = user.user_metadata?.role !== 'creator'
      const params = new URLSearchParams(window.location.search)
      const urlCreatorId = params.get('creator_id')
      const urlTab = params.get('tab')
      if (urlTab && ['ads', 'campaigns', 'wardrobe', 'submit', 'settings'].includes(urlTab)) {
        setActiveTab(urlTab)
      }

      let creatorData = null
      if (urlCreatorId && isAdmin) {
        // Admin viewing a specific creator's profile
        const { data } = await supabase.from('creators').select('*').eq('id', urlCreatorId).single()
        creatorData = data
      } else {
        // Creator viewing their own dashboard (ignore creator_id param for non-admins)
        const { data } = await supabase.from('creators').select('*').eq('user_id', user.id).single()
        creatorData = data
      }
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
      if (infData) setInfluencer(infData)
      if (!infData) setAdsLoading(false)

      // Phase 1 done — render the page shell immediately
      setLoading(false)

      // Phase 2: Non-blocking parallel data fetches
      // These all run concurrently and update state as they resolve
      const bgTasks = []

      // Orders (Shopify sync or DB fallback)
      if (infData) {
        bgTasks.push((async () => {
          if (infData.shopify_customer_id) {
            try {
              const syncRes = await fetch('/api/shopify/orders/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ influencer_id: infData.id, shopify_customer_id: infData.shopify_customer_id }),
              })
              const syncData = await syncRes.json()
              if (syncData.orders) setOrders(syncData.orders)
            } catch {
              const { data: orderData } = await supabase.from('influencer_orders').select('*').eq('influencer_id', infData.id).order('order_date', { ascending: false })
              setOrders(orderData || [])
            }
          } else {
            const { data: orderData } = await supabase.from('influencer_orders').select('*').eq('influencer_id', infData.id).order('order_date', { ascending: false })
            setOrders(orderData || [])
          }
        })())
      }

      // Meta ads
      if (!infData?.instagram_handle) {
        setAdsLoading(false)
      }
      if (infData?.instagram_handle) {
        bgTasks.push((async () => {
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
        })())
      }

      // Code change requests
      if (inviteData?.has_affiliate) {
        bgTasks.push((async () => {
          try {
            const ccRes = await fetch('/api/creator/code-change-request')
            const ccData = await ccRes.json()
            setCodeChangeRequests(ccData.requests || [])
          } catch {}
        })())
      }

      // Affiliate sales
      if (inviteData?.has_affiliate && creatorData.affiliate_code) {
        setAffiliateLoading(true)
        bgTasks.push((async () => {
          try {
            const now = new Date()
            const rate = creatorData.commission_rate || inviteData.ad_spend_percentage || 10
            const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

            // Fetch current month + last 3 months in parallel
            const months = [currentMonth]
            for (let i = 1; i <= 3; i++) {
              const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
              months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
            }

            const results = await Promise.all(
              months.map(m =>
                fetch(`/api/shopify/affiliate-orders?discount_code=${encodeURIComponent(creatorData.affiliate_code)}&month=${m}&commission_rate=${rate}`)
                  .then(r => r.json())
                  .catch(() => null)
              )
            )

            if (results[0]) setAffiliateData(results[0])
            setAffiliateHistory(
              results.slice(1).filter(Boolean).map((r, i) => ({ month: months[i + 1], ...r }))
            )
          } catch (err) {
            console.error('Failed to fetch affiliate data:', err)
          }
          setAffiliateLoading(false)
        })())
      }

      // Past requests + submissions + campaigns in parallel
      bgTasks.push((async () => {
        const [reqResult, subResult] = await Promise.all([
          supabase.from('creator_sample_requests').select('*').eq('creator_id', creatorData.id).order('created_at', { ascending: false }),
          supabase.from('creator_content_submissions').select('*').eq('creator_id', creatorData.id).order('created_at', { ascending: false }),
        ])
        setPastRequests(reqResult.data || [])
        setSubmissions(subResult.data || [])
      })())

      bgTasks.push((async () => {
        try {
          const campRes = await fetch(`/api/creator/campaigns?creator_id=${creatorData.id}`)
          const campData = await campRes.json()
          setCampaignAssignments(campData.assignments || [])
        } catch {}
      })())

      // Fire all background tasks (don't await — they update state independently)
      Promise.all(bgTasks).catch(() => {})
      } catch (err) {
        console.error('Creator dashboard load error:', err)
        setLoading(false)
      }
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
      map[p.product_id].variants.push({ variant_id: p.variant_id, variant_title: p.variant_title, sku: p.sku, price: p.price, inventory: p.inventory ?? 0 })
    }
    return Object.values(map)
  }

  function getDefaultSize(product) {
    const inStockVariants = product.variants.filter(v => v.variant_title && (v.inventory || 0) > 0)
    const sizes = inStockVariants.map(v => v.variant_title)
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
    if (!influencer?.id) {
      alert('No linked influencer profile found. Please contact Nama support.')
      return
    }
    setContentSubmitting(true)
    setContentProgress(0)
    try {
      const totalSize = contentFiles.reduce((s, f) => s + f.size, 0)
      let uploaded = 0
      const uploadedFiles = []

      for (let i = 0; i < contentFiles.length; i++) {
        const file = contentFiles[i]
        // Step 1: Upload to Supabase Storage (supports large files from client)
        const storagePath = `submissions/${creator.id}/${Date.now()}-${file.name}`
        const { error: storageErr } = await supabase.storage
          .from('creator-uploads')
          .upload(storagePath, file, { cacheControl: '3600', upsert: false })
        if (storageErr) throw new Error(`Storage upload failed for ${file.name}: ${storageErr.message}`)
        setContentProgress(Math.round(((i + 1) / contentFiles.length) * 50)) // 0-50% for uploads

        uploadedFiles.push({
          name: file.name,
          storage_path: storagePath,
          mime_type: file.type,
          size: file.size,
        })
      }

      setContentProgress(60) // Files uploaded, now processing
      // Step 2: Tell server to move files from Storage to Google Drive and create submission
      const res = await fetch('/api/creator/submit-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: contentMonth,
          notes: contentNotes.trim() || null,
          campaign_assignment_id: campaignContentTarget || null,
          files: uploadedFiles,
          influencer_id: influencer.id,
          submission_id: resubmitTarget || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to save submission')
      }
      const result = await res.json()

      setContentSuccess({ folderUrl: result.submission?.drive_folder_url })
      setContentFiles([])
      setContentNotes('')
      setCampaignContentTarget(null)
      setResubmitTarget(null)
      const { data } = await supabase.from('creator_content_submissions').select('*').eq('creator_id', creator.id).order('created_at', { ascending: false })
      setSubmissions(data || [])
      try {
        const campRes = await fetch(`/api/creator/campaigns?creator_id=${creator.id}`)
        const campData = await campRes.json()
        setCampaignAssignments(campData.assignments || [])
      } catch {}
    } catch (err) {
      console.error('Submit content error:', err)
      alert('Content upload failed: ' + (err.message || 'Unknown error'))
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
    navigator.clipboard.writeText(`namaclo.com/discount/${code}`)
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 1500)
  }

  async function submitCodeChange() {
    if (!codeChangeInput || codeChangeInput.length < 4) return
    setCodeChangeSubmitting(true)
    try {
      const res = await fetch('/api/creator/code-change-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requested_code: codeChangeInput }),
      })
      const data = await res.json()
      if (res.ok) {
        setCodeChangeOpen(false)
        setCodeChangeInput('')
        const ccRes = await fetch('/api/creator/code-change-request')
        const ccData = await ccRes.json()
        setCodeChangeRequests(ccData.requests || [])
      } else {
        alert(data.error || 'Failed to submit request')
      }
    } catch (err) {
      console.error('Code change request error:', err)
    }
    setCodeChangeSubmitting(false)
  }

  async function cancelCodeChange(requestId) {
    setCodeChangeCancelling(true)
    try {
      await fetch(`/api/creator/code-change-request?id=${requestId}`, { method: 'DELETE' })
      const ccRes = await fetch('/api/creator/code-change-request')
      const ccData = await ccRes.json()
      setCodeChangeRequests(ccData.requests || [])
    } catch {}
    setCodeChangeCancelling(false)
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
  const hasAffiliate = invite?.has_affiliate === true
  const commissionRate = hasAffiliate ? (invite?.commission_rate || creator?.commission_rate || 0) : 0
  const videosPerMonth = invite?.videos_per_month || '—'
  const affiliateCode = creator?.affiliate_code || ''
  const adsRunning = ads.filter(a => a.status === 'ACTIVE').length

  // --- SHARED SECTION RENDERERS ---


  function getStatusInfo(fulfillmentStatus, deliveryStatus) {
    if (deliveryStatus === 'delivered') return { label: 'Delivered', cls: 'delivered' }
    if (deliveryStatus === 'in_transit') return { label: 'In Transit', cls: 'transit' }
    if (deliveryStatus === 'out_for_delivery') return { label: 'Out for Delivery', cls: 'transit' }
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
          deliveryStatus: order.delivery_status,
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
    const visibleItems = wardrobeExpanded ? allItems : allItems.slice(0, 4)
    const hasMore = allItems.length > 4

    return (
      <div>
        <div className={`${p}wardrobe-grid`}>
        {visibleItems.map(item => {
          const s = status(item.fulfillmentStatus, item.deliveryStatus)
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
              <div className={`${p}wardrobe-info`}>
                <div className={`${p}wardrobe-name`}>{item.productName}</div>
                {item.variantTitle && <div className={`${p}wardrobe-variant`}>{item.variantTitle}</div>}
                <div className="cd-wardrobe-pills">
                  <div className={`cd-wardrobe-status cd-status-${s.cls}`}>● {s.label}</div>
                  <button
                    className={mobile ? 'cd-m-feedback-toggle' : 'cd-feedback-toggle'}
                    onClick={() => setFeedbackOpen(prev => ({ ...prev, [item.key]: !prev[item.key] }))}
                  >
                    {isDone ? '✓ Done' : isOpen ? '− Close' : '+ Feedback'}
                  </button>
                </div>
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
        {hasMore && !wardrobeExpanded && (
          <div style={{ textAlign: 'center', padding: mobile ? '16px 20px' : '20px 36px' }}>
            <button className="cd-load-more" onClick={() => setWardrobeExpanded(true)}>
              Load More ({allItems.length - 4} more)
            </button>
          </div>
        )}
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
            const s = getStatusInfo(order.fulfillment_status, order.delivery_status)
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
          const s = getStatusInfo(order.fulfillment_status, order.delivery_status)
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
              const sizeVariants = product.variants.filter(v => v.variant_title)
              const sizes = sizeVariants.map(v => v.variant_title)
              const hasSizes = sizes.length > 0
              const oosSet = new Set(sizeVariants.filter(v => (v.inventory || 0) <= 0).map(v => v.variant_title))
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
                        {sizes.map(size => {
                          const isOos = oosSet.has(size)
                          return (
                            <button
                              key={size}
                              className={`cd-size-pill${currentSize === size ? ' selected' : ''}${isOos ? ' oos' : ''}`}
                              disabled={isOos}
                              onClick={e => { if (isOos) return; e.stopPropagation(); setSelectedSizes(prev => ({ ...prev, [product.product_id]: size })); setSizePrompts(prev => ({ ...prev, [product.product_id]: false })) }}
                            >{size}</button>
                          )
                        })}
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
    if (!invite?.has_ad_spend) return null

    // Skeleton while ads data is loading
    if (adsLoading) {
      if (mobile) {
        return (
          <div className="cd-m-earnings">
            <div className="cd-m-earnings-head">
              <div className="cd-m-earnings-eyebrow">Ad Spend Commission</div>
              <div className="cd-m-earnings-title">Your Earnings</div>
            </div>
            <div className="cd-m-earnings-hero">
              <div className="cd-skel cd-skel-stat-lg" style={{ marginBottom: 8 }} />
              <div className="cd-skel cd-skel-line-sm" />
            </div>
            <div className="cd-m-earnings-proj" style={{ padding: '14px 20px' }}>
              <div className="cd-skel cd-skel-stat" />
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
          </div>
          <div className="cd-earnings-hero">
            <div>
              <div className="cd-skel cd-skel-line-sm" style={{ marginBottom: 12 }} />
              <div className="cd-skel cd-skel-stat-lg" style={{ width: 120, height: 60 }} />
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="cd-skel cd-skel-stat" style={{ marginLeft: 'auto' }} />
            </div>
          </div>
          <div className="cd-progress-wrap">
            <div className="cd-skel cd-skel-line" style={{ width: '100%', height: 3 }} />
          </div>
        </div>
      )
    }

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

  function renderCodeChangeSection() {
    const pendingReq = codeChangeRequests.find(r => r.status === 'pending')
    const lastRejected = codeChangeRequests.find(r => r.status === 'rejected')
    const isLive = invite?.shopify_code_status === 'active'

    if (pendingReq) {
      return (
        <div className="cd-code-change-pending">
          You have a pending request for <span className="cd-code-change-pending-code">{pendingReq.requested_code}</span> — we&apos;ll review within 24 hours.
          <button className="cd-code-change-pending-cancel" onClick={() => cancelCodeChange(pendingReq.id)} disabled={codeChangeCancelling}>
            {codeChangeCancelling ? 'Cancelling…' : 'Cancel Request'}
          </button>
        </div>
      )
    }

    return (
      <>
        {lastRejected && !pendingReq && (
          <div className="cd-code-change-rejected">
            Your request for &quot;{lastRejected.requested_code}&quot; was declined{lastRejected.admin_notes ? `: ${lastRejected.admin_notes}` : '.'}
          </div>
        )}
        {isLive && !codeChangeOpen && (
          <button className="cd-code-change-link" onClick={() => setCodeChangeOpen(true)}>
            Request a different code →
          </button>
        )}
        {codeChangeOpen && (
          <div className="cd-code-change-form">
            <div className="cd-code-change-label">Your Preferred Code</div>
            <input
              className="cd-code-change-input"
              placeholder="e.g. CHARLENE15"
              maxLength={20}
              value={codeChangeInput}
              onChange={e => setCodeChangeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            />
            <div className="cd-code-change-note">Subject to approval. Your current code stays active until we make the switch.</div>
            <div className="cd-code-change-actions">
              <button
                className="cd-code-change-submit"
                onClick={submitCodeChange}
                disabled={codeChangeSubmitting || codeChangeInput.length < 4}
              >
                {codeChangeSubmitting ? 'Submitting…' : 'Submit Request'}
              </button>
              <button className="cd-code-change-cancel" onClick={() => { setCodeChangeOpen(false); setCodeChangeInput('') }}>Cancel</button>
            </div>
          </div>
        )}
      </>
    )
  }

  function renderAffiliateSales(mobile) {
    if (!invite?.has_affiliate) return null
    if (affiliateLoading) return <div style={{ fontSize: 12, color: '#aaa', padding: '20px 0' }}>Loading affiliate data…</div>
    if (!affiliateData?.summary) return null

    const s = affiliateData.summary
    const rate = s.commission_rate * 100
    const recentOrders = (affiliateData.orders || []).slice(0, 5)

    const now = new Date()
    const monthName = now.toLocaleString('en', { month: 'long', year: 'numeric' })

    // Progress milestone
    const milestone = Math.ceil((s.commission_owed + 1) / 250) * 250
    const progress = milestone > 0 ? Math.min((s.commission_owed / milestone) * 100, 100) : 0
    const remaining = milestone - s.commission_owed

    if (mobile) {
      return (
        <div className="cd-m-aff-sales">
          <div className="cd-m-aff-sales-head">
            <div className="cd-m-aff-sales-eyebrow">Affiliate Sales</div>
            <div className="cd-m-aff-sales-title">Your Code</div>
          </div>
          <div className="cd-m-aff-sales-stats">
            <div className="cd-m-aff-sales-stat">
              <div className="cd-m-aff-sales-stat-label">Orders</div>
              <div className="cd-m-aff-sales-stat-val">{s.order_count}</div>
            </div>
            <div className="cd-m-aff-sales-stat">
              <div className="cd-m-aff-sales-stat-label">Net Sales</div>
              <div className="cd-m-aff-sales-stat-val">${s.total_net.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
            </div>
            <div className="cd-m-aff-sales-stat">
              <div className="cd-m-aff-sales-stat-label">Earned</div>
              <div className="cd-m-aff-sales-stat-val">${s.commission_owed.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
            </div>
          </div>
          <div className="cd-m-progress" style={{ padding: '14px 20px' }}>
            <div className="cd-m-progress-header">
              <span className="cd-m-progress-label">Progress to ${milestone}</span>
              <span className="cd-m-progress-val">${Math.round(s.commission_owed)} of ${milestone}</span>
            </div>
            <div className="cd-m-progress-track"><div className="cd-m-progress-fill" style={{ width: `${progress}%` }} /></div>
          </div>
          {recentOrders.length > 0 && (
            <div className="cd-m-aff-sales-orders">
              <div className="cd-m-aff-sales-orders-label">Recent Orders</div>
              {recentOrders.map((o, i) => (
                <div key={i} className="cd-m-aff-order-row">
                  <div className="cd-m-aff-order-left">
                    <div className="cd-m-aff-order-num">#{o.order_number}</div>
                    <div className="cd-m-aff-order-date">{new Date(o.created_at).toLocaleDateString()}</div>
                  </div>
                  <div className="cd-m-aff-order-comm">${(o.net_amount * s.commission_rate).toFixed(2)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )
    }

    return (
      <div className="cd-aff-sales">
        <div className="cd-aff-sales-head">
          <div className="cd-aff-sales-eyebrow">Affiliate Sales</div>
          <div className="cd-aff-sales-title">Your Code</div>
        </div>
        <div className="cd-aff-sales-hero">
          <div className="cd-aff-sales-stat">
            <div className="cd-aff-sales-stat-label">{monthName} Orders</div>
            <div className="cd-aff-sales-stat-val">{s.order_count}</div>
          </div>
          <div className="cd-aff-sales-stat">
            <div className="cd-aff-sales-stat-label">Gross Sales</div>
            <div className="cd-aff-sales-stat-val">${s.total_gross.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          </div>
          <div className="cd-aff-sales-stat">
            <div className="cd-aff-sales-stat-label">Net Sales</div>
            <div className="cd-aff-sales-stat-val">${s.total_net.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          </div>
          <div className="cd-aff-sales-stat">
            <div className="cd-aff-sales-stat-label">Your Earnings</div>
            <div className="cd-aff-sales-stat-val">${s.commission_owed.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          </div>
        </div>
        <div className="cd-progress-wrap">
          <div className="cd-progress-header">
            <span className="cd-progress-label">Progress to ${milestone} milestone</span>
            <span className="cd-progress-val">${Math.round(s.commission_owed).toLocaleString()} of ${milestone.toLocaleString()}</span>
          </div>
          <div className="cd-progress-track"><div className="cd-progress-fill" style={{ width: `${progress}%` }} /></div>
          <div className="cd-progress-note">${remaining.toLocaleString()} away.</div>
        </div>
        {affiliateHistory.length > 0 && (
          <div className="cd-breakdown">
            <div className="cd-breakdown-label">Monthly History</div>
            <div>
              {affiliateHistory.map((h, i) => {
                const hs = h.summary || {}
                const hEarned = hs.commission_owed || 0
                const maxEarned = Math.max(...affiliateHistory.map(x => x.summary?.commission_owed || 0))
                const barPct = maxEarned > 0 ? (hEarned / maxEarned) * 100 : 0
                const mDate = new Date(h.month + '-01')
                const mLabel = mDate.toLocaleString('en', { month: 'long', year: 'numeric' })
                return (
                  <div key={i} className="cd-breakdown-row">
                    <div><span className="cd-breakdown-month">{mLabel}</span></div>
                    <div className="cd-breakdown-right">
                      <span className="cd-breakdown-spend">{hs.order_count || 0} orders</span>
                      <div className="cd-breakdown-bar-wrap"><div className="cd-breakdown-bar" style={{ width: `${barPct}%` }} /></div>
                      <span className="cd-breakdown-earned">${Math.round(hEarned).toLocaleString()}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
        {recentOrders.length > 0 && (
          <div className="cd-aff-sales-orders">
            <div className="cd-aff-sales-orders-label">Recent Orders</div>
            {recentOrders.map((o, i) => (
              <div key={i} className="cd-aff-order-row">
                <div>
                  <span className="cd-aff-order-num">#{o.order_number}</span>
                  <span className="cd-aff-order-date" style={{ marginLeft: 12 }}>{new Date(o.created_at).toLocaleDateString()}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                  <span className="cd-aff-order-net">${o.net_amount.toFixed(2)} net</span>
                  <span className="cd-aff-order-comm">${(o.net_amount * s.commission_rate).toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  function renderMomentum(mobile) {
    const showSpendData = !!invite?.has_ad_spend

    if (adsLoading) {
      if (mobile) {
        return (
          <div className="cd-m-momentum">
            <div className="cd-m-momentum-head">
              <div className="cd-m-momentum-eyebrow">Paid Media</div>
              <div className="cd-m-momentum-title">Live Ads</div>
            </div>
            {showSpendData && (
              <div className="cd-m-momentum-stats">
                <div className="cd-m-momentum-stat"><div className="cd-m-momentum-stat-label">Spent</div><div className="cd-skel cd-skel-stat" /></div>
                <div className="cd-m-momentum-stat"><div className="cd-m-momentum-stat-label">Impressions</div><div className="cd-skel cd-skel-stat" /></div>
                <div className="cd-m-momentum-stat"><div className="cd-m-momentum-stat-label">Active</div><div className="cd-skel cd-skel-stat" /></div>
              </div>
            )}
            <div style={{ padding: 20 }}>
              <div className="cd-skel" style={{ width: '100%', height: 200, borderRadius: 0 }}>
                <div className="cd-skel-ad"><div className="cd-skel-spinner" /></div>
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
          {showSpendData && (
            <div className="cd-momentum-top">
              <div className="cd-momentum-stat"><div className="cd-momentum-stat-label">Total Spend</div><div className="cd-skel cd-skel-stat" style={{ marginTop: 4 }} /></div>
              <div className="cd-momentum-stat"><div className="cd-momentum-stat-label">Total Impressions</div><div className="cd-skel cd-skel-stat" style={{ marginTop: 4 }} /></div>
              <div className="cd-momentum-stat"><div className="cd-momentum-stat-label">Active Ads</div><div className="cd-skel cd-skel-stat" style={{ marginTop: 4 }} /></div>
            </div>
          )}
          <div className="cd-ads-section">
            <div className="cd-ads-section-label">Your Ads</div>
            <div className="cd-ads-row">
              <div className="cd-ad-card">
                <div className="cd-ad-preview">
                  <div className="cd-skel-ad"><div className="cd-skel-spinner" /></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )
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
          {showSpendData && (
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
          )}
          {showSpendData && (
            <div className="cd-m-percentile">
              <div>
                <div className="cd-m-percentile-headline">Your content is in the {percentile.label}.</div>
                <div className="cd-m-percentile-sub">Nama is scaling spend on your videos.</div>
              </div>
              <div>
                <span className="cd-m-percentile-number">Top {percentile.rank}</span><span className="cd-m-percentile-pct">%</span>
                <div className="cd-m-percentile-sub" style={{ textAlign: 'left', marginTop: '3px' }}>of Nama creators</div>
              </div>
            </div>
          )}
          {showSpendData && (
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
          )}
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
                    {showSpendData && (
                      <div className="cd-m-ad-stats-strip">
                        <div className="cd-m-ad-stat"><div className="cd-m-ad-stat-l">Spent</div><div className="cd-m-ad-stat-v">{formatSpend(ad.spend)}</div></div>
                        <div className="cd-m-ad-stat"><div className="cd-m-ad-stat-l">Impressions</div><div className="cd-m-ad-stat-v">{formatImpressions(ad.impressions)}</div></div>
                        <div className="cd-m-ad-stat"><div className="cd-m-ad-stat-l">Performance</div><div style={{ marginTop: 4 }}>{getScorePill(ad.spend, true)}</div></div>
                      </div>
                    )}
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
        {showSpendData && (
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
        )}
        {showSpendData && (
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
        )}
        {showSpendData && (
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
        )}
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
                  {showSpendData && (
                    <div className="cd-ad-stats-strip">
                      <div className="cd-ad-stat"><div className="cd-ad-stat-l">Total Spent</div><div className="cd-ad-stat-v">${parseFloat(ad.spend).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div></div>
                      <div className="cd-ad-stat"><div className="cd-ad-stat-l">Impressions</div><div className="cd-ad-stat-v">{formatImpressions(ad.impressions)}</div></div>
                      <div className="cd-ad-stat"><div className="cd-ad-stat-l">Performance</div><div style={{ marginTop: 4 }}>{getScorePill(ad.spend, false)}</div></div>
                    </div>
                  )}
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
      sent: { label: 'New Invite', cls: 'cd-campaign-status-sent' },
      confirmed: { label: 'Selects coming', cls: 'cd-campaign-status-confirmed' },
      content_submitted: { label: 'Under review', cls: 'cd-campaign-status-content' },
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

  async function fetchCampaignVariants(products) {
    if (!products?.length) return
    setCampaignVariantsLoading(true)
    const variantMap = {}
    for (const p of products) {
      try {
        const res = await fetch(`/api/shopify/products?query=${encodeURIComponent(p.product_title)}`)
        const data = await res.json()
        const allVariants = data.products || []
        // Group by product_id, find matching product
        const grouped = {}
        for (const v of allVariants) {
          if (!grouped[v.product_id]) grouped[v.product_id] = []
          grouped[v.product_id].push(v)
        }
        // Find the best match by title
        let bestMatch = null
        for (const [pid, variants] of Object.entries(grouped)) {
          if (variants[0]?.title?.toLowerCase() === p.product_title?.toLowerCase()) {
            bestMatch = variants
            break
          }
        }
        if (!bestMatch && Object.keys(grouped).length > 0) {
          bestMatch = Object.values(grouped)[0]
        }
        if (bestMatch) {
          const pid = p.product_id || bestMatch[0]?.product_id
          variantMap[pid] = bestMatch
        }
      } catch {}
    }
    setCampaignVariants(variantMap)
    setCampaignVariantsLoading(false)
  }

  function getCampaignStep(assignment) {
    if (assignment.status === 'complete') return 4
    if (assignment.status === 'content_submitted' || assignment.status === 'confirmed') return 3
    if (assignment.status === 'sent' && campaignAccepted) return 2
    return 1
  }

  function renderCampaignSteps(currentStep) {
    const steps = [
      { num: 1, label: 'Accept' },
      { num: 2, label: 'Selects' },
      { num: 3, label: 'Order & Content' },
      { num: 4, label: 'Complete' },
    ]
    return (
      <div className="cd-camp-steps">
        {steps.map(s => {
          let cls = 'cd-camp-step'
          if (s.num === currentStep) cls += ' active'
          else if (s.num < currentStep) cls += ' completed'
          return (
            <div key={s.num} className={cls}>
              <div className="cd-camp-step-num">{s.num < currentStep ? '✓' : s.num}</div>
              {s.label}
            </div>
          )
        })}
      </div>
    )
  }

  function renderCampaignDetail(mobile) {
    const assignment = activeCampaignDetail
    if (!assignment) return null
    const campaign = assignment.campaign
    if (!campaign) return null

    const currentStep = getCampaignStep(assignment)
    const products = campaign.available_products || []
    const maxSelects = campaign.max_selects || 2
    const dueDate = campaign.due_date ? new Date(campaign.due_date + 'T00:00:00').toLocaleDateString('en', { month: 'long', day: 'numeric' }) : null
    const goLiveDate = campaign.go_live_date ? new Date(campaign.go_live_date + 'T00:00:00').toLocaleDateString('en', { month: 'long', day: 'numeric' }) : null
    const statusInfo = getCampaignStatusInfo(assignment.status)
    const matchingOrder = assignment.order_id ? orders.find(o => String(o.shopify_order_id) === String(assignment.order_id) || String(o.id) === String(assignment.order_id)) : null

    return (
      <div className="cd-camp-detail">
        <button className="cd-camp-back" onClick={() => { setActiveCampaignDetail(null); setCampaignAccepted(false); setCampaignVariants({}); }}>
          ← Back to Campaigns
        </button>

        {renderCampaignSteps(currentStep)}

        {campaign.banner_image?.url && (
          <img src={campaign.banner_image.url} alt="" className="cd-camp-banner" />
        )}

        <div className="cd-campaign-title" style={{ fontSize: mobile ? 24 : 28, marginBottom: 12 }}>{campaign.title}</div>

        <div className="cd-campaign-meta" style={{ marginBottom: 16 }}>
          <span className={`cd-campaign-status ${statusInfo.cls}`}>{statusInfo.label}</span>
          {goLiveDate && <span className="cd-camp-go-live">Goes live {goLiveDate}</span>}
          {dueDate && <span className="cd-campaign-due">Content due {dueDate}</span>}
        </div>

        {campaign.description && <div style={{ fontSize: 13, color: '#666', lineHeight: 1.7, marginBottom: 20 }}>{campaign.description}</div>}

        {campaign.deliverables && (
          <div className="cd-camp-deliverables">
            <div className="cd-camp-deliverables-label">What We're Looking For</div>
            <div className="cd-camp-deliverables-text">{campaign.deliverables}</div>
          </div>
        )}

        {campaign.brief_url && (
          <a href={campaign.brief_url} target="_blank" rel="noopener noreferrer" className="cd-campaign-brief-link" style={{ marginBottom: 20, display: 'inline-flex' }}>
            View brief →
          </a>
        )}

        {/* Step 1: Accept */}
        {currentStep === 1 && (
          <div>
            <div className="cd-camp-deliverables" style={{ marginBottom: 20 }}>
              <div className="cd-camp-deliverables-label">Your Selects</div>
              <div className="cd-camp-deliverables-text">You can choose up to {maxSelects} {maxSelects === 1 ? 'style' : 'styles'}</div>
            </div>

            <button
              className="cd-campaign-btn-fill"
              style={{ marginBottom: 28 }}
              onClick={() => {
                setCampaignAccepted(true)
                fetchCampaignVariants(products)
              }}
            >
              Accept Campaign
            </button>

            {products.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div className="cd-camp-deliverables-label" style={{ marginBottom: 14 }}>Style Previews</div>
                <div className="cd-products">
                  {products.map((p, i) => (
                    <div key={i} className="cd-product" style={{ cursor: 'default' }}>
                      <div className="cd-product-img">
                        {p.image_url ? <img src={p.image_url} alt={p.product_title} /> : <div style={{ color: '#ccc', fontSize: 12 }}>No image</div>}
                      </div>
                      <div className="cd-product-info">
                        <div className="cd-product-name">{p.product_title}</div>
                        {p.variant_title && <div className="cd-product-variant">{p.variant_title}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Make Your Selects */}
        {currentStep === 2 && (
          <div>
            <div className="cd-camp-deliverables-label" style={{ marginBottom: 14 }}>Make Your Selects</div>
            <div className="cd-campaign-max">Select up to {maxSelects} item{maxSelects !== 1 ? 's' : ''}</div>

            {campaignVariantsLoading ? (
              <div style={{ padding: '20px 0', fontSize: 12, color: '#aaa' }}>Loading products...</div>
            ) : (
              <div className="cd-products" style={{ marginTop: 12 }}>
                {products.map((p, i) => {
                  const pid = p.product_id || i
                  const variants = campaignVariants[pid] || []
                  const selects = campaignSelects[assignment.id]?.products || []
                  const selectedProduct = selects.find(s => String(s.product_id) === String(pid) || s.product_title === p.product_title)
                  const selectedSize = campaignSelects[assignment.id]?.sizes?.[pid]

                  return (
                    <div key={i} className={`cd-product${selectedProduct ? ' selected' : ''}`} style={{ cursor: 'default', borderColor: selectedProduct ? '#1a1a1a' : undefined }}>
                      <div className="cd-product-img">
                        {p.image_url ? <img src={p.image_url} alt={p.product_title} /> : <div style={{ color: '#ccc', fontSize: 12 }}>No image</div>}
                      </div>
                      <div className="cd-product-info">
                        <div className="cd-product-name">{p.product_title}</div>
                        {variants.length > 0 && (
                          <div className="cd-size-row">
                            {variants.map(v => {
                              if (!v.variant_title) return null
                              const isOos = (v.inventory ?? 0) <= 0
                              const isSelected = selectedSize === v.variant_title
                              return (
                                <button
                                  key={v.variant_id}
                                  className={`cd-size-pill${isSelected ? ' selected' : ''}${isOos ? ' oos' : ''}`}
                                  disabled={isOos}
                                  onClick={() => {
                                    if (isOos) return
                                    // Select this product with this size
                                    setCampaignSelects(prev => {
                                      const current = prev[assignment.id] || { products: [], sizes: {} }
                                      const existingIdx = current.products.findIndex(s => String(s.product_id) === String(pid) || s.product_title === p.product_title)
                                      let updatedProducts = [...current.products]
                                      let updatedSizes = { ...current.sizes }

                                      if (isSelected) {
                                        // Deselect
                                        if (existingIdx >= 0) updatedProducts.splice(existingIdx, 1)
                                        delete updatedSizes[pid]
                                      } else {
                                        const productEntry = {
                                          variant_id: String(v.variant_id),
                                          product_id: String(pid),
                                          product_title: p.product_title,
                                          variant_title: v.variant_title,
                                          image_url: p.image_url,
                                        }
                                        if (existingIdx >= 0) {
                                          updatedProducts[existingIdx] = productEntry
                                        } else {
                                          if (updatedProducts.length >= maxSelects) return prev
                                          updatedProducts.push(productEntry)
                                        }
                                        updatedSizes[pid] = v.variant_title
                                      }
                                      return { ...prev, [assignment.id]: { products: updatedProducts, sizes: updatedSizes } }
                                    })
                                  }}
                                >
                                  {v.variant_title}
                                </button>
                              )
                            })}
                          </div>
                        )}
                        {!variants.length && (
                          <button
                            className={`cd-product-cta${selectedProduct ? ' added' : ''}`}
                            onClick={() => {
                              if (selectedProduct) {
                                setCampaignSelects(prev => {
                                  const current = prev[assignment.id] || { products: [], sizes: {} }
                                  return { ...prev, [assignment.id]: { ...current, products: current.products.filter(s => s.product_title !== p.product_title) } }
                                })
                              } else {
                                setCampaignSelects(prev => {
                                  const current = prev[assignment.id] || { products: [], sizes: {} }
                                  if (current.products.length >= maxSelects) return prev
                                  return { ...prev, [assignment.id]: { ...current, products: [...current.products, { variant_id: p.variant_id || `p-${i}`, product_id: String(pid), product_title: p.product_title, variant_title: p.variant_title, image_url: p.image_url }] } }
                                })
                              }
                            }}
                          >
                            {selectedProduct ? 'Selected' : 'Select'}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Cart summary */}
            {(campaignSelects[assignment.id]?.products?.length > 0) && (
              <div className="cd-cart" style={{ marginTop: 20 }}>
                <div className="cd-cart-left">
                  <div className="cd-cart-label">Your Selects ({campaignSelects[assignment.id].products.length}/{maxSelects})</div>
                  {campaignSelects[assignment.id].products.map((p, i) => (
                    <div key={i} className="cd-cart-item">
                      <span>{p.product_title}{p.variant_title ? ` — ${p.variant_title}` : ''}</span>
                      <button className="cd-cart-remove" onClick={() => {
                        setCampaignSelects(prev => {
                          const current = prev[assignment.id] || { products: [], sizes: {} }
                          const updatedSizes = { ...current.sizes }
                          if (p.product_id) delete updatedSizes[p.product_id]
                          return { ...prev, [assignment.id]: { products: current.products.filter((_, j) => j !== i), sizes: updatedSizes } }
                        })
                      }}>Remove</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="cd-campaign-notes" style={{ marginBottom: 12 }}>
              <input
                className="cd-field-input"
                value={campaignNotes[assignment.id] || ''}
                onChange={e => setCampaignNotes(prev => ({ ...prev, [assignment.id]: e.target.value }))}
                placeholder="Notes (optional)"
              />
            </div>
            <button
              className="cd-campaign-btn-fill"
              onClick={async () => {
                await confirmCampaignSelects(assignment)
                // Refresh the detail view with updated assignment
                const campRes = await fetch(`/api/creator/campaigns?creator_id=${creator.id}`)
                const campData = await campRes.json()
                const updated = (campData.assignments || []).find(a => a.id === assignment.id)
                if (updated) setActiveCampaignDetail(updated)
              }}
              disabled={!(campaignSelects[assignment.id]?.products?.length) || campaignConfirming === assignment.id}
            >
              {campaignConfirming === assignment.id ? 'Confirming...' : 'Confirm Selects'}
            </button>
          </div>
        )}

        {/* Step 3: Order & Content */}
        {currentStep === 3 && (
          <div>
            {/* Order section */}
            <div className="cd-camp-deliverables-label" style={{ marginBottom: 14 }}>Order Status</div>
            {matchingOrder ? (
              <div className="cd-order-row" style={{ background: '#fff', border: '1px solid #e8e8e8', padding: '16px 20px', marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>Order #{matchingOrder.shopify_order_number || matchingOrder.shopify_order_id}</div>
                  <span className={`cd-campaign-status ${matchingOrder.fulfillment_status === 'fulfilled' ? 'cd-campaign-status-complete' : 'cd-campaign-status-confirmed'}`}>
                    {matchingOrder.fulfillment_status || 'Processing'}
                  </span>
                </div>
                {matchingOrder.line_items?.map((li, j) => (
                  <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12, color: '#555' }}>
                    {li.image_url && <img src={li.image_url} alt="" style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 4 }} />}
                    <span>{li.product_name || li.title}{li.variant_title ? ` — ${li.variant_title}` : ''}</span>
                  </div>
                ))}
                {matchingOrder.tracking_url && (
                  <a href={matchingOrder.tracking_url} target="_blank" rel="noopener noreferrer" className="cd-campaign-brief-link" style={{ marginTop: 8 }}>
                    Track shipment →
                  </a>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: '#aaa', marginBottom: 20, padding: '16px 20px', border: '1px solid #e8e8e8' }}>
                Your order is being prepared.
              </div>
            )}

            {/* Selected products */}
            {assignment.selected_products?.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div className="cd-camp-deliverables-label" style={{ marginBottom: 8 }}>Your Selects</div>
                {renderProductChips(assignment.selected_products, assignment.id, false, 0)}
              </div>
            )}

            {/* Submit Content */}
            <div className="cd-camp-deliverables-label" style={{ marginBottom: 14 }}>Submit Content</div>
            <button
              className="cd-campaign-btn-outline"
              style={{ marginTop: 0 }}
              onClick={() => { setActiveTab('submit'); setCampaignContentTarget(assignment.id); setActiveCampaignDetail(null); }}
            >
              Submit Content →
            </button>

            {assignment.status === 'content_submitted' && (
              <div className="cd-campaign-confirm-msg" style={{ marginTop: 12 }}>Content submitted — under review.</div>
            )}
          </div>
        )}

        {/* Step 4: Complete */}
        {currentStep === 4 && (
          <div>
            <div style={{ background: '#f0fdf4', border: '1px solid #a5d6a7', padding: '20px 24px', marginBottom: 20, textAlign: 'center' }}>
              <div style={{ fontSize: 20, color: '#2e7d32', marginBottom: 4 }}>Campaign Complete</div>
              <div style={{ fontSize: 12, color: '#555' }}>Great work! This campaign has been completed.</div>
            </div>

            {matchingOrder && (
              <div style={{ marginBottom: 20 }}>
                <div className="cd-camp-deliverables-label" style={{ marginBottom: 8 }}>Order</div>
                <div style={{ fontSize: 13, color: '#555' }}>Order #{matchingOrder.shopify_order_number || matchingOrder.shopify_order_id}</div>
              </div>
            )}

            <button
              className="cd-campaign-btn-outline"
              style={{ marginTop: 0 }}
              onClick={() => { setActiveTab('submit'); setCampaignContentTarget(assignment.id); setActiveCampaignDetail(null); }}
            >
              Submit Additional Content →
            </button>
          </div>
        )}
      </div>
    )
  }

  function renderProductChips(products, assignmentId, selectable, maxSelects) {
    if (!products || products.length === 0) return null
    return (
      <div className="cd-campaign-product-chips">
        {products.map((p, i) => {
          const selects = selectable ? (campaignSelects[assignmentId]?.products || []) : []
          const isSelected = selectable ? selects.find(s => s.variant_id === p.variant_id) : true
          return (
            <div
              key={i}
              className={`cd-campaign-chip${isSelected ? ' selected' : ''}`}
              style={selectable ? { cursor: 'pointer' } : { cursor: 'default' }}
              onClick={selectable ? () => toggleCampaignProduct(assignmentId, p, maxSelects) : undefined}
            >
              {isSelected && selectable && <div className="cd-campaign-chip-check">✓</div>}
              {p.image_url ? <img src={p.image_url} alt={p.product_title} /> : <div className="cd-campaign-chip-placeholder" />}
              <span>{p.product_title}{p.variant_title ? ` · ${p.variant_title}` : ''}</span>
            </div>
          )
        })}
      </div>
    )
  }

  function renderCampaignCard(assignment, section) {
    const campaign = assignment.campaign
    if (!campaign) return null
    const statusInfo = getCampaignStatusInfo(assignment.status)
    const dueDate = campaign.due_date ? new Date(campaign.due_date + 'T00:00:00').toLocaleDateString('en', { month: 'long', day: 'numeric' }) : null
    const goLiveDate = campaign.go_live_date ? new Date(campaign.go_live_date + 'T00:00:00').toLocaleDateString('en', { month: 'long', day: 'numeric' }) : null
    const isForYou = section === 'forYou'

    return (
      <div
        key={assignment.id}
        className={`cd-campaign-card${isForYou ? ' for-you' : ''}`}
        style={{ cursor: 'pointer' }}
        onClick={() => {
          setActiveCampaignDetail(assignment)
          setCampaignAccepted(false)
          setCampaignVariants({})
        }}
      >
        {campaign.banner_image?.url && (
          <div className="cd-camp-card-banner-wrap">
            <img src={campaign.banner_image.url} alt="" className="cd-camp-card-banner" />
          </div>
        )}
        <div className="cd-campaign-title">{campaign.title}</div>
        <div className="cd-campaign-meta">
          <span className={`cd-campaign-status ${statusInfo.cls}`}>{statusInfo.label}</span>
          {goLiveDate && <span className="cd-camp-go-live">Goes live {goLiveDate}</span>}
          {dueDate && <span className="cd-campaign-due">Content due {dueDate}</span>}
        </div>

        {campaign.description && <div className="cd-campaign-desc" style={{ marginTop: 8 }}>{campaign.description}</div>}

        {/* Product thumbnails (up to 4, deduplicated by image) */}
        {(() => {
          const imgs = [...new Set((campaign.available_products || []).map(p => p.image_url).filter(Boolean))]
          if (imgs.length === 0) return null
          return (
            <div className="cd-campaign-card-thumbs">
              {imgs.slice(0, 4).map((url, i) => (
                <img key={i} src={url} alt="" className="cd-campaign-card-thumb" />
              ))}
              {imgs.length > 4 && (
                <div className="cd-campaign-card-thumb-more">+{imgs.length - 4}</div>
              )}
            </div>
          )
        })()}

        {assignment.status === 'sent' && (
          <button className="cd-campaign-review-btn">Review Details</button>
        )}
      </div>
    )
  }

  function renderCampaigns(mobile) {
    // If viewing a campaign detail, show that instead
    if (activeCampaignDetail) {
      return renderCampaignDetail(mobile)
    }

    // Collect all assignments including children
    const allAssignments = [...campaignAssignments]
    const childAssignments = allAssignments.filter(a => a.campaign?.parent_campaign_id)
    const parentAssignments = allAssignments.filter(a => !a.campaign?.parent_campaign_id)

    // Group children by parent campaign id
    const childrenByParent = {}
    childAssignments.forEach(a => {
      const pid = a.campaign.parent_campaign_id
      if (!childrenByParent[pid]) childrenByParent[pid] = []
      childrenByParent[pid].push(a)
    })

    // "For You" = needs action (sent status)
    const forYou = parentAssignments.filter(a => a.status === 'sent')
    const forYouChildren = childAssignments.filter(a => a.status === 'sent')
    // "In Progress" = confirmed, content_submitted, complete, declined
    const inProgress = parentAssignments.filter(a => a.status !== 'sent')
    const inProgressChildren = childAssignments.filter(a => a.status !== 'sent')

    const forYouCount = forYou.length + forYouChildren.length
    const inProgressCount = inProgress.length + inProgressChildren.length

    if (campaignAssignments.length === 0) {
      return (
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 300, fontStyle: 'italic', color: '#111', marginBottom: 8 }}>No campaigns yet.</div>
          <div style={{ fontSize: 13, color: '#aaa' }}>When we send you a campaign brief, it&apos;ll show up here.</div>
        </div>
      )
    }

    function renderWithChildren(a, section) {
      const children = (childrenByParent[a.campaign?.id] || []).filter(c => section === 'forYou' ? c.status === 'sent' : c.status !== 'sent')
      return (
        <div key={'cg-' + a.id}>
          {renderCampaignCard(a, section)}
          {children.length > 0 && (
            <div className="cd-campaign-inv-indent">
              <div className="cd-campaign-inv-label">Creative Invitations</div>
              {children.map(c => renderCampaignCard(c, section))}
            </div>
          )}
        </div>
      )
    }

    // Orphan children (parent not assigned to this creator)
    const parentCampaignIds = new Set(parentAssignments.map(a => a.campaign?.id).filter(Boolean))
    const orphanForYou = forYouChildren.filter(a => !parentCampaignIds.has(a.campaign.parent_campaign_id))
    const orphanInProgress = inProgressChildren.filter(a => !parentCampaignIds.has(a.campaign.parent_campaign_id))

    return (
      <>
        {/* For You */}
        {forYouCount > 0 && (
          <div style={{ marginBottom: 32 }}>
            <div className="cd-campaign-section-hdr">
              New Invites <span className="cd-campaign-section-count">{forYouCount}</span> <span />
            </div>
            <div className="cd-campaign-grid">
              {forYou.map(a => renderWithChildren(a, 'forYou'))}
              {orphanForYou.map(a => renderCampaignCard(a, 'forYou'))}
            </div>
          </div>
        )}

        {/* In Progress */}
        {inProgressCount > 0 && (
          <div>
            <div className="cd-campaign-section-hdr">
              In Progress <span />
            </div>
            <div className="cd-campaign-grid">
              {inProgress.map(a => renderWithChildren(a, 'inProgress'))}
              {orphanInProgress.map(a => renderCampaignCard(a, 'inProgress'))}
            </div>
          </div>
        )}
      </>
    )
  }

  function getNotifications() {
    const items = []
    // Content submission reviews
    submissions.forEach(s => {
      if (s.status === 'approved' || s.status === 'revision_requested' || s.status === 'rejected') {
        const [yr, mo] = (s.month || '').split('-')
        const monthLabel = yr && mo ? new Date(parseInt(yr), parseInt(mo) - 1).toLocaleString('en', { month: 'short', year: 'numeric' }) : s.month
        const statusLabel = s.status === 'approved' ? 'Content Approved' : s.status === 'revision_requested' ? 'Revision Requested' : 'Content Rejected'
        items.push({
          id: 'sub-' + s.id,
          title: statusLabel,
          meta: monthLabel + ' submission',
          feedback: s.admin_feedback || null,
          tab: 'submit',
          timestamp: s.reviewed_at || s.created_at || '1970-01-01T00:00:00Z',
        })
      }
    })
    // Campaign assignments
    campaignAssignments.forEach(a => {
      if (a.status === 'sent' || a.status === 'confirmed') {
        items.push({
          id: 'camp-' + a.id,
          title: a.campaign?.parent_campaign_id ? 'New Creative Invitation' : 'New Campaign Brief',
          meta: a.campaign?.title || 'Campaign',
          feedback: null,
          tab: 'campaigns',
          timestamp: a.sent_at || a.created_at || '1970-01-01T00:00:00Z',
        })
      }
    })
    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    return items
  }

  function getUnseenCount(notifications) {
    return notifications.filter(n => new Date(n.timestamp) > new Date(lastSeenNotif)).length
  }

  function handleOpenNotif() {
    const now = new Date().toISOString()
    setLastSeenNotif(now)
    localStorage.setItem('nama_notif_seen', now)
    setNotifOpen(!notifOpen)
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

  function renderUploadForm(mobile) {
    const prefix = mobile ? 'cd-m-' : 'cd-'
    const monthOptions = getMonthOptions()
    const confirmedAssignments = campaignAssignments.filter(a => a.status === 'confirmed' && a.campaign)
    const showCampaign = confirmedAssignments.length > 0 || campaignContentTarget

    if (contentSuccess) {
      return (
        <div className="cd-upload-success">
          <div className="cd-upload-success-icon">✓</div>
          <div className="cd-upload-success-title">Submitted</div>
          <div className="cd-upload-success-sub">We&apos;ll review within 48 hours.</div>
          <button className={mobile ? 'cd-m-submit' : 'cd-submit'} style={{ marginTop: 20 }} onClick={() => setContentSuccess(null)}>
            Submit More Content
          </button>
        </div>
      )
    }

    return (
      <>
        {resubmitTarget && (
          <div className="cd-resubmit-banner">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>Resubmitting content</strong>
                <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>Upload your revised files below. This will replace the previous submission.</div>
              </div>
              <button
                className="cd-resubmit-cancel"
                onClick={() => { setResubmitTarget(null); setContentFiles([]); setContentNotes(''); }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Campaign + Month side by side */}
        <div className="cd-form-row">
          {showCampaign && (
            <div className="cd-form-col">
              <label className={mobile ? 'cd-m-field-label' : 'cd-field-label'}>Campaign</label>
              <select
                className={mobile ? 'cd-m-field-input' : 'cd-field-input'}
                value={campaignContentTarget || ''}
                onChange={e => setCampaignContentTarget(e.target.value || null)}
                disabled={!!campaignContentTarget && campaignAssignments.find(a => a.id === campaignContentTarget)}
              >
                <option value="">Not campaign related</option>
                {confirmedAssignments.map(a => (
                  <option key={a.id} value={a.id}>{a.campaign?.title || 'Campaign'}</option>
                ))}
              </select>
            </div>
          )}
          <div className="cd-form-col">
            <label className={mobile ? 'cd-m-field-label' : 'cd-field-label'}>Month</label>
            <select className={mobile ? 'cd-m-field-input' : 'cd-field-input'} value={contentMonth} onChange={e => setContentMonth(e.target.value)} disabled={!!resubmitTarget}>
              {monthOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        <label className={mobile ? 'cd-m-field-label' : 'cd-field-label'} style={{ marginTop: 16 }}>Files</label>
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
          {contentSubmitting ? 'Uploading…' : resubmitTarget ? 'Resubmit Content →' : 'Submit Content →'}
        </button>
      </>
    )
  }

  function renderSubmissionHistory(mobile) {
    if (submissions.length === 0) {
      return (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#aaa', fontSize: 13 }}>
          No submissions yet
        </div>
      )
    }

    return submissions.map(sub => {
      const files = Array.isArray(sub.files) ? sub.files : []
      const [yr, mo] = (sub.month || '').split('-')
      const monthLabel = yr && mo ? new Date(parseInt(yr), parseInt(mo) - 1).toLocaleString('en', { month: 'long', year: 'numeric' }) : sub.month
      const statusLabel = sub.status === 'pending' ? 'in review' : (sub.status || '').replace(/_/g, ' ')
      return (
        <div key={sub.id} className="cd-hist-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div>
              <div className="cd-past-text">{monthLabel}</div>
              <div className="cd-past-label">{files.length} file{files.length !== 1 ? 's' : ''}</div>
            </div>
            <span className={`cd-badge${getStatusBadgeClass(sub.status)}`}>
              {statusLabel}
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
          {sub.notes && <div className="cd-past-notes">{sub.notes}</div>}
          {sub.admin_feedback && (
            <div className="cd-hist-feedback">
              Feedback: {sub.admin_feedback}
            </div>
          )}
          {sub.status === 'revision_requested' && (
            <button
              className="cd-resubmit-btn"
              onClick={() => {
                setResubmitTarget(sub.id)
                setContentMonth(sub.month)
                setCampaignContentTarget(sub.campaign_assignment_id || null)
                setContentFiles([])
                setContentNotes('')
                setContentSuccess(null)
                if (mobile) setContentSubTab('submit')
              }}
            >
              Resubmit Content →
            </button>
          )}
        </div>
      )
    })
  }

  function renderSubmitContent(mobile) {
    if (mobile) {
      return (
        <>
          <div className="cd-content-tabs">
            <button className={`cd-content-tab${contentSubTab === 'submit' ? ' active' : ''}`} onClick={() => setContentSubTab('submit')}>Submit</button>
            <button className={`cd-content-tab${contentSubTab === 'history' ? ' active' : ''}`} onClick={() => setContentSubTab('history')}>Past Submissions</button>
          </div>
          {contentSubTab === 'submit' ? (
            <div style={{ padding: '0' }}>{renderUploadForm(true)}</div>
          ) : (
            <div>{renderSubmissionHistory(true)}</div>
          )}
        </>
      )
    }

    // Desktop: side-by-side split
    return (
      <div className="cd-content-split">
        <div className="cd-content-left">
          {renderUploadForm(false)}
        </div>
        <div className="cd-content-right">
          <div className="cd-content-right-eyebrow">Past Submissions</div>
          <div className="cd-content-right-scroll">
            {renderSubmissionHistory(false)}
          </div>
        </div>
      </div>
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
          {renderAffiliateSales(false)}
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

    // Wardrobe tab with sub-tabs: Wardrobe, Orders, Request Styles
    if (activeTab === 'wardrobe') {
      const totalItems = orders.reduce((sum, o) => sum + (o.line_items?.length || 0), 0)
      return (
        <div>
          <div className="cd-subtabs">
            {['wardrobe', 'orders', 'requests'].map(t => (
              <button key={t} className={`cd-subtab${wardrobeSubTab === t ? ' active' : ''}`} onClick={() => setWardrobeSubTab(t)}>
                {t === 'wardrobe' ? 'Wardrobe' : t === 'orders' ? 'Orders' : 'Request Styles'}
              </button>
            ))}
          </div>

          {wardrobeSubTab === 'wardrobe' && (
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
          )}

          {wardrobeSubTab === 'orders' && orders.length > 0 && (
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

          {wardrobeSubTab === 'requests' && (
            <div className="cd-card">
              <div className="cd-card-head">
                <div>
                  <div className="cd-card-eyebrow">Monthly Allowance</div>
                  <div className="cd-card-title">Request New Styles</div>
                </div>
              </div>
              <div className="cd-card-body">
                {renderRequestStyles(false)}
              </div>
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

    return (
      <div className="cd-card cd-card-content">
        <div className="cd-card-head">
          <div>
            <div className="cd-card-eyebrow">Monthly Delivery</div>
            <div className="cd-card-title">Submit Content</div>
            <div className="cd-upload-sub" style={{ marginTop: 8 }}>Upload your videos or photos below. We&apos;ll review within 48 hours.</div>
          </div>
        </div>
        {renderSubmitContent(false)}
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
                {TABS.map((tab, i) => {
                  let badgeCount = 0
                  if (tab === 'campaigns') {
                    const campNotifs = getNotifications().filter(n => n.tab === 'campaigns')
                    badgeCount = campNotifs.filter(n => new Date(n.timestamp) > new Date(lastSeenNotif)).length
                  }
                  return (
                    <button
                      key={tab}
                      className={`cd-nav-item${activeTab === tab ? ' active' : ''}`}
                      style={i === TABS.length - 1 ? { borderBottom: 'none' } : undefined}
                      onClick={() => setActiveTab(tab)}
                    >
                      <span className="cd-nav-label">{TAB_LABELS[tab]}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {badgeCount > 0 && <span className="cd-nav-badge">{badgeCount}</span>}
                        <span className="cd-nav-arrow">→</span>
                      </span>
                    </button>
                  )
                })}
              </div>

              {(() => {
                const notifs = getNotifications()
                const unseenCount = getUnseenCount(notifs)
                return (
                  <div style={{ position: 'relative' }}>
                    <button className="cd-notif-btn" onClick={handleOpenNotif}>
                      <span className="cd-notif-btn-label">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
                        Notifications
                      </span>
                      {unseenCount > 0 && <span className="cd-notif-badge">{unseenCount}</span>}
                    </button>
                    {notifOpen && (
                      <div className="cd-notif-dropdown">
                        {notifs.length === 0 ? (
                          <div className="cd-notif-empty">No notifications</div>
                        ) : (
                          notifs.slice(0, 8).map(n => (
                            <button key={n.id} className="cd-notif-item" onClick={() => { setNotifOpen(false); setActiveTab(n.tab) }}>
                              <div className="cd-notif-item-title">{n.title}</div>
                              <div className="cd-notif-item-meta">{n.meta}</div>
                              {n.feedback && <div className="cd-notif-item-feedback">&ldquo;{n.feedback}&rdquo;</div>}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )
              })()}

              {affiliateCode && invite?.has_affiliate && (
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
                        <div className="cd-aff-link-url">namaclo.com/discount/{affiliateCode.toLowerCase()}</div>
                      </div>
                      <button className="cd-aff-copy" onClick={copyLink}>{copiedLink ? 'Copied' : 'Copy'}</button>
                    </div>
                  </div>
                  {renderCodeChangeSection()}
                </div>
              )}
            </div>

            <div className="cd-content">
              <div className="cd-stats-bar">
                {hasAffiliate && commissionRate > 0 && (
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
                  <div className="cd-stats-bar-val">{adsLoading ? <span className="cd-skel cd-skel-stat" style={{ display: 'inline-block' }} /> : adsRunning}</div>
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
            <button className="cd-m-topbar-account" onClick={() => setActiveTab('settings')}>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke={activeTab === 'settings' ? '#111' : '#999'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" /></svg>
            </button>
            <div className="cd-m-logo-lockup">
              <img src="/nama-logo.svg" alt="Nama" className="cd-m-logo" />
              <div className="cd-m-logo-sub">Partners</div>
            </div>
            {(() => {
              const notifs = getNotifications()
              const unseenCount = getUnseenCount(notifs)
              return (
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }} onClick={handleOpenNotif}>
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#999" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
                    {unseenCount > 0 && (
                      <span style={{ position: 'absolute', top: 0, right: 0, width: 8, height: 8, borderRadius: '50%', background: '#e74c3c' }} />
                    )}
                  </button>
                  {notifOpen && (
                    <div style={{ position: 'absolute', top: '100%', right: 0, width: 240, background: 'white', border: '1px solid #e8e8e8', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.08)', zIndex: 50, maxHeight: 260, overflowY: 'auto', marginTop: 4 }}>
                      {notifs.length === 0 ? (
                        <div style={{ padding: 16, textAlign: 'center', fontSize: 11, color: '#ccc' }}>No notifications</div>
                      ) : (
                        notifs.slice(0, 8).map(n => (
                          <button key={n.id} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f5f5f5', background: 'none', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }} onClick={() => { setNotifOpen(false); setActiveTab(n.tab) }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: '#333' }}>{n.title}</div>
                            <div style={{ fontSize: 10, color: '#999' }}>{n.meta}</div>
                            {n.feedback && <div style={{ fontSize: 10, color: '#666', marginTop: 3, fontStyle: 'italic' }}>&ldquo;{n.feedback}&rdquo;</div>}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )
            })()}
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
            {photoUrl ? (
              <img className="cd-m-profile-photo" src={photoUrl} alt={creatorName} />
            ) : (
              <div className="cd-m-profile-photo" style={{ background: '#e8e8e8' }} />
            )}
            <div>
              <div className="cd-m-name">{creatorName}</div>
              {handle && <div className="cd-m-handle">{handle}</div>}
              <div className="cd-m-status"><span className="cd-dot" /> Active Partner</div>
            </div>
          </div>

          <div className="cd-m-stats">
            {hasAffiliate && commissionRate > 0 && (
              <div className="cd-m-stat"><div className="cd-m-stat-l">Commission</div><div className="cd-m-stat-v">{commissionRate}%</div></div>
            )}
            <div className="cd-m-stat"><div className="cd-m-stat-l">Videos</div><div className="cd-m-stat-v">{videosPerMonth}</div></div>
            <div className="cd-m-stat"><div className="cd-m-stat-l">Ads Live</div><div className="cd-m-stat-v">{adsLoading ? <span className="cd-skel cd-skel-stat" style={{ display: 'inline-block' }} /> : adsRunning}</div></div>
          </div>

          {affiliateCode && invite?.has_affiliate && (
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
                    <div className="cd-m-aff-link-url">namaclo.com/discount/{affiliateCode.toLowerCase()}</div>
                  </div>
                  <button className="cd-m-aff-copy" onClick={copyLink}>{copiedLink ? 'Copied' : 'Copy'}</button>
                </div>
              </div>
              {renderCodeChangeSection()}
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

            {/* Wardrobe + Orders + Requests (sub-tabbed) */}
            <div style={activeTab !== 'wardrobe' ? { display: 'none' } : undefined}>
              <div className="cd-m-subtabs">
                {['wardrobe', 'orders', 'requests'].map(t => (
                  <button key={t} className={`cd-m-subtab${wardrobeSubTab === t ? ' active' : ''}`} onClick={() => setWardrobeSubTab(t)}>
                    {t === 'wardrobe' ? 'Wardrobe' : t === 'orders' ? 'Orders' : 'Requests'}
                  </button>
                ))}
              </div>

              {wardrobeSubTab === 'wardrobe' && (
                <div className="cd-m-section">
                  {renderWardrobeGrid(true)}
                </div>
              )}

              {wardrobeSubTab === 'orders' && (
                <div className="cd-m-section">
                  <div style={{ padding: '16px 20px 12px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
                    <a href="https://namaclo.returnlogic.com/" target="_blank" rel="noopener noreferrer" className="cd-exchange-btn">Start an Exchange →</a>
                    {influencer?.email && (
                      <div style={{ fontSize: '10px', color: '#aaa' }}>Use the email your order was placed with: {influencer.email}</div>
                    )}
                  </div>
                  <div className="cd-m-section-body">{renderOrderHistory(true)}</div>
                </div>
              )}

              {wardrobeSubTab === 'requests' && (
                <div className="cd-m-section">
                  <div className="cd-m-section-body">{renderRequestStyles(true)}</div>
                </div>
              )}
            </div>

            {/* Live Ads */}
            <div style={activeTab !== 'ads' ? { display: 'none' } : undefined}>
              <div className="cd-m-section-body" style={{ padding: '16px 0' }}>
                {renderEarnings(true)}
                {renderAffiliateSales(true)}
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
              <div className="cd-m-tabbar-label">Stats</div>
            </button>
            <button className={`cd-m-tabbar-item${activeTab === 'campaigns' ? ' active' : ''}`} onClick={() => setActiveTab('campaigns')}>
              {(() => {
                const campNotifs = getNotifications().filter(n => n.tab === 'campaigns')
                const unseenCamp = campNotifs.filter(n => new Date(n.timestamp) > new Date(lastSeenNotif)).length
                return unseenCamp > 0 ? <div className="cd-m-tabbar-badge">{unseenCamp}</div> : null
              })()}
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
