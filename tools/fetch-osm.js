// Fetches real OpenStreetMap data around the three places in the story
// and bakes it into compact JSON the 3D client renders.
//
// Usage: node tools/fetch-osm.js [cityKey ...]
// Output: client/public/data/<city>.json

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "client", "public", "data");

const CITIES = {
  boston: {
    name: "Cambridge · Boston",
    lat: 42.3633093,
    lon: -71.0880085,
    radius: 1300, // all of MIT — Kendall to Killian Court, Sloan to Simmons
  },
  tangerang: {
    name: "Tangerang",
    lat: -6.2263205,
    lon: 106.5995936,
    radius: 2400, // all of Lippo Village out to the Jakarta–Merak toll road
  },
  serpong: {
    name: "Gading Serpong",
    lat: -6.2675297,
    lon: 106.6199815, // CARS LAND — her café block
    radius: 900,
  },
  paris: {
    name: "Paris",
    lat: 48.8583701,
    lon: 2.2944813,
    radius: 1800, // big enough that the view from the tower summit feels endless
  },
};

const OVERPASS = "https://overpass-api.de/api/interpreter";

async function overpass(query, attempt = 1) {
  const res = await fetch(OVERPASS, {
    method: "POST",
    body: "data=" + encodeURIComponent(query),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "anniversary-gift-game/1.0 (personal project)",
      "Accept": "application/json",
    },
  });
  if (!res.ok) {
    if (attempt < 4) {
      const wait = attempt * 15000;
      console.log(`  overpass ${res.status}, retrying in ${wait / 1000}s...`);
      await new Promise((r) => setTimeout(r, wait));
      return overpass(query, attempt + 1);
    }
    throw new Error(`Overpass failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- projection: local meters around city center, x = east, z = south ---
function makeProjector(lat0, lon0) {
  const mLat = 111320;
  const mLon = 111320 * Math.cos((lat0 * Math.PI) / 180);
  return (lat, lon) => [
    Math.round((lon - lon0) * mLon * 10) / 10,
    Math.round(-(lat - lat0) * mLat * 10) / 10,
  ];
}

function simplify(points, minDist = 1.2) {
  if (points.length <= 3) return points;
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = out[out.length - 1];
    const [bx, bz] = points[i];
    if (Math.hypot(bx - ax, bz - az) >= minDist || i === points.length - 1) {
      out.push(points[i]);
    }
  }
  return out;
}

function ringArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i];
    const [x2, z2] = pts[(i + 1) % pts.length];
    a += x1 * z2 - x2 * z1;
  }
  return Math.abs(a / 2);
}

function centroid(pts) {
  let x = 0, z = 0;
  for (const p of pts) { x += p[0]; z += p[1]; }
  return [x / pts.length, z / pts.length];
}

// Stitch relation member ways (role=outer) into closed rings.
function stitchRings(members) {
  const segs = members
    .filter((m) => m.type === "way" && (m.role === "outer" || m.role === "") && m.geometry)
    .map((m) => m.geometry.map((g) => [g.lat, g.lon]));
  const rings = [];
  while (segs.length) {
    let ring = segs.shift();
    let extended = true;
    while (extended) {
      extended = false;
      const [hLat, hLon] = ring[0];
      const [tLat, tLon] = ring[ring.length - 1];
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        const [sh0, sh1] = s[0];
        const [st0, st1] = s[s.length - 1];
        const eq = (a, b, c, d) => Math.abs(a - c) < 1e-7 && Math.abs(b - d) < 1e-7;
        if (eq(tLat, tLon, sh0, sh1)) { ring = ring.concat(s.slice(1)); }
        else if (eq(tLat, tLon, st0, st1)) { ring = ring.concat(s.slice().reverse().slice(1)); }
        else if (eq(hLat, hLon, st0, st1)) { ring = s.slice(0, -1).concat(ring); }
        else if (eq(hLat, hLon, sh0, sh1)) { ring = s.slice().reverse().slice(0, -1).concat(ring); }
        else continue;
        segs.splice(i, 1);
        extended = true;
        break;
      }
    }
    if (ring.length >= 4) rings.push(ring);
  }
  return rings;
}

function buildingHeight(tags, cityKey, jitter) {
  const h = parseFloat(tags["height"]);
  if (!isNaN(h)) return Math.min(h, 120);
  const levels = parseFloat(tags["building:levels"]);
  if (!isNaN(levels)) return Math.max(3.2, levels * 3.1 + 1.5);
  // sensible defaults per city, jittered so unheighted rows don't look stamped
  if (cityKey === "paris") return 16 + jitter * 8;        // 16–24
  if (cityKey === "tangerang") return jitter < 0.75 ? 3.8 + jitter * 1.6 : 6.4 + jitter * 1.4; // mostly 1-story, some 2
  return 8 + jitter * 9; // boston/cambridge mix 8–17
}

// simplified building category the client styles around
function buildingCategory(tags) {
  const b = tags["building"] || "";
  if (/^(retail|commercial|supermarket|kiosk|shop)$/.test(b)) return "retail";
  if (/^(apartments|residential|dormitory)$/.test(b)) return "apartments";
  if (/^(house|detached|terrace|semidetached_house|bungalow)$/.test(b)) return "house";
  if (/^(office)$/.test(b)) return "office";
  if (/^(university|college|school)$/.test(b)) return "school";
  if (/^(church|cathedral|mosque|chapel|temple)$/.test(b)) return "worship";
  if (/^(industrial|warehouse|garage|garages|shed|roof|carport)$/.test(b)) return "utility";
  if (tags["shop"] || tags["amenity"] === "restaurant" || tags["amenity"] === "cafe") return "retail";
  return "generic";
}

const ROAD_WIDTHS = {
  motorway: 13, motorway_link: 8, trunk: 12, trunk_link: 8,
  primary: 11, primary_link: 7, secondary: 9, secondary_link: 6,
  tertiary: 8, residential: 6.5, unclassified: 6, living_street: 5.5,
  service: 4, pedestrian: 5, footway: 2.2, path: 2, cycleway: 2.5, steps: 2,
};

async function fetchCity(key) {
  const city = CITIES[key];
  const { lat, lon, radius } = city;
  const proj = makeProjector(lat, lon);
  const around = `(around:${radius},${lat},${lon})`;

  console.log(`\n=== ${city.name} (r=${radius}m) ===`);

  // 1. buildings
  console.log("  fetching buildings...");
  const bQ = `[out:json][timeout:90];(way["building"]${around};relation["building"]${around};);out tags geom;`;
  const bRes = await overpass(bQ);
  await sleep(2500);

  // 2. roads
  console.log("  fetching roads...");
  const rQ = `[out:json][timeout:90];(way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|residential|unclassified|living_street|service|pedestrian|footway|path|cycleway|steps)$"]${around};);out tags geom;`;
  const rRes = await overpass(rQ);
  await sleep(2500);

  // 3. water
  console.log("  fetching water...");
  const wQ = `[out:json][timeout:90];(way["natural"="water"]${around};relation["natural"="water"]${around};way["waterway"="riverbank"]${around};relation["waterway"="riverbank"]${around};relation["water"]${around};);out tags geom;`;
  const wRes = await overpass(wQ);
  await sleep(2500);

  // 4. green areas
  console.log("  fetching parks/green...");
  const gQ = `[out:json][timeout:90];(way["leisure"~"^(park|garden|pitch|playground|common)$"]${around};relation["leisure"~"^(park|garden)$"]${around};way["landuse"~"^(grass|recreation_ground|meadow|village_green|forest|cemetery)$"]${around};way["natural"="wood"]${around};);out tags geom;`;
  const gRes = await overpass(gQ);
  await sleep(2500);

  // 5. trees
  console.log("  fetching trees...");
  const tQ = `[out:json][timeout:60];(node["natural"="tree"]${around};);out;`;
  const tRes = await overpass(tQ);
  await sleep(2500);

  // 6. named places — shops, cafés, restaurants (real names for storefronts!)
  console.log("  fetching named places...");
  const pQ = `[out:json][timeout:60];(
    node["name"]["shop"]${around};
    node["name"]["amenity"~"^(restaurant|cafe|fast_food|bar|pub|bakery|ice_cream|pharmacy|bank|cinema|theatre|library)$"]${around};
    way["name"]["shop"]${around};
    way["name"]["amenity"~"^(restaurant|cafe|fast_food|bar|pub|bakery|ice_cream|pharmacy|bank|cinema|theatre)$"]${around};
  );out tags center;`;
  const pRes = await overpass(pQ);

  // ---- bake ----
  const out = {
    key,
    name: city.name,
    center: { lat, lon },
    radius,
    buildings: [],
    roads: [],
    water: [],
    green: [],
    trees: [],
    pois: [],
  };

  const inRange = (pts, slack = 250) =>
    pts.some(([x, z]) => Math.hypot(x, z) < radius + slack);

  // buildings
  for (const el of bRes.elements) {
    const tags = el.tags || {};
    let rings = [];
    if (el.type === "way" && el.geometry) {
      rings = [el.geometry.map((g) => [g.lat, g.lon])];
    } else if (el.type === "relation" && el.members) {
      rings = stitchRings(el.members);
    }
    for (const ringLL of rings) {
      let pts = simplify(ringLL.map(([la, lo]) => proj(la, lo)), 0.8);
      // drop closing duplicate point
      if (pts.length > 1) {
        const [f, l] = [pts[0], pts[pts.length - 1]];
        if (Math.hypot(f[0] - l[0], f[1] - l[1]) < 0.3) pts = pts.slice(0, -1);
      }
      if (pts.length < 3 || !inRange(pts)) continue;
      if (ringArea(pts) < 12) continue;
      // deterministic per-building jitter from footprint position
      const [c0x, c0z] = centroid(pts);
      const jitter = (Math.abs(Math.sin(c0x * 12.9898 + c0z * 78.233)) * 43758.5453) % 1;
      const b = {
        p: pts,
        h: Math.round(buildingHeight(tags, key, jitter) * 10) / 10,
        c: buildingCategory(tags),
      };
      const name = tags["name"];
      if (name) b.n = name;
      if (tags["building"] === "tower" || /tour eiffel/i.test(name || "")) b.tower = true;
      out.buildings.push(b);
    }
  }

  // roads
  for (const el of rRes.elements) {
    if (el.type !== "way" || !el.geometry) continue;
    const t = el.tags?.highway || "residential";
    let pts = simplify(el.geometry.map((g) => proj(g.lat, g.lon)), 2.5);
    if (pts.length < 2 || !inRange(pts)) continue;
    const road = { p: pts, w: ROAD_WIDTHS[t] ?? 5 };
    road.t = /^(footway|path|cycleway|steps|pedestrian)$/.test(t) ? "path" : "road";
    if (el.tags?.name) road.n = el.tags.name;
    out.roads.push(road);
  }

  // water
  for (const el of wRes.elements) {
    let rings = [];
    if (el.type === "way" && el.geometry) {
      rings = [el.geometry.map((g) => [g.lat, g.lon])];
    } else if (el.type === "relation" && el.members) {
      rings = stitchRings(el.members);
    }
    for (const ringLL of rings) {
      let pts = simplify(ringLL.map(([la, lo]) => proj(la, lo)), 3);
      if (pts.length < 3) continue;
      // clamp far-away points so huge rivers don't blow up the mesh
      const lim = radius + 400;
      pts = pts.map(([x, z]) => [
        Math.max(-lim, Math.min(lim, x)),
        Math.max(-lim, Math.min(lim, z)),
      ]);
      if (!inRange(pts) || ringArea(pts) < 40) continue;
      out.water.push({ p: pts, n: el.tags?.name });
    }
  }

  // green
  for (const el of gRes.elements) {
    let rings = [];
    if (el.type === "way" && el.geometry) {
      rings = [el.geometry.map((g) => [g.lat, g.lon])];
    } else if (el.type === "relation" && el.members) {
      rings = stitchRings(el.members);
    }
    for (const ringLL of rings) {
      const pts = simplify(ringLL.map(([la, lo]) => proj(la, lo)), 2.5);
      if (pts.length < 3 || !inRange(pts) || ringArea(pts) < 60) continue;
      out.green.push({ p: pts, n: el.tags?.name });
    }
  }

  // named places → storefront signs
  for (const el of pRes.elements) {
    const tags = el.tags || {};
    const lat0 = el.lat ?? el.center?.lat;
    const lon0 = el.lon ?? el.center?.lon;
    if (lat0 == null || !tags.name) continue;
    const [x, z] = proj(lat0, lon0);
    if (Math.hypot(x, z) > radius + 50) continue;
    out.pois.push({
      x, z,
      n: tags.name.slice(0, 28),
      t: tags.amenity || tags.shop || "shop",
    });
  }
  // closest first, cap so signs stay special
  out.pois.sort((a, b) => (a.x * a.x + a.z * a.z) - (b.x * b.x + b.z * b.z));
  out.pois = out.pois.slice(0, 140);

  // trees (sample down if huge)
  let trees = tRes.elements
    .map((n) => proj(n.lat, n.lon))
    .filter(([x, z]) => Math.hypot(x, z) < radius + 60);
  if (trees.length > 900) {
    const step = trees.length / 900;
    trees = trees.filter((_, i) => i % Math.ceil(step) === 0);
  }
  out.trees = trees;

  console.log(
    `  baked: ${out.buildings.length} buildings, ${out.roads.length} roads, ` +
    `${out.water.length} water, ${out.green.length} green, ${out.trees.length} trees, ${out.pois.length} pois`
  );

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, `${key}.json`);
  fs.writeFileSync(file, JSON.stringify(out));
  const kb = Math.round(fs.statSync(file).size / 1024);
  console.log(`  wrote ${file} (${kb} KB)`);
}

const keys = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CITIES);
for (const key of keys) {
  await fetchCity(key);
  await sleep(3000);
}
console.log("\nAll done.");
