/**
 * Auth inside the BimaSahayak suite. In prod the web app is mounted by the Sahayak shell, which
 * owns the Google Workspace SSO session and hands us a short-lived access token for the
 * `bimaplacement` audience (postMessage / shared cookie - CONFIRM with the Sahayak team).
 * In dev we send the x-dev-user header that the API accepts with AUTH_MODE=dev.
 */
const mode = process.env.NEXT_PUBLIC_AUTH_MODE ?? 'dev';

let token: string | null = null;
export const setAccessToken = (t: string | null) => (token = t);

export function authHeaders(): Record<string, string> {
  if (mode === 'dev')
    return {
      'x-dev-user': process.env.NEXT_PUBLIC_DEV_USER ?? 'himani@bimakavach.com|Himani Doshi|placement_head',
    };
  return token ? { authorization: `Bearer ${token}` } : {};
}

/** TODO(W1): listen for the Sahayak shell token handshake + silent refresh; redirect to Sahayak login on 401. */
export function initSahayakBridge() {
  if (mode !== 'sahayak') return;
  window.addEventListener('message', (e) => {
    if (e.origin !== process.env.NEXT_PUBLIC_SAHAYAK_URL) return;
    if (e.data?.type === 'sahayak:token') setAccessToken(e.data.token);
  });
}
