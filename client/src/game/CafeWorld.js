// Her café — not a restaurant you dine in, a café you RUN together.
// Customers queue at the register, she takes orders, they sit; the two of
// you work the kitchen (pastry case, oven, matcha bar) and run the food
// out. Customers pay and leave happy. Overcooked, but it's her café.
//
// Multiplayer: every meaningful transition is an event ("cafe" kind) —
// spawns come from the leader (lowest session id in the room), order /
// prep-claim / deliver come from whoever did it, pay+leave from the
// leader's timer. NPC walking is computed locally on each client from the
// same state, so nothing heavy crosses the wire.
import * as THREE from "three";
import { Avatar, randomNpcLook } from "./Avatar.js";
import { Net } from "../net.js";
import * as UI from "./ui.js";
import { C, fmt } from "./copy.js";

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// the whole menu is hers: the matcha list he gave, and a bakery case
export const CAFE_MENU = {
  // drinks — made at the matcha bar
  "classic-matcha":        { label: "iced matcha latte",      kind: "drink", color: 0x7fae5a, price: 33 },
  "earl-grey-matcha":      { label: "earl grey matcha",       kind: "drink", color: 0x8aa05e, price: 38 },
  "chamomile-matcha":      { label: "chamomile matcha",       kind: "drink", color: 0xa8b86a, price: 38 },
  "chali-matcha":          { label: "chali matcha",           kind: "drink", color: 0x6f9e52, price: 36 },
  "tongji-jasmine-matcha": { label: "tongji jasmine matcha",  kind: "drink", color: 0x95b271, price: 40 },
  "corn-matcha":           { label: "corn matcha",            kind: "drink", color: 0xc9c25e, price: 39 },
  // bakery — straight from the display case
  "croissant":      { label: "butter croissant",   kind: "case", color: 0xc98e3f, price: 25 },
  "pain-choc":      { label: "pain au chocolat",   kind: "case", color: 0x9a6a3a, price: 27 },
  "egg-tart":       { label: "egg tart",           kind: "case", color: 0xe8c060, price: 18 },
  "pandan-chiffon": { label: "pandan chiffon",     kind: "case", color: 0x9ec47a, price: 24 },
  "banana-bread":   { label: "banana bread",       kind: "case", color: 0xb08648, price: 22 },
  // bakery — warmed in the oven first
  "ensaymada":      { label: "ensaymada",          kind: "warm", color: 0xe9d49a, price: 28 },
  "ube-pandesal":   { label: "ube cheese pandesal", kind: "warm", color: 0x9a6fb8, price: 22 },
  "cinnamon-roll":  { label: "cinnamon roll",      kind: "warm", color: 0xb87a4a, price: 30 },
};
// menu item names are editable in copy.json (prices/colors stay here)
for (const k in CAFE_MENU) { if (C.cafe.menu?.[k]) CAFE_MENU[k].label = C.cafe.menu[k]; }
const DRINKS = Object.keys(CAFE_MENU).filter((k) => CAFE_MENU[k].kind === "drink");
const BAKES = Object.keys(CAFE_MENU).filter((k) => CAFE_MENU[k].kind !== "drink");
const PREP_TIME = { case: 1.2, warm: 2.6, drink: 2.8 };
const PREP_LABEL = C.cafe.prepLabels;

const CUSTOMER_NAMES = ["Putri", "Wira", "Sari", "Dewi", "Agus", "Rina", "Bayu", "Tika", "Andi", "Maya", "Eka", "Nadia", "Rafi", "Intan"];
const COMPLIMENTS = C.cafe.customerCompliments;

export class CafeWorld {
  constructor(scene, poi, city, game) {
    this.scene = scene;
    this.poi = poi;
    this.city = city;
    this.game = game;
    this.group = new THREE.Group();
    this.isInterior = true;
    this.isPhotoreal = false;
    this.isCafe = true;
    this.animated = [];

    this.W = 24;
    this.D = 17;
    this.data = { radius: Math.max(this.W, this.D) };

    // service state (shared via events)
    this.customers = [];   // {id, seed, name, avatar, state, queueSlot, table, order, served, foods, path, t}
    this.earnings = 0;
    this.servedCount = 0;
    this.nextId = 1;
    this.spawnT = 4;       // leader: first customer arrives quickly
    this.carrying = null;  // {key, mesh}
    this.remoteCarry = null; // partner's carried item mesh
    this.prep = null;      // {item, station, until, cid}

    // layout anchors
    this.door = { x: 0, z: this.D / 2 - 0.9 };
    this.register = { x: -1.6, z: -2.2 };
    this.orderSpot = { x: -1.6, z: -0.9 };
    this.queueSlots = [
      { x: -1.6, z: 0.4 }, { x: -1.6, z: 1.7 }, { x: -1.6, z: 3.0 }, { x: -0.4, z: 4.2 },
    ];
    this.stations = {
      case:  { x: -6.0, z: -3.3, label: C.cafe.stations.case },   // service side of the counter
      warm:  { x: -7.0, z: -6.4, label: C.cafe.stations.warm },
      drink: { x: -2.5, z: -6.4, label: C.cafe.stations.drink },
      pass:  { x: -4.6, z: -6.4, label: C.cafe.stations.pass },
    };
    this.tables = [
      { x: 3, z: -4 }, { x: 7.5, z: -4 }, { x: 3, z: -0.5 },
      { x: 7.5, z: -0.5 }, { x: 3, z: 3 }, { x: 7.5, z: 3 },
    ].map((t, i) => ({ ...t, i, taken: false, foods: [] }));
  }

  // --------------------------------------------------------------- build
  async build(onProgress) {
    onProgress?.(0.3, C.cafe.loadProgress.open);
    const { W, D } = this;
    const g = this.group;

    // shell — warm cream walls, sage accents, terrazzo-ish floor
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshLambertMaterial({ map: this._floorTex() }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    g.add(floor);
    const wallMat = new THREE.MeshLambertMaterial({ color: 0xf2ead8 });
    const sageMat = new THREE.MeshLambertMaterial({ color: 0x8fa882 });
    const mkWall = (w, x, z, ry, mat = wallMat) => {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, 4.4), mat);
      wall.position.set(x, 2.2, z); wall.rotation.y = ry; g.add(wall);
    };
    mkWall(W, 0, -D / 2, 0, sageMat);          // back wall: her sage green
    mkWall(W, 0, D / 2, Math.PI);
    mkWall(D, -W / 2, 0, Math.PI / 2);
    mkWall(D, W / 2, 0, -Math.PI / 2);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshLambertMaterial({ color: 0xe8e2d2 }));
    ceil.rotation.x = Math.PI / 2; ceil.position.y = 4.4; g.add(ceil);

    // front: glass + door + daylight outside
    const outside = new THREE.MeshBasicMaterial({ color: 0xbcd8ec });
    for (const wx of [-W / 4 - 2, -W / 4 + 2.6, W / 4 - 2.6, W / 4 + 2]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.2), outside);
      win.position.set(wx, 2.2, D / 2 - 0.04); win.rotation.y = Math.PI; g.add(win);
    }
    const door = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 3), new THREE.MeshLambertMaterial({ color: 0x4a5e46 }));
    door.position.set(0, 1.5, D / 2 - 0.05); door.rotation.y = Math.PI; g.add(door);

    onProgress?.(0.5, C.cafe.loadProgress.stocking);
    this._buildCounter();
    this._buildKitchen();
    this._buildMenuBoard();
    this._buildNameSign();

    // tables + chairs + plants
    const wood = new THREE.MeshLambertMaterial({ color: 0x8a6a48 });
    for (const t of this.tables) {
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.05, 14), new THREE.MeshLambertMaterial({ color: 0xe8dcc4 }));
      top.position.set(t.x, 0.76, t.z); top.castShadow = true; g.add(top);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.76, 8), wood);
      leg.position.set(t.x, 0.38, t.z); g.add(leg);
      for (const side of [-1, 1]) {
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.05, 0.44), wood);
        seat.position.set(t.x + side * 1.0, 0.48, t.z); g.add(seat);
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.44), wood);
        back.position.set(t.x + side * 1.21, 0.78, t.z); g.add(back);
        for (const lx of [-0.16, 0.16]) for (const lz of [-0.16, 0.16]) {
          const cl = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.48, 0.045), wood);
          cl.position.set(t.x + side * 1.0 + lx, 0.24, t.z + lz); g.add(cl);
        }
      }
    }
    // plants in the corners + a shelf of them (she loves this)
    for (const [px, pz] of [[W / 2 - 1.2, D / 2 - 1.2], [W / 2 - 1.2, -D / 2 + 1.2], [-W / 2 + 1.2, D / 2 - 1.2], [10.8, -0.5]]) {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.2, 0.42, 10), new THREE.MeshLambertMaterial({ color: 0xc9b8a0 }));
      pot.position.set(px, 0.21, pz); g.add(pot);
      const leaves = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), new THREE.MeshLambertMaterial({ color: 0x4a7a3e }));
      leaves.scale.y = 1.5; leaves.position.set(px, 1.05, pz); g.add(leaves);
    }

    // lighting: bright, milky daylight café
    g.add(new THREE.AmbientLight(0xfff6e8, 0.95));
    g.add(new THREE.HemisphereLight(0xeaf2f8, 0x8a8070, 0.55));
    for (const lx of [-6, 0, 6]) {
      const lamp = new THREE.PointLight(0xffeed8, 10, 11, 1.9);
      lamp.position.set(lx, 3.6, 0.5);
      g.add(lamp);
      const shade = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshLambertMaterial({ color: 0xf6ead0, emissive: 0xffe8c0, emissiveIntensity: 0.5 }));
      shade.position.set(lx, 3.6, 0.5); g.add(shade);
    }

    this.scene.add(this.group);
    onProgress?.(1, C.cafe.loadProgress.ready);

    // late joiner? ask the room for the current shift
    this._send({ a: "hello" });
    setTimeout(() => {
      UI.addSystem(C.cafe.openMessage);
    }, 800);
    return this;
  }

  _floorTex() {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#ddd2bc"; ctx.fillRect(0, 0, 256, 256);
    // terrazzo chips
    const rng = mulberry32(77);
    for (let i = 0; i < 250; i++) {
      ctx.fillStyle = ["#b8a888", "#8fa882", "#c9b8a0", "#a89878"][Math.floor(rng() * 4)];
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(rng() * 256, rng() * 256, 1 + rng() * 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(this.W / 6, this.D / 6);
    return tex;
  }

  _buildCounter() {
    const g = this.group;
    // service counter from the left wall to the kitchen gap
    const body = new THREE.Mesh(new THREE.BoxGeometry(8.4, 1.04, 0.7), new THREE.MeshLambertMaterial({ color: 0x6a7a5e }));
    body.position.set(-4.8, 0.52, -2.2); body.castShadow = true; g.add(body);
    const top = new THREE.Mesh(new THREE.BoxGeometry(8.7, 0.06, 0.92), new THREE.MeshLambertMaterial({ color: 0xe8dcc4 }));
    top.position.set(-4.8, 1.07, -2.2); g.add(top);

    // glass pastry case sitting on the counter (left half)
    const caseGlass = new THREE.Mesh(
      new THREE.BoxGeometry(3.6, 0.8, 0.86),
      new THREE.MeshLambertMaterial({ color: 0xcfe0e8, transparent: true, opacity: 0.35 })
    );
    caseGlass.position.set(-6.2, 1.52, -2.2); g.add(caseGlass);
    const caseLight = new THREE.PointLight(0xffd9a0, 5, 3.2, 2);
    caseLight.position.set(-6.2, 1.7, -2.0); g.add(caseLight);
    // pastries inside, two shelves
    const rng = mulberry32(42);
    for (let s = 0; s < 2; s++) {
      for (let i = 0; i < 6; i++) {
        const key = BAKES[(s * 6 + i) % BAKES.length];
        const m = this._foodMesh(key, 0.8);
        m.position.set(-7.7 + i * 0.62, 1.2 + s * 0.34, -2.2 + (rng() - 0.5) * 0.3);
        g.add(m);
      }
    }

    // register at the right end of the counter
    const reg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.34, 0.4), new THREE.MeshLambertMaterial({ color: 0x32302c }));
    reg.position.set(this.register.x, 1.27, this.register.z); g.add(reg);
    const regScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.26), new THREE.MeshBasicMaterial({ color: 0x9adfb8 }));
    regScreen.position.set(this.register.x, 1.32, this.register.z + 0.21);
    g.add(regScreen);
    // a little vase
    const vase = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.18, 8), new THREE.MeshLambertMaterial({ color: 0xcfdcd4 }));
    vase.position.set(-3.2, 1.19, -2.2); g.add(vase);
    const flower = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), new THREE.MeshLambertMaterial({ color: 0xff9db8 }));
    flower.position.set(-3.2, 1.36, -2.2); g.add(flower);
  }

  _buildKitchen() {
    const g = this.group;
    const backZ = -this.D / 2 + 0.55;
    const steelMat = new THREE.MeshLambertMaterial({ color: 0xb8bcc0 });
    // back bench along the wall
    const bench = new THREE.Mesh(new THREE.BoxGeometry(10.5, 0.95, 1.0), steelMat);
    bench.position.set(-4.6, 0.47, backZ); g.add(bench);
    const benchTop = new THREE.Mesh(new THREE.BoxGeometry(10.7, 0.05, 1.1), new THREE.MeshLambertMaterial({ color: 0xd8dcde }));
    benchTop.position.set(-4.6, 0.97, backZ); g.add(benchTop);

    // oven — glowing window, steam when warming
    const oven = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.7, 0.95), new THREE.MeshLambertMaterial({ color: 0x44464a }));
    oven.position.set(-7.0, 0.85, backZ); g.add(oven);
    const ovenWin = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.5), new THREE.MeshBasicMaterial({ color: 0xff9a4a }));
    ovenWin.position.set(-7.0, 0.95, backZ + 0.49); g.add(ovenWin);
    this.ovenGlow = new THREE.PointLight(0xff8a3c, 3, 3, 2);
    this.ovenGlow.position.set(-7.0, 1.2, backZ + 0.7); g.add(this.ovenGlow);
    this.animated.push((t) => { this.ovenGlow.intensity = 2.4 + Math.sin(t * 9) * 0.8 + (this.prep?.station === "warm" ? 4 : 0); });

    // matcha bar — kettle, bowls, and the canister lineup with real labels
    const kettle = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.3, 10), new THREE.MeshLambertMaterial({ color: 0x8a8e92 }));
    kettle.position.set(-1.6, 1.14, backZ); g.add(kettle);
    for (let i = 0; i < DRINKS.length; i++) {
      const can = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11, 0.11, 0.3, 10),
        new THREE.MeshLambertMaterial({ color: CAFE_MENU[DRINKS[i]].color })
      );
      can.position.set(-3.6 + i * 0.34, 1.14, backZ - 0.1); g.add(can);
    }
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.1, 0.12, 12), new THREE.MeshLambertMaterial({ color: 0x4a6e44 }));
    bowl.position.set(-2.4, 1.05, backZ + 0.25); g.add(bowl);
    // whisk (chasen) — spins while someone's making a drink
    this.whisk = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.06, 0.16, 8), new THREE.MeshLambertMaterial({ color: 0xd8c49a }));
    this.whisk.position.set(-2.4, 1.2, backZ + 0.25); g.add(this.whisk);
    this.animated.push((t, dt) => {
      if (this.prep?.station === "drink" || this.remotePrepStation === "drink") this.whisk.rotation.y += dt * 22;
    });

    // espresso machine for show
    const espresso = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.6), new THREE.MeshLambertMaterial({ color: 0x2e3034 }));
    espresso.position.set(-0.3, 1.26, backZ); g.add(espresso);

    // steam drifting off the kettle
    const steam = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 }));
    steam.position.set(-1.6, 1.4, backZ); g.add(steam);
    this.animated.push((t) => {
      const k = (t * 0.5) % 1;
      steam.position.y = 1.35 + k * 0.8;
      steam.material.opacity = 0.3 * (1 - k);
      steam.scale.setScalar(0.7 + k * 1.4);
    });
  }

  _buildMenuBoard() {
    const c = document.createElement("canvas");
    c.width = 760; c.height = 420;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#3c4438"; ctx.fillRect(0, 0, 760, 420);
    ctx.strokeStyle = "rgba(238,228,200,0.5)"; ctx.lineWidth = 5;
    ctx.strokeRect(10, 10, 740, 400);
    ctx.fillStyle = "#eee4c8";
    ctx.font = "italic 600 34px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText("— matcha —", 200, 64);
    ctx.fillText("— bakery —", 565, 64);
    ctx.font = "22px Georgia, serif";
    ctx.textAlign = "left";
    DRINKS.forEach((k, i) => {
      const it = CAFE_MENU[k];
      ctx.fillText(it.label, 56, 110 + i * 42);
      ctx.textAlign = "right"; ctx.fillText(`${it.price}k`, 350, 110 + i * 42); ctx.textAlign = "left";
    });
    BAKES.forEach((k, i) => {
      const it = CAFE_MENU[k];
      ctx.fillText(it.label, 420, 110 + i * 36);
      ctx.textAlign = "right"; ctx.fillText(`${it.price}k`, 716, 110 + i * 36); ctx.textAlign = "left";
    });
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 3.6), new THREE.MeshLambertMaterial({ map: tex }));
    board.position.set(-4.2, 2.4, -this.D / 2 + 0.06);
    this.group.add(board);
  }

  _buildNameSign() {
    const c = document.createElement("canvas");
    c.width = 560; c.height = 120;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#f2ead8"; ctx.fillRect(0, 0, 560, 120);
    ctx.font = "italic 600 54px Georgia, serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = "#5a6e50";
    ctx.fillText(`${this.poi.n} ☕`, 280, 60);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.0), new THREE.MeshBasicMaterial({ map: tex }));
    sign.position.set(6.5, 3.1, -this.D / 2 + 0.07);
    this.group.add(sign);
    // soft neon underline
    const bar = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.06, 0.05), new THREE.MeshBasicMaterial({ color: 0xffc9d8 }));
    bar.position.set(6.5, 2.5, -this.D / 2 + 0.08);
    this.group.add(bar);
  }

  _foodMesh(key, scale = 1) {
    const it = CAFE_MENU[key];
    const grp = new THREE.Group();
    if (it.kind === "drink") {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.065, 0.24, 10), new THREE.MeshLambertMaterial({ color: 0xeef2ee, transparent: true, opacity: 0.55 }));
      cup.position.y = 0.12; grp.add(cup);
      const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.06, 0.17, 10), new THREE.MeshLambertMaterial({ color: it.color }));
      liquid.position.y = 0.1; grp.add(liquid);
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 10), new THREE.MeshLambertMaterial({ color: 0xf6f2ea }));
      lid.position.y = 0.255; grp.add(lid);
    } else {
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.025, 12), new THREE.MeshLambertMaterial({ color: 0xf0ece2 }));
      grp.add(plate);
      let food;
      if (key === "croissant" || key === "cinnamon-roll") {
        food = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.035, 6, 10, Math.PI * 1.6), new THREE.MeshLambertMaterial({ color: it.color }));
        food.rotation.x = -Math.PI / 2; food.position.y = 0.05;
      } else if (key === "egg-tart") {
        food = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.06, 0.05, 10), new THREE.MeshLambertMaterial({ color: it.color }));
        food.position.y = 0.04;
      } else if (key === "pandan-chiffon") {
        food = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.1, 4), new THREE.MeshLambertMaterial({ color: it.color }));
        food.position.y = 0.07;
      } else {
        food = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), new THREE.MeshLambertMaterial({ color: it.color }));
        food.scale.y = 0.62; food.position.y = 0.055;
        if (key === "ensaymada") { // cheese on top
          const cheese = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.02, 8), new THREE.MeshLambertMaterial({ color: 0xf6e6a8 }));
          cheese.position.y = 0.105; grp.add(cheese);
        }
      }
      grp.add(food);
    }
    grp.scale.setScalar(scale);
    return grp;
  }

  // ----------------------------------------------------------- customers
  _isLeader() {
    const r = this.game.remoteState;
    if (r && r.world === this.game.worldKey && r.id && Net.sessionId) {
      return Net.sessionId < r.id;
    }
    return true; // alone (or offline): you run the floor
  }

  _send(data) { Net.sendEvent("cafe", data); }

  // both local actions and partner events land here, so every client
  // applies the exact same transitions
  apply(ev) {
    if (ev.a === "spawn") this._spawnCustomer(ev.id, ev.seed, ev.n);
    else if (ev.a === "order") this._applyOrder(ev.cid, ev.items, ev.table);
    else if (ev.a === "claim") this._applyClaim(ev.cid, ev.item, ev.who);
    else if (ev.a === "unclaim") this._applyUnclaim(ev.cid, ev.item);
    else if (ev.a === "carry") this._applyRemoteCarry(ev.item);
    else if (ev.a === "prepstation") this.remotePrepStation = ev.s;
    else if (ev.a === "deliver") this._applyDeliver(ev.cid, ev.item);
    else if (ev.a === "pay") this._applyPay(ev.cid, ev.amt, ev.line);
    else if (ev.a === "hello") {
      if (this._isLeader()) {
        this._send({ a: "snap", s: this._snapshot() });
      }
    } else if (ev.a === "snap") {
      if (!this._snapApplied && this.customers.length === 0 && ev.s.customers.length) {
        this._applySnapshot(ev.s);
      }
      this._snapApplied = true;
    }
  }

  _snapshot() {
    return {
      customers: this.customers.map((c) => ({
        id: c.id, seed: c.seed, n: c.name, state: c.state,
        queueSlot: c.queueSlot, table: c.table?.i ?? null,
        order: c.order, served: c.served,
      })),
      earnings: this.earnings,
      servedCount: this.servedCount,
      nextId: this.nextId,
    };
  }

  _applySnapshot(s) {
    this.earnings = s.earnings;
    this.servedCount = s.servedCount;
    this.nextId = s.nextId;
    for (const cs of s.customers) {
      const c = this._spawnCustomer(cs.id, cs.seed, cs.n, true);
      c.state = cs.state === "enter" ? "enter" : cs.state;
      c.queueSlot = cs.queueSlot;
      c.order = cs.order ?? [];
      c.served = cs.served ?? [];
      if (cs.table !== null && cs.table !== undefined) {
        c.table = this.tables[cs.table];
        c.table.taken = true;
      }
      // place them roughly where they belong; walking logic settles the rest
      const g = c.avatar.group;
      if (c.state === "queue" || c.state === "ordering") {
        const s2 = c.state === "ordering" ? this.orderSpot : this.queueSlots[Math.min(c.queueSlot, 3)];
        g.position.set(s2.x, 0, s2.z);
      } else if (c.table) {
        g.position.set(c.table.x, 0, c.table.z + 1.0);
        if (c.state === "seated" || c.state === "eating") this._seatCustomer(c);
        // re-place already-delivered food
        c.order.forEach((k, i) => { if (c.served[i]) this._placeFoodAt(c, k); });
      }
    }
    this._updateHud();
  }

  _spawnCustomer(id, seed, name, silent = false) {
    if (this.customers.some((c) => c.id === id)) return this.customers.find((c) => c.id === id);
    const rng = mulberry32(seed);
    const look = randomNpcLook(rng);
    const avatar = new Avatar(rng() > 0.5 ? "her" : "you", "", { npcLook: look });
    avatar.group.position.set(this.door.x, 0, this.door.z);
    this.scene.add(avatar.group);
    const c = {
      id, seed, name, avatar, rng,
      state: "enter", queueSlot: -1, table: null,
      order: [], served: [], t: 0, path: [], speed: 0,
    };
    this.customers.push(c);
    if (id >= this.nextId) this.nextId = id + 1;
    if (!silent) this._routeToQueue(c);
    return c;
  }

  _routeToQueue(c) {
    // take the first free queue slot
    const used = new Set(this.customers.filter((o) => o !== c && (o.state === "queue")).map((o) => o.queueSlot));
    let slot = 0;
    while (used.has(slot) && slot < this.queueSlots.length - 1) slot++;
    c.queueSlot = slot;
    c.state = "queue";
    const s = this.queueSlots[slot];
    c.path = [new THREE.Vector3(0.8, 0, 3.6), new THREE.Vector3(s.x, 0, s.z)];
  }

  _frontCustomer() {
    let best = null;
    for (const c of this.customers) {
      if (c.state !== "queue") continue;
      if (!best || c.queueSlot < best.queueSlot) best = c;
    }
    return best;
  }

  _makeOrder(c) {
    // 1 drink, often + a pastry; regular celebrities of her menu
    const rng = mulberry32(c.seed ^ 0x9e3779b9);
    const items = [DRINKS[Math.floor(rng() * DRINKS.length)]];
    if (rng() < 0.7) items.push(BAKES[Math.floor(rng() * BAKES.length)]);
    return items;
  }

  takeOrder() {
    const c = this._frontCustomer();
    if (!c) return;
    const free = this.tables.filter((t) => !t.taken);
    if (!free.length) { UI.addSystem(C.cafe.noFreeTables); return; }
    const items = this._makeOrder(c);
    const table = free[Math.floor(mulberry32(c.seed ^ 0x51ab)( ) * free.length)].i;
    const ev = { a: "order", cid: c.id, items, table };
    this.apply(ev);
    this._send(ev);
  }

  _applyOrder(cid, items, tableIdx) {
    const c = this.customers.find((o) => o.id === cid);
    if (!c || c.state !== "queue" && c.state !== "ordering") return;
    c.order = items;
    c.served = items.map(() => false);
    c.table = this.tables[tableIdx];
    c.table.taken = true;
    c.state = "toTable";
    c.avatar.say(fmt(C.cafe.customerOrder, { items: items.map((k) => CAFE_MENU[k].label).join(" + ") }));
    c.path = [
      new THREE.Vector3(0.8, 0, 1.5),
      new THREE.Vector3(c.table.x, 0, c.table.z + 1.6),
    ];
    // queue shuffles forward
    for (const o of this.customers) {
      if (o.state === "queue" && o.queueSlot > 0) {
        o.queueSlot--;
        const s = this.queueSlots[o.queueSlot];
        o.path = [new THREE.Vector3(s.x, 0, s.z)];
      }
    }
    this._updateHud();
  }

  _seatCustomer(c) {
    const t = c.table;
    const side = t.x > c.avatar.group.position.x ? -1 : 1;
    c.avatar.group.position.set(t.x + side * 1.0, 0.2, t.z);
    c.avatar.group.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    c.path = [];
    c.state = c.served.every(Boolean) && c.served.length ? "eating" : "seated";
    c.t = 0;
  }

  // ------------------------------------------------------------ kitchen
  _neededAt(stationKind) {
    // oldest unserved+unclaimed item that this station makes
    for (const c of this.customers) {
      if (!["toTable", "seated", "eating"].includes(c.state)) continue;
      for (let i = 0; i < c.order.length; i++) {
        if (c.served[i]) continue;
        const key = c.order[i];
        if (c.claimed?.[i]) continue;
        const kind = CAFE_MENU[key].kind;
        if (kind === stationKind || (stationKind === "case" && kind === "case") ) {
          if (kind === stationKind) return { c, i, key };
        }
      }
    }
    return null;
  }

  _applyClaim(cid, item, who) {
    const c = this.customers.find((o) => o.id === cid);
    if (!c) return;
    c.claimed = c.claimed ?? {};
    const i = c.order.findIndex((k, idx) => k === item && !c.served[idx] && !c.claimed[idx]);
    if (i >= 0) c.claimed[i] = who;
  }

  _applyUnclaim(cid, item) {
    const c = this.customers.find((o) => o.id === cid);
    if (!c?.claimed) return;
    for (const [i, who] of Object.entries(c.claimed)) {
      if (c.order[i] === item && !c.served[i]) { delete c.claimed[i]; return; }
    }
  }

  _startPrep(stationKind) {
    const need = this._neededAt(stationKind);
    if (!need) return;
    const ev = { a: "claim", cid: need.c.id, item: need.key, who: Net.sessionId ?? "me" };
    this.apply(ev); this._send(ev);
    this._send({ a: "prepstation", s: stationKind });
    this.prep = {
      item: need.key, cid: need.c.id, station: stationKind,
      until: PREP_TIME[stationKind], total: PREP_TIME[stationKind],
    };
  }

  _finishPrep() {
    const p = this.prep;
    this.prep = null;
    this._send({ a: "prepstation", s: null });
    // pick it up
    const mesh = this._foodMesh(p.item, 0.9);
    this.carrying = { key: p.item, cid: p.cid, mesh };
    this.game.avatar.group.add(mesh);
    mesh.position.set(0.32, 0.95, 0.3);
    this._send({ a: "carry", item: p.item });
    UI.addSystem(fmt(C.cafe.itemReady, { item: CAFE_MENU[p.item].label }));
  }

  _cancelPrep() {
    if (!this.prep) return;
    const ev = { a: "unclaim", cid: this.prep.cid, item: this.prep.item };
    this.apply(ev); this._send(ev);
    this._send({ a: "prepstation", s: null });
    this.prep = null;
  }

  _putBack() {
    if (!this.carrying) return;
    const ev = { a: "unclaim", cid: this.carrying.cid, item: this.carrying.key };
    this.apply(ev); this._send(ev);
    this.game.avatar.group.remove(this.carrying.mesh);
    this.carrying = null;
    this._send({ a: "carry", item: null });
  }

  _applyRemoteCarry(item) {
    const remote = this.game.remote;
    if (this.remoteCarry) {
      this.remoteCarry.parent?.remove(this.remoteCarry);
      this.remoteCarry = null;
    }
    if (item && remote) {
      this.remoteCarry = this._foodMesh(item, 0.9);
      remote.avatar.group.add(this.remoteCarry);
      this.remoteCarry.position.set(0.32, 0.95, 0.3);
    }
  }

  _deliver() {
    if (!this.carrying) return;
    // nearest customer this item belongs to
    const p = this.game.controls.pos;
    for (const c of this.customers) {
      if (!c.table || !["seated", "eating", "toTable"].includes(c.state)) continue;
      if (Math.hypot(c.table.x - p.x, c.table.z - p.z) > 2.6) continue;
      const i = c.order.findIndex((k, idx) => k === this.carrying.key && !c.served[idx]);
      if (i < 0) continue;
      const ev = { a: "deliver", cid: c.id, item: this.carrying.key };
      this.game.avatar.group.remove(this.carrying.mesh);
      this.carrying = null;
      this._send({ a: "carry", item: null });
      this.apply(ev); this._send(ev);
      return;
    }
    UI.addSystem(C.cafe.nobodyOrderedThat);
  }

  _applyDeliver(cid, item) {
    const c = this.customers.find((o) => o.id === cid);
    if (!c) return;
    const i = c.order.findIndex((k, idx) => k === item && !c.served[idx]);
    if (i < 0) return;
    c.served[i] = true;
    if (c.claimed) delete c.claimed[i];
    this._placeFoodAt(c, item);
    if (c.served.every(Boolean)) {
      c.state = "eating";
      c.t = 0;
      c.avatar.say(C.cafe.customerEating[c.id % C.cafe.customerEating.length]);
    }
    this._updateHud();
  }

  _placeFoodAt(c, key) {
    const t = c.table;
    if (!t) return;
    const m = this._foodMesh(key, 0.95);
    m.position.set(t.x + (t.foods.length ? -0.28 : 0.18), 0.79, t.z + (t.foods.length ? 0.15 : -0.1));
    this.group.add(m);
    t.foods.push(m);
  }

  _applyPay(cid, amt, line) {
    const c = this.customers.find((o) => o.id === cid);
    if (!c || c.state === "leaving") return; // idempotent: never double-count a payment
    this.earnings += amt;
    this.servedCount++;
    c.state = "leaving";
    c.avatar.say(fmt(C.cafe.customerPaying, { amt, line }));
    if (c.table) {
      for (const m of c.table.foods) this.group.remove(m);
      c.table.foods = [];
      c.table.taken = false;
      c.table = null;
    }
    c.avatar.group.position.y = 0;
    c.path = [new THREE.Vector3(0.8, 0, 3.4), new THREE.Vector3(this.door.x, 0, this.door.z)];
    this._updateHud();
    // threshold (not exact equality) so it still fires if a count is missed
    if (this.servedCount >= 5 && !this._rushShown) {
      this._rushShown = true;
      UI.setBanner(C.cafe.firstRushBanner);
      setTimeout(() => UI.setBanner(null), 4000);
    }
  }

  _updateHud() {
    const el = document.getElementById("cafe-stats");
    if (!el) return;
    const open = this.customers.filter((c) => ["queue", "ordering", "toTable", "seated"].includes(c.state)).length;
    el.style.display = "block";
    el.innerHTML = `☕ <b>Rp ${this.earnings}.000</b> · ${this.servedCount} happy customer${this.servedCount === 1 ? "" : "s"}` +
      (open ? ` · ${open} waiting` : "");
    // ticket rail
    const rail = document.getElementById("cafe-tickets");
    rail.style.display = "flex";
    rail.innerHTML = "";
    for (const c of this.customers) {
      if (!["toTable", "seated", "eating"].includes(c.state) || !c.order.length) continue;
      if (c.served.every(Boolean)) continue;
      const div = document.createElement("div");
      div.className = "ticket";
      div.innerHTML = `<b>${c.name}</b>` + c.order.map((k, i) =>
        `<span class="${c.served[i] ? "done" : ""}">${CAFE_MENU[k].label}</span>`).join("");
      rail.appendChild(div);
    }
  }

  // ---------------------------------------------------- player interface
  interact(p) {
    const near = (x, z, r) => Math.hypot(x - p.x, z - p.z) < r;
    // door
    if (near(this.door.x, this.door.z, 2.2)) { this.game.exitCafe(); return true; }
    // register: take the next order
    if (near(this.register.x, this.register.z - 0.0, 2.0) && this._frontCustomer()) {
      this.takeOrder();
      return true;
    }
    // deliver to a table
    if (this.carrying) {
      for (const c of this.customers) {
        if (c.table && ["seated", "eating", "toTable"].includes(c.state) &&
            near(c.table.x, c.table.z, 2.6) &&
            c.order.some((k, i) => k === this.carrying.key && !c.served[i])) {
          this._deliver();
          return true;
        }
      }
      // put it back at the prep counter
      if (near(this.stations.pass.x, this.stations.pass.z, 2.0)) { this._putBack(); UI.addSystem(C.cafe.setItDownShared); return true; }
      return false;
    }
    // stations
    if (this.prep) return false; // already making something
    for (const [kind, s] of Object.entries(this.stations)) {
      if (kind === "pass") continue;
      if (near(s.x, s.z, 1.9) && this._neededAt(kind)) {
        this._startPrep(kind);
        return true;
      }
    }
    return false;
  }

  prompt(p) {
    const near = (x, z, r) => Math.hypot(x - p.x, z - p.z) < r;
    if (this.prep) {
      const done = 1 - this.prep.until / this.prep.total;
      const bars = "▓".repeat(Math.round(done * 8)).padEnd(8, "░");
      return `${PREP_LABEL[this.prep.station]} ${bars}`;
    }
    if (this.carrying) {
      for (const c of this.customers) {
        if (c.table && ["seated", "eating", "toTable"].includes(c.state) &&
            near(c.table.x, c.table.z, 2.6) &&
            c.order.some((k, i) => k === this.carrying.key && !c.served[i])) {
          return fmt(C.cafe.serveCustomer, { name: c.name, item: CAFE_MENU[this.carrying.key].label });
        }
      }
      if (near(this.stations.pass.x, this.stations.pass.z, 2.0)) return C.cafe.promptSetDown;
      return fmt(C.cafe.carryingTo, { item: CAFE_MENU[this.carrying.key].label });
    }
    if (near(this.register.x, this.register.z, 2.0)) {
      const c = this._frontCustomer();
      return c ? fmt(C.cafe.promptTakeOrder, { name: c.name }) : C.cafe.registerIdle;
    }
    for (const [kind, s] of Object.entries(this.stations)) {
      if (kind === "pass") continue;
      if (near(s.x, s.z, 1.9)) {
        const need = this._neededAt(kind);
        return need
          ? fmt(C.cafe.makeItem, { item: CAFE_MENU[need.key].label, station: s.label })
          : fmt(C.cafe.stationIdle, { station: s.label });
      }
    }
    if (near(this.door.x, this.door.z, 2.2)) return C.cafe.promptStepOut;
    return null;
  }

  drawTopic() { UI.addSystem(C.cafe.noTimeForCards); }
  showTopicFromPartner() {}

  blocked(x, z) {
    if (Math.abs(x) > this.W / 2 - 0.55 || Math.abs(z) > this.D / 2 - 0.55) return true;
    // counter (players walk around through the gap at x ≈ -0.2..1.4)
    if (x > -9.2 && x < -0.5 && z > -2.75 && z < -1.65) return true;
    // pastry case on top of it already covered; kitchen back bench
    if (x > -9.9 && x < 0.6 && z < -this.D / 2 + 1.25) return true;
    // tables
    for (const t of this.tables) {
      if (Math.hypot(t.x - x, t.z - z) < 0.85) return true;
    }
    return false;
  }
  blockedAt(x, z, y) { return y < 4.2 && this.blocked(x, z); }
  findClearSpot(x, z) { return [x, z]; }
  groundHeight() { return 0; }
  updateSun() {}
  attributions() { return ""; }

  _npcBlocked(x, z) {
    if (this.blocked(x, z)) return true;
    const me = this.game.avatar.group.position;
    if (Math.hypot(me.x - x, me.z - z) < 0.7) return true;
    const them = this.game.remote?.avatar.group.position;
    if (them && Math.hypot(them.x - x, them.z - z) < 0.7) return true;
    return false;
  }

  // ----------------------------------------------------------------- tick
  tick(t, dt) {
    for (const fn of this.animated) fn(t, dt);

    // prep timer
    if (this.prep) {
      const s = this.stations[this.prep.station];
      const p = this.game.controls.pos;
      if (Math.hypot(s.x - p.x, s.z - p.z) > 2.6) {
        UI.addSystem(fmt(C.cafe.steppedAway, { item: CAFE_MENU[this.prep.item].label }));
        this._cancelPrep();
      } else {
        this.prep.until -= dt;
        if (this.prep.until <= 0) this._finishPrep();
      }
    }

    // the leader brings customers in
    if (this._isLeader()) {
      const queueing = this.customers.filter((c) => c.state === "queue").length;
      const active = this.customers.filter((c) => c.state !== "leaving").length;
      this.spawnT -= dt;
      if (this.spawnT <= 0 && queueing < 3 && active < 7) {
        this.spawnT = 7 + Math.random() * 9;
        const id = this.nextId++;
        const ev = {
          a: "spawn", id,
          // deterministic from id only, so a late-join snapshot reproduces the
          // exact same customer (look/order/table) on every client
          seed: (Math.imul(id, 2654435761)) >>> 0,
          n: CUSTOMER_NAMES[id % CUSTOMER_NAMES.length],
        };
        this.apply(ev); this._send(ev);
      }
      // eaters pay & leave on the leader's clock
      for (const c of this.customers) {
        if (c.state === "eating" && c.t > 7) {
          const amt = c.order.reduce((s2, k) => s2 + CAFE_MENU[k].price, 0);
          const ev = {
            a: "pay", cid: c.id, amt,
            line: COMPLIMENTS[(c.id + this.servedCount) % COMPLIMENTS.length],
          };
          this.apply(ev); this._send(ev);
        }
      }
    }

    // walk + animate the customers
    for (const c of this.customers) {
      c.t += dt;
      const g = c.avatar.group;
      const wp = c.path?.[0];
      if (wp) {
        const dx = wp.x - g.position.x, dz = wp.z - g.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.22) {
          const baseAng = Math.atan2(dx, dz);
          let moved = false;
          for (const off of [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6]) {
            const a = baseAng + off;
            const nx = g.position.x + Math.sin(a) * 2.2 * dt;
            const nz = g.position.z + Math.cos(a) * 2.2 * dt;
            const lx = g.position.x + Math.sin(a) * 0.5;
            const lz = g.position.z + Math.cos(a) * 0.5;
            if (dist > 1.2 && (this._npcBlocked(nx, nz) || this._npcBlocked(lx, lz))) continue;
            g.position.x = nx; g.position.z = nz;
            g.rotation.y = a;
            moved = true;
            break;
          }
          c.speed = moved ? 2.2 : 0;
        } else {
          c.path.shift();
          c.speed = 0;
          if (!c.path.length) {
            if (c.state === "toTable") this._seatCustomer(c);
            else if (c.state === "leaving") {
              this.scene.remove(g);
              c.avatar.dispose();
              c.gone = true;
            }
          }
        }
      } else {
        c.speed = 0;
        if (c.state === "queue") {
          // face the register
          const s = this.queueSlots[Math.min(c.queueSlot, 3)];
          if (Math.hypot(g.position.x - s.x, g.position.z - s.z) > 0.4) {
            c.path = [new THREE.Vector3(s.x, 0, s.z)];
          }
          g.rotation.y += (Math.PI - g.rotation.y) * Math.min(1, dt * 4) * 0; // keep natural
          const want = Math.atan2(this.register.x - g.position.x, this.register.z - g.position.z);
          let dh = want - g.rotation.y;
          while (dh > Math.PI) dh -= Math.PI * 2;
          while (dh < -Math.PI) dh += Math.PI * 2;
          g.rotation.y += dh * Math.min(1, dt * 5);
        }
      }
      c.avatar.animate(dt, c.speed, t);
    }
    const before = this.customers.length;
    this.customers = this.customers.filter((c) => !c.gone);
    if (this.customers.length !== before) this._updateHud();
  }

  dispose() {
    this.scene.remove(this.group);
    for (const c of this.customers) {
      this.scene.remove(c.avatar.group);
      c.avatar.dispose();
    }
    if (this.carrying) this.game.avatar.group.remove(this.carrying.mesh);
    this._applyRemoteCarry(null);
    const stats = document.getElementById("cafe-stats");
    if (stats) stats.style.display = "none";
    const rail = document.getElementById("cafe-tickets");
    if (rail) rail.style.display = "none";
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) { if (m.map) m.map.dispose(); m.dispose(); }
      }
    });
  }
}
