import Phaser from "phaser";
import { Dialogue } from "../systems/Dialogue.js";
import { FINALE } from "../data/memories.js";
import { Net } from "../systems/Network.js";

export class FinaleScene extends Phaser.Scene {
  constructor() { super("finale"); }

  create() {
    this.cameras.main.setBackgroundColor(FINALE.bgColor);

    // Slow starry background
    for (let i = 0; i < 80; i++) {
      const x = Phaser.Math.Between(0, 640);
      const y = Phaser.Math.Between(0, 480);
      const star = this.add.circle(x, y, Phaser.Math.Between(1, 2), 0xfff4b0, Phaser.Math.FloatBetween(0.3, 0.9));
      this.tweens.add({ targets: star, alpha: 0.1, duration: Phaser.Math.Between(800, 2000), yoyo: true, repeat: -1 });
    }

    // Big heart
    const heart = this.add.text(320, 200, "❤", { fontSize: "96px" }).setOrigin(0.5);
    this.tweens.add({ targets: heart, scale: 1.1, duration: 800, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });

    Net.sendEnterScene("finale", 320, 400);

    this.time.delayedCall(800, () => {
      Dialogue.show(FINALE.pages, () => {
        this.add.text(320, 360, "press SPACE to go home", { fontSize: "12px", color: "#fff4b0" }).setOrigin(0.5).setAlpha(0.6);
        this.input.keyboard.once("keydown-SPACE", () => this.scene.start("hub"));
      });
    });
  }
}
