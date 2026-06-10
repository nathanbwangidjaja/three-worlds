import * as THREE from "three";
import { WorldBuilder } from "./WorldBuilder.js";
import { THEMES, DESTINATIONS } from "./themes.js";
import { STORY } from "./story.js";
import { Avatar } from "./Avatar.js";
import { Controls } from "./Controls.js";
import { Effects } from "./Effects.js";
import {
  buildEiffelTower, buildHomeMarker, buildPortal, buildBench, buildPicnic,
} from "./landmarks.js";
import { Net } from "../net.js";
import * as UI from "./ui.js";

// Champ de Mars axis (tower → École Militaire), unit vector in world coords
const CHAMP_AXIS = { x: 0.62, z: 0.78 };

export class Game {
  constructor({ container, role, name }) {
    this.role = role;
    this.name = name;
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 4000);
    this.camera.position.set(0, 6, 12);

    this.controls = new Controls(this.camera, this.renderer.domElement);
    this.effects = new Effects(this.scene);

    this.avatar = new Avatar(role, name);
    this.scene.add(this.avatar.group);

    this.remote = null;          // { avatar, target:{...}, state }
    this.remoteState = null;     // latest known partner state (any world)

    this.worldKey = null;
    this.world = null;           // WorldBuilder
    this.extras = [];            // ticking landmark objects
    this.portals = [];           // {x, z, to}
    this.interactables = [];     // {x, z, prompt, onInteract}
    this.eiffel = null;
    this.towerCenter = null;
    this.togetherAtTower = false;
    this.fireworkTimer = 0;
    this.moveTimer = 0;
    this.clock = new THREE.Clock();
    this.dataCache = {};

    window.addEventListener("resize", () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    this._bindNet();
    this._bindKeys();
  }

  // ------------------------------------------------------------- network
  _bindNet() {
    Net.on("players", (others) => {
      // it's just the two of you — track the first other player
      const partner = others.find((o) => o.role !== this.role) || others[0] || null;
      this.remoteState = partner;
      if (!partner) {
        UI.setPartnerStatus("walking alone for now 🌙");
        this._removeRemote();
        return;
      }
      if (partner.world === this.worldKey) {
        UI.setPartnerStatus(`💞 ${partner.name} is here with you`);
        if (!this.remote) this._spawnRemote(partner);
        if (this.remote && this.remote.name !== partner.name) {
          this.remote.avatar.setName(partner.name);
          this.remote.name = partner.name;
        }
        this.remote.target = partner;
      } else {
        UI.setPartnerStatus(STORY.partnerWorld(partner.name, THEMES[partner.world]?.title ?? partner.world));
        this._removeRemote();
      }
    });

    Net.on("chat", (m) => {
      if (m.id === Net.sessionId) return;
      UI.addChat(m.name, m.text, m.role);
      if (this.remote) this.remote.avatar.say(m.text);
    });

    Net.on("emote", (m) => {
      if (m.id === Net.sessionId) {
        return; // we already showed our own
      }
      if (this.remote) {
        this.effects.emote(this.remote.avatar.group.position, m.kind);
        if (m.kind === "wave") this.remote.avatar.wave(this.clock.elapsedTime);
      }
    });
  }

  _spawnRemote(state) {
    const avatar = new Avatar(state.role, state.name);
    avatar.group.position.set(state.x, state.y, state.z);
    this.scene.add(avatar.group);
    this.remote = { avatar, target: state, name: state.name, heading: state.ry };
  }

  _removeRemote() {
    if (!this.remote) return;
    this.scene.remove(this.remote.avatar.group);
    this.remote.avatar.dispose();
    this.remote = null;
  }

  // ---------------------------------------------------------------- keys
  _bindKeys() {
    window.addEventListener("keydown", (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (UI.dialogOpen()) {
        if (e.code === "Space" || e.code === "KeyE" || e.code === "Enter") {
          e.preventDefault();
          UI.advanceDialog();
        }
        return;
      }
      if (e.code === "KeyE") this._tryInteract();
      if (e.code === "KeyM") UI.openTravel(this.worldKey, (to) => this.travel(to));
      if (e.code === "Digit1") this.emote("heart");
      if (e.code === "Digit2") this.emote("wave");
      if (e.code === "Digit3") this.emote("sparkle");
      if (e.code === "Digit4") this.emote("kiss");
    });
    window.addEventListener("click", () => { if (UI.dialogOpen()) UI.advanceDialog(); });
  }

  emote(kind) {
    this.effects.emote(this.controls.pos, kind);
    if (kind === "wave") this.avatar.wave(this.clock.elapsedTime);
    Net.sendEmote(kind);
  }

  _tryInteract() {
    const p = this.controls.pos;
    for (const it of this.interactables) {
      if (Math.hypot(it.x - p.x, it.z - p.z) < it.range) {
        it.onInteract();
        return;
      }
    }
    // portals
    for (const portal of this.portals) {
      if (Math.hypot(portal.x - p.x, portal.z - p.z) < 3.4) {
        this.travel(portal.to);
        return;
      }
    }
  }

  // -------------------------------------------------------------- worlds
  async loadData(key) {
    if (!this.dataCache[key]) {
      const res = await fetch(`/data/${key}.json`);
      if (!res.ok) throw new Error(`failed to load map data for ${key}`);
      this.dataCache[key] = await res.json();
    }
    return this.dataCache[key];
  }

  async travel(to) {
    if (to === this.worldKey) return;
    UI.fadeIn(`✈️ flying to ${THEMES[to].title}…`);
    await new Promise((r) => setTimeout(r, 750));
    await this.loadWorld(to);
    UI.fadeOut();
  }

  async loadWorld(key) {
    const theme = THEMES[key];
    const data = await this.loadData(key);

    // tear down old world
    this.effects.clear();
    this._removeRemote();
    for (const e of this.extras) this.scene.remove(e.group);
    this.extras = [];
    this.portals = [];
    this.interactables = [];
    this.eiffel = null;
    this.towerCenter = null;
    if (this.world) this.world.dispose();

    this.worldKey = key;
    this.world = new WorldBuilder(this.scene, theme, data);
    await this.world.build((pct, label) => UI.setLoading(pct, label));

    this._setupExtras(key, data);

    // spawn
    const spawn = this._spawnPoint(key);
    this.controls.pos.set(spawn[0], 0, spawn[1]);
    this.controls.yaw = spawn[2] ?? Math.PI;
    this.camera.position.set(spawn[0] + Math.sin(this.controls.yaw) * 9, 5, spawn[1] + Math.cos(this.controls.yaw) * 9);

    UI.setLocation(theme.title, theme.subtitle);
    Net.sendWorld({ world: key, x: spawn[0], z: spawn[1] });

    // re-evaluate partner presence in this world
    if (this.remoteState) {
      if (this.remoteState.world === key) {
        this._spawnRemote(this.remoteState);
        UI.setPartnerStatus(`💞 ${this.remoteState.name} is here with you`);
      } else {
        UI.setPartnerStatus(STORY.partnerWorld(this.remoteState.name, THEMES[this.remoteState.world]?.title ?? ""));
      }
    }
  }

  _spawnPoint(key) {
    if (key === "paris") {
      const c = this.towerCenter || { x: 0, z: 0 };
      const sx = c.x + CHAMP_AXIS.x * 95, sz = c.z + CHAMP_AXIS.z * 95;
      const [x, z] = this.world.findClearSpot(sx, sz);
      // face the tower
      const yaw = Math.atan2(c.x - x, c.z - z) + Math.PI;
      return [x, z, yaw];
    }
    // spawn a few steps away from the home marker, facing it
    const h = this.homePos || { x: 0, z: 0 };
    const [x, z] = this.world.findClearSpot(h.x + 4, h.z + 9, 3);
    const yaw = Math.atan2(h.x - x, h.z - z) + Math.PI;
    return [x, z, yaw];
  }

  _setupExtras(key, data) {
    const addExtra = (obj) => {
      this.scene.add(obj.group);
      this.extras.push(obj);
    };

    // --- Eiffel tower (paris) ---
    if (key === "paris") {
      const towerB = data.buildings.find((b) => b.tower && b.h > 100);
      let cx = 0, cz = 0;
      if (towerB) {
        for (const [x, z] of towerB.p) { cx += x; cz += z; }
        cx /= towerB.p.length; cz /= towerB.p.length;
      }
      this.towerCenter = { x: cx, z: cz };
      const eiffel = buildEiffelTower();
      eiffel.group.position.set(cx, 0, cz);
      // align tower base diagonals with the Seine-ish orientation
      eiffel.group.rotation.y = Math.atan2(CHAMP_AXIS.x, CHAMP_AXIS.z);
      addExtra(eiffel);
      this.eiffel = eiffel;

      // plaque at the base
      this.interactables.push({
        x: cx + CHAMP_AXIS.x * 42, z: cz + CHAMP_AXIS.z * 42, range: 6,
        prompt: "press E · read the plaque 🗼",
        onInteract: () => UI.showDialog(STORY.eiffel.speaker, STORY.eiffel.pages),
      });

      // bench + picnic on the Champ de Mars
      const bx = cx + CHAMP_AXIS.x * 175, bz = cz + CHAMP_AXIS.z * 175;
      const [bcx, bcz] = this.world.findClearSpot(bx, bz);
      const benchYaw = Math.atan2(cx - bcx, cz - bcz);
      const bench = buildBench(bcx, bcz, benchYaw);
      addExtra(bench);
      this.interactables.push({
        x: bcx, z: bcz, range: 3.2,
        prompt: "press E · sit a while 🪑",
        onInteract: () => UI.showDialog(STORY.bench.speaker, STORY.bench.pages),
      });

      const [pcx, pcz] = this.world.findClearSpot(bcx - CHAMP_AXIS.z * 14, bcz + CHAMP_AXIS.x * 14);
      addExtra(buildPicnic(pcx, pcz));
    }

    // --- home markers ---
    if (key === "boston" || key === "tangerang") {
      const home = STORY.homes[key];
      const [hx, hz] = this.world.findClearSpot(0, 0, 4);
      this.homePos = { x: hx, z: hz };
      const marker = buildHomeMarker(hx, hz, home.label);
      addExtra(marker);
      this.interactables.push({
        x: hx, z: hz, range: 4,
        prompt: "press E · 💌",
        onInteract: () => UI.showDialog(home.speaker, home.pages),
      });
    }

    // --- portals ---
    const dests = DESTINATIONS[key];
    const portalColors = { boston: 0xffa94d, tangerang: 0x6de8a0, paris: 0xc77bff };
    const anchor = key === "paris"
      ? { x: this.towerCenter.x + CHAMP_AXIS.x * 120, z: this.towerCenter.z + CHAMP_AXIS.z * 120 }
      : { x: 0, z: 0 };
    dests.forEach((d, i) => {
      const side = i === 0 ? -1 : 1;
      // perpendicular to champ axis in paris, plain east-west elsewhere
      const px = anchor.x + (key === "paris" ? -CHAMP_AXIS.z : 1) * side * 24;
      const pz = anchor.z + (key === "paris" ? CHAMP_AXIS.x : 0.2) * side * 24 + (key === "paris" ? 0 : 14);
      const [cpx, cpz] = this.world.findClearSpot(px, pz);
      const portal = buildPortal(cpx, cpz, d.label, portalColors[d.to]);
      this.scene.add(portal.group);
      this.extras.push(portal);
      this.portals.push({ x: cpx, z: cpz, to: d.to });
    });
  }

  // ---------------------------------------------------------------- loop
  start() {
    this.renderer.setAnimationLoop(() => this._frame());
  }

  _frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;

    // local movement
    const blocked = (x, z) => this.world.blocked(x, z);
    const speed = this.controls.update(dt, blocked, this.world.data.radius);
    this.controls.enabled = !UI.dialogOpen() && !UI.chatOpen() && !UI.travelOpen();

    const p = this.controls.pos;
    this.avatar.group.position.copy(p);
    // smooth heading turn
    let dh = this.controls.heading - this.avatar.group.rotation.y;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    this.avatar.group.rotation.y += dh * Math.min(1, dt * 12);
    this.avatar.animate(dt, speed, t);

    this.controls.updateCamera(dt, (x, z, y) => this.world.blockedAt(x, z, y));
    this.world.updateSun(p);
    this.world.tick(t, dt);
    for (const e of this.extras) e.tick?.(t, dt);
    this.effects.update(dt);

    // remote interpolation
    if (this.remote) {
      const r = this.remote;
      const tgt = r.target;
      const g = r.avatar.group;
      g.position.x += (tgt.x - g.position.x) * Math.min(1, dt * 10);
      g.position.y += (tgt.y - g.position.y) * Math.min(1, dt * 10);
      g.position.z += (tgt.z - g.position.z) * Math.min(1, dt * 10);
      let rdh = tgt.ry - g.rotation.y;
      while (rdh > Math.PI) rdh -= Math.PI * 2;
      while (rdh < -Math.PI) rdh += Math.PI * 2;
      g.rotation.y += rdh * Math.min(1, dt * 10);
      r.avatar.animate(dt, tgt.speed, t);
    }

    // network: send our position ~10x/s
    this.moveTimer += dt;
    if (this.moveTimer > 0.1) {
      this.moveTimer = 0;
      Net.sendMove({
        x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2),
        ry: +this.avatar.group.rotation.y.toFixed(3),
        speed: +speed.toFixed(2),
      });
    }

    // interaction prompt
    let prompt = null;
    for (const it of this.interactables) {
      if (Math.hypot(it.x - p.x, it.z - p.z) < it.range) { prompt = it.prompt; break; }
    }
    if (!prompt) {
      for (const portal of this.portals) {
        if (Math.hypot(portal.x - p.x, portal.z - p.z) < 3.4) {
          prompt = `press E · travel to ${THEMES[portal.to].title} ✈️`;
          break;
        }
      }
    }
    UI.setPrompt(prompt);

    // the Eiffel moment 💞
    if (this.worldKey === "paris" && this.towerCenter) {
      const near = Math.hypot(p.x - this.towerCenter.x, p.z - this.towerCenter.z) < 110;
      const partnerNear = this.remote &&
        Math.hypot(this.remote.avatar.group.position.x - this.towerCenter.x,
                   this.remote.avatar.group.position.z - this.towerCenter.z) < 110;
      const together = near && partnerNear;
      if (together !== this.togetherAtTower) {
        this.togetherAtTower = together;
        this.eiffel?.setSparkleBoost(together ? 1.6 : 0.45);
        UI.setBanner(together ? STORY.togetherBanner : null);
      }
      if (together) {
        this.fireworkTimer -= dt;
        if (this.fireworkTimer <= 0) {
          this.fireworkTimer = 0.9 + Math.random() * 0.9;
          this.effects.firework(this.towerCenter);
        }
      }
    } else if (this.togetherAtTower) {
      this.togetherAtTower = false;
      UI.setBanner(null);
    }

    this.renderer.render(this.scene, this.camera);
  }
}
