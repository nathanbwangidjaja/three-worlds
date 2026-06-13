// MIT, built by hand — the buildings no facade texture can fake.
// Positions are in boston-map meters (origin = Proto Kendall Square).
// Building anchors come from the OSM bake footprints (ground truth for the
// world); sculptures/grounds from the reference scrape (refs/mit/SPEC.md).
import * as THREE from "three";
import { rectPoly } from "./WorldBuilder.js";

const LIME = 0xd8d2c2;     // MIT Bedford limestone (SPEC palette)
const LIME_DARK = 0xb8b0a0;
const DOME_GRAY = 0xc4bcab;

function mat(c, extra = {}) { return new THREE.MeshLambertMaterial({ color: c, ...extra }); }

// ------------------------------------------------------------ Great Dome
// Building 10 (Maclaurin) — built as ONE coherent structure: a limestone
// building whose entire Killian Court face IS the grand 10-column colonnade
// (full height, with the engraved frieze and the Lobby-10 glass behind it),
// the Pantheon dome rising from the centre. The OSM box is hidden so the
// colonnade reads as the building's front, not a porch glued onto an office.
export function buildGreatDome(cx, cz, ry = 0) {
  const g = new THREE.Group();
  const W = 60, D = 64, BH = 19.5, SF = D / 2; // building mass, south face at +SF

  // limestone building mass — windows on the back & sides
  const sideTex = mitGlassFacadeTex(Math.round(W / 7), 5);
  sideTex.wrapS = sideTex.wrapT = THREE.RepeatWrapping;
  const box = new THREE.Mesh(new THREE.BoxGeometry(W, BH, D), new THREE.MeshLambertMaterial({ map: sideTex }));
  box.position.set(0, BH / 2, 0);
  box.castShadow = true; box.receiveShadow = true;
  g.add(box);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(W + 0.6, 0.8, D + 0.6), mat(0xb6ae9c));
  roof.position.set(0, BH + 0.4, 0);
  g.add(roof);

  // ---- the grand SOUTH colonnade: this IS the front of the building ----
  const colMat = mat(LIME);
  // wide granite stair
  const steps = new THREE.Mesh(new THREE.BoxGeometry(46, 1.6, 8), mat(LIME_DARK));
  steps.position.set(0, 0.8, SF + 4.5);
  g.add(steps);
  // solid limestone returns flanking the colonnade (cover the side windows)
  for (const s of [-1, 1]) {
    const ret = new THREE.Mesh(new THREE.BoxGeometry(8, BH, 2.2), colMat);
    ret.position.set(s * 26, BH / 2, SF + 0.2);
    g.add(ret);
  }
  // tall gridded glass curtain (Lobby 10 windows) set into the central face
  const gc = document.createElement("canvas");
  gc.width = 512; gc.height = 256;
  const gctx = gc.getContext("2d");
  gctx.fillStyle = "#3c4f5a"; gctx.fillRect(0, 0, 512, 256);
  gctx.strokeStyle = "rgba(210,215,210,0.6)"; gctx.lineWidth = 2;
  for (let x2 = 0; x2 <= 512; x2 += 15) { gctx.beginPath(); gctx.moveTo(x2, 0); gctx.lineTo(x2, 256); gctx.stroke(); }
  for (let y2 = 0; y2 <= 256; y2 += 19) { gctx.beginPath(); gctx.moveTo(0, y2); gctx.lineTo(512, y2); gctx.stroke(); }
  const glassTex = new THREE.CanvasTexture(gc);
  glassTex.colorSpace = THREE.SRGBColorSpace;
  const glassWall = new THREE.Mesh(new THREE.PlaneGeometry(42, 16), new THREE.MeshLambertMaterial({ map: glassTex }));
  glassWall.position.set(0, 9.2, SF + 0.45);
  g.add(glassWall);
  // 10 full-height Ionic columns standing on the stair
  for (let i = 0; i < 10; i++) {
    const px = -19 + (38 / 9) * i;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.98, 1.1, 0.8, 14), colMat);
    base.position.set(px, 0.4, SF + 2.6);
    g.add(base);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.74, 0.86, 16, 16), colMat);
    col.position.set(px, 8.8, SF + 2.6);
    g.add(col);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.6, 2.1), colMat);
    cap.position.set(px, 17.1, SF + 2.6);
    g.add(cap);
  }
  // entablature + engraved frieze spanning the colonnade, at the cornice line
  const ent = new THREE.Mesh(new THREE.BoxGeometry(46, 2.7, 4), mat(LIME));
  ent.position.set(0, 18.2, SF + 1.6);
  g.add(ent);
  const fc = document.createElement("canvas");
  fc.width = 1024; fc.height = 64;
  const fctx = fc.getContext("2d");
  fctx.fillStyle = "#cdc4ae"; fctx.fillRect(0, 0, 1024, 64);
  fctx.fillStyle = "#6f6753";
  fctx.font = "600 30px Georgia, serif";
  fctx.textAlign = "center"; fctx.textBaseline = "middle";
  fctx.fillText("MASSACHVSETTS INSTITVTE OF TECHNOLOGY", 512, 34);
  const friezeTex = new THREE.CanvasTexture(fc);
  friezeTex.colorSpace = THREE.SRGBColorSpace;
  const frieze = new THREE.Mesh(new THREE.PlaneGeometry(45, 2.4), new THREE.MeshLambertMaterial({ map: friezeTex }));
  frieze.position.set(0, 18.2, SF + 3.65);
  g.add(frieze);

  // ---- the dome stack, rising from the centre above the cornice ----
  const podium = new THREE.Mesh(new THREE.BoxGeometry(34, 3.2, 34), mat(LIME));
  podium.position.set(0, BH + 1.6, 0);
  g.add(podium);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 6.5, 36), mat(LIME));
  drum.position.set(0, BH + 6.5, 0);
  g.add(drum);
  for (let i = 0; i < 24; i++) { // discrete punched drum windows
    const a = (i / 24) * Math.PI * 2;
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.4, 1.3), mat(0x4a5560));
    win.position.set(Math.cos(a) * 13.9, BH + 6.6, Math.sin(a) * 13.9);
    win.rotation.y = -a;
    g.add(win);
  }
  const cornice = new THREE.Mesh(new THREE.CylinderGeometry(14.9, 14.9, 0.9, 36), mat(0xcdc4b0));
  cornice.position.set(0, BH + 10, 0);
  g.add(cornice);
  // shallow RIBBED saucer dome
  const dc = document.createElement("canvas");
  dc.width = 1024; dc.height = 256;
  const dctx = dc.getContext("2d");
  dctx.fillStyle = "#ccc3af"; dctx.fillRect(0, 0, 1024, 256);
  for (let i = 0; i < 32; i++) {
    const x0 = (i / 32) * 1024;
    dctx.fillStyle = "rgba(120,112,96,0.5)"; dctx.fillRect(x0, 0, 3, 256);
    dctx.fillStyle = "rgba(255,250,238,0.35)"; dctx.fillRect(x0 + 3, 0, 2, 256);
  }
  dctx.fillStyle = "rgba(120,112,96,0.28)";
  for (let r = 1; r < 5; r++) dctx.fillRect(0, (r / 5) * 256, 1024, 2);
  const domeTex = new THREE.CanvasTexture(dc);
  domeTex.colorSpace = THREE.SRGBColorSpace;
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(13.7, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshLambertMaterial({ map: domeTex })
  );
  dome.position.set(0, BH + 10.4, 0);
  dome.scale.y = 0.5;
  g.add(dome);
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.9, 1.7, 16), mat(0xdfdacb));
  lantern.position.set(0, BH + 17, 0);
  g.add(lantern);
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.65, 10, 8), mat(0xcfc8b4));
  finial.position.set(0, BH + 18.1, 0);
  g.add(finial);

  g.position.set(cx, 0, cz);
  g.rotation.y = ry;
  return { group: g, W, D };
}

// ----------------------------------------- Building 7: Lobby 7 + little dome
// The 77 Mass Ave entrance (Rogers Building) — one coherent limestone
// building whose Mass Ave face IS a 6-column Ionic portico with the Lobby-10
// gridded glass behind it, the little dome (the Great Dome's twin) rising
// from the centre. Built like the Great Dome so nothing embeds or floats.
// ry faces the portico toward Mass Ave.
export function buildLobby7(cx, cz, ry = 0) {
  const g = new THREE.Group();
  const W = 64, D = 64, BH = 20, SF = D / 2;
  const colMat = mat(LIME);

  // limestone building mass (windows on the back & sides)
  const sideTex = mitGlassFacadeTex(Math.round(W / 7), 5);
  const box = new THREE.Mesh(new THREE.BoxGeometry(W, BH, D), new THREE.MeshLambertMaterial({ map: sideTex }));
  box.position.set(0, BH / 2, 0);
  box.castShadow = true;
  g.add(box);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(W + 0.6, 0.8, D + 0.6), mat(0xb6ae9c));
  roof.position.set(0, BH + 0.4, 0);
  g.add(roof);

  // ---- the Mass Ave portico: the building's front ----
  const steps = new THREE.Mesh(new THREE.BoxGeometry(34, 1.5, 7), mat(LIME_DARK));
  steps.position.set(0, 0.75, SF + 4);
  g.add(steps);
  for (const s of [-1, 1]) { // limestone returns flanking the colonnade
    const ret = new THREE.Mesh(new THREE.BoxGeometry(9, BH, 2.2), colMat);
    ret.position.set(s * 25, BH / 2, SF + 0.2);
    g.add(ret);
  }
  // gridded glass curtain behind the columns
  const gc = document.createElement("canvas");
  gc.width = 384; gc.height = 256;
  const gctx = gc.getContext("2d");
  gctx.fillStyle = "#3c4f5a"; gctx.fillRect(0, 0, 384, 256);
  gctx.strokeStyle = "rgba(210,215,210,0.6)"; gctx.lineWidth = 2;
  for (let x2 = 0; x2 <= 384; x2 += 15) { gctx.beginPath(); gctx.moveTo(x2, 0); gctx.lineTo(x2, 256); gctx.stroke(); }
  for (let y2 = 0; y2 <= 256; y2 += 19) { gctx.beginPath(); gctx.moveTo(0, y2); gctx.lineTo(384, y2); gctx.stroke(); }
  const glassTex = new THREE.CanvasTexture(gc);
  glassTex.colorSpace = THREE.SRGBColorSpace;
  const glassWall = new THREE.Mesh(new THREE.PlaneGeometry(30, 16), new THREE.MeshLambertMaterial({ map: glassTex }));
  glassWall.position.set(0, 9.5, SF + 0.45);
  g.add(glassWall);
  // 6 full-height Ionic columns
  for (let i = 0; i < 6; i++) {
    const px = -14 + (28 / 5) * i;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.06, 0.8, 14), colMat);
    base.position.set(px, 0.4, SF + 2.4);
    g.add(base);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.74, 0.86, 16.5, 16), colMat);
    col.position.set(px, 9, SF + 2.4);
    g.add(col);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.6, 2.1), colMat);
    cap.position.set(px, 17.6, SF + 2.4);
    g.add(cap);
  }
  // entablature across the colonnade
  const ent = new THREE.Mesh(new THREE.BoxGeometry(34, 2.6, 4), mat(LIME));
  ent.position.set(0, 18.8, SF + 1.5);
  g.add(ent);

  // ---- the little dome on top, centred ----
  const podium = new THREE.Mesh(new THREE.BoxGeometry(24, 2.8, 24), mat(LIME));
  podium.position.set(0, BH + 1.4, 0);
  g.add(podium);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(9.6, 9.6, 4.5, 30), mat(LIME));
  drum.position.set(0, BH + 5, 0);
  g.add(drum);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.8, 1.1), mat(0x4a5560));
    win.position.set(Math.cos(a) * 9.5, BH + 5.1, Math.sin(a) * 9.5);
    win.rotation.y = -a;
    g.add(win);
  }
  const cornice = new THREE.Mesh(new THREE.CylinderGeometry(10.3, 10.3, 0.7, 30), mat(0xcdc4b0));
  cornice.position.set(0, BH + 7.5, 0);
  g.add(cornice);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(9.4, 30, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    mat(DOME_GRAY)
  );
  dome.position.set(0, BH + 7.8, 0);
  dome.scale.y = 0.55;
  g.add(dome);
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.1, 1.3, 14), mat(0xdfdacb));
  lantern.position.set(0, BH + 12.4, 0);
  g.add(lantern);

  g.position.set(cx, 0, cz);
  g.rotation.y = ry;
  return { group: g, W, D };
}

// ------------------------------------------------------- Kresge Auditorium
// Saarinen's thin shell — 1/8 of a sphere rising to ~15 m, touching the lawn
// at three points, with full-glass curtain walls filling the three arches.
export function buildKresge(x, z, ry = 0) {
  const g = new THREE.Group();
  // spherical-cap shell: rim radius ~17 m near the ground, peak ~15 m
  const rimR = 17, peak = 15, rimY = 1.0;
  const R = (rimR * rimR + (peak - rimY) * (peak - rimY)) / (2 * (peak - rimY));
  const theta = Math.asin(Math.min(1, rimR / R));
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(R, 44, 22, 0, Math.PI * 2, 0, theta),
    new THREE.MeshLambertMaterial({ color: 0x6e7b6a, side: THREE.DoubleSide }) // oxidized copper-green
  );
  shell.position.y = rimY - R * Math.cos(theta);
  g.add(shell);
  // bright shell edge band at the rim
  const rim = new THREE.Mesh(new THREE.TorusGeometry(rimR, 0.45, 8, 44), mat(0xeceadd));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = rimY;
  g.add(rim);
  // glass curtain walls inside the rim
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(14, 14, 7, 36, 1, true),
    new THREE.MeshLambertMaterial({ color: 0x9fb3bd, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
  );
  glass.position.y = 3.5;
  g.add(glass);
  // thin vertical mullions
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const m2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 7, 0.12), mat(0xcfd4cb));
    m2.position.set(Math.cos(a) * 14, 3.5, Math.sin(a) * 14);
    g.add(m2);
  }
  // the three ground footings the shell springs from
  for (let i = 0; i < 3; i++) {
    const a = ry + (i / 3) * Math.PI * 2 + 0.5;
    const foot = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, 2.6), mat(0xc9c4b8));
    foot.position.set(Math.cos(a) * (rimR - 1), 0.8, Math.sin(a) * (rimR - 1));
    g.add(foot);
  }
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  return { group: g };
}

// ------------------------------------------------------------- MIT Chapel
export function buildChapel(x, z) {
  const g = new THREE.Group();
  const moat = new THREE.Mesh(new THREE.CylinderGeometry(11.5, 11.5, 0.3, 26), mat(0x3e586a));
  moat.position.y = 0.12;
  g.add(moat);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(12.3, 12.3, 0.5, 26, 1, true), mat(0xb8b2a4, { side: THREE.DoubleSide }));
  rim.position.y = 0.25;
  g.add(rim);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(7.6, 7.6, 9, 26), mat(0x7d4434));
  drum.position.y = 4.8;
  g.add(drum);
  for (const yy of [2.5, 5.0, 7.5]) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(7.64, 7.64, 0.12, 26, 1, true), mat(0x66352a, { side: THREE.DoubleSide }));
    band.position.y = yy;
    g.add(band);
  }
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(7.85, 7.85, 0.5, 26), mat(0x8e8a80));
  roof.position.y = 9.5;
  g.add(roof);
  // low glass entry corridor from the north
  const entry = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3.2, 9), mat(0x6d7d86));
  entry.position.set(0, 1.6, -11);
  g.add(entry);
  // Bertoia aluminum spire
  const spireMat = mat(0xd9dde2);
  for (let i = 0; i < 8; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(1.7 - i * 0.17, 0.15, 0.15), spireMat);
    s.position.y = 10.2 + i * 0.85;
    s.rotation.y = i * 0.55;
    g.add(s);
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.85, 0.13), spireMat);
    v.position.y = 10.2 + i * 0.85 + 0.42;
    g.add(v);
  }
  g.position.set(x, 0, z);
  return { group: g };
}

// ------------------------------------------------------------ Stata Center
// Gehry's colliding towers — stainless drum, leaning orange tower, tilted
// white prisms over a yellow-brick podium, riveted steel cone at grade.
export function buildStata(x, z, ry = 0) {
  const g = new THREE.Group();
  const add = (mesh, px, py, pz, rz = 0, ryy = 0) => {
    mesh.position.set(px, py, pz);
    mesh.rotation.z = rz;
    mesh.rotation.y = ryy;
    mesh.castShadow = true;
    g.add(mesh);
    return mesh;
  };
  add(new THREE.Mesh(new THREE.BoxGeometry(96, 9, 56), mat(0xd9a648)), 0, 4.5, 0);      // yellow brick podium
  add(new THREE.Mesh(new THREE.BoxGeometry(96.6, 0.7, 56.6), mat(0x8e8a82)), 0, 9.2, 0);
  // Gates tower: stainless drum, tilted, angled cap
  add(new THREE.Mesh(new THREE.CylinderGeometry(9.5, 11.5, 28, 18), mat(0xc7c9cc)), -30, 22, -10, 0.1);
  const cap = add(new THREE.Mesh(new THREE.CylinderGeometry(10.4, 10.0, 4.5, 18), mat(0xaeb2b8)), -30.8, 37.6, -10, 0.22);
  // Dreyfus side: white tilted prisms
  add(new THREE.Mesh(new THREE.BoxGeometry(17, 28, 19), mat(0xe9e7e1)), 25, 9 + 14, -6, 0.09, 0.18);
  add(new THREE.Mesh(new THREE.BoxGeometry(12, 21, 14), mat(0xcfd3d8)), 33, 9 + 10.5, 11, -0.14, -0.22);
  // brick-red/orange stucco tower leaning into them
  add(new THREE.Mesh(new THREE.BoxGeometry(15, 25, 17), mat(0xb5512f)), -6, 9 + 12.5, 8, -0.12, 0.1);
  // stainless wedge + the riveted "Kiva" cone at grade
  add(new THREE.Mesh(new THREE.CylinderGeometry(5.5, 8, 23, 4), mat(0xb8bcc2)), 8, 9 + 11.5, -14, 0.16, 0.6);
  add(new THREE.Mesh(new THREE.ConeGeometry(5.5, 12, 14), mat(0xc7c9cc)), -14, 6, 23, 0.35);
  // yellow accent fin + blue awning strip over the student street
  add(new THREE.Mesh(new THREE.BoxGeometry(2.2, 18, 9), mat(0xd9a648)), -17, 9 + 9, 16, 0.18);
  add(new THREE.Mesh(new THREE.BoxGeometry(30, 0.5, 3), mat(0x3a6ea5)), 4, 5.4, 28.4);
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  return { group: g };
}

// ---------------------------------------------- Media Lab E14 (white cube)
// Maki's glass cube in a white aluminum frame with an outer louver screen.
export function buildMediaLab(x, z, w = 52, d = 48, h = 34, ry = 0) {
  const g = new THREE.Group();
  // glass core
  const core = new THREE.Mesh(new THREE.BoxGeometry(w - 2.4, h, d - 2.4), mat(0xaebfc6));
  core.position.y = h / 2;
  g.add(core);
  // white frame grid: canvas texture wrapped on a slightly larger shell
  const c = document.createElement("canvas");
  c.width = 256; c.height = 256;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, 256, 256);
  ctx.strokeStyle = "#e8e8e6";
  ctx.lineWidth = 11;
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath(); ctx.moveTo(0, i * 64); ctx.lineTo(256, i * 64); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(i * 64, 0); ctx.lineTo(i * 64, 256); ctx.stroke();
  }
  // vertical louvers
  ctx.strokeStyle = "rgba(232,232,230,0.6)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 32; i++) { ctx.beginPath(); ctx.moveTo(i * 8, 0); ctx.lineTo(i * 8, 256); ctx.stroke(); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2.4, 1.4);
  const screen = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ map: tex, transparent: true, side: THREE.DoubleSide })
  );
  screen.position.y = h / 2;
  g.add(screen);
  // white roof edge canopy
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 1.6, 0.8, d + 1.6), mat(0xeef0ee));
  roof.position.y = h + 0.4;
  g.add(roof);
  // corner entry stair block
  const stair = new THREE.Mesh(new THREE.BoxGeometry(12, 2.2, 8), mat(0xd8dadc));
  stair.position.set(-w / 2 + 7, 1.1, d / 2 + 2.5);
  g.add(stair);
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  return { group: g };
}

// ----------------------------------- Wiesner E15 (Pei white tile + Noland)
export function buildWiesner(x, z, w = 42, d = 40, h = 21, ry = 0) {
  const g = new THREE.Group();
  const c = document.createElement("canvas");
  c.width = 256; c.height = 128;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#e9e9e5"; ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = "rgba(40,40,40,0.55)";
  ctx.lineWidth = 1.5;
  for (let i = 0; i <= 16; i++) { ctx.beginPath(); ctx.moveTo(i * 16, 0); ctx.lineTo(i * 16, 128); ctx.stroke(); }
  for (let j = 0; j <= 8; j++) { ctx.beginPath(); ctx.moveTo(0, j * 16); ctx.lineTo(256, j * 16); ctx.stroke(); }
  // Noland color bands around the entry zone
  ctx.fillStyle = "#c43a30"; ctx.fillRect(0, 96, 256, 8);
  ctx.fillStyle = "#2f5d8a"; ctx.fillRect(0, 110, 256, 6);
  ctx.fillStyle = "#d8b832"; ctx.fillRect(0, 88, 256, 5);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 1);
  const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ map: tex }));
  box.position.y = h / 2;
  box.castShadow = true;
  g.add(box);
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  return { group: g };
}

// -------------------------------------------------- Simmons Hall ("sponge")
export function buildSimmons(x, z, ry = 0) {
  const g = new THREE.Group();
  const W = 110, H = 32, D = 17;
  const c = document.createElement("canvas");
  c.width = 512; c.height = 160;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#aeb2b5"; ctx.fillRect(0, 0, 512, 160);
  const accents = ["#b8bcbf", "#c43a30", "#2f5d8a", "#d8b832"];
  for (let i = 0; i < 102; i++) {
    for (let j = 0; j < 32; j++) {
      ctx.fillStyle = Math.random() < 0.985 ? "#3c4348" : accents[(i + j) % 4];
      ctx.fillRect(2 + i * 5, 2 + j * 5, 3, 3);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), new THREE.MeshLambertMaterial({ map: tex }));
  slab.position.y = H / 2;
  slab.castShadow = true;
  g.add(slab);
  // the big sky-holes: dark inset boxes punched into the face
  const hole = mat(0x23282c);
  for (const [hx, hy, hw, hh] of [[-30, 18, 12, 10], [8, 9, 10, 9], [36, 21, 9, 8]]) {
    for (const side of [1, -1]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(hw, hh, 1.2), hole);
      m.position.set(hx, hy, side * (D / 2 - 0.3));
      g.add(m);
    }
  }
  // stepped top profile
  const step = new THREE.Mesh(new THREE.BoxGeometry(26, 4, D), mat(0xaeb2b5));
  step.position.set(-14, H + 2, 0);
  g.add(step);
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  return { group: g };
}

// ------------------------------------------------ Sean Collier Memorial
export function buildCollier(x, z, ry = 0) {
  const g = new THREE.Group();
  const granite = mat(0xb9b6ae);
  for (let i = 0; i < 5; i++) {
    const a = ry + (i / 5) * Math.PI * 2;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.6, 5.5), granite);
    arm.position.set(Math.cos(a) * 3.4, 0.8, Math.sin(a) * 3.4);
    arm.rotation.y = -a + Math.PI / 2;
    arm.rotation.x = -0.18;
    g.add(arm);
  }
  const key = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 1.6), granite);
  key.position.set(0, 2.1, 0);
  g.add(key);
  g.position.set(x, 0, z);
  return { group: g };
}

// --------------------------------------------------------- the Alchemist
export function buildAlchemist(x, z, ry = 0) {
  const g = new THREE.Group();
  const m = mat(0xf4f5f2);
  const ringGeo = new THREE.TorusGeometry(1.5, 0.09, 8, 22);
  for (const [px, py, pz, rx, ryy] of [
    [0, 2.0, 0, 0.4, 0], [0, 2.5, 0.2, 1.1, 0.6], [0, 1.7, -0.1, 0.9, 1.4],
    [0, 2.9, 0, 0.2, 0.9], [0.2, 2.3, 0, 1.4, 0.2],
  ]) {
    const r = new THREE.Mesh(ringGeo, m);
    r.position.set(px, py, pz);
    r.rotation.set(rx, ryy, 0);
    g.add(r);
  }
  const headGeo = new THREE.TorusGeometry(0.65, 0.07, 8, 18);
  for (const [rx, ryy] of [[0.3, 0], [1.2, 0.8], [0.8, 1.9]]) {
    const r = new THREE.Mesh(headGeo, m);
    r.position.set(0, 4.1, 0);
    r.rotation.set(rx, ryy, 0);
    g.add(r);
  }
  const knee = new THREE.Mesh(ringGeo, m);
  knee.position.set(0, 1.0, 1.2);
  knee.rotation.set(1.5, 0.3, 0);
  knee.scale.setScalar(0.75);
  g.add(knee);
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  return { group: g };
}

// --------------------------------------------------- Calder, La Grande Voile
export function buildCalderSail(x, z, ry = 0) {
  const g = new THREE.Group();
  const m = mat(0x17181a);
  const mk = (w, h, px, pz, rz, ryy) => {
    const s = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.25), m);
    s.position.set(px, h / 2, pz);
    s.rotation.set(0, ryy, rz);
    s.castShadow = true;
    g.add(s);
  };
  mk(8.5, 11.0, 0, 0, 0.18, 0.2);   // ~12m stabile per the spec
  mk(7.0, 9.2, 3.0, 2.0, -0.22, 1.1);
  mk(5.8, 7.6, -3.0, 1.6, 0.1, -0.9);
  mk(4.6, 6.0, 0.7, -2.5, -0.12, 2.0);
  mk(3.8, 5.2, -1.2, -1.8, 0.2, 0.7); // 5 splayed sails
  // circular paver ring
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 0.12, 24), mat(0x9a8f80));
  ring.position.y = 0.06;
  g.add(ring);
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  return { group: g };
}

// ----------------------------------------------------------- tennis courts
export function buildTennisCourts(x, z, cols = 6, rows = 1, ry = 0) {
  const g = new THREE.Group();
  const courtW = 17, courtD = 33;
  const c = document.createElement("canvas");
  c.width = 256; c.height = 512;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#2e6e4e"; ctx.fillRect(0, 0, 256, 512);
  ctx.fillStyle = "#2f5d8a"; ctx.fillRect(38, 60, 180, 392);
  ctx.strokeStyle = "#f2f4f0"; ctx.lineWidth = 4;
  ctx.strokeRect(38, 60, 180, 392);
  ctx.strokeRect(62, 60, 132, 392);
  ctx.beginPath(); ctx.moveTo(38, 256); ctx.lineTo(218, 256); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(62, 158); ctx.lineTo(194, 158); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(62, 354); ctx.lineTo(194, 354); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(128, 158); ctx.lineTo(128, 354); ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const cx = (i - (cols - 1) / 2) * (courtW + 1.5);
      const cz = (j - (rows - 1) / 2) * (courtD + 2);
      const court = new THREE.Mesh(new THREE.PlaneGeometry(courtW, courtD), new THREE.MeshLambertMaterial({ map: tex }));
      court.rotation.x = -Math.PI / 2;
      court.position.set(cx, 0.06, cz);
      court.receiveShadow = true;
      g.add(court);
      const net = new THREE.Mesh(
        new THREE.PlaneGeometry(11, 1.0),
        new THREE.MeshLambertMaterial({ color: 0x2a2c2e, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
      );
      net.position.set(cx, 0.55, cz);
      g.add(net);
      for (const px of [-5.6, 5.6]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.15, 6), mat(0x303236));
        post.position.set(cx + px, 0.57, cz);
        g.add(post);
      }
    }
  }
  const W = cols * (courtW + 1.5) + 2, D = rows * (courtD + 2) + 2;
  const fenceMat = mat(0x2c4434);
  for (let fx = -W / 2; fx <= W / 2; fx += 4) {
    for (const fz of [-D / 2, D / 2]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.09, 3.4, 0.09), fenceMat);
      p.position.set(fx, 1.7, fz);
      g.add(p);
    }
  }
  for (let fz = -D / 2; fz <= D / 2; fz += 4) {
    for (const fx of [-W / 2, W / 2]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.09, 3.4, 0.09), fenceMat);
      p.position.set(fx, 1.7, fz);
      g.add(p);
    }
  }
  for (const [rw, rx, rz, ryy] of [[W, 0, -D / 2, 0], [W, 0, D / 2, 0], [D, -W / 2, 0, Math.PI / 2], [D, W / 2, 0, Math.PI / 2]]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(rw, 0.07, 0.07), fenceMat);
    rail.position.set(rx, 3.35, rz);
    rail.rotation.y = ryy;
    g.add(rail);
    const meshF = new THREE.Mesh(
      new THREE.PlaneGeometry(rw, 3.2),
      new THREE.MeshLambertMaterial({ color: 0x3a523f, transparent: true, opacity: 0.22, side: THREE.DoubleSide })
    );
    meshF.position.set(rx, 1.7, rz);
    meshF.rotation.y = ryy;
    g.add(meshF);
  }
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  return { group: g };
}

// ------------------------------------------------------------ Killian Court
export function buildKillianCourt(x, z, ry = 0) {
  const g = new THREE.Group();
  const pathMat = mat(0xcfcabe);
  const mkPath = (w, l, px, pz, ryy) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, l), pathMat);
    p.rotation.x = -Math.PI / 2;
    p.rotation.z = ryy;
    p.position.set(px, 0.055, pz);
    g.add(p);
  };
  mkPath(6, 130, 0, 10, 0);            // central axis toward the river
  mkPath(4.5, 115, -34, 14, 0.30);
  mkPath(4.5, 115, 34, 14, -0.30);
  mkPath(4.5, 96, 0, -52, Math.PI / 2);
  const hedgeMat = mat(0x2e5230);
  for (const [hx, hz] of [[-18, -38], [18, -38], [-44, 28], [44, 28], [-22, 58], [22, 58]]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(10, 1.0, 2.2), hedgeMat);
    h.position.set(hx, 0.5, hz);
    g.add(h);
  }
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  return { group: g };
}

// Henry Moore, Three-Piece Reclining Figure — placed separately on the east lawn
export function buildMoore(x, z) {
  const g = new THREE.Group();
  const bronze = mat(0x5e4a30);
  const blob = (sx, sy, sz, px, pz, ryy) => {
    const b = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), bronze);
    b.scale.set(sx, sy, sz);
    b.position.set(px, sy * 0.8 + 0.4, pz);
    b.rotation.y = ryy;
    b.castShadow = true;
    g.add(b);
  };
  blob(1.6, 1.5, 1.1, -1.6, -0.6, 0.4);
  blob(1.9, 1.1, 1.0, 1.2, 0.4, 1.2);
  blob(1.2, 1.0, 0.9, -0.2, 1.4, 2.2);
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(8, 0.4, 5), mat(0xc4bcac));
  plinth.position.set(0, 0.2, 0);
  g.add(plinth);
  g.position.set(x, 0, z);
  return { group: g };
}

// limestone facade with LARGE square windows + piers + glass spandrels —
// MIT's modern limestone look (E62, Sloan), not the default small-window box
function mitGlassFacadeTex(cols = 6, floors = 6) {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 512;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#d9d2c1"; ctx.fillRect(0, 0, 512, 512);   // buff limestone
  // faint stone-panel coursing
  ctx.strokeStyle = "rgba(150,140,120,0.18)"; ctx.lineWidth = 1;
  for (let y = 0; y <= 512; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke(); }
  const fw = 512 / cols, fh = 512 / floors;
  for (let r = 0; r < floors; r++) {
    for (let cc = 0; cc < cols; cc++) {
      const x = cc * fw, y = r * fh;
      // limestone spandrel below + piers either side → window is the big inset
      const wx = x + fw * 0.16, wy = y + fh * 0.2, ww = fw * 0.68, wh = fh * 0.6;
      const g = ctx.createLinearGradient(0, wy, 0, wy + wh);
      g.addColorStop(0, "#9fb6c4"); g.addColorStop(1, "#566f7e"); // sky-reflecting glass
      ctx.fillStyle = g; ctx.fillRect(wx, wy, ww, wh);
      // frame + a vertical + horizontal mullion (2x2 panes)
      ctx.strokeStyle = "rgba(40,46,52,0.8)"; ctx.lineWidth = 2;
      ctx.strokeRect(wx, wy, ww, wh);
      ctx.beginPath(); ctx.moveTo(wx + ww / 2, wy); ctx.lineTo(wx + ww / 2, wy + wh); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(wx, wy + wh / 2); ctx.lineTo(wx + ww, wy + wh / 2); ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ----------------------------------------------------- MIT Sloan E62 (2010)
// Limestone-clad piers + big square glass windows, a full-height glass atrium
// spine, and the curved cantilevered canopy over the entry glass wall.
export function buildSloanE62(x, z) {
  const g = new THREE.Group();
  const FL = 6, fH = 5.3, H = FL * fH; // ~32 m, 6 floors
  // sized to the WEST/main mass of the real footprint so it doesn't bury the
  // small E60 (Arthur D. Little) building on its east side
  const W = 64, D = 108;
  const tex = mitGlassFacadeTex(Math.round(W / 6), FL);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  const texD = tex.clone(); texD.needsUpdate = true;
  texD.repeat.set(1, 1);
  const limeMat = new THREE.MeshLambertMaterial({ map: tex });
  // main mass, slightly stepped: a taller spine + a stepped-back upper band
  const lower = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), limeMat);
  lower.position.y = H / 2;
  lower.castShadow = true; lower.receiveShadow = true;
  g.add(lower);
  // a 5th/6th-floor stepped setback on the river (south) end → roof terraces
  const setback = new THREE.Mesh(new THREE.BoxGeometry(W - 14, fH * 1.0, D * 0.4), new THREE.MeshLambertMaterial({ map: mitGlassFacadeTex(12, 1) }));
  setback.position.set(0, H + fH * 0.5, D * 0.28);
  g.add(setback);
  // glass-railed roof terrace edge
  const terrace = new THREE.Mesh(new THREE.BoxGeometry(W - 2, 0.9, D - 2), new THREE.MeshLambertMaterial({ color: 0x9fb3bd, transparent: true, opacity: 0.4 }));
  terrace.position.set(0, H + 0.45, 0);
  g.add(terrace);

  // central full-height GLASS ATRIUM spine on the west (entry) face
  const atrium = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, H + 1.5, 26),
    new THREE.MeshLambertMaterial({ color: 0x86a6bb, transparent: true, opacity: 0.7 })
  );
  atrium.position.set(-W / 2 - 0.6, (H + 1.5) / 2, -6);
  g.add(atrium);
  // atrium mullions
  for (let i = 0; i <= 26; i += 2) {
    const m2 = new THREE.Mesh(new THREE.BoxGeometry(0.16, H + 1.5, 0.16), mat(0xcfd4cb));
    m2.position.set(-W / 2 - 1.0, (H + 1.5) / 2, -6 - 13 + i);
    g.add(m2);
  }

  // ---- the entry: a 2-story glass vestibule at the BASE with a modest
  // flat canopy over the doors (matches place_sloan_1 — it's understated;
  // the tall glass atrium spine beside it is the dramatic element) ----
  const ex = -W / 2, ez = 14, entryH = fH * 2, entryW = 16;
  const entryGlass = new THREE.Mesh(
    new THREE.PlaneGeometry(entryW, entryH),
    new THREE.MeshLambertMaterial({ color: 0x556f7c, transparent: true, opacity: 0.72, side: THREE.DoubleSide })
  );
  entryGlass.position.set(ex - 0.12, entryH / 2, ez);
  entryGlass.rotation.y = -Math.PI / 2;
  g.add(entryGlass);
  // fine steel mullion grid
  for (let i = -entryW / 2; i <= entryW / 2; i += 2) {
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.1, entryH, 0.1), mat(0xc4c7cb));
    v.position.set(ex - 0.25, entryH / 2, ez + i);
    g.add(v);
  }
  for (let yy = 2.5; yy <= entryH; yy += 2.6) {
    const hb = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, entryW), mat(0xc4c7cb));
    hb.position.set(ex - 0.25, yy, ez);
    g.add(hb);
  }
  // a small flush metal lintel right above the door glass (no floating canopy)
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, entryW + 1.5), mat(0x6a6e72));
  lintel.position.set(ex - 0.2, entryH + 0.4, ez);
  g.add(lintel);

  g.position.set(x, 0, z);
  return { group: g, W, D };
}

// ---------------------------------------------- E52 Chang Building (art-deco)
// 1930s stripped-classical limestone slab: vertical window bays, set-back top,
// with a modern glass penthouse (Samberg Center) on the roof.
export function buildSloanE52(x, z, ry = 0) {
  const g = new THREE.Group();
  const W = 66, D = 44, H = 30; // 7-ish floors
  // art-deco limestone: tall vertical window bays separated by limestone piers
  const c = document.createElement("canvas");
  c.width = 512; c.height = 512;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#d6cfbe"; ctx.fillRect(0, 0, 512, 512);
  const bays = 9;
  const bw = 512 / bays;
  for (let i = 0; i < bays; i++) {
    // recessed vertical window strip (the deco emphasis is vertical)
    const wx = i * bw + bw * 0.28, ww = bw * 0.44;
    ctx.fillStyle = "#41525c";
    ctx.fillRect(wx, 28, ww, 512 - 70);
    // floor mullions (horizontal spandrel bars, slightly lighter)
    ctx.fillStyle = "#cfc7b4";
    for (let y = 28; y < 460; y += 56) ctx.fillRect(wx, y, ww, 6);
    // pier shadow lines
    ctx.strokeStyle = "rgba(150,140,120,0.3)"; ctx.lineWidth = 1.5;
    ctx.strokeRect(wx - 2, 26, ww + 4, 512 - 66);
  }
  // base course
  ctx.fillStyle = "#c3bba6"; ctx.fillRect(0, 470, 512, 42);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), new THREE.MeshLambertMaterial({ map: tex }));
  body.position.y = H / 2;
  body.castShadow = true;
  g.add(body);
  // set-back attic floor
  const attic = new THREE.Mesh(new THREE.BoxGeometry(W - 8, 3.5, D - 8), new THREE.MeshLambertMaterial({ color: 0xcfc7b4 }));
  attic.position.y = H + 1.75;
  g.add(attic);
  // modern glass penthouse (Samberg Conference Center)
  const pent = new THREE.Mesh(
    new THREE.BoxGeometry(W - 18, 5, D - 16),
    new THREE.MeshLambertMaterial({ color: 0x7d97a6, transparent: true, opacity: 0.66 })
  );
  pent.position.y = H + 6;
  g.add(pent);
  const pentRoof = new THREE.Mesh(new THREE.BoxGeometry(W - 16, 0.5, D - 14), mat(0x9aa0a6));
  pentRoof.position.y = H + 8.7;
  g.add(pentRoof);
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  return { group: g };
}

// --------------------------------------------- Sloan E62 entry court + wall
export function buildSloanCourt(x, z, ry = 0) {
  const g = new THREE.Group();
  // semicircular lawn
  const lawn = new THREE.Mesh(new THREE.CircleGeometry(13, 22, 0, Math.PI), mat(0x6fa14e));
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.y = 0.05;
  g.add(lawn);
  // low curved granite wall with the engraved name
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(13.5, 13.5, 1.0, 30, 1, true, 0, Math.PI), mat(0xb9b6ae, { side: THREE.DoubleSide }));
  wall.position.y = 0.5;
  g.add(wall);
  const c = document.createElement("canvas");
  c.width = 768; c.height = 48;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#b3b0a8"; ctx.fillRect(0, 0, 768, 48);
  ctx.fillStyle = "#4e4c46";
  ctx.font = "600 26px Georgia, serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("MIT SLOAN SCHOOL OF MANAGEMENT", 384, 25);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(13.55, 13.55, 0.55, 30, 1, true, 0.35, Math.PI - 0.7),
    new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide })
  );
  band.position.y = 0.62;
  g.add(band);
  // steel entry canopy hint
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(12, 0.3, 5), mat(0x9aa0a6));
  canopy.position.set(0, 4.6, -10);
  g.add(canopy);
  for (const px of [-5, 5]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4.6, 8), mat(0x6a6e72));
    post.position.set(px, 2.3, -10);
    g.add(post);
  }
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  return { group: g };
}

// ------------------------------------------------- Kendall T + plaza marker
export function buildKendallT(x, z, ry = 0) {
  const g = new THREE.Group();
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(9, 0.35, 5), mat(0x8d9298));
  canopy.position.y = 3.2;
  g.add(canopy);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(8.4, 3, 4.4), mat(0x7d97a6, { transparent: true, opacity: 0.55 }));
  glass.position.y = 1.5;
  g.add(glass);
  // the red T pylon
  const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 5.4, 10), mat(0x6a6e72));
  pylon.position.set(6, 2.7, 0);
  g.add(pylon);
  const c = document.createElement("canvas");
  c.width = 128; c.height = 128;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#c8332a"; ctx.beginPath(); ctx.arc(64, 64, 60, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#ffffff"; ctx.font = "900 84px Helvetica, Arial";
  ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("T", 64, 70);
  const tTex = new THREE.CanvasTexture(c);
  tTex.colorSpace = THREE.SRGBColorSpace;
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.12, 20), new THREE.MeshLambertMaterial({ map: tTex }));
  disc.rotation.x = Math.PI / 2;
  disc.position.set(6, 5.0, 0);
  g.add(disc);
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  return { group: g };
}

// ------------------------------------------- MIT Sailing Pavilion + docks
export function buildSailingPavilion(x, z, ry = 0) {
  const g = new THREE.Group();
  const house = new THREE.Mesh(new THREE.BoxGeometry(18, 5.5, 8), mat(0xf0efe8));
  house.position.y = 3.1;
  g.add(house);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(18.2, 0.5, 8.2), mat(0x2f5d8a));
  trim.position.y = 5.6;
  g.add(trim);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(18.6, 0.3, 8.6), mat(0x8e8a80));
  roof.position.y = 6.0;
  g.add(roof);
  // pilings + dock running riverward (+z)
  const deckMat = mat(0x9a7e58);
  for (const [dw, dd, dx, dz] of [[24, 3, 0, 7], [3, 16, -9, 16], [3, 16, 9, 16]]) {
    const dock = new THREE.Mesh(new THREE.BoxGeometry(dw, 0.3, dd), deckMat);
    dock.position.set(dx, 0.7, dz);
    g.add(dock);
  }
  // dinghies
  for (const [bx, bz, bry] of [[-6, 21, 0.4], [-2, 23, -0.3], [4, 22, 0.9], [8, 20, -0.6]]) {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.4, 3.4), mat(0xf2f3f0));
    hull.position.set(bx, 0.45, bz);
    hull.rotation.y = bry;
    g.add(hull);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.12, 3.44), mat(0x3a9aa8));
    stripe.position.set(bx, 0.56, bz);
    stripe.rotation.y = bry;
    g.add(stripe);
  }
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  return { group: g };
}

// ----------------------------------------------- assemble the whole campus
export function buildMitExtras(game, addExtra) {
  const world = game.world;
  const col = (cx, cz, hw, hl, ry, h) => world.addCollider?.(rectPoly(cx, cz, hw, hl, ry), h);

  // Building 10 / Great Dome — full custom building on the OSM footprint,
  // rotated to the real campus axis (court-facing normal = 23.9°) so it lines
  // up with Killian Court and the neighbouring Maclaurin wings.
  const DOME_RY = 0.416;
  addExtra(buildGreatDome(-328, 403, DOME_RY));
  col(-328, 403, 30, 34, DOME_RY, 19); // building mass + colonnade, rotated

  // Killian Court extends down the colonnade axis toward the river, rotated
  // to the same campus angle so its paths line up with the building
  addExtra(buildKillianCourt(-292, 485, DOME_RY));
  addExtra(buildMoore(-250, 478));
  col(-250, 478, 4, 2.6, 0, 3);

  // Lobby 7 / 77 Mass Ave — full custom building on Bldg 7 Rogers' footprint
  // (@ -423,450), rotated so the portico faces Mass Ave (normal -68°). OSM box hidden.
  const L7_RY = -1.189;
  addExtra(buildLobby7(-423, 450, L7_RY));
  col(-423, 450, 32, 35, L7_RY, 20);

  // Kresge + Chapel (OSM boxes hidden by tuning)
  addExtra(buildKresge(-580, 575, 0.3));
  col(-580, 575, 19, 19, 0, 9);
  addExtra(buildChapel(-502, 554));
  col(-502, 554, 8.4, 8.4, 0, 9);

  // Stata Center (replaces OSM footprint @ (-214,184))
  addExtra(buildStata(-214, 184, 0.12));
  col(-214, 184, 48, 28, 0.12, 9);

  // Sean Collier Memorial at Stata's NW corner
  addExtra(buildCollier(-245, 145));
  col(-245, 145, 4, 4, 0, 2.4);

  // Green Building radome (the OSM slab stays, greenPiers style)
  addExtra(buildRadome(-111, 333, 90));

  // Media Lab cube + Wiesner tile box (replace their OSM boxes)
  addExtra(buildMediaLab(59, 306, 52, 48, 34, 0));
  col(59, 306, 26, 24, 0, 9);
  addExtra(buildWiesner(24, 272, 34, 32, 21, 0));
  col(24, 272, 17, 16, 0, 9);

  // the Alchemist on the W20 lawn opposite Lobby 7
  addExtra(buildAlchemist(-462, 478, 0.7));
  col(-462, 478, 2, 2, 0, 4);

  // Calder's Big Sail in McDermott Court (SE of the Green Building)
  addExtra(buildCalderSail(-72, 352, 0.4));
  col(-72, 352, 4, 4, 0.4, 9);

  // du Pont tennis courts along the real strip (-819,739)→(-651,663)
  addExtra(buildTennisCourts(-728, 716, 6, 1, 0.425));

  // MIT Sloan — the flagship E62 (custom: limestone + big windows + glass
  // atrium + curved-canopy entry) with its engraved entry court, and the
  // 1930s art-deco E52 Chang Building on Memorial Drive
  // E62 centered on the WEST mass of its real footprint (E60 sits to the east)
  addExtra(buildSloanE62(418, 218));
  col(418, 218, 32, 54, 0, 9);
  addExtra(buildSloanCourt(382, 218, Math.PI / 2)); // engraved wall faces the west entry
  // E52 nudged north so it doesn't clip E53 Hermann
  addExtra(buildSloanE52(358, 285, 0));
  col(358, 285, 33, 21, 0, 9);

  // Simmons Hall sponge (replaces OSM box @ (-1107,687); slab runs E-W)
  addExtra(buildSimmons(-1107, 687, 0.05));
  col(-1107, 687, 55, 10, 0.05, 9);

  // Kendall T head house — on the plaza NORTH of Main St, well clear of the
  // roadway (it was sitting in the middle of Main St before)
  addExtra(buildKendallT(155, 75, -0.5));
  col(155, 75, 4.6, 2.6, -0.5, 4);
  addExtra(buildSailingPavilion(321, 545, 0));
  col(321, 545, 9.5, 4.5, 0, 6);
}

// Green Building radome (kept here so the assemble fn reads top-down)
export function buildRadome(x, z, roofY) {
  const g = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(5.2, 18, 12), mat(0xf2f3f0));
  ball.position.set(0, roofY + 4.6, 0);
  g.add(ball);
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.8, 2.4, 12), mat(0xc4c0b6));
  plinth.position.set(0, roofY + 1.2, 0);
  g.add(plinth);
  // antenna masts
  for (const [mx, mz] of [[-6, 2], [4, -3]]) {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 7, 6), mat(0x9aa0a6));
    mast.position.set(mx, roofY + 3.5, mz);
    g.add(mast);
  }
  g.position.set(x, 0, z);
  return { group: g };
}
