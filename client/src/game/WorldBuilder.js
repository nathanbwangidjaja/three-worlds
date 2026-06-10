// Turns baked OSM JSON (real map data) into a stylized low-poly 3D city.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

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

// flat polygon → ShapeGeometry on XZ plane at given y
function flatPolyGeometry(pts, y) {
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0], -pts[0][1]);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], -pts[i][1]);
  shape.closePath();
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}

// polyline → flat ribbon on XZ plane
function ribbonGeometry(pts, width, y) {
  const hw = width / 2;
  const n = pts.length;
  const positions = new Float32Array(n * 2 * 3);
  const indices = [];
  let px = 0, pz = 0;
  for (let i = 0; i < n; i++) {
    const [x, z] = pts[i];
    // direction = average of adjacent segments
    let dx = 0, dz = 0;
    if (i > 0) { dx += x - pts[i - 1][0]; dz += z - pts[i - 1][1]; }
    if (i < n - 1) { dx += pts[i + 1][0] - x; dz += pts[i + 1][1] - z; }
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len, nz = dx / len; // perpendicular
    positions.set([x + nx * hw, y, z + nz * hw], i * 6);
    positions.set([x - nx * hw, y, z - nz * hw], i * 6 + 3);
    if (i > 0) {
      const a = (i - 1) * 2, b = a + 1, c = i * 2, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
    px = x; pz = z;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
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
    this.collisionPolys = []; // {pts, bbox} — buildings + water
    this.animated = [];       // callbacks(t, dt)
  }

  async build(onProgress) {
    const { theme, data, group } = this;
    this.buildSky();
    this.buildGround();
    onProgress?.(0.08, "laying the ground");
    await this.nextFrame();

    this.buildGreen();
    this.buildWater();
    onProgress?.(0.18, "filling the river");
    await this.nextFrame();

    this.buildRoads();
    onProgress?.(0.28, "paving the streets");
    await this.nextFrame();

    await this.buildBuildings(onProgress);
    this.buildTrees();
    onProgress?.(0.92, "planting the trees");
    await this.nextFrame();

    if (theme.streetlights) this.buildStreetlamps();
    if (theme.windowGlow) this.buildWindowGlow();
    this.buildLights();
    this.buildBoundary();
    onProgress?.(1, "done");

    this.scene.add(group);
    return this;
  }

  nextFrame() {
    return new Promise((r) => requestAnimationFrame(r));
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
    sky.name = "sky";
    this.group.add(sky);

    if (this.theme.stars) {
      const starCount = 900;
      const pos = new Float32Array(starCount * 3);
      const rng = this.rng;
      for (let i = 0; i < starCount; i++) {
        const theta = rng() * Math.PI * 2;
        const phi = Math.acos(1 - rng() * 0.85); // upper dome
        const r = 1500;
        pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        pos[i * 3 + 1] = r * Math.cos(phi) + 60;
        pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const stars = new THREE.Points(g, new THREE.PointsMaterial({
        color: 0xdfe8ff, size: 2.2, sizeAttenuation: false, fog: false,
        transparent: true, opacity: 0.85,
      }));
      this.group.add(stars);

      // a soft moon
      const moon = new THREE.Mesh(
        new THREE.CircleGeometry(46, 32),
        new THREE.MeshBasicMaterial({ color: 0xf3f0e0, fog: false })
      );
      moon.position.set(520, 760, -980);
      moon.lookAt(0, 0, 0);
      this.group.add(moon);
    }
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
      try { geos.push(flatPolyGeometry(area.p, 0.05)); } catch { /* bad poly */ }
    }
    if (!geos.length) return;
    const merged = mergeGeometries(geos.map((g) => g.toNonIndexed()), false);
    const mesh = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ color: this.theme.green }));
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  buildWater() {
    const geos = [];
    for (const w of this.data.water) {
      try { geos.push(flatPolyGeometry(w.p, 0.12)); } catch { /* bad poly */ }
      this.collisionPolys.push({ pts: w.p, bbox: polyBBox(w.p), h: 0.4 });
    }
    if (!geos.length) return;
    const merged = mergeGeometries(geos.map((g) => g.toNonIndexed()), false);
    const mat = new THREE.MeshStandardMaterial({
      color: this.theme.water, roughness: 0.15, metalness: 0.55,
    });
    const mesh = new THREE.Mesh(merged, mat);
    this.group.add(mesh);
    // gentle shimmer
    this.animated.push((t) => { mat.roughness = 0.15 + Math.sin(t * 0.8) * 0.08; });
  }

  buildRoads() {
    const roadGeos = [], pathGeos = [];
    for (const r of this.data.roads) {
      if (r.p.length < 2) continue;
      try {
        const g = ribbonGeometry(r.p, r.w, r.t === "path" ? 0.22 : 0.15);
        (r.t === "path" ? pathGeos : roadGeos).push(g);
      } catch { /* skip */ }
    }
    if (roadGeos.length) {
      const merged = mergeGeometries(roadGeos.map((g) => g.toNonIndexed()), false);
      const mesh = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ color: this.theme.road }));
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
    if (pathGeos.length) {
      const merged = mergeGeometries(pathGeos.map((g) => g.toNonIndexed()), false);
      const mesh = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ color: this.theme.path }));
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
  }

  // ------------------------------------------------------------ buildings
  async buildBuildings(onProgress) {
    const { theme, data } = this;
    const palette = theme.buildingPalette.map((c) => new THREE.Color(c));
    const roofColor = theme.roofColor ? new THREE.Color(theme.roofColor) : null;
    const geos = [];
    const rng = this.rng;
    this.buildingSamples = []; // for window glow

    let i = 0;
    for (const b of data.buildings) {
      i++;
      if (i % 600 === 0) {
        onProgress?.(0.3 + 0.6 * (i / data.buildings.length), "raising the buildings");
        await this.nextFrame();
      }
      // The Eiffel Tower gets a custom model (landmarks.js), skip the footprint extrusion
      if (b.tower && b.h > 100) continue;

      const pts = b.p;
      this.collisionPolys.push({ pts, bbox: polyBBox(pts), h: b.h });

      try {
        const shape = new THREE.Shape();
        shape.moveTo(pts[0][0], -pts[0][1]);
        for (let k = 1; k < pts.length; k++) shape.lineTo(pts[k][0], -pts[k][1]);
        shape.closePath();
        const g = new THREE.ExtrudeGeometry(shape, { depth: b.h, bevelEnabled: false });
        g.rotateX(-Math.PI / 2);

        // per-building color + distinct roof tint
        const base = palette[Math.floor(rng() * palette.length)].clone();
        const jitter = 0.88 + rng() * 0.24;
        base.multiplyScalar(jitter);
        const roof = roofColor
          ? roofColor.clone().multiplyScalar(0.9 + rng() * 0.2)
          : base.clone().multiplyScalar(theme.roofTint);

        const normal = g.attributes.normal;
        const count = g.attributes.position.count;
        const colors = new Float32Array(count * 3);
        for (let v = 0; v < count; v++) {
          const up = normal.getY(v) > 0.7;
          const c = up ? roof : base;
          colors[v * 3] = c.r; colors[v * 3 + 1] = c.g; colors[v * 3 + 2] = c.b;
        }
        g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        geos.push(g.toNonIndexed ? g : g);
        if (b.h > 6 && pts.length >= 3) this.buildingSamples.push(b);
      } catch { /* degenerate footprint */ }
    }

    if (!geos.length) return;
    const merged = mergeGeometries(geos, false);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  // ---------------------------------------------------------------- trees
  buildTrees() {
    const { theme, data, rng } = this;
    const spots = [...data.trees];

    // cities with no mapped trees still deserve greenery: line the streets
    if (spots.length < 80) {
      for (const r of data.roads) {
        if (r.t !== "road" || r.w < 5) continue;
        let acc = 0;
        for (let i = 1; i < r.p.length; i++) {
          const [ax, az] = r.p[i - 1], [bx, bz] = r.p[i];
          const segLen = Math.hypot(bx - ax, bz - az);
          acc += segLen;
          if (acc > 38 && rng() < 0.75) {
            acc = 0;
            const t = rng();
            const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
            const nx = -(bz - az) / segLen, nz = (bx - ax) / segLen;
            const side = rng() > 0.5 ? 1 : -1;
            const tx = x + nx * (r.w / 2 + 1.6 + rng() * 2) * side;
            const tz = z + nz * (r.w / 2 + 1.6 + rng() * 2) * side;
            if (!this.blocked(tx, tz)) spots.push([tx, tz]);
          }
        }
        if (spots.length > 700) break;
      }
    }

    // procedurally fill parks with extra trees so they feel alive
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
    if (!spots.length) return;
    const cap = 1600;
    const trees = spots.length > cap ? spots.filter((_, i) => i % Math.ceil(spots.length / cap) === 0) : spots;

    const foliageColors = theme.treeFoliage.map((c) => new THREE.Color(c));

    if (theme.treeKind === "palm") {
      this.buildPalms(trees, foliageColors);
      return;
    }

    // deciduous / manicured: trunk + blob
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 2.4, 5);
    trunkGeo.translate(0, 1.2, 0);
    const blobGeo = theme.treeKind === "manicured"
      ? new THREE.ConeGeometry(1.6, 4.2, 7)
      : new THREE.IcosahedronGeometry(2.1, 1);

    const trunkMesh = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x5a4332 }), trees.length);
    const blobMesh = new THREE.InstancedMesh(blobGeo, new THREE.MeshLambertMaterial({ vertexColors: false, color: 0xffffff }), trees.length);
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
      const c = foliageColors[Math.floor(rng() * foliageColors.length)];
      blobMesh.setColorAt(idx, c);
    });
    trunkMesh.castShadow = true;
    blobMesh.castShadow = true;
    this.group.add(trunkMesh, blobMesh);
  }

  buildPalms(trees, foliageColors) {
    const { rng } = this;
    // trunk: tall thin slightly tapered
    const trunkGeo = new THREE.CylinderGeometry(0.12, 0.22, 5.2, 5);
    trunkGeo.translate(0, 2.6, 0);
    // fronds: 6 stretched, drooping boxes merged
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

  buildWindowGlow() {
    const { rng } = this;
    const samples = this.buildingSamples || [];
    if (!samples.length) return;
    const COUNT = Math.min(2400, samples.length * 6);
    const geo = new THREE.PlaneGeometry(1.3, 1.7);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffc97a, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, COUNT);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    let placed = 0, guard = 0;
    while (placed < COUNT && guard < COUNT * 4) {
      guard++;
      const b = samples[Math.floor(rng() * samples.length)];
      const pts = b.p;
      const ei = Math.floor(rng() * pts.length);
      const [ax, az] = pts[ei], [bx, bz] = pts[(ei + 1) % pts.length];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 4) continue;
      const t = 0.15 + rng() * 0.7;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      // wall normal (either side; push out & face out — wrong side is hidden in wall)
      let nx = -(bz - az) / len, nz = (bx - ax) / len;
      const floors = Math.max(1, Math.floor((b.h - 2) / 3.1));
      const y = 2 + Math.floor(rng() * floors) * 3.1;
      if (y > b.h - 1.2) continue;
      const out = new THREE.Vector3(nx, 0, nz);
      q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), out);
      m.compose(new THREE.Vector3(x + nx * 0.18, y, z + nz * 0.18), q, new THREE.Vector3(1, 1, 1));
      mesh.setMatrixAt(placed, m);
      placed++;
    }
    mesh.count = placed;
    this.group.add(mesh);
    // faint global flicker
    this.animated.push((t) => { mat.opacity = 0.78 + Math.sin(t * 1.7) * 0.07; });
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

  // shadow box follows the player so shadows stay crisp
  updateSun(target) {
    if (!this.sun) return;
    this.sun.position.copy(target).add(this.sunOffset);
    this.sun.target.position.copy(target);
  }

  buildBoundary() {
    // soft glowing ring at the world's edge
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
  // is (x,z) inside any building/water? used for collision + spawn finding
  blocked(x, z) {
    for (const { pts, bbox } of this.collisionPolys) {
      if (x < bbox.minX || x > bbox.maxX || z < bbox.minZ || z > bbox.maxZ) continue;
      if (pointInPoly(x, z, pts)) return true;
    }
    return false;
  }

  // like blocked(), but only counts polys taller than the given height
  // (used for camera collision — the camera can fly over low things)
  blockedAt(x, z, y) {
    for (const { pts, bbox, h } of this.collisionPolys) {
      if ((h ?? 999) < y) continue;
      if (x < bbox.minX || x > bbox.maxX || z < bbox.minZ || z > bbox.maxZ) continue;
      if (pointInPoly(x, z, pts)) return true;
    }
    return false;
  }

  // find nearest walkable spot to (x,z), spiraling outward
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

  tick(t, dt) {
    for (const fn of this.animated) fn(t, dt);
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material.dispose();
      }
    });
  }
}
