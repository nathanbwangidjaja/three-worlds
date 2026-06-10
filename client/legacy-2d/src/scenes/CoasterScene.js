import Phaser from "phaser";
import { Dialogue } from "../systems/Dialogue.js";
import { Net } from "../systems/Network.js";

// A 30-second romantic coaster cutscene. Auto-rides through a procedural
// track while flashing memory photos. No skill required — just a moment.
// Returns to the year-1 scene when done.

export class CoasterScene extends Phaser.Scene {
  constructor() { super("coaster"); }

  init(data) {
    this.returnTo = data?.returnTo || { scene: "year", year: 1 };
  }

  create() {
    const { width, height } = this.scale.gameSize;

    // Night sky background with stars
    this.cameras.main.setBackgroundColor("#0a0820");
    for (let i = 0; i < 120; i++) {
      const star = this.add.circle(
        Phaser.Math.Between(0, width),
        Phaser.Math.Between(0, height * 0.7),
        Phaser.Math.Between(1, 2),
        0xfff4b0,
        Phaser.Math.FloatBetween(0.4, 1)
      );
      this.tweens.add({ targets: star, alpha: 0.2, duration: Phaser.Math.Between(800, 2200), yoyo: true, repeat: -1 });
    }

    // Scrolling silhouette mountains (parallax)
    const farG = this.add.graphics();
    farG.fillStyle(0x1a1530, 1);
    for (let x = -50; x < width * 3; x += 80) {
      const peakY = height * 0.55 + Phaser.Math.Between(-30, 30);
      farG.fillTriangle(x, height * 0.7, x + 40, peakY, x + 80, height * 0.7);
    }
    farG.fillRect(0, height * 0.7, width * 3, height * 0.3);

    // Track (yellow rails)
    const trackG = this.add.graphics();
    trackG.lineStyle(4, 0xfff4b0, 1);
    const trackY = height * 0.7;
    for (let x = 0; x < width * 4; x += 6) {
      const y = trackY + Math.sin(x * 0.015) * 25;
      trackG.lineBetween(x, y, x + 5, trackY + Math.sin((x + 5) * 0.015) * 25);
    }
    trackG.fillStyle(0x6b3a1a, 1);
    for (let x = 0; x < width * 4; x += 16) {
      const y = trackY + Math.sin(x * 0.015) * 25;
      trackG.fillRect(x, y + 4, 3, 10); // ties
    }

    // Camera follows the cart along the track
    const cart = this.add.rectangle(width * 0.5, trackY - 18, 70, 36, 0x8b2a3a).setStrokeStyle(2, 0xfff4b0);
    const youSprite = this.add.image(cart.x - 14, cart.y - 22, this.textures.exists("you-down") ? "you-down" : "you-placeholder").setScale(0.5);
    const herSprite = this.add.image(cart.x + 14, cart.y - 22, this.textures.exists("her-down") ? "her-down" : "her-placeholder").setScale(0.5);

    // Speed lines for "fast" feeling
    const speedLines = [];
    for (let i = 0; i < 10; i++) {
      const l = this.add.line(0, 0, 0, 0, 80, 0, 0xffffff, 0.4).setLineWidth(1);
      l.x = Phaser.Math.Between(0, width);
      l.y = Phaser.Math.Between(50, height * 0.65);
      speedLines.push(l);
    }

    // Title + countdown
    const title = this.add.text(width / 2, 40, "🎢 Riding together", {
      fontSize: "20px", color: "#fff4b0", fontStyle: "bold",
      backgroundColor: "rgba(0,0,0,0.6)",
    }).setOrigin(0.5).setPadding(10, 5, 10, 5).setDepth(100);

    // Memory cards that fade in/out
    const memories = [
      "Year 1 — that day we drove down at 6am",
      "Year 1 — your face on Big Thunder",
      "Year 1 — the churro you shared with me",
      "Year 1 — the photo by the castle at sunset",
      "Year 1 — falling asleep on the drive home",
    ];

    let memIdx = 0;
    const showMemory = () => {
      const t = this.add.text(width / 2, height / 2, memories[memIdx % memories.length], {
        fontSize: "18px",
        color: "#fff4b0",
        backgroundColor: "rgba(0,0,0,0.85)",
        align: "center",
        wordWrap: { width: width * 0.7 },
      }).setOrigin(0.5).setPadding(14, 8, 14, 8).setDepth(150).setAlpha(0);
      this.tweens.add({ targets: t, alpha: 1, duration: 400, yoyo: true, hold: 2400, onComplete: () => t.destroy() });
      memIdx++;
    };
    this.time.addEvent({ delay: 3500, repeat: 4, callback: showMemory });

    // Cart bob animation
    this.tweens.add({
      targets: [cart, youSprite, herSprite],
      y: "+=20",
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    // Speed line scroll
    this.tweens.add({
      targets: speedLines,
      x: "-=200",
      duration: 400,
      repeat: -1,
      onRepeat: () => {
        speedLines.forEach((l) => {
          l.x = width + 50;
          l.y = Phaser.Math.Between(50, height * 0.65);
        });
      },
    });

    // After 18 seconds, fade out and return
    this.time.delayedCall(18000, () => {
      const fade = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0).setDepth(500);
      this.tweens.add({
        targets: fade,
        alpha: 1,
        duration: 1500,
        onComplete: () => {
          this.scene.start(this.returnTo.scene, this.returnTo.scene === "year" ? { year: this.returnTo.year } : {});
        },
      });
    });

    // Allow skip with Space
    this.input.keyboard.once("keydown-SPACE", () => {
      this.scene.start(this.returnTo.scene, this.returnTo.scene === "year" ? { year: this.returnTo.year } : {});
    });

    this.add.text(width / 2, height - 30, "press SPACE to skip", {
      fontSize: "11px", color: "#fff4b0", backgroundColor: "rgba(0,0,0,0.5)",
    }).setOrigin(0.5).setPadding(6, 3, 6, 3).setAlpha(0.6).setDepth(100);

    Net.sendEnterScene("coaster", 0, 0);
  }
}
