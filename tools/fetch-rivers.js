// The Seine (and other big rivers) are mapped as giant relations that don't
// bake well. Instead: fetch river/canal centerlines and bake them into
// ribbon polygons appended to each city's water array.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "client", "public", "data");

const CITIES = {
  boston: { lat: 42.3633093, lon: -71.0880085, radius: 700, defaultWidth: { river: 90, canal: 18 } },
  tangerang: { lat: -6.2263205, lon: 106.5995936, radius: 700, defaultWidth: { river: 30, canal: 10 } },
  paris: { lat: 48.8583701, lon: 2.2944813, radius: 1800, defaultWidth: { river: 165, canal: 16 } },
};

async function overpass(query, attempt = 1) {
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    body: "data=" + encodeURIComponent(query),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "anniversary-gift-game/1.0 (personal project)",
      "Accept": "application/json",
    },
  });
  if (!res.ok) {
    if (attempt < 5) {
      await new Promise((r) => setTimeout(r, attempt * 15000));
      return overpass(query, attempt + 1);
    }
    throw new Error(`Overpass ${res.status}`);
  }
  return res.json();
}

function makeProjector(lat0, lon0) {
  const mLat = 111320;
  const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180);
  return (lat, lon) => [
    Math.round((lon - lon0) * mLon * 10) / 10,
    Math.round(-(lat - lat0) * mLat * 10) / 10,
  ];
}

// centerline + width → outline polygon (left bank, then right bank reversed)
function ribbonPolygon(pts, width) {
  const hw = width / 2;
  const left = [], right = [];
  for (let i = 0; i < pts.length; i++) {
    const [x, z] = pts[i];
    let dx = 0, dz = 0;
    if (i > 0) { dx += x - pts[i - 1][0]; dz += z - pts[i - 1][1]; }
    if (i < pts.length - 1) { dx += pts[i + 1][0] - x; dz += pts[i + 1][1] - z; }
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len, nz = dx / len;
    left.push([Math.round((x + nx * hw) * 10) / 10, Math.round((z + nz * hw) * 10) / 10]);
    right.push([Math.round((x - nx * hw) * 10) / 10, Math.round((z - nz * hw) * 10) / 10]);
  }
  return left.concat(right.reverse());
}

const only = process.argv.slice(2);
for (const [key, city] of Object.entries(CITIES)) {
  if (only.length && !only.includes(key)) continue;
  const file = path.join(DATA_DIR, `${key}.json`);
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const proj = makeProjector(city.lat, city.lon);
  const around = `(around:${city.radius + 200},${city.lat},${city.lon})`;
  console.log(`${key}: fetching river centerlines...`);
  const q = `[out:json][timeout:60];(way["waterway"~"^(river|canal)$"]${around};);out tags geom;`;
  const res = await overpass(q);

  // remove previously-baked ribbons if re-run
  data.water = data.water.filter((w) => !w.ribbon);

  let added = 0;
  for (const el of res.elements) {
    if (el.type !== "way" || !el.geometry) continue;
    const kind = el.tags.waterway;
    const width = parseFloat(el.tags.width) || city.defaultWidth[kind] || 15;
    const pts = el.geometry.map((g) => proj(g.lat, g.lon));
    if (pts.length < 2) continue;
    const lim = city.radius + 400;
    const clamped = pts.map(([x, z]) => [
      Math.max(-lim, Math.min(lim, x)),
      Math.max(-lim, Math.min(lim, z)),
    ]);
    if (!clamped.some(([x, z]) => Math.hypot(x, z) < city.radius + 250)) continue;
    data.water.push({ p: ribbonPolygon(clamped, width), n: el.tags.name, ribbon: true });
    added++;
    console.log(`  + ${el.tags.name || kind} (w=${width})`);
  }
  fs.writeFileSync(file, JSON.stringify(data));
  console.log(`  ${key}: appended ${added} river ribbons (${Math.round(fs.statSync(file).size / 1024)} KB)`);
  await new Promise((r) => setTimeout(r, 3000));
}
console.log("done.");
