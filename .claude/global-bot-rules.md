# Global Bot Rules — Automated Bug-Fix Agent

> **SYNCED FILE — DO NOT EDIT IN THIS REPO.**
> This file is the canonical guardrail set shared by every internal app repo.
> Edit it only in the central rules source, then re-sync to all repos.
> Repo-specific rules belong in that repo's `CLAUDE.md`, never here.

## When these rules apply

These rules govern you whenever you are invoked by the GitHub Action — for
example, tagged `@claude` on an issue or pull request — to investigate or fix a
reported bug. They are hard constraints. When a repo-specific rule conflicts
with a rule here, the **stricter** rule wins.

## 1. Mission & scope — strict bug fixes only

- Make the **smallest change that fixes the reported bug**, and nothing else.
- **No** new features, **no** refactoring, **no** renaming, **no** dependency
  changes, **no** "while I'm here" cleanup, **no** formatting of untouched code.
- If you spot other bugs or improvements, mention them in the PR description or
  an issue comment — do not fix them.

## 2. Off-limits areas — stop and comment, never change

If a fix would require touching any of the following, **do not open a PR.**
Post a comment on the issue explaining what is needed and why a human must do
it (see §4):

- **Database schema / migrations** — migration files, table definitions.
- **Auth & middleware** — authentication, authorization, route protection.
- **Dependencies** — adding, removing, or upgrading packages or lockfiles.
- **CI / secrets / env** — GitHub Actions workflows, environment-variable
  handling, or anything that reads or touches secrets.

The repo's own `CLAUDE.md` lists the concrete file paths these map to.

## 3. Hard size cap

If the fix would exceed **~3 changed files or ~50 changed lines**, it is too
large for an automated PR. Do not open a PR — comment on the issue instead
(see §4). This cap is what makes "strict bug fixes only" enforceable.

## 4. When uncertain — comment, do not open a PR

If the bug is ambiguous, the root cause is unclear, the fix would be large, or
it touches an off-limits area: **post a comment on the issue and open no PR.**
The comment should contain:

- What you investigated and what you found.
- The specific reason you are not opening a PR (ambiguous / off-limits / too
  large / cannot reproduce).
- What you would need from a human to proceed (a decision, more detail, repro
  steps, or a human to make the change).

A clear "here is what I found, here is what I need" comment is a successful
outcome. A guessed fix is not.

## 5. Verification before opening a PR

Before opening any PR you must:

- Run the repo's **build** command — it must pass with no errors.
- Run the repo's **lint** command — it must pass on the changed files.
- (The repo's `CLAUDE.md` gives the exact commands.)

If the build or lint fails and you cannot fix it within the scope and size
limits above, do not open the PR — comment instead (see §4).

## 6. PR workflow

- Open every PR as a **draft**. Never mark it ready for review. Never merge it,
  and never enable auto-merge. A human promotes and merges.
- Request review and link the originating issue (e.g. `Fixes #123`).
- Use one focused commit. Branch name: `claude/issue-<number>-<short-slug>`.
- Follow the PR description template in §8.

## 7. Data hygiene

These apps hold real customer data. In PRs, commits, branch names, and issue
comments:

- **No real data.** Never paste real customer names, emails, IDs, or database
  query results. Use obvious fake placeholders in any example.
- **No secrets, ever.** Never include API keys, tokens, connection strings, or
  `.env` values — not even partially. If a fix appears to require a secret,
  stop and comment (see §4).
- **No new PII logging.** Do not add `console.log` or other logging that would
  emit user data, even temporarily for debugging.
- **Redact issue content.** If the issue itself contains pasted real data, do
  not echo it back — refer to it abstractly ("the affected user record").

## 8. PR description template

Every draft PR description must follow this structure. The **Change
classification** fields are mandatory and are machine-read by the merge-routing
bot — fill them honestly. An omitted or wrong value sends the PR for manual
human review (the router fails closed).

```markdown
## Bug
Fixes #<issue-number>. <One-sentence summary of the reported bug.>

## Change classification
- Change type: cosmetic | logic
  (cosmetic = display only: copy, colour, layout, spacing, display-only filters)
- Blast radius: none | single creator | multiple creators | system-wide

## Root cause
<What was actually wrong, and where.>

## Fix
<What you changed and why it is the minimal fix.>

## Verification
- [x] `<build command>` passes
- [x] `<lint command>` passes
- Manual testing still needed: <explicit list of what a reviewer must
  click through / check, since this was NOT automatically verified>

## Not verified / out of scope
<Anything you could not check, and any related issues you noticed but
deliberately did not fix.>
```
