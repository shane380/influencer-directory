# CLAUDE.md

## Automated bug-fix agent — global guardrails

When invoked by the GitHub Action to fix a bug, follow the shared guardrails:

@.claude/global-bot-rules.md

The section below adds rules specific to this repo (`influencer-directory`).

## Repo profile — influencer-directory

- **Stack:** Next.js App Router, TypeScript, Tailwind CSS, Supabase.
- **Build command:** `npm run build`
- **Lint command:** `npm run lint`
- **No test suite.** There is no automated test command — rely on build + lint,
  and list explicit manual-testing steps in the PR description.
- Database types live in `src/types/database.ts`.

### Off-limits paths (maps the global §2 rules to this repo)

Do **not** modify these — stop and comment on the issue instead:

- **DB schema / migrations:** `supabase/migrations/**`, `supabase/**`
- **Auth & middleware:** `src/middleware.ts`, any Supabase auth/session code
- **Dependencies:** `package.json`, `package-lock.json`
- **CI / secrets / env:** `.github/workflows/**`, `.env*`, and any new code that
  reads `process.env`

## Pre-Commit Self-Review

Before committing any change that involves conditional rendering or logic based on DB fields:

1. **Check actual data.** Query Supabase for at least one real record to verify field values and types. Don't assume boolean flags are set, amounts are non-null, or related fields are populated together.

2. **Null/falsy edge case audit.** For every DB field used in a condition, ask: "What if this is null, 0, undefined, or false?" Trace each code path with those values.

3. **Walk through each render branch.** Confirm that every combination of flags/values produces a sensible result — no blank sections, no "undefined" in text, no crashes on `.toLocaleString()` of null.

4. **Verify the full chain.** If page A passes data to page B (e.g. via query params), confirm the param is actually present in the URL and that page B handles the case where it's missing.

5. **Check middleware/auth for new routes.** When creating a new page route, check `src/middleware.ts` to confirm it's accessible. Public-facing pages (terms, invite flows, etc.) must be added to the public routes whitelist or they'll redirect to login.
