'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500&display=swap');
.nama-invite { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #111; margin: 0; padding: 0; }
.nama-invite *, .nama-invite *::before, .nama-invite *::after { box-sizing: border-box; margin: 0; padding: 0; }

/* Desktop */
.ni-desktop { display: block; }
.ni-mobile { display: none; }
@media (max-width: 768px) {
  .ni-desktop { display: none !important; }
  .ni-mobile { display: block !important; }
}

/* PAGE LAYOUT */
.ni-page { background: white; max-width: 960px; margin: 0 auto; min-height: 100vh; display: grid; grid-template-columns: 380px 1fr; }
.ni-page.ni-done-page { grid-template-columns: 1fr; }
.ni-page.ni-done-page .ni-panel-left { display: none; }
.ni-page.ni-done-page .ni-panel-right { display: none; }
.ni-done-center { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; padding: 56px 48px; }
.ni-done-center .ni-logo-lockup { align-items: center; margin-bottom: 48px; }
.ni-done-content { text-align: left; width: 100%; max-width: 400px; }
.ni-done-center .ni-eyebrow { color: #666; font-size: 9px; letter-spacing: 0.42em; text-transform: uppercase; margin-bottom: 18px; }
.ni-done-center .ni-headline { font-family: 'Playfair Display', serif; font-size: 52px; font-weight: 300; color: #111; line-height: 1.02; margin-bottom: 22px; }
.ni-done-center .ni-headline em { font-style: italic; color: #888; display: block; }
.ni-done-center .ni-intro { font-size: 13px; color: #888; line-height: 1.9; font-weight: 300; margin-bottom: 36px; }
.ni-done-center .ni-btn { max-width: 400px; width: 100%; }
.ni-panel-left { padding: 56px 48px; border-right: 1px solid #e8e8e8; display: flex; flex-direction: column; justify-content: space-between; position: sticky; top: 0; height: 100vh; background: white; }
.ni-panel-right { padding: 56px 52px; overflow-y: auto; }

.ni-logo-lockup { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; }
.ni-logo { height: 31px; display: block; width: fit-content; }
.ni-logo-sub { font-size: 9.5px; letter-spacing: 0.4em; text-transform: uppercase; color: #aaa; }
.ni-eyebrow { font-size: 9px; letter-spacing: 0.42em; text-transform: uppercase; color: #666; margin-bottom: 18px; }
.ni-headline { font-family: 'Playfair Display', serif; font-size: 52px; font-weight: 300; color: #111; line-height: 1.02; margin-bottom: 22px; }
.ni-headline em { font-style: italic; color: #888; display: block; }
.ni-intro { font-size: 13px; color: #888; line-height: 1.9; font-weight: 300; max-width: 260px; }
.ni-left-footer { font-size: 10px; color: #ccc; letter-spacing: 0.15em; text-transform: uppercase; }

/* SECTION LABEL */
.ni-sec-label { font-size: 9px; letter-spacing: 0.4em; text-transform: uppercase; color: #888; margin-bottom: 22px; display: flex; align-items: center; gap: 12px; }
.ni-sec-label::after { content: ''; flex: 1; height: 1px; background: #ebebeb; }

/* OPTION CARDS */
.ni-option-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 36px; }
.ni-option-card { border: 1.5px solid #e8e8e8; border-radius: 14px; padding: 24px 30px; cursor: pointer; transition: all 0.2s; position: relative; background: white; }
.ni-option-card:hover { border-color: #ccc; }
.ni-option-card.selected { border-color: #111; }
.ni-option-card.selected .ni-check { opacity: 1; }
.ni-check { position: absolute; top: 14px; right: 14px; width: 20px; height: 20px; border-radius: 50%; background: #111; color: white; font-size: 9px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s; }
.ni-option-tag { font-size: 8.5px; letter-spacing: 0.28em; text-transform: uppercase; color: #555; margin-bottom: 12px; }
.ni-option-rate { font-family: 'Playfair Display', serif; font-size: 40px; font-weight: 300; color: #111; line-height: 1; margin-bottom: 6px; }
.ni-option-rate sub { font-size: 14px; font-style: italic; color: #999; vertical-align: baseline; }
.ni-option-rate sup { font-size: 16px; vertical-align: super; color: #888; }
.ni-option-name { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: #888; margin-bottom: 10px; font-weight: 400; }
.ni-option-rule { height: 1px; background: #f0f0f0; margin-bottom: 12px; }
.ni-option-detail { font-size: 13px; color: #333; font-weight: 300; line-height: 1.75; }
.ni-option-detail strong { color: #333; font-weight: 300; }
.ni-option-detail .ni-card-item { padding-bottom: 8px; margin-bottom: 8px; border-bottom: 1px solid #f0f0f0; }
.ni-option-detail .ni-card-item:last-child { padding-bottom: 0; margin-bottom: 0; border-bottom: none; }
.ni-option-detail .ni-card-item:has(+ .ni-term-divider) { border-bottom: none; padding-bottom: 0; margin-bottom: 0; }
.ni-option-detail .ni-term-sub { margin-bottom: 12px; }
.ni-option-detail .ni-term-divider { margin-top: 12px; margin-bottom: 0; }
.ni-option-hint { font-size: 11px; font-style: italic; color: #999; text-align: center; margin-top: 8px; }

/* TERM ROWS */
.ni-term-row { display: flex; align-items: flex-start; justify-content: space-between; padding: 16px 0; border-bottom: 1px solid #f2f2f2; }
.ni-term-row:last-child { border-bottom: none; }
.ni-term-row:has(+ .ni-term-divider), .ni-term-row:has(+ .ni-footnote) { border-bottom: none; }
.ni-term-key { font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: #333; font-weight: 600; padding-top: 4px; }
.ni-term-val { text-align: right; }
.ni-term-primary { font-family: 'Playfair Display', serif; font-size: 22px; font-weight: 400; color: #111; }
.ni-term-secondary { font-size: 11px; color: #888888; font-weight: 300; margin-top: 2px; }
.ni-term-sub { font-size: 9px; letter-spacing: 0.3em; text-transform: uppercase; color: #aaa; margin: 20px 0 4px; }
.ni-term-sub:first-child { margin-top: 0; }
.ni-term-divider { height: 1px; background: #d0d0d0; margin: 4px 0; }
.ni-footnote { font-size: 12px; color: #aaa; font-style: italic; line-height: 1.8; margin: 18px 0 32px; padding-left: 14px; border-left: 1.5px solid #e8e8e8; }

/* PERKS */
.ni-perk-row { display: flex; align-items: center; gap: 14px; padding: 11px 0; border-bottom: 1px solid #f5f5f5; font-family: 'Playfair Display', serif; font-size: 16px; color: #111; line-height: 1.3; }
.ni-perk-row:last-child { border-bottom: none; }
.ni-perk-dot { width: 18px; height: 18px; border-radius: 50%; background: #111; display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: white; font-size: 9px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }

/* HIGHLIGHT BLOCK */
.ni-highlight { background: #111; border-radius: 14px; padding: 26px 28px; display: flex; align-items: center; justify-content: space-between; margin: 28px 0; }
.ni-highlight-tag { font-size: 8.5px; letter-spacing: 0.3em; text-transform: uppercase; color: rgba(255,255,255,0.3); margin-bottom: 6px; }
.ni-highlight-val { font-family: 'Playfair Display', serif; font-size: 58px; font-weight: 300; color: white; line-height: 1; letter-spacing: -0.02em; }
.ni-highlight-val sup { font-size: 22px; vertical-align: super; opacity: 0.4; }
.ni-highlight-desc { font-size: 12px; color: rgba(255,255,255,0.6); line-height: 1.8; font-weight: 300; max-width: 140px; text-align: right; }

/* MIN NOTE */
.ni-min-note { background: #fafafa; border: 1px solid #ebebeb; border-radius: 10px; padding: 14px 18px; margin-bottom: 24px; display: flex; gap: 12px; align-items: flex-start; }
.ni-min-note-icon { font-size: 12px; color: #999; flex-shrink: 0; margin-top: 2px; }
.ni-min-note-text { font-size: 12px; color: #888; line-height: 1.7; font-weight: 300; }
.ni-min-note-text strong { color: #333; font-weight: 500; }

/* FAQ ACCORDION */
.ni-faq { margin-bottom: 28px; }
.ni-faq-item { padding: 0; border-bottom: 1px solid #f0f0f0; }
.ni-faq-item:last-child { border-bottom: none; }
.ni-faq-q { display: flex; align-items: center; justify-content: space-between; cursor: pointer; padding: 18px 0; }
.ni-faq-q-text { font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: #333; font-weight: 600; line-height: 1.4; padding-right: 12px; }
.ni-faq-icon { font-size: 18px; color: #bbb; flex-shrink: 0; transition: transform 0.2s; font-weight: 300; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; line-height: 1; }
.ni-faq-icon.open { transform: rotate(45deg); }
.ni-faq-a { font-size: 12.5px; color: #888; font-weight: 300; line-height: 1.8; padding: 0 0 18px; }
.ni-m-faq { margin-bottom: 24px; }
.ni-m-faq-item { padding: 0; border-bottom: 1px solid #f0f0f0; }
.ni-m-faq-item:last-child { border-bottom: none; }
.ni-m-faq-q { display: flex; align-items: center; justify-content: space-between; cursor: pointer; padding: 16px 0; }
.ni-m-faq-q-text { font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: #333; font-weight: 600; line-height: 1.4; padding-right: 12px; }
.ni-m-faq-icon { font-size: 18px; color: #bbb; flex-shrink: 0; transition: transform 0.2s; font-weight: 300; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; line-height: 1; }
.ni-m-faq-icon.open { transform: rotate(45deg); }
.ni-m-faq-a { font-size: 12px; color: #888; font-weight: 300; line-height: 1.8; padding: 0 0 16px; }

/* AGREE */
.ni-agree-row { display: flex; gap: 14px; align-items: flex-start; margin-bottom: 24px; }
.ni-agree-box { width: 18px !important; height: 18px !important; min-width: 18px; border-radius: 4px !important; border: 1.5px solid #ccc !important; flex-shrink: 0; margin-top: 2px; background: white !important; appearance: none !important; -webkit-appearance: none !important; cursor: pointer; position: relative; transition: all 0.15s; padding: 0 !important; }
.ni-agree-box:checked { background: #111 !important; border-color: #111 !important; }
.ni-agree-box:checked::after { content: "\\2713"; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: white; font-size: 10px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; line-height: 1; }
.ni-agree-text { font-size: 12.5px; color: #888; line-height: 1.75; font-weight: 300; }

/* BUTTONS */
.ni-btn { width: 100%; padding: 16px; background: #111; color: white; border: none !important; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10.5px; font-weight: 500; letter-spacing: 0.25em; text-transform: uppercase; cursor: pointer; border-radius: 6px; transition: background 0.2s; }
.ni-btn:hover { background: #333; }
.ni-btn:disabled { background: #ccc !important; color: white !important; cursor: not-allowed; }
.ni-btn:disabled:hover { background: #ccc !important; }
.ni-btn-outline { width: 100%; padding: 14px; background: transparent; color: #aaa; border: 1.5px solid #e8e8e8; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10.5px; font-weight: 400; letter-spacing: 0.2em; text-transform: uppercase; cursor: pointer; border-radius: 6px; margin-top: 10px; }

/* FORM */
.ni-form-group { margin-bottom: 18px; }
.ni-form-label { font-size: 9px; letter-spacing: 0.25em; text-transform: uppercase; color: #bbb; display: block; margin-bottom: 8px; }
.ni-form-input { width: 100%; padding: 14px 18px; border: 1.5px solid #e8e8e8; background: #fafafa; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; color: #111; outline: none; border-radius: 8px; transition: border-color 0.2s; box-sizing: border-box; }
.ni-form-input:focus { border-color: #aaa; background: white; }

/* SUCCESS */
.ni-success-badge { display: inline-flex; align-items: center; gap: 7px; background: #f5f5f5; border: 1px solid #e8e8e8; padding: 6px 14px; border-radius: 100px; margin-bottom: 24px; font-size: 9px; letter-spacing: 0.18em; text-transform: uppercase; color: #888; }
.ni-success-title { font-family: 'Playfair Display', serif; font-size: 44px; font-weight: 300; color: #111; line-height: 1.05; margin-bottom: 12px; }
.ni-success-title em { font-style: italic; color: #999; }
.ni-success-sub { font-size: 13px; color: #888; font-weight: 300; line-height: 1.85; margin-bottom: 28px; }
.ni-code-block { background: #fafafa; border: 1px solid #e8e8e8; border-radius: 12px; padding: 20px 24px; display: flex; align-items: center; justify-content: space-between; margin-bottom: 32px; }
.ni-code-label { font-size: 9px; letter-spacing: 0.28em; text-transform: uppercase; color: #ccc; margin-bottom: 6px; }
.ni-code-val { font-family: 'Playfair Display', serif; font-size: 30px; font-weight: 500; color: #111; letter-spacing: 0.1em; }
.ni-code-copy { padding: 8px 18px; border-radius: 100px; border: 1.5px solid #e0e0e0; background: white; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: #999; cursor: pointer; }
.ni-next-steps { border-top: 1px solid #ebebeb; padding-top: 22px; margin-bottom: 28px; }
.ni-next-step { display: flex; gap: 16px; padding: 11px 0; border-bottom: 1px solid #f5f5f5; }
.ni-next-step:last-child { border-bottom: none; }
.ni-step-num { font-family: 'Playfair Display', serif; font-size: 18px; color: #ddd; flex-shrink: 0; line-height: 1.3; }
.ni-step-text { font-size: 13px; color: #888; font-weight: 300; line-height: 1.65; }
.ni-error { font-size: 13px; color: #c0392b; padding: 10px 14px; background: #fdf3f2; border: 1px solid #e8c8c5; border-radius: 6px; margin-bottom: 18px; }

/* ======================== */
/*     MOBILE               */
/* ======================== */
.ni-m-wrap { background: #f0f0f0; min-height: 100vh; display: flex; justify-content: center; padding: 0; }
.ni-m-inner { max-width: 390px; width: 100%; min-height: 100vh; background: white; }
@media (max-width: 390px) { .ni-m-inner { max-width: 100%; } }
.ni-m-topbar { padding: 20px 24px; border-bottom: 1px solid #ebebeb; }
.ni-m-logo-lockup { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.ni-m-logo { height: 26px; display: block; width: fit-content; }
.ni-m-logo-sub { font-size: 8px; letter-spacing: 0.4em; text-transform: uppercase; color: #aaa; }
.ni-m-hero { padding: 32px 24px 28px; border-bottom: 1px solid #ebebeb; }
.ni-m-eyebrow { font-size: 9px; letter-spacing: 0.4em; text-transform: uppercase; color: #666; margin-bottom: 14px; }
.ni-m-headline { font-family: 'Playfair Display', serif; font-size: 44px; font-weight: 300; color: #111; line-height: 1.02; }
.ni-m-headline em { font-style: italic; color: #999; display: block; }
.ni-m-intro { font-size: 13px; color: #999; font-weight: 300; line-height: 1.8; margin-top: 14px; }
.ni-m-body { padding: 28px 24px 56px; }
.ni-m-done-center { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; padding: 48px 24px; }
.ni-m-done-center .ni-m-logo-lockup { align-items: center; margin-bottom: 40px; }
.ni-m-done-content { text-align: left; width: 100%; max-width: 340px; }
.ni-m-done-center .ni-m-eyebrow { font-size: 8px; letter-spacing: 0.4em; text-transform: uppercase; color: #666; margin-bottom: 14px; }
.ni-m-done-center .ni-m-headline { font-family: 'Playfair Display', serif; font-size: 36px; font-weight: 300; color: #111; line-height: 1.05; margin-bottom: 18px; }
.ni-m-done-center .ni-m-headline em { font-style: italic; color: #888; display: block; }
.ni-m-done-center .ni-m-intro { font-size: 13px; color: #888; line-height: 1.9; font-weight: 300; margin-bottom: 32px; }
.ni-m-done-center .ni-m-btn { max-width: 340px; width: 100%; }
.ni-m-sec-label { font-size: 9px; letter-spacing: 0.38em; text-transform: uppercase; color: #555; margin-bottom: 18px; display: flex; align-items: center; gap: 10px; }
.ni-m-sec-label::after { content: ''; flex: 1; height: 1px; background: #ebebeb; }

/* Mobile option cards */
.ni-m-option-cards { display: flex; flex-direction: column; gap: 10px; margin-bottom: 28px; }
.ni-m-option-card { border: 1.5px solid #e8e8e8; border-radius: 12px; padding: 20px 26px; cursor: pointer; transition: border-color 0.2s; position: relative; }
.ni-m-option-card:hover { border-color: #ccc; }
.ni-m-option-card.selected { border-color: #111; }
.ni-m-option-card.selected .ni-m-check { opacity: 1; }
.ni-m-check { position: absolute; top: 14px; right: 14px; width: 20px; height: 20px; border-radius: 50%; background: #111; color: white; font-size: 9px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s; }
.ni-m-option-tag { font-size: 8.5px; letter-spacing: 0.26em; text-transform: uppercase; color: #555; margin-bottom: 10px; }
.ni-m-option-rate { font-family: 'Playfair Display', serif; font-size: 36px; font-weight: 300; color: #111; line-height: 1; margin-bottom: 4px; }
.ni-m-option-rate sub { font-size: 13px; font-style: italic; color: #999; vertical-align: baseline; }
.ni-m-option-rate sup { font-size: 15px; vertical-align: super; color: #999; }
.ni-m-option-name { font-size: 10.5px; letter-spacing: 0.12em; text-transform: uppercase; color: #999; margin-bottom: 10px; }
.ni-m-option-rule { height: 1px; background: #f0f0f0; margin-bottom: 10px; }
.ni-m-option-detail { font-size: 13px; color: #333; font-weight: 300; line-height: 1.7; }
.ni-m-option-detail strong { color: #333; font-weight: 300; }
.ni-m-option-detail .ni-card-item { padding-bottom: 8px; margin-bottom: 8px; border-bottom: 1px solid #f0f0f0; }
.ni-m-option-detail .ni-card-item:last-child { padding-bottom: 0; margin-bottom: 0; border-bottom: none; }
.ni-m-option-detail .ni-card-item:has(+ .ni-m-term-divider) { border-bottom: none; padding-bottom: 0; margin-bottom: 0; }
.ni-m-option-detail .ni-m-term-sub { margin-bottom: 12px; }
.ni-m-option-detail .ni-m-term-divider { margin-top: 12px; margin-bottom: 0; }
.ni-m-option-hint { font-size: 11px; font-style: italic; color: #999; text-align: center; margin-top: 8px; }

.ni-m-term-row { display: flex; align-items: flex-start; justify-content: space-between; padding: 15px 0; border-bottom: 1px solid #f2f2f2; }
.ni-m-term-row:last-child { border-bottom: none; }
.ni-m-term-row:has(+ .ni-m-term-divider), .ni-m-term-row:has(+ .ni-m-footnote) { border-bottom: none; }
.ni-m-term-key { font-size: 9.5px; letter-spacing: 0.16em; text-transform: uppercase; color: #333; font-weight: 600; padding-top: 4px; }
.ni-m-term-primary { font-family: 'Playfair Display', serif; font-size: 20px; color: #111; text-align: right; }
.ni-m-term-secondary { font-size: 11px; color: #888; font-weight: 300; margin-top: 2px; text-align: right; }
.ni-m-term-sub { font-size: 9px; letter-spacing: 0.3em; text-transform: uppercase; color: #aaa; margin: 18px 0 4px; }
.ni-m-term-sub:first-child { margin-top: 0; }
.ni-m-term-divider { height: 1px; background: #d0d0d0; margin: 4px 0; }
.ni-m-footnote { font-size: 12px; color: #aaa; font-style: italic; line-height: 1.75; margin: 16px 0 26px; padding-left: 12px; border-left: 1.5px solid #e8e8e8; }
.ni-m-perk-row { display: flex; align-items: center; gap: 14px; padding: 11px 0; border-bottom: 1px solid #f5f5f5; font-family: 'Playfair Display', serif; font-size: 16px; color: #111; }
.ni-m-perk-row:last-child { border-bottom: none; }
.ni-m-perk-dot { width: 18px; height: 18px; border-radius: 50%; background: #111; display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: white; font-size: 9px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
.ni-m-highlight { background: #111; border-radius: 12px; padding: 22px 22px; display: flex; align-items: center; justify-content: space-between; margin: 22px 0; }
.ni-m-highlight-tag { font-size: 8px; letter-spacing: 0.28em; text-transform: uppercase; color: rgba(255,255,255,0.28); margin-bottom: 4px; }
.ni-m-highlight-val { font-family: 'Playfair Display', serif; font-size: 50px; font-weight: 300; color: white; line-height: 1; }
.ni-m-highlight-val sup { font-size: 19px; vertical-align: super; opacity: 0.4; }
.ni-m-highlight-desc { font-size: 11.5px; color: rgba(255,255,255,0.6); line-height: 1.75; font-weight: 300; max-width: 120px; text-align: right; }
.ni-m-min-note { background: #fafafa; border: 1px solid #ebebeb; border-radius: 10px; padding: 13px 16px; margin-bottom: 22px; display: flex; gap: 10px; }
.ni-m-min-note-text { font-size: 12px; color: #888; line-height: 1.7; font-weight: 300; }
.ni-m-min-note-text strong { color: #333; font-weight: 500; }
.ni-m-agree-row { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 20px; }
.ni-m-agree-box { width: 18px !important; height: 18px !important; min-width: 18px; border-radius: 4px !important; border: 1.5px solid #ccc !important; flex-shrink: 0; margin-top: 2px; background: white !important; appearance: none !important; -webkit-appearance: none !important; cursor: pointer; position: relative; transition: all 0.15s; padding: 0 !important; }
.ni-m-agree-box:checked { background: #111 !important; border-color: #111 !important; }
.ni-m-agree-box:checked::after { content: "\\2713"; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: white; font-size: 10px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; line-height: 1; }
.ni-m-agree-text { font-size: 12.5px; color: #888; line-height: 1.75; font-weight: 300; }
.ni-m-btn { width: 100%; padding: 16px; background: #111; color: white; border: none; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10.5px; font-weight: 500; letter-spacing: 0.25em; text-transform: uppercase; cursor: pointer; border-radius: 6px; }
.ni-m-btn:disabled { background: #ccc; cursor: not-allowed; }
.ni-m-btn-outline { width: 100%; padding: 14px; background: transparent; color: #aaa; border: 1.5px solid #e8e8e8; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10.5px; font-weight: 400; letter-spacing: 0.2em; text-transform: uppercase; cursor: pointer; border-radius: 6px; margin-top: 10px; }
.ni-m-form-group { margin-bottom: 16px; }
.ni-m-form-label { font-size: 9px; letter-spacing: 0.22em; text-transform: uppercase; color: #bbb; display: block; margin-bottom: 7px; }
.ni-m-form-input { width: 100%; padding: 13px 16px; border: 1.5px solid #e8e8e8; background: #fafafa; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; color: #111; outline: none; border-radius: 8px; box-sizing: border-box; }
.ni-m-form-input:focus { border-color: #aaa; background: white; }
.ni-m-success-badge { display: inline-flex; align-items: center; gap: 7px; background: #f5f5f5; border: 1px solid #e8e8e8; padding: 6px 14px; border-radius: 100px; margin-bottom: 22px; font-size: 9px; letter-spacing: 0.15em; text-transform: uppercase; color: #888; }
.ni-m-success-title { font-family: 'Playfair Display', serif; font-size: 38px; font-weight: 300; color: #111; line-height: 1.05; margin-bottom: 12px; }
.ni-m-success-title em { font-style: italic; color: #999; }
.ni-m-success-sub { font-size: 13px; color: #888; font-weight: 300; line-height: 1.85; margin-bottom: 24px; }
.ni-m-code-block { background: #fafafa; border: 1px solid #e8e8e8; border-radius: 12px; padding: 18px 20px; display: flex; align-items: center; justify-content: space-between; margin-bottom: 26px; }
.ni-m-code-label { font-size: 9px; letter-spacing: 0.25em; text-transform: uppercase; color: #ccc; margin-bottom: 4px; }
.ni-m-code-val { font-family: 'Playfair Display', serif; font-size: 28px; font-weight: 500; color: #111; letter-spacing: 0.08em; }
.ni-m-code-copy { padding: 7px 14px; border-radius: 100px; border: 1.5px solid #e0e0e0; background: white; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: #999; cursor: pointer; }
.ni-m-next-steps { border-top: 1px solid #ebebeb; padding-top: 20px; margin-bottom: 24px; }
.ni-m-next-step { display: flex; gap: 14px; padding: 11px 0; border-bottom: 1px solid #f5f5f5; }
.ni-m-next-step:last-child { border-bottom: none; }
.ni-m-step-num { font-family: 'Playfair Display', serif; font-size: 18px; color: #ddd; flex-shrink: 0; }
.ni-m-step-text { font-size: 13px; color: #888; font-weight: 300; line-height: 1.6; }
`

const PERKS = [
  'A monthly wardrobe allowance, yours to keep',
  'First access to new collections before they drop',
  'Invitations to exclusive Nama partner events',
  'A dedicated point of contact for anything you need',
]

const NEXT_STEPS = [
  'Request your first styles from your wardrobe',
  'Drop your affiliate link in your bio to start earning',
  'Early drop access and event invites arrive within 24 hours',
]

export default function InvitePage() {
  const { slug } = useParams()
  const router = useRouter()
  const supabase = createClient()

  const [invite, setInvite] = useState(null)
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState('terms')
  const [selectedDeal, setSelectedDeal] = useState(null)
  const [agreed, setAgreed] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [codeCopied, setCodeCopied] = useState(false)
  const [openFaqIndex, setOpenFaqIndex] = useState(null)

  // Payment step
  const [paymentMethod, setPaymentMethod] = useState(null)
  const [paymentForm, setPaymentForm] = useState({ paypalEmail: '', bankName: '', bankInstitution: '', bankAccount: '', bankRouting: '' })
  const [paymentSubmitting, setPaymentSubmitting] = useState(false)

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
        // No-deal invites go straight to signup
        if (data.deal_type === 'none') {
          setStep('signup')
          setSelectedDeal('none')
        } else {
          // Derive deal type from boolean flags, fallback to deal_type for backwards compat
          const derivedDeal = data.has_retainer ? 'retainer' : data.has_ad_spend ? 'ad_spend' : data.deal_type || 'affiliate'
          if (data.offer_choice) {
            setStep('terms')
            setSelectedDeal('retainer')
          } else {
            setStep('terms')
            setSelectedDeal(derivedDeal)
          }
        }
      }
      setLoading(false)
    }
    if (slug) load()
  }, [slug])

  function switchOption() {
    setAgreed(false)
    setOpenFaqIndex(null)
    setSelectedDeal(prev => prev === 'retainer' ? 'ad_spend' : 'retainer')
    document.querySelector('.ni-panel-right')?.scrollTo({ top: 0, behavior: 'smooth' })
    // Mobile: scroll to top of body
    document.querySelector('.ni-m-body')?.scrollIntoView({ behavior: 'smooth' })
  }

  async function handleSignup() {
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/creators/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inviteId: invite.id,
          creatorName: form.name,
          email: form.email,
          password: form.password,
          commissionRate: invite.commission_rate,
        }),
      })
      const result = await res.json()
      if (!res.ok) {
        setError(result.error || 'Something went wrong creating your account.')
        setSubmitting(false)
        return
      }
      // Sign in the user so they have an active session for the dashboard
      await supabase.auth.signInWithPassword({ email: form.email, password: form.password })
      setStep(selectedDeal === 'none' ? 'done' : 'payment')
    } catch {
      setError('Something went wrong. Please try again.')
    }
    setSubmitting(false)
  }

  async function handlePaymentSubmit() {
    setPaymentSubmitting(true)
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
      await fetch('/api/creators/payment', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch {}
    setPaymentSubmitting(false)
    setStep('done')
  }

  function isPaymentValid() {
    if (!paymentMethod) return false
    if (paymentMethod === 'paypal') return paymentForm.paypalEmail.trim().length > 0
    return paymentForm.bankName.trim().length > 0 && paymentForm.bankAccount.trim().length > 0 && paymentForm.bankRouting.trim().length > 0
  }

  function copyCode() {
    const code = affiliateCode
    if (code) {
      navigator.clipboard.writeText(code)
      setCodeCopied(true)
      setTimeout(() => setCodeCopied(false), 2000)
    }
  }

  if (loading) {
    return (
      <div className="nama-invite" style={{ minHeight: '100vh', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <style>{CSS}</style>
        <div style={{ color: '#888', fontSize: 13, letterSpacing: '0.1em', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>Loading…</div>
      </div>
    )
  }

  if (!invite) {
    return (
      <div className="nama-invite" style={{ minHeight: '100vh', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <style>{CSS}</style>
        <div style={{ textAlign: 'center', color: '#888', fontSize: 14, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
          <p style={{ fontSize: 32, marginBottom: 12 }}>🌸</p>
          <p>This invite link doesn&apos;t exist or has expired.</p>
        </div>
      </div>
    )
  }

  const firstName = invite.creator_name?.split(' ')[0] || ''
  const videos = invite.videos_per_month || null
  const contentType = invite.content_type || null
  const affiliateCode = (invite.creator_name || '')
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12) + '10'

  // Deal data helpers
  const retainerAmount = invite.retainer_amount
  const adSpendPct = invite.ad_spend_percentage
  const adSpendMin = invite.ad_spend_minimum
  const commissionRate = invite.commission_rate || 10
  const minimumCommitment = invite.minimum_commitment || null

  // Determine available deals for choose step
  const availableDeals = []
  if (invite.offer_choice) {
    if (retainerAmount) availableDeals.push('retainer')
    if (adSpendPct) availableDeals.push('ad_spend')
    if (!retainerAmount && !adSpendPct) {
      availableDeals.push('retainer', 'ad_spend')
    }
  }

  const isExisting = invite.is_existing_creator
  const defaultEyebrow = isExisting ? 'A Private Invitation' : 'A Private Invitation'
  const defaultHeadline = isExisting
    ? <>Hi {firstName},<br /><em>let&apos;s make it<br />official.</em></>
    : <>Hi {firstName},<br /><em>let&apos;s make it<br />official.</em></>
  const defaultIntro = isExisting
    ? "You've already shown us what you can do. This is us making it official."
    : "We've truly loved working with you — this is our formal proposal, all in one place."

  // Left panel content per step
  function getLeftContent() {
    if (step === 'terms') {
      if (selectedDeal === 'retainer') {
        return {
          eyebrow: invite.offer_choice ? 'Option A — Retainer' : 'Retainer Partnership',
          headline: <>Guaranteed,<br /><em>every single<br />month.</em></>,
          intro: `$${retainerAmount?.toLocaleString()} paid by the 5th of every month, regardless of views or reach.`,
        }
      }
      if (selectedDeal === 'ad_spend') {
        return {
          eyebrow: invite.offer_choice ? 'Option B — Ad Spend' : 'Ad Spend Partnership',
          headline: <>The more we<br /><em>scale, the more<br />you earn.</em></>,
          intro: `Every dollar we spend on your content earns you ${adSpendPct}% back — with no ceiling.`,
        }
      }
      // affiliate
      return {
        eyebrow: defaultEyebrow,
        headline: defaultHeadline,
        intro: defaultIntro,
      }
    }
    if (step === 'signup') {
      const isNoDeal = selectedDeal === 'none'
      return {
        eyebrow: isNoDeal ? 'Welcome' : 'Almost There',
        headline: <>Create your<br /><em>account.</em></>,
        intro: isNoDeal
          ? 'Set up your login to access your Nama Partners dashboard.'
          : 'Set up your login for your dashboard, wardrobe, and affiliate link.',
      }
    }
    if (step === 'payment') {
      return {
        eyebrow: 'Last Step',
        headline: <>How should<br /><em>we pay you?</em></>,
        intro: "You'll receive your first payment by the 5th of next month.",
      }
    }
    // done
    return {
      eyebrow: "You're In",
      headline: <>Welcome to<br />the <em>Nama<br />family.</em></>,
      intro: 'Your partnership is live. Everything you need is in your dashboard.',
    }
  }

  const left = getLeftContent()

  const hasAffiliateAddon = (invite?.has_affiliate || commissionRate > 0) && (selectedDeal === 'retainer' || selectedDeal === 'ad_spend')

  // Agree text
  function getAgreeText() {
    const commitmentText = minimumCommitment ? `${minimumCommitment}-month minimum` : 'month-to-month'
    const paymentLine = 'Payment is made by the 5th of the following month via your selected payment method.'
    const usageLine = 'I retain ownership of my original content; Nama is licensed to use it for paid media and organic channels during the partnership and for 6 months following the conclusion of the partnership.'

    // Determine which components apply based on selectedDeal and flags
    const isRetainer = selectedDeal === 'retainer'
    const isAdSpend = selectedDeal === 'ad_spend'
    const isAffiliate = selectedDeal === 'affiliate' || (!isRetainer && !isAdSpend)
    const hasAffiliate = hasAffiliateAddon

    const retainerComponent = `I agree to provide ${videos} UGC videos per month in exchange for a $${retainerAmount?.toLocaleString()}/month retainer, with one round of minor revisions per video included. This partnership is ${commitmentText} with 2 weeks notice to end.`
    const adSpendComponent = `I will earn ${adSpendPct}% of Nama's monthly ad spend on my content.`
    const affiliateComponent = `I will earn ${commissionRate}% commission on all completed sales attributed to my unique link or discount code. Returned or refunded orders are excluded.`

    const parts = []

    if (isRetainer && hasAffiliate) {
      parts.push(retainerComponent, `Additionally, ${affiliateComponent.charAt(0).toLowerCase() + affiliateComponent.slice(1)}`)
    } else if (isRetainer) {
      parts.push(retainerComponent)
    } else if (isAdSpend && hasAffiliate) {
      parts.push("I agree to participate in Nama's whitelisting program and affiliate program.", adSpendComponent, affiliateComponent)
    } else if (isAdSpend) {
      parts.push("I agree to participate in Nama's whitelisting program.", adSpendComponent)
    } else if (isAffiliate) {
      parts.push('I agree to promote Nama using my unique affiliate link and discount code.', affiliateComponent)
    }

    parts.push(paymentLine, usageLine)
    return parts.join(' ')
  }

  // --- RENDER HELPERS ---

  function renderRetainerOptionCard(mobile) {
    const sel = selectedDeal === 'retainer'
    if (mobile) {
      return (
        <div>
          <div className={`ni-m-option-card${sel ? ' selected' : ''}`} onClick={() => { setSelectedDeal('retainer'); setAgreed(false) }}>
            <div className="ni-m-check">✓</div>
            <div className="ni-m-option-tag">Option A</div>
            <div className="ni-m-option-rate">${retainerAmount?.toLocaleString()}<sub> /mo</sub></div>
            <div className="ni-m-option-name">Monthly Retainer</div>
            <div className="ni-m-option-rule" />
            <div className="ni-m-option-detail"><div className="ni-m-term-sub">Compensation</div><div className="ni-card-item">${retainerAmount?.toLocaleString()} / month</div>{commissionRate > 0 && <div className="ni-card-item">{commissionRate}% commission on sales</div>}{videos && <><div className="ni-m-term-divider" /><div className="ni-m-term-sub">Deliverables</div><div className="ni-card-item">{videos} videos per month</div></>}</div>
          </div>
        </div>
      )
    }
    return (
      <div>
        <div className={`ni-option-card${sel ? ' selected' : ''}`} onClick={() => { setSelectedDeal('retainer'); setAgreed(false) }}>
          <div className="ni-check">✓</div>
          <div className="ni-option-tag">Option A</div>
          <div className="ni-option-rate">${retainerAmount?.toLocaleString()}<sub> /mo</sub></div>
          <div className="ni-option-name">Monthly Retainer</div>
          <div className="ni-option-rule" />
          <div className="ni-option-detail"><div className="ni-term-sub">Compensation</div><div className="ni-card-item">${retainerAmount?.toLocaleString()} / month</div>{commissionRate > 0 && <div className="ni-card-item">{commissionRate}% commission on sales</div>}{videos && <><div className="ni-term-divider" /><div className="ni-term-sub">Deliverables</div><div className="ni-card-item">{videos} videos per month</div></>}</div>
        </div>
      </div>
    )
  }

  function renderAdSpendOptionCard(mobile) {
    const sel = selectedDeal === 'ad_spend'
    if (mobile) {
      return (
        <div>
          <div className={`ni-m-option-card${sel ? ' selected' : ''}`} onClick={() => { setSelectedDeal('ad_spend'); setAgreed(false) }}>
            <div className="ni-m-check">✓</div>
            <div className="ni-m-option-tag">Option B</div>
            <div className="ni-m-option-rate">{adSpendPct}<sup>%</sup></div>
            <div className="ni-m-option-name">% of Ad Spend</div>
            <div className="ni-m-option-rule" />
            <div className="ni-m-option-detail"><div className="ni-m-term-sub">Compensation</div><div className="ni-card-item">{adSpendPct}% of monthly ad spend</div>{commissionRate > 0 && <div className="ni-card-item">{commissionRate}% commission on sales</div>}{adSpendMin ? <div className="ni-card-item">${adSpendMin.toLocaleString()} minimum in month 1</div> : null}{videos && <><div className="ni-m-term-divider" /><div className="ni-m-term-sub">Deliverables</div><div className="ni-card-item">{videos} videos per month</div></>}</div>
          </div>
        </div>
      )
    }
    return (
      <div>
        <div className={`ni-option-card${sel ? ' selected' : ''}`} onClick={() => { setSelectedDeal('ad_spend'); setAgreed(false) }}>
          <div className="ni-check">✓</div>
          <div className="ni-option-tag">Option B</div>
          <div className="ni-option-rate">{adSpendPct}<sup>%</sup></div>
          <div className="ni-option-name">% of Ad Spend</div>
          <div className="ni-option-rule" />
          <div className="ni-option-detail"><div className="ni-term-sub">Compensation</div><div className="ni-card-item">{adSpendPct}% of monthly ad spend</div>{commissionRate > 0 && <div className="ni-card-item">{commissionRate}% commission on sales</div>}{adSpendMin ? <div className="ni-card-item">${adSpendMin.toLocaleString()} minimum in month 1</div> : null}{videos && <><div className="ni-term-divider" /><div className="ni-term-sub">Deliverables</div><div className="ni-card-item">{videos} videos per month</div></>}</div>
        </div>
      </div>
    )
  }

  function renderDesktopPerks() {
    return (
      <div style={{ marginBottom: 4 }}>
        {PERKS.map((p, i) => (
          <div className="ni-perk-row" key={i}><span className="ni-perk-dot">✓</span>{p}</div>
        ))}
      </div>
    )
  }

  function renderMobilePerks() {
    return (
      <div style={{ marginBottom: 4 }}>
        {PERKS.map((p, i) => (
          <div className="ni-m-perk-row" key={i}><span className="ni-m-perk-dot">✓</span>{p}</div>
        ))}
      </div>
    )
  }

  // --- DESKTOP CONTENT ---
  function renderDesktopContent() {
    if (step === 'terms') {
      if (selectedDeal === 'retainer') {
        return (
          <>
            {invite.offer_choice && (
              <>
                <div className="ni-sec-label">Select Your Structure</div>
                <div className="ni-option-cards">
                  {availableDeals.includes('retainer') && renderRetainerOptionCard(false)}
                  {availableDeals.includes('ad_spend') && renderAdSpendOptionCard(false)}
                </div>
              </>
            )}
            <div className="ni-sec-label">Partnership Terms</div>
            <div className="ni-term-sub">Compensation</div>
            <div className="ni-term-row">
              <span className="ni-term-key">Retainer</span>
              <div className="ni-term-val"><div className="ni-term-primary">${retainerAmount?.toLocaleString()} / month</div><div className="ni-term-secondary">Paid by the 5th of the following month</div></div>
            </div>
            {hasAffiliateAddon && (
              <div className="ni-term-row">
                <span className="ni-term-key">Affiliate</span>
                <div className="ni-term-val"><div className="ni-term-primary">{commissionRate}% commission</div><div className="ni-term-secondary">On your referred sales</div></div>
              </div>
            )}
            {invite.has_ad_spend && adSpendPct > 0 && (
              <div className="ni-term-row">
                <span className="ni-term-key">Ad Spend</span>
                <div className="ni-term-val"><div className="ni-term-primary">{adSpendPct}% of spend</div><div className="ni-term-secondary">On monthly spend attributed to your content</div></div>
              </div>
            )}
            {videos && (<>
              <div className="ni-term-divider" />
              <div className="ni-term-sub">Deliverables</div>
              <div className="ni-term-row">
                <span className="ni-term-key">Content</span>
                <div className="ni-term-val"><div className="ni-term-primary">{videos} videos / month</div>{contentType && <div className="ni-term-secondary">{contentType}</div>}</div>
              </div>
              <div className="ni-term-row">
                <span className="ni-term-key">Contract</span>
                <div className="ni-term-val">
                  {minimumCommitment ? (
                    <><div className="ni-term-primary">{minimumCommitment}-month minimum</div><div className="ni-term-secondary">Month-to-month after that, 2 weeks notice to end</div></>
                  ) : (
                    <><div className="ni-term-primary">Month-to-month</div><div className="ni-term-secondary">2 weeks notice to end</div></>
                  )}
                </div>
              </div>
            </>)}
            <div className="ni-footnote">You retain full ownership of your original content. Nama is licensed to use it for paid media and organic channels during the partnership, and for 6 months following the conclusion of the partnership.</div>
            <div className="ni-sec-label">Partnership Perks</div>
            {renderDesktopPerks()}
            <div className="ni-highlight">
              <div><div className="ni-highlight-tag">Monthly Retainer</div><div className="ni-highlight-val" style={{ fontSize: 48 }}>${retainerAmount?.toLocaleString()}</div></div>
              <div className="ni-highlight-desc">Fixed payment by the 5th of every month. No conditions, no variables.</div>
            </div>
            <div className="ni-sec-label">FAQ&apos;s</div>
            <div className="ni-faq">
              {[
                ['When do I get paid?', 'Payment is sent by the 5th of the following month via your selected payment method.'],
                ['How many revisions are included?', 'Each video includes one round of minor edits — things like text changes, music swaps, or colour correction. Structural re-shoots or concept changes are by mutual agreement.'],
                ['What if Nama needs a full re-shoot?', 'Minor edits are included. If a full re-shoot or concept change is needed, we\'ll discuss it together and agree on terms before proceeding.'],
                ['Is this month-to-month or a fixed contract?', minimumCommitment ? `This partnership has a ${minimumCommitment}-month minimum commitment. After that, it's month-to-month with 2 weeks notice to end — no lock-in.` : 'Month-to-month. Either party can end the partnership with 2 weeks notice — no lock-in.'],
                ['How do I submit my content?', 'Through your Nama Partners dashboard. You\'ll get access immediately after signing up.'],
              ].map(([q, a], i) => (
                <div className="ni-faq-item" key={i}>
                  <div className="ni-faq-q" onClick={() => setOpenFaqIndex(openFaqIndex === i ? null : i)}>
                    <span className="ni-faq-q-text">{q}</span>
                    <span className={`ni-faq-icon${openFaqIndex === i ? ' open' : ''}`}>+</span>
                  </div>
                  {openFaqIndex === i && <div className="ni-faq-a">{a}</div>}
                </div>
              ))}
            </div>
            <div className="ni-agree-row">
              <input type="checkbox" className="ni-agree-box" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
              <p className="ni-agree-text">{getAgreeText()}</p>
            </div>
            <button className="ni-btn" disabled={!agreed} onClick={() => setStep('signup')}>Accept &amp; Create Account →</button>
            {invite.offer_choice && <button className="ni-btn-outline" onClick={switchOption}>← Switch to {selectedDeal === 'retainer' ? '% Ad Spend' : 'Monthly Retainer'}</button>}
          </>
        )
      }

      if (selectedDeal === 'ad_spend') {
        return (
          <>
            {invite.offer_choice && (
              <>
                <div className="ni-sec-label">Select Your Structure</div>
                <div className="ni-option-cards">
                  {availableDeals.includes('retainer') && renderRetainerOptionCard(false)}
                  {availableDeals.includes('ad_spend') && renderAdSpendOptionCard(false)}
                </div>
              </>
            )}
            <div className="ni-sec-label">Partnership Terms</div>
            <div className="ni-term-sub">Compensation</div>
            <div className="ni-term-row">
              <span className="ni-term-key">Ad Spend</span>
              <div className="ni-term-val"><div className="ni-term-primary">{adSpendPct}% of ad spend</div><div className="ni-term-secondary">Paid by the 5th of the following month</div></div>
            </div>
            {hasAffiliateAddon && (
              <div className="ni-term-row">
                <span className="ni-term-key">Affiliate</span>
                <div className="ni-term-val"><div className="ni-term-primary">{commissionRate}% commission</div><div className="ni-term-secondary">On your referred sales</div></div>
              </div>
            )}
            {adSpendMin > 0 && (
              <div className="ni-term-row">
                <span className="ni-term-key">Minimum</span>
                <div className="ni-term-val"><div className="ni-term-primary">${adSpendMin.toLocaleString()} in month 1</div><div className="ni-term-secondary">Guaranteed regardless of spend</div></div>
              </div>
            )}
            {videos && (<>
              <div className="ni-term-divider" />
              <div className="ni-term-sub">Deliverables</div>
              <div className="ni-term-row">
                <span className="ni-term-key">Content</span>
                <div className="ni-term-val"><div className="ni-term-primary">{videos} videos / month</div>{contentType && <div className="ni-term-secondary">{contentType}</div>}</div>
              </div>
              <div className="ni-term-row">
                <span className="ni-term-key">Contract</span>
                <div className="ni-term-val">
                  {minimumCommitment ? (
                    <><div className="ni-term-primary">{minimumCommitment}-month minimum</div><div className="ni-term-secondary">Month-to-month after that, 2 weeks notice to end</div></>
                  ) : (
                    <><div className="ni-term-primary">Month-to-month</div><div className="ni-term-secondary">2 weeks notice to end</div></>
                  )}
                </div>
              </div>
            </>)}
            <div className="ni-footnote">You retain full ownership of your original content. Nama is licensed to use it for paid media and organic channels during the partnership, and for 6 months following the conclusion of the partnership.</div>
            <div className="ni-sec-label">Partnership Perks</div>
            {renderDesktopPerks()}
            <div className="ni-highlight">
              <div><div className="ni-highlight-tag">Ad Spend Commission</div><div className="ni-highlight-val">{adSpendPct}<sup>%</sup></div></div>
              <div className="ni-highlight-desc">Of every dollar we put behind your content. No ceiling, paid monthly.</div>
            </div>
            {adSpendMin > 0 && (
              <div className="ni-min-note">
                <div className="ni-min-note-icon">—</div>
                <div className="ni-min-note-text">To get you started, we&apos;re guaranteeing a minimum of <strong>${adSpendMin.toLocaleString()} in your first month</strong> regardless of how much we spend.</div>
              </div>
            )}
            <div className="ni-sec-label">FAQ&apos;s</div>
            <div className="ni-faq">
              {[
                ['How much will Nama spend on my content?', 'Our system automatically allocates more budget to high-converting content. When your videos perform well, the algorithm picks up spend and scales it — we run flexible budgets specifically to let winning content grow without a cap.'],
                ['How do I know what\'s being spent?', 'You\'ll see a live breakdown of ad spend and your earnings in your dashboard each month, updated in real time.'],
                ['When do I get paid?', 'Earnings are calculated at the end of each month and paid by the 5th of the following month via your selected payment method.'],
                ['How many revisions are included?', 'Each video includes one round of minor edits — things like text changes, music swaps, or colour correction. Structural re-shoots or concept changes are by mutual agreement.'],
                ['What if Nama needs a full re-shoot?', 'Minor edits are included. If a full re-shoot or concept change is needed, we\'ll discuss it together and agree on terms before proceeding.'],
                ['How do I submit my content?', 'Through your Nama Partners dashboard. You\'ll get access immediately after signing up.'],
                ['Is this month-to-month or a fixed contract?', minimumCommitment ? `This partnership has a ${minimumCommitment}-month minimum commitment. After that, it's month-to-month with 2 weeks notice to end — no lock-in.` : 'Month-to-month. Either party can end the partnership with 2 weeks notice — no lock-in.'],
                ['What if my content doesn\'t get much spend in month 1?', 'That\'s what the minimum guarantee is for. You\'re covered regardless of how much we spend while we find what works.'],
              ].map(([q, a], i) => (
                <div className="ni-faq-item" key={i}>
                  <div className="ni-faq-q" onClick={() => setOpenFaqIndex(openFaqIndex === i ? null : i)}>
                    <span className="ni-faq-q-text">{q}</span>
                    <span className={`ni-faq-icon${openFaqIndex === i ? ' open' : ''}`}>+</span>
                  </div>
                  {openFaqIndex === i && <div className="ni-faq-a">{a}</div>}
                </div>
              ))}
            </div>
            <div className="ni-agree-row">
              <input type="checkbox" className="ni-agree-box" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
              <p className="ni-agree-text">{getAgreeText()}</p>
            </div>
            <button className="ni-btn" disabled={!agreed} onClick={() => setStep('signup')}>Accept &amp; Create Account →</button>
            {invite.offer_choice && <button className="ni-btn-outline" onClick={switchOption}>← Switch to {selectedDeal === 'retainer' ? '% Ad Spend' : 'Monthly Retainer'}</button>}
          </>
        )
      }

      // affiliate
      return (
        <>
          <div className="ni-sec-label">Partnership Terms</div>
          <div className="ni-term-sub">Compensation</div>
          <div className="ni-term-row">
            <span className="ni-term-key">Commission</span>
            <div className="ni-term-val"><div className="ni-term-primary">{commissionRate}% per sale</div><div className="ni-term-secondary">Via your unique link &amp; discount code</div></div>
          </div>
          <div className="ni-term-row">
            <span className="ni-term-key">Payment</span>
            <div className="ni-term-val"><div className="ni-term-primary">By the 5th of the following month</div><div className="ni-term-secondary">Via your selected payment method</div></div>
          </div>
          {invite.has_ad_spend && adSpendPct > 0 && (
            <div className="ni-term-row">
              <span className="ni-term-key">Ad Spend</span>
              <div className="ni-term-val"><div className="ni-term-primary">{adSpendPct}% of spend</div><div className="ni-term-secondary">On monthly spend attributed to your content</div></div>
            </div>
          )}
          {videos && (<>
            <div className="ni-term-divider" />
            <div className="ni-term-sub">Deliverables</div>
            <div className="ni-term-row">
              <span className="ni-term-key">Content</span>
              <div className="ni-term-val"><div className="ni-term-primary">{videos} videos / month</div>{contentType && <div className="ni-term-secondary">{contentType}</div>}</div>
            </div>
            <div className="ni-term-row">
              <span className="ni-term-key">Contract</span>
              <div className="ni-term-val">
                {minimumCommitment ? (
                  <><div className="ni-term-primary">{minimumCommitment}-month minimum</div><div className="ni-term-secondary">Month-to-month after that, 2 weeks notice to end</div></>
                ) : (
                  <><div className="ni-term-primary">Month-to-month</div><div className="ni-term-secondary">2 weeks notice to end</div></>
                )}
              </div>
            </div>
          </>)}
          <div className="ni-footnote">You retain full ownership of your original content. Nama is licensed to use it for paid media and organic channels during the partnership, and for 6 months following the conclusion of the partnership.</div>
          <div className="ni-sec-label">Partnership Perks</div>
          {renderDesktopPerks()}
          <div className="ni-highlight">
            <div><div className="ni-highlight-tag">Affiliate Commission</div><div className="ni-highlight-val">{commissionRate}<sup>%</sup></div></div>
            <div className="ni-highlight-desc">On every sale through your link. No cap, paid monthly.</div>
          </div>
          <div className="ni-sec-label">FAQ&apos;s</div>
          <div className="ni-faq">
            {[
              ['How does the tracking work?', 'Every sale made using your unique link or discount code is tracked automatically. You can see your orders and earnings in your Nama Partners dashboard.'],
              ['When do I get paid?', 'Commission is calculated at the end of each month and paid by the 5th of the following month via your selected payment method.'],
              ['What counts as a sale?', 'Any completed order placed using your discount code or affiliate link. Returned or refunded orders are excluded from your commission.'],
              ['Is there a minimum to get paid?', 'No minimum — any commission earned that month gets paid out.'],
            ].map(([q, a], i) => (
              <div className="ni-faq-item" key={i}>
                <div className="ni-faq-q" onClick={() => setOpenFaqIndex(openFaqIndex === i ? null : i)}>
                  <span className="ni-faq-q-text">{q}</span>
                  <span className={`ni-faq-icon${openFaqIndex === i ? ' open' : ''}`}>+</span>
                </div>
                {openFaqIndex === i && <div className="ni-faq-a">{a}</div>}
              </div>
            ))}
          </div>
          <div className="ni-agree-row">
            <input type="checkbox" className="ni-agree-box" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
            <p className="ni-agree-text">{getAgreeText()}</p>
          </div>
          <button className="ni-btn" disabled={!agreed} onClick={() => setStep('signup')}>Accept &amp; Create Account →</button>
        </>
      )
    }

    if (step === 'signup') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '100%' }}>
          <div className="ni-form-group"><label className="ni-form-label">Full Name</label><input className="ni-form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
          <div className="ni-form-group"><label className="ni-form-label">Email Address</label><input className="ni-form-input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="your@email.com" /></div>
          <div className="ni-form-group"><label className="ni-form-label">Create Password</label><input className="ni-form-input" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" /></div>
          <div className="ni-form-group" style={{ marginBottom: 28 }}><label className="ni-form-label">Confirm Password</label><input className="ni-form-input" type="password" value={form.confirmPassword} onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))} placeholder="••••••••" /></div>
          {error && <div className="ni-error">{error}</div>}
          <button className="ni-btn" onClick={handleSignup} disabled={submitting || !form.email || !form.password || !form.confirmPassword}>
            {submitting ? 'Creating account…' : 'Create My Account →'}
          </button>
          {selectedDeal !== 'none' && <p style={{ fontSize: 12, color: '#ccc', textAlign: 'center', marginTop: 14, cursor: 'pointer' }} onClick={() => { setAgreed(false); setStep('terms') }}>← Back to terms</p>}
        </div>
      )
    }

    if (step === 'payment') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '100%' }}>
          <div className="ni-sec-label">Select Payment Method</div>
          <div className="ni-option-cards" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 24 }}>
            <div className={`ni-option-card${paymentMethod === 'paypal' ? ' selected' : ''}`} onClick={() => setPaymentMethod('paypal')}>
              <div className="ni-check">✓</div>
              <div className="ni-option-name">PayPal</div>
              <div className="ni-option-rule" />
              <div className="ni-option-detail">Fast, simple. We send directly to your PayPal account.</div>
            </div>
            <div className={`ni-option-card${paymentMethod === 'bank' ? ' selected' : ''}`} onClick={() => setPaymentMethod('bank')}>
              <div className="ni-check">✓</div>
              <div className="ni-option-name">Bank Transfer</div>
              <div className="ni-option-rule" />
              <div className="ni-option-detail">Direct deposit to your bank account.</div>
            </div>
          </div>
          {paymentMethod === 'paypal' && (
            <div className="ni-form-group">
              <label className="ni-form-label">PayPal Email Address</label>
              <input className="ni-form-input" type="email" value={paymentForm.paypalEmail} onChange={e => setPaymentForm(f => ({ ...f, paypalEmail: e.target.value }))} placeholder="your@paypal.com" />
            </div>
          )}
          {paymentMethod === 'bank' && (
            <>
              <div className="ni-form-group"><label className="ni-form-label">Account Holder Name</label><input className="ni-form-input" value={paymentForm.bankName} onChange={e => setPaymentForm(f => ({ ...f, bankName: e.target.value }))} /></div>
              <div className="ni-form-group"><label className="ni-form-label">Institution Name</label><input className="ni-form-input" value={paymentForm.bankInstitution} onChange={e => setPaymentForm(f => ({ ...f, bankInstitution: e.target.value }))} placeholder="e.g. TD Bank" /></div>
              <div className="ni-form-group"><label className="ni-form-label">Account Number</label><input className="ni-form-input" value={paymentForm.bankAccount} onChange={e => setPaymentForm(f => ({ ...f, bankAccount: e.target.value }))} /></div>
              <div className="ni-form-group" style={{ marginBottom: 28 }}><label className="ni-form-label">Routing / Transit Number</label><input className="ni-form-input" value={paymentForm.bankRouting} onChange={e => setPaymentForm(f => ({ ...f, bankRouting: e.target.value }))} /></div>
            </>
          )}
          <button className="ni-btn" onClick={handlePaymentSubmit} disabled={paymentSubmitting || !isPaymentValid()}>
            {paymentSubmitting ? 'Saving…' : 'Save & Continue →'}
          </button>
          <p style={{ fontSize: 12, color: '#ccc', textAlign: 'center', marginTop: 14, cursor: 'pointer' }} onClick={() => setStep('done')}>Skip for now</p>
        </div>
      )
    }

    // done
    return (
      <>
        <button className="ni-btn" onClick={() => router.push('/creator/dashboard')}>Go to My Dashboard →</button>
      </>
    )
  }

  // --- MOBILE CONTENT ---
  function renderMobileContent() {
    if (step === 'terms') {
      if (selectedDeal === 'retainer') {
        return (
          <>
            {invite.offer_choice && (
              <>
                <div className="ni-m-sec-label">Select Your Structure</div>
                <div className="ni-m-option-cards">
                  {availableDeals.includes('retainer') && renderRetainerOptionCard(true)}
                  {availableDeals.includes('ad_spend') && renderAdSpendOptionCard(true)}
                </div>
              </>
            )}
            <div className="ni-m-sec-label">Partnership Terms</div>
            <div className="ni-m-term-sub">Compensation</div>
            <div className="ni-m-term-row"><span className="ni-m-term-key">Retainer</span><div className="ni-term-val"><div className="ni-m-term-primary">${retainerAmount?.toLocaleString()} / month</div><div className="ni-m-term-secondary">Paid by the 5th of the following month</div></div></div>
            {hasAffiliateAddon && (
              <div className="ni-m-term-row"><span className="ni-m-term-key">Affiliate</span><div className="ni-term-val"><div className="ni-m-term-primary">{commissionRate}% commission</div><div className="ni-m-term-secondary">On your referred sales</div></div></div>
            )}
            {invite.has_ad_spend && adSpendPct > 0 && (
              <div className="ni-m-term-row"><span className="ni-m-term-key">Ad Spend</span><div className="ni-term-val"><div className="ni-m-term-primary">{adSpendPct}% of spend</div><div className="ni-m-term-secondary">On monthly spend attributed to your content</div></div></div>
            )}
            {videos && (<>
              <div className="ni-m-term-divider" />
              <div className="ni-m-term-sub">Deliverables</div>
              <div className="ni-m-term-row"><span className="ni-m-term-key">Content</span><div className="ni-term-val"><div className="ni-m-term-primary">{videos} videos / month</div>{contentType && <div className="ni-m-term-secondary">{contentType}</div>}</div></div>
              <div className="ni-m-term-row"><span className="ni-m-term-key">Contract</span><div className="ni-term-val">{minimumCommitment ? (<><div className="ni-m-term-primary">{minimumCommitment}-month minimum</div><div className="ni-m-term-secondary">Month-to-month after that, 2 weeks notice to end</div></>) : (<><div className="ni-m-term-primary">Month-to-month</div><div className="ni-m-term-secondary">2 weeks notice to end</div></>)}</div></div>
            </>)}
            <div className="ni-m-footnote">You retain full ownership of your original content. Nama is licensed to use it for paid media and organic channels during the partnership, and for 6 months following the conclusion of the partnership.</div>
            <div className="ni-m-sec-label">Perks</div>
            {renderMobilePerks()}
            <div className="ni-m-highlight">
              <div><div className="ni-m-highlight-tag">Monthly Retainer</div><div className="ni-m-highlight-val" style={{ fontSize: 44 }}>${retainerAmount?.toLocaleString()}</div></div>
              <div className="ni-m-highlight-desc">Fixed payment by the 5th of every month.</div>
            </div>
            <div className="ni-m-sec-label">FAQ&apos;s</div>
            <div className="ni-m-faq">
              {[
                ['When do I get paid?', 'Payment is sent by the 5th of the following month via your selected payment method.'],
                ['How many revisions are included?', 'Each video includes one round of minor edits — things like text changes, music swaps, or colour correction. Structural re-shoots or concept changes are by mutual agreement.'],
                ['What if Nama needs a full re-shoot?', 'Minor edits are included. If a full re-shoot or concept change is needed, we\'ll discuss it together and agree on terms before proceeding.'],
                ['Is this month-to-month or a fixed contract?', minimumCommitment ? `This partnership has a ${minimumCommitment}-month minimum commitment. After that, it's month-to-month with 2 weeks notice to end — no lock-in.` : 'Month-to-month. Either party can end the partnership with 2 weeks notice — no lock-in.'],
                ['How do I submit my content?', 'Through your Nama Partners dashboard. You\'ll get access immediately after signing up.'],
              ].map(([q, a], i) => (
                <div className="ni-m-faq-item" key={i}>
                  <div className="ni-m-faq-q" onClick={() => setOpenFaqIndex(openFaqIndex === i ? null : i)}>
                    <span className="ni-m-faq-q-text">{q}</span>
                    <span className={`ni-m-faq-icon${openFaqIndex === i ? ' open' : ''}`}>+</span>
                  </div>
                  {openFaqIndex === i && <div className="ni-m-faq-a">{a}</div>}
                </div>
              ))}
            </div>
            <div className="ni-m-agree-row">
              <input type="checkbox" className="ni-m-agree-box" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
              <p className="ni-m-agree-text">{getAgreeText()}</p>
            </div>
            <button className="ni-m-btn" disabled={!agreed} onClick={() => setStep('signup')}>Accept &amp; Create Account →</button>
            {invite.offer_choice && <button className="ni-m-btn-outline" onClick={switchOption}>← Switch to {selectedDeal === 'retainer' ? '% Ad Spend' : 'Monthly Retainer'}</button>}
          </>
        )
      }

      if (selectedDeal === 'ad_spend') {
        return (
          <>
            {invite.offer_choice && (
              <>
                <div className="ni-m-sec-label">Select Your Structure</div>
                <div className="ni-m-option-cards">
                  {availableDeals.includes('retainer') && renderRetainerOptionCard(true)}
                  {availableDeals.includes('ad_spend') && renderAdSpendOptionCard(true)}
                </div>
              </>
            )}
            <div className="ni-m-sec-label">Partnership Terms</div>
            <div className="ni-m-term-sub">Compensation</div>
            <div className="ni-m-term-row"><span className="ni-m-term-key">Ad Spend</span><div className="ni-term-val"><div className="ni-m-term-primary">{adSpendPct}% of ad spend</div><div className="ni-m-term-secondary">Paid by the 5th of the following month</div></div></div>
            {hasAffiliateAddon && (
              <div className="ni-m-term-row"><span className="ni-m-term-key">Affiliate</span><div className="ni-term-val"><div className="ni-m-term-primary">{commissionRate}% commission</div><div className="ni-m-term-secondary">On your referred sales</div></div></div>
            )}
            {adSpendMin > 0 && (
              <div className="ni-m-term-row"><span className="ni-m-term-key">Minimum</span><div className="ni-term-val"><div className="ni-m-term-primary">${adSpendMin.toLocaleString()} in month 1</div><div className="ni-m-term-secondary">Guaranteed regardless of spend</div></div></div>
            )}
            {videos && (<>
              <div className="ni-m-term-divider" />
              <div className="ni-m-term-sub">Deliverables</div>
              <div className="ni-m-term-row"><span className="ni-m-term-key">Content</span><div className="ni-term-val"><div className="ni-m-term-primary">{videos} videos / month</div>{contentType && <div className="ni-m-term-secondary">{contentType}</div>}</div></div>
              <div className="ni-m-term-row"><span className="ni-m-term-key">Contract</span><div className="ni-term-val">{minimumCommitment ? (<><div className="ni-m-term-primary">{minimumCommitment}-month minimum</div><div className="ni-m-term-secondary">Month-to-month after that, 2 weeks notice to end</div></>) : (<><div className="ni-m-term-primary">Month-to-month</div><div className="ni-m-term-secondary">2 weeks notice to end</div></>)}</div></div>
            </>)}
            <div className="ni-m-footnote">You retain full ownership of your original content. Nama is licensed to use it for paid media and organic channels during the partnership, and for 6 months following the conclusion of the partnership.</div>
            <div className="ni-m-sec-label">Perks</div>
            <div style={{ marginBottom: 20 }}>
              {PERKS.map((p, i) => (
                <div className="ni-m-perk-row" key={i}><span className="ni-m-perk-dot">✓</span>{p}</div>
              ))}
            </div>
            <div className="ni-m-highlight">
              <div><div className="ni-m-highlight-tag">Ad Spend Commission</div><div className="ni-m-highlight-val">{adSpendPct}<sup>%</sup></div></div>
              <div className="ni-m-highlight-desc">Of every dollar behind your content. No ceiling.</div>
            </div>
            {adSpendMin > 0 && (
              <div className="ni-m-min-note">
                <div style={{ fontSize: 12, color: '#999', flexShrink: 0, marginTop: 2 }}>—</div>
                <div className="ni-m-min-note-text">Guaranteed minimum of <strong>${adSpendMin.toLocaleString()} in your first month</strong> regardless of spend.</div>
              </div>
            )}
            <div className="ni-m-sec-label">FAQ&apos;s</div>
            <div className="ni-m-faq">
              {[
                ['How much will Nama spend on my content?', 'Our system automatically allocates more budget to high-converting content. When your videos perform well, the algorithm picks up spend and scales it — we run flexible budgets specifically to let winning content grow without a cap.'],
                ['How do I know what\'s being spent?', 'You\'ll see a live breakdown of ad spend and your earnings in your dashboard each month, updated in real time.'],
                ['When do I get paid?', 'Earnings are calculated at the end of each month and paid by the 5th of the following month via your selected payment method.'],
                ['How many revisions are included?', 'Each video includes one round of minor edits — things like text changes, music swaps, or colour correction. Structural re-shoots or concept changes are by mutual agreement.'],
                ['What if Nama needs a full re-shoot?', 'Minor edits are included. If a full re-shoot or concept change is needed, we\'ll discuss it together and agree on terms before proceeding.'],
                ['How do I submit my content?', 'Through your Nama Partners dashboard. You\'ll get access immediately after signing up.'],
                ['Is this month-to-month or a fixed contract?', minimumCommitment ? `This partnership has a ${minimumCommitment}-month minimum commitment. After that, it's month-to-month with 2 weeks notice to end — no lock-in.` : 'Month-to-month. Either party can end the partnership with 2 weeks notice — no lock-in.'],
                ['What if my content doesn\'t get much spend in month 1?', 'That\'s what the minimum guarantee is for. You\'re covered regardless of how much we spend while we find what works.'],
              ].map(([q, a], i) => (
                <div className="ni-m-faq-item" key={i}>
                  <div className="ni-m-faq-q" onClick={() => setOpenFaqIndex(openFaqIndex === i ? null : i)}>
                    <span className="ni-m-faq-q-text">{q}</span>
                    <span className={`ni-m-faq-icon${openFaqIndex === i ? ' open' : ''}`}>+</span>
                  </div>
                  {openFaqIndex === i && <div className="ni-m-faq-a">{a}</div>}
                </div>
              ))}
            </div>
            <div className="ni-m-agree-row">
              <input type="checkbox" className="ni-m-agree-box" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
              <p className="ni-m-agree-text">{getAgreeText()}</p>
            </div>
            <button className="ni-m-btn" disabled={!agreed} onClick={() => setStep('signup')}>Accept &amp; Create Account →</button>
            {invite.offer_choice && <button className="ni-m-btn-outline" onClick={switchOption}>← Switch to {selectedDeal === 'retainer' ? '% Ad Spend' : 'Monthly Retainer'}</button>}
          </>
        )
      }

      // affiliate
      return (
        <>
          <div className="ni-m-sec-label">Partnership Terms</div>
          <div className="ni-m-term-sub">Compensation</div>
          <div className="ni-m-term-row"><span className="ni-m-term-key">Commission</span><div className="ni-term-val"><div className="ni-m-term-primary">{commissionRate}% per sale</div><div className="ni-m-term-secondary">Via your unique link &amp; discount code</div></div></div>
          <div className="ni-m-term-row"><span className="ni-m-term-key">Payment</span><div className="ni-term-val"><div className="ni-m-term-primary">By the 5th of the following month</div><div className="ni-m-term-secondary">Via your selected payment method</div></div></div>
          {invite.has_ad_spend && adSpendPct > 0 && (
            <div className="ni-m-term-row"><span className="ni-m-term-key">Ad Spend</span><div className="ni-term-val"><div className="ni-m-term-primary">{adSpendPct}% of spend</div><div className="ni-m-term-secondary">On monthly spend attributed to your content</div></div></div>
          )}
          {videos && (<>
            <div className="ni-m-term-divider" />
            <div className="ni-m-term-sub">Deliverables</div>
            <div className="ni-m-term-row"><span className="ni-m-term-key">Content</span><div className="ni-term-val"><div className="ni-m-term-primary">{videos} videos / month</div>{contentType && <div className="ni-m-term-secondary">{contentType}</div>}</div></div>
            <div className="ni-m-term-row"><span className="ni-m-term-key">Contract</span><div className="ni-term-val">{minimumCommitment ? (<><div className="ni-m-term-primary">{minimumCommitment}-month minimum</div><div className="ni-m-term-secondary">Month-to-month after that, 2 weeks notice to end</div></>) : (<><div className="ni-m-term-primary">Month-to-month</div><div className="ni-m-term-secondary">2 weeks notice to end</div></>)}</div></div>
          </>)}
          <div className="ni-m-footnote">You retain full ownership of your original content. Nama is licensed to use it for paid media and organic channels during the partnership, and for 6 months following the conclusion of the partnership.</div>
          <div className="ni-m-sec-label">Perks</div>
          {renderMobilePerks()}
          <div className="ni-m-highlight">
            <div><div className="ni-m-highlight-tag">Affiliate Commission</div><div className="ni-m-highlight-val">{commissionRate}<sup>%</sup></div></div>
            <div className="ni-m-highlight-desc">On every sale through your link. No cap.</div>
          </div>
          <div className="ni-m-sec-label">FAQ&apos;s</div>
          <div className="ni-m-faq">
            {[
              ['How does the tracking work?', 'Every sale made using your unique link or discount code is tracked automatically. You can see your orders and earnings in your Nama Partners dashboard.'],
              ['When do I get paid?', 'Commission is calculated at the end of each month and paid by the 5th of the following month via your selected payment method.'],
              ['What counts as a sale?', 'Any completed order placed using your discount code or affiliate link. Returned or refunded orders are excluded from your commission.'],
              ['Is there a minimum to get paid?', 'No minimum — any commission earned that month gets paid out.'],
            ].map(([q, a], i) => (
              <div className="ni-m-faq-item" key={i}>
                <div className="ni-m-faq-q" onClick={() => setOpenFaqIndex(openFaqIndex === i ? null : i)}>
                  <span className="ni-m-faq-q-text">{q}</span>
                  <span className={`ni-m-faq-icon${openFaqIndex === i ? ' open' : ''}`}>+</span>
                </div>
                {openFaqIndex === i && <div className="ni-m-faq-a">{a}</div>}
              </div>
            ))}
          </div>
          <div className="ni-m-agree-row">
            <input type="checkbox" className="ni-m-agree-box" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
            <p className="ni-m-agree-text">{getAgreeText()}</p>
          </div>
          <button className="ni-m-btn" disabled={!agreed} onClick={() => setStep('signup')}>Accept &amp; Create Account →</button>
        </>
      )
    }

    if (step === 'signup') {
      return (
        <>
          <div className="ni-m-form-group"><label className="ni-m-form-label">Full Name</label><input className="ni-m-form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
          <div className="ni-m-form-group"><label className="ni-m-form-label">Email</label><input className="ni-m-form-input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="your@email.com" /></div>
          <div className="ni-m-form-group"><label className="ni-m-form-label">Password</label><input className="ni-m-form-input" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" /></div>
          <div className="ni-m-form-group" style={{ marginBottom: 24 }}><label className="ni-m-form-label">Confirm Password</label><input className="ni-m-form-input" type="password" value={form.confirmPassword} onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))} placeholder="••••••••" /></div>
          {error && <div className="ni-error">{error}</div>}
          <button className="ni-m-btn" onClick={handleSignup} disabled={submitting || !form.email || !form.password || !form.confirmPassword}>
            {submitting ? 'Creating account…' : 'Create My Account →'}
          </button>
          {selectedDeal !== 'none' && <p style={{ fontSize: 12, color: '#ccc', textAlign: 'center', marginTop: 14, cursor: 'pointer' }} onClick={() => { setAgreed(false); setStep('terms') }}>← Back to terms</p>}
        </>
      )
    }

    if (step === 'payment') {
      return (
        <>
          <div className="ni-m-sec-label">Select Payment Method</div>
          <div className="ni-m-option-cards" style={{ marginBottom: 20 }}>
            <div className={`ni-m-option-card${paymentMethod === 'paypal' ? ' selected' : ''}`} onClick={() => setPaymentMethod('paypal')}>
              <div className="ni-m-check">✓</div>
              <div className="ni-m-option-name">PayPal</div>
              <div className="ni-m-option-rule" />
              <div className="ni-m-option-detail">Fast, simple. We send directly to your PayPal account.</div>
            </div>
            <div className={`ni-m-option-card${paymentMethod === 'bank' ? ' selected' : ''}`} onClick={() => setPaymentMethod('bank')}>
              <div className="ni-m-check">✓</div>
              <div className="ni-m-option-name">Bank Transfer</div>
              <div className="ni-m-option-rule" />
              <div className="ni-m-option-detail">Direct deposit to your bank account.</div>
            </div>
          </div>
          {paymentMethod === 'paypal' && (
            <div className="ni-m-form-group">
              <label className="ni-m-form-label">PayPal Email Address</label>
              <input className="ni-m-form-input" type="email" value={paymentForm.paypalEmail} onChange={e => setPaymentForm(f => ({ ...f, paypalEmail: e.target.value }))} placeholder="your@paypal.com" />
            </div>
          )}
          {paymentMethod === 'bank' && (
            <>
              <div className="ni-m-form-group"><label className="ni-m-form-label">Account Holder Name</label><input className="ni-m-form-input" value={paymentForm.bankName} onChange={e => setPaymentForm(f => ({ ...f, bankName: e.target.value }))} /></div>
              <div className="ni-m-form-group"><label className="ni-m-form-label">Institution Name</label><input className="ni-m-form-input" value={paymentForm.bankInstitution} onChange={e => setPaymentForm(f => ({ ...f, bankInstitution: e.target.value }))} placeholder="e.g. TD Bank" /></div>
              <div className="ni-m-form-group"><label className="ni-m-form-label">Account Number</label><input className="ni-m-form-input" value={paymentForm.bankAccount} onChange={e => setPaymentForm(f => ({ ...f, bankAccount: e.target.value }))} /></div>
              <div className="ni-m-form-group" style={{ marginBottom: 24 }}><label className="ni-m-form-label">Routing / Transit Number</label><input className="ni-m-form-input" value={paymentForm.bankRouting} onChange={e => setPaymentForm(f => ({ ...f, bankRouting: e.target.value }))} /></div>
            </>
          )}
          <button className="ni-m-btn" onClick={handlePaymentSubmit} disabled={paymentSubmitting || !isPaymentValid()}>
            {paymentSubmitting ? 'Saving…' : 'Save & Continue →'}
          </button>
          <p style={{ fontSize: 12, color: '#ccc', textAlign: 'center', marginTop: 14, cursor: 'pointer' }} onClick={() => setStep('done')}>Skip for now</p>
        </>
      )
    }

    // done
    return (
      <>
        <button className="ni-m-btn" onClick={() => router.push('/creator/dashboard')}>Go to My Dashboard →</button>
      </>
    )
  }

  // Mobile hero content
  function getMobileHero() {
    if (step === 'terms') {
      if (selectedDeal === 'retainer') {
        return (
          <>
            <div className="ni-m-eyebrow">{invite.offer_choice ? 'Option A — Retainer' : 'Retainer Partnership'}</div>
            <div className="ni-m-headline">Guaranteed,<br /><em>every month.</em></div>
          </>
        )
      }
      if (selectedDeal === 'ad_spend') {
        return (
          <>
            <div className="ni-m-eyebrow">{invite.offer_choice ? 'Option B — Ad Spend' : 'Ad Spend Partnership'}</div>
            <div className="ni-m-headline">The more we<br /><em>scale, the<br />more you earn.</em></div>
          </>
        )
      }
      return (
        <>
          <div className="ni-m-eyebrow">{defaultEyebrow}</div>
          <div className="ni-m-headline">{<>Hi {firstName},<br /><em>let&apos;s make it<br />official.</em></>}</div>
        </>
      )
    }
    if (step === 'signup') {
      return (
        <>
          <div className="ni-m-eyebrow">{selectedDeal === 'none' ? 'Welcome' : 'Almost There'}</div>
          <div className="ni-m-headline">Create your<br /><em>account.</em></div>
        </>
      )
    }
    if (step === 'payment') {
      return (
        <>
          <div className="ni-m-eyebrow">Last Step</div>
          <div className="ni-m-headline">How should<br /><em>we pay you?</em></div>
          <p className="ni-m-intro">You&apos;ll receive your first payment by the 5th of next month.</p>
        </>
      )
    }
    return (
      <>
        <div className="ni-m-eyebrow">You&apos;re In</div>
        <div className="ni-m-headline">Welcome to<br />the <em>Nama<br />family.</em></div>
      </>
    )
  }

  return (
    <div className="nama-invite" style={{ background: '#f0f0f0', minHeight: '100vh' }}>
      <style>{CSS}</style>

      {/* Desktop */}
      <div className="ni-desktop">
        <div className={`ni-page${step === 'done' ? ' ni-done-page' : ''}`}>
          <div className="ni-panel-left">
            <div className="ni-logo-lockup"><img src="/nama-logo.svg" alt="Nama" className="ni-logo" /><div className="ni-logo-sub">Partners</div></div>
            <div>
              <div className="ni-eyebrow">{left.eyebrow}</div>
              <div className="ni-headline">{left.headline}</div>
              {left.intro && <p className="ni-intro">{left.intro}</p>}
            </div>
            <div className="ni-left-footer">namaclo.com</div>
          </div>
          <div className="ni-panel-right">
            {renderDesktopContent()}
          </div>
          {step === 'done' && (
            <div className="ni-done-center">
              <div className="ni-logo-lockup"><img src="/nama-logo.svg" alt="Nama" className="ni-logo" /><div className="ni-logo-sub">Partners</div></div>
              <div className="ni-done-content">
                <div className="ni-eyebrow">{left.eyebrow}</div>
                <div className="ni-headline">{left.headline}</div>
                <p className="ni-intro">{left.intro}</p>
              </div>
              <button className="ni-btn" onClick={() => router.push('/creator/dashboard')}>Go to My Dashboard →</button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile */}
      <div className="ni-mobile">
        <div className="ni-m-wrap">
          {step === 'done' ? (
            <div className="ni-m-inner">
              <div className="ni-m-done-center">
                <div className="ni-m-logo-lockup"><img src="/nama-logo.svg" alt="Nama" className="ni-m-logo" /><div className="ni-m-logo-sub">Partners</div></div>
                <div className="ni-m-done-content">
                  <div className="ni-m-eyebrow">You&apos;re In</div>
                  <div className="ni-m-headline">Welcome to<br />the <em>Nama<br />family.</em></div>
                  <p className="ni-m-intro">Your partnership is live. Everything you need is in your dashboard.</p>
                </div>
                <button className="ni-m-btn" onClick={() => router.push('/creator/dashboard')}>Go to My Dashboard →</button>
              </div>
            </div>
          ) : (
            <div className="ni-m-inner">
              <div className="ni-m-topbar"><div className="ni-m-logo-lockup"><img src="/nama-logo.svg" alt="Nama" className="ni-m-logo" /><div className="ni-m-logo-sub">Partners</div></div></div>
              <div className="ni-m-hero">{getMobileHero()}</div>
              <div className="ni-m-body">{renderMobileContent()}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
