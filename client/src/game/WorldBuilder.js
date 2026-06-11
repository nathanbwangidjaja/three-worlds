// Turns baked OSM JSON (real map data) into a polished stylized 3D city:
// textured facades with window grids, terracotta hip roofs, marked roads
// with sidewalks, parks, rivers, clouds and parked cars.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  facadeTexture, houseWallTexture, storefrontTexture, roofTexture, flatRoofTexture,
  asphaltTexture, sidewalkTexture, grassTexture, cloudTexture, glowTexture,
  panelGridTexture, curtainWallTexture, ribbonBandTexture, garageTexture,
  fenceTexture, mansardTexture,
} from "./textures.js";
import { TUNING, STYLE_DEFS } from "./cityTuning.js";
import { isRestaurant } from "./cuisines.js";
import { modelParts, pickModel, TRIM_MAT } from "./cars.js";

const TEXTURE_FACTORIES = {
  facade: facadeTexture,
  panel: panelGridTexture,
  curtain: curtainWallTexture,
  ribbon: ribbonBandTexture,
  garage: garageTexture,
};

// deterministic rng so both players see the identical world
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// bucketed point set — turns "scan every sample on every road" loops from
// O(n²) into O(n) on the big 2400m maps
function ptGrid(cell) {
  const map = new Map();
  return {
    add(x, z, payload) {
      const k = Math.floor(x / cell) + "," + Math.floor(z / cell);
      let arr = map.get(k);
      if (!arr) { arr = []; map.set(k, arr); }
      arr.push(payload ?? [x, z]);
    },
    near(x, z, r) {
      const out = [];
      const g0x = Math.floor((x - r) / cell), g1x = Math.floor((x + r) / cell);
      const g0z = Math.floor((z - r) / cell), g1z = Math.floor((z + r) / cell);
      for (let gx = g0x; gx <= g1x; gx++) {
        for (let gz = g0z; gz <= g1z; gz++) {
          const arr = map.get(gx + "," + gz);
          if (arr) out.push(...arr);
        }
      }
      return out;
    },
  };
}

// motorways and their ramps — no parked cars, picket fences, street lamps
// or crosswalks belong on the Jakarta–Merak toll
function isHighway(r) {
  return r.w === 13 || r.w === 8 || (r.n && /jalan tol/i.test(r.n));
}

// oriented rectangle → collision polygon (cars, fences, benches)
export function rectPoly(cx, cz, halfW, halfL, ry) {
  const s = Math.sin(ry), c = Math.cos(ry);
  return [[-halfW, -halfL], [halfW, -halfL], [halfW, halfL], [-halfW, halfL]]
    .map(([x, z]) => [cx + x * c + z * s, cz - x * s + z * c]);
}

function pointInPoly(x, z, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function polyBBox(pts) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of pts) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  return { minX, maxX, minZ, maxZ };
}

function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i];
    const [x2, z2] = pts[(i + 1) % pts.length];
    a += x1 * z2 - x2 * z1;
  }
  return a / 2;
}

function centroidOf(pts) {
  let x = 0, z = 0;
  for (const p of pts) { x += p[0]; z += p[1]; }
  return [x / pts.length, z / pts.length];
}

// flat polygon → ShapeGeometry on XZ plane at given y (uv = world meters / uvScale)
function flatPolyGeometry(pts, y, uvScale = 0) {
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0], -pts[0][1]);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], -pts[i][1]);
  shape.closePath();
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  if (uvScale > 0) {
    const pos = g.attributes.position;
    const uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      uv.setXY(i, pos.getX(i) / uvScale, pos.getZ(i) / uvScale);
    }
  }
  return g;
}

// polyline → flat ribbon with length-wise UVs (u = arc length / tileLen)
function ribbonGeometry(pts, width, y, tileLen = 12) {
  const hw = width / 2;
  const n = pts.length;
  const positions = new Float32Array(n * 2 * 3);
  const uvs = new Float32Array(n * 2 * 2);
  const indices = [];
  let arc = 0;
  for (let i = 0; i < n; i++) {
    const [x, z] = pts[i];
    if (i > 0) arc += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1]);
    // average adjacent segment directions; clamp the miter so sharp corners
    // don't shoot kilometer-long spikes
    let dx = 0, dz = 0;
    if (i > 0) {
      const l = Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1]) || 1;
      dx += (x - pts[i - 1][0]) / l; dz += (z - pts[i - 1][1]) / l;
    }
    if (i < n - 1) {
      const l = Math.hypot(pts[i + 1][0] - x, pts[i + 1][1] - z) || 1;
      dx += (pts[i + 1][0] - x) / l; dz += (pts[i + 1][1] - z) / l;
    }
    const len = Math.hypot(dx, dz) || 1;
    let nx = -dz / len, nz = dx / len;
    // miter length grows as 1/sin(θ/2); cap the widening at 1.6×
    const miter = Math.min(1.6, 2 / Math.max(0.25, len));
    positions.set([x + nx * hw * miter, y, z + nz * hw * miter], i * 6);
    positions.set([x - nx * hw * miter, y, z - nz * hw * miter], i * 6 + 3);
    const u = arc / tileLen;
    uvs.set([u, 0], i * 4);
    uvs.set([u, 1], i * 4 + 2);
    if (i > 0) {
      const a = (i - 1) * 2, b = a + 1, c = i * 2, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

export class WorldBuilder {
  constructor(scene, theme, data) {
    this.scene = scene;
    this.theme = theme;
    this.data = data;
    this.group = new THREE.Group();
    this.rng = mulberry32(hashStr(data.key));
    this.collisionPolys = []; // {pts, bbox, h} — buildings + water
    this.animated = [];       // callbacks(t, dt)
    this.isPhotoreal = false;
  }

  async build(onProgress) {
    const { theme, group } = this;
    const tmark = (label, fn) => {
      const t0 = performance.now();
      const out = fn();
      const ms = Math.round(performance.now() - t0);
      if (ms > 250) console.log(`[world] ${label}: ${ms}ms`);
      return out;
    };
    tmark("sky+ground", () => { this.buildSky(); this.buildGround(); });
    onProgress?.(0.07, "laying the ground");
    await this.nextFrame();

    tmark("green+water", () => { this.buildGreen(); this.buildWater(); });
    onProgress?.(0.16, "filling the river");
    await this.nextFrame();

    tmark("synthLanes", () => this.synthClusterLanes());
    tmark("fillHouses", () => this.fillClusterHouses());

    tmark("roads", () => this.buildRoads());
    onProgress?.(0.26, "painting the streets");
    await this.nextFrame();

    await this.buildBuildings(onProgress);
    tmark("signs", () => this.buildSigns());
    tmark("trees", () => this.buildTrees());
    onProgress?.(0.9, "planting the trees");
    await this.nextFrame();

    tmark("cars", () => this.buildCars());
    tmark("fences", () => this.buildFences());
    tmark("medians", () => this.buildMedians());
    tmark("tollway", () => this.buildTollway());
    if (theme.streetlights) tmark("lamps", () => this.buildStreetlamps());
    tmark("clouds+lights+boundary", () => { this.buildClouds(); this.buildLights(); this.buildBoundary(); });
    onProgress?.(1, "done");

    this.scene.add(group);
    return this;
  }

  nextFrame() {
    // MessageChannel, not rAF (frozen in hidden tabs) and not setTimeout
    // (long-hidden tabs throttle timer chains to once a MINUTE, which turned
    // the 57-yield big-city build into an hour)
    if (!this._mc) this._mc = new MessageChannel();
    return new Promise((r) => {
      this._mc.port1.onmessage = () => r();
      this._mc.port2.postMessage(0);
    });
  }

  // ----------------------------------------------------------------- sky
  buildSky() {
    const { theme } = this;
    const skyR = Math.max(1600, this.data.radius * 1.9);
    this.skyR = skyR;
    const geo = new THREE.SphereGeometry(skyR, 24, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(theme.sky.top) },
        bottom: { value: new THREE.Color(theme.sky.bottom) },
      },
      vertexShader: `
        varying vec3 vPos;
        void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform vec3 top; uniform vec3 bottom; varying vec3 vPos;
        void main() {
          float h = clamp(vPos.y / 800.0, 0.0, 1.0);
          gl_FragColor = vec4(mix(bottom, top, pow(h, 0.65)), 1.0);
        }`,
    });
    const sky = new THREE.Mesh(geo, mat);
    this.group.add(sky);

    // sun / sunset glow billboard
    if (theme.sunSprite) {
      const dir = new THREE.Vector3(...theme.sun.position).normalize();
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture(theme.sunSprite.color),
        transparent: true, depthWrite: false, fog: false,
        blending: THREE.AdditiveBlending,
      }));
      sprite.position.copy(dir.multiplyScalar(1250));
      sprite.scale.set(theme.sunSprite.size, theme.sunSprite.size, 1);
      this.group.add(sprite);
    }

    if (theme.stars) {
      const starCount = 900;
      const pos = new Float32Array(starCount * 3);
      const rng = this.rng;
      for (let i = 0; i < starCount; i++) {
        const thetaA = rng() * Math.PI * 2;
        const phi = Math.acos(1 - rng() * 0.85);
        const r = skyR * 0.94;
        pos[i * 3] = r * Math.sin(phi) * Math.cos(thetaA);
        pos[i * 3 + 1] = r * Math.cos(phi) + 60;
        pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(thetaA);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      this.group.add(new THREE.Points(g, new THREE.PointsMaterial({
        color: 0xdfe8ff, size: 2.2, sizeAttenuation: false, fog: false,
        transparent: true, opacity: 0.85,
      })));

      const moon = new THREE.Mesh(
        new THREE.CircleGeometry(46, 32),
        new THREE.MeshBasicMaterial({ color: 0xf3f0e0, fog: false })
      );
      moon.position.set(520, 760, -980);
      moon.lookAt(0, 0, 0);
      this.group.add(moon);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture("rgba(225,230,255,0.5)", "rgba(200,210,255,0)"),
        transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
      }));
      halo.position.copy(moon.position);
      halo.scale.set(340, 340, 1);
      this.group.add(halo);
    }
  }

  buildClouds() {
    const cfg = this.theme.clouds;
    if (!cfg) return;
    const { rng } = this;
    const clouds = [];
    for (let i = 0; i < cfg.count; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: cloudTexture(41 + i * 7),
        transparent: true, depthWrite: false, fog: false,
        opacity: cfg.opacity * (0.6 + rng() * 0.4),
        color: cfg.color,
      }));
      const angle = rng() * Math.PI * 2;
      const radius = 250 + rng() * 800;
      const y = 260 + rng() * 200;
      const s = 260 + rng() * 280;
      sprite.scale.set(s, s * 0.45, 1);
      clouds.push({ sprite, angle, radius, y, speed: 0.0015 + rng() * 0.002 });
      this.group.add(sprite);
    }
    this.animated.push((t) => {
      for (const c of clouds) {
        const a = c.angle + t * c.speed;
        c.sprite.position.set(Math.cos(a) * c.radius, c.y, Math.sin(a) * c.radius);
      }
    });
  }

  buildGround() {
    const g = new THREE.CircleGeometry(this.data.radius + 700, 48);
    g.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: this.theme.ground }));
    ground.receiveShadow = true;
    this.group.add(ground);
  }

  buildGreen() {
    const geos = [];
    for (const area of this.data.green) {
      try { geos.push(flatPolyGeometry(area.p, 0.05, 5)); } catch { /* bad poly */ }
    }
    if (!geos.length) return;
    const merged = mergeGeometries(geos.map((g) => g.toNonIndexed()), false);
    const tex = grassTexture({
      base: "#" + new THREE.Color(this.theme.green).getHexString(),
      blade: "#" + new THREE.Color(this.theme.green).multiplyScalar(1.18).getHexString(),
    });
    const mesh = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ map: tex }));
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  buildWater() {
    const geos = [];
    for (const w of this.data.water) {
      try { geos.push(flatPolyGeometry(w.p, 0.12)); } catch { /* bad poly */ }
      this.collisionPolys.push({ pts: w.p, bbox: polyBBox(w.p), h: 0 });
    }
    if (!geos.length) return;
    const merged = mergeGeometries(geos.map((g) => g.toNonIndexed()), false);
    const mat = new THREE.MeshStandardMaterial({
      color: this.theme.water, roughness: 0.12, metalness: 0.6,
    });
    const mesh = new THREE.Mesh(merged, mat);
    this.group.add(mesh);
    this.animated.push((t) => { mat.roughness = 0.12 + Math.sin(t * 0.8) * 0.07; });
  }

  buildRoads() {
    // Distinct y per layer: meshes with different materials must never be
    // coplanar (z-fighting renders as black flicker at intersections).
    const mainGeos = [], laneGeos = [], pathGeos = [], walkGeos = [];
    // surface-height grid so avatars/cars stand ON the asphalt, not in it
    this.surfaceCells = new Map();
    const CELL = 2.5;
    const markSurface = (pts, halfW, h) => {
      for (let i = 1; i < pts.length; i++) {
        const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
        const len = Math.hypot(bx - ax, bz - az);
        for (let d = 0; d <= len; d += CELL * 0.8) {
          const x = ax + ((bx - ax) * d) / (len || 1);
          const z = az + ((bz - az) * d) / (len || 1);
          const r = Math.ceil(halfW / CELL);
          const gx0 = Math.floor(x / CELL), gz0 = Math.floor(z / CELL);
          for (let gx = gx0 - r; gx <= gx0 + r; gx++) {
            for (let gz = gz0 - r; gz <= gz0 + r; gz++) {
              const cx = (gx + 0.5) * CELL, cz = (gz + 0.5) * CELL;
              if (Math.hypot(cx - x, cz - z) > halfW + CELL * 0.6) continue;
              const k = gx + "," + gz;
              if ((this.surfaceCells.get(k) ?? 0) < h) this.surfaceCells.set(k, h);
            }
          }
        }
      }
    };
    this._surfaceCell = CELL;
    for (const r of this.data.roads) {
      if (r.p.length < 2) continue;
      try {
        if (r.t === "path") {
          // below the roads so crossings don't paint stripes on the asphalt
          pathGeos.push(ribbonGeometry(r.p, r.w, 0.135, 3));
          markSurface(r.p, r.w / 2, 0.135);
        } else {
          if (r.w >= 7) {
            laneGeos.push(ribbonGeometry(r.p, r.w, 0.17, 12));
            markSurface(r.p, r.w / 2, 0.17);
          } else {
            mainGeos.push(ribbonGeometry(r.p, r.w, 0.15, 12));
            markSurface(r.p, r.w / 2, 0.15);
          }
          if (r.w >= 5.5 && r.w <= 11) {
            // sidewalk strip peeking out on both sides (skip highways)
            walkGeos.push(ribbonGeometry(r.p, r.w + 3.4, 0.11, 2.2));
            markSurface(r.p, (r.w + 3.4) / 2, 0.11);
          }
        }
      } catch { /* skip */ }
    }
    const add = (geos, mat) => {
      if (!geos.length) return;
      const merged = mergeGeometries(geos.map((g) => g.toNonIndexed()), false);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.receiveShadow = true;
      this.group.add(mesh);
    };
    const roadBase = "#" + new THREE.Color(this.theme.road).getHexString();
    // DoubleSide: sharp miter corners can flip a sliver triangle — front-only
    // materials would draw those as black holes
    add(laneGeos, new THREE.MeshLambertMaterial({ map: asphaltTexture({ base: roadBase, centerLine: true, lineStyle: this.theme.roadLine || "dash" }), side: THREE.DoubleSide }));
    add(mainGeos, new THREE.MeshLambertMaterial({ map: asphaltTexture({ base: roadBase, centerLine: false }), side: THREE.DoubleSide }));
    add(walkGeos, new THREE.MeshLambertMaterial({ map: sidewalkTexture({ base: this.theme.sidewalk || (this.theme.night ? "#3e4150" : "#969188") }), side: THREE.DoubleSide }));
    add(pathGeos, new THREE.MeshLambertMaterial({ map: sidewalkTexture({ base: "#" + new THREE.Color(this.theme.path).getHexString() }), side: THREE.DoubleSide }));
  }

  // ----------------------------------------------- missing-lane synthesis
  // The satellite shows Taman Beverly as a regular grid of east-west lanes
  // (the Jl. Danau streets) but OSM only maps two of them. Synthesize the
  // rest so the cluster's street grid — and then its houses — exist.
  synthClusterLanes() {
    if (!this.theme.fillHouses) return;
    const data = this.data;
    const exist = [];
    for (const r of data.roads) for (const p of r.p) exist.push(p);
    const nearExisting = (x, z, d = 22) => {
      for (const [ex, ez] of exist) {
        if (Math.abs(ex - x) < d && Math.abs(ez - z) < d && Math.hypot(ex - x, ez - z) < d) return true;
      }
      return false;
    };
    const lanes = [];
    // east-west Danau lanes, matching the satellite's ~57 m row spacing
    for (let z = 92; z <= 510; z += 57) {
      if (nearExisting(120, z) && nearExisting(230, z)) continue; // already mapped (Matana, Mahalona)
      lanes.push({ p: [[-78, z], [318, z]], w: 5.5, t: "road" });
    }
    // north-south spine from the gate + the golf-side lane
    if (!(nearExisting(8, 220) && nearExisting(8, 420))) {
      lanes.push({ p: [[8, 30], [8, 518]], w: 6.5, t: "road" });
    }
    if (!(nearExisting(314, 180) && nearExisting(314, 420))) {
      lanes.push({ p: [[314, 92], [314, 508]], w: 5.5, t: "road" });
    }
    if (lanes.length) {
      this.data = { ...data, roads: [...data.roads, ...lanes] };
      this.synthLanes = lanes.length;
    }
  }

  // -------------------------------------------------- missing-house filler
  // Gated clusters like hers have every street mapped in OSM but few house
  // footprints. Walk the residential lanes and fill the empty lots with
  // villas so the neighborhood is actually there.
  fillClusterHouses() {
    if (!this.theme.fillHouses) return;
    const { rng } = this;
    const data = this.data;

    // coarse occupancy grid of existing buildings (and the houses we add)
    const CELL = 18;
    const occupied = new Map();
    const keyOf = (x, z) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
    const markPoly = (pts) => {
      const bb = polyBBox(pts);
      for (let gx = Math.floor(bb.minX / CELL); gx <= Math.floor(bb.maxX / CELL); gx++) {
        for (let gz = Math.floor(bb.minZ / CELL); gz <= Math.floor(bb.maxZ / CELL); gz++) {
          occupied.set(`${gx},${gz}`, true);
        }
      }
    };
    for (const b of data.buildings) markPoly(b.p);
    const isFree = (x, z) =>
      !occupied.get(keyOf(x, z)) &&
      !occupied.get(keyOf(x + 6, z)) && !occupied.get(keyOf(x - 6, z)) &&
      !occupied.get(keyOf(x, z + 6)) && !occupied.get(keyOf(x, z - 6));

    // keep clear of every road (not just the one we're walking)
    const roadGrid = ptGrid(16);
    for (const r of data.roads) {
      for (let i = 1; i < r.p.length; i++) {
        const [ax, az] = r.p[i - 1], [bx, bz] = r.p[i];
        const len = Math.hypot(bx - ax, bz - az);
        for (let d = 0; d < len; d += 8) {
          const px = ax + ((bx - ax) * d) / len, pz = az + ((bz - az) * d) / len;
          roadGrid.add(px, pz, [px, pz, r.w / 2]);
        }
      }
    }
    const nearRoad = (x, z, clearance) => {
      for (const [rx, rz, hw] of roadGrid.near(x, z, clearance + 8)) {
        if (Math.abs(rx - x) < hw + clearance && Math.abs(rz - z) < hw + clearance &&
            Math.hypot(rx - x, rz - z) < hw + clearance) return true;
      }
      return false;
    };
    const inAreas = (x, z, areas) => {
      for (const a of areas) {
        const bb = polyBBox(a.p);
        if (x < bb.minX || x > bb.maxX || z < bb.minZ || z > bb.maxZ) continue;
        if (pointInPoly(x, z, a.p)) return true;
      }
      return false;
    };

    const newHouses = [];
    for (const road of data.roads) {
      if (road.t !== "road" || road.w > 6.8) continue; // cluster lanes only
      for (let i = 1; i < road.p.length && newHouses.length < 460; i++) {
        const [ax, az] = road.p[i - 1], [bx, bz] = road.p[i];
        const segLen = Math.hypot(bx - ax, bz - az);
        if (segLen < 6) continue;
        const dx = (bx - ax) / segLen, dz = (bz - az) / segLen;
        const nx = -dz, nz = dx;
        // north of Sudirman is kampung: tighter, denser, right at the lane
        const north = (az + bz) / 2 < -70;
        const step0 = north ? 11 : 15;
        for (let d = 8; d < segLen - 6; d += step0 + rng() * 4) {
          for (const side of [-1, 1]) {
            if (rng() < 0.12) continue; // the odd empty lot
            const setback = road.w / 2 + (north ? 3.8 : 6.5);
            const cx = ax + dx * d + nx * side * setback;
            const cz = az + dz * d + nz * side * setback;
            if (Math.hypot(cx, cz) > 520) continue;          // her cluster + neighbors
            if (!isFree(cx, cz)) continue;
            if (nearRoad(cx, cz, north ? 2.2 : 3.4)) continue;
            if (inAreas(cx, cz, data.water) || inAreas(cx, cz, data.green)) continue;
            // rectangular footprint facing the lane
            const wAlong = north ? 5.5 + rng() * 2.5 : 7.5 + rng() * 3.5;
            const wDeep = north ? 5 + rng() * 2 : 6 + rng() * 2.5;
            const pts = [
              [cx - dx * wAlong / 2 - nx * side * wDeep / 2, cz - dz * wAlong / 2 - nz * side * wDeep / 2],
              [cx + dx * wAlong / 2 - nx * side * wDeep / 2, cz + dz * wAlong / 2 - nz * side * wDeep / 2],
              [cx + dx * wAlong / 2 + nx * side * wDeep / 2, cz + dz * wAlong / 2 + nz * side * wDeep / 2],
              [cx - dx * wAlong / 2 + nx * side * wDeep / 2, cz - dz * wAlong / 2 + nz * side * wDeep / 2],
            ].map(([x, z]) => [Math.round(x * 10) / 10, Math.round(z * 10) / 10]);
            const h = north
              ? (rng() < 0.12 ? 6.4 + rng() : 3.6 + rng() * 1.6)
              : (rng() < 0.2 ? 6.6 + rng() * 1.2 : 4 + rng() * 1.4);
            newHouses.push({ p: pts, h: Math.round(h * 10) / 10, c: "house" });
            markPoly(pts);
            if (!north) {
              // front hedge between the lane and the yard (every cluster ref has one)
              this.hedgeSpots = this.hedgeSpots || [];
              this.hedgeSpots.push({
                x: ax + dx * d + nx * side * (road.w / 2 + 2.4),
                z: az + dz * d + nz * side * (road.w / 2 + 2.4),
                ry: Math.atan2(dx, dz),
                len: wAlong + 1.5,
              });
            }
          }
        }
      }
      if (newHouses.length >= 460) break;
    }
    if (newHouses.length) {
      // never mutate the cached city JSON — Game reuses it across visits
      this.data = { ...data, buildings: [...data.buildings, ...newHouses] };
      this.filledHouses = newHouses.length;
    }
  }

  // ------------------------------------------------------------ buildings
  async buildBuildings(onProgress) {
    const { theme, data, rng } = this;
    const styles = theme.facadeStyles;

    // materials per facade style
    const styleMats = styles.map((s) => {
      const pair = s.type === "house" ? houseWallTexture(s.opts) : facadeTexture(s.opts);
      const mat = new THREE.MeshLambertMaterial({
        map: pair.map, vertexColors: true, side: THREE.DoubleSide,
      });
      if (pair.emissive) {
        mat.emissiveMap = pair.emissive;
        mat.emissive = new THREE.Color(0xffffff);
        mat.emissiveIntensity = 0.85;
      }
      return mat;
    });
    const weights = styles.map((s) => s.weight);
    const totalW = weights.reduce((a, b) => a + b, 0);
    const tileW = (s) => (s.type === "house" ? 7 : 12.8);   // meters per texture tile, horizontally
    const tileH = (s) => (s.type === "house" ? 3.4 : 12.4); // vertically

    // wall vertex buffers per style (+ one for storefront ground floors)
    const walls = styles.map(() => ({ pos: [], uv: [], col: [], idx: [], n: 0 }));

    // hand-tuned per-building styles (matched by real OSM name)
    const tuningRules = TUNING[data.key] || [];
    const tunedMats = {};   // styleKey -> material (lazy)
    const tunedWalls = {};  // styleKey -> buffer
    this.tunedBuildings = [];
    const matchTuning = (name, cx, cz, cat, area) => {
      for (const rule of tuningRules) {
        if (rule.match) {
          if (!name) continue;
          if (typeof rule.match === "string" ? name === rule.match : rule.match.test(name)) return rule;
        } else if (rule.at) {
          if (rule.cat && rule.cat !== cat) continue;
          if (rule.minArea && area < rule.minArea) continue;
          if (Math.hypot(cx - rule.at[0], cz - rule.at[1]) <= rule.r) return rule;
        }
      }
      return null;
    };
    const tunedBufferFor = (styleKey) => {
      if (!tunedWalls[styleKey]) {
        tunedWalls[styleKey] = { pos: [], uv: [], col: [], idx: [], n: 0 };
        const def = STYLE_DEFS[styleKey];
        const pair = TEXTURE_FACTORIES[def.factory]({ ...def.opts, lit: theme.night ? (def.opts.lit ?? 0.35) : 0 });
        const mat = new THREE.MeshLambertMaterial({
          map: pair.map, vertexColors: true, side: THREE.DoubleSide,
        });
        if (pair.emissive) {
          mat.emissiveMap = pair.emissive;
          mat.emissive = new THREE.Color(0xffffff);
          mat.emissiveIntensity = 1.1;
        }
        tunedMats[styleKey] = mat;
      }
      return tunedWalls[styleKey];
    };
    const shopBuf = { pos: [], uv: [], col: [], idx: [], n: 0 };
    const sfCfg = theme.storefront;
    let shopMat = null;
    if (sfCfg) {
      const pair = storefrontTexture(sfCfg);
      shopMat = new THREE.MeshLambertMaterial({
        map: pair.map, vertexColors: true, side: THREE.DoubleSide,
      });
      if (pair.emissive) {
        shopMat.emissiveMap = pair.emissive;
        shopMat.emissive = new THREE.Color(0xffffff);
        shopMat.emissiveIntensity = 1.0;
      }
    }

    // roofs
    const roofCfg = theme.roof || { type: "flat", base: "#5c544c" };
    const hipVariants = roofCfg.tiles || (roofCfg.tile ? [{ tile: roofCfg.tile, dark: roofCfg.dark }] : []);
    // raw triangle buffers — 28k tiny BufferGeometries + one mergeGeometries
    // call locked the main thread for minutes on the 2400m Tangerang map
    const flatBuf = { pos: [], uv: [], idx: [], n: 0, col: null };
    const hipBufs = hipVariants.map(() => ({ pos: [], uv: [], idx: [], n: 0, col: null }));
    const appendGeo = (buf, g) => {
      const p = g.attributes.position, u = g.attributes.uv;
      const base = buf.n;
      for (let i = 0; i < p.count; i++) buf.pos.push(p.getX(i), p.getY(i), p.getZ(i));
      for (let i = 0; i < u.count; i++) buf.uv.push(u.getX(i), u.getY(i));
      const index = g.index;
      if (index) for (let i = 0; i < index.count; i++) buf.idx.push(base + index.getX(i));
      else for (let i = 0; i < p.count; i++) buf.idx.push(base + i);
      buf.n += p.count;
      g.dispose();
    };
    const mansardCfg = theme.mansard;
    const mansardBuf = { pos: [], uv: [], idx: [], n: 0 };
    const tint = new THREE.Color();

    this.buildingList = []; // kept for storefront sign placement

    const pushWallQuad = (buf, ax, az, bx, bz, y0, y1, u0, u1, v0, v1, t) => {
      const base = buf.n;
      buf.pos.push(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az);
      buf.uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
      for (let k = 0; k < 4; k++) buf.col.push(t.r, t.g, t.b);
      buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      buf.n += 4;
    };

    let i = 0;
    let chunkT = performance.now();
    for (const b of data.buildings) {
      i++;
      if (i % 500 === 0) {
        const now = performance.now();
        if (now - chunkT > 400) console.log(`[world] buildings ${i - 500}-${i}: ${Math.round(now - chunkT)}ms`);
        onProgress?.(0.3 + 0.55 * (i / data.buildings.length), "raising the buildings");
        await this.nextFrame();
        chunkT = performance.now(); // exclude the (hidden-tab-throttled) yield itself
      }
      if (b.tower && b.h > 100) continue; // Eiffel gets a hand-built model

      let pts = b.p;
      if (signedArea(pts) < 0) pts = pts.slice().reverse();
      const cat = b.c || "generic";
      const [bcx, bcz] = centroidOf(pts);
      const bArea = Math.abs(signedArea(pts));
      const bDist = Math.hypot(bcx, bcz);
      const far = bDist > 900; // skyline tier: simpler walls, no street-level dressing

      // hand-tuned building? route to its custom architectural style
      const rule = matchTuning(b.n, bcx, bcz, cat, bArea);
      const h = rule?.h ?? b.h;
      this.collisionPolys.push({ pts, bbox: polyBBox(pts), h });
      if (!far) this.buildingList.push({ pts, h, cat });
      let style, buf, tuned = null;
      if (rule) {
        tuned = STYLE_DEFS[rule.style];
        buf = tunedBufferFor(rule.style);
        style = { type: "facade" }; // tile scale: standard 12.8m × 12.4m grid
        this.tunedBuildings.push({ name: b.n, style: rule.style });
      } else {
        // style pick: deterministic, tall boston buildings lean glassy/modern
        let si;
        if (data.key === "boston" && h > 17) {
          si = rng() < 0.6 ? (rng() < 0.6 ? 2 : 5) : Math.floor(rng() * styles.length);
        } else {
          let roll = rng() * totalW;
          si = 0;
          while (roll > weights[si]) { roll -= weights[si]; si++; }
          si = Math.min(si, styles.length - 1);
        }
        style = styles[si];
        buf = walls[si];
      }

      // stronger per-building tint variety (warm/cool shifts, light/dark);
      // tuned buildings keep their hand-picked colors nearly untinted
      if (tuned) {
        tint.setRGB(1, 1, 1);
        rng(); rng(); // keep the rng sequence identical for untuned neighbors
      } else {
        const lum = 0.74 + rng() * 0.32;
        const warm = (rng() - 0.5) * 0.12;
        tint.setRGB(
          Math.max(0.5, Math.min(1, lum + warm)),
          Math.max(0.5, Math.min(1, lum)),
          Math.max(0.5, Math.min(1, lum - warm))
        );
      }

      // does this building get a ground-floor storefront band?
      const sfChance = tuned ? (tuned.storefront ? 1 : 0) : (sfCfg?.chance?.[cat] ?? 0);
      const hasShop = !far && shopMat && sfCfg && h > (sfCfg.bandH + 2.6) && rng() < sfChance;
      const bandH = hasShop ? sfCfg.bandH : 0;

      // walls: one quad per footprint edge, UVs in meters.
      // uPhase offsets the window columns per building so identical
      // facades never line up across neighbors.
      const tw = tileW(style), th = tileH(style);
      const uPhase = Math.floor(rng() * 4) * 0.25;
      const vTop = (h - bandH) / th;
      for (let e = 0; e < pts.length; e++) {
        const [ax, az] = pts[e];
        const [bx, bz] = pts[(e + 1) % pts.length];
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 0.4) continue;
        const u1 = Math.max(0.999, Math.round(len / tw));
        pushWallQuad(buf, ax, az, bx, bz, bandH, h, uPhase, uPhase + u1, 0, vTop, tint);
        if (hasShop) {
          const su1 = Math.max(0.999, Math.round(len / 6.2)); // one shopfront ≈ 6 m
          pushWallQuad(shopBuf, ax, az, bx, bz, 0, bandH, 0, su1, 0, 1, tint);
        }
      }

      // roof
      const area = Math.abs(signedArea(pts));
      const useHip = hipVariants.length && roofCfg.type === "hip" && area < roofCfg.maxArea && pts.length <= 9 && h < 12;
      const useMansard = !far && mansardCfg && h >= mansardCfg.minH && pts.length <= 14 && area > 60;
      try {
        if (useHip) {
          const [cx, cz] = centroidOf(pts);
          const ridgeY = h + roofCfg.height;
          const hbuf = hipBufs[Math.floor(rng() * hipVariants.length)];
          for (let e = 0; e < pts.length; e++) {
            const [ax, az] = pts[e];
            const [bx, bz] = pts[(e + 1) % pts.length];
            const base = hbuf.n;
            hbuf.pos.push(ax, h, az, bx, h, bz, cx, ridgeY, cz);
            hbuf.uv.push(ax / 4, az / 4, bx / 4, bz / 4, cx / 4, cz / 4);
            hbuf.idx.push(base, base + 1, base + 2);
            hbuf.n += 3;
          }
        } else if (useMansard) {
          // Haussmann: sloped zinc band from the wall top to an inset cap
          const [cx, cz] = centroidOf(pts);
          let avgR = 0;
          for (const [x, z] of pts) avgR += Math.hypot(x - cx, z - cz);
          avgR /= pts.length;
          const k = Math.max(0.55, Math.min(0.94, 1 - mansardCfg.inset / Math.max(3, avgR)));
          const topY = h + mansardCfg.rise;
          const inset = pts.map(([x, z]) => [cx + (x - cx) * k, cz + (z - cz) * k]);
          for (let e = 0; e < pts.length; e++) {
            const [ax, az] = pts[e];
            const [bx, bz] = pts[(e + 1) % pts.length];
            const [iax, iaz] = inset[e];
            const [ibx, ibz] = inset[(e + 1) % pts.length];
            const base = mansardBuf.n;
            mansardBuf.pos.push(ax, h, az, bx, h, bz, ibx, topY, ibz, iax, topY, iaz);
            const len = Math.hypot(bx - ax, bz - az);
            mansardBuf.uv.push(0, 0, len / 9, 0, len / 9, 1, 0, 1); // dormer every ~4.5m
            mansardBuf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
            mansardBuf.n += 4;
          }
          appendGeo(flatBuf, flatPolyGeometry(inset, topY, 4));
        } else {
          appendGeo(flatBuf, flatPolyGeometry(pts, h, 4));
        }
      } catch { /* degenerate footprint */ }
    }

    // assemble wall meshes (one per facade style — a handful of draw calls)
    const buildBufMesh = (buf, mat) => {
      if (!buf.n) return;
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(buf.pos), 3));
      g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(buf.uv), 2));
      if (buf.col) g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(buf.col), 3));
      g.setIndex(buf.idx);
      g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    };
    walls.forEach((buf, si) => buildBufMesh(buf, styleMats[si]));
    for (const styleKey of Object.keys(tunedWalls)) {
      buildBufMesh(tunedWalls[styleKey], tunedMats[styleKey]);
    }
    if (shopMat) buildBufMesh(shopBuf, shopMat);
    if (mansardBuf.n && mansardCfg) {
      const mPair = mansardTexture({ base: mansardCfg.color, lit: theme.night ? 0.38 : 0 });
      const mMat = new THREE.MeshLambertMaterial({ map: mPair.map, side: THREE.DoubleSide });
      if (theme.night && mPair.emissive) {
        mMat.emissiveMap = mPair.emissive;
        mMat.emissive = new THREE.Color(0xffffff);
        mMat.emissiveIntensity = 1.0;
      }
      buildBufMesh({ ...mansardBuf, col: null }, mMat);
    }

    if (flatBuf.n) {
      buildBufMesh(flatBuf, new THREE.MeshLambertMaterial({
        map: flatRoofTexture({ base: roofCfg.base || "#5c544c" }),
      }));
    }
    hipBufs.forEach((hbuf, vi) => {
      if (!hbuf.n) return;
      buildBufMesh(hbuf, new THREE.MeshLambertMaterial({
        map: roofTexture({ tile: hipVariants[vi].tile, dark: hipVariants[vi].dark, seed: 5 + vi * 7 }),
      }));
    });
  }

  // ---------------------------------------------------- real shop signs
  // Every named café/shop/restaurant from the real map gets a sign on the
  // nearest building wall — Cava really is next door.
  buildSigns() {
    const pois = this.data.pois || [];
    if (!pois.length || !this.buildingList?.length) return;
    const { rng } = this;
    const awningColors = (this.theme.storefront?.awningColors ||
      ["#a8443c", "#3e6048", "#44587a", "#8a6a34"]).map((c) => new THREE.Color(c));
    const night = !!this.theme.night;
    const usedEdges = new Set();
    this.restaurantDoors = [];
    let placed = 0;

    for (const poi of pois) {
      if (placed >= 140) break;
      // nearest building edge within 30 m
      let best = null;
      for (let bi = 0; bi < this.buildingList.length; bi++) {
        const b = this.buildingList[bi];
        const bb = polyBBox(b.pts);
        if (poi.x < bb.minX - 32 || poi.x > bb.maxX + 32 || poi.z < bb.minZ - 32 || poi.z > bb.maxZ + 32) continue;
        for (let e = 0; e < b.pts.length; e++) {
          const [ax, az] = b.pts[e];
          const [bx, bz] = b.pts[(e + 1) % b.pts.length];
          const dx = bx - ax, dz = bz - az;
          const len2 = dx * dx + dz * dz;
          if (len2 < 16) continue; // wall shorter than the sign
          let t = ((poi.x - ax) * dx + (poi.z - az) * dz) / len2;
          t = Math.max(0.15, Math.min(0.85, t));
          const px = ax + dx * t, pz = az + dz * t;
          const d = Math.hypot(poi.x - px, poi.z - pz);
          if (d < 30 && (!best || d < best.d)) {
            best = { d, px, pz, dx, dz, len: Math.sqrt(len2), bi, e, h: b.h };
          }
        }
      }
      if (!best) continue;
      const edgeKey = `${best.bi}:${best.e}:${Math.round(best.px / 8)}`;
      if (usedEdges.has(edgeKey)) continue;
      usedEdges.add(edgeKey);

      // outward normal (winding was normalized in buildBuildings)
      let nx = best.dz / best.len, nz = -best.dx / best.len;
      // make sure it points away from the building center
      const bld = this.buildingList[best.bi];
      const [bcx, bcz] = centroidOf(bld.pts);
      if ((best.px + nx - bcx) ** 2 + (best.pz + nz - bcz) ** 2 < (best.px - bcx) ** 2 + (best.pz - bcz) ** 2) {
        nx = -nx; nz = -nz;
      }

      // sign board with the real name
      const canvas = document.createElement("canvas");
      const font = "600 34px 'Avenir Next', system-ui";
      const mctx = canvas.getContext("2d");
      mctx.font = font;
      const tw = Math.ceil(mctx.measureText(poi.n).width);
      const W = Math.min(560, tw + 44), H = 62;
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext("2d");
      const bgColors = ["#28201c", "#3a2226", "#1e2c30", "#2c2418", "#222032"];
      ctx.fillStyle = bgColors[Math.floor(rng() * bgColors.length)];
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(255,235,200,0.65)";
      ctx.lineWidth = 3;
      ctx.strokeRect(3, 3, W - 6, H - 6);
      ctx.font = font;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = night ? "#ffd9a0" : "#f6ead8";
      ctx.fillText(poi.n, W / 2, H / 2 + 1, W - 30);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;

      const sw = Math.min(5.2, (W / H) * 0.62);
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(sw, 0.62),
        new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, toneMapped: !night })
      );
      const signY = Math.min(3.45, Math.max(2.7, best.h - 0.8));
      sign.position.set(best.px + nx * 0.3, signY, best.pz + nz * 0.3);
      sign.lookAt(best.px + nx * 10, signY, best.pz + nz * 10);
      this.group.add(sign);

      // awning below the sign
      const aw = new THREE.Mesh(
        new THREE.BoxGeometry(Math.min(4.6, sw + 0.8), 0.07, 1.15),
        new THREE.MeshLambertMaterial({ color: awningColors[Math.floor(rng() * awningColors.length)] })
      );
      aw.position.set(best.px + nx * 0.75, signY - 0.55, best.pz + nz * 0.75);
      aw.lookAt(best.px + nx * 10, signY - 0.55 - 3.4, best.pz + nz * 10);
      aw.castShadow = true;
      this.group.add(aw);

      // restaurants get an enterable door under the sign
      if (isRestaurant(poi.t)) {
        const doorMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(1.5, 2.5),
          new THREE.MeshLambertMaterial({
            color: 0x241e1a,
            emissive: night ? 0xb88648 : 0x000000,
            emissiveIntensity: night ? 0.35 : 0,
          })
        );
        doorMesh.position.set(best.px + nx * 0.22, 1.25, best.pz + nz * 0.22);
        doorMesh.lookAt(best.px + nx * 10, 1.25, best.pz + nz * 10);
        this.group.add(doorMesh);
        this.restaurantDoors.push({
          x: best.px + nx * 1.4,
          z: best.pz + nz * 1.4,
          poi,
          poiIndex: pois.indexOf(poi),
        });
      }

      placed++;
    }
  }

  // ---------------------------------------------------------------- trees
  buildTrees() {
    const { theme, data, rng } = this;
    const spots = [...data.trees];

    for (const area of data.green) {
      const bbox = polyBBox(area.p);
      const w = bbox.maxX - bbox.minX, h = bbox.maxZ - bbox.minZ;
      const target = Math.min(60, Math.floor((w * h) / 900));
      let placed = 0, tries = 0;
      while (placed < target && tries < target * 8) {
        tries++;
        const x = bbox.minX + rng() * w, z = bbox.minZ + rng() * h;
        if (!pointInPoly(x, z, area.p)) continue;
        spots.push([x, z]);
        placed++;
      }
    }
    // allée rows along the park paths (the Champ de Mars in the refs)
    if (theme.alleeTrees) {
      for (const r of this.data.roads) {
        if (r.t !== "path") continue;
        for (let i = 1; i < r.p.length && spots.length < 1500; i++) {
          const [ax, az] = r.p[i - 1], [bx, bz] = r.p[i];
          const segLen = Math.hypot(bx - ax, bz - az);
          if (segLen < 8) continue;
          const dx = (bx - ax) / segLen, dz = (bz - az) / segLen;
          const nx = -dz, nz = dx;
          for (let d = 5; d < segLen; d += 12) {
            for (const side of [-1, 1]) {
              const x = ax + dx * d + nx * side * (r.w / 2 + 2.2);
              const z = az + dz * d + nz * side * (r.w / 2 + 2.2);
              if (Math.hypot(x, z) > 460) continue;
              spots.push([x, z]);
            }
          }
        }
      }
    }

    // urban street trees in sidewalk rows (Kendall blocks in the refs)
    if (theme.streetTrees) {
      for (const r of this.data.roads) {
        if (r.t !== "road" || r.w < 6 || r.w > 10) continue;
        for (let i = 1; i < r.p.length && spots.length < 1500; i++) {
          const [ax, az] = r.p[i - 1], [bx, bz] = r.p[i];
          const segLen = Math.hypot(bx - ax, bz - az);
          if (segLen < 4) continue;
          const dx = (bx - ax) / segLen, dz = (bz - az) / segLen;
          const nx = -dz, nz = dx;
          for (let d = 6; d < segLen; d += 13 + rng() * 5) {
            for (const side of [-1, 1]) {
              if (rng() > 0.62) continue;
              const x = ax + dx * d + nx * side * (r.w / 2 + 2.6);
              const z = az + dz * d + nz * side * (r.w / 2 + 2.6);
              if (Math.hypot(x, z) > 450) continue;
              spots.push([x, z]);
            }
          }
        }
      }
    }

    // sparse OSM tree data (tangerang): scatter palms along the roads,
    // closest roads first so the area around her home feels lush
    if (this.data.trees.length < 120) {
      const roads = this.data.roads
        .filter((r) => r.t === "road" && r.w !== 8 && !(r.n && /jalan tol/i.test(r.n)))
        .slice()
        .sort((a, b) => {
          const da = Math.min(...a.p.map(([x, z]) => x * x + z * z));
          const db = Math.min(...b.p.map(([x, z]) => x * x + z * z));
          return da - db;
        });
      for (const r of roads) {
        for (let s = 1; s < r.p.length; s++) {
          const [ax, az] = r.p[s - 1], [bx, bz] = r.p[s];
          const len = Math.hypot(bx - ax, bz - az) || 1;
          const nx = -(bz - az) / len, nz = (bx - ax) / len;
          // a palm every ~18m of road, both sides
          const count = Math.max(1, Math.floor(len / 18));
          for (let k = 0; k < count; k++) {
            if (rng() > 0.75) continue;
            const side = rng() > 0.5 ? 1 : -1;
            const t = (k + rng()) / count;
            spots.push([
              ax + (bx - ax) * t + nx * (r.w / 2 + 2.4) * side,
              az + (bz - az) * t + nz * (r.w / 2 + 2.4) * side,
            ]);
          }
          if (spots.length > 850) break;
        }
        if (spots.length > 850) break;
      }
    }
    if (!spots.length) return;
    const cap = 1600;
    const trees = spots.length > cap ? spots.filter((_, i) => i % Math.ceil(spots.length / cap) === 0) : spots;

    const foliageColors = theme.treeFoliage.map((c) => new THREE.Color(c));

    // big rain trees arching over the avenues (the Sudirman canopy)
    if (theme.fillHouses) {
      this.buildRainTrees();
      this.buildHedges();
      this.buildShrubs();
    }
    if (theme.crosswalks) this.buildCrosswalks();
    if (theme.parkFurniture) this.buildParkFurniture();

    if (theme.treeKind === "palm") {
      this.buildPalms(trees, foliageColors);
      return;
    }

    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 2.4, 5);
    trunkGeo.translate(0, 1.2, 0);
    const blobGeo = theme.treeKind === "manicured"
      ? new THREE.ConeGeometry(1.6, 4.2, 7)
      : new THREE.IcosahedronGeometry(2.1, 1);

    const trunkMesh = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x5a4332 }), trees.length);
    const blobMesh = new THREE.InstancedMesh(blobGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), trees.length);
    blobMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(trees.length * 3), 3);

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const eu = new THREE.Euler();
    trees.forEach(([x, z], idx) => {
      const s = 0.7 + rng() * 0.9;
      this.addCollider(rectPoly(x, z, 0.3 * s, 0.3 * s, 0), 2.2);
      eu.set(0, rng() * Math.PI * 2, 0);
      q.setFromEuler(eu);
      m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, s, s));
      trunkMesh.setMatrixAt(idx, m);
      const blobY = theme.treeKind === "manicured" ? 2.2 * s + 1.6 * s : 2.4 * s + 1.3 * s;
      m.compose(new THREE.Vector3(x, blobY, z), q, new THREE.Vector3(s, s, s));
      blobMesh.setMatrixAt(idx, m);
      blobMesh.setColorAt(idx, foliageColors[Math.floor(rng() * foliageColors.length)]);
    });
    trunkMesh.castShadow = true;
    blobMesh.castShadow = true;
    this.group.add(trunkMesh, blobMesh);
  }

  buildHedges() {
    const spots = this.hedgeSpots || [];
    if (!spots.length) return;
    const geo = new THREE.BoxGeometry(0.55, 0.85, 1);
    geo.translate(0, 0.42, 0);
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0x41663a }), spots.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const eu = new THREE.Euler();
    const scl = new THREE.Vector3();
    spots.forEach((s, i) => {
      eu.set(0, s.ry, 0);
      q.setFromEuler(eu);
      scl.set(1, 0.85 + (i % 4) * 0.1, s.len);
      m.compose(new THREE.Vector3(s.x, 0, s.z), q, scl);
      mesh.setMatrixAt(i, m);
    });
    mesh.castShadow = true;
    this.group.add(mesh);
  }

  // wild roadside greenery in the kampung north (the refs are overgrown)
  buildShrubs() {
    const { rng } = this;
    const spots = [];
    for (const r of this.data.roads) {
      if (r.t !== "road" || r.w > 6.8) continue;
      for (let i = 1; i < r.p.length && spots.length < 600; i++) {
        const [ax, az] = r.p[i - 1], [bx, bz] = r.p[i];
        if ((az + bz) / 2 > -60) continue; // north zone only
        const segLen = Math.hypot(bx - ax, bz - az);
        if (segLen < 3) continue;
        const dx = (bx - ax) / segLen, dz = (bz - az) / segLen;
        const nx = -dz, nz = dx;
        for (let d = 2; d < segLen; d += 7 + rng() * 5) {
          if (rng() > 0.55) continue;
          const side = rng() > 0.5 ? 1 : -1;
          const x = ax + dx * d + nx * side * (r.w / 2 + 1.1 + rng() * 1.2);
          const z = az + dz * d + nz * side * (r.w / 2 + 1.1 + rng() * 1.2);
          if (Math.hypot(x, z) > 540) continue;
          spots.push([x, z]);
        }
      }
      if (spots.length >= 600) break;
    }
    if (!spots.length) return;
    const geo = new THREE.IcosahedronGeometry(1, 1);
    geo.scale(1.15, 0.75, 1.15);
    geo.translate(0, 0.6, 0);
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff }), spots.length);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(spots.length * 3), 3);
    const greens = [0x3e6b35, 0x4a7a3c, 0x35602f, 0x568a42].map((c) => new THREE.Color(c));
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const eu = new THREE.Euler();
    const scl = new THREE.Vector3();
    spots.forEach(([x, z], i) => {
      const s = 0.5 + rng() * 1.1;
      eu.set(0, rng() * Math.PI * 2, 0);
      q.setFromEuler(eu);
      scl.set(s, s * (0.8 + rng() * 0.5), s);
      m.compose(new THREE.Vector3(x, 0, z), q, scl);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, greens[Math.floor(rng() * greens.length)]);
    });
    mesh.castShadow = true;
    this.group.add(mesh);
  }

  // zebra crosswalks where side streets meet the big avenues
  buildCrosswalks() {
    const big = this.data.roads.filter((r) => r.t === "road" && r.w >= 7.5 && !isHighway(r));
    if (!big.length) return;
    const mouths = [];
    for (const r of this.data.roads) {
      if (r.w >= 7.5 || r.t !== "road") continue;
      // crosswalks only paint within 540m of home — skip far mouths early
      const a = r.p[0], b = r.p[r.p.length - 1];
      if (Math.hypot(a[0], a[1]) < 560) mouths.push(a);
      if (Math.hypot(b[0], b[1]) < 560) mouths.push(b);
    }
    const spots = [];
    const taken = [];
    for (const r of big) {
      for (let i = 1; i < r.p.length; i++) {
        const [ax, az] = r.p[i - 1], [bx, bz] = r.p[i];
        const segLen = Math.hypot(bx - ax, bz - az);
        if (segLen < 2) continue;
        const dx = (bx - ax) / segLen, dz = (bz - az) / segLen;
        for (const [jx, jz] of mouths) {
          // project the side-street mouth onto this carriageway
          const t = (jx - ax) * dx + (jz - az) * dz;
          if (t < 0 || t > segLen) continue;
          const px = ax + dx * t, pz = az + dz * t;
          const dist = Math.hypot(jx - px, jz - pz);
          if (dist > r.w / 2 + 6) continue;
          if (Math.hypot(px, pz) > 540) continue;
          if (taken.some(([tx, tz]) => Math.hypot(tx - px, tz - pz) < 16)) continue;
          taken.push([px, pz]);
          spots.push({ x: px, z: pz, ry: Math.atan2(dx, dz), w: r.w });
        }
      }
    }
    if (!spots.length) return;
    // stripes run across the road; bands perpendicular to walking direction
    const canvasEl = document.createElement("canvas");
    canvasEl.width = 128; canvasEl.height = 64;
    const cctx = canvasEl.getContext("2d");
    cctx.clearRect(0, 0, 128, 64);
    cctx.fillStyle = "rgba(235,232,222,0.92)";
    for (let x = 4; x < 128; x += 22) cctx.fillRect(x, 2, 12, 60);
    const tex = new THREE.CanvasTexture(canvasEl);
    tex.colorSpace = THREE.SRGBColorSpace;
    const geo = new THREE.PlaneGeometry(1, 3.1);
    geo.rotateX(-Math.PI / 2);
    geo.rotateY(Math.PI / 2); // width along the carriageway's normal
    const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false });
    const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const eu = new THREE.Euler();
    const scl = new THREE.Vector3();
    spots.forEach((s, i) => {
      eu.set(0, s.ry, 0);
      q.setFromEuler(eu);
      scl.set(1, 1, s.w + 1);
      m.compose(new THREE.Vector3(s.x, 0.185, s.z), q, scl);
      mesh.setMatrixAt(i, m);
    });
    this.group.add(mesh);
  }

  // Paris park furniture: green benches along the allées + Morris columns
  buildParkFurniture() {
    const { rng } = this;
    const benchSpots = [];
    for (const r of this.data.roads) {
      if (r.t !== "path") continue;
      for (let i = 1; i < r.p.length && benchSpots.length < 120; i++) {
        const [ax, az] = r.p[i - 1], [bx, bz] = r.p[i];
        const segLen = Math.hypot(bx - ax, bz - az);
        if (segLen < 6) continue;
        const dx = (bx - ax) / segLen, dz = (bz - az) / segLen;
        const nx = -dz, nz = dx;
        for (let d = 8; d < segLen; d += 38 + rng() * 18) {
          if (rng() > 0.5) continue;
          const side = rng() > 0.5 ? 1 : -1;
          const x = ax + dx * d + nx * side * (r.w / 2 + 1.0);
          const z = az + dz * d + nz * side * (r.w / 2 + 1.0);
          if (Math.hypot(x, z) > 480) continue;
          // face the path
          benchSpots.push({ x, z, ry: Math.atan2(-nx * side, -nz * side) });
        }
      }
      if (benchSpots.length >= 120) break;
    }
    if (benchSpots.length) {
      const green = new THREE.MeshLambertMaterial({ color: 0x2e4a34 });
      const seatGeo = new THREE.BoxGeometry(1.9, 0.09, 0.55);
      seatGeo.translate(0, 0.48, 0);
      const backGeo = new THREE.BoxGeometry(1.9, 0.55, 0.08);
      backGeo.translate(0, 0.92, -0.26);
      const legGeo = mergeGeometries([
        new THREE.BoxGeometry(0.08, 0.48, 0.5).translate(-0.8, 0.24, 0),
        new THREE.BoxGeometry(0.08, 0.48, 0.5).translate(0.8, 0.24, 0),
      ], false);
      const seats = new THREE.InstancedMesh(seatGeo, green, benchSpots.length);
      const backs = new THREE.InstancedMesh(backGeo, green, benchSpots.length);
      const legs = new THREE.InstancedMesh(legGeo, new THREE.MeshLambertMaterial({ color: 0x222724 }), benchSpots.length);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const eu = new THREE.Euler();
      benchSpots.forEach((s, i) => {
        // block walking through the backrest, leave the seat face open to sit
        s.collider = this.addCollider(rectPoly(s.x, s.z, 0.95, 0.1, s.ry), 1.1);
        eu.set(0, s.ry, 0);
        q.setFromEuler(eu);
        m.compose(new THREE.Vector3(s.x, 0, s.z), q, new THREE.Vector3(1, 1, 1));
        seats.setMatrixAt(i, m);
        backs.setMatrixAt(i, m);
        legs.setMatrixAt(i, m);
      });
      seats.castShadow = true;
      this.group.add(seats, backs, legs);
      this.benchSpots = benchSpots; // sittable! the couple can share one
    }

    // Morris columns along the avenues
    const colSpots = [];
    for (const r of this.data.roads) {
      if (r.t !== "road" || r.w < 7) continue;
      for (let i = 1; i < r.p.length && colSpots.length < 18; i++) {
        const [ax, az] = r.p[i - 1], [bx, bz] = r.p[i];
        const segLen = Math.hypot(bx - ax, bz - az);
        if (segLen < 30 || rng() > 0.3) continue;
        const dx = (bx - ax) / segLen, dz = (bz - az) / segLen;
        const nx = -dz, nz = dx;
        const side = rng() > 0.5 ? 1 : -1;
        const t = 0.3 + rng() * 0.4;
        const x = ax + (bx - ax) * t + nx * side * (r.w / 2 + 2.2);
        const z = az + (bz - az) * t + nz * side * (r.w / 2 + 2.2);
        if (Math.hypot(x, z) > 480) continue;
        colSpots.push([x, z]);
      }
      if (colSpots.length >= 18) break;
    }
    if (colSpots.length) {
      const bodyGeo = new THREE.CylinderGeometry(0.55, 0.55, 2.6, 10);
      bodyGeo.translate(0, 1.3, 0);
      const capGeo = new THREE.SphereGeometry(0.62, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
      capGeo.translate(0, 2.6, 0);
      const posterGeo = new THREE.CylinderGeometry(0.57, 0.57, 1.5, 10, 1, true);
      posterGeo.translate(0, 1.45, 0);
      const greenMat = new THREE.MeshLambertMaterial({ color: 0x23362a });
      const posterMat = new THREE.MeshLambertMaterial({
        color: 0x8a7656, emissive: 0x4a3c22, emissiveIntensity: this.theme.night ? 0.8 : 0,
      });
      const bodies = new THREE.InstancedMesh(bodyGeo, greenMat, colSpots.length);
      const caps = new THREE.InstancedMesh(capGeo, greenMat, colSpots.length);
      const posters = new THREE.InstancedMesh(posterGeo, posterMat, colSpots.length);
      const m = new THREE.Matrix4();
      colSpots.forEach(([x, z], i) => {
        this.addCollider(rectPoly(x, z, 0.6, 0.6, 0), 3.4);
        m.makeTranslation(x, 0, z);
        bodies.setMatrixAt(i, m);
        caps.setMatrixAt(i, m);
        posters.setMatrixAt(i, m);
      });
      bodies.castShadow = true;
      this.group.add(bodies, caps, posters);
    }
  }

  buildRainTrees() {
    const { rng } = this;
    const spots = [];
    for (const r of this.data.roads) {
      if (r.t !== "road" || r.w < 7.5) continue;
      if (r.w === 8 || (r.n && /jalan tol/i.test(r.n))) continue; // keep the toll corridor clear
      for (let i = 1; i < r.p.length && spots.length < 240; i++) {
        const [ax, az] = r.p[i - 1], [bx, bz] = r.p[i];
        const segLen = Math.hypot(bx - ax, bz - az);
        const dx = (bx - ax) / segLen, dz = (bz - az) / segLen;
        const nx = -dz, nz = dx;
        for (let d = 10; d < segLen; d += 24 + rng() * 8) {
          const side = rng() > 0.5 ? 1 : -1;
          const x = ax + dx * d + nx * side * (r.w / 2 + 4.5);
          const z = az + dz * d + nz * side * (r.w / 2 + 4.5);
          if (Math.hypot(x, z) > 560) continue;
          if (Math.hypot(x - 396, z + 190) < 30) continue; // toll plaza forecourt
          spots.push([x, z]);
        }
      }
      if (spots.length >= 240) break;
    }
    if (!spots.length) return;

    const trunkGeo = new THREE.CylinderGeometry(0.35, 0.55, 6.5, 6);
    trunkGeo.translate(0, 3.25, 0);
    const blobGeo = new THREE.IcosahedronGeometry(5.2, 1);
    blobGeo.scale(1.35, 0.55, 1.35); // wide flat rain-tree crown
    const trunkMesh = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x4e4030 }), spots.length);
    const blobMesh = new THREE.InstancedMesh(blobGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), spots.length);
    blobMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(spots.length * 3), 3);
    const crowns = [0x2e5d2e, 0x386b35, 0x2a5429].map((c) => new THREE.Color(c));
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const eu = new THREE.Euler();
    spots.forEach(([x, z], i) => {
      const s = 0.85 + rng() * 0.5;
      this.addCollider(rectPoly(x, z, 0.45 * s, 0.45 * s, 0), 3);
      eu.set(0, rng() * Math.PI * 2, (rng() - 0.5) * 0.08);
      q.setFromEuler(eu);
      m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, s, s));
      trunkMesh.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(x, 6.4 * s, z), q, new THREE.Vector3(s, s, s));
      blobMesh.setMatrixAt(i, m);
      blobMesh.setColorAt(i, crowns[Math.floor(rng() * crowns.length)]);
    });
    trunkMesh.castShadow = blobMesh.castShadow = true;
    this.group.add(trunkMesh, blobMesh);
  }

  buildPalms(trees, foliageColors) {
    const { rng } = this;
    // tall coconut palms, like the references — not stubby ones
    const trunkGeo = new THREE.CylinderGeometry(0.11, 0.2, 7.8, 5);
    trunkGeo.translate(0, 3.9, 0);
    const frondGeos = [];
    for (let i = 0; i < 7; i++) {
      const f = new THREE.BoxGeometry(3.1, 0.06, 0.55);
      f.translate(1.55, 0, 0);
      const m = new THREE.Matrix4()
        .makeRotationY((i / 7) * Math.PI * 2)
        .multiply(new THREE.Matrix4().makeRotationZ(-0.5));
      f.applyMatrix4(m);
      f.translate(0, 7.8, 0);
      frondGeos.push(f);
    }
    const frondGeo = mergeGeometries(frondGeos, false);

    const trunkMesh = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x7a5c40 }), trees.length);
    const frondMesh = new THREE.InstancedMesh(frondGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), trees.length);
    frondMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(trees.length * 3), 3);

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const eu = new THREE.Euler();
    trees.forEach(([x, z], idx) => {
      const s = 0.7 + rng() * 0.8;
      this.addCollider(rectPoly(x, z, 0.28 * s, 0.28 * s, 0), 2.5);
      eu.set((rng() - 0.5) * 0.14, rng() * Math.PI * 2, (rng() - 0.5) * 0.14);
      q.setFromEuler(eu);
      m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, s, s));
      trunkMesh.setMatrixAt(idx, m);
      frondMesh.setMatrixAt(idx, m);
      frondMesh.setColorAt(idx, foliageColors[Math.floor(rng() * foliageColors.length)]);
    });
    trunkMesh.castShadow = true;
    frondMesh.castShadow = true;
    this.group.add(trunkMesh, frondMesh);
  }

  // ----------------------------------------------------------------- cars
  // Real recognizable models (see cars.js), parked along the curbs.
  // Every one of them can be driven — Game wakes a spot up into a live car.
  buildCars() {
    if (!this.theme.cars) return;
    const { rng, data } = this;
    const cap = data.radius > 1200 ? 330 : 180;
    const spots = [];
    for (const r of data.roads) {
      if (r.t !== "road" || r.w < 6 || isHighway(r)) continue; // nobody parks on the toll
      let acc = 0;
      for (let i = 1; i < r.p.length && spots.length < cap; i++) {
        const [ax, az] = r.p[i - 1], [bx, bz] = r.p[i];
        const segLen = Math.hypot(bx - ax, bz - az);
        acc += segLen;
        if (acc > 26) {
          acc = 0;
          if (rng() > 0.5) continue;
          const t = rng();
          const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
          if (Math.hypot(x, z) > data.radius - 15) continue; // stay inside the drivable world
          const dirA = Math.atan2(bx - ax, bz - az);
          const nx = -(bz - az) / segLen, nz = (bx - ax) / segLen;
          const side = rng() > 0.5 ? 1 : -1;
          spots.push({
            x: x + nx * (r.w / 2 - 1.2) * side,
            z: z + nz * (r.w / 2 - 1.2) * side,
            ry: dirA + (side > 0 ? 0 : Math.PI),
          });
        }
      }
      if (spots.length >= cap) break;
    }
    if (!spots.length) return;

    // deterministic model + paint per spot (both players see the same cars)
    spots.forEach((s, i) => {
      s.index = i;
      s.model = pickModel(data.key, rng);
      const { spec } = modelParts(s.model);
      s.paint = spec.paints[Math.floor(rng() * spec.paints.length)];
      s.y = this.surfaceY ? this.surfaceY(s.x, s.z) : 0;
      s.collider = this.addCollider(
        rectPoly(s.x, s.z, spec.dims[0] / 2 + 0.12, spec.dims[1] / 2 + 0.18, s.ry), 1.7);
      s.taken = false;
    });
    this.carSpots = spots;

    const byModel = {};
    for (const s of spots) (byModel[s.model] ??= []).push(s);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const eu = new THREE.Euler();
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    this._carHide = (spot) => {
      const im = this._carMeshes[spot.model];
      if (!im) return;
      im.paint.setMatrixAt(spot.slot, zero);
      im.trim.setMatrixAt(spot.slot, zero);
      im.paint.instanceMatrix.needsUpdate = true;
      im.trim.instanceMatrix.needsUpdate = true;
    };
    this._carMeshes = {};
    for (const [model, list] of Object.entries(byModel)) {
      const { paintGeo, trimStaticGeo } = modelParts(model);
      // clone: dispose() tears down per-world geometry, the cache must survive
      const paint = new THREE.InstancedMesh(paintGeo.clone(), new THREE.MeshLambertMaterial({ color: 0xffffff }), list.length);
      const trim = new THREE.InstancedMesh(trimStaticGeo.clone(), TRIM_MAT.clone(), list.length);
      list.forEach((s, slot) => {
        s.slot = slot;
        eu.set(0, s.ry, 0);
        q.setFromEuler(eu);
        m.compose(new THREE.Vector3(s.x, s.y, s.z), q, new THREE.Vector3(1, 1, 1));
        paint.setMatrixAt(slot, m);
        trim.setMatrixAt(slot, m);
        paint.setColorAt(slot, new THREE.Color(s.paint));
      });
      paint.castShadow = true;
      this.group.add(paint, trim);
      this._carMeshes[model] = { paint, trim };
    }
  }

  // a car drives away: hide its parked instance and lift its collider
  takeCar(spot) {
    spot.taken = true;
    spot.collider.off = true;
    this._carHide?.(spot);
  }

  // ------------------------------------------------------ cluster fences
  // Lippo Village avenues are lined with slim iron fences and white
  // pillars guarding the clusters (see the real Sudirman frontage).
  buildFences() {
    if (!this.theme.fillHouses) return;
    const data = this.data;
    const big = data.roads.filter((r) => r.t === "road" && r.w >= 7.5 && !isHighway(r));
    if (!big.length) return;
    // junction points of smaller roads → leave fence gaps there
    const junctionGrid = ptGrid(16);
    for (const r of data.roads) {
      if (r.w >= 7.5 && r.t === "road") continue;
      for (const p of r.p) junctionGrid.add(p[0], p[1]);
    }
    const nearJunction = (x, z) => {
      for (const [jx, jz] of junctionGrid.near(x, z, 8)) {
        if (Math.abs(jx - x) < 8 && Math.abs(jz - z) < 8 && Math.hypot(jx - x, jz - z) < 8) return true;
      }
      return false;
    };

    // sample points of all big roads, to detect a twin carriageway (median)
    const bigGrid = ptGrid(16);
    big.forEach((r, ri) => {
      for (let i = 1; i < r.p.length; i++) {
        const [ax, az] = r.p[i - 1], [bx, bz] = r.p[i];
        const len = Math.hypot(bx - ax, bz - az);
        for (let d = 0; d < len; d += 7) {
          bigGrid.add(ax + ((bx - ax) * d) / len, az + ((bz - az) * d) / len,
            [ax + ((bx - ax) * d) / len, az + ((bz - az) * d) / len, ri]);
        }
      }
    });
    const facesTwinRoad = (x, z, ownRi) => {
      for (const [rx, rz, ri] of bigGrid.near(x, z, 13)) {
        if (ri === ownRi) continue;
        if (Math.abs(rx - x) < 13 && Math.abs(rz - z) < 13 && Math.hypot(rx - x, rz - z) < 13) return true;
      }
      return false;
    };

    // Walk each roadside as one continuous run of sample points; every
    // consecutive valid pair gets a rail stretched exactly between them.
    // No per-segment seams → no gaps, correct orientation on curves.
    const pillars = [], rails = [];
    big.forEach((r, ri) => {
      for (const side of [-1, 1]) {
        const off = r.w / 2 + 3.2;
        let prev = null; // last valid point of the current run
        for (let i = 1; i < r.p.length; i++) {
          const [ax, az] = r.p[i - 1], [bx, bz] = r.p[i];
          const segLen = Math.hypot(bx - ax, bz - az);
          if (segLen < 1) continue;
          const dx = (bx - ax) / segLen, dz = (bz - az) / segLen;
          const nx = -dz, nz = dx;
          for (let d = 0; d < segLen; d += 11) {
            const px = ax + dx * d + nx * side * off;
            const pz = az + dz * d + nz * side * off;
            const ok =
              Math.hypot(px, pz) <= 540 &&
              Math.hypot(px + 0.5, pz - 14) >= 19 &&   // the gate opening
              !nearJunction(px, pz) &&
              !facesTwinRoad(px, pz, ri);
            if (!ok) { prev = null; continue; }
            if (prev) {
              const span = Math.hypot(px - prev.x, pz - prev.z);
              if (span > 2 && span < 16) {
                rails.push({
                  x: (px + prev.x) / 2, z: (pz + prev.z) / 2,
                  ry: Math.atan2(px - prev.x, pz - prev.z),
                  len: span,
                });
              }
            }
            pillars.push({ x: px, z: pz });
            prev = { x: px, z: pz };
            if (pillars.length > 800) break;
          }
          if (pillars.length > 800) break;
        }
      }
    });
    if (!pillars.length) return;

    const pillarGeo = new THREE.BoxGeometry(0.32, 1.55, 0.32);
    pillarGeo.translate(0, 0.78, 0);
    const capGeo = new THREE.SphereGeometry(0.16, 6, 5);
    capGeo.translate(0, 1.66, 0);
    // open picket fence: unit-length textured plane scaled to each span,
    // plus a solid top rail so the fence still reads from far away
    const railGeo = new THREE.PlaneGeometry(1, 1.5);
    railGeo.rotateY(Math.PI / 2);
    railGeo.translate(0, 0.78, 0);
    const topGeo = new THREE.BoxGeometry(0.09, 0.09, 1);
    topGeo.translate(0, 1.5, 0);

    const white = new THREE.MeshLambertMaterial({ color: 0xefe9dc });
    const ironTex = fenceTexture();
    ironTex.repeat.set(3.5, 1);
    const iron = new THREE.MeshLambertMaterial({
      map: ironTex, transparent: true, alphaTest: 0.2, side: THREE.DoubleSide,
    });
    const ironSolid = new THREE.MeshLambertMaterial({ color: 0x2c3530 });
    const pMesh = new THREE.InstancedMesh(pillarGeo, white, pillars.length);
    const cMesh = new THREE.InstancedMesh(capGeo, white, pillars.length);
    const rMesh = new THREE.InstancedMesh(railGeo, iron, rails.length);
    const tMesh = new THREE.InstancedMesh(topGeo, ironSolid, rails.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const eu = new THREE.Euler();
    pillars.forEach((p, i) => {
      m.makeTranslation(p.x, this.surfaceY(p.x, p.z), p.z);
      pMesh.setMatrixAt(i, m);
      cMesh.setMatrixAt(i, m);
    });
    const scl = new THREE.Vector3();
    rails.forEach((rr, i) => {
      this.addCollider(rectPoly(rr.x, rr.z, 0.14, rr.len / 2, rr.ry), 1.6);
      eu.set(0, rr.ry, 0);
      q.setFromEuler(eu);
      scl.set(1, 1, rr.len);
      m.compose(new THREE.Vector3(rr.x, this.surfaceY(rr.x, rr.z), rr.z), q, scl);
      rMesh.setMatrixAt(i, m);
      tMesh.setMatrixAt(i, m);
    });
    pMesh.castShadow = rMesh.castShadow = true;
    this.group.add(pMesh, cMesh, rMesh, tMesh);
  }

  // ----------------------------------------------------- avenue medians
  // Divided avenues (twin one-way carriageways) get the real grass median
  // strip between them instead of bare ground.
  buildMedians() {
    if (!this.theme.fillHouses) return;
    const data = this.data;
    const big = data.roads.filter((r) => r.t === "road" && r.w >= 7.5);
    if (big.length < 2) return;
    const bigGrid = ptGrid(16);
    big.forEach((r, ri) => {
      for (let i = 1; i < r.p.length; i++) {
        const [ax, az] = r.p[i - 1], [bx, bz] = r.p[i];
        const len = Math.hypot(bx - ax, bz - az);
        for (let d = 0; d < len; d += 7) {
          bigGrid.add(ax + ((bx - ax) * d) / len, az + ((bz - az) * d) / len,
            [ax + ((bx - ax) * d) / len, az + ((bz - az) * d) / len, ri]);
        }
      }
    });
    const twinAt = (x, z, ownRi) => {
      for (const [rx, rz, ri] of bigGrid.near(x, z, 13)) {
        if (ri === ownRi) continue;
        if (Math.abs(rx - x) < 13 && Math.abs(rz - z) < 13 && Math.hypot(rx - x, rz - z) < 13) return true;
      }
      return false;
    };
    // cross-street mouths punch gaps through the median
    const jctGrid = ptGrid(16);
    for (const r of data.roads) {
      if (r.w >= 7.5 && r.t === "road") continue;
      for (const p of r.p) jctGrid.add(p[0], p[1]);
    }
    const nearJct = (x, z) => {
      for (const [jx, jz] of jctGrid.near(x, z, 9)) {
        if (Math.abs(jx - x) < 9 && Math.abs(jz - z) < 9 && Math.hypot(jx - x, jz - z) < 9) return true;
      }
      return false;
    };

    const geos = [];
    big.forEach((r, ri) => {
      for (const side of [-1, 1]) {
        let run = [];
        const flush = () => {
          if (run.length >= 2) {
            try { geos.push(ribbonGeometry(run, 3.6, 0.13, 6)); } catch { /* skip */ }
          }
          run = [];
        };
        for (let i = 0; i < r.p.length; i++) {
          const [x, z] = r.p[i];
          // vertex normal from neighbors
          let dx = 0, dz = 0;
          if (i > 0) { dx += x - r.p[i - 1][0]; dz += z - r.p[i - 1][1]; }
          if (i < r.p.length - 1) { dx += r.p[i + 1][0] - x; dz += r.p[i + 1][1] - z; }
          const len = Math.hypot(dx, dz) || 1;
          const nx = -dz / len, nz = dx / len;
          const mx = x + nx * side * (r.w / 2 + 2.0);
          const mz = z + nz * side * (r.w / 2 + 2.0);
          if (twinAt(mx, mz, ri) && Math.hypot(mx, mz) < 560 && !nearJct(mx, mz)) {
            run.push([mx, mz]);
          } else flush();
        }
        flush();
      }
    });
    if (!geos.length) return;
    const merged = mergeGeometries(geos.map((g) => g.toNonIndexed()), false);
    const tex = grassTexture({
      base: "#" + new THREE.Color(this.theme.green).getHexString(),
      blade: "#" + new THREE.Color(this.theme.green).multiplyScalar(1.2).getHexString(),
    });
    const mesh = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  // ------------------------------------------------------------- tollway
  // The Jakarta–Merak toll: jersey barriers, tall double-arm masts, green
  // gantry signs, and the Karawaci toll plaza — matched to Street View.
  buildTollway() {
    const tolls = this.data.roads.filter((r) => r.n && /jalan tol/i.test(r.n));
    if (!tolls.length) return;

    // ramp mouths (motorway links, w8) punch gaps so cars can get on and off
    const rampGrid = ptGrid(16);
    for (const r of this.data.roads) {
      if (r.w === 8) for (const p of r.p) rampGrid.add(p[0], p[1]);
    }
    const nearRamp = (x, z) => {
      for (const [jx, jz] of rampGrid.near(x, z, 16)) {
        if (Math.hypot(jx - x, jz - z) < 16) return true;
      }
      return false;
    };

    const lim = this.data.radius - 5;
    const rails = [], mastSpots = [], gantrySpots = [];
    let mastAcc = 0, gantryAcc = 260, mastSide = 1;
    for (const r of tolls) {
      for (const side of [-1, 1]) {
        let prev = null;
        for (let i = 1; i < r.p.length; i++) {
          const [ax, az] = r.p[i - 1], [bx, bz] = r.p[i];
          const segLen = Math.hypot(bx - ax, bz - az);
          if (segLen < 1) continue;
          const dx = (bx - ax) / segLen, dz = (bz - az) / segLen;
          const nx = -dz, nz = dx;
          for (let d = 0; d < segLen; d += 8) {
            const px = ax + dx * d + nx * side * (r.w / 2 + 0.4);
            const pz = az + dz * d + nz * side * (r.w / 2 + 0.4);
            const ok = Math.hypot(px, pz) < lim && !nearRamp(px, pz);
            if (!ok) { prev = null; continue; }
            if (prev) {
              const span = Math.hypot(px - prev.x, pz - prev.z);
              if (span > 2 && span < 14) {
                const rail = {
                  x: (px + prev.x) / 2, z: (pz + prev.z) / 2,
                  ry: Math.atan2(px - prev.x, pz - prev.z), len: span,
                };
                rails.push(rail);
                this.addCollider(rectPoly(rail.x, rail.z, 0.25, span / 2, rail.ry), 1.1);
              }
            }
            prev = { x: px, z: pz };
          }
        }
      }
      // masts + gantries along one carriageway only (shared corridor)
      for (let i = 1; i < r.p.length; i++) {
        const [ax, az] = r.p[i - 1], [bx, bz] = r.p[i];
        const segLen = Math.hypot(bx - ax, bz - az);
        if (segLen < 1) continue;
        const dx = (bx - ax) / segLen, dz = (bz - az) / segLen;
        const nx = -dz, nz = dx;
        for (let d = 0; d < segLen; d += 8) {
          mastAcc += 8; gantryAcc += 8;
          const cx = ax + dx * d, cz = az + dz * d;
          if (Math.hypot(cx, cz) > lim - 30) continue;
          if (mastAcc > 46) {
            mastAcc = 0; mastSide = -mastSide;
            mastSpots.push({ x: cx + nx * mastSide * (r.w / 2 + 1.6), z: cz + nz * mastSide * (r.w / 2 + 1.6), ry: Math.atan2(dx, dz), side: mastSide });
          }
          if (gantryAcc > 420) {
            gantryAcc = 0;
            gantrySpots.push({ x: cx, z: cz, ry: Math.atan2(dx, dz), w: r.w });
          }
        }
      }
    }

    const concrete = new THREE.MeshLambertMaterial({ color: 0xb6b3ac });
    if (rails.length) {
      const railGeo = new THREE.BoxGeometry(0.42, 0.85, 1);
      railGeo.translate(0, 0.42, 0);
      const rMesh = new THREE.InstancedMesh(railGeo, concrete, rails.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), eu = new THREE.Euler(), s = new THREE.Vector3();
      rails.forEach((rr, i) => {
        eu.set(0, rr.ry, 0); q.setFromEuler(eu); s.set(1, 1, rr.len + 0.3);
        m.compose(new THREE.Vector3(rr.x, this.surfaceY(rr.x, rr.z), rr.z), q, s);
        rMesh.setMatrixAt(i, m);
      });
      rMesh.castShadow = true;
      this.group.add(rMesh);
    }

    if (mastSpots.length) {
      const pole = new THREE.CylinderGeometry(0.12, 0.18, 11.5, 6).translate(0, 5.75, 0);
      const arm = new THREE.BoxGeometry(0.14, 0.14, 3.4).translate(0, 11.3, 1.5);
      const head = new THREE.BoxGeometry(0.5, 0.16, 0.9).translate(0, 11.2, 3.0);
      const mastGeo = mergeGeometries([pole, arm, head], false);
      const mMesh = new THREE.InstancedMesh(mastGeo, new THREE.MeshLambertMaterial({ color: 0x4a4e54 }), mastSpots.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), eu = new THREE.Euler();
      mastSpots.forEach((sp, i) => {
        // arm reaches over the lanes
        eu.set(0, sp.ry + (sp.side > 0 ? Math.PI : 0), 0); q.setFromEuler(eu);
        m.compose(new THREE.Vector3(sp.x, this.surfaceY(sp.x, sp.z), sp.z), q, new THREE.Vector3(1, 1, 1));
        mMesh.setMatrixAt(i, m);
        this.addCollider(rectPoly(sp.x, sp.z, 0.25, 0.25, 0), 4);
      });
      this.group.add(mMesh);
    }

    // green overhead destination signs
    if (gantrySpots.length) {
      const cv = document.createElement("canvas");
      cv.width = 512; cv.height = 128;
      const ctx = cv.getContext("2d");
      ctx.fillStyle = "#0d5a36"; ctx.fillRect(0, 0, 512, 128);
      ctx.strokeStyle = "#e8e8e0"; ctx.lineWidth = 6; ctx.strokeRect(8, 8, 496, 112);
      ctx.fillStyle = "#f2f2ea"; ctx.font = "bold 56px Arial";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("JAKARTA  ➜", 256, 64);
      const tex = new THREE.CanvasTexture(cv);
      const cv2 = cv.cloneNode();
      const ctx2 = cv2.getContext("2d");
      ctx2.drawImage(cv, 0, 0);
      ctx2.fillStyle = "#0d5a36"; ctx2.fillRect(10, 10, 492, 108);
      ctx2.fillStyle = "#f2f2ea";
      ctx2.font = "bold 44px Arial"; ctx2.textAlign = "center"; ctx2.textBaseline = "middle";
      ctx2.fillText("TANGERANG · MERAK ➜", 256, 64);
      const tex2 = new THREE.CanvasTexture(cv2);
      const post = new THREE.MeshLambertMaterial({ color: 0x55595f });
      gantrySpots.forEach((sp, gi) => {
        const grp = new THREE.Group();
        const half = sp.w + 6;
        for (const s of [-1, 1]) {
          const p = new THREE.Mesh(new THREE.BoxGeometry(0.35, 7.2, 0.35), post);
          p.position.set(s * half / 2, 3.6, 0);
          grp.add(p);
          this.addCollider(rectPoly(sp.x + Math.cos(sp.ry) * s * half / 2, sp.z - Math.sin(sp.ry) * s * half / 2, 0.3, 0.3, 0), 7);
        }
        const beam = new THREE.Mesh(new THREE.BoxGeometry(half, 0.4, 0.4), post);
        beam.position.y = 6.6;
        grp.add(beam);
        const sign = new THREE.Mesh(
          new THREE.PlaneGeometry(7.5, 1.9),
          new THREE.MeshLambertMaterial({ map: gi % 2 ? tex : tex2, side: THREE.DoubleSide })
        );
        sign.position.set(0, 5.4, 0.25);
        grp.add(sign);
        grp.position.set(sp.x, this.surfaceY(sp.x, sp.z), sp.z);
        grp.rotation.y = sp.ry;
        this.group.add(grp);
      });
    }

    // GERBANG TOL KARAWACI — the plaza straddles the access road lanes
    this.buildTollPlaza(396, -190, 0);
  }

  buildTollPlaza(x, z, ry) {
    const grp = new THREE.Group();
    const steel = new THREE.MeshLambertMaterial({ color: 0x8e9298 });
    const yellow = new THREE.MeshLambertMaterial({ color: 0xd8a418 });
    const boothMat = new THREE.MeshLambertMaterial({ color: 0xe8e5dc });
    const W = 30;
    // canopy
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(W, 0.5, 9), steel);
    canopy.position.y = 6.2;
    canopy.castShadow = true;
    grp.add(canopy);
    const fascia = new THREE.Mesh(new THREE.BoxGeometry(W, 1.1, 0.22), yellow);
    fascia.position.set(0, 5.6, 4.6);
    grp.add(fascia);
    // name board
    const cv = document.createElement("canvas");
    cv.width = 1024; cv.height = 96;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#13427a"; ctx.fillRect(0, 0, 1024, 96);
    ctx.fillStyle = "#f4f4ec"; ctx.font = "bold 60px Arial";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("GERBANG TOL KARAWACI", 512, 50);
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 1.5),
      new THREE.MeshLambertMaterial({ map: new THREE.CanvasTexture(cv), side: THREE.DoubleSide })
    );
    board.position.set(0, 7.2, 4.6);
    grp.add(board);
    // pillars + booths
    for (let i = -2; i <= 2; i++) {
      const px = i * (W / 5);
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 6.2, 0.5), steel);
      pillar.position.set(px, 3.1, 0);
      grp.add(pillar);
      if (i < 2) {
        const booth = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.5, 2.6), boothMat);
        booth.position.set(px + W / 10, 1.25, 0);
        booth.castShadow = true;
        grp.add(booth);
        const visor = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 0.6), yellow);
        visor.position.set(px + W / 10, 2.2, 1.5);
        grp.add(visor);
        const bx = x + (px + W / 10) * Math.cos(ry), bz = z - (px + W / 10) * Math.sin(ry);
        this.addCollider(rectPoly(bx, bz, 0.9, 1.4, ry), 2.6);
      }
    }
    grp.position.set(x, this.surfaceY(x, z), z);
    grp.rotation.y = ry;
    this.group.add(grp);
  }

  // ----------------------------------------------------- paris decorations
  buildStreetlamps() {
    const { rng } = this;
    const spots = [];
    for (const r of this.data.roads) {
      if (r.t !== "road" || r.w < 6 || isHighway(r)) continue; // the toll has its own masts
      let acc = 0;
      for (let i = 1; i < r.p.length && spots.length < 320; i++) {
        const [ax, az] = r.p[i - 1], [bx, bz] = r.p[i];
        const segLen = Math.hypot(bx - ax, bz - az);
        acc += segLen;
        if (acc > 42) {
          acc = 0;
          const t = rng();
          const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
          const nx = -(bz - az) / segLen, nz = (bx - ax) / segLen;
          const side = rng() > 0.5 ? 1 : -1;
          spots.push([x + nx * (r.w / 2 + 0.8) * side, z + nz * (r.w / 2 + 0.8) * side]);
        }
      }
    }
    if (!spots.length) return;
    const poleGeo = new THREE.CylinderGeometry(0.07, 0.1, 4.6, 5);
    poleGeo.translate(0, 2.3, 0);
    const headGeo = new THREE.SphereGeometry(0.32, 8, 6);
    headGeo.translate(0, 4.7, 0);
    const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ color: 0x2a2a30 }), spots.length);
    // lamp heads glow at night, read as dark glass in daylight cities
    const headMat = this.theme.night
      ? new THREE.MeshBasicMaterial({ color: 0xffd9a0 })
      : new THREE.MeshLambertMaterial({ color: 0x3a3e44 });
    const heads = new THREE.InstancedMesh(headGeo, headMat, spots.length);
    const m = new THREE.Matrix4();
    spots.forEach(([x, z], i) => {
      this.addCollider(rectPoly(x, z, 0.18, 0.18, 0), 4.4);
      m.makeTranslation(x, this.surfaceY ? this.surfaceY(x, z) : 0, z);
      poles.setMatrixAt(i, m);
      heads.setMatrixAt(i, m);
    });
    this.group.add(poles, heads);
  }

  buildLights() {
    const { theme } = this;
    const sun = new THREE.DirectionalLight(theme.sun.color, theme.sun.intensity);
    sun.position.set(...theme.sun.position);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const S = 90;
    sun.shadow.camera.left = -S; sun.shadow.camera.right = S;
    sun.shadow.camera.top = S; sun.shadow.camera.bottom = -S;
    sun.shadow.camera.near = 10; sun.shadow.camera.far = 1500;
    sun.shadow.bias = -0.0004;
    this.sun = sun;
    this.sunOffset = new THREE.Vector3(...theme.sun.position);
    this.group.add(sun, sun.target);

    this.group.add(new THREE.AmbientLight(theme.ambient.color, theme.ambient.intensity));
    this.group.add(new THREE.HemisphereLight(theme.hemi.sky, theme.hemi.ground, theme.hemi.intensity));
  }

  updateSun(target) {
    if (!this.sun) return;
    this.sun.position.copy(target).add(this.sunOffset);
    this.sun.target.position.copy(target);
  }

  buildBoundary() {
    const r = this.data.radius + 40;
    const geo = new THREE.TorusGeometry(r, 0.6, 6, 128);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff6b9d, transparent: true, opacity: 0.35,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.position.y = 1.2;
    this.group.add(ring);
    this.animated.push((t) => {
      ring.position.y = 1.2 + Math.sin(t * 0.7) * 0.5;
      mat.opacity = 0.25 + Math.sin(t * 1.3) * 0.12;
    });
  }

  // -------------------------------------------------------------- queries
  // spatial index: with 10k+ buildings a linear scan per frame would crawl
  _collisionIndex() {
    if (this._colGrid) return this._colGrid;
    const CELL = 24;
    const grid = new Map();
    this.collisionPolys.forEach((poly, i) => {
      const { bbox } = poly;
      for (let gx = Math.floor(bbox.minX / CELL); gx <= Math.floor(bbox.maxX / CELL); gx++) {
        for (let gz = Math.floor(bbox.minZ / CELL); gz <= Math.floor(bbox.maxZ / CELL); gz++) {
          const k = gx + "," + gz;
          let arr = grid.get(k);
          if (!arr) { arr = []; grid.set(k, arr); }
          arr.push(i);
        }
      }
    });
    this._colGrid = grid;
    this._colCell = CELL;
    return grid;
  }

  _polysNear(x, z) {
    const grid = this._collisionIndex();
    return grid.get(Math.floor(x / this._colCell) + "," + Math.floor(z / this._colCell)) ?? [];
  }

  // register an obstacle after build (cars, tower legs, furniture).
  // returns the poly so callers can toggle it off (a car being driven away).
  addCollider(pts, h = 2.5) {
    const poly = { pts, bbox: polyBBox(pts), h };
    this.collisionPolys.push(poly);
    this._colGrid = null; // lazily rebuilt on next query
    return poly;
  }

  blocked(x, z) {
    for (const i of this._polysNear(x, z)) {
      const { pts, bbox, off } = this.collisionPolys[i];
      if (off) continue;
      if (x < bbox.minX || x > bbox.maxX || z < bbox.minZ || z > bbox.maxZ) continue;
      if (pointInPoly(x, z, pts)) return true;
    }
    return false;
  }

  // camera occlusion: is this point inside a building volume?
  blockedAt(x, z, y) {
    for (const i of this._polysNear(x, z)) {
      const { pts, bbox, h, off } = this.collisionPolys[i];
      if (off || h <= 0 || y > h) continue;
      if (x < bbox.minX || x > bbox.maxX || z < bbox.minZ || z > bbox.maxZ) continue;
      if (pointInPoly(x, z, pts)) return true;
    }
    return false;
  }

  findClearSpot(x, z, step = 4) {
    if (!this.blocked(x, z)) return [x, z];
    for (let r = step; r < 220; r += step) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
        const nx = x + Math.cos(a) * r, nz = z + Math.sin(a) * r;
        if (!this.blocked(nx, nz)) return [nx, nz];
      }
    }
    return [x, z];
  }

  groundHeight() { return 0; }

  // what you're standing on: road, sidewalk, path or bare ground
  surfaceY(x, z) {
    if (!this.surfaceCells) return 0;
    const c = this._surfaceCell;
    return this.surfaceCells.get(Math.floor(x / c) + "," + Math.floor(z / c)) ?? 0.02;
  }

  tick(t, dt) {
    for (const fn of this.animated) fn(t, dt);
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (m.map) m.map.dispose();
          if (m.emissiveMap) m.emissiveMap.dispose();
          m.dispose();
        }
      }
    });
  }
}
