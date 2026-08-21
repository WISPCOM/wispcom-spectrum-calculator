const { calculateFee, SELECTABLE_BANDS_GHZ, bandwidthOptionsForBand } = require("../lib/pricing");

function parseCoord(raw) {
  if (!raw || typeof raw !== "object") return null;
  const lat = Number(raw.lat);
  const lon = Number(raw.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

module.exports = (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = req.body || {};
  const bandGHz = Number(body.bandGHz);
  const bandwidthMHz = Number(body.bandwidthMHz);
  const siteA = parseCoord(body.siteA);
  const siteB = parseCoord(body.siteB);
  const areaOverride = body.areaOverride === "metro" || body.areaOverride === "rural" ? body.areaOverride : null;
  const congestion = body.congestion === "congested" ? "congested" : "not_congested";
  const sharing = body.sharing === "shared" ? "shared" : "exclusive";
  const directionality = body.directionality === "unidirectional" ? "unidirectional" : "bidirectional";

  if (!SELECTABLE_BANDS_GHZ.includes(bandGHz)) {
    res.status(400).json({ error: "Invalid frequency band." });
    return;
  }
  const validBandwidths = bandwidthOptionsForBand(bandGHz).map((b) => b.mhz);
  if (!validBandwidths.includes(bandwidthMHz)) {
    res.status(400).json({ error: "That bandwidth isn't a valid channel width for the selected band." });
    return;
  }
  if (!siteA || !siteB) {
    res.status(400).json({ error: "Enter valid GPS coordinates for both sites (e.g. -26.2041, 28.0473)." });
    return;
  }

  const result = calculateFee({ bandGHz, bandwidthMHz, siteA, siteB, areaOverride, congestion, sharing, directionality });

  if (result.breakdown.distanceKm <= 0 || result.breakdown.distanceKm > 200) {
    res.status(400).json({ error: "That works out to an unusually long or zero-length hop — please check the coordinates for both sites." });
    return;
  }

  res.status(200).json({
    fee: result.fee,
    inputs: { bandGHz, bandwidthMHz, siteA, siteB, areaOverride, congestion, sharing, directionality },
    assumptions: result.breakdown,
  });
};
