import { Net } from "./net.js";
import { Game } from "./game/Game.js";
import * as UI from "./game/ui.js";
import { STORY } from "./game/story.js";

const loginEl = document.getElementById("login");
const statusEl = document.getElementById("login-status");
const nameInput = document.getElementById("name-input");

// him starts in Boston, her in Tangerang — each at their real home
const HOME_WORLD = { you: "boston", her: "tangerang" };

document.querySelectorAll("#login button.role").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const role = btn.dataset.role;
    const name = (nameInput.value || (role === "her" ? "Her" : "Him")).trim();
    statusEl.classList.remove("err");
    statusEl.textContent = "connecting…";

    let online = true;
    try {
      await Net.connect({ role, name, world: HOME_WORLD[role] });
    } catch (err) {
      console.warn("[net] could not reach server, playing offline:", err);
      online = false;
    }

    statusEl.textContent = online ? "connected ❤" : "server offline — exploring solo";
    loginEl.style.display = "none";
    UI.fadeIn("✈️ packing your bags…");

    const game = new Game({
      container: document.getElementById("app"),
      role,
      name,
    });
    window.__game = game; // for debugging

    UI.initChat((text) => {
      Net.sendChat(text);
      UI.addChat(name, text, role);
      game.avatar.say(text);
    });
    UI.initTravel();
    UI.initEmotes((kind) => game.emote(kind));

    Net.on("players", (others) => {
      // joined/left toasts
      const ids = new Set(others.map((o) => o.id));
      if (!window.__seenPlayers) window.__seenPlayers = new Map();
      for (const o of others) {
        if (!window.__seenPlayers.has(o.id)) {
          UI.addSystem(STORY.partnerJoined(o.name));
        }
        window.__seenPlayers.set(o.id, o.name);
      }
      for (const [id, pname] of window.__seenPlayers) {
        if (!ids.has(id)) {
          UI.addSystem(STORY.partnerLeft(pname));
          window.__seenPlayers.delete(id);
        }
      }
    });

    await game.loadWorld(HOME_WORLD[role]);
    UI.fadeOut();
    game.start();
    if (online) Net._emitPlayers(); // pick up a partner who was already in-world

    if (!online) {
      UI.addSystem("offline mode — start the server and refresh to play together");
    }
  });
});
