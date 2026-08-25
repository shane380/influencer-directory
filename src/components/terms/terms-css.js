export const TERMS_CSS = `
.ct-page { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #111; max-width: 680px; margin: 0 auto; padding: 56px 32px 80px; min-height: 100vh; background: white; }
@media (max-width: 768px) { .ct-page { padding: 40px 24px 64px; } }
.ct-back { font-size: 12px; color: #999; text-decoration: none; display: inline-flex; align-items: center; gap: 4px; margin-bottom: 40px; }
.ct-back:hover { color: #333; }
.ct-logo-lockup { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; margin-bottom: 40px; }
.ct-logo { height: 28px; display: block; }
.ct-logo-sub { font-size: 8.5px; letter-spacing: 0.4em; text-transform: uppercase; color: #aaa; }
.ct-title { font-family: 'Playfair Display', serif; font-size: 36px; font-weight: 300; color: #111; line-height: 1.1; margin-bottom: 8px; }
@media (max-width: 768px) { .ct-title { font-size: 30px; } }
.ct-meta { font-size: 12px; color: #999; margin-bottom: 40px; }
.ct-section { margin-bottom: 32px; }
.ct-section-title { font-family: 'Playfair Display', serif; font-size: 20px; font-weight: 400; color: #111; margin-bottom: 12px; }
.ct-body { font-size: 14px; color: #555; font-weight: 300; line-height: 1.85; }
.ct-body p { margin-bottom: 12px; }
.ct-body p:last-child { margin-bottom: 0; }
.ct-body ul { margin: 8px 0 12px 0; padding-left: 20px; list-style: disc outside; }
.ct-body li { margin-bottom: 6px; }
.ct-body a { color: #333; text-decoration: underline; text-underline-offset: 2px; }
.ct-body a:hover { color: #111; }
.ct-divider { height: 1px; background: #ebebeb; margin: 32px 0; }
.ct-sub { margin-bottom: 24px; padding-left: 20px; border-left: 1px solid #ebebeb; }
.ct-sub-title { font-family: 'Playfair Display', serif; font-size: 16px; font-weight: 400; color: #222; margin-bottom: 10px; }
`

export const TERMS_SUPERSEDED_CSS = `
.ct-superseded { border: 1px solid #e8d9b0; background: #fdfaf1; padding: 14px 16px; margin-bottom: 32px; font-size: 12.5px; color: #6b5b32; font-weight: 300; line-height: 1.7; }
.ct-superseded a { color: #6b5b32; text-decoration: underline; text-underline-offset: 2px; }
`
