/**
 * Same-origin lead capture for the Cloudflare Pages site.
 *
 * The browser posts to /api/lead on the page's own domain and this forwards it
 * to the capture worker. That matters more than it looks: posting straight to a
 * *.workers.dev domain is a third-party request, and content blockers, Safari's
 * tracking protection and plenty of corporate networks drop those silently. The
 * visitor sees a thank-you either way, so a blocked request looks exactly like a
 * successful one and the address is simply gone.
 *
 * On GitHub Pages there are no Functions, so this route 404s there and the page
 * falls back to calling the worker directly.
 */

const WORKER = 'https://eclipse-leads.ajschlender.workers.dev/lead';

export async function onRequestPost({ request }) {
  let body;
  try {
    body = await request.text();
  } catch {
    return json({ ok: false, error: 'unreadable body' }, 400);
  }

  try {
    const r = await fetch(WORKER, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        /* Passed through so the worker still records where the lead came from
           and which country, rather than seeing only the data centre. */
        'CF-IPCountry': request.headers.get('CF-IPCountry') || '',
        'Referer': request.headers.get('Referer') || '',
        'User-Agent': request.headers.get('User-Agent') || '',
      },
      body,
    });
    return new Response(await r.text(), {
      status: r.status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return json({ ok: false, error: 'upstream unreachable' }, 502);
  }
}

/* Anything other than POST should not look like a working endpoint. */
export async function onRequest({ request }) {
  if (request.method === 'POST') return onRequestPost({ request });
  return json({ ok: false, error: 'post only' }, 405);
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
