// ICASA spectrum licence fee formula (public-facing estimate calculator).
// Source of truth: Government Gazette No. 38642 (30 March 2015), regulation 6(3)
// and Annexure A, plus the annual Unit Price gazette (most recently No. 54379,
// 20 March 2026).
//
// Fee = UNIT x BW x FREQ x CG x GEO x SHR x UNIBI x HOP

// ---------------------------------------------------------------------------
// UNIT PRICE — THE ONE NUMBER THAT NEEDS ANNUAL REVIEW.
// ICASA re-gazettes this every 1 April (CPI adjustment). Check
// https://www.icasa.org.za/pages/fees each March/April and update the value
// below (and the effective date) when the new gazette is published.
// ---------------------------------------------------------------------------
const UNIT_PRICE_PER_MHZ = 3367.00;
const UNIT_PRICE_EFFECTIVE_DATE = "2026-04-01";
const UNIT_PRICE_SOURCE = "Government Gazette No. 54379 (20 March 2026)";

// FREQ factor by band (Government Gazette 38642, reg. 6(3)).
// Ranges: lower bound inclusive, upper bound exclusive (last row inclusive).
const FREQ_TABLE = [
  { minGHz: 0.000001, maxGHz: 0.174, factor: 1.00 },
  { minGHz: 0.174, maxGHz: 0.88, factor: 0.75 },
  { minGHz: 0.88, maxGHz: 1.8, factor: 0.50 },
  { minGHz: 1.8, maxGHz: 5, factor: 0.40 },
  { minGHz: 5, maxGHz: 10, factor: 0.30 },
  { minGHz: 10, maxGHz: 17, factor: 0.20 },
  { minGHz: 17, maxGHz: 23, factor: 0.15 },
  { minGHz: 23, maxGHz: 30, factor: 0.10 },
  { minGHz: 30, maxGHz: 50, factor: 0.05 },
];

// Minimum path length anchors for the HOP factor (own lookup, independent of
// the FREQ table above — several FREQ bands span multiple HOP anchors).
const MIN_PATH_ANCHORS = [
  { ghz: 1.4, km: 30 },
  { ghz: 1.6, km: 30 },
  { ghz: 2, km: 30 },
  { ghz: 4, km: 16 },
  { ghz: 5, km: 16 },
  { ghz: 7.5, km: 14 },
  { ghz: 10, km: 10 },
  { ghz: 11, km: 10 },
  { ghz: 13, km: 9 },
  { ghz: 14, km: 9 },
  { ghz: 15, km: 9 },
  { ghz: 17, km: 4 },
  { ghz: 18, km: 4 },
  { ghz: 22, km: 3 },
  { ghz: 23, km: 3 },
  { ghz: 25, km: 3 },
  { ghz: 26, km: 3 },
  { ghz: 28, km: 2 },
  { ghz: 31, km: 1.5 },
  { ghz: 32, km: 1.5 },
  { ghz: 38, km: 1 },
];

// Bands offered on the public form — the common real-world terrestrial
// point-to-point channel plans (5-38 GHz). Sub-1 GHz and above-38 GHz are
// valid in the formula but essentially never used for this link type, so
// they're not exposed as options.
const SELECTABLE_BANDS_GHZ = [5, 7, 10, 11, 13, 15, 17, 18, 22, 23, 26, 28, 32, 38];

// Bandwidth options offered on the public form, with an indicative net
// throughput shown next to each so a non-technical visitor can relate MHz to
// real-world speed. These Mbps figures are a rough industry rule of thumb
// (~7 Mbps per MHz, typical of a modern full-duplex radio running adaptive
// 256QAM) — NOT part of the ICASA fee formula and not vendor-specific. Adjust
// estMbps here if WISPCOM has better data; it has zero effect on the fee
// calculation below, which only ever uses `mhz`.
//
// The valid channel widths are genuinely band-specific (confirmed directly
// against the ITU-R Recommendations South Africa's plan derives from, since
// SA is ITU Region 1 and follows the CEPT/ITU-R channelization, not the US
// FCC one):
//   - 7, 8, 10, 11, 13, 15, 22, 23, 26, 28, 32, 38 GHz all use the same
//     "doubling" family: 3.5/7/14/28/56/112(/140) MHz (ITU-R F.385, F.386,
//     F.387, F.497, F.636, F.637, F.748, F.749 — confirmed directly against
//     F.749's text for 38 GHz: 3.5/7/14/28/56/140 MHz).
//   - 17.7-19.7 GHz (our 17 & 18 GHz options) is a completely different
//     family: 27.5/55/110/220 MHz (ITU-R F.595, confirmed directly).
// There is no confirmed ITU-R or CEPT value of 40 MHz at any of these bands
// — it resembles a US/FCC-style channel width, so it's deliberately not
// offered here.
const STANDARD_BANDWIDTHS = [
  { mhz: 7, estMbps: 50 },
  { mhz: 14, estMbps: 100 },
  { mhz: 28, estMbps: 200 },
  { mhz: 56, estMbps: 400 },
];
const WIDE_BANDWIDTHS_17_18_GHZ = [
  { mhz: 27.5, estMbps: 195 },
  { mhz: 55, estMbps: 390 },
  { mhz: 110, estMbps: 785 },
];
const BANDWIDTHS_BY_BAND_GHZ = {
  17: WIDE_BANDWIDTHS_17_18_GHZ,
  18: WIDE_BANDWIDTHS_17_18_GHZ,
};

function bandwidthOptionsForBand(bandGHz) {
  return BANDWIDTHS_BY_BAND_GHZ[bandGHz] || STANDARD_BANDWIDTHS;
}

// ---------------------------------------------------------------------------
// GEO (metro vs rural) auto-detection from GPS coordinates.
// High-density = Gauteng Province (whole province) + the municipal areas of
// Cape Town and Durban (Annexure A, both the 2025 and 2026 gazettes).
//
// This used to be lat/lon bounding boxes. FIXED 2026-08-21 after a real
// misclassification was reported live: the Rustenburg corridor (genuinely
// North West Province) was being priced as Gauteng metro because a rectangle
// around Gauteng inevitably swallows land outside its real, irregular western
// border — a bounding box can never correctly represent a province shape.
// Do not reintroduce a bounding box here, even as a "quick fix" or a special
// case carve-out; the fix is real polygon data, checked below.
//
// Boundary source: geoBoundaries.org (CC BY 3.0 IGO), South Africa ADM1
// (province) and ADM2 (municipality) simplified boundaries, sourced from
// OCHA ROSEA / South African Municipal Demarcation Board data
// (data.humdata.org). See lib/geo-boundaries.js.
// ---------------------------------------------------------------------------
const { GAUTENG_POLYGON, CAPE_TOWN_POLYGON, ETHEKWINI_POLYGON } = require("./geo-boundaries");

const METRO_REGIONS = [
  { name: "Gauteng", geometry: GAUTENG_POLYGON },
  { name: "Cape Town", geometry: CAPE_TOWN_POLYGON },
  { name: "Durban", geometry: ETHEKWINI_POLYGON },
];

// Standard ray-casting point-in-polygon test on a single ring ([lon, lat] pairs).
function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersects = (yi > lat) !== (yj > lat) &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

// Handles GeoJSON Polygon (rings[0] = outer, rest = holes) and MultiPolygon
// (array of such ring-sets) geometries.
function pointInGeometry(lon, lat, geometry) {
  if (geometry.type === "Polygon") {
    return pointInPolygonRings(lon, lat, geometry.coordinates);
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((rings) => pointInPolygonRings(lon, lat, rings));
  }
  return false;
}

function pointInPolygonRings(lon, lat, rings) {
  if (!pointInRing(lon, lat, rings[0])) return false; // outside outer ring
  for (let k = 1; k < rings.length; k++) {
    if (pointInRing(lon, lat, rings[k])) return false; // inside a hole
  }
  return true;
}

function detectAreaForPoint(lat, lon) {
  for (const r of METRO_REGIONS) {
    if (pointInGeometry(lon, lat, r.geometry)) {
      return { area: "metro", region: r.name };
    }
  }
  return { area: "rural", region: null };
}

// Checks both link endpoints — either one falling inside a high-density area
// is enough to classify the whole link as metro (a link with one metro-side
// tower is still using metro-priced spectrum on that end).
function detectArea(siteA, siteB) {
  const a = detectAreaForPoint(siteA.lat, siteA.lon);
  if (a.area === "metro") return a;
  return detectAreaForPoint(siteB.lat, siteB.lon);
}

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

// Great-circle straight-line distance between two GPS points, in km.
function haversineKm(a, b) {
  const R = 6371; // mean Earth radius, km
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function freqFactor(ghz) {
  for (const row of FREQ_TABLE) {
    if (ghz >= row.minGHz && ghz < row.maxGHz) return row.factor;
  }
  if (ghz === 50) return 0.05; // final row's upper bound is inclusive
  throw new Error("Frequency out of supported range");
}

function minPathKm(ghz) {
  if (ghz < 1.4) return 30; // capped at the table's own maximum
  if (ghz > 38) return 0; // "Higher": no premium at all
  let best = null;
  for (const a of MIN_PATH_ANCHORS) {
    if (a.ghz <= ghz) best = a.km;
  }
  return best;
}

function hopFactor(ghz, actualKm) {
  const min = minPathKm(ghz);
  if (min === 0 || actualKm >= min) return 1.0;
  return Math.sqrt(min / actualKm);
}

// siteA, siteB: { lat, lon } — the two tower sites; distance and area are
// both derived from these rather than asked for directly.
// areaOverride: "metro" | "rural" (optional — overrides the auto-detected area)
// congestion: "congested" | "not_congested" (optional, defaults not_congested)
// sharing: "shared" | "exclusive" (optional, defaults exclusive)
// directionality: "unidirectional" | "bidirectional" (optional, defaults bidirectional)
function calculateFee({ bandGHz, bandwidthMHz, siteA, siteB, areaOverride, congestion, sharing, directionality }) {
  const distanceKm = haversineKm(siteA, siteB);
  const detected = detectArea(siteA, siteB);
  const area = areaOverride === "metro" || areaOverride === "rural" ? areaOverride : detected.area;

  const freq = freqFactor(bandGHz);
  const geo = area === "metro" ? 1.0 : 0.1;
  const cg = congestion === "congested" ? 1.5 : 1.0;
  const shr = sharing === "shared" ? 0.5 : 1.0;
  const unibi = directionality === "unidirectional" ? 0.75 : 1.0;
  const hop = hopFactor(bandGHz, distanceKm);

  const fee = UNIT_PRICE_PER_MHZ * bandwidthMHz * freq * cg * geo * shr * unibi * hop;

  return {
    fee: Math.round(fee * 100) / 100,
    breakdown: {
      unitPricePerMHz: UNIT_PRICE_PER_MHZ,
      unitPriceEffectiveDate: UNIT_PRICE_EFFECTIVE_DATE,
      unitPriceSource: UNIT_PRICE_SOURCE,
      distanceKm: Math.round(distanceKm * 1000) / 1000,
      area,
      areaAutoDetected: !areaOverride,
      areaRegion: detected.region,
      freqFactor: freq,
      geoFactor: geo,
      congestionFactor: cg,
      sharingFactor: shr,
      directionalityFactor: unibi,
      hopFactor: Math.round(hop * 10000) / 10000,
    },
  };
}

module.exports = {
  calculateFee,
  haversineKm,
  detectArea,
  SELECTABLE_BANDS_GHZ,
  bandwidthOptionsForBand,
  UNIT_PRICE_PER_MHZ,
  UNIT_PRICE_EFFECTIVE_DATE,
};
