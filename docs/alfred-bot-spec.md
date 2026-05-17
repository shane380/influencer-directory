# Alfred — Slack ⇄ GitHub Routing Bot

> Handoff spec for whoever builds Alfred. Alfred is the renamed OpenClaw bot.
> This doc is repo-agnostic where possible; values specific to
> `influencer-directory` are marked **(repo-specific)** and should be
> per-repo config when Alfred runs across multiple repos.

## 1. Role — plumbing only

Alfred does **no thinking and no code changes**. It is a router. All bug
analysis and fixing is done by the **Claude Code GitHub Action** (a separate
system). Alfred only moves information between Slack and GitHub.

Alfred's four jobs:

1. **Slack → issue** — turn a reported bug into a GitHub issue.
2. **Relay preview** — post the PR's Vercel preview link back to the Slack thread.
3. **Gate on confirmation** — when the Slack reporter reacts ✅, route the PR
   per the approval rules in §6.
4. **Report outcome** — tell the Slack thread when the PR merges (or fails CI).

Alfred must **never** push commits, edit files, or open PRs. If it ever needs
to, that's a bug in the design.

## 2. End-to-end flow

```
Slack bug report
  → Alfred: POST /issues   (body MUST contain "@claude")
  → Claude Action fixes it, opens a DRAFT PR  ("Fixes #<issue>")
  → Vercel posts a preview deployment on the PR
  → Alfred: relay preview URL to the Slack thread
  → reporter tests preview, reacts ✅
  → Alfred: apply §6 routing → either auto-merge, or hold for Shane
  → CI (build-and-lint) passes + approvals satisfied → GitHub merges
  → Alfred: post "merged ✅" to the Slack thread
```

## 3. Alfred's GitHub identity — a GitHub App

Register Alfred as its **own GitHub App** (github.com/settings/apps/new).
**Do not use a personal access token** — PATs are long-lived, tied to a human,
and a leak risk. A GitHub App gives Alfred a distinct identity (`alfred[bot]`),
short-lived tokens, and scoped permissions. Install it on the same repos as
the Claude app.

Alfred being a **separate identity from Claude** matters: Claude authors the
PRs, Alfred approves them. A bot cannot approve its own PR — since Alfred never
authors PRs, it is always allowed to approve Claude's.

### Repository permissions

| Permission     | Level        | Used for                                            |
|----------------|--------------|-----------------------------------------------------|
| Issues         | Read & write | Create issues from Slack reports                    |
| Pull requests  | Read & write | Read changed files/preview, mark-ready, approve, auto-merge |
| Contents       | Read & write | Required for the merge operation to write the branch |
| Metadata       | Read         | Mandatory (granted automatically)                   |

### Webhook event subscriptions

| Event               | Why Alfred needs it                                    |
|---------------------|--------------------------------------------------------|
| `pull_request`      | Detect when Claude opens a PR → map it to a Slack thread |
| `deployment_status` | Detect when the Vercel preview is ready → grab the URL |
| `check_suite` / `status` | Detect CI pass/fail to report back to Slack       |

## 4. Operations & API calls

### 4a. Create issue (Slack → GitHub)
`POST /repos/{owner}/{repo}/issues`
- The issue **body must contain the literal string `@claude`** — that is the
  trigger for the Claude Action. Without it, nothing happens.
- Include the reporter's description verbatim. Do **not** paste real customer
  data if the Slack report contains any — summarise instead.
- Record the mapping: `slack_thread_ts ↔ issue_number`.

### 4b. Detect the PR (GitHub → Alfred)
On `pull_request.opened` webhook: read the PR body for `Fixes #<n>` /
`Closes #<n>` to find the originating issue, then look up the Slack thread.
Record `issue_number ↔ pr_number`.

> Claude may instead **comment on the issue without opening a PR** (when the
> bug is ambiguous, too large, or off-limits — see the bot guardrails). Alfred
> must handle this: relay the comment to Slack as "needs a human" and stop.

### 4c. Relay the preview link
On `deployment_status` (state `success`) for the PR's branch, take the
`target_url` (the Vercel preview) and post it into the Slack thread:
"Fix ready — test it here: <url>, then react ✅ if it works."

### 4d. On reporter ✅ — apply §6 routing
- If §6 says **reporter ✅ is enough**: mark ready → approve → enable auto-merge
  (three calls, §5).
- If §6 says **Shane must approve**: do **not** enable auto-merge on the
  reporter's ✅ alone. Post to Slack tagging Shane with the reason(s), and wait.
  Proceed to merge only once Shane has approved (on GitHub, or a Shane ✅ in
  the Slack thread that Alfred treats as authorisation).

### The three merge calls
1. **Mark ready** — GraphQL `markPullRequestReadyForReview` (draft PRs cannot
   merge; this un-drafts it).
2. **Approve** — `POST /repos/{o}/{r}/pulls/{n}/reviews` with `event: APPROVE`.
3. **Enable auto-merge** — GraphQL `enablePullRequestAutoMerge`. GitHub merges
   automatically once required checks (`build-and-lint`) and required approvals
   are satisfied. Never call the merge endpoint directly — auto-merge keeps CI
   as a gate.

## 5. State Alfred must track

A small persistent store keyed per fix:
`slack_thread_ts ↔ issue_number ↔ pr_number ↔ status`.
Without it, Alfred cannot route a webhook back to the right Slack thread.

## 6. Who must approve — fail-closed routing

**Principle: Shane's approval is required by default.** The reporter's ✅ is
sufficient *only* when Alfred can positively confirm the PR is tiny and purely
cosmetic. If Alfred is unsure, missing data, or buggy → it routes to Shane.

### Reporter ✅ alone is enough ONLY IF ALL FOUR hold

1. Total diff **≤ ~30 lines** (`additions + deletions` from the PR API).
2. **No** changed file matches any SENSITIVE glob (table below).
3. Claude's PR body declares **`Change type: cosmetic`**.
4. Claude's PR body declares **`Blast radius: single creator`** (or `none`).

If any one fails — or any required declaration is missing — **Shane must
approve.** Cosmetic = display only: copy, colours, layout, spacing, and filters
on display-only views.

### Shane must approve if the PR has ANY of these

| Trigger | How Alfred detects it |
|---|---|
| Payments | changed file matches a payments glob |
| Auth | changed file matches an auth glob |
| Database / schema | `supabase/**`, `*.sql` |
| Shopify | file path matches `*shopify*` |
| Meta API | file path matches `*meta*` / `*facebook*` / `*instagram*` API code |
| Permissions / roles | middleware, `*permission*` / `*role*` files |
| **Over ~30 lines** | PR `additions + deletions > 30` |
| **Affects multiple creators** | Claude declares `Blast radius: multiple creators` or `system-wide` |
| Any API route | path under `src/app/api/**` (most touch data — default to Shane) |

### Two enforcement layers (defense in depth)

1. **GitHub-native hard gate — CODEOWNERS.** For the *path-based* categories
   (payments, auth, database, Shopify, Meta, permissions, API routes), a
   `.github/CODEOWNERS` file maps those paths to `@shane380`, plus **"Require
   review from Code Owners"** enabled in `main` branch protection. These PRs
   **cannot merge without Shane even if Alfred malfunctions.**

2. **Alfred routing logic.** Two triggers — **>30 lines** and **multiple
   creators** — *cannot* be expressed in CODEOWNERS (GitHub has no line-count
   or semantic gate). Alfred is the only thing enforcing them. This is exactly
   why the default is fail-closed: the non-path triggers have no backstop but
   Alfred itself, so any uncertainty must resolve to "Shane approves."

### Dependency — Claude must self-declare in the PR body

Alfred cannot reliably infer "purely cosmetic" or "affects multiple creators"
from a raw diff. Claude (the author) knows both. So the bot's PR template in
`.claude/global-bot-rules.md` §8 must gain two required lines:

```
Change type: cosmetic | logic
Blast radius: none | single creator | multiple creators | system-wide
```

Until that template change is made, Alfred sees no declaration → fails closed →
**every** PR routes to Shane. That is safe; it just means the cosmetic
fast-path is dormant until Claude starts declaring these fields.

### Globs **(repo-specific — `influencer-directory`)**

SENSITIVE — also goes in `.github/CODEOWNERS` mapped to `@shane380`:

```
/supabase/**                      database / schema
*.sql                             database / schema
/src/middleware.ts                auth / permissions
/src/lib/supabase*                auth / database
/src/app/api/**                   API routes (payments, data, integrations)
**/payments/**                    payments
**/*shopify*                      Shopify
/src/lib/shopify*                 Shopify
**/*meta* **/*facebook* **/*instagram*   Meta API
**/*permission* **/*role*         permissions / roles
```

Tune this list per repo and keep it aligned with the off-limits section of the
bot guardrails (`.claude/global-bot-rules.md` §2). Note the relationship:
schema + auth are paths Claude is forbidden to touch *at all*; payments,
Shopify, Meta, and API routes are paths Claude *may* fix — but those PRs need
Shane's approval before merge.

## 7. What Alfred must never do

- Never push commits, edit files, or open/modify PRs' code.
- Never call the merge endpoint directly (bypasses CI) — always auto-merge.
- Never approve a PR it authored (it shouldn't author any).
- Never paste real customer data from a Slack report into a public issue.
- Never treat the reporter's ✅ as sufficient when §6 routes the PR to Shane.
- Never tell the Slack thread "merged / done" before the merge webhook fires.

## 8. Edge cases to handle

| Situation | Alfred's behaviour |
|-----------|--------------------|
| Claude comments instead of opening a PR | Relay comment to Slack as "needs a human"; stop. |
| PR body missing `Change type` / `Blast radius` | Fail closed — route to Shane. |
| CI (`build-and-lint`) fails on the PR | Post failure to Slack; do not approve; auto-merge holds. |
| New commit pushed after approval | `dismiss_stale_reviews` is on — approval is dismissed; Alfred must re-approve after the new commit. |
| Reporter reacts ✅ then ❌ | Treat the latest reaction as current intent; if ❌ after merge, escalate to a human. |
| Shane-gated PR, Shane never approves | Leave it open; auto-merge waits. Optionally nudge Shane after N hours. |
