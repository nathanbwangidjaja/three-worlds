// In-scene portal/wall editor.
// Toggle with backtick (`). Drag rectangles to reposition. Click empty area to
// add a new portal. Right-click to delete. Press C to copy JSON to clipboard.
//
// This is the lightweight equivalent of Tiled's object-layer editor — same
// pattern (rectangles + named properties) used by every Phaser RPG, without
// requiring an external tool.

import Phaser from "phaser";

const HELP_TEXT =
  "EDIT MODE  ·  drag = move  ·  click empty = add  ·  R-click = del\nC = copy JSON  ·  ` = exit";

export class Editor {
  constructor(scene) {
    this.scene = scene;
    this.active = false;
    this.gfx = null;
    this.helpText = null;
    this.mouseLabel = null;
    this.handles = []; // visual handles per portal/wall
    this.dragging = null;

    scene.input.keyboard.on("keydown-BACKTICK", () => this.toggle());
    scene.input.keyboard.on("keydown-C", () => {
      if (this.active) this.copyJSON();
    });
  }

  toggle() {
    this.active ? this.close() : this.open();
  }

  open() {
    this.active = true;
    this.gfx = this.scene.add.graphics().setDepth(1000);
    this.helpText = this.scene.add.text(8, 8, HELP_TEXT, {
      fontSize: "10px", color: "#fff", backgroundColor: "rgba(0,0,0,0.85)",
    }).setPadding(6, 4, 6, 4).setDepth(1001).setScrollFactor(0);
    this.mouseLabel = this.scene.add.text(0, 0, "", {
      fontSize: "11px", color: "#ffe", backgroundColor: "rgba(0,0,0,0.7)",
    }).setPadding(3, 1, 3, 1).setDepth(1001);

    this.scene.input.on("pointermove", this.onMove, this);
    this.scene.input.on("pointerdown", this.onDown, this);
    this.scene.input.on("pointerup", this.onUp, this);

    this.rebuildHandles();
    this.redraw();
  }

  close() {
    this.active = false;
    this.gfx?.destroy(); this.gfx = null;
    this.helpText?.destroy(); this.helpText = null;
    this.mouseLabel?.destroy(); this.mouseLabel = null;
    this.handles.forEach((h) => h.destroy());
    this.handles = [];
    this.dragging = null;
    this.scene.input.off("pointermove", this.onMove, this);
    this.scene.input.off("pointerdown", this.onDown, this);
    this.scene.input.off("pointerup", this.onUp, this);
  }

  // Build invisible interaction handles over each portal so they can be dragged.
  rebuildHandles() {
    this.handles.forEach((h) => h.destroy());
    this.handles = [];
    const portals = this.scene.interactables.filter((i) => i.kind === "portal");
    portals.forEach((p) => {
      const r = this.scene.add.rectangle(p.x, p.y, 40, 40, 0x00ffaa, 0.0001);
      r.setInteractive({ draggable: true });
      r.setDepth(999);
      r.portalRef = p;
      this.handles.push(r);
    });
  }

  redraw() {
    if (!this.gfx) return;
    this.gfx.clear();

    // Draw walls in red
    const walls = this.scene.walls?.getChildren?.() || [];
    walls.forEach((w) => {
      const bounds = w.getBounds();
      this.gfx.lineStyle(2, 0xff4444, 0.9);
      this.gfx.fillStyle(0xff4444, 0.18);
      this.gfx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
      this.gfx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
    });

    // Draw portal positions in yellow
    const portals = this.scene.interactables.filter((i) => i.kind === "portal");
    portals.forEach((p) => {
      this.gfx.lineStyle(2, 0xffee44, 1);
      this.gfx.fillStyle(0xffee44, 0.25);
      this.gfx.fillRect(p.x - 20, p.y - 20, 40, 40);
      this.gfx.strokeRect(p.x - 20, p.y - 20, 40, 40);
    });

    // Labels overlay
    this._refreshPortalLabels(portals);
  }

  _refreshPortalLabels(portals) {
    if (!this._labelTexts) this._labelTexts = [];
    this._labelTexts.forEach((t) => t.destroy());
    // Stagger labels above/below the rectangle to avoid horizontal overlap
    this._labelTexts = portals.map((p, i) => {
      const yOff = (i % 2 === 0) ? -34 : 26;
      const lbl = `${p.data.label}\n${Math.round(p.x)},${Math.round(p.y)}`;
      return this.scene.add.text(p.x, p.y + yOff, lbl, {
        fontSize: "9px", color: "#fff", backgroundColor: "rgba(0,0,0,0.85)",
        align: "center",
      }).setOrigin(0.5).setPadding(3, 1, 3, 1).setDepth(1002);
    });
  }

  onMove(p) {
    if (!this.active) return;
    this.mouseLabel.setText(`(${Math.round(p.worldX)}, ${Math.round(p.worldY)})`);
    this.mouseLabel.x = p.worldX + 10;
    this.mouseLabel.y = p.worldY + 10;

    if (this.dragging) {
      this.dragging.portalRef.x = Math.round(p.worldX);
      this.dragging.portalRef.y = Math.round(p.worldY);
      this.dragging.x = this.dragging.portalRef.x;
      this.dragging.y = this.dragging.portalRef.y;
      // also move the door's visible glow + label sprites if they exist
      const ref = this.dragging.portalRef;
      if (ref.sprite) {
        ref.sprite.x = ref.x;
        ref.sprite.y = ref.y + 12; // aura is slightly below
      }
      this.redraw();
    }
  }

  onDown(p) {
    if (!this.active) return;
    // Find which handle (if any) was clicked
    const hit = this.handles.find((h) => {
      const b = h.getBounds();
      return p.worldX >= b.x && p.worldX <= b.x + b.width && p.worldY >= b.y && p.worldY <= b.y + b.height;
    });
    if (p.rightButtonDown()) {
      if (hit) this._deletePortal(hit.portalRef);
      return;
    }
    if (hit) {
      this.dragging = hit;
    } else {
      // Click on empty area → add new portal
      this._addPortalAt(Math.round(p.worldX), Math.round(p.worldY));
    }
  }

  onUp() {
    this.dragging = null;
  }

  _addPortalAt(x, y) {
    // Pick the next missing year (1..5) or fall back
    const portals = this.scene.interactables.filter((i) => i.kind === "portal");
    const existingYears = new Set(portals.map((p) => p.data.year).filter(Boolean));
    let year = 1;
    while (existingYears.has(year) && year <= 5) year++;
    const isFinale = year > 5;
    const data = isFinale
      ? { x, y, scene: "finale", label: "❤ Finale" }
      : { x, y, scene: "year", year, label: `Year ${year}` };
    const portal = { x, y, kind: "portal", data, sprite: null };
    this.scene.interactables.push(portal);
    this.rebuildHandles();
    this.redraw();
  }

  _deletePortal(portalRef) {
    const idx = this.scene.interactables.indexOf(portalRef);
    if (idx >= 0) this.scene.interactables.splice(idx, 1);
    if (portalRef.sprite) portalRef.sprite.destroy();
    this.rebuildHandles();
    this.redraw();
  }

  copyJSON() {
    const portals = this.scene.interactables
      .filter((i) => i.kind === "portal")
      .map((p) => {
        const out = { x: p.x, y: p.y, scene: p.data.scene, label: p.data.label };
        if (p.data.year != null) out.year = p.data.year;
        return out;
      })
      .sort((a, b) => (a.year || 99) - (b.year || 99));

    const json = JSON.stringify(portals, null, 2);
    try {
      navigator.clipboard.writeText(json);
      this._toast("Copied portals JSON to clipboard");
    } catch {
      console.log("[editor] portals JSON:\n" + json);
      this._toast("Logged JSON to console (clipboard blocked)");
    }
  }

  _toast(msg) {
    const t = this.scene.add.text(320, 60, msg, {
      fontSize: "12px", color: "#0f0", backgroundColor: "rgba(0,0,0,0.85)",
    }).setOrigin(0.5).setPadding(8, 4, 8, 4).setDepth(2000);
    this.scene.tweens.add({ targets: t, alpha: 0, duration: 2500, onComplete: () => t.destroy() });
  }
}
