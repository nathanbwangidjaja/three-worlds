import Phaser from "phaser";
import { BaseWorldScene } from "./BaseWorldScene.js";
import { YEARS } from "../data/memories.js";
import {
  YEAR1_MAP,
  YEAR1_WALLS,
  YEAR1_MEMORIES,
  YEAR1_NPCS,
  YEAR1_ZONES,
} from "../data/year1Map.js";

export class YearScene extends BaseWorldScene {
  constructor() { super("year"); }

  init(data) {
    this.yearNum = data?.year || 1;
    this.yearData = YEARS[this.yearNum];
  }

  getBgColor() { return this.yearData.bgColor; }
  getSpawn() {
    if (this.yearNum === 1) return YEAR1_MAP.spawn;
    return this.yearData.spawn;
  }
  getWorldSize() {
    if (this.yearNum === 1) return YEAR1_MAP.worldSize;
    return this.yearData.worldSize || { w: 640, h: 480 };
  }

  buildWorld() {
    const ws = this.getWorldSize();
    const bgKey = `room-year-${this.yearNum}`;

    // === BACKGROUND: painted map at native size ===
    if (this.textures.exists(bgKey)) {
      const bg = this.add.image(ws.w / 2, ws.h / 2, bgKey);
      bg.setDisplaySize(ws.w, ws.h);
      bg.setDepth(-100);
    } else {
      // Fallback placeholder
      this.add.rectangle(ws.w / 2, ws.h / 2, ws.w, ws.h, 0x2a2a3a).setDepth(-100);
      this.add.text(ws.w / 2, 60, `(drop year-${this.yearNum}.png in client/public/assets/rooms/)`, {
        fontSize: "14px", color: "#888",
      }).setOrigin(0.5).setDepth(-99);
    }

    // === COLLISION WALLS ===
    if (this.yearNum === 1) {
      YEAR1_WALLS.forEach((w) => this.addWall(w.x, w.y, w.w, w.h));
    } else {
      (this.yearData.walls || []).forEach((w) => this.addWall(w.x, w.y, w.w, w.h));
    }

    // === TITLE BANNER (anchored to camera) ===
    this.add.text(8, 8, this.yearData.title.toUpperCase(), {
      fontSize: "16px", color: "#fff4b0", fontStyle: "bold",
      backgroundColor: "rgba(0,0,0,0.6)",
    }).setPadding(6, 3, 6, 3).setDepth(900).setScrollFactor(0);
    this.add.text(8, 32, "← head south to go home", {
      fontSize: "10px", color: "#fff4b0",
      backgroundColor: "rgba(0,0,0,0.5)",
    }).setPadding(4, 2, 4, 2).setDepth(900).setScrollFactor(0).setAlpha(0.7);

    // === MEMORY INTERACTION POINTS ===
    if (this.yearNum === 1) {
      YEAR1_MEMORIES.forEach((m) => this.addMemoryPoint(m));
    } else {
      (this.yearData.memories || []).forEach((m) => this.addMemoryPoint(m));
    }

    // === ZONES (subtitle / minigame / weather effects) ===
    if (this.yearNum === 1) {
      YEAR1_ZONES.forEach((z) => this.addZone(z));
    } else {
      (this.yearData.zones || []).forEach((z) => this.addZone(z));
    }

    // === NPCs ===
    if (this.yearNum === 1) {
      this._placeNPCs(YEAR1_NPCS);
    }

    // === EXIT PORTAL at south edge ===
    this.addPortal({
      x: ws.w / 2,
      y: ws.h - 30,
      scene: "hub",
      label: "← Home",
    });
  }

  _placeNPCs(npcs) {
    npcs.forEach((npc) => {
      if (!this.textures.exists(npc.key)) return;
      const src = this.textures.get(npc.key).getSourceImage();
      const frameSize = src.height;
      const canvas = document.createElement("canvas");
      canvas.width = frameSize;
      canvas.height = frameSize;
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(src, 0, 0, frameSize, frameSize, 0, 0, frameSize, frameSize);
      const tKey = `${npc.key}-f0`;
      if (!this.textures.exists(tKey)) this.textures.addImage(tKey, canvas);
      const sprite = this.add.image(npc.x, npc.y, tKey);
      sprite.setScale(2);
      sprite.setDepth(-30);
      this.tweens.add({
        targets: sprite, y: npc.y - 3,
        duration: 1200 + Math.random() * 800,
        yoyo: true, repeat: -1, ease: "Sine.easeInOut",
      });
    });
  }
}
