const { calculateFee, SELECTABLE_BANDS_GHZ } = require("../lib/pricing");

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
  const distanceKm = Number(body.distanceKm);
  const area = body.area === "metro" ? "metro" : "rural";
  const congestion = body.congestion === "congested" ? "congested" : "not_congested";
  const sharing = body.sharing === "shared" ? "shared" : "exclusive";
  const directionality = body.directionality === "unidirectional" ? "unidirectional" : "bidirectional";

  if (!SELECTABLE_BANDS_GHZ.includes(bandGHz)) {
    res.status(400).json({ error: "Invalid frequency band." });
    return;
  }
  if (!Number.isFinite(bandwidthMHz) || bandwidthMHz <= 0 || bandwidthMHz > 1000) {
    res.status(400).json({ error: "Enter a valid bandwidth in MHz." });
    return;
  }
  if (!Number.isFinite(distanceKm) || distanceKm <= 0 || distanceKm > 500) {
    res.status(400).json({ error: "Enter a valid link distance in km." });
    return;
  }

  const result = calculateFee({ bandGHz, bandwidthMHz, distanceKm, area, congestion, sharing, directionality });

  res.status(200).json({
    fee: result.fee,
    inputs: { bandGHz, bandwidthMHz, distanceKm, area, congestion, sharing, directionality },
    assumptions: result.breakdown,
  });
};
