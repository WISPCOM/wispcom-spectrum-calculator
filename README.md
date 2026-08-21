# WISPCOM ICASA Spectrum Licence Fee Calculator

Public lead-gen tool. Visitors enter their link details; the fee formula and
rate tables run **server-side only** (a Vercel serverless function) — the
browser only ever sends inputs and receives a final Rand figure back. Nothing
in `lib/pricing.js` or `api/calculate.js` is ever served to the client.

This is deliberately a **standalone project**, separate from the main
wispcompliance.co.za codebase (which is a static site on S3/Cloudflare with no
server-side runtime). It has no access to and no connection with any internal
WISPCOM system, credential, or client data — only the public inputs a visitor
types into the form.

## Files

- `index.html` — the public calculator page (matches the main site's dark
  navy/blue theme, fonts, nav, footer, and WhatsApp CTA button).
- `lib/pricing.js` — the formula and rate tables. **This is the file to edit
  every April.** See the comment at the top of `UNIT_PRICE_PER_MHZ`.
- `api/calculate.js` — the Vercel serverless function the page calls. Validates
  inputs, runs the formula, returns only the final fee + a plain-language
  breakdown (never the raw rate tables).

## Deploying

1. Go to [vercel.com](https://vercel.com), sign in with GitHub, click
   **Add New → Project**, and import this repository
   (`WISPCOM/wispcom-spectrum-calculator`). Vercel auto-detects this as a plain
   static + serverless-functions project — no build settings to change. Click
   **Deploy**.
2. Vercel gives you a URL like `https://wispcom-spectrum-calculator.vercel.app`.
   That's the "clean, direct URL" to link to in marketing/social.
3. Add one link to it from the main site's navigation, e.g.:
   ```html
   <a href="https://wispcom-spectrum-calculator.vercel.app">Spectrum Calculator</a>
   ```

**Every push to `main` auto-redeploys** — no manual redeploy step needed after
the initial import.

**Optional upgrade later:** if/when you have Cloudflare or AWS/S3 access for
wispcompliance.co.za, you can point `www.wispcompliance.co.za/calculator` at
this deployment (a CNAME + custom domain in Vercel, or an S3 redirect rule) so
the tool lives on your own domain/path instead of a `.vercel.app` one. No code
changes needed for that.

## Annual maintenance (important)

`lib/pricing.js` → `UNIT_PRICE_PER_MHZ` must be checked every **1 April** when
ICASA re-gazettes the CPI-adjusted unit price. Check
https://www.icasa.org.za/pages/fees, update the constant and the
`UNIT_PRICE_EFFECTIVE_DATE`/`UNIT_PRICE_SOURCE` comments, commit, and push —
Vercel redeploys automatically on push to `main`.

## v1 simplifications (by design, revisit only if there's a clear need)

- Link distance is entered directly by the visitor (no address-to-address
  geocoding). Most people requesting a quote already know their tower-to-tower
  distance.
- Congestion / sharing / directionality are collapsed into an "Advanced"
  section, defaulting to not-congested / exclusive / bidirectional — the
  values almost all WISP point-to-point links actually use.

## Validation against real ICASA invoices

- **18 GHz, 55 MHz, Cape Town (metro), 9.728 km → R27,777.75** computed here
  vs. **R27,778.00** on the real paid invoice (Wibersolutions, licence
  10357935). A 25-cent / 0.09% difference, consistent with ICASA's own
  invoice rounding to the nearest Rand — the underlying formula arithmetic is
  exact.
- **11 GHz, 14 MHz, rural, hop ≥ 10 km, UNIT = R3,263.00 → R913.64** — exact
  match to the real filed Edelnet figures.
- Same inputs at the current **UNIT = R3,367.00 → R942.76** — exact match to
  the expected re-priced figure.
