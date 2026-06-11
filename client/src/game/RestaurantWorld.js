// An enterable restaurant interior, unique per real-world restaurant:
// themed by cuisine, seeded by name. A host greets you and walks you to
// your table, chefs cook in the open kitchen, a server takes your order
// from the real-ish menu, food lands on the table, you draw conversation
// cards together, then ask for the bill and head back out into the city.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { Avatar, randomNpcLook } from "./Avatar.js";
import { CUISINE_THEMES, CUISINE_MENUS, inferCuisine } from "./cuisines.js";
import { TABLE_TALK } from "./story.js";
import { Net } from "../net.js";
import * as UI from "./ui.js";

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

const NPC_NAMES = ["Maya", "Theo", "Sari", "Hugo", "Nina", "Marco", "Lena", "Putri", "Jules", "Wira"];

export class RestaurantWorld {
  constructor(scene, poi, city, game) {
    this.scene = scene;
    this.poi = poi;
    this.city = city;
    this.game = game;
    this.cuisine = inferCuisine(poi.n, poi.t, city);
    this.theme = CUISINE_THEMES[this.cuisine];
    this.menu = CUISINE_MENUS[this.cuisine];
    this.rng = mulberry32(hashStr(poi.n + city));
    this.group = new THREE.Group();
    this.animated = [];
    this.npcs = [];
    this.isInterior = true;
    this.isPhotoreal = false;

    // room dims seeded by the restaurant
    this.W = 22 + Math.floor(this.rng() * 8);   // x: width
    this.D = 16 + Math.floor(this.rng() * 6);   // z: depth
    this.data = { radius: Math.max(this.W, this.D) };

    // dining flow
    this.state = "enter"; // enter → walking → seated → ordering → waiting → eating → paid
    this.stateT = 0;
    this.order = [];
    this.topicIdx = null;
    this.cardCount = 0;
  }

  async build(onProgress) {
    onProgress?.(0.3, "opening the door");
    const t = this.theme;
    const { W, D, rng } = this;

    // ---- shell: floor, walls, ceiling ----
    const floorMat = this.makeFloorMaterial();
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);

    const wallH = 4.2;
    const wallMat = new THREE.MeshLambertMaterial({ color: t.wall });
    const wainscotMat = new THREE.MeshLambertMaterial({ color: t.wainscot });
    const mkWall = (w, x, z, ry) => {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, wallH - 1.1), wallMat);
      wall.position.set(x, 1.1 + (wallH - 1.1) / 2, z);
      wall.rotation.y = ry;
      this.group.add(wall);
      const wainscot = new THREE.Mesh(new THREE.PlaneGeometry(w, 1.1), wainscotMat);
      wainscot.position.set(x, 0.55, z);
      wainscot.rotation.y = ry;
      this.group.add(wainscot);
    };
    mkWall(W, 0, -D / 2, 0);            // back (kitchen side)
    mkWall(W, 0, D / 2, Math.PI);       // front (street side, door)
    mkWall(D, -W / 2, 0, Math.PI / 2);  // left
    mkWall(D, W / 2, 0, -Math.PI / 2);  // right

    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshLambertMaterial({ color: 0x2e2a28 }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = wallH;
    this.group.add(ceil);

    // door (front wall center) + glow so it's findable
    this.doorPos = new THREE.Vector3(0, 0, D / 2 - 0.6);
    const door = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 3),
      new THREE.MeshLambertMaterial({ color: 0x241e1a })
    );
    door.position.set(0, 1.5, D / 2 - 0.05);
    door.rotation.y = Math.PI;
    this.group.add(door);

    // windows on the front wall, night/dusk outside
    const outside = new THREE.MeshBasicMaterial({ color: this.city === "paris" ? 0x131a33 : 0x3a2e40 });
    for (const wx of [-W / 4 - 1.5, W / 4 + 1.5]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.8), outside);
      win.position.set(wx, 2.1, D / 2 - 0.04);
      win.rotation.y = Math.PI;
      this.group.add(win);
      const frame = new THREE.Mesh(new THREE.PlaneGeometry(3.7, 2.1), new THREE.MeshLambertMaterial({ color: t.wainscot }));
      frame.position.set(wx, 2.1, D / 2 - 0.02);
      frame.rotation.y = Math.PI;
      this.group.add(frame);
    }

    onProgress?.(0.5, "setting the tables");

    // ---- kitchen along the back ----
    this.buildKitchen();

    // ---- host stand near the door ----
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.15, 0.55), new THREE.MeshLambertMaterial({ color: t.wainscot }));
    stand.position.set(2.2, 0.57, D / 2 - 2.4);
    stand.castShadow = true;
    this.group.add(stand);

    // ---- name sign above the door, inside ----
    this.addNameSign();

    // ---- tables ----
    this.tables = [];
    const cols = Math.max(2, Math.floor((W - 6) / 5));
    const rows = Math.max(2, Math.floor((D - 9) / 4.6));
    let yourTableSet = false;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = -W / 2 + 4 + c * ((W - 8) / Math.max(1, cols - 1));
        const z = -D / 2 + 5.5 + r * ((D - 10) / Math.max(1, rows - 1));
        if (Math.abs(x) < 1.6 && z > 0) continue; // keep the entry aisle clear
        const yours = !yourTableSet && r === Math.max(0, rows - 2) && c === Math.floor(cols / 2);
        if (yours) yourTableSet = true;
        this.buildTable(x, z, yours);
      }
    }
    if (!yourTableSet) this.buildTable(0, -2, true);
    this.yourTable = this.tables.find((tb) => tb.yours);

    onProgress?.(0.75, "lighting the candles");

    // ---- guests at some other tables ----
    for (const tb of this.tables) {
      if (tb.yours || rng() > 0.45) continue;
      const a = this.makeNpc(rng() > 0.5 ? "you" : "her", null, true);
      a.avatar.group.position.set(tb.x + 0.85, 0.22, tb.z);
      a.avatar.group.rotation.y = -Math.PI / 2;
      const b = this.makeNpc(rng() > 0.5 ? "her" : "you", null, true);
      b.avatar.group.position.set(tb.x - 0.85, 0.22, tb.z);
      b.avatar.group.rotation.y = Math.PI / 2;
      this.placeFood(tb, this.menu[Math.floor(rng() * this.menu.length)][2], -0.25);
      this.placeFood(tb, this.menu[Math.floor(rng() * this.menu.length)][2], 0.25);
    }

    // ---- staff ----
    const hostRole = rng() > 0.5 ? "her" : "you";
    this.host = this.makeNpc(hostRole, NPC_NAMES[Math.floor(rng() * NPC_NAMES.length)]);
    this.host.avatar.group.position.set(2.2, 0, D / 2 - 3.4);
    this.host.avatar.group.rotation.y = Math.PI;

    this.server = this.makeNpc(rng() > 0.5 ? "her" : "you", NPC_NAMES[Math.floor(rng() * NPC_NAMES.length)]);
    this.server.avatar.group.position.set(-W / 2 + 2.5, 0, -D / 2 + 3.4);

    for (let i = 0; i < 2; i++) {
      const chef = this.makeNpc("you", null, false, true);
      chef.avatar.group.position.set(-W / 4 + i * (W / 2.2), 0, -D / 2 + 1.25);
      chef.avatar.group.rotation.y = 0; // facing the back counter
      this.chefs = this.chefs || [];
      this.chefs.push(chef);
    }

    // ---- lighting ----
    this.group.add(new THREE.AmbientLight(t.light, 0.85));
    this.group.add(new THREE.HemisphereLight(0xfff4e0, 0x40342a, 0.5));
    const pendants = Math.min(4, Math.floor(W / 7));
    for (let i = 0; i < pendants; i++) {
      const x = -W / 2 + (W / (pendants + 1)) * (i + 1);
      const lamp = new THREE.PointLight(t.light, 12, 12, 1.9);
      lamp.position.set(x, 3.3, 0);
      this.group.add(lamp);
      const shade = new THREE.Mesh(
        new THREE.ConeGeometry(0.32, 0.3, 10, 1, true),
        new THREE.MeshLambertMaterial({ color: 0x33302c, side: THREE.DoubleSide })
      );
      shade.position.set(x, 3.45, 0);
      this.group.add(shade);
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 8, 6),
        new THREE.MeshLambertMaterial({ color: 0x8a7a5e, emissive: t.light, emissiveIntensity: 0.45 })
      );
      bulb.position.set(x, 3.32, 0);
      this.group.add(bulb);
    }

    this.scene.add(this.group);
    onProgress?.(1, "done");

    // greet
    setTimeout(() => {
      if (this.state === "enter") {
        this.host.avatar.say(`Welcome to ${this.poi.n}! Table for two? 💕`);
        UI.addSystem(`${this.host.name} will seat you — press E near them to follow`);
      }
    }, 700);
    return this;
  }

  // ----------------------------------------------------------- pieces
  makeFloorMaterial() {
    const t = this.theme;
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d");
    const colA = "#" + new THREE.Color(t.floorA).getHexString();
    if (t.floor === "checker") {
      const colB = "#" + new THREE.Color(t.floorB ?? 0xffffff).getHexString();
      for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
        ctx.fillStyle = (i + j) % 2 ? colA : colB;
        ctx.fillRect(i * 32, j * 32, 32, 32);
      }
    } else if (t.floor === "wood") {
      ctx.fillStyle = colA;
      ctx.fillRect(0, 0, 256, 256);
      for (let y = 0; y < 256; y += 21) {
        ctx.fillStyle = "rgba(0,0,0,0.22)";
        ctx.fillRect(0, y, 256, 2);
        ctx.fillStyle = "rgba(255,255,255,0.05)";
        ctx.fillRect(0, y + 2, 256, 2);
      }
    } else {
      ctx.fillStyle = colA;
      ctx.fillRect(0, 0, 256, 256);
      ctx.strokeStyle = "rgba(0,0,0,0.18)";
      ctx.lineWidth = 2;
      for (let y = 0; y <= 256; y += 42) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke(); }
      for (let x = 0; x <= 256; x += 42) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 256); ctx.stroke(); }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(this.W / 7, this.D / 7);
    return new THREE.MeshLambertMaterial({ map: tex });
  }

  buildKitchen() {
    const { W, D, theme: t } = this;
    // counter separating the open kitchen
    const counter = new THREE.Mesh(
      new THREE.BoxGeometry(W - 4, 1.05, 0.6),
      new THREE.MeshLambertMaterial({ color: t.wainscot })
    );
    counter.position.set(0, 0.52, -D / 2 + 2.4);
    counter.castShadow = true;
    this.group.add(counter);
    const counterTop = new THREE.Mesh(
      new THREE.BoxGeometry(W - 3.8, 0.07, 0.75),
      new THREE.MeshLambertMaterial({ color: 0xd8d4cc })
    );
    counterTop.position.set(0, 1.08, -D / 2 + 2.4);
    this.group.add(counterTop);

    // back wall: stainless + shelves + stove glow
    const steel = new THREE.Mesh(
      new THREE.PlaneGeometry(W - 4, 2.2),
      new THREE.MeshStandardMaterial({ color: 0x9aa0a4, roughness: 0.4, metalness: 0.6 })
    );
    steel.position.set(0, 1.6, -D / 2 + 0.06);
    this.group.add(steel);
    for (let i = 0; i < 2; i++) {
      const stove = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.95, 0.8), new THREE.MeshLambertMaterial({ color: 0x44464a }));
      stove.position.set(-W / 4 + i * (W / 2.2), 0.47, -D / 2 + 0.85);
      this.group.add(stove);
      const flame = new THREE.PointLight(0xff8a3c, 9, 4, 2);
      flame.position.set(stove.position.x, 1.2, stove.position.z);
      this.group.add(flame);
      this.animated.push((tt) => { flame.intensity = 7 + Math.sin(tt * 11 + i * 2) * 2.4 + Math.sin(tt * 23) * 1.2; });
      // steam puffs
      const steam = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 6, 5),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 })
      );
      steam.position.set(stove.position.x, 1.25, stove.position.z);
      this.group.add(steam);
      this.animated.push((tt) => {
        const k = (tt * 0.7 + i * 0.5) % 1;
        steam.position.y = 1.2 + k * 1.1;
        steam.material.opacity = 0.38 * (1 - k);
        steam.scale.setScalar(0.8 + k * 1.6);
      });
    }
    // pass: plates waiting under warm light
    const passLight = new THREE.PointLight(0xffb24a, 8, 6, 2);
    passLight.position.set(0, 2.2, -D / 2 + 2.2);
    this.group.add(passLight);
  }

  buildTable(x, z, yours) {
    const t = this.theme;
    const wood = new THREE.MeshLambertMaterial({ color: 0x5e4434 });
    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(0.72, 0.72, 0.06, 14),
      t.tablecloth ? new THREE.MeshLambertMaterial({ color: t.tablecloth }) : wood
    );
    top.position.set(x, 0.78, z);
    top.castShadow = true;
    this.group.add(top);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.78, 8), wood);
    leg.position.set(x, 0.39, z);
    this.group.add(leg);

    // two chairs facing each other
    for (const side of [-1, 1]) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.06, 0.46), wood);
      seat.position.set(x + side * 1.05, 0.5, z);
      this.group.add(seat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.55, 0.46), wood);
      back.position.set(x + side * 1.28, 0.82, z);
      this.group.add(back);
      for (const lx of [-0.18, 0.18]) for (const lz of [-0.18, 0.18]) {
        const cl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.05), wood);
        cl.position.set(x + side * 1.05 + lx, 0.25, z + lz);
        this.group.add(cl);
      }
    }

    if (t.candles || yours) {
      const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.14, 6), new THREE.MeshLambertMaterial({ color: 0xf0e8d8 }));
      candle.position.set(x, 0.88, z);
      this.group.add(candle);
      // gentle flicker, raised away from the plates so food stays readable
      const cl = new THREE.PointLight(0xffc46a, yours ? 0.85 : 0.6, 2.6, 2);
      cl.position.set(x, 1.45, z);
      this.group.add(cl);
      this.animated.push((tt) => { cl.intensity = (yours ? 0.78 : 0.55) + Math.sin(tt * 9.7 + x) * 0.15; });
    }
    this.tables.push({ x, z, yours, foods: [] });
  }

  placeFood(table, look, offset = 0) {
    const g = new THREE.Group();
    const plate = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.16, 0.03, 12),
      new THREE.MeshLambertMaterial({ color: 0xcfc9bc })
    );
    g.add(plate);
    const col = new THREE.MeshLambertMaterial({ color: look.color });
    let food;
    if (look.shape === "bowl") {
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.1, 0.09, 10), new THREE.MeshLambertMaterial({ color: 0xe8e2d4 }));
      bowl.position.y = 0.06;
      g.add(bowl);
      food = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), col);
      food.scale.y = 0.5;
      food.position.y = 0.11;
    } else if (look.shape === "drink") {
      food = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.18, 8), col);
      food.position.y = 0.1;
    } else if (look.shape === "dessert") {
      food = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.12, 8), col);
      food.position.y = 0.08;
    } else if (look.shape === "burger") {
      food = new THREE.Group();
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xd8a85a }));
      bun.position.y = 0.07;
      const patty = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.04, 10), col);
      patty.position.y = 0.04;
      food.add(bun, patty);
    } else if (look.shape === "steak") {
      food = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.14), col);
      food.position.y = 0.05;
    } else { // flat
      food = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.045, 10), col);
      food.position.y = 0.045;
    }
    g.add(food);
    g.position.set(table.x + (offset || 0), 0.82, table.z + (offset ? 0 : 0.05));
    this.group.add(g);
    table.foods.push(g);
    return g;
  }

  addNameSign() {
    const c = document.createElement("canvas");
    const font = "italic 600 44px Georgia, serif";
    const m = c.getContext("2d");
    m.font = font;
    const w = Math.min(720, Math.ceil(m.measureText(this.poi.n).width) + 60);
    c.width = w; c.height = 84;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#" + new THREE.Color(this.theme.accent).getHexString();
    ctx.fillRect(0, 0, w, 84);
    ctx.strokeStyle = "rgba(255,240,210,0.7)";
    ctx.lineWidth = 4;
    ctx.strokeRect(5, 5, w - 10, 74);
    ctx.font = font;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = "#f6ead8";
    ctx.fillText(this.poi.n, w / 2, 44, w - 40);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry((w / 84) * 0.7, 0.7),
      new THREE.MeshLambertMaterial({ map: tex })
    );
    sign.position.set(0, 3.55, this.D / 2 - 0.08);
    sign.rotation.y = Math.PI;
    this.group.add(sign);
  }

  makeNpc(role, name, seated = false, chef = false) {
    const { rng } = this;
    // every NPC is a different person: skin, hair, build, clothes
    const look = randomNpcLook(rng);
    if (chef) { look.shirt = 0xf2f0ea; look.pants = 0x2a2a2e; look.hairstyle = rng() > 0.5 ? "buzz" : "short"; }
    const avatar = new Avatar(role, "", { npcLook: look });
    if (chef) {
      const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.25, 0.34, 10), new THREE.MeshLambertMaterial({ color: 0xf6f4ee }));
      hat.position.y = 1.85;
      avatar.group.add(hat);
    }
    // staff wear an apron
    if (!chef && !seated) {
      const apron = new THREE.Mesh(
        new THREE.BoxGeometry(0.46, 0.5, 0.05),
        new THREE.MeshLambertMaterial({ color: 0x32302c })
      );
      apron.position.set(0, 0.72, 0.19);
      avatar.group.add(apron);
    }
    if (name) avatar.setName(name);
    if (seated) avatar.group.position.y = 0.22;
    this.scene.add(avatar.group);
    const npc = { avatar, name, path: [], speed: 0, chef, seated };
    this.npcs.push(npc);
    return npc;
  }

  // route an NPC down the row corridor first, then across — so they walk
  // the aisles instead of phasing through tables
  routeNpc(npc, x, z, onArrive = null) {
    const g = npc.avatar.group.position;
    npc.path = [];
    if (Math.abs(g.z - z) > 0.6) npc.path.push(new THREE.Vector3(g.x, 0, z));
    npc.path.push(new THREE.Vector3(x, 0, z));
    npc.onArrive = onArrive;
  }

  // ------------------------------------------------------ dining flow
  // called by Game when E is pressed; returns true if it consumed the key
  interact(playerPos) {
    if (!this.host) return false; // still building
    const near = (g, r) => Math.hypot(g.position.x - playerPos.x, g.position.z - playerPos.z) < r;
    if (this.state === "enter" && near(this.host.avatar.group, 3.2)) {
      this.state = "walking";
      this.stateT = 0;
      this.hostArrived = false;
      this.host.avatar.say("Right this way! 🚶");
      const tb = this.yourTable;
      this.routeNpc(this.host, tb.x, tb.z + 2.0, () => {
        this.hostArrived = true;
        this.host.avatar.say("Here you are — best seat in the house ✨");
      });
      UI.addSystem("follow the host to your table");
      return true;
    }
    if (this.state === "walking" && this.hostArrived &&
        Math.hypot(this.yourTable.x - playerPos.x, this.yourTable.z - playerPos.z) < 3.4) {
      this.seatPlayer();
      return true;
    }
    if (this.state === "eating" && this.stateT > 8) {
      this.requestBill();
      return true;
    }
    if (this.state === "paid" && near({ position: this.doorPos }, 3.2)) {
      this.game.exitRestaurant();
      return true;
    }
    if (this.state === "paid") {
      // also let them leave from anywhere near the front
      return false;
    }
    return false;
  }

  prompt(playerPos) {
    if (!this.host) return null; // still building
    const near = (p, r) => Math.hypot(p.x - playerPos.x, p.z - playerPos.z) < r;
    if (this.state === "enter" && near(this.host.avatar.group.position, 3.2)) return `press E · "table for two, please" 💕`;
    if (this.state === "walking" && this.hostArrived && near({ x: this.yourTable.x, z: this.yourTable.z }, 3.4)) return "press E · take your seat 🪑";
    if (this.state === "eating" && this.stateT > 8) return "press E · ask for the bill 💳";
    if (this.state === "paid") return near(this.doorPos, 4) ? "press E · head back outside 🌙" : "the door is by the front 🌙";
    return null;
  }

  seatPlayer() {
    const tb = this.yourTable;
    this.state = "seated";
    this.stateT = 0;
    const g = this.game;
    // each of you takes a chair by role, so a couple sits face to face
    const side = g.role === "her" ? -1 : 1;
    g.controls.pos.set(tb.x + side * 1.05, 0, tb.z);
    g.seatedAt = { x: tb.x + side * 1.05, z: tb.z, ry: side > 0 ? -Math.PI / 2 : Math.PI / 2 };
    g.avatar.group.position.set(tb.x + side * 1.05, 0.22, tb.z);
    g.avatar.group.rotation.y = g.seatedAt.ry;
    // camera: cozy view down onto the table for two
    g.controls.yaw = side * Math.PI / 4;
    g.controls.dist = 4.8;
    g.controls.pitch = 0.5;
    this.host.avatar.say("Your server will be right over 😊");
    this.routeNpc(this.host, 2.2, this.D / 2 - 3.4); // back to the stand
    // server approaches
    setTimeout(() => {
      if (this.state !== "seated") return;
      this.routeNpc(this.server, tb.x, tb.z + 1.7, () => {
        this.server.avatar.say(`Welcome in! What can I get you two tonight?`);
        this.state = "ordering";
        this.stateT = 0;
        UI.openMenu(this.poi.n, this.cuisine, this.menu, (picked) => this.placeOrder(picked));
      });
    }, 1600);
  }

  placeOrder(picked) {
    this.order = picked; // array of menu entries
    this.state = "waiting";
    this.stateT = 0;
    const names = picked.map((p) => p[0]).join(", ");
    this.game.avatar.say(names.length > 60 ? "We'll have... all of that 😄" : `We'll have the ${names} please!`);
    setTimeout(() => this.server.avatar.say("Excellent choice! Coming right up 📝"), 900);
    // server walks the order to the kitchen pass
    setTimeout(() => {
      this.routeNpc(this.server, 0, -this.D / 2 + 3.2, () => {
        this.chefs?.forEach((ch) => ch.avatar.say("Oui chef! 🔥"));
      });
    }, 1700);
    // food is ready after a short cook
    setTimeout(() => {
      if (this.state !== "waiting") return;
      const tb = this.yourTable;
      this.routeNpc(this.server, tb.x, tb.z + 1.7, () => {
        this.server.avatar.say("Bon appétit! 🍽");
        const spots = [-0.3, 0.3, 0, -0.15, 0.15];
        this.order.slice(0, 5).forEach((item, i) => this.placeFood(tb, item[2], spots[i]));
        this.state = "eating";
        this.stateT = 0;
        UI.addSystem("press T to draw a conversation card 💬 — press E later for the bill");
        this.routeNpc(this.server, -this.W / 2 + 2.5, -this.D / 2 + 3.4);
      });
    }, 9000);
  }

  drawTopic(broadcast = true) {
    if (this.state !== "eating" && this.state !== "paid") return;
    const deck = TABLE_TALK;
    this.topicIdx = this.topicIdx === null ? Math.floor(this.rng() * deck.length) : (this.topicIdx + 1 + Math.floor(this.rng() * 3)) % deck.length;
    this.cardCount++;
    UI.showTopic(deck[this.topicIdx], this.cardCount);
    if (broadcast) Net.sendEvent("topic", { i: this.topicIdx, n: this.cardCount });
  }

  showTopicFromPartner(i, n) {
    if (this.state !== "eating" && this.state !== "paid") return;
    this.topicIdx = i;
    this.cardCount = n;
    UI.showTopic(TABLE_TALK[i], n);
  }

  requestBill() {
    this.state = "billing";
    this.stateT = 0;
    const tb = this.yourTable;
    this.routeNpc(this.server, tb.x, tb.z + 1.7);
    this.server.onArrive = () => {
      const total = this.order.reduce((s, it) => s + it[1], 0);
      const currency = this.city === "paris" ? "€" : this.city === "tangerang" ? "$" : "$";
      UI.openBill(this.poi.n, this.order, total, currency, () => {
        this.state = "paid";
        this.stateT = 0;
        this.server.avatar.say("Merci! Come back soon you two 💛");
        const g = this.game;
        g.controls.enabled = true;
        g.seatedAt = null;
        g.avatar.group.position.y = 0;
        g.controls.pos.set(tb.x + 1.05, 0, tb.z + 1.4);
        UI.addSystem("dinner's on the two of you forever 💛 — head to the door when ready");
        this.routeNpc(this.server, -this.W / 2 + 2.5, -this.D / 2 + 3.4);
      });
    };
  }

  // tables, walls — and the two of you. Staff walk around people too.
  _npcBlocked(x, z) {
    if (Math.abs(x) > this.W / 2 - 0.6 || Math.abs(z) > this.D / 2 - 0.6) return true;
    for (const tb of this.tables) {
      if (Math.hypot(tb.x - x, tb.z - z) < 1.25) return true;
    }
    const me = this.game.avatar.group.position;
    if (Math.hypot(me.x - x, me.z - z) < 0.8) return true;
    const them = this.game.remote?.avatar.group.position;
    if (them && Math.hypot(them.x - x, them.z - z) < 0.8) return true;
    return false;
  }

  // -------------------------------------------------------- interface
  blocked(x, z) {
    // walls
    if (Math.abs(x) > this.W / 2 - 0.5 || Math.abs(z) > this.D / 2 - 0.5) return true;
    // kitchen counter line (guests stay out of the kitchen)
    if (z < -this.D / 2 + 3 && Math.abs(x) < this.W / 2 - 2) return true;
    // tables
    for (const tb of this.tables) {
      if (Math.hypot(tb.x - x, tb.z - z) < 1.0) return true;
    }
    return false;
  }
  blockedAt(x, z, y) { return y < 4 && this.blocked(x, z); }
  findClearSpot(x, z) { return [x, z]; }
  groundHeight() { return 0; }
  updateSun() {}
  attributions() { return ""; }

  tick(t, dt) {
    for (const fn of this.animated) fn(t, dt);
    this.stateT += dt;
    // npc walking with table avoidance: if the straight step is blocked,
    // try steering left/right in widening angles until a clear step exists
    for (const npc of this.npcs) {
      const g = npc.avatar.group;
      const wp = npc.path?.[0];
      if (wp) {
        const dx = wp.x - g.position.x;
        const dz = wp.z - g.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.22) {
          const sp = 2.6;
          const baseAng = Math.atan2(dx, dz);
          let moved = false;
          for (const off of [0, 0.5, -0.5, 1.0, -1.0, 1.5, -1.5]) {
            const a = baseAng + off;
            const nx = g.position.x + Math.sin(a) * sp * dt;
            const nz = g.position.z + Math.cos(a) * sp * dt;
            // look slightly ahead so they steer early, not at the last moment
            const lx = g.position.x + Math.sin(a) * 0.55;
            const lz = g.position.z + Math.cos(a) * 0.55;
            if (dist > 1.4 && (this._npcBlocked(nx, nz) || this._npcBlocked(lx, lz))) continue;
            g.position.x = nx;
            g.position.z = nz;
            g.rotation.y = a;
            moved = true;
            break;
          }
          npc.speed = moved ? sp : 0;
        } else {
          npc.path.shift();
          if (!npc.path.length) {
            npc.speed = 0;
            const cb = npc.onArrive;
            npc.onArrive = null;
            cb?.();
          }
        }
      } else {
        npc.speed = 0;
      }
      npc.avatar.animate(dt, npc.speed, t);
      // chefs chop & stir forever
      if (npc.chef) {
        npc.avatar.armR.rotation.x = -0.9 + Math.sin(t * 7 + g.position.x) * 0.5;
        npc.avatar.armL.rotation.x = -0.6 + Math.cos(t * 5.2 + g.position.x) * 0.3;
      }
    }
  }

  dispose() {
    this.scene.remove(this.group);
    for (const npc of this.npcs) {
      this.scene.remove(npc.avatar.group);
      npc.avatar.dispose();
    }
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) { if (m.map) m.map.dispose(); m.dispose(); }
      }
    });
  }
}
