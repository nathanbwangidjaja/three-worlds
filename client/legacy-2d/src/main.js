import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene.js";
import { HubScene } from "./scenes/HubScene.js";
import { YearScene } from "./scenes/YearScene.js";
import { FinaleScene } from "./scenes/FinaleScene.js";
import { CoasterScene } from "./scenes/CoasterScene.js";
import { TilePaletteScene } from "./scenes/TilePaletteScene.js";
import { Net } from "./systems/Network.js";

const TILE = 32;
const VIEW_W = 20 * TILE; // 640
const VIEW_H = 15 * TILE; // 480

const loginEl = document.getElementById("login");
const nameInput = document.getElementById("name-input");

document.querySelectorAll("#login button").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const role = btn.dataset.role;
    const name = (nameInput.value || (role === "her" ? "Her" : "You")).trim();
    loginEl.style.display = "none";
    await Net.connect({ role, name });
    startGame();
  });
});

function startGame() {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    width: VIEW_W,
    height: VIEW_H,
    pixelArt: true,
    backgroundColor: "#1a1428",
    physics: {
      default: "arcade",
      arcade: { gravity: { y: 0 }, debug: false },
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [BootScene, HubScene, YearScene, FinaleScene, CoasterScene, TilePaletteScene],
  });
  window.__game = game;
  console.log("[debug] game exposed on window.__game");
}
