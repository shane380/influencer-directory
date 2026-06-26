# Creator Dashboard — Design System

Type, color, and layout spec for the creator dashboard
(`src/app/creator/dashboard/page.jsx`). Values are taken directly from the
page's stylesheet — hand this to a design tool to replicate the look from a
screenshot.

## Typefaces

| Font | Role | Source / loading |
|---|---|---|
| **Playfair Display** (serif) | All display numbers + section headings | Google Fonts — `Playfair Display:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500` (loaded in `src/app/layout.tsx`) |
| **Helvetica Neue** → Helvetica → Arial (sans-serif) | All labels, body text, eyebrows, buttons, nav | system stack |
| **DM Sans** (sans-serif) | A few campaign-card body bits only | Google Fonts |
| **Inter** | App-wide default, but the dashboard overrides to Helvetica Neue | `next/font/google` in `layout.tsx` |

The signature look = **light-weight serif numbers** + **tiny wide-tracked
uppercase gray sans labels**.

## Color tokens

| Token | Hex | Use |
|---|---|---|
| Text / primary | `#111` | Headings, numbers, body |
| Muted | `#aaa` | Labels, eyebrows, nav links |
| Muted 2 | `#999` | Secondary text, currency signs, captions |
| Body subtle | `#555` | Pill text |
| Hairline | `#e8e8e8` | Borders, dividers, eyebrow rules |
| Hairline light | `#f5f5f5` | Inner row dividers, input bg |
| Surface | `#fff` | Cards |
| Surface alt | `#fafafa` / `#f5f5f5` | Inputs, skeletons (`#f0f0f0`) |
| Inverse | `#fff` on `#111` | Primary buttons |
| Accent green | `#2e7d32`-ish | "STRONG" / +% deltas |
| Danger | `#c0392b` | Cancel/remove links |

## Element spec

| Element | Font | Size | Weight | Letter-spacing | Case | Color |
|---|---|---|---|---|---|---|
| Creator name | Playfair Display | 30px | 400 | — | — | #111 |
| Section eyebrow (AD SPEND COMMISSION, PAID MEDIA) | Helvetica Neue | 9px | 400 | 0.4em | UPPER | #aaa |
| Section title (Your Earnings, Live Ads) | Playfair Display | 30px | 300 | — | — | #111 |
| Big hero number (e.g. $4) | Playfair Display | 72px | 300 | — | — | #111 |
| Currency sign by hero number | Playfair Display | 22px | 300 | — | — | #999 |
| Hero sub-label (JUNE 2026 — IN PROGRESS) | Helvetica Neue | 9px | 400 | 0.32em | UPPER | #aaa |
| Earnings context line | Helvetica Neue | 12px | 300 | — | — | #999 |
| Projection label (MONTH-END PROJECTION) | Helvetica Neue | 9px | 400 | 0.22em | UPPER | #aaa |
| Projection value | Playfair Display | 32px | 300 | — | — | #111 |
| Projection note | Helvetica Neue | 11px | 400 | — | — | #999 |
| Progress label (PROGRESS TO $500…) | Helvetica Neue | 9px | 400 | 0.22em | UPPER | #aaa |
| Progress value | Playfair Display | 15px | 400 | — | — | #111 |
| Stat label (TOTAL SPENT…, IMPRESSIONS) | Helvetica Neue | 9px | 400 | 0.22em | UPPER | #aaa |
| Momentum / Live Ads stat value ($2.0K, 104.9K) | Playfair Display | 36px | 300 | — | — | #111 |
| Affiliate stat value | Playfair Display | 28px | 300 | — | — | #111 |
| Stats-bar value (sidebar) | Playfair Display | 18px | 400 | — | — | #111 |
| Stats-bar label | Helvetica Neue | 9px | 400 | 0.22em | UPPER | #aaa |
| Top-nav links (STATS, CAMPAIGNS…) | Helvetica Neue | 10px | 400 | 0.18em | UPPER | #aaa |
| Affiliate code display | Playfair Display | 22px | 400 | 0.06em | — | #111 |
| Card title (generic) | Playfair Display | 30px | 300 | — | — | #111 |
| Empty-state title | Playfair Display | 22px | 300 (italic) | — | — | #111 |
| Primary button (dark) | Helvetica Neue | 9–10px | 500 | 0.18–0.22em | UPPER | #fff on #111 |
| Outline button | Helvetica Neue | 11px | 500 | 2.5px | UPPER | #1a1a1a, border #e8e8e8 |
| Back link | Helvetica Neue | 11px | 400 | 0.08em | UPPER | #aaa |
| Copy/secondary chip | Helvetica Neue | 8.5px | 400 | 0.12em | UPPER | #999 |

## Patterns / rules of thumb

- **Numbers & headings:** always Playfair Display, **weight 300** (light),
  `line-height: 1`, color `#111`. Hierarchy by size only:
  hero `72px` → titles `30px` → secondary values `28–36px` → small `15–18px`.
- **Labels:** always Helvetica Neue, **`9px`**, `text-transform: uppercase`,
  color `#aaa`, wide tracking `0.22em` (eyebrows go wider, `0.4em`).
  Nav links are `10px / 0.18em`.
- **Eyebrows** are followed by a **32px × 1px** hairline rule in `#e8e8e8`
  (`::after { width: 32px; height: 1px; background: #e8e8e8 }`).
- **Dividers:** 1px hairlines in `#e8e8e8` between sections; `#f5f5f5` for inner
  rows.
- **Cards:** white surface, `1px solid #e8e8e8` border, generous padding
  (~`32px 36px`).
- **Deltas / status chips:** green for positive (+15%, STRONG), small uppercase.
- **Skeleton/loading:** `#f0f0f0` blocks, `border-radius: 4px`, pulse animation.
- Overall feel: editorial, lots of whitespace, near-black on white, hairline
  rules, light serif numerals against tiny wide-tracked gray caps.
