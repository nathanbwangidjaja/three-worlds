// Hand-built landmarks: the Eiffel Tower, home heart markers,
// travel portals, the Champ de Mars bench & picnic.
import * as THREE from "three";
import { latticeTexture } from "./textures.js";

// box beam between two points
function beam(a, b, thick, material) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const geo = new THREE.BoxGeometry(thick, len, thick);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return mesh;
}

// Just the magic — golden twinkle particles + rotating beacon + warm
// uplights, sized to the real tower. Used in photoreal mode where the
// tower itself is real photogrammetry.
export function buildTowerSparkles({ height = 320, baseHalf = 32 } = {}) {
  const g = new THREE.Group();

  const glow = new THREE.PointLight(0xffb24a, 5200, 600, 1.7);
  glow.position.set(0, height * 0.28, 0);
  g.add(glow);
  const glowTop = new THREE.PointLight(0xffd9a0, 1500, 280, 1.7);
  glowTop.position.set(0, height * 0.8, 0);
  g.add(glowTop);

  const beaconPivot = new THREE.Group();
  beaconPivot.position.y = height * 0.95;
  const beamMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.4, 7, 220, 10, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xfff2cc, transparent: true, opacity: 0.16,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
    })
  );
  beamMesh.rotation.z = Math.PI / 2 - 0.06;
  beamMesh.position.x = 110;
  beaconPivot.add(beamMesh);
  g.add(beaconPivot);

  const N = 480;
  const pos = new Float32Array(N * 3);
  const seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const t = Math.random();
    const y = t * height;
    const k = 1 - y / height;
    const half = 2.5 + baseHalf * Math.pow(k, 1.6);
    pos[i * 3] = (Math.random() * 2 - 1) * half;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = (Math.random() * 2 - 1) * half;
    seed[i] = Math.random() * Math.PI * 2;
  }
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  sparkGeo.setAttribute("seed", new THREE.BufferAttribute(seed, 1));
  const sparkMat = makeSparkleMaterial();
  g.add(new THREE.Points(sparkGeo, sparkMat));

  const tick = (t) => {
    sparkMat.uniforms.time.value = t;
    beaconPivot.rotation.y = t * 0.5;
  };
  const setSparkleBoost = (v) => { sparkMat.uniforms.boost.value = v; };
  return { group: g, tick, setSparkleBoost };
}

function makeSparkleMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { time: { value: 0 }, boost: { value: 0.45 } },
    vertexShader: `
      attribute float seed; uniform float time; varying float vTwinkle;
      void main() {
        vTwinkle = max(0.0, sin(time * 6.0 + seed * 13.7));
        vTwinkle = pow(vTwinkle, 6.0);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = (2.0 + vTwinkle * 5.0) * (300.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying float vTwinkle; uniform float boost;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float a = (1.0 - d * 2.0) * (0.12 + vTwinkle) * boost;
        gl_FragColor = vec4(1.0, 0.92, 0.6, a);
      }`,
  });
}

export function buildEiffelTower() {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x6a543c, emissive: 0x8a5a1e, emissiveIntensity: 0.7 });

  const lvl = [
    { y: 0, half: 31 },     // ground
    { y: 57, half: 16 },    // 1st platform
    { y: 115, half: 9 },    // 2nd platform
    { y: 200, half: 4.5 },  // mid spire
    { y: 276, half: 2.6 },  // top platform
  ];

  // 4 corner legs through each stage
  const corners = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (const [cx, cz] of corners) {
    for (let s = 0; s < lvl.length - 1; s++) {
      const a = new THREE.Vector3(cx * lvl[s].half, lvl[s].y, cz * lvl[s].half);
      const b = new THREE.Vector3(cx * lvl[s + 1].half, lvl[s + 1].y, cz * lvl[s + 1].half);
      const thick = s === 0 ? 3.4 : s === 1 ? 2.4 : s === 2 ? 1.6 : 1.1;
      g.add(beam(a, b, thick, mat));
    }
  }

  // lattice X-braces on each face of the lower two stages
  for (let s = 0; s < 2; s++) {
    const h0 = lvl[s], h1 = lvl[s + 1];
    for (let f = 0; f < 4; f++) {
      // face corners (pairs of adjacent legs)
      const pick = [
        [[1, 1], [1, -1]], [[1, -1], [-1, -1]], [[-1, -1], [-1, 1]], [[-1, 1], [1, 1]],
      ][f];
      const [c1, c2] = pick;
      const a0 = new THREE.Vector3(c1[0] * h0.half, h0.y, c1[1] * h0.half);
      const b0 = new THREE.Vector3(c2[0] * h0.half, h0.y, c2[1] * h0.half);
      const a1 = new THREE.Vector3(c1[0] * h1.half, h1.y, c1[1] * h1.half);
      const b1 = new THREE.Vector3(c2[0] * h1.half, h1.y, c2[1] * h1.half);
      const t = s === 0 ? 1.0 : 0.7;
      g.add(beam(a0, b1, t, mat));
      g.add(beam(b0, a1, t, mat));
    }
  }

  // the grand ground arches (rings between adjacent legs)
  const archMat = mat;
  for (let f = 0; f < 4; f++) {
    const torus = new THREE.TorusGeometry(22, 1.3, 6, 24, Math.PI);
    const arch = new THREE.Mesh(torus, archMat);
    arch.position.y = 12;
    if (f % 2 === 0) { arch.position.x = (f === 0 ? 1 : -1) * 0; arch.position.z = (f === 0 ? 31 : -31) * 0.0; }
    arch.rotation.y = (f * Math.PI) / 2;
    const off = 26;
    const dirs = [[0, off], [off, 0], [0, -off], [-off, 0]];
    arch.position.set(dirs[f][0], 14, dirs[f][1]);
    g.add(arch);
  }

  // lattice skin: X-braced truss texture with transparent gaps on each face
  // of every stage — this is what makes it read as real ironwork
  const latTex = latticeTexture({ color: "#5a4632", thickness: 8 });
  const latMat = new THREE.MeshLambertMaterial({
    map: latTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide,
    emissive: 0x8a5a1e, emissiveIntensity: 0.55,
  });
  for (let s = 0; s < lvl.length - 1; s++) {
    const h0 = lvl[s], h1 = lvl[s + 1];
    for (let f = 0; f < 4; f++) {
      // trapezoid between the two stage widths, one per face
      const tg = new THREE.BufferGeometry();
      const w0 = h0.half, w1 = h1.half;
      const pos = new Float32Array([
        -w0, h0.y, w0, w0, h0.y, w0, w1, h1.y, w1, -w1, h1.y, w1,
      ]);
      const reps0 = Math.max(1, Math.round((w0 * 2) / 9));
      const repsV = Math.max(1, Math.round((h1.y - h0.y) / 9));
      const uv = new Float32Array([0, 0, reps0, 0, reps0, repsV, 0, repsV]);
      tg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      tg.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      tg.setIndex([0, 1, 2, 0, 2, 3]);
      tg.computeVertexNormals();
      const face = new THREE.Mesh(tg, latMat);
      face.rotation.y = (f * Math.PI) / 2;
      g.add(face);
    }
  }

  // platforms
  const platMat = new THREE.MeshLambertMaterial({ color: 0x4a3c2e, emissive: 0x221808, emissiveIntensity: 0.5 });
  const p1 = new THREE.Mesh(new THREE.BoxGeometry(38, 3.4, 38), platMat); p1.position.y = 57;
  const p2 = new THREE.Mesh(new THREE.BoxGeometry(22, 2.8, 22), platMat); p2.position.y = 115;
  const p3 = new THREE.Mesh(new THREE.BoxGeometry(9, 3, 9), platMat); p3.position.y = 276;
  g.add(p1, p2, p3);

  // antenna
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.8, 28, 6), mat);
  ant.position.y = 292;
  g.add(ant);

  // warm uplights
  const glow = new THREE.PointLight(0xffb24a, 5200, 600, 1.7);
  glow.position.set(0, 85, 0);
  g.add(glow);
  const glowTop = new THREE.PointLight(0xffd9a0, 1500, 280, 1.7);
  glowTop.position.set(0, 250, 0);
  g.add(glowTop);
  const glowBase = new THREE.PointLight(0xffc97a, 900, 160, 1.6);
  glowBase.position.set(0, 14, 0);
  g.add(glowBase);

  // rotating beacon at the summit
  const beaconPivot = new THREE.Group();
  beaconPivot.position.y = 300;
  const beamGeo = new THREE.CylinderGeometry(0.4, 7, 220, 10, 1, true);
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xfff2cc, transparent: true, opacity: 0.16,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const beamMesh = new THREE.Mesh(beamGeo, beamMat);
  beamMesh.rotation.z = Math.PI / 2 - 0.06; // near-horizontal
  beamMesh.position.x = 110;
  beaconPivot.add(beamMesh);
  g.add(beaconPivot);

  // golden sparkle particles (the on-the-hour twinkle, but it's always our hour)
  const N = 420;
  const pos = new Float32Array(N * 3);
  const seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const t = Math.random();
    const y = t * 300;
    // interpolate tower half-width at this height
    let half = 31;
    if (y < 57) half = 31 - (y / 57) * 15;
    else if (y < 115) half = 16 - ((y - 57) / 58) * 7;
    else if (y < 276) half = 9 - ((y - 115) / 161) * 6.4;
    else half = 2.6;
    pos[i * 3] = (Math.random() * 2 - 1) * half;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = (Math.random() * 2 - 1) * half;
    seed[i] = Math.random() * Math.PI * 2;
  }
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  sparkGeo.setAttribute("seed", new THREE.BufferAttribute(seed, 1));
  const sparkMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { time: { value: 0 }, boost: { value: 0.45 } },
    vertexShader: `
      attribute float seed; uniform float time; varying float vTwinkle;
      void main() {
        vTwinkle = max(0.0, sin(time * 6.0 + seed * 13.7));
        vTwinkle = pow(vTwinkle, 6.0);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = (2.0 + vTwinkle * 5.0) * (300.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying float vTwinkle; uniform float boost;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float a = (1.0 - d * 2.0) * (0.12 + vTwinkle) * boost;
        gl_FragColor = vec4(1.0, 0.92, 0.6, a);
      }`,
  });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  g.add(sparks);

  const tick = (t) => {
    sparkMat.uniforms.time.value = t;
    beaconPivot.rotation.y = t * 0.5;
  };
  // boost goes to 1 when the couple is together at the tower
  const setSparkleBoost = (v) => { sparkMat.uniforms.boost.value = v; };

  return { group: g, tick, setSparkleBoost };
}

// ---------------------------------------------------------------- markers
function makeTextSprite(text, { font = "600 26px 'Avenir Next', system-ui", color = "#fff4ea", pad = 14, scale = 0.02 } = {}) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
  const h = 46 + pad;
  canvas.width = w * 2; canvas.height = h * 2;
  const c2 = canvas.getContext("2d");
  c2.scale(2, 2);
  c2.font = font;
  c2.fillStyle = "rgba(15,8,18,0.62)";
  c2.beginPath();
  c2.roundRect(0, 0, w, h, 14);
  c2.fill();
  c2.fillStyle = color;
  c2.textAlign = "center"; c2.textBaseline = "middle";
  c2.fillText(text, w / 2, h / 2 + 1);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  sprite.scale.set(w * scale, h * scale, 1);
  return sprite;
}

function heartGeometry(size = 1) {
  // classic heart curve (from the three.js Shape docs), scaled to `size`
  const s = new THREE.Shape();
  const k = size / 16;
  s.moveTo(5 * k, 5 * k);
  s.bezierCurveTo(5 * k, 5 * k, 4 * k, 0, 0, 0);
  s.bezierCurveTo(-6 * k, 0, -6 * k, 7 * k, -6 * k, 7 * k);
  s.bezierCurveTo(-6 * k, 11 * k, -3 * k, 15.4 * k, 5 * k, 19 * k);
  s.bezierCurveTo(12 * k, 15.4 * k, 16 * k, 11 * k, 16 * k, 7 * k);
  s.bezierCurveTo(16 * k, 7 * k, 16 * k, 0, 10 * k, 0);
  s.bezierCurveTo(7 * k, 0, 5 * k, 5 * k, 5 * k, 5 * k);
  const g = new THREE.ExtrudeGeometry(s, {
    depth: 4 * k, bevelEnabled: true, bevelSize: k, bevelThickness: k, bevelSegments: 2,
  });
  g.center();
  g.rotateZ(Math.PI); // the docs heart points down — flip it
  return g;
}

export function buildHomeMarker(x, z, label) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  const heart = new THREE.Mesh(
    heartGeometry(0.8),
    new THREE.MeshStandardMaterial({ color: 0xff4d88, emissive: 0xff2d6e, emissiveIntensity: 0.9, roughness: 0.3 })
  );
  heart.position.y = 3.4;
  group.add(heart);

  const light = new THREE.PointLight(0xff5d92, 60, 26, 2);
  light.position.y = 3.2;
  group.add(light);

  const ringGeo = new THREE.TorusGeometry(2.2, 0.08, 6, 40);
  ringGeo.rotateX(Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xff8db4, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.y = 0.3;
  group.add(ring);

  const sprite = makeTextSprite(label);
  sprite.position.y = 5.6;
  group.add(sprite);

  const tick = (t) => {
    heart.position.y = 3.4 + Math.sin(t * 1.6) * 0.25;
    heart.rotation.y = t * 0.8;
    const pulse = 1 + Math.sin(t * 2.4) * 0.12;
    ring.scale.set(pulse, 1, pulse);
  };
  return { group, tick };
}

export function buildPortal(x, z, label, color = 0x7bdcff) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  const ringGeo = new THREE.TorusGeometry(2.4, 0.18, 10, 48);
  const ringMat = new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: 1.4, roughness: 0.3, metalness: 0.2,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.y = 3.0;
  group.add(ring);

  const diskGeo = new THREE.CircleGeometry(2.2, 32);
  const diskMat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.25, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const disk = new THREE.Mesh(diskGeo, diskMat);
  disk.position.y = 3.0;
  group.add(disk);

  const baseGeo = new THREE.CylinderGeometry(2.9, 3.3, 0.4, 24);
  const base = new THREE.Mesh(baseGeo, new THREE.MeshLambertMaterial({ color: 0x3a3448 }));
  base.position.y = 0.2;
  group.add(base);

  const light = new THREE.PointLight(color, 50, 24, 2);
  light.position.y = 3.2;
  group.add(light);

  const sprite = makeTextSprite(label);
  sprite.position.y = 6.3;
  group.add(sprite);

  const tick = (t) => {
    ring.rotation.y = t * 0.6;
    disk.rotation.z = -t * 0.4;
    diskMat.opacity = 0.18 + Math.sin(t * 2.2) * 0.1;
  };
  return { group, tick };
}

export function buildBench(x, z, ry = 0) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = ry;
  const wood = new THREE.MeshLambertMaterial({ color: 0x6e4f33 });
  const iron = new THREE.MeshLambertMaterial({ color: 0x2c2c30 });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 0.65), wood);
  seat.position.y = 0.55;
  const back = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.7, 0.09), wood);
  back.position.set(0, 1.05, -0.3);
  back.rotation.x = -0.16;
  group.add(seat, back);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.55, 0.6), iron);
    leg.position.set(sx * 1.05, 0.27, 0);
    group.add(leg);
  }
  return { group, tick: () => {} };
}

export function buildPicnic(x, z) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  // checkered blanket via canvas
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d");
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
    ctx.fillStyle = (i + j) % 2 ? "#d8485f" : "#f3e9d8";
    ctx.fillRect(i * 16, j * 16, 16, 16);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const blanket = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 2.6),
    new THREE.MeshLambertMaterial({ map: tex })
  );
  blanket.rotation.x = -Math.PI / 2;
  blanket.rotation.z = 0.3;
  blanket.position.y = 0.26;
  group.add(blanket);

  const basket = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.22, 0.3, 8),
    new THREE.MeshLambertMaterial({ color: 0x9a6f3f })
  );
  basket.position.set(0.6, 0.4, -0.5);
  group.add(basket);

  // two little wine glasses (cones)
  for (const [gx, gz] of [[-0.3, 0.2], [0.1, 0.45]]) {
    const glass = new THREE.Mesh(
      new THREE.ConeGeometry(0.07, 0.18, 8),
      new THREE.MeshStandardMaterial({ color: 0xd8485f, roughness: 0.1, transparent: true, opacity: 0.85 })
    );
    glass.rotation.x = Math.PI;
    glass.position.set(gx, 0.4, gz);
    group.add(glass);
  }

  // candle glow
  const candle = new THREE.PointLight(0xffc46a, 6, 7, 2);
  candle.position.set(0, 0.8, 0);
  group.add(candle);

  const tick = (t) => { candle.intensity = 5.4 + Math.sin(t * 9.3) * 0.9 + Math.sin(t * 23.7) * 0.4; };
  return { group, tick };
}
