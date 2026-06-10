import Phaser from "phaser";
import { Net } from "../systems/Network.js";
import { Dialogue } from "../systems/Dialogue.js";
import { Editor } from "../systems/Editor.js";
import { ZoneManager } from "../systems/Zones.js";

const SPEED = 140;

export class BaseWorldScene extends Phaser.Scene {
  constructor(key) {
    super(key);
    this.sceneKey = key;
  }

  // Subclasses override these:
  getBgColor() { return "#1a1428"; }
  getSpawn() { return { x: 320, y: 240 }; }
  getWorldSize() { return { w: 640, h: 480 }; }   // default = viewport size
  buildWorld() { /* place tiles, decoration, walls, memory points, portals */ }

  create() {
    this.cameras.main.setBackgroundColor(this.getBgColor());

    // Walls group (invisible rectangles you can add in buildWorld)
    this.walls = this.physics.add.staticGroup();

    // Interactables: { sprite, kind: "memory"|"portal"|"sign"|"finale", data }
    this.interactables = [];

    // Remote players, keyed by sessionId
    this.remotePlayers = new Map();

    // Zone system needs to exist BEFORE buildWorld() so addZone() works
    this.zoneManager = new ZoneManager(this);

    // Build the world
    this.buildWorld();

    // Local player
    const spawn = this.getSpawn();
    const role = Net.role;
    this.player = this.physics.add.sprite(spawn.x, spawn.y, `${role}-down`);
    this.player.role = role;
    this.player.setCollideWorldBounds(true);
    // Sprites are pre-scaled to ~96px tall in BootScene so we don't need fitSpriteSize.
    // Use a small body around the character's feet for snappy collision.
    this.refitBody(this.player);
    this.player.dir = "down";
    this.player._stepPhase = 0;     // alternates 0/1 while walking
    this.player._stepTimer = 0;
    this.player._bobBaseY = 0;      // procedural bob anchor (relative offset)
    this.player.setOrigin(0.5, 0.5);

    // World bounds + camera follow (supports zones bigger than viewport)
    const ws = this.getWorldSize();
    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);
    this.cameras.main.setBounds(0, 0, ws.w, ws.h);
    this.physics.world.setBounds(0, 0, ws.w, ws.h);

    this.physics.add.collider(this.player, this.walls);

    // Input
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys("W,A,S,D,SPACE,E");
    this.interactKey = this.input.keyboard.addKey("SPACE");
    this.eKey = this.input.keyboard.addKey("E");

    // Tell server we're in this scene
    Net.sendEnterScene(this.sceneKey, spawn.x, spawn.y);

    // Subscribe to remote state
    this.netUnsub = Net.onStateChange((state) => this.syncRemotes(state));

    // In-scene portal/wall editor (toggle with backtick)
    this.editor = new Editor(this);

    // Refresh player texture when real sprites finish loading in the background
    this._onTextureUpgrade = (e) => {
      if (!e.detail?.key) return;
      if (e.detail.key.startsWith(this.player.role + "-")) {
        const newTex = this.textureForDirection(this.player.role, this.player.dir);
        this.player.setTexture(newTex);
        this.refitBody(this.player);
      }
      this.remotePlayers.forEach((sp) => {
        if (sp.role && e.detail.key.startsWith(sp.role + "-")) {
          sp.setTexture(this.textureForDirection(sp.role, "down"));
        }
      });
    };
    window.addEventListener("texture-upgrade", this._onTextureUpgrade);
  }

  fitSpriteSize(sprite, targetW, targetH) {
    const sx = targetW / sprite.width;
    const sy = targetH / sprite.height;
    const s = Math.min(sx, sy);
    sprite.setScale(s);
  }

  refitBody(sprite) {
    if (!sprite.body) return;
    // Sprite is at scale=1, so body sizes match display pixels directly.
    const bodyW = Math.min(28, sprite.width);
    const bodyH = Math.min(24, sprite.height);
    sprite.body.setSize(bodyW, bodyH);
    const offsetX = (sprite.width - bodyW) / 2;
    const offsetY = sprite.height - bodyH - 2;
    sprite.body.setOffset(offsetX, offsetY);
  }

  textureForDirection(role, dir, step = false) {
    let base;
    if (dir === "left" || dir === "right") base = `${role}-side`;
    else if (dir === "up") base = `${role}-up`;
    else base = `${role}-down`;
    if (step && this.textures.exists(base + "-step")) return base + "-step";
    return base;
  }

  addWall(x, y, w, h) {
    const r = this.add.rectangle(x + w/2, y + h/2, w, h, 0x000000, 0);
    this.physics.add.existing(r, true);
    this.walls.add(r);
    return r;
  }

  addMemoryPoint(memory) {
    const dot = this.add.sprite(memory.x, memory.y - 18, "memory-dot");
    this.tweens.add({ targets: dot, y: dot.y - 4, duration: 900, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    if (memory.icon) {
      this.add.text(memory.x, memory.y, memory.icon, { fontSize: "20px" }).setOrigin(0.5);
    }
    this.interactables.push({ x: memory.x, y: memory.y, kind: "memory", data: memory, sprite: dot });
  }

  addPortal(portal) {
    const p = this.add.sprite(portal.x, portal.y, "portal");
    this.tweens.add({ targets: p, alpha: 0.5, duration: 1200, yoyo: true, repeat: -1 });
    this.add.text(portal.x, portal.y + 36, portal.label, { fontSize: "12px", color: "#fff4b0" }).setOrigin(0.5);
    this.interactables.push({ x: portal.x, y: portal.y, kind: "portal", data: portal, sprite: p });
  }

  addSign(sign) {
    this.interactables.push({ x: sign.x, y: sign.y, kind: "sign", data: sign });
  }

  addZone(zone) {
    this.zoneManager.add(zone);
  }

  syncRemotes(state) {
    const myId = Net.sessionId;
    const seen = new Set();
    state.players.forEach((p, id) => {
      if (id === myId) return;
      seen.add(id);
      let sp = this.remotePlayers.get(id);
      if (!sp) {
        sp = this.add.sprite(p.x, p.y, `${p.role}-down`);
        sp.role = p.role;
        sp.nameLabel = this.add.text(p.x, p.y - 32, p.name, {
          fontSize: "11px", color: "#fff4b0", backgroundColor: "rgba(0,0,0,0.5)",
        }).setOrigin(0.5).setPadding(3, 1, 3, 1);
        this.remotePlayers.set(id, sp);
      }
      // Hide if in different scene
      const sameScene = p.scene === this.sceneKey;
      sp.setVisible(sameScene);
      sp.nameLabel.setVisible(sameScene);
      if (sameScene) {
        // Detect movement for remote step animation
        const movedDist = Math.hypot(p.x - (sp._lastX ?? p.x), p.y - (sp._lastY ?? p.y));
        sp._lastX = p.x; sp._lastY = p.y;
        sp._moving = movedDist > 0.5;
        if (sp._moving) {
          sp._stepTimer = (sp._stepTimer ?? 0) + 100;
          if (sp._stepTimer > 200) {
            sp._stepTimer = 0;
            sp._stepPhase = 1 - (sp._stepPhase ?? 0);
          }
        } else {
          sp._stepPhase = 0;
        }
        sp.x = p.x; sp.y = p.y;
        sp.nameLabel.x = p.x; sp.nameLabel.y = p.y - 32;
        const newTex = this.textureForDirection(sp.role, p.dir, sp._moving && sp._stepPhase === 1);
        if (sp.texture.key !== newTex) sp.setTexture(newTex);
        sp.flipX = p.dir === "left";
      }
    });
    // Remove disconnected
    for (const id of [...this.remotePlayers.keys()]) {
      if (!seen.has(id)) {
        const sp = this.remotePlayers.get(id);
        sp.nameLabel?.destroy();
        sp.destroy();
        this.remotePlayers.delete(id);
      }
    }
  }

  update(_t, dt) {
    if (Dialogue.isOpen()) {
      this.player.setVelocity(0, 0);
      return;
    }

    let vx = 0, vy = 0;
    const left = this.cursors.left.isDown || this.keys.A.isDown;
    const right = this.cursors.right.isDown || this.keys.D.isDown;
    const up = this.cursors.up.isDown || this.keys.W.isDown;
    const down = this.cursors.down.isDown || this.keys.S.isDown;
    if (left) { vx = -SPEED; this.player.dir = "left"; this.player.flipX = true; }
    if (right) { vx = SPEED; this.player.dir = "right"; this.player.flipX = false; }
    if (up) { vy = -SPEED; this.player.dir = "up"; this.player.flipX = false; }
    if (down) { vy = SPEED; this.player.dir = "down"; this.player.flipX = false; }
    this.player.setVelocity(vx, vy);

    // Walking animation
    const moving = vx !== 0 || vy !== 0;
    if (moving) {
      this.player._stepTimer += dt;
      const stepInterval = 200; // ms per frame swap
      if (this.player._stepTimer > stepInterval) {
        this.player._stepTimer = 0;
        this.player._stepPhase = 1 - this.player._stepPhase;
      }
      // Procedural bob: small vertical offset that follows the step phase
      const bobAmp = 1.5;
      this.player.setDisplayOrigin(this.player.displayWidth / 2, this.player.displayHeight / 2 - (this.player._stepPhase ? bobAmp : 0));
    } else {
      this.player._stepTimer = 0;
      this.player._stepPhase = 0;
      this.player.setDisplayOrigin(this.player.displayWidth / 2, this.player.displayHeight / 2);
    }
    const newTex = this.textureForDirection(this.player.role, this.player.dir, moving && this.player._stepPhase === 1);
    if (this.player.texture.key !== newTex) this.player.setTexture(newTex);

    // Network position throttle
    this._netTimer = (this._netTimer || 0) + dt;
    if (this._netTimer > 60) {
      this._netTimer = 0;
      Net.sendMove(this.player.x, this.player.y, this.player.dir, this.sceneKey);
    }

    // Zone detection — fire onEnter/onExit when player crosses a zone boundary
    this.zoneManager.update(this.player.x, this.player.y);

    // Nearest interactable
    const near = this.findNearestInteractable();
    if (near) {
      Dialogue.showHint(`Press <b>Space</b> · ${this.labelFor(near)}`);
      if (Phaser.Input.Keyboard.JustDown(this.interactKey) || Phaser.Input.Keyboard.JustDown(this.eKey)) {
        this.triggerInteractable(near);
      }
    } else if (this.zoneManager._activeMinigame) {
      // No interactable nearby, but player is in a minigame zone — allow trigger
      if (Phaser.Input.Keyboard.JustDown(this.interactKey) || Phaser.Input.Keyboard.JustDown(this.eKey)) {
        this.zoneManager.tryTriggerMinigame();
      }
    } else {
      Dialogue.showHint("");
    }
  }

  labelFor(i) {
    if (i.kind === "portal") return `Enter ${i.data.label}`;
    if (i.kind === "memory") return "Remember";
    if (i.kind === "sign") return "Read";
    return "Interact";
  }

  findNearestInteractable() {
    const px = this.player.x, py = this.player.y;
    let best = null, bestD = 999;
    for (const i of this.interactables) {
      const d = Phaser.Math.Distance.Between(px, py, i.x, i.y);
      if (d < 40 && d < bestD) { best = i; bestD = d; }
    }
    return best;
  }

  triggerInteractable(i) {
    if (i.kind === "memory" || i.kind === "sign") {
      Dialogue.show(i.data.pages);
    } else if (i.kind === "portal") {
      Dialogue.hide();
      const data = i.data;
      if (data.scene === "year") {
        this.scene.start("year", { year: data.year });
      } else if (data.scene === "finale") {
        this.scene.start("finale");
      } else {
        this.scene.start(data.scene);
      }
    }
  }

  shutdown() {
    Dialogue.showHint("");
    if (this.netUnsub) this.netUnsub();
    if (this._onTextureUpgrade) window.removeEventListener("texture-upgrade", this._onTextureUpgrade);
  }
}
