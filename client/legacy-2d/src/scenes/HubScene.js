import { BaseWorldScene } from "./BaseWorldScene.js";
import { HUB } from "../data/memories.js";

export class HubScene extends BaseWorldScene {
  constructor() { super("hub"); }

  getBgColor() { return HUB.bgColor; }
  getSpawn() { return HUB.spawn; }

  buildWorld() {
    // 1. Background: real room illustration if present, fallback to procedural wood-toned floor
    if (this.textures.exists("room-hub")) {
      const bg = this.add.image(320, 240, "room-hub");
      bg.setDisplaySize(640, 480);
      bg.setDepth(-100);
    } else {
      // Procedural fallback: warm wood-tone checker
      for (let y = 0; y < 480; y += 32) {
        for (let x = 0; x < 640; x += 32) {
          const c = ((x + y) / 32) % 2 === 0 ? 0x5a3a26 : 0x4a2e1c;
          this.add.rectangle(x + 16, y + 16, 32, 32, c).setDepth(-100);
        }
      }
      // Add a darker strip at the top to suggest a back wall
      this.add.rectangle(320, 60, 640, 120, 0x2a1a10).setDepth(-99);
      this.add.text(320, 30, "(drop hub.png in client/public/assets/rooms/)", {
        fontSize: "10px", color: "#888",
      }).setOrigin(0.5).setDepth(-98);
    }

    // 2. Wall collisions defined in memories.js (matches the room illustration)
    (HUB.walls || []).forEach(w => this.addWall(w.x, w.y, w.w, w.h));

    // 3. Door portals + glowing labels
    HUB.portals.forEach((p) => this.addDoor(p));
    HUB.signs.forEach((s) => this.addSign(s));

    // 4. If the room art handles all decoration, we don't need extra furniture.
    //    The room background is the visual; portals are just interactive overlays.

    // 5. Re-render the room when its texture loads in the background
    this._onRoomLoaded = (e) => {
      if (e.detail?.key === "hub") {
        this.scene.restart();
      }
    };
    window.addEventListener("room-loaded", this._onRoomLoaded);
    this.events.once("shutdown", () => {
      window.removeEventListener("room-loaded", this._onRoomLoaded);
    });
  }

  addDoor(portal) {
    const isFinale = portal.scene === "finale";

    // Subtle floor-glow at the door's footprint, doesn't obscure the door art
    const aura = this.add.ellipse(portal.x, portal.y + 12, 50, 18, isFinale ? 0xffb6c1 : 0xfff4b0, 0.25);
    aura.setDepth(-1);
    this.tweens.add({ targets: aura, alpha: 0.55, duration: 1100, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });

    // Label above the door
    const label = this.add.text(portal.x, portal.y - 36, portal.label, {
      fontSize: "12px",
      color: isFinale ? "#ffb6c1" : "#fff4b0",
      fontStyle: "bold",
      backgroundColor: "rgba(20,10,8,0.75)",
    }).setOrigin(0.5).setPadding(6, 3, 6, 3).setDepth(10);
    this.tweens.add({ targets: label, y: label.y - 3, duration: 1500, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });

    this.interactables.push({ x: portal.x, y: portal.y, kind: "portal", data: portal, sprite: aura });
  }
}
