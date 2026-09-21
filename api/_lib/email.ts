import { Resend } from 'resend';

/**
 * Thin mail-sending wrapper. Configured via `RESEND_API_KEY` (+ optional
 * `RESEND_FROM_EMAIL`, defaulting to Resend's own unverified test sender —
 * fine for getting the flow working before a custom domain is verified).
 * Without a key configured (local dev with nothing set), falls back to
 * logging the content — same graceful degradation the codebase already used
 * before an email provider existed, just centralized here.
 */

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

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const r = resend();
  if (!r) {
    console.warn(`[email] RESEND_API_KEY is not set — password reset link for ${to} was not delivered: ${resetUrl}`);
    return;
  }
  const { error } = await r.emails.send({
    from: fromAddress(),
    to,
    subject: 'Reset your Forma password',
    html: `
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
        <h2 style="margin:0 0 16px;">Reset your password</h2>
        <p style="color:#444;line-height:1.5;">We got a request to reset the password for your Forma account. This link expires in 1 hour.</p>
        <p style="margin:24px 0;">
          <a href="${resetUrl}" style="background:#FF8B02;color:#111;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block;">Reset password</a>
        </p>
        <p style="color:#888;font-size:13px;line-height:1.5;">If you didn't request this, you can safely ignore this email — your password won't change.</p>
      </div>`,
  });
  if (error) {
    console.error('[email] Resend failed to send password reset email:', error);
    throw new Error('Failed to send password reset email');
  }
}
