# Eclipse Moment Landing Page v2 — Developer Handoff

**Live preview:** https://ajschlender1983.github.io/eclipse-moment-v2/
**Source of truth:** https://github.com/ajschlender1983/eclipse-moment-v2 (branch `main`)
**Campaign window:** page goes stale-proof on its own clock through Oct 1 (see "Time behavior" below).

## What this is

A single-file static landing page for the Pulse × Unify Iceland Eclipse campaign. There is no build step, no framework, no npm. One `index.html` (~116 KB) plus an `assets/` folder (~5.5 MB of images and two short mp4s). Everything (CSS, JS, SVG marks) is inline in the HTML file.

External requests: Google Fonts only (DM Sans + Instrument Serif). Everything else is local.

## How to deploy it

Host the folder as-is on any static host. It is currently served by GitHub Pages from this repo; that can stay the origin.

### Routing it at pulsemindfulness.com/eclipse (the important part)

`www.pulsemindfulness.com` is Webflow with Cloudflare in front. **Do not use a Webflow 301 redirect to point /eclipse at this page.** The existing `/eclipse` rule (Webflow Project Settings → Publishing → 301 Redirects, or Cloudflare → Rules → Redirect Rules) 301s to an old frozen build AND drops all query strings, which kills `?src=unify` behavior, UTM passthrough, and any discount parameter.

The correct setup is a **Cloudflare Worker proxy** on `www.pulsemindfulness.com/eclipse*` that maps `/eclipse/<path>` to the Pages origin. This keeps the on-brand URL and preserves query parameters.

Order of operations:
1. Delete the existing `/eclipse` 301 rule first (redirect rules fire before Workers).
2. Add the Worker route.
3. Note that browsers cache 301s aggressively: anyone who already clicked the old link keeps hitting the frozen build until a hard reload.
4. Once the final URL is settled, add `<meta property="og:url">` (a TODO comment sits at the top of `index.html`) and confirm `og:image` resolves absolutely.

## Wiring the devs own (all marked `TODO (dev owner TBD)` in the file)

1. **Checkout URLs.** Every CTA currently points at `https://www.pulsemindfulness.com/order`. Point them at the real store/checkout destination. The discount code **ECLIPSE75VIP** ($75 off) is shown as tap-to-copy text and is deliberately NOT auto-applied (Johan's call). If checkout can accept a `?discount=` parameter, append it in the CTA URLs.
2. **EclipseShipping.** The "Pulse at home" card tells buyers to add code `EclipseShipping` at checkout for free 2-day express. Confirm that code exists in Shopify and that the Aug 7 order cutoff is right.
3. **Email capture (one switch).** All email entry routes through `captureEmail(email, intent)`. At the top of the script block: `const ESP={endpoint:'', listId:'', source:'eclipse-landing'}`. Set `endpoint` to the Klaviyo/Mailchimp/HubSpot subscribe URL and `listId` to the Iceland list and the whole page is wired. Until then, addresses queue in `localStorage['pulse.leads']`; run `copy(window.__pulseLeads())` in the console to pull them as CSV so nothing typed pre-launch is lost.
4. **Reserve flow.** "Reserve my ring" on the gate card opens the `#reserve` modal (email capture, intent `reserve-gate`), then hands off to checkout. Same ESP switch covers it.
5. **Inventory meters.** The card meters are static HTML: `data-left="184" data-total="2000"` (gate) and `data-left="1137" data-total="1500"` (home). Update the numbers when real counts change, or wire them to live inventory if the store can expose it.

## Time behavior (nothing to do, just know it)

A phase state machine keys off `TOTALITY = 2026-08-12T17:47:00Z`. The countdown strip, hero copy, and CTA copy flip automatically at totality, then at the ceremony, then to "Ordering has closed" on October 1. Totality time is also rendered in the visitor's local time. No manual copy swaps are needed on event day.

## Performance notes (please keep these true)

- One scroll scheduler (`SCROLL_FNS` + a single rAF-throttled `scroll` listener). Add scroll work via `onScrollFrame(fn)`, never a new `addEventListener('scroll')`.
- Every canvas/animation loop is IntersectionObserver-gated; videos pause offscreen.
- No `backdrop-filter`, no SVG gaussian blur anywhere. These were removed for scroll performance on mobile.
- Current measurements: ~9 ms average frame during a full-page scroll, zero frames over 34 ms, at 1440 and 390 widths.

## Assets

- `assets/world/` is unused by the page (excluded from deploys) and `assets/closing-circle.jpg` is no longer referenced; both are safe to drop.
- `assets/totality-ring.jpg` (Take Totality Home background) has its color grade baked in on purpose; there is no CSS filter to tweak.
- Fonts are loaded from Google Fonts. If the team prefers zero external requests, Georgia italic is already in the serif fallback stack.

## Known open items outside this page

- CRM/ESP endpoint (item 3) requires credentials the page repo does not have.
- Referral program CTA is pending an impact.com advocate enrollment URL.
- Facilitator names are deliberately off the closing section until confirmed.
