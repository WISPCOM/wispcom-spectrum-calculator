# WISPCOM ICASA Spectrum Licence Fee Calculator

Public lead-gen tool. Visitors enter GPS coordinates for both tower sites plus
a frequency band and bandwidth; the fee formula and rate tables run
**server-side only** (a Vercel serverless function) — the browser only ever
sends inputs and receives a final Rand figure back. Distance and area
(metro/rural) are derived from the coordinates, not asked for directly.
Nothing in `lib/pricing.js` or `api/calculate.js` is ever served to the
client.

This is deliberately a **standalone project**, separate from the main
wispcompliance.co.za codebase (which is a static site on S3/Cloudflare with no
server-side runtime). It has no access to and no connection with any internal
WISPCOM system, credential, or client data — only the public inputs a visitor
types into the form.

## Files

- `index.html` — the full public calculator page (matches the main site's
  dark navy/blue theme, fonts, nav, footer, and WhatsApp CTA button). Meant to
  be linked to directly.
- `embed.html` — a bare version of the same calculator (no nav/hero/footer),
  meant to be iframed into `wispcompliance-site-.../calculator/index.html` on
  the main site. Posts its height to the parent window via `postMessage` so
  the iframe auto-sizes instead of scrolling in a fixed box.
- `lib/pricing.js` — the formula and rate tables. **This is the file to edit
  every April.** See the comment at the top of `UNIT_PRICE_PER_MHZ`.
- `api/calculate.js` — the Vercel serverless function both pages call.
  Validates inputs (including that the chosen bandwidth is actually valid for
  the chosen band), runs the formula, returns only the final fee + a
  plain-language breakdown (never the raw rate tables).

## Deploying (no local Node/npm required)

Already deployed at `https://wispcom-spectrum-calculator.vercel.app` (GitHub
repo `WISPCOM/wispcom-spectrum-calculator`, imported into Vercel project
`wispcom-spectrum-calculator` under Jackie's account). Every push to `main`
auto-redeploys — no manual redeploy step.

The main site embeds it at `/calculator` via an iframe pointing at
`/embed` on the Vercel deployment (see `calculator/index.html` in the main
site's repo).

## Annual maintenance (important)

`lib/pricing.js` → `UNIT_PRICE_PER_MHZ` must be checked every **1 April** when
ICASA re-gazettes the CPI-adjusted unit price. Check
https://www.icasa.org.za/pages/fees, update the constant and the
`UNIT_PRICE_EFFECTIVE_DATE`/`UNIT_PRICE_SOURCE` comments, commit, and push —
Vercel redeploys automatically on push to `main`.

## Bandwidth is band-specific, not one universal list

The bandwidth dropdown repopulates based on the selected frequency band. This
was verified directly against the ITU-R Recommendations the South African
(ITU Region 1 / CEPT-aligned) channel plans derive from — **not** ICASA's own
published pages, which don't tabulate this:

- **7, 8, 10, 11, 13, 15, 22, 23, 26, 28, 32, 38 GHz** all use the same
  "doubling" family: **7 / 14 / 28 / 56 MHz** (confirmed directly against
  ITU-R F.749's text for 38 GHz, which lists 3.5/7/14/28/56/140 MHz — the
  wider ones aren't exposed since a visitor picking bandwidth for their own
  link is very unlikely to need them; F.385/F.386/F.387/F.497/F.636/F.637/
  F.748 define the same family for the other bands in this group).
- **17 & 18 GHz are a different family entirely**: **27.5 / 55 / 110 MHz**
  (confirmed directly against ITU-R F.595, which defines 27.5/55/110/220 MHz
  for 17.7–19.7 GHz — none of the 7/14/28/56 MHz values apply here).
- **40 MHz was deliberately dropped.** It doesn't correspond to any confirmed
  ITU-R or CEPT channel width at any of these bands — it resembles a US/FCC
  channel raster, not the ITU Region 1 plan South Africa follows. It was in
  the original spec's flat list but couldn't be verified per-band, so it's
  excluded rather than guessed at.

This mapping lives in `lib/pricing.js` (`STANDARD_BANDWIDTHS`,
`WIDE_BANDWIDTHS_17_18_GHZ`, `bandwidthOptionsForBand`) and is mirrored in
`index.html` and `embed.html` for the dropdown UI — `api/calculate.js`
validates server-side against the same per-band table regardless of what the
client sends, so the dropdown can't be bypassed by hand-crafting a request.

## Area (metro/rural) auto-detection is an approximation

`lib/pricing.js` → `detectArea()` uses simple lat/lon bounding boxes for
Gauteng, Cape Town, and Durban — not the real municipal/provincial polygons.
It's a reasonable approximation for an estimate tool, but a site right at a
boundary edge could be misclassified. The "Advanced options" section on the
form lets a visitor force Metro or Rural if the auto-detected result looks
wrong; WISPCOM should still confirm classification manually for any firm
quote.

## v1 simplifications (by design, revisit only if there's a clear need)

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
- Both re-verified live in production after switching to GPS-coordinate input:
  JHB (-26.2041, 28.0473) to Pretoria (-25.7479, 28.2293), 18 GHz / 55 MHz,
  came back as 53.891 km (matches independent calculation) and correctly
  auto-detected Metro (Gauteng), reproducing R27,777.75.
