# CLAUDE.md

## Pre-Commit Self-Review

Before committing any change that involves conditional rendering or logic based on DB fields:

1. **Check actual data.** Query Supabase for at least one real record to verify field values and types. Don't assume boolean flags are set, amounts are non-null, or related fields are populated together.

2. **Null/falsy edge case audit.** For every DB field used in a condition, ask: "What if this is null, 0, undefined, or false?" Trace each code path with those values.

3. **Walk through each render branch.** Confirm that every combination of flags/values produces a sensible result — no blank sections, no "undefined" in text, no crashes on `.toLocaleString()` of null.

4. **Verify the full chain.** If page A passes data to page B (e.g. via query params), confirm the param is actually present in the URL and that page B handles the case where it's missing.

5. **Check middleware/auth for new routes.** When creating a new page route, check `src/middleware.ts` to confirm it's accessible. Public-facing pages (terms, invite flows, etc.) must be added to the public routes whitelist or they'll redirect to login.
