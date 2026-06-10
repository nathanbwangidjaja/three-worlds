import Phaser from "phaser";

// Debug scene showing all tiles in a tileset with their indices.
// Switch tileset via: __game.scene.start("tile-palette", { which: "urban" | "tt" })

export class TilePaletteScene extends Phaser.Scene {
  constructor() { super("tile-palette"); }

  init(data) {
    this.which = data?.which || "tt";
  }

  preload() {
    this.load.spritesheet("tt-tiles", "/assets/tilesets/tiny_town.png", {
      frameWidth: 16, frameHeight: 16,
    });
    this.load.spritesheet("urban-tiles", "/assets/tilesets/urban.png", {
      frameWidth: 16, frameHeight: 16,
    });
  }

  create() {
    this.cameras.main.setBackgroundColor("#222");
    const key = this.which === "urban" ? "urban-tiles" : "tt-tiles";
    const COLS = this.which === "urban" ? 27 : 12;
    const TOTAL = this.which === "urban" ? 486 : 132;
    const SCALE = this.which === "urban" ? 2 : 3;
    const CELL = 16 * SCALE + 14;
    const padX = 10, padY = 30;

    this.add.text(padX, 4, `${this.which === "urban" ? "Urban" : "Tiny Town"} palette — index: (col,row)`, {
      fontSize: "11px", color: "#fff",
    });

    for (let i = 0; i < TOTAL; i++) {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = padX + col * CELL;
      const y = padY + row * CELL;
      this.add.image(x, y, key, i).setOrigin(0, 0).setScale(SCALE);
      this.add.text(x + 1, y + 16 * SCALE + 1, `${i}`, {
        fontSize: "8px", color: "#ffe", backgroundColor: "rgba(0,0,0,0.6)",
      }).setPadding(1, 0, 1, 0);
    }
  }
}
