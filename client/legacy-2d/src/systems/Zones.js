// Kaetram-pattern zone system.
//
// A "zone" is a rectangular region of the world that fires onEnter/onExit
// callbacks when the player walks in/out. Different zone TYPES (music,
// weather, dialogue, minigame) get different handlers — but the dispatch
// is the same shape Kaetram uses in handler.ts:868.
//
// The key trick from Kaetram: track which zone the player is CURRENTLY in
// per category, and only fire transitions when that ID changes. Stops
// the same effect re-triggering every frame.

import { Dialogue } from "./Dialogue.js";

export class ZoneManager {
  constructor(scene) {
    this.scene = scene;
    this.zones = [];
    // currentZoneId[type] = id of zone player is currently in (or null)
    this.currentZoneId = {};
    // visible subtitle text for the active "named" zone
    this.subtitle = null;
  }

  add(zoneData) {
    // zoneData: { id, type, x, y, w, h, ...typeSpecific }
    this.zones.push(zoneData);
  }

  // Run every frame. Detects zone transitions and dispatches handlers.
  update(playerX, playerY) {
    // Bucket zones by type so we can have e.g. one music zone + one minigame zone simultaneously
    const byType = {};
    for (const z of this.zones) {
      if (!byType[z.type]) byType[z.type] = [];
      byType[z.type].push(z);
    }

    for (const type of Object.keys(byType)) {
      const active = byType[type].find((z) => this._inZone(z, playerX, playerY));
      const prevId = this.currentZoneId[type] || null;
      const newId = active?.id || null;
      if (prevId !== newId) {
        if (prevId) this._onExit(byType[type].find((z) => z.id === prevId));
        if (active) this._onEnter(active);
        this.currentZoneId[type] = newId;
      }
    }
  }

  _inZone(z, x, y) {
    return x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h;
  }

  _onEnter(zone) {
    // Dispatch by type — mirrors Kaetram's switch in detectAreas()
    switch (zone.type) {
      case "subtitle":
        this._showSubtitle(zone.text || zone.id);
        break;
      case "music":
        // Stub: would swap audio track here
        console.log("[zone] music:", zone.track);
        this._showSubtitle(zone.label || `♪ ${zone.track}`);
        break;
      case "weather":
        this._spawnParticles(zone);
        break;
      case "dialogue":
        // Auto-trigger dialogue on entry (one-shot)
        if (!zone._fired) {
          zone._fired = true;
          Dialogue.show(zone.pages);
        }
        break;
      case "minigame":
        // Stub: would launch minigame scene
        this._showSubtitle(`Press SPACE to ${zone.label || "play"}`);
        this._activeMinigame = zone;
        break;
      default:
        if (zone.label) this._showSubtitle(zone.label);
    }
  }

  _onExit(zone) {
    if (zone.type === "subtitle" || zone.type === "music" || zone.type === "minigame") {
      this._hideSubtitle();
    }
    if (zone.type === "weather" && zone._particles) {
      zone._particles.destroy();
      zone._particles = null;
    }
    if (zone.type === "minigame") {
      this._activeMinigame = null;
    }
  }

  // Called when player presses SPACE while in an active minigame zone
  tryTriggerMinigame() {
    if (!this._activeMinigame) return false;
    const zone = this._activeMinigame;
    if (zone.onTrigger) zone.onTrigger(this.scene);
    return true;
  }

  _showSubtitle(text) {
    if (this.subtitle) this.subtitle.destroy();
    this.subtitle = this.scene.add
      .text(this.scene.cameras.main.width / 2, 80, text, {
        fontSize: "16px",
        color: "#fff4b0",
        backgroundColor: "rgba(0,0,0,0.75)",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setPadding(10, 5, 10, 5)
      .setScrollFactor(0)
      .setDepth(950);
    this.scene.tweens.add({
      targets: this.subtitle,
      alpha: { from: 0, to: 1 },
      duration: 250,
    });
  }

  _hideSubtitle() {
    if (!this.subtitle) return;
    const t = this.subtitle;
    this.scene.tweens.add({
      targets: t,
      alpha: 0,
      duration: 250,
      onComplete: () => t.destroy(),
    });
    this.subtitle = null;
  }

  _spawnParticles(zone) {
    // Simple sparkle particle emitter for "magical" zones
    const g = this.scene.add.graphics();
    g.fillStyle(0xfff4b0, 1).fillCircle(2, 2, 2);
    const key = `__sparkle_${zone.id}`;
    if (!this.scene.textures.exists(key)) g.generateTexture(key, 4, 4);
    g.destroy();
    zone._particles = this.scene.add.particles(0, 0, key, {
      x: { min: zone.x, max: zone.x + zone.w },
      y: { min: zone.y, max: zone.y + zone.h },
      lifespan: 1500,
      speedY: { min: -20, max: -50 },
      scale: { start: 1, end: 0 },
      alpha: { start: 1, end: 0 },
      frequency: 80,
    }).setDepth(50);
  }

  // Debug overlay: rectangles + labels for every zone
  renderDebug(gfx) {
    this.zones.forEach((z) => {
      const c = z.type === "minigame" ? 0xff44ff
              : z.type === "music"    ? 0x44ffff
              : z.type === "weather"  ? 0xffff44
              : z.type === "dialogue" ? 0xff8844
              : 0x88ffaa;
      gfx.lineStyle(2, c, 1);
      gfx.fillStyle(c, 0.12);
      gfx.fillRect(z.x, z.y, z.w, z.h);
      gfx.strokeRect(z.x, z.y, z.w, z.h);
    });
  }
}
