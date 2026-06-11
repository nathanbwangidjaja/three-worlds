// Walkable school interiors: SPH Lippo Village and UPH Karawaci.
// Multiple real floors connected by a stairwell — chapel, classrooms and the
// Eagles gym for SPH; the marble lobby, Johannes Oentoro Library and a tiered
// lecture theatre for UPH. Stylized like the rest of the game, laid out from
// what the campuses actually contain.
import * as THREE from "three";
import { Avatar, randomNpcLook } from "./Avatar.js";

const FLOOR_H = 3.8;

function lambert(color) { return new THREE.MeshLambertMaterial({ color }); }

function textBanner(text, bg, fg, w = 1024, h = 128, font = "bold 64px Georgia") {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = fg; ctx.lineWidth = 5; ctx.strokeRect(8, 8, w - 16, h - 16);
  ctx.fillStyle = fg; ctx.font = font;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, h / 2 + 4);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function whiteboardTex(lines) {
  const cv = document.createElement("canvas");
  cv.width = 256; cv.height = 128;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#f4f6f4"; ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = "#b8bcb8"; ctx.lineWidth = 6; ctx.strokeRect(3, 3, 250, 122);
  ctx.fillStyle = "#3a4a8a"; ctx.font = "16px cursive";
  lines.forEach((l, i) => ctx.fillText(l, 16, 30 + i * 24));
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function courtTex() {
  const cv = document.createElement("canvas");
  cv.width = 512; cv.height = 512;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#c89858"; ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = "#8a5c28"; ctx.lineWidth = 3;
  for (let y = 0; y < 512; y += 14) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.globalAlpha = 0.15; ctx.stroke(); ctx.globalAlpha = 1; }
  ctx.strokeStyle = "#ecf0ec"; ctx.lineWidth = 6;
  ctx.strokeRect(40, 30, 432, 452);
  ctx.beginPath(); ctx.moveTo(40, 256); ctx.lineTo(472, 256); ctx.stroke();
  ctx.beginPath(); ctx.arc(256, 256, 56, 0, Math.PI * 2); ctx.stroke();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export const CAMPUSES = {
  sph: {
    name: "SPH Lippo Village",
    sub: "Sekolah Pelita Harapan · est. 1993",
    W: 46, D: 30,
    floors: ["Lobby · Chapel · Cafeteria", "Classrooms · Library", "Eagles Gym"],
    wall: 0xeef0ee, accent: 0x2a5d8a, floor: 0xd8d4c8,
  },
  uph: {
    name: "UPH Karawaci",
    sub: "Universitas Pelita Harapan · MH Thamrin Boulevard",
    W: 50, D: 32,
    floors: ["Grand Lobby", "Johannes Oentoro Library", "Lecture Theatre"],
    wall: 0xe8e6e0, accent: 0x1d2c54, floor: 0xcfc8ba,
  },
};

export class CampusWorld {
  constructor(scene, key, game) {
    this.scene = scene;
    this.key = key;
    this.cfg = CAMPUSES[key];
    this.game = game;
    this.group = new THREE.Group();
    this.isInterior = true;
    this.isPhotoreal = false;
    this.W = this.cfg.W;
    this.D = this.cfg.D;
    this.data = { radius: Math.max(this.W, this.D) };
    this.floor = 0;
    this.colliders = [[], [], []]; // per floor: {x, z, hw, hd}
    this.npcs = [];
    this.animated = [];
    this.doorPos = { x: 0, z: this.D / 2 - 1.2 };
    this.stairPos = { x: -this.W / 2 + 3.2, z: -this.D / 2 + 3.2 };
  }

  async build(onProgress) {
    const { W, D, cfg } = this;
    onProgress?.(0.15, "pushing the doors open");
    // tropical daylight pours in — the city's lights died with the city
    this.group.add(new THREE.AmbientLight(0xfff2dc, 0.95));
    this.group.add(new THREE.HemisphereLight(0xfff8e8, 0xa8a090, 0.5));
    const sun = new THREE.DirectionalLight(0xffeecf, 1.1);
    sun.position.set(30, 40, 20);
    this.group.add(sun);
    const wallMat = lambert(cfg.wall);
    const floorMat = lambert(cfg.floor);

    for (let f = 0; f < 3; f++) {
      const fg = new THREE.Group();
      fg.position.y = f * FLOOR_H;
      // slab + ceiling
      const slab = new THREE.Mesh(new THREE.BoxGeometry(W, 0.18, D), floorMat);
      slab.position.y = -0.09;
      slab.receiveShadow = true;
      fg.add(slab);
      const ceil = new THREE.Mesh(new THREE.BoxGeometry(W, 0.14, D), wallMat);
      ceil.position.y = FLOOR_H - 0.25;
      fg.add(ceil);
      // outer walls with window strips
      const wallH = FLOOR_H - 0.3;
      const mkWall = (w, x, z, ry) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, 0.25), wallMat);
        m.position.set(x, wallH / 2, z);
        m.rotation.y = ry;
        fg.add(m);
      };
      mkWall(W, 0, -D / 2, 0);
      mkWall(D, -W / 2, 0, Math.PI / 2);
      mkWall(D, W / 2, 0, Math.PI / 2);
      // front wall with a door gap on floor 0
      if (f === 0) {
        mkWall(W / 2 - 2.2, -(W / 4 + 1.1), D / 2, 0);
        mkWall(W / 2 - 2.2, W / 4 + 1.1, D / 2, 0);
      } else {
        mkWall(W, 0, D / 2, 0);
      }
      // window band (glass strip along side walls)
      const glass = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 1.2, D - 4),
        new THREE.MeshLambertMaterial({ color: 0xbfd8e8, emissive: 0x88a8c0, emissiveIntensity: 0.35 })
      );
      glass.position.set(-W / 2 + 0.18, 2.0, 0);
      fg.add(glass.clone());
      glass.position.x = W / 2 - 0.18;
      fg.add(glass);
      // accent stripe
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(W, 0.32, 0.06), lambert(cfg.accent));
      stripe.position.set(0, 0.9, -D / 2 + 0.16);
      fg.add(stripe);
      // stairwell block
      const stairBox = new THREE.Mesh(new THREE.BoxGeometry(4.4, wallH, 4.4), lambert(cfg.accent));
      stairBox.position.set(this.stairPos.x, wallH / 2, this.stairPos.z);
      fg.add(stairBox);
      this.colliders[f].push({ x: this.stairPos.x, z: this.stairPos.z, hw: 2.2, hd: 2.2 });
      // ceiling lights
      for (let lx = -W / 2 + 8; lx < W / 2 - 4; lx += 10) {
        const lamp = new THREE.PointLight(0xfff4e0, 7, 13, 1.9);
        lamp.position.set(lx, FLOOR_H - 0.6, 0);
        fg.add(lamp);
        const panel = new THREE.Mesh(
          new THREE.BoxGeometry(1.6, 0.06, 0.7),
          new THREE.MeshLambertMaterial({ color: 0xf8f6ee, emissive: 0xfff2d8, emissiveIntensity: 0.85 })
        );
        panel.position.set(lx, FLOOR_H - 0.32, 0);
        fg.add(panel);
      }
      this.group.add(fg);
      this["floorGroup" + f] = fg;
    }

    onProgress?.(0.45, "hanging the banners");
    if (this.key === "sph") this._buildSph();
    else this._buildUph();

    onProgress?.(0.8, "students settling in");
    this._buildNpcs();
    this.scene.add(this.group);
    onProgress?.(1, "the bell rings");
    return this;
  }

  // small helpers — everything lands on a specific floor group with collision
  _box(f, w, h, d, x, y, z, color, solid = true) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lambert(color));
    m.position.set(x, y, z);
    m.castShadow = true;
    this["floorGroup" + f].add(m);
    if (solid && h > 0.5) this.colliders[f].push({ x, z, hw: w / 2 + 0.15, hd: d / 2 + 0.15 });
    return m;
  }

  _banner(f, text, bg, fg, x, y, z, w = 7, h = 0.9, ry = 0) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshLambertMaterial({ map: textBanner(text, bg, fg), side: THREE.DoubleSide })
    );
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    this["floorGroup" + f].add(mesh);
  }

  _chairRow(f, count, x0, z, dx, color, ry = 0) {
    for (let i = 0; i < count; i++) {
      const g = new THREE.Group();
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.5), lambert(color));
      seat.position.y = 0.45;
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.07), lambert(color));
      back.position.set(0, 0.78, -0.22);
      g.add(seat, back);
      g.position.set(x0 + i * dx, 0, z);
      g.rotation.y = ry;
      this["floorGroup" + f].add(g);
    }
  }

  _buildSph() {
    const { W, D } = this;
    const wood = 0x8a6844, navy = 0x2a5d8a, cream = 0xf2efe6;
    // ---- F0: lobby + chapel + cafeteria
    this._banner(0, "SEKOLAH PELITA HARAPAN", "#13427a", "#f2efe2", 0, 2.9, -D / 2 + 0.2, 12, 1.1);
    this._box(0, 5.2, 1.05, 1.1, 0, 0.52, -D / 2 + 4, wood);            // reception desk
    this._banner(0, "TRUE KNOWLEDGE · FAITH IN CHRIST", "#f2efe2", "#13427a", 0, 1.9, -D / 2 + 0.2, 9, 0.55);
    this._box(0, 1.6, 1.7, 0.6, 5.5, 0.85, -D / 2 + 2.2, 0x7a5c34);      // trophy case
    // chapel (west wing)
    for (let r = 0; r < 4; r++) {
      this._box(0, 3.4, 0.85, 0.5, -W / 2 + 7, 0.42, -4 + r * 2.2, wood); // pews
      this._box(0, 3.4, 0.85, 0.5, -W / 2 + 11.5, 0.42, -4 + r * 2.2, wood);
    }
    this._box(0, 8.5, 0.4, 2.6, -W / 2 + 9, 0.2, -8.5, 0x9a8a60); // stage
    const cross = new THREE.Group();
    const cv = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.0, 0.12), lambert(wood));
    const ch = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.22, 0.12), lambert(wood));
    ch.position.y = 0.45;
    cross.add(cv, ch);
    cross.position.set(-W / 2 + 9, 1.9, -D / 2 + 0.4);
    this.floorGroup0.add(cross);
    this._box(0, 0.7, 1.15, 0.55, -W / 2 + 6, 0.57, -7.6, 0x6e5234);     // lectern
    // cafeteria (east wing): round-ish tables
    for (const [tx, tz] of [[9, 2], [14, 5], [9, 8], [15, 0], [14, 10]]) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.08, 12), lambert(cream));
      t.position.set(tx, 0.78, tz);
      this.floorGroup0.add(t);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.78, 8), lambert(0x6a6a6e));
      leg.position.set(tx, 0.39, tz);
      this.floorGroup0.add(leg);
      this.colliders[0].push({ x: tx, z: tz, hw: 1.1, hd: 1.1 });
      this._chairRow(0, 2, tx - 0.8, tz - 1.3, 1.6, navy);
      this._chairRow(0, 2, tx - 0.8, tz + 1.3, 1.6, navy, Math.PI);
    }
    this._banner(0, "KANTIN · CAFETERIA", "#2a5d8a", "#f2efe2", 12, 2.7, -D / 2 + 0.2, 6, 0.6);
    // lockers along the north corridor
    for (let lx = -6; lx <= 6; lx += 1.0) {
      this._box(0, 0.9, 1.8, 0.45, lx, 0.9, -D / 2 + 1.0, lx % 2 ? 0xd87c28 : 0xc06820, false);
    }

    // ---- F1: classrooms + library
    const mkClassroom = (cx, label) => {
      // interior wall with door gap
      this._box(1, 0.18, 2.9, 9, cx - 5, 1.45, -D / 2 + 5.5, 0xdfe2df);
      this._banner(1, label, "#2a5d8a", "#f2efe2", cx, 2.55, -D / 2 + 0.25, 3.4, 0.5);
      const wb = new THREE.Mesh(
        new THREE.PlaneGeometry(3.2, 1.5),
        new THREE.MeshLambertMaterial({ map: whiteboardTex(["IB Unit 4: Ecosystems", "hw: reflection due Fri", "✏️ quiz Monday!"]) })
      );
      wb.position.set(cx, 1.8, -D / 2 + 0.22);
      this.floorGroup1.add(wb);
      this._box(1, 1.5, 0.78, 0.7, cx - 2.6, 0.39, -D / 2 + 2.4, 0x8a6844); // teacher desk
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 3; c++) {
          this._box(1, 0.95, 0.72, 0.6, cx - 1.6 + c * 1.6, 0.36, -D / 2 + 4.2 + r * 1.7, 0xb9956a, false);
          this._chairRow(1, 1, cx - 1.6 + c * 1.6, -D / 2 + 5.0 + r * 1.7, 0, 0x2a5d8a);
        }
      }
    };
    mkClassroom(-10, "GRADE 7 · MYP");
    mkClassroom(0, "GRADE 10 · MYP");
    mkClassroom(10, "GRADE 12 · DP");
    // library nook (south side)
    for (let s = 0; s < 4; s++) {
      this._box(1, 6.5, 1.9, 0.5, -6 + s * 4.2, 0.95, D / 2 - 3.2, 0x7a5c38);
    }
    this._banner(1, "PERPUSTAKAAN · LIBRARY", "#13427a", "#f2efe2", 4, 2.7, D / 2 - 0.3, 8, 0.7, Math.PI);

    // ---- F2: Eagles gym
    const court = new THREE.Mesh(new THREE.PlaneGeometry(W - 6, D - 6), new THREE.MeshLambertMaterial({ map: courtTex() }));
    court.rotation.x = -Math.PI / 2;
    court.position.y = 0.02;
    this.floorGroup2.add(court);
    this._banner(2, "🦅 SPH EAGLES 🦅", "#13427a", "#f2c84a", 0, 2.9, -D / 2 + 0.2, 13, 1.2);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.4, 0.18), lambert(0x44484e));
      post.position.set(side * (W / 2 - 5.5), 1.7, 0);
      this.floorGroup2.add(post);
      const board = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.05, 1.8), lambert(0xf2f2ea));
      board.position.set(side * (W / 2 - 5.9), 3.0, 0);
      this.floorGroup2.add(board);
      const ringG = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.03, 6, 14), lambert(0xc05020));
      ringG.rotation.x = Math.PI / 2;
      ringG.position.set(side * (W / 2 - 6.35), 2.62, 0);
      this.floorGroup2.add(ringG);
      this.colliders[2].push({ x: side * (W / 2 - 5.5), z: 0, hw: 0.3, hd: 0.3 });
      // bleachers
      for (let s = 0; s < 3; s++) {
        this._box(2, W - 14, 0.42, 0.9, 0, 0.21 + s * 0.42, side * (D / 2 - 2.2 - s * 0.0) - side * s * 0.9, 0x3a5a7a, s === 0);
      }
    }
  }

  _buildUph() {
    const { W, D } = this;
    const navy = 0x1d2c54, gold = 0xc8a44a, marble = 0xe8e4d8, wood = 0x7a5c38;
    // ---- F0: grand lobby
    const checks = new THREE.Mesh(new THREE.PlaneGeometry(W - 2, D - 2), new THREE.MeshLambertMaterial({ color: marble }));
    checks.rotation.x = -Math.PI / 2;
    checks.position.y = 0.015;
    this.floorGroup0.add(checks);
    this._banner(0, "UNIVERSITAS PELITA HARAPAN", "#1d2c54", "#e8d8a0", 0, 3.0, -D / 2 + 0.2, 16, 1.2);
    this._banner(0, "FAITH · HOPE · LOVE", "#e8d8a0", "#1d2c54", 0, 2.05, -D / 2 + 0.2, 8, 0.55);
    for (const cx of [-15, -7.5, 7.5, 15]) {
      for (const cz of [-6, 6]) {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, FLOOR_H - 0.4, 10), lambert(0xf0ece2));
        col.position.set(cx, (FLOOR_H - 0.4) / 2, cz);
        col.castShadow = true;
        this.floorGroup0.add(col);
        this.colliders[0].push({ x: cx, z: cz, hw: 0.7, hd: 0.7 });
      }
    }
    this._box(0, 7, 1.05, 1.2, 0, 0.52, -D / 2 + 4.5, navy);   // reception
    this._box(0, 7, 0.08, 1.3, 0, 1.06, -D / 2 + 4.5, gold, false);
    // hanging faculty flags
    for (let i = 0; i < 6; i++) {
      const flag = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, 1.6),
        new THREE.MeshLambertMaterial({ color: i % 2 ? navy : gold, side: THREE.DoubleSide })
      );
      flag.position.set(-12 + i * 4.8, 2.6, 0);
      this.floorGroup0.add(flag);
    }
    // cafe corner
    this._box(0, 4.2, 1.0, 1.0, W / 2 - 5, 0.5, D / 2 - 4.5, wood);
    this._banner(0, "KOPI & ROTI", "#3a2c1c", "#e8d8a0", W / 2 - 5, 2.2, D / 2 - 0.4, 3.6, 0.5, Math.PI);
    for (const [tx, tz] of [[W / 2 - 9, D / 2 - 6], [W / 2 - 12, D / 2 - 4], [W / 2 - 10, D / 2 - 9]]) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.07, 10), lambert(0xe2dccc));
      t.position.set(tx, 0.76, tz);
      this.floorGroup0.add(t);
      this.colliders[0].push({ x: tx, z: tz, hw: 0.8, hd: 0.8 });
      this._chairRow(0, 2, tx - 0.7, tz - 1.1, 1.4, navy);
    }

    // ---- F1: Johannes Oentoro Library
    this._banner(1, "JOHANNES OENTORO LIBRARY", "#1d2c54", "#e8d8a0", 0, 2.9, -D / 2 + 0.2, 14, 1.0);
    for (let r = 0; r < 5; r++) {
      this._box(1, 0.6, 2.0, 9, -W / 2 + 6 + r * 3.4, 1.0, -D / 2 + 8.5, wood);
    }
    for (let t = 0; t < 3; t++) {
      this._box(1, 1.4, 0.76, 5.5, 6 + t * 5, 0.38, 2, 0x9a7e54);
      this._chairRow(1, 3, 5.3 + t * 5, -0.4, 0, 0x2c5040, 0);
      this._chairRow(1, 3, 5.3 + t * 5, 4.4, 0, 0x2c5040, Math.PI);
      // green reading lamps
      for (let k = 0; k < 2; k++) {
        const lamp = new THREE.PointLight(0xd8f0c8, 1.6, 4, 2);
        lamp.position.set(6 + t * 5, 1.3, 0.4 + k * 3);
        this.floorGroup1.add(lamp);
      }
    }
    this._banner(1, "SILENT STUDY · LANTAI 2", "#e8d8a0", "#1d2c54", 0, 2.0, -D / 2 + 0.22, 7, 0.5);

    // ---- F2: lecture theatre
    this._banner(2, "AULA BESAR · LECTURE THEATRE", "#1d2c54", "#e8d8a0", 0, 2.95, -D / 2 + 0.2, 14, 1.0);
    this._box(2, 12, 0.35, 3.4, 0, 0.17, -D / 2 + 3.4, 0x8a8478);   // stage
    this._box(2, 0.8, 1.18, 0.6, -4, 0.59, -D / 2 + 3.4, wood);     // lectern
    const big = new THREE.Mesh(
      new THREE.PlaneGeometry(7, 2.1),
      new THREE.MeshLambertMaterial({ map: whiteboardTex(["MGMT 301: Strategy", "case study: Lippo Group", "midterm — next week 📚"]) })
    );
    big.position.set(0, 2.0, -D / 2 + 0.25);
    this.floorGroup2.add(big);
    for (let row = 0; row < 4; row++) {
      const y = 0.18 + row * 0.32, z = -D / 2 + 7.5 + row * 2.3;
      this._box(2, W - 16, 0.32, 2.0, 0, y / 1, z, 0x5a5e66, false);            // riser
      this._box(2, W - 18, 0.5, 0.5, 0, y + 0.5, z - 0.5, wood, false);         // long desk
      this._chairRow(2, 8, -(W - 20) / 2, z + 0.55, (W - 20) / 7, 0x32487a);
    }
  }

  _buildNpcs() {
    const seedBase = this.key === "sph" ? 11 : 47;
    let s = seedBase;
    const rng = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    const spots = [
      { f: 0, x: 4, z: 2, walk: true }, { f: 0, x: -5, z: 4, walk: true },
      { f: 0, x: 8, z: -3, walk: false }, { f: 0, x: -9, z: -2, walk: true },
      { f: 1, x: 3, z: 0, walk: true }, { f: 1, x: -4, z: 3, walk: false },
      { f: 2, x: 2, z: 3, walk: true }, { f: 2, x: -3, z: -2, walk: false },
    ];
    for (const sp of spots) {
      const look = randomNpcLook(rng);
      look.scale *= this.key === "sph" ? 0.88 : 0.98; // school kids are smaller
      const role = look.hairstyle === "long" || look.hairstyle === "bun" ? "her" : "you";
      const av = new Avatar(role, "", { npcLook: look });
      av.group.position.set(sp.x, 0, sp.z);
      av.group.rotation.y = rng() * Math.PI * 2;
      this["floorGroup" + sp.f].add(av.group);
      this.npcs.push({ avatar: av, f: sp.f, x: sp.x, z: sp.z, walk: sp.walk, dir: rng() * Math.PI * 2, t: 0 });
    }
  }

  // ----------------------------------------------------------- game hooks
  blocked(x, z) {
    const { W, D } = this;
    if (x < -W / 2 + 0.6 || x > W / 2 - 0.6 || z < -D / 2 + 0.6) return true;
    if (z > D / 2 - 0.6) {
      // the front door is open on the ground floor
      if (!(this.floor === 0 && Math.abs(x) < 2.0)) return true;
      if (z > D / 2 + 0.5) return true;
    }
    for (const c of this.colliders[this.floor]) {
      if (Math.abs(x - c.x) < c.hw && Math.abs(z - c.z) < c.hd) return true;
    }
    return false;
  }

  surfaceY() { return this.floor * FLOOR_H; }

  // camera occlusion: only this storey's walls grab the boom
  blockedAt(x, z, y) {
    const fy = this.floor * FLOOR_H;
    if (y < fy - 0.2 || y > fy + FLOOR_H - 0.4) return false;
    return this.blocked(x, z);
  }

  findClearSpot(x, z) { return [x, z]; }

  nearStairs(p) {
    return Math.hypot(p.x - (this.stairPos.x + 2.9), p.z - (this.stairPos.z + 2.9)) < 2.6;
  }

  prompt(p) {
    if (this.nearStairs(p)) {
      const next = (this.floor + 1) % 3;
      return `press E · stairs to ${this.cfg.floors[next]} 🪜`;
    }
    if (this.floor === 0 && Math.hypot(p.x - this.doorPos.x, p.z - this.doorPos.z) < 3) {
      return "press E · head back outside 🌴";
    }
    return null;
  }

  interact(p) {
    if (this.nearStairs(p)) {
      this.floor = (this.floor + 1) % 3;
      this.game.controls.pos.set(this.stairPos.x + 3.4, 0, this.stairPos.z + 3.4);
      this.game.groundY = this.floor * FLOOR_H; // arrive on the landing instantly
      return;
    }
    if (this.floor === 0 && Math.hypot(p.x - this.doorPos.x, p.z - this.doorPos.z) < 3) {
      this.game.exitCampus();
    }
  }

  drawTopic() { /* no dinner cards at school 😄 */ }
  showTopicFromPartner() {}
  updateSun() {}
  attributions() { return ""; }

  tick(t, dt) {
    for (const n of this.npcs) {
      if (!n.walk) { n.avatar.animate(dt, 0, t); continue; }
      n.t -= dt;
      if (n.t <= 0) { n.t = 2 + Math.random() * 3; n.dir += (Math.random() - 0.5) * 2.2; }
      const nx = n.x + Math.sin(n.dir) * dt * 1.1;
      const nz = n.z + Math.cos(n.dir) * dt * 1.1;
      const savedFloor = this.floor;
      this.floor = n.f;
      const nearPlayer = n.f === savedFloor &&
        Math.hypot(nx - this.game.controls.pos.x, nz - this.game.controls.pos.z) < 0.9;
      const hit = this.blocked(nx, nz) || nearPlayer;
      this.floor = savedFloor;
      if (hit) { n.dir += Math.PI / 2 + Math.random(); continue; }
      n.x = nx; n.z = nz;
      n.avatar.group.position.set(nx, 0, nz);
      n.avatar.group.rotation.y = n.dir;
      n.avatar.animate(dt, 1.1, t);
    }
    for (const fn of this.animated) fn(t, dt);
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) { if (m.map) m.map.dispose(); m.dispose(); }
      }
    });
    for (const n of this.npcs) n.avatar.dispose?.();
  }
}
