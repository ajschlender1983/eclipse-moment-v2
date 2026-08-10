/**
 * Eclipse Moment lead capture.
 *
 * POST /lead        { email, intent, source, at }  -> stores one lead in KV
 * GET  /leads.csv?key=TOKEN                        -> every lead as CSV
 * GET  /leads.json?key=TOKEN                       -> every lead as JSON
 *
 * KV is the record of truth. If SHEET_WEBHOOK is set the lead is also pushed to
 * a Google Apps Script web app, but a failure there is never allowed to fail the
 * visitor's request: the write to KV has already happened by then.
 */

const ALLOWED_ORIGINS = [
  'https://eclipse.pulsemindfulness.com',   /* the live campaign domain */
  'https://eclipse-moment.pages.dev',
  'https://ajschlender1983.github.io',
  'https://www.pulsemindfulness.com',
  'https://pulsemindfulness.com',
];

/* Any pulsemindfulness.com host and any Pages preview are allowed, so moving the
   campaign to a new subdomain never silently breaks capture. Echoing back a
   mismatched origin is worse than refusing: the browser drops the response, the
   visitor still sees the thank-you, and the address disappears with no error. */
function cors(origin) {
  const ok = origin && (
    ALLOWED_ORIGINS.includes(origin) ||
    origin.endsWith('.eclipse-moment.pages.dev') ||
    origin.endsWith('.eclipse-owners.pages.dev') ||
    origin.endsWith('.pulsemindfulness.com')
  );
  return {
    'Access-Control-Allow-Origin': ok ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

const json = (body, status, origin) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors(origin) },
  });

/* Deliberately permissive: this guards against junk, not against a determined
   forger. Rejecting unusual but legitimate addresses would cost a real sale. */
const looksLikeEmail = e =>
  typeof e === 'string' && e.length >= 6 && e.length <= 254 && /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(e);

const csvCell = v => {
  const s = String(v == null ? '' : v);
  /* A leading =, +, - or @ makes a spreadsheet treat the value as a formula,
     so the cell is prefixed before quoting. */
  const safe = /^[=+\-@]/.test(s) ? "'" + s : s;
  return '"' + safe.replace(/"/g, '""') + '"';
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });

    if (url.pathname === '/lead' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return json({ ok: false, error: 'bad json' }, 400, origin); }

      const email = (body.email || '').trim().toLowerCase();
      if (!looksLikeEmail(email)) return json({ ok: false, error: 'invalid email' }, 400, origin);

      const lead = {
        email,
        intent: String(body.intent || '').slice(0, 60),
        source: String(body.source || '').slice(0, 60),
        at: new Date().toISOString(),
        ua: (request.headers.get('User-Agent') || '').slice(0, 200),
        country: request.headers.get('CF-IPCountry') || '',
        ref: String(body.ref || request.headers.get('Referer') || '').slice(0, 300),
      };

      /* Keyed by address alone, so one person is one row however many times they
         submit. The first sighting is what gets kept: that is the moment they
         actually decided, and it is what the follow-up should be measured from.
         Repeat submits only bump the counter and the last-seen stamp. */
      const key = `lead:${email}`;
      const prior = await env.eclipse_leads.get(key, 'json');
      if (prior) {
        lead.at = prior.at || lead.at;
        lead.submits = (prior.submits || 1) + 1;
        lead.lastAt = new Date().toISOString();
      } else {
        lead.submits = 1;
      }
      await env.eclipse_leads.put(key, JSON.stringify(lead));

      /* Pushed to the sheet after KV has already accepted the row, and inside
         waitUntil, so the visitor never waits on Google and never sees an error
         if Apps Script is slow or redeploying. KV remains the record either way.
         The secret travels in the body because an Apps Script web app has to be
         open to anonymous POSTs to be reachable at all. */
      if (env.SHEET_WEBHOOK) {
        ctx.waitUntil(
          fetch(env.SHEET_WEBHOOK, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...lead, secret: env.SHEET_SECRET || '' }),
            redirect: 'follow',
          })
            .then(r => r.text().then(t => console.log('sheet', r.status, t.slice(0, 200))))
            .catch(e => console.log('sheet ERROR', String(e)))
        );
      } else {
        console.log('sheet SKIPPED: no SHEET_WEBHOOK bound');
      }
      return json({ ok: true, queued: false }, 200, origin);
    }

    if (url.pathname === '/leads.csv' || url.pathname === '/leads.json') {
      if (!env.EXPORT_TOKEN || url.searchParams.get('key') !== env.EXPORT_TOKEN)
        return new Response('forbidden', { status: 403 });

      const rows = [];
      let cursor;
      do {
        const list = await env.eclipse_leads.list({ prefix: 'lead:', cursor });
        for (const k of list.keys) {
          const v = await env.eclipse_leads.get(k.name);
          if (v) { try { rows.push(JSON.parse(v)); } catch {} }
        }
        cursor = list.list_complete ? null : list.cursor;
      } while (cursor);

      rows.sort((a, b) => (a.at < b.at ? -1 : 1));

      if (url.pathname === '/leads.json')
        return new Response(JSON.stringify(rows, null, 1), {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });

      const head = ['at', 'email', 'intent', 'source', 'country', 'submits', 'lastAt', 'ref'];
      const csv = [head.join(',')]
        .concat(rows.map(r => head.map(h => csvCell(r[h])).join(',')))
        .join('\n');
      return new Response(csv, {
        headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }

    return new Response('eclipse lead capture', { status: 200, headers: cors(origin) });
  },
};
