import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'node:crypto';
import { decryptSession } from '@/lib/auth/crypto';
import { sessionCookieName } from '@/lib/auth/session-cookie';

/**
 * MagicBox Meet SSO handoff (fork addition — the only file besides proxy.ts
 * that differs from stock Bulwark).
 *
 * Point the "Meet" Sidebar App at THIS route instead of the control plane:
 *     https://mail.bizionix.com/api/meet-sso
 *
 * On every load it decrypts the user's existing webmail session cookie
 * (Bulwark's own `jmap_session`, AES-256-GCM under SESSION_SECRET — we reuse
 * Bulwark's decryptSession helper, no crypto of our own), mints a short-lived
 * HMAC token identifying the signed-in mailbox user, and 302-redirects the
 * iframe to <MEET_APP_URL>?sso=<token>. The control plane verifies the token
 * and renders Meet already signed in — no login screen, and no reliance on
 * third-party cookies (which Safari/Chrome block inside cross-site iframes).
 *
 * Required env on the WEBMAIL service:
 *   MEET_APP_URL     e.g. https://mailxcp-api.up.railway.app/meet-app
 *   MEET_SSO_SECRET  MUST equal the backend's FEATURE_API_SECRET
 *                    (or its MEET_SSO_SECRET if you set one there)
 *
 * Token format (mirrors backend src/lib/meetSso.ts):
 *   b64url(JSON{v:1,kind:"meet-sso",email,exp}) "." b64url(HMAC-SHA256(body))
 *   exp is now + 180s — fresh on every iframe load, so nothing durable can
 *   leak via the URL. If no mail session is found, we still redirect (without
 *   a token) and Meet shows its manual sign-in as a fallback.
 */

// Bulwark stores each signed-in account in its own cookie slot
// (jmap_session, jmap_session_1, ...). The active slot is client-side state
// we can't see here, so we use the first slot that decrypts — slot 0 is the
// primary account. Pass ?slot=N to prefer a specific one.
const SLOTS_TO_TRY = 5;
const TOKEN_TTL_SECONDS = 180;

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function signSsoToken(email: string, secret: string): string {
  const payload = {
    v: 1,
    kind: 'meet-sso',
    email,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  };
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = b64url(createHmac('sha256', secret).update(body).digest());
  return `${body}.${sig}`;
}

export async function GET(request: NextRequest) {
  const meetAppUrl = (process.env.MEET_APP_URL || '').replace(/\/+$/, '');
  if (!meetAppUrl) {
    return NextResponse.json({ error: 'MEET_APP_URL is not configured' }, { status: 500 });
  }

  const secret = process.env.MEET_SSO_SECRET || '';
  let email: string | null = null;

  if (secret) {
    const slotParam = request.nextUrl.searchParams.get('slot');
    const preferred = slotParam !== null ? parseInt(slotParam, 10) : 0;
    const order = [preferred, ...Array.from({ length: SLOTS_TO_TRY }, (_, i) => i)].filter(
      (v, i, a) => Number.isInteger(v) && v >= 0 && a.indexOf(v) === i
    );
    for (const slot of order) {
      const raw = request.cookies.get(sessionCookieName(slot))?.value;
      if (!raw) continue;
      const session = decryptSession(raw);
      if (session?.username) {
        email = session.username;
        break;
      }
    }
  }

  const target =
    email && secret
      ? `${meetAppUrl}?sso=${encodeURIComponent(signSsoToken(email, secret))}`
      : meetAppUrl;

  const res = NextResponse.redirect(target, 302);
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
