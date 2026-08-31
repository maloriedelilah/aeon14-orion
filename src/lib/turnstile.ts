// Cloudflare Turnstile server-side verification for /api/contact.
// The widget itself (client-side) is rendered by ContactForm.astro using the
// TURNSTILE_SITE_KEY build-time var — that key is NOT secret, it's meant to
// be visible in the page source (same as reCAPTCHA's site key). Only the
// secret key (verified here) is a real Cloudflare runtime secret.
export interface TurnstileVerifyResult {
  ok: boolean;
  errorCodes?: string[];
}

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyTurnstile(
  token: string | null,
  secretKey: string,
  remoteIp?: string
): Promise<TurnstileVerifyResult> {
  if (!token) return { ok: false, errorCodes: ['missing-input-response'] };

  const body = new URLSearchParams({ secret: secretKey, response: token });
  if (remoteIp) body.set('remoteip', remoteIp);

  const res = await fetch(VERIFY_URL, { method: 'POST', body });
  if (!res.ok) return { ok: false, errorCodes: [`http-${res.status}`] };

  const data = (await res.json()) as { success: boolean; 'error-codes'?: string[] };
  return { ok: data.success === true, errorCodes: data['error-codes'] };
}
