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
const BANDWIDTH_OPTIONS = [
  { mhz: 7, estMbps: 50 },
  { mhz: 14, estMbps: 100 },
  { mhz: 28, estMbps: 200 },
  { mhz: 40, estMbps: 300 },
  { mhz: 55, estMbps: 400 },
  { mhz: 56, estMbps: 400 },
  { mhz: 110, estMbps: 800 },
];

// ---------------------------------------------------------------------------
// GEO (metro vs rural) auto-detection from GPS coordinates.
// High-density = Gauteng Province (whole province) + the municipal areas of
// Cape Town and Durban (Annexure A, both the 2025 and 2026 gazettes).
// These are deliberately simple bounding boxes, not the real municipal/
// provincial polygons — a reasonable approximation for an estimate tool, but
// it can misclassify a site right at the edge of a boundary. Points near a
// boundary should be confirmed with WISPCOM directly (the advanced "override
// detected area" option on the form exists for exactly this).
// ---------------------------------------------------------------------------
const METRO_REGIONS = [
  { name: "Gauteng", minLat: -26.95, maxLat: -25.0, minLon: 27.0, maxLon: 29.15 },
  { name: "Cape Town", minLat: -34.35, maxLat: -33.45, minLon: 18.30, maxLon: 19.00 },
  { name: "Durban", minLat: -30.20, maxLat: -29.35, minLon: 30.55, maxLon: 31.15 },
];

function detectArea(lat, lon) {
  for (const r of METRO_REGIONS) {
    if (lat >= r.minLat && lat <= r.maxLat && lon >= r.minLon && lon <= r.maxLon) {
      return { area: "metro", region: r.name };
    }
  }
  return { area: "rural", region: null };
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
  const midpoint = { lat: (siteA.lat + siteB.lat) / 2, lon: (siteA.lon + siteB.lon) / 2 };
  const detected = detectArea(midpoint.lat, midpoint.lon);
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
  BANDWIDTH_OPTIONS,
  UNIT_PRICE_PER_MHZ,
  UNIT_PRICE_EFFECTIVE_DATE,
};
