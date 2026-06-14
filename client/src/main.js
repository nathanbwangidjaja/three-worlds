import { Net } from "./net.js";
import { Game } from "./game/Game.js";
import * as UI from "./game/ui.js";
import { STORY } from "./game/story.js";
import { OUTFITS } from "./game/Avatar.js";
import { C } from "./game/copy.js";

const loginEl = document.getElementById("login");
const statusEl = document.getElementById("login-status");
const nameInput = document.getElementById("name-input");

// fill the login screen + static HUD labels from copy.json (easy to edit)
function applyStaticCopy() {
  const set = (sel, text, html = false) => {
    const el = document.querySelector(sel);
    if (el && text != null) { if (html) el.innerHTML = text; else el.textContent = text; }
  };
  set("#login .hearts", C.login.hearts);
  set("#login h1", C.login.title);
  set("#login .sub", C.login.subtitle, true);
  set('#login button[data-role="you"]', C.login.playAsHim);
  set('#login button[data-role="her"]', C.login.playAsHer);
  set("#outfit-row .sub", C.login.outfitPrompt);
  set("#outfit-back", C.login.outfitBack);
  set("#hint", C.ui.hint);
  set("#travel h2", C.ui.travelTitle);
  set("#travel-close", C.ui.travelClose);
  set("#dialog .next", C.ui.dialogContinue);
  if (nameInput && C.login.namePlaceholder) nameInput.placeholder = C.login.namePlaceholder;
  const chatInput = document.getElementById("chat-input");
  if (chatInput && C.ui.chatPlaceholder) chatInput.placeholder = C.ui.chatPlaceholder;
}
applyStaticCopy();

// him starts in Boston, her in Tangerang — each at their real home
const HOME_WORLD = { you: "boston", her: "tangerang" };

// quick WebGL preflight so a graphics problem gives a real message,
// not an endless loading screen
function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

function showFatal(message) {
  const fade = document.getElementById("fade");
  fade.classList.add("on");
  document.getElementById("fade-text").innerHTML = `💔 ${message}`;
  document.getElementById("loading-pct").textContent = "";
}

// step 1: pick who you are → step 2: pick what you're wearing → play
let started = false;
document.querySelectorAll("#login button.role").forEach((btn) => {
  btn.addEventListener("click", () => {
    const role = btn.dataset.role;
    document.getElementById("role-row").style.display = "none";
    const row = document.getElementById("outfit-row");
    const opts = document.getElementById("outfit-options");
    opts.innerHTML = "";
    OUTFITS[role].forEach((o, i) => {
      const b = document.createElement("button");
      b.className = "role";
      b.textContent = o.label;
      b.onclick = () => begin(role, i);
      opts.appendChild(b);
    });
    row.style.display = "block";
  });
});
document.getElementById("outfit-back").addEventListener("click", () => {
  document.getElementById("outfit-row").style.display = "none";
  document.getElementById("role-row").style.display = "flex";
});

async function begin(role, outfit) {
  {
    if (started) return;
    started = true;
    const name = (nameInput.value || (role === "her" ? "Her" : "Him")).trim();
    statusEl.classList.remove("err");

    if (!webglAvailable()) {
      started = false;
      statusEl.classList.add("err");
      statusEl.textContent =
        "This browser can't do 3D (WebGL is off). Enable “Use graphics acceleration” in your browser settings, or try Chrome/Safari/Firefox.";
      return;
    }

    statusEl.textContent = C.login.connecting;

    let online = true;
    try {
      await Net.connect({ role, name, world: HOME_WORLD[role], outfit });
    } catch (err) {
      console.warn("[net] could not reach server, playing offline:", err);
      online = false;
    }

    statusEl.textContent = online ? C.login.connected : C.login.serverOffline;
    loginEl.style.display = "none";
    UI.fadeIn(C.system.packingBags);

    let game;
    try {
      game = new Game({
        container: document.getElementById("app"),
        role,
        name,
        outfit,
      });
    } catch (err) {
      console.error("[game] renderer failed:", err);
      showFatal(
        "Couldn't start the 3D renderer.<br/><small>Usually this means graphics acceleration is " +
        "disabled — check chrome://settings/system → “Use graphics acceleration”, then relaunch. " +
        "Or try another browser.</small>"
      );
      return;
    }
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

    try {
      await game.loadWorld(HOME_WORLD[role]);
    } catch (err) {
      console.error("[game] world load failed:", err);
      showFatal(`Couldn't load the city.<br/><small>${String(err.message || err)}</small>`);
      return;
    }
    UI.fadeOut();
    game.start();
    if (online) Net._emitPlayers(); // pick up a partner who was already in-world

    if (!online) {
      UI.addSystem(C.system.offlineMode);
    }
  }
}
