/* global process, Response */
// Vercel Routing Middleware for the hosted QA demo (vercel.json): one shared login for the whole site.
// The browser then sends the same Authorization header with /api and /mailpit, which Render's Caddy checks too.
// DEMO_BASIC on Vercel = base64("user:password"). Unset = site closed.
export const config = { matcher: '/:path*' };

export default function middleware(request) {
  const expected = process.env.DEMO_BASIC;
  const given = (request.headers.get('authorization') || '').replace(/^Basic\s+/i, '');
  if (expected && given === expected) {
    return new Response(null, { headers: { 'x-middleware-next': '1' } }); // continue (what @vercel/functions next() returns)
  }
  return new Response('Login required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="BimaPlacement demo", charset="UTF-8"' },
  });
}
