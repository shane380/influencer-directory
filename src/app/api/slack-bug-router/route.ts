import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Slack → GitHub bug router.
 *
 * Deterministic plumbing only — no LLM, no judgement. When the router app is
 * @mentioned as a reply inside a bug thread, it:
 *   1. reads the PARENT message of that thread (the actual bug report),
 *   2. copies it verbatim into a GitHub issue tagged `@claude`,
 *   3. posts the issue link back into the Slack thread.
 *
 * This is the intake half of docs/alfred-bot-spec.md. Preview-relay and
 * approve/merge (the GitHub-webhook half) are a later phase.
 */

export const runtime = 'nodejs';

// Dedupe Slack's event retries within a warm instance. Best-effort; the
// GitHub issue search below is the cross-instance backstop.
const processedEvents = new Set<string>();

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

// --- Slack request signature verification -------------------------------

function verifySlackSignature(rawBody: string, timestamp: string, signature: string): boolean {
  if (!timestamp || !signature) return false;
  // Reject requests older than 5 minutes (replay protection).
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

  const base = `v0:${timestamp}:${rawBody}`;
  const hmac = crypto.createHmac('sha256', env('SLACK_SIGNING_SECRET')).update(base).digest('hex');
  const expected = `v0=${hmac}`;
  if (expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

// --- Slack Web API helpers ----------------------------------------------

async function slackCall(method: string, params: Record<string, unknown>) {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${env('SLACK_BOT_TOKEN')}`,
    },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Slack ${method} failed: ${data.error}`);
  return data;
}

async function getThreadParentMessage(channel: string, threadTs: string) {
  const url = `https://slack.com/api/conversations.replies?channel=${channel}&ts=${threadTs}&limit=1`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${env('SLACK_BOT_TOKEN')}` } });
  const data = await res.json();
  if (!data.ok) throw new Error(`Slack conversations.replies failed: ${data.error}`);
  return data.messages?.[0]; // first message of the thread = the bug report
}

function postToThread(channel: string, threadTs: string, text: string) {
  return slackCall('chat.postMessage', { channel, thread_ts: threadTs, text });
}

// --- GitHub App auth + issue creation -----------------------------------

function githubAppJwt(): string {
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = b64({ alg: 'RS256', typ: 'JWT' });
  const body = b64({ iat: now - 60, exp: now + 540, iss: env('GITHUB_APP_ID') });
  const key = env('GITHUB_APP_PRIVATE_KEY').replace(/\\n/g, '\n');
  const sig = crypto.createSign('RSA-SHA256').update(`${head}.${body}`).sign(key, 'base64url');
  return `${head}.${body}.${sig}`;
}

async function githubInstallationToken(): Promise<string> {
  const res = await fetch(
    `https://api.github.com/app/installations/${env('GITHUB_APP_INSTALLATION_ID')}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${githubAppJwt()}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'namaclo-bug-router',
      },
    },
  );
  if (!res.ok) throw new Error(`GitHub token exchange failed: ${res.status} ${await res.text()}`);
  return (await res.json()).token;
}

/** Returns the existing issue URL for this Slack thread, or null. */
async function findIssueForThread(token: string, threadTs: string): Promise<string | null> {
  const repo = env('GITHUB_REPO');
  const q = encodeURIComponent(`repo:${repo} in:body "slack-thread:${threadTs}"`);
  const res = await fetch(`https://api.github.com/search/issues?q=${q}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'namaclo-bug-router',
    },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.total_count > 0 ? data.items[0].html_url : null;
}

async function createIssue(token: string, title: string, body: string) {
  const [owner, name] = env('GITHUB_REPO').split('/');
  const res = await fetch(`https://api.github.com/repos/${owner}/${name}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'namaclo-bug-router',
    },
    body: JSON.stringify({ title, body }),
  });
  if (!res.ok) throw new Error(`GitHub issue creation failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// --- Core handler -------------------------------------------------------

async function handleAppMention(event: Record<string, any>) {
  const { channel, ts } = event;
  const threadTs: string | undefined = event.thread_ts;

  // Optional channel lock: only act in the designated bug channel.
  const lockedChannel = process.env.SLACK_BUG_CHANNEL;
  if (lockedChannel && channel !== lockedChannel) return;

  // The mention must be a REPLY inside a thread — that thread's first message
  // is the bug report. A top-level mention has no bug to read.
  if (!threadTs || threadTs === ts) {
    await postToThread(channel, ts,
      "To file a bug, reply with @mention *inside the thread of the bug report* — " +
      "I copy the first message of that thread into GitHub.");
    return;
  }

  const parent = await getThreadParentMessage(channel, threadTs);
  const bugText: string = (parent?.text || '').trim();

  // Fail-closed on a thin report — don't create a useless issue (the issue #5 lesson).
  if (bugText.split(/\s+/).filter(Boolean).length < 12) {
    await postToThread(channel, threadTs,
      "That bug report is too short for me to file. Please describe, in the thread:\n" +
      "• *Page* — where it happened\n• *Expected* — what should happen\n• *Actual* — what happened instead\n" +
      "Then @mention me again.");
    return;
  }

  const token = await githubInstallationToken();

  // Idempotency: if this thread already produced an issue, just re-link it.
  const existing = await findIssueForThread(token, threadTs);
  if (existing) {
    await postToThread(channel, threadTs, `Already filed for this thread: ${existing}`);
    return;
  }

  const title = (bugText.split('\n')[0] || 'Bug report from Slack').slice(0, 80);
  const body = [
    '## Bug report (from Slack)',
    '',
    bugText,
    '',
    '---',
    `**Reported by** <@${parent?.user || 'unknown'}> in Slack.`,
    `slack-thread:${threadTs} · slack-channel:${channel}`,
    '',
    '> ⚠️ If the reporter attached screenshots in Slack, they are **not** included',
    "> here — images don't transfer to GitHub and the fixer works from text. Ask",
    '> in a comment if you need visual context.',
    '',
    '@claude please investigate and fix this bug. Follow the rules in `CLAUDE.md` ' +
      'and `.claude/global-bot-rules.md`.',
  ].join('\n');

  const issue = await createIssue(token, title, body);
  await postToThread(channel, threadTs,
    `✅ Filed as issue #${issue.number}: ${issue.html_url}\n` +
    `@claude is investigating — I'll post back when there's a fix to review.`);
}

// --- Route entry point --------------------------------------------------

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  if (!verifySlackSignature(
    rawBody,
    request.headers.get('x-slack-request-timestamp') || '',
    request.headers.get('x-slack-signature') || '',
  )) {
    return new NextResponse('invalid signature', { status: 401 });
  }

  const payload = JSON.parse(rawBody);

  // Slack Events API one-time URL verification handshake.
  if (payload.type === 'url_verification') {
    return NextResponse.json({ challenge: payload.challenge });
  }

  if (payload.type === 'event_callback' && payload.event?.type === 'app_mention') {
    // Skip duplicate deliveries of the same event.
    if (payload.event_id && processedEvents.has(payload.event_id)) {
      return NextResponse.json({ ok: true });
    }
    if (payload.event_id) processedEvents.add(payload.event_id);

    try {
      await handleAppMention(payload.event);
    } catch (err) {
      // Surface the failure into the Slack thread instead of failing silently.
      const e = payload.event;
      if (e?.channel) {
        await postToThread(e.channel, e.thread_ts || e.ts,
          `⚠️ I couldn't file this bug: ${err instanceof Error ? err.message : String(err)}`)
          .catch(() => {});
      }
    }
  }

  // Always 200 so Slack stops retrying.
  return NextResponse.json({ ok: true });
}
