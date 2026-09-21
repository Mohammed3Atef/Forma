import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resend } from 'resend';

/**
 * Thin mail-sending wrapper. Configured via `RESEND_API_KEY` (+ optional
 * `RESEND_FROM_EMAIL`, defaulting to Resend's own unverified test sender —
 * fine for getting the flow working before a custom domain is verified).
 * Without a key configured (local dev with nothing set), falls back to
 * logging the content — same graceful degradation the codebase already used
 * before an email provider existed, just centralized here.
 *
 * HTML bodies are the real branded templates in `docs/email-templates/*.html`
 * (not duplicated inline here) — `{{token}}` placeholders are substituted at
 * send time. `import.meta.url` + `fileURLToPath`, not `__dirname` — this
 * module is real ESM and Vercel's Node runtime doesn't polyfill `__dirname`
 * for ESM output (see `exerciseLibrary.ts` for the same pattern/reasoning).
 */

const __dirname = dirname(fileURLToPath(import.meta.url));

// One function + one cache var per template, each with its OWN literal path
// inline (not a shared loader taking a filename parameter) — Vercel's
// build-time file tracer (`@vercel/nft`) needs a statically-visible literal
// argument to `readFileSync` to bundle the file alongside the function;
// routing the filename through a parameter one call away risks it not being
// traced. Matches `exerciseLibrary.ts`'s exact pattern for the same reason.
let passwordResetTpl: string | null = null;
function loadPasswordResetTemplate(): string {
  if (!passwordResetTpl) passwordResetTpl = readFileSync(join(__dirname, '../../docs/email-templates/password-reset.html'), 'utf-8');
  return passwordResetTpl;
}
let welcomeTpl: string | null = null;
function loadWelcomeTemplate(): string {
  if (!welcomeTpl) welcomeTpl = readFileSync(join(__dirname, '../../docs/email-templates/welcome.html'), 'utf-8');
  return welcomeTpl;
}
let clientInviteTpl: string | null = null;
function loadClientInviteTemplate(): string {
  if (!clientInviteTpl) clientInviteTpl = readFileSync(join(__dirname, '../../docs/email-templates/client-invite.html'), 'utf-8');
  return clientInviteTpl;
}

/** Replaces every `{{token}}` with `vars[token]` (HTML-escaped) — unmatched tokens are left as-is rather than silently blanked, so a missing var is obvious in a test send. */
function render(html: string, vars: Record<string, string>): string {
  return html.replace(/\{\{(\w+)\}\}/g, (full, key: string) => {
    const v = vars[key];
    if (v === undefined) return full;
    return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  });
}

let client: Resend | null = null;
function resend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!client) client = new Resend(key);
  return client;
}

function fromAddress(): string {
  return process.env.RESEND_FROM_EMAIL || 'Forma <onboarding@resend.dev>';
}

async function send(to: string, subject: string, html: string, logFallback: string): Promise<void> {
  const r = resend();
  if (!r) {
    console.warn(`[email] RESEND_API_KEY is not set — ${logFallback}`);
    return;
  }
  const { error } = await r.emails.send({ from: fromAddress(), to, subject, html });
  if (error) {
    console.error(`[email] Resend failed to send "${subject}" to ${to}:`, error);
    throw new Error(`Failed to send email: ${subject}`);
  }
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const html = render(loadPasswordResetTemplate(), { resetUrl });
  await send(to, 'Reset your Forma password', html, `password reset link for ${to} was not delivered: ${resetUrl}`);
}

/** Sent right after a new account is created (self-signup or invite-claim). */
export async function sendWelcomeEmail(to: string, name: string, appUrl: string): Promise<void> {
  const html = render(loadWelcomeTemplate(), { name, appUrl });
  await send(to, 'Welcome to Forma', html, `welcome email for ${to} was not delivered`);
}

/** Sent when a coach creates an invite WITH an email address (the code/link is still shown in-app for manual copy/share either way). */
export async function sendClientInviteEmail(to: string, opts: { coachName: string; inviteUrl: string; inviteCode: string; appUrl: string }): Promise<void> {
  const coachInitial = (opts.coachName.trim().charAt(0) || 'F').toUpperCase();
  const html = render(loadClientInviteTemplate(), { ...opts, coachInitial });
  await send(to, `${opts.coachName} invited you to Forma`, html, `client invite email for ${to} was not delivered: ${opts.inviteUrl}`);
}
