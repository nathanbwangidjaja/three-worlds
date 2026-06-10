// Turns baked OSM JSON (real map data) into a polished stylized 3D city:
// textured facades with window grids, terracotta hip roofs, marked roads
// with sidewalks, parks, rivers, clouds and parked cars.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  facadeTexture, houseWallTexture, storefrontTexture, roofTexture, flatRoofTexture,
  asphaltTexture, sidewalkTexture, grassTexture, cloudTexture, glowTexture,
  panelGridTexture, curtainWallTexture, ribbonBandTexture, garageTexture,
} from "./textures.js";
import { TUNING, STYLE_DEFS } from "./cityTuning.js";

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
    this.buildSky();
    this.buildGround();
    onProgress?.(0.07, "laying the ground");
    await this.nextFrame();

    this.buildGreen();
    this.buildWater();
    onProgress?.(0.16, "filling the river");
    await this.nextFrame();

    this.buildRoads();
    onProgress?.(0.26, "painting the streets");
    await this.nextFrame();

    await this.buildBuildings(onProgress);
    this.buildSigns();
    this.buildTrees();
    onProgress?.(0.9, "planting the trees");
    await this.nextFrame();

    this.buildCars();
    if (theme.streetlights) this.buildStreetlamps();
    this.buildClouds();
    this.buildLights();
    this.buildBoundary();
    onProgress?.(1, "done");

    this.scene.add(group);
    return this;
  }

  nextFrame() {
    // setTimeout, not rAF — rAF never fires in hidden tabs and would stall loading
    return new Promise((r) => setTimeout(r, 0));
  }

  // ----------------------------------------------------------------- sky
  buildSky() {
    const { theme } = this;
    const geo = new THREE.SphereGeometry(1600, 24, 16);
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
        const r = 1500;
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
    for (const r of this.data.roads) {
      if (r.p.length < 2) continue;
      try {
        if (r.t === "path") {
          pathGeos.push(ribbonGeometry(r.p, r.w, 0.22, 3));
        } else {
          if (r.w >= 7) laneGeos.push(ribbonGeometry(r.p, r.w, 0.17, 12));
          else mainGeos.push(ribbonGeometry(r.p, r.w, 0.15, 12));
          if (r.w >= 5.5 && r.w <= 11) {
            // sidewalk strip peeking out on both sides (skip highways)
            walkGeos.push(ribbonGeometry(r.p, r.w + 3.4, 0.11, 2.2));
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
    add(laneGeos, new THREE.MeshLambertMaterial({ map: asphaltTexture({ base: roadBase, centerLine: true }), side: THREE.DoubleSide }));
    add(mainGeos, new THREE.MeshLambertMaterial({ map: asphaltTexture({ base: roadBase, centerLine: false }), side: THREE.DoubleSide }));
    add(walkGeos, new THREE.MeshLambertMaterial({ map: sidewalkTexture({ base: this.theme.night ? "#3e4150" : "#969188" }), side: THREE.DoubleSide }));
    add(pathGeos, new THREE.MeshLambertMaterial({ map: sidewalkTexture({ base: "#" + new THREE.Color(this.theme.path).getHexString() }), side: THREE.DoubleSide }));
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
        mat.emissiveIntensity = 1.15;
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
    const flatGeos = [];
    const hipGeos = hipVariants.map(() => []);
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
    for (const b of data.buildings) {
      i++;
      if (i % 500 === 0) {
        onProgress?.(0.3 + 0.55 * (i / data.buildings.length), "raising the buildings");
        await this.nextFrame();
      }
      if (b.tower && b.h > 100) continue; // Eiffel gets a hand-built model

      let pts = b.p;
      if (signedArea(pts) < 0) pts = pts.slice().reverse();
      const cat = b.c || "generic";
      const [bcx, bcz] = centroidOf(pts);
      const bArea = Math.abs(signedArea(pts));

      // hand-tuned building? route to its custom architectural style
      const rule = matchTuning(b.n, bcx, bcz, cat, bArea);
      const h = rule?.h ?? b.h;
      this.collisionPolys.push({ pts, bbox: polyBBox(pts), h });
      this.buildingList.push({ pts, h, cat });
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
      const hasShop = shopMat && sfCfg && h > (sfCfg.bandH + 2.6) && rng() < sfChance;
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
      const useMansard = mansardCfg && h >= mansardCfg.minH && pts.length <= 14 && area > 60;
      try {
        if (useHip) {
          const [cx, cz] = centroidOf(pts);
          const ridgeY = h + roofCfg.height;
          const pos = [], uv = [], idx = [];
          for (let e = 0; e < pts.length; e++) {
            const [ax, az] = pts[e];
            const [bx, bz] = pts[(e + 1) % pts.length];
            const base = pos.length / 3;
            pos.push(ax, h, az, bx, h, bz, cx, ridgeY, cz);
            uv.push(ax / 4, az / 4, bx / 4, bz / 4, cx / 4, cz / 4);
            idx.push(base, base + 1, base + 2);
          }
          const g = new THREE.BufferGeometry();
          g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
          g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(uv), 2));
          g.setIndex(idx);
          g.computeVertexNormals();
          hipGeos[Math.floor(rng() * hipVariants.length)].push(g);
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
            mansardBuf.uv.push(0, 0, len / 3, 0, len / 3, 1, 0, 1);
            mansardBuf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
            mansardBuf.n += 4;
          }
          flatGeos.push(flatPolyGeometry(inset, topY, 4));
        } else {
          flatGeos.push(flatPolyGeometry(pts, h, 4));
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
      buildBufMesh(
        { ...mansardBuf, col: null },
        new THREE.MeshLambertMaterial({ color: mansardCfg.color, side: THREE.DoubleSide })
      );
    }

    if (flatGeos.length) {
      const merged = mergeGeometries(flatGeos.map((g) => g.toNonIndexed()), false);
      const mesh = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({
        map: flatRoofTexture({ base: roofCfg.base || "#5c544c" }),
      }));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
    hipGeos.forEach((geos, vi) => {
      if (!geos.length) return;
      const merged = mergeGeometries(geos.map((g) => g.toNonIndexed()), false);
      const mesh = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({
        map: roofTexture({ tile: hipVariants[vi].tile, dark: hipVariants[vi].dark, seed: 5 + vi * 7 }),
      }));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
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
    let placed = 0;

    for (const poi of pois) {
      if (placed >= 110) break;
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
    // sparse OSM tree data (tangerang): scatter palms along the roads,
    // closest roads first so the area around her home feels lush
    if (this.data.trees.length < 120) {
      const roads = this.data.roads
        .filter((r) => r.t === "road")
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

  buildPalms(trees, foliageColors) {
    const { rng } = this;
    const trunkGeo = new THREE.CylinderGeometry(0.12, 0.22, 5.2, 5);
    trunkGeo.translate(0, 2.6, 0);
    const frondGeos = [];
    for (let i = 0; i < 6; i++) {
      const f = new THREE.BoxGeometry(2.6, 0.06, 0.5);
      f.translate(1.3, 0, 0);
      const m = new THREE.Matrix4()
        .makeRotationY((i / 6) * Math.PI * 2)
        .multiply(new THREE.Matrix4().makeRotationZ(-0.45));
      f.applyMatrix4(m);
      f.translate(0, 5.2, 0);
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
  buildCars() {
    if (!this.theme.cars) return;
    const { rng } = this;
    const spots = [];
    for (const r of this.data.roads) {
      if (r.t !== "road" || r.w < 6) continue;
      let acc = 0;
      for (let i = 1; i < r.p.length && spots.length < 150; i++) {
        const [ax, az] = r.p[i - 1], [bx, bz] = r.p[i];
        const segLen = Math.hypot(bx - ax, bz - az);
        acc += segLen;
        if (acc > 30) {
          acc = 0;
          if (rng() > 0.45) continue;
          const t = rng();
          const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
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
      if (spots.length >= 150) break;
    }
    if (!spots.length) return;

    const bodyGeo = new THREE.BoxGeometry(1.78, 0.62, 4.3);
    bodyGeo.translate(0, 0.55, 0);
    const cabinGeo = new THREE.BoxGeometry(1.6, 0.55, 2.2);
    cabinGeo.translate(0, 1.12, -0.25);
    const wheelGeo = mergeGeometries([
      new THREE.BoxGeometry(1.9, 0.34, 0.36).translate(0, 0.18, 1.32),
      new THREE.BoxGeometry(1.9, 0.34, 0.36).translate(0, 0.18, -1.32),
    ], false);

    const bodyMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const cabinMat = new THREE.MeshLambertMaterial({ color: this.theme.night ? 0x1c2230 : 0x202832 });
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x16161a });

    const body = new THREE.InstancedMesh(bodyGeo, bodyMat, spots.length);
    body.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(spots.length * 3), 3);
    const cabin = new THREE.InstancedMesh(cabinGeo, cabinMat, spots.length);
    const wheels = new THREE.InstancedMesh(wheelGeo, wheelMat, spots.length);

    const palette = [0xbfc4cc, 0x8b9099, 0x4a4f58, 0x7a3a36, 0x36506e, 0xd8d4c8, 0x2e3a30]
      .map((c) => new THREE.Color(c));
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const eu = new THREE.Euler();
    spots.forEach((s, i) => {
      eu.set(0, s.ry, 0);
      q.setFromEuler(eu);
      m.compose(new THREE.Vector3(s.x, 0, s.z), q, new THREE.Vector3(1, 1, 1));
      body.setMatrixAt(i, m);
      cabin.setMatrixAt(i, m);
      wheels.setMatrixAt(i, m);
      body.setColorAt(i, palette[Math.floor(rng() * palette.length)]);
    });
    body.castShadow = cabin.castShadow = true;
    this.group.add(body, cabin, wheels);
  }

  // ----------------------------------------------------- paris decorations
  buildStreetlamps() {
    const { rng } = this;
    const spots = [];
    for (const r of this.data.roads) {
      if (r.t !== "road" || r.w < 6) continue;
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
    const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshBasicMaterial({ color: 0xffd9a0 }), spots.length);
    const m = new THREE.Matrix4();
    spots.forEach(([x, z], i) => {
      m.makeTranslation(x, 0, z);
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
  blocked(x, z) {
    for (const { pts, bbox } of this.collisionPolys) {
      if (x < bbox.minX || x > bbox.maxX || z < bbox.minZ || z > bbox.maxZ) continue;
      if (pointInPoly(x, z, pts)) return true;
    }
    return false;
  }

  // camera occlusion: is this point inside a building volume?
  blockedAt(x, z, y) {
    for (const { pts, bbox, h } of this.collisionPolys) {
      if (h <= 0 || y > h) continue;
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
