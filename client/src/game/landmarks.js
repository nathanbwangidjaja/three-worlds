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
        gl_PointSize = min((2.0 + vTwinkle * 5.0) * (300.0 / -mv.z), 22.0);
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
  // summit railing, for standing at the top together
  const railMat = new THREE.MeshLambertMaterial({ color: 0x3a2f22, emissive: 0x6a4a1e, emissiveIntensity: 0.4 });
  for (let f = 0; f < 4; f++) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.9, 0.12), railMat);
    rail.position.y = 278.35;
    rail.rotation.y = (f * Math.PI) / 2;
    const off = 4.55;
    rail.position.x = [0, off, 0, -off][f];
    rail.position.z = [off, 0, -off, 0][f];
    g.add(rail);
  }

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
        gl_PointSize = min((2.0 + vTwinkle * 5.0) * (300.0 / -mv.z), 22.0);
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

// The entrance of her cluster (Taman Beverly Golf, Lippo Village), modeled
// on the real gate: a white classical pavilion on a landscaped island in
// the middle of a divided driveway, curved white signature walls with
// script lettering, white pillars with finials, dark-green iron gates.
export function buildGatehouse(x, z, ry = 0) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = ry;
  const white = new THREE.MeshLambertMaterial({ color: 0xf4f0e6 });
  const terra = new THREE.MeshLambertMaterial({ color: 0x9c4a34 });
  const hedge = new THREE.MeshLambertMaterial({ color: 0x3e6b34 });
  const iron = new THREE.MeshLambertMaterial({ color: 0x274234 });

  // landscaped island under the pavilion
  const island = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.6, 0.45, 20), hedge);
  island.position.y = 0.22;
  group.add(island);
  const islandTrim = new THREE.Mesh(new THREE.CylinderGeometry(3.7, 3.7, 0.18, 20), white);
  islandTrim.position.y = 0.09;
  group.add(islandTrim);
  // bushes on the island
  for (let i = 0; i < 5; i++) {
    const bush = new THREE.Mesh(new THREE.SphereGeometry(0.5 + (i % 2) * 0.2, 7, 6), hedge);
    const a = (i / 5) * Math.PI * 2;
    bush.position.set(Math.cos(a) * 2.1, 0.7, Math.sin(a) * 2.1);
    group.add(bush);
  }

  // pavilion: four corner columns + entablature + hip roof + finial
  for (const cx of [-1.5, 1.5]) {
    for (const cz of [-1.1, 1.1]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.65, 3.6, 0.65), white);
      col.position.set(cx, 2.2, cz);
      col.castShadow = true;
      group.add(col);
      const colCap = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.22, 0.85), white);
      colCap.position.set(cx, 4.05, cz);
      group.add(colCap);
    }
  }
  const entablature = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.7, 3.4), white);
  entablature.position.y = 4.55;
  entablature.castShadow = true;
  group.add(entablature);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.1, 1.5, 4), terra);
  roof.position.y = 5.6;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  group.add(roof);
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), white);
  finial.position.y = 6.45;
  group.add(finial);

  // guard booth tucked inside the pavilion
  const booth = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.2, 1.4), white);
  booth.position.set(0, 1.1, -0.2);
  group.add(booth);

  // each side: iron gate to a finial pillar, then a curved signature wall
  const sigCanvas = (() => {
    const c = document.createElement("canvas");
    c.width = 512; c.height = 96;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#f4f0e6";
    ctx.fillRect(0, 0, 512, 96);
    ctx.fillStyle = "rgba(0,0,0,0.08)";
    ctx.fillRect(0, 84, 512, 12);
    ctx.font = "italic 600 44px Georgia, 'Times New Roman', serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#7a7468";
    ctx.fillText("Taman Beverly Golf", 256, 46);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  })();

  for (const side of [-1, 1]) {
    // dark green iron gate spanning island → pillar
    const gate = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.9, 0.1), iron);
    gate.position.set(side * 5.6, 1.0, 0.2);
    group.add(gate);
    // gate top rail + bars suggestion
    const rail = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.12, 0.14), iron);
    rail.position.set(side * 5.6, 2.05, 0.2);
    group.add(rail);

    // finial pillar
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.85, 2.7, 0.85), white);
    pillar.position.set(side * 8.1, 1.35, 0.2);
    pillar.castShadow = true;
    group.add(pillar);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), white);
    ball.position.set(side * 8.1, 2.95, 0.2);
    group.add(ball);

    // curved signature wall sweeping back (3 angled segments)
    let px = side * 8.55, pz = 0.4;
    let ang = side * 0.28;
    for (let s = 0; s < 3; s++) {
      const segLen = 4.2;
      const wall = new THREE.Mesh(new THREE.BoxGeometry(segLen, 1.5, 0.28), white);
      const mx = px + side * Math.cos(ang) * segLen * 0.5;
      const mz = pz + Math.sin(Math.abs(ang)) * segLen * 0.5;
      wall.position.set(mx, 0.75, mz);
      wall.rotation.y = -side * Math.abs(ang);
      wall.castShadow = true;
      group.add(wall);
      // script lettering on the middle segment
      if (s === 1) {
        const sign = new THREE.Mesh(
          new THREE.PlaneGeometry(3.9, 0.74),
          new THREE.MeshLambertMaterial({ map: sigCanvas })
        );
        sign.position.set(mx, 0.8, mz - 0.16);
        sign.rotation.y = -side * Math.abs(ang) + Math.PI;
        group.add(sign);
      }
      // wall cap
      const cap = new THREE.Mesh(new THREE.BoxGeometry(segLen, 0.12, 0.4), white);
      cap.position.set(mx, 1.55, mz);
      cap.rotation.y = -side * Math.abs(ang);
      group.add(cap);
      px += side * Math.cos(ang) * segLen;
      pz += Math.sin(Math.abs(ang)) * segLen;
      ang += side * 0.18;
    }
  }

  return { group, tick: () => {} };
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

// ----------------------------------------------------------- wayfinding
// A soft vertical light beam + bobbing emoji marker so you can spot the
// interesting things (the summit lift, a guide, the date car) from afar.
export function buildBeacon(x, z, emoji, color = 0xffd27a, h = 22) {
  const group = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 1.0, h, 10, 1, true),
    new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.16, side: THREE.DoubleSide,
      depthWrite: false, blending: THREE.AdditiveBlending,
    })
  );
  beam.position.y = h / 2;
  group.add(beam);

  const cv = document.createElement("canvas");
  cv.width = cv.height = 128;
  const ctx = cv.getContext("2d");
  ctx.font = "92px serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, 64, 72);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false,
  }));
  spr.scale.setScalar(2.4);
  spr.position.y = 4.0;
  group.add(spr);
  group.position.set(x, 0, z);
  const tick = (t) => {
    spr.position.y = 4.0 + Math.sin(t * 2.2) * 0.35;
    beam.material.opacity = 0.13 + (Math.sin(t * 2.8) + 1) * 0.035;
  };
  return { group, tick };
}

// The summit lift: a little golden cage at the tower leg you can actually see
export function buildLiftKiosk(x, z, ry = 0) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = ry;
  const gold = new THREE.MeshLambertMaterial({ color: 0x8a6a30, emissive: 0x6a4a14, emissiveIntensity: 0.5 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2a2118 });

  for (const px of [-1.1, 1.1]) {
    for (const pz of [-1.1, 1.1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.2, 0.16), gold);
      post.position.set(px, 1.6, pz);
      group.add(post);
    }
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.14, 2.7), gold);
  roof.position.y = 3.25;
  group.add(roof);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.1, 2.5), dark);
  floor.position.y = 0.05;
  group.add(floor);
  // lattice side rails
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.0, 2.3), gold);
    rail.position.set(side * 1.1, 0.6, 0);
    group.add(rail);
  }

  // glowing sign
  const cv = document.createElement("canvas");
  cv.width = 512; cv.height = 96;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#241c10";
  ctx.fillRect(0, 0, 512, 96);
  ctx.strokeStyle = "#caa64e";
  ctx.lineWidth = 5;
  ctx.strokeRect(6, 6, 500, 84);
  ctx.fillStyle = "#ffe9b0";
  ctx.font = "bold 52px Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("ASCENSEUR · SOMMET", 256, 50);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 0.64),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), side: THREE.DoubleSide })
  );
  sign.position.set(0, 3.7, 0);
  group.add(sign);

  const lamp = new THREE.PointLight(0xffd9a0, 6, 9, 1.9);
  lamp.position.set(0, 2.6, 0);
  group.add(lamp);
  const tick = (t) => { lamp.intensity = 5.4 + Math.sin(t * 3.4) * 0.8; };
  return { group, tick };
}

// ------------------------------------------------- SPH Lippo Village
// Hand-built from the campus photos: brick clock tower, white-lattice
// pavilion, circular front lawn with curved steps, navy column banners.
export function buildSphFront(x, z, ry = 0) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = ry;
  const brick = new THREE.MeshLambertMaterial({ color: 0x9a4a34 });
  const white = new THREE.MeshLambertMaterial({ color: 0xf0ece2 });
  const terra = new THREE.MeshLambertMaterial({ color: 0x8a3c2c });
  const hedge = new THREE.MeshLambertMaterial({ color: 0x3a6234 });

  // circular lawn + curved steps
  const lawn = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 0.16, 28), new THREE.MeshLambertMaterial({ color: 0x4a7a3c }));
  lawn.position.set(0, 0.08, 8);
  group.add(lawn);
  for (let s = 0; s < 3; s++) {
    const step = new THREE.Mesh(new THREE.CylinderGeometry(12.5 + s, 12.5 + s, 0.1, 28, 1, false, Math.PI * 0.8, Math.PI * 0.55), new THREE.MeshLambertMaterial({ color: 0x8a857a }));
    step.position.set(0, 0.05 + (2 - s) * 0.1, 8);
    group.add(step);
  }

  // the clock tower
  const tower = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(3.4, 13, 3.4), brick);
  shaft.position.y = 6.5;
  shaft.castShadow = true;
  tower.add(shaft);
  const beltC = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.5, 3.8), white);
  beltC.position.y = 10.6;
  tower.add(beltC);
  const head = new THREE.Mesh(new THREE.BoxGeometry(4.0, 2.6, 4.0), white);
  head.position.y = 12.6;
  tower.add(head);
  // clock faces
  const cv = document.createElement("canvas");
  cv.width = cv.height = 128;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#f8f6ee"; ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = "#2a2620"; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(64, 64, 52, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(64, 64); ctx.lineTo(64, 26); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(64, 64); ctx.lineTo(92, 76); ctx.stroke();
  const clockTex = new THREE.CanvasTexture(cv);
  for (let f = 0; f < 4; f++) {
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.9), new THREE.MeshLambertMaterial({ map: clockTex }));
    face.position.set(f === 0 ? 0 : f === 2 ? 0 : f === 1 ? 2.01 : -2.01, 12.6, f === 0 ? 2.01 : f === 2 ? -2.01 : 0);
    face.rotation.y = f === 0 ? 0 : f === 1 ? Math.PI / 2 : f === 2 ? Math.PI : -Math.PI / 2;
    tower.add(face);
  }
  const cap = new THREE.Mesh(new THREE.ConeGeometry(3.2, 2.4, 4), terra);
  cap.position.y = 15.2;
  cap.rotation.y = Math.PI / 4;
  tower.add(cap);
  const finial = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.4, 5), white);
  finial.position.y = 16.8;
  tower.add(finial);
  tower.position.set(6.5, 0, 22);
  group.add(tower);

  // white-lattice pavilion with pyramid roof
  const pav = new THREE.Group();
  const latTex = (() => {
    const c2 = document.createElement("canvas");
    c2.width = c2.height = 64;
    const x2 = c2.getContext("2d");
    x2.fillStyle = "rgba(0,0,0,0)"; x2.clearRect(0, 0, 64, 64);
    x2.strokeStyle = "#f2efe6"; x2.lineWidth = 5;
    for (let i = -64; i < 128; i += 16) {
      x2.beginPath(); x2.moveTo(i, 0); x2.lineTo(i + 64, 64); x2.stroke();
      x2.beginPath(); x2.moveTo(i + 64, 0); x2.lineTo(i, 64); x2.stroke();
    }
    const t = new THREE.CanvasTexture(c2);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(3, 1.6);
    return t;
  })();
  for (let i = 0; i < 4; i++) {
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(7, 4.2),
      new THREE.MeshLambertMaterial({ map: latTex, transparent: true, side: THREE.DoubleSide, alphaTest: 0.3 })
    );
    wall.position.y = 2.6;
    if (i % 2 === 0) { wall.position.z = (i === 0 ? 3.5 : -3.5); }
    else { wall.position.x = (i === 1 ? 3.5 : -3.5); wall.rotation.y = Math.PI / 2; }
    pav.add(wall);
  }
  for (const [px, pz] of [[-3.5, -3.5], [3.5, -3.5], [-3.5, 3.5], [3.5, 3.5]]) {
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.8, 0.5), brick);
    col.position.set(px, 2.4, pz);
    pav.add(col);
  }
  const pavRoof = new THREE.Mesh(new THREE.ConeGeometry(6, 2.8, 4), terra);
  pavRoof.position.y = 6.1;
  pavRoof.rotation.y = Math.PI / 4;
  pavRoof.castShadow = true;
  pav.add(pavRoof);
  pav.position.set(-3, 0, 24);
  group.add(pav);

  // navy "years of excellence" banners on brick columns
  const bcv = document.createElement("canvas");
  bcv.width = 48; bcv.height = 192;
  const bctx = bcv.getContext("2d");
  bctx.fillStyle = "#16305e"; bctx.fillRect(0, 0, 48, 192);
  bctx.fillStyle = "#e8d8a0"; bctx.font = "bold 17px Georgia";
  bctx.save(); bctx.translate(24, 96); bctx.rotate(-Math.PI / 2);
  bctx.textAlign = "center"; bctx.fillText("EXCELLENCE", 0, 6); bctx.restore();
  const bTex = new THREE.CanvasTexture(bcv);
  for (const bx of [-9, -4.5, 4.5, 9]) {
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.7, 6.2, 0.7), brick);
    col.position.set(bx, 3.1, 17.5);
    group.add(col);
    const ban = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 3.4), new THREE.MeshLambertMaterial({ map: bTex, side: THREE.DoubleSide }));
    ban.position.set(bx, 3.4, 17.0);
    ban.rotation.y = Math.PI; // face the lawn — the backside reads mirrored
    group.add(ban);
  }
  // hedge balls around the lawn
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.65, 8, 6), hedge);
    ball.position.set(Math.cos(a) * 12.6, 0.5, 8 + Math.sin(a) * 12.6);
    group.add(ball);
  }
  return { group };
}

// pool, tennis courts, sports field, playground gazebo — from the aerial
export function buildSphGrounds() {
  const group = new THREE.Group();
  const line = new THREE.MeshLambertMaterial({ color: 0xf2f2ea });

  const courtAt = (x, z, w, d, color, ry = 0) => {
    const g = new THREE.Group();
    const slab = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ color }));
    slab.rotation.x = -Math.PI / 2;
    slab.position.y = 0.06;
    g.add(slab);
    const border = new THREE.Mesh(new THREE.PlaneGeometry(w - 1.4, d - 1.4));
    border.material = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    group.add(g);
    return g;
  };

  // lap pool with lanes + deck
  const pool = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(34, 20), new THREE.MeshLambertMaterial({ color: 0xcabfa8 }));
  deck.rotation.x = -Math.PI / 2;
  deck.position.y = 0.05;
  pool.add(deck);
  const cvp = document.createElement("canvas");
  cvp.width = 256; cvp.height = 128;
  const pctx = cvp.getContext("2d");
  pctx.fillStyle = "#2f86b8"; pctx.fillRect(0, 0, 256, 128);
  pctx.strokeStyle = "#cfe8f4"; pctx.lineWidth = 3;
  for (let l = 1; l < 8; l++) { pctx.beginPath(); pctx.moveTo(0, l * 16); pctx.lineTo(256, l * 16); pctx.stroke(); }
  const water = new THREE.Mesh(new THREE.PlaneGeometry(25, 12), new THREE.MeshLambertMaterial({ map: new THREE.CanvasTexture(cvp) }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.09;
  pool.add(water);
  pool.position.set(140, 0, 38);
  group.add(pool);

  // two tennis courts + one basketball court
  const tennis1 = courtAt(96, 24, 12, 24, 0x3a7a52);
  const inner1 = new THREE.Mesh(new THREE.PlaneGeometry(9, 19), new THREE.MeshLambertMaterial({ color: 0x2f6ea8 }));
  inner1.rotation.x = -Math.PI / 2; inner1.position.y = 0.08;
  tennis1.add(inner1);
  const tennis2 = courtAt(112, 24, 12, 24, 0x3a7a52);
  const inner2 = inner1.clone();
  tennis2.add(inner2);
  for (const t of [tennis1, tennis2]) {
    const net = new THREE.Mesh(new THREE.PlaneGeometry(10, 0.85), new THREE.MeshLambertMaterial({ color: 0x222428, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
    net.position.y = 0.55;
    t.add(net);
  }
  courtAt(96, -6, 16, 26, 0x9a5e46); // basketball: clay-red slab

  // sports field with goals
  const field = new THREE.Group();
  const turf = new THREE.Mesh(new THREE.PlaneGeometry(85, 55), new THREE.MeshLambertMaterial({ color: 0x3f7036 }));
  turf.rotation.x = -Math.PI / 2;
  turf.position.y = 0.04;
  field.add(turf);
  const ring = new THREE.Mesh(new THREE.RingGeometry(8, 8.5, 24), line);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.07;
  field.add(ring);
  for (const side of [-1, 1]) {
    const goal = new THREE.Group();
    const barMat = new THREE.MeshLambertMaterial({ color: 0xf2f2ea });
    const cross = new THREE.Mesh(new THREE.BoxGeometry(7.3, 0.12, 0.12), barMat);
    cross.position.y = 2.4;
    goal.add(cross);
    for (const px of [-3.66, 3.66]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.4, 0.12), barMat);
      post.position.set(px, 1.2, 0);
      goal.add(post);
    }
    goal.position.set(side * 39, 0, 0);
    goal.rotation.y = Math.PI / 2;
    field.add(goal);
    const lineMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 55), line);
    lineMesh.rotation.x = -Math.PI / 2;
    lineMesh.position.set(side * 38, 0.07, 0);
    field.add(lineMesh);
  }
  field.position.set(215, 0, -20);
  group.add(field);

  // playground + wooden gazebo by the pond
  const gz = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  for (const [gx, gzp] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.4, 0.18), wood);
    post.position.set(gx, 1.2, gzp);
    gz.add(post);
  }
  const groof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.3, 4), new THREE.MeshLambertMaterial({ color: 0x8a3c2c }));
  groof.position.y = 3.0;
  groof.rotation.y = Math.PI / 4;
  gz.add(groof);
  const bench = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.4, 2.2), wood);
  bench.position.y = 0.45;
  gz.add(bench);
  gz.position.set(30, 0, 52);
  group.add(gz);
  // blue playground bits
  for (const [px, pz, h] of [[22, 48, 1.4], [24.5, 51, 1.0], [19.5, 51.5, 1.8]]) {
    const play = new THREE.Mesh(new THREE.BoxGeometry(1.1, h, 1.1), new THREE.MeshLambertMaterial({ color: 0x2f6ea8 }));
    play.position.set(px, h / 2, pz);
    group.add(play);
  }
  // pond
  const pond = new THREE.Mesh(new THREE.CircleGeometry(9, 20), new THREE.MeshLambertMaterial({ color: 0x35606e }));
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(36, 0.06, 32);
  group.add(pond);

  return { group };
}

// the big CARS LAND forecourt: open asphalt lot, painted bays, white posts
export function buildCarPark(w = 90, d = 64) {
  const group = new THREE.Group();
  const lot = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ color: 0x6e6a66 }));
  lot.rotation.x = -Math.PI / 2;
  lot.position.y = 0.05;
  lot.receiveShadow = true;
  group.add(lot);
  const lineMat = new THREE.MeshLambertMaterial({ color: 0xd8d8d0 });
  for (const rowZ of [-d / 4, d / 4]) {
    for (let x = -w / 2 + 6; x < w / 2 - 4; x += 2.9) {
      const bay = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 5.2), lineMat);
      bay.rotation.x = -Math.PI / 2;
      bay.position.set(x, 0.07, rowZ);
      group.add(bay);
    }
  }
  // white perimeter posts with a single rail, like the Street View
  const postMat = new THREE.MeshLambertMaterial({ color: 0xeceae2 });
  const mkPost = (x, z) => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.9, 0.16), postMat);
    p.position.set(x, 0.45, z);
    group.add(p);
  };
  for (let x = -w / 2; x <= w / 2; x += 4.5) { mkPost(x, -d / 2); mkPost(x, d / 2); }
  for (let z = -d / 2; z <= d / 2; z += 4.5) { mkPost(-w / 2, z); mkPost(w / 2, z); }
  for (const [rw, rx, rz, ry] of [[w, 0, -d / 2, 0], [w, 0, d / 2, 0], [d, -w / 2, 0, Math.PI / 2], [d, w / 2, 0, Math.PI / 2]]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(rw, 0.08, 0.08), postMat);
    rail.position.set(rx, 0.78, rz);
    rail.rotation.y = ry;
    group.add(rail);
  }
  return { group };
}
