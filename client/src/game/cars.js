// Real-world cars, recognizable at game scale. Each model is built from
// shaped boxes/cylinders with baked vertex colors and merged into two
// geometries: PAINT (white, tinted per instance) and TRIM (glass, tires,
// chrome, lights — fixed colors). Parked fleets render as two
// InstancedMeshes per model; any car can be "woken up" into a drivable
// Group with spinning wheels and glowing headlights.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// shared trim colors
const GLASS = 0x161d26;
const TIRE = 0x121316;
const HUB = 0x9da2aa;
const DARK = 0x0c0d0f;
const CHROME = 0xd2d6dc;
const HEAD = 0xfff3d4;
const TAIL = 0x8e1518;
const AMBER = 0xd97a1e;
const SEAT = 0x6b5238;
const CABIN = 0x221e1a;

function colorize(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return geo;
}

// box whose top face can shrink (tx/tz) and shift (sx/sz) — hoods, cabins,
// fastbacks all fall out of this one shape
function prism(w, h, d, { tx = 1, tz = 1, sx = 0, sz = 0 } = {}) {
  const g = new THREE.BoxGeometry(w, h, d);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > 0) {
      pos.setX(i, pos.getX(i) * tx + sx);
      pos.setZ(i, pos.getZ(i) * tz + sz);
    }
  }
  g.computeVertexNormals();
  return g;
}

function cylZ(r, w, seg = 12) { // axle along Z (headlight discs)
  return new THREE.CylinderGeometry(r, r, w, seg).rotateX(Math.PI / 2);
}

function wheelGeo(r, w) { // axle along X
  return mergeGeometries([
    colorize(new THREE.CylinderGeometry(r, r, w, 14).rotateZ(Math.PI / 2), TIRE),
    colorize(new THREE.CylinderGeometry(r * 0.55, r * 0.55, w + 0.04, 10).rotateZ(Math.PI / 2), HUB),
  ], false);
}

// each builder fills paint[] / trim[] / lights[] with positioned geometries.
// axes: +z nose, y up, ground y=0.
const BUILDERS = {
  // ---- Range Rover Sport: boxy slab, floating black roof, upright face
  rangerover: (P, T, L) => {
    P(prism(1.96, 0.8, 4.85, { tx: 0.96 }), 0, 0.73, 0);
    T(prism(1.82, 0.62, 2.95, { tx: 0.86, tz: 0.9, sz: -0.06 }), 0, 1.44, -0.34, GLASS);
    T(new THREE.BoxGeometry(1.66, 0.07, 2.78), 0, 1.78, -0.36, DARK); // floating roof
    T(new THREE.BoxGeometry(1.3, 0.3, 0.08), 0, 1.0, 2.44, DARK);    // grille
    T(new THREE.BoxGeometry(1.96, 0.32, 0.14), 0, 0.42, 2.42, DARK); // bumpers
    T(new THREE.BoxGeometry(1.96, 0.32, 0.14), 0, 0.42, -2.42, DARK);
    T(new THREE.BoxGeometry(1.9, 0.1, 4.4), 0, 0.34, 0, DARK);       // rocker shadow
    L(new THREE.BoxGeometry(0.44, 0.12, 0.06), -0.68, 1.06, 2.46, HEAD);
    L(new THREE.BoxGeometry(0.44, 0.12, 0.06), 0.68, 1.06, 2.46, HEAD);
    L(new THREE.BoxGeometry(0.5, 0.12, 0.06), -0.66, 1.06, -2.45, TAIL);
    L(new THREE.BoxGeometry(0.5, 0.12, 0.06), 0.66, 1.06, -2.45, TAIL);
    return { wheels: [{ r: 0.42, w: 0.34, x: 0.84, z: 1.52 }], dims: [2.0, 4.95], name: "Range Rover",
      paints: [0xf2f3f0, 0x16181b, 0x83878c, 0x2e3a45], seatY: 1.0 };
  },

  // ---- Lexus LC500 convertible: long sloped nose, open cockpit, wide hips
  lc500: (P, T, L) => {
    P(prism(1.9, 0.52, 4.7, { tx: 0.94 }), 0, 0.52, 0);
    P(prism(1.78, 0.24, 1.95, { tx: 0.84, tz: 0.82, sz: 0.22 }), 0, 0.9, 1.32);  // hood
    P(prism(1.84, 0.26, 1.35, { tx: 0.9, tz: 0.78, sz: -0.16 }), 0, 0.91, -1.62); // rear deck
    T(prism(1.6, 0.36, 0.5, { tx: 0.84, sz: -0.3 }), 0, 0.96, 0.42, GLASS);      // windshield
    T(new THREE.BoxGeometry(1.5, 0.22, 1.6), 0, 0.84, -0.5, CABIN);              // cockpit tub
    T(new THREE.BoxGeometry(0.46, 0.34, 0.5), -0.4, 0.95, -0.78, SEAT);          // seats
    T(new THREE.BoxGeometry(0.46, 0.34, 0.5), 0.4, 0.95, -0.78, SEAT);
    T(prism(1.0, 0.5, 0.12, { tx: 0.72 }), 0, 0.5, 2.32, DARK);                  // spindle grille
    L(new THREE.BoxGeometry(0.36, 0.08, 0.06), -0.7, 0.74, 2.32, HEAD);
    L(new THREE.BoxGeometry(0.36, 0.08, 0.06), 0.7, 0.74, 2.32, HEAD);
    L(new THREE.BoxGeometry(1.5, 0.07, 0.05), 0, 0.88, -2.33, TAIL);
    return { wheels: [{ r: 0.36, w: 0.3, x: 0.82, z: 1.45 }], dims: [1.92, 4.77], name: "Lexus LC500",
      paints: [0xb4673f, 0xa31621, 0xe8e6e0, 0x1a1c1e], openTop: true, seatY: 0.66, seatZ: -0.78, seatX: 0.4 };
  },

  // ---- Acura NSX: pointed wedge, black teardrop canopy, side intakes
  nsx: (P, T, L) => {
    P(prism(1.9, 0.48, 4.45, { tx: 0.95 }), 0, 0.48, 0);
    P(prism(1.7, 0.22, 1.5, { tx: 0.8, tz: 0.68, sz: 0.3 }), 0, 0.83, 1.45);     // nose wedge
    P(new THREE.BoxGeometry(1.84, 0.32, 1.05), 0, 0.88, -1.7);                   // rear deck
    P(new THREE.BoxGeometry(1.62, 0.05, 0.2), 0, 1.06, -2.16);                   // spoiler lip
    T(prism(1.52, 0.5, 2.05, { tx: 0.6, tz: 0.52, sz: -0.14 }), 0, 0.97, -0.18, GLASS); // canopy
    T(new THREE.BoxGeometry(0.08, 0.26, 0.85), -0.94, 0.66, -0.72, DARK);        // intakes
    T(new THREE.BoxGeometry(0.08, 0.26, 0.85), 0.94, 0.66, -0.72, DARK);
    T(new THREE.BoxGeometry(1.1, 0.2, 0.1), 0, 0.4, 2.2, DARK);
    L(new THREE.BoxGeometry(0.42, 0.07, 0.06), -0.62, 0.8, 2.24, HEAD);
    L(new THREE.BoxGeometry(0.42, 0.07, 0.06), 0.62, 0.8, 2.24, HEAD);
    L(new THREE.BoxGeometry(1.7, 0.06, 0.05), 0, 0.96, -2.23, TAIL);
    return { wheels: [{ r: 0.35, w: 0.3, x: 0.84, z: 1.4 }], dims: [1.94, 4.5], name: "Acura NSX",
      paints: [0xa3192a, 0x90939a, 0x101214], seatY: 0.6 };
  },

  // ---- Mini Cooper: stubby, upright glasshouse, white roof and mirrors
  mini: (P, T, L) => {
    P(prism(1.7, 0.56, 3.78, { tx: 0.96, tz: 0.97 }), 0, 0.56, 0);
    T(prism(1.56, 0.56, 2.1, { tx: 0.8, tz: 0.78 }), 0, 1.12, -0.08, GLASS);
    T(new THREE.BoxGeometry(1.46, 0.07, 1.95), 0, 1.43, -0.1, 0xf4f4f2);         // white roof
    T(new THREE.BoxGeometry(0.16, 0.1, 0.05), -0.88, 1.0, 0.78, 0xf4f4f2);       // mirrors
    T(new THREE.BoxGeometry(0.16, 0.1, 0.05), 0.88, 1.0, 0.78, 0xf4f4f2);
    T(new THREE.BoxGeometry(0.92, 0.26, 0.08), 0, 0.55, 1.88, DARK);             // grille
    T(new THREE.BoxGeometry(1.7, 0.22, 0.1), 0, 0.32, 1.86, DARK);
    L(cylZ(0.15, 0.06, 10), -0.5, 0.82, 1.9, HEAD);                              // round eyes
    L(cylZ(0.15, 0.06, 10), 0.5, 0.82, 1.9, HEAD);
    L(new THREE.BoxGeometry(0.22, 0.18, 0.05), -0.6, 0.78, -1.9, TAIL);
    L(new THREE.BoxGeometry(0.22, 0.18, 0.05), 0.6, 0.78, -1.9, TAIL);
    return { wheels: [{ r: 0.3, w: 0.26, x: 0.74, z: 1.2 }], dims: [1.73, 3.86], name: "Mini Cooper",
      paints: [0x2a5d43, 0xa8242c, 0x29415e, 0xe9e7e2], seatY: 0.78 };
  },

  // ---- Mercedes S-Class: long three-box limo, chrome face
  sclass: (P, T, L) => {
    P(prism(1.9, 0.56, 5.05, { tx: 0.95 }), 0, 0.58, 0);
    P(prism(1.8, 0.18, 1.7, { tz: 0.88, sz: 0.12 }), 0, 0.95, 1.6);              // hood
    P(new THREE.BoxGeometry(1.82, 0.2, 1.1), 0, 0.96, -1.92);                    // trunk
    T(prism(1.72, 0.52, 2.55, { tx: 0.78, tz: 0.6, sz: -0.06 }), 0, 1.12, -0.22, GLASS);
    T(new THREE.BoxGeometry(0.98, 0.4, 0.1), 0, 0.78, 2.5, CHROME);              // grille
    T(new THREE.BoxGeometry(0.84, 0.3, 0.12), 0, 0.78, 2.5, DARK);
    T(new THREE.BoxGeometry(1.9, 0.22, 0.12), 0, 0.36, 2.46, DARK);
    T(new THREE.BoxGeometry(1.9, 0.22, 0.12), 0, 0.36, -2.46, DARK);
    L(new THREE.BoxGeometry(0.46, 0.1, 0.06), -0.66, 0.92, 2.52, HEAD);
    L(new THREE.BoxGeometry(0.46, 0.1, 0.06), 0.66, 0.92, 2.52, HEAD);
    L(new THREE.BoxGeometry(0.52, 0.09, 0.05), -0.64, 0.92, -2.5, TAIL);
    L(new THREE.BoxGeometry(0.52, 0.09, 0.05), 0.64, 0.92, -2.5, TAIL);
    return { wheels: [{ r: 0.36, w: 0.3, x: 0.82, z: 1.6 }], dims: [1.92, 5.1], name: "Mercedes S-Class",
      paints: [0x101214, 0xb9bcc2, 0x222a33, 0x3c3f44], seatY: 0.84 };
  },

  // ---- Mercedes G-Wagon: pure box, spare on the back, fender blinkers
  gwagon: (P, T, L) => {
    P(new THREE.BoxGeometry(1.9, 1.1, 4.5).translate(0, 1.0, 0));
    T(prism(1.8, 0.44, 2.95, { tx: 0.96 }), 0, 1.77, -0.32, GLASS);
    P(new THREE.BoxGeometry(1.72, 0.06, 2.85).translate(0, 2.0, -0.32));          // flat roof
    T(new THREE.BoxGeometry(1.2, 0.34, 0.08), 0, 1.28, 2.27, DARK);               // grille
    T(new THREE.BoxGeometry(1.94, 0.28, 0.16), 0, 0.52, 2.26, DARK);
    T(new THREE.BoxGeometry(1.94, 0.28, 0.16), 0, 0.52, -2.26, DARK);
    T(new THREE.CylinderGeometry(0.38, 0.38, 0.2, 14).rotateX(Math.PI / 2), 0.45, 1.05, -2.36, TIRE); // spare
    T(cylZ(0.2, 0.24, 10), 0.45, 1.05, -2.36, HUB);
    L(cylZ(0.14, 0.06, 10), -0.58, 1.34, 2.28, HEAD);
    L(cylZ(0.14, 0.06, 10), 0.58, 1.34, 2.28, HEAD);
    L(new THREE.BoxGeometry(0.16, 0.07, 0.1), -0.82, 1.58, 2.1, AMBER);           // fender blinkers
    L(new THREE.BoxGeometry(0.16, 0.07, 0.1), 0.82, 1.58, 2.1, AMBER);
    L(new THREE.BoxGeometry(0.2, 0.2, 0.05), -0.7, 1.1, -2.28, TAIL);
    L(new THREE.BoxGeometry(0.2, 0.2, 0.05), 0.7, 1.1, -2.28, TAIL);
    return { wheels: [{ r: 0.42, w: 0.34, x: 0.83, z: 1.45 }], dims: [1.93, 4.6], name: "G-Wagon",
      paints: [0x121416, 0xeceae6, 0x4a4e54], seatY: 1.1 };
  },

  // ---- Toyota Alphard: the Lippo Village MPV — tall one-box, chrome wall
  alphard: (P, T, L) => {
    P(prism(1.82, 0.7, 4.85, { tx: 0.97 }), 0, 0.7, 0);                           // lower body
    P(prism(1.76, 0.85, 3.55, { tx: 0.92, tz: 0.94, sz: -0.1 }), 0, 1.46, -0.55); // tall cabin
    T(prism(1.6, 0.62, 0.7, { sz: -0.5, tx: 0.88 }), 0, 1.35, 1.62, GLASS);       // raked windshield
    T(new THREE.BoxGeometry(0.05, 0.42, 3.0), -0.89, 1.5, -0.6, GLASS);           // window bands
    T(new THREE.BoxGeometry(0.05, 0.42, 3.0), 0.89, 1.5, -0.6, GLASS);
    T(new THREE.BoxGeometry(1.34, 0.12, 0.08), 0, 0.92, 2.44, CHROME);            // grille wall
    T(new THREE.BoxGeometry(1.34, 0.12, 0.08), 0, 0.72, 2.45, CHROME);
    T(new THREE.BoxGeometry(1.34, 0.12, 0.08), 0, 0.52, 2.44, CHROME);
    T(new THREE.BoxGeometry(1.82, 0.24, 0.12), 0, 0.32, 2.42, DARK);
    L(new THREE.BoxGeometry(0.4, 0.14, 0.06), -0.64, 1.06, 2.46, HEAD);
    L(new THREE.BoxGeometry(0.4, 0.14, 0.06), 0.64, 1.06, 2.46, HEAD);
    L(new THREE.BoxGeometry(0.16, 0.5, 0.05), -0.78, 1.3, -2.42, TAIL);           // vertical tails
    L(new THREE.BoxGeometry(0.16, 0.5, 0.05), 0.78, 1.3, -2.42, TAIL);
    return { wheels: [{ r: 0.36, w: 0.28, x: 0.78, z: 1.55 }], dims: [1.85, 4.95], name: "Alphard",
      paints: [0x0e1013, 0xefede8, 0x7e8288], seatY: 1.05 };
  },

  // ---- Porsche 911: teardrop fastback, round eyes, full-width tail bar
  p911: (P, T, L) => {
    P(prism(1.83, 0.52, 4.45, { tx: 0.95 }), 0, 0.5, 0);
    P(prism(1.62, 0.2, 1.35, { tz: 0.72, sz: 0.24 }), 0, 0.86, 1.55);             // sloped frunk
    P(prism(1.56, 0.56, 2.65, { tx: 0.7, tz: 0.42, sz: -0.5 }), 0, 1.04, -0.5);   // fastback (body color)
    T(prism(1.42, 0.4, 0.45, { tx: 0.78, sz: -0.28 }), 0, 1.1, 0.62, GLASS);      // windshield
    T(new THREE.BoxGeometry(0.04, 0.26, 1.35), -0.73, 1.06, -0.32, GLASS);        // side glass
    T(new THREE.BoxGeometry(0.04, 0.26, 1.35), 0.73, 1.06, -0.32, GLASS);
    T(new THREE.BoxGeometry(1.2, 0.05, 0.5), 0, 0.92, -1.85, DARK);               // engine slats
    T(new THREE.BoxGeometry(1.5, 0.18, 0.1), 0, 0.36, 2.18, DARK);
    L(cylZ(0.16, 0.06, 12), -0.62, 0.82, 2.18, HEAD);
    L(cylZ(0.16, 0.06, 12), 0.62, 0.82, 2.18, HEAD);
    L(new THREE.BoxGeometry(1.6, 0.06, 0.05), 0, 0.88, -2.2, TAIL);
    return { wheels: [{ r: 0.34, w: 0.3, x: 0.8, z: 1.35 }], dims: [1.85, 4.5], name: "Porsche 911",
      paints: [0xc8cacc, 0xe9e7e1, 0x14161a, 0x274e37], seatY: 0.66 };
  },
};

// who drives what, per city (weighted)
export const CITY_CAR_MIX = {
  boston: { rangerover: 3, sclass: 2, mini: 2, nsx: 1.5, p911: 1.5, lc500: 1.5, gwagon: 1, alphard: 0.5 },
  tangerang: { alphard: 4, gwagon: 1.5, rangerover: 1.5, mini: 1, sclass: 1, p911: 0.5, lc500: 0.5, nsx: 0.5 },
  paris: { mini: 3, sclass: 2, p911: 1.5, rangerover: 1.5, lc500: 1, gwagon: 0.7, nsx: 0.7, alphard: 0.3 },
};

export function pickModel(cityKey, rng) {
  const mix = CITY_CAR_MIX[cityKey] || CITY_CAR_MIX.boston;
  const total = Object.values(mix).reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  for (const [k, w] of Object.entries(mix)) { roll -= w; if (roll <= 0) return k; }
  return "mini";
}

const partsCache = {};
// → { paintGeo, trimGeo, trimStaticGeo (trim+wheels+dim lights), spec }
export function modelParts(key) {
  if (partsCache[key]) return partsCache[key];
  const paint = [], trim = [], lights = [];
  const place = (arr) => (geo, x, y, z, hex) => {
    if (hex !== undefined) colorize(geo, hex);
    geo.translate(x ?? 0, y ?? 0, z ?? 0);
    arr.push(geo);
  };
  const spec = BUILDERS[key](
    (geo, x, y, z) => { geo.translate(x ?? 0, y ?? 0, z ?? 0); paint.push(geo); },
    place(trim),
    place(lights),
  );
  const wheelGeos = [];
  for (const w of spec.wheels) {
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      wheelGeos.push(wheelGeo(w.r, w.w).translate(sx * w.x, w.r, sz * w.z));
    }
  }
  const paintGeo = mergeGeometries(paint, false);
  const trimGeo = mergeGeometries(trim, false);
  // parked: lights are dark glass, baked into the trim merge
  const dimLights = lights.map((g) => {
    const c = g.attributes.color;
    for (let i = 0; i < c.count; i++) { c.setXYZ(i, c.getX(i) * 0.25, c.getY(i) * 0.25, c.getZ(i) * 0.25); }
    return g;
  });
  const trimStaticGeo = mergeGeometries([trimGeo.clone(), ...wheelGeos.map((g) => g.clone()), ...dimLights.map((g) => g.clone())], false);
  const lightsGeo = mergeGeometries(lights.map((g) => {
    const out = g.clone();
    const c = out.attributes.color;
    for (let i = 0; i < c.count; i++) { c.setXYZ(i, Math.min(1, c.getX(i) * 4), Math.min(1, c.getY(i) * 4), Math.min(1, c.getZ(i) * 4)); }
    return out;
  }), false);
  partsCache[key] = { paintGeo, trimGeo, trimStaticGeo, lightsGeo, spec };
  return partsCache[key];
}

export const TRIM_MAT = new THREE.MeshLambertMaterial({ vertexColors: true });

// a single living car: spinning wheels, steerable fronts, lit lights
export function makeDriveCar(modelKey, paintHex) {
  const { paintGeo, trimGeo, lightsGeo, spec } = modelParts(modelKey);
  const group = new THREE.Group();
  const paintMesh = new THREE.Mesh(paintGeo, new THREE.MeshLambertMaterial({ color: paintHex }));
  paintMesh.castShadow = true;
  const trimMesh = new THREE.Mesh(trimGeo, TRIM_MAT);
  const lightsMesh = new THREE.Mesh(lightsGeo, new THREE.MeshBasicMaterial({ vertexColors: true }));
  group.add(paintMesh, trimMesh, lightsMesh);

  const wheels = [];
  const w = spec.wheels[0];
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * w.x, w.r, sz * w.z);
    const spin = new THREE.Mesh(wheelGeo(w.r, w.w), TRIM_MAT);
    pivot.add(spin);
    group.add(pivot);
    wheels.push({ pivot, spin, front: sz > 0, r: w.r });
  }
  // soft headlight pool on the road ahead
  const headlight = new THREE.PointLight(0xffeecf, 4, 16, 1.8);
  headlight.position.set(0, 1.0, 3.4);
  group.add(headlight);
  return { group, wheels, spec, headlight };
}
