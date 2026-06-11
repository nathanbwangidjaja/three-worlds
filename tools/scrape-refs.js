// Reference scraper: systematically captures what a city really looks like.
//
// Walks every road in the baked city JSON, samples a point every STEP
// meters, checks the (free) Street View metadata endpoint for a panorama,
// dedupes by pano id, then downloads 4 road-aligned views per panorama:
// forward / right / back / left. Also grabs a satellite overview plus a
// zoom-18 tile grid covering the area.
//
// Output: refs/<city>/sv_<x>_<z>_<f|r|b|l>.jpg   (game-world coordinates!)
//         refs/<city>/sat_overview.png, sat_r<r>_c<c>.png
//         refs/<city>/index.json                 (everything, mapped to game x/z)
//
// Usage: node tools/scrape-refs.js <city> [--step 55] [--radius 700] [--cap 300]
// Reads VITE_GOOGLE_MAPS_API_KEY from client/.env.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = fs.readFileSync(path.join(__dirname, "..", "client", ".env"), "utf8");
const KEY = env.match(/VITE_GOOGLE_MAPS_API_KEY\s*=\s*(\S+)/)?.[1];
if (!KEY) { console.error("no VITE_GOOGLE_MAPS_API_KEY in client/.env"); process.exit(1); }

const CITIES = {
  boston: { lat: 42.3633093, lon: -71.0880085 },
  tangerang: { lat: -6.2263205, lon: 106.5995936 },
  paris: { lat: 48.8583701, lon: 2.2944813 },
};

const args = process.argv.slice(2);
const city = args[0];
if (!CITIES[city]) { console.error("usage: node tools/scrape-refs.js <boston|tangerang|paris> [--step N] [--radius N] [--cap N]"); process.exit(1); }
const opt = (name, dflt) => {
  const i = args.indexOf("--" + name);
  return i >= 0 ? Number(args[i + 1]) : dflt;
};
const STEP = opt("step", 55);
const RADIUS = opt("radius", 700);
const MIN_RADIUS = opt("minradius", 0);
const CAP = opt("cap", 300);

const { lat: lat0, lon: lon0 } = CITIES[city];
const mLat = 111320;
const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180);
const toLatLon = (x, z) => [lat0 - z / mLat, lon0 + x / mLon];
const toXZ = (lat, lon) => [
  Math.round((lon - lon0) * mLon * 10) / 10,
  Math.round(-(lat - lat0) * mLat * 10) / 10,
];

const OUT = path.join(__dirname, "..", "refs", city);
fs.mkdirSync(OUT, { recursive: true });

const data = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "client", "public", "data", `${city}.json`), "utf8"));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url) {
  const res = await fetch(url);
  return res.json();
}
async function fetchToFile(url, file) {
  const res = await fetch(url);
  if (!res.ok) return false;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 5000) return false; // "no imagery" placeholder
  fs.writeFileSync(file, buf);
  return true;
}

// ---- 1. sample points along every road, with the road's bearing ----
const samples = [];
for (const r of data.roads) {
  if (r.t !== "road" && r.t !== "path") continue;
  for (let i = 1; i < r.p.length; i++) {
    const [ax, az] = r.p[i - 1], [bx, bz] = r.p[i];
    const segLen = Math.hypot(bx - ax, bz - az);
    if (segLen < 2) continue;
    const dx = (bx - ax) / segLen, dz = (bz - az) / segLen;
    // bearing: x=east, z=south → heading measured clockwise from north
    const bearing = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
    for (let d = 0; d < segLen; d += STEP) {
      const x = ax + dx * d, z = az + dz * d;
      const dist = Math.hypot(x, z);
      if (dist > RADIUS || dist < MIN_RADIUS) continue;
      samples.push({ x, z, bearing });
    }
  }
}
// closest to the center first — the most important references
samples.sort((a, b) => (a.x * a.x + a.z * a.z) - (b.x * b.x + b.z * b.z));
console.log(`${city}: ${samples.length} road sample points (step ${STEP}m, radius ${RADIUS}m)`);

// ---- 2. metadata pass (free): which samples actually have panoramas? ----
const seenPanos = new Set();
const hits = [];
let checked = 0;
for (const s of samples) {
  if (hits.length >= CAP) break;
  checked++;
  const [lat, lon] = toLatLon(s.x, s.z);
  const meta = await fetchJson(
    `https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat},${lon}&radius=28&source=outdoor&key=${KEY}`
  );
  if (meta.status !== "OK" || seenPanos.has(meta.pano_id)) continue;
  // skip user-contributed panos (often indoor shots inside malls/restaurants)
  if (meta.copyright && !/Google/.test(meta.copyright)) continue;
  seenPanos.add(meta.pano_id);
  const [px, pz] = toXZ(meta.location.lat, meta.location.lng);
  hits.push({ pano: meta.pano_id, date: meta.date, x: px, z: pz, bearing: Math.round(s.bearing) });
  if (hits.length % 25 === 0) console.log(`  metadata: ${hits.length} unique panos (${checked} checked)`);
  await sleep(40);
}
console.log(`  ${hits.length} unique panoramas found (${checked}/${samples.length} samples checked)`);

// ---- 3. download 4 road-aligned views per panorama ----
const DIRS = [["f", 0], ["r", 90], ["b", 180], ["l", 270]];
const index = [];
let nImages = 0;
for (let i = 0; i < hits.length; i++) {
  const h = hits[i];
  const views = {};
  for (const [tag, off] of DIRS) {
    const heading = (h.bearing + off) % 360;
    const file = `sv_${Math.round(h.x)}_${Math.round(h.z)}_${tag}.jpg`;
    const ok = await fetchToFile(
      `https://maps.googleapis.com/maps/api/streetview?size=640x640&pano=${h.pano}&heading=${heading}&fov=95&pitch=8&key=${KEY}`,
      path.join(OUT, file)
    );
    if (ok) { views[tag] = file; nImages++; }
    await sleep(60);
  }
  index.push({ ...h, views });
  if ((i + 1) % 20 === 0) console.log(`  images: ${nImages} (${i + 1}/${hits.length} panos)`);
}

// ---- 4. satellite: one overview + a zoom-18 grid over the radius ----
console.log("  satellite tiles...");
await fetchToFile(
  `https://maps.googleapis.com/maps/api/staticmap?center=${lat0},${lon0}&zoom=15&size=640x640&scale=2&maptype=satellite&key=${KEY}`,
  path.join(OUT, "sat_overview.png")
);
// zoom 18 ≈ 0.38 km per 640px tile at the equator; 5×5 grid ≈ 1.6 km
const TILE_M = 0.38 * 1000 * Math.cos((lat0 * Math.PI) / 180) ** 0; // ~constant enough
const half = Math.ceil(RADIUS / TILE_M);
for (let rI = -half; rI <= half; rI++) {
  for (let cI = -half; cI <= half; cI++) {
    const [tlat, tlon] = toLatLon(cI * TILE_M, rI * TILE_M);
    await fetchToFile(
      `https://maps.googleapis.com/maps/api/staticmap?center=${tlat},${tlon}&zoom=18&size=640x640&scale=2&maptype=satellite&key=${KEY}`,
      path.join(OUT, `sat_r${rI + half}_c${cI + half}.png`)
    );
    await sleep(60);
  }
}

fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify({
  city, step: STEP, radius: RADIUS,
  note: "x,z are game-world meters (x=east, z=south, origin = the special coordinate). sv_<x>_<z>_<f|r|b|l>.jpg: f=along road, r=+90°, b=+180°, l=+270°. sat grid rows go north→south.",
  panos: index,
}, null, 2));

console.log(`done: ${nImages} street images, ${(half * 2 + 1) ** 2 + 1} satellite tiles → refs/${city}/`);
console.log(`approx cost: street $${(nImages * 7 / 1000).toFixed(2)} + sat $${(((half * 2 + 1) ** 2 + 1) * 2 / 1000).toFixed(2)} (inside Google's monthly free credit)`);
