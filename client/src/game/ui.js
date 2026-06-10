// All DOM/HUD plumbing in one place.
import { DESTINATIONS, THEMES } from "./themes.js";

const $ = (id) => document.getElementById(id);

let dialogState = null; // { pages, index }
let travelVisible = false;

// ----------------------------------------------------------- location/hud
export function setLocation(city, tag) {
  const el = $("location");
  el.querySelector(".city").textContent = city;
  el.querySelector(".tag").textContent = tag;
  el.style.opacity = 1;
}

export function setPartnerStatus(text) {
  $("partner-status").textContent = text ?? "";
}

export function setAttribution(text) {
  $("attribution").textContent = text ?? "";
}

export function setPrompt(text) {
  const el = $("prompt");
  if (text) { el.textContent = text; el.style.display = "block"; }
  else el.style.display = "none";
}

let bannerTimeout = null;
export function setBanner(text) {
  const el = $("banner");
  if (bannerTimeout) { clearTimeout(bannerTimeout); bannerTimeout = null; }
  if (text) {
    el.textContent = text;
    el.style.opacity = 1;
  } else {
    el.style.opacity = 0;
  }
}

// ----------------------------------------------------------------- dialog
export function showDialog(speaker, pages) {
  dialogState = { pages, index: 0 };
  $("dialog").style.display = "block";
  $("dialog").querySelector(".speaker").textContent = speaker;
  $("dialog").querySelector(".text").textContent = pages[0];
}

export function advanceDialog() {
  if (!dialogState) return;
  dialogState.index++;
  if (dialogState.index >= dialogState.pages.length) {
    dialogState = null;
    $("dialog").style.display = "none";
    return;
  }
  $("dialog").querySelector(".text").textContent = dialogState.pages[dialogState.index];
}

export function dialogOpen() { return dialogState !== null; }

// ------------------------------------------------------------------- chat
let chatInputOpen = false;

export function initChat(onSend) {
  const input = $("chat-input");
  window.addEventListener("keydown", (e) => {
    if (dialogOpen() || travelVisible) return;
    if (e.code === "Enter" && !chatInputOpen) {
      e.preventDefault();
      chatInputOpen = true;
      input.style.display = "block";
      input.focus();
    } else if (chatInputOpen && e.code === "Enter") {
      e.preventDefault();
      const text = input.value.trim();
      if (text) onSend(text);
      input.value = "";
      input.style.display = "none";
      input.blur();
      chatInputOpen = false;
    } else if (chatInputOpen && e.code === "Escape") {
      input.value = "";
      input.style.display = "none";
      input.blur();
      chatInputOpen = false;
    }
  });
}

export function chatOpen() { return chatInputOpen; }

export function addChat(name, text, role) {
  _pushChat(`<b>${escapeHtml(name)}</b> &nbsp;${escapeHtml(text)}`, false);
}

export function addSystem(text) {
  _pushChat(escapeHtml(text), true);
}

function _pushChat(html, sys) {
  const log = $("chat-log");
  const div = document.createElement("div");
  div.className = "msg" + (sys ? " sys" : "");
  div.innerHTML = html;
  log.appendChild(div);
  while (log.children.length > 7) log.removeChild(log.firstChild);
  setTimeout(() => { div.style.opacity = "0.25"; }, 14000);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ----------------------------------------------------------------- travel
export function openTravel(currentWorld, onPick) {
  const wrap = $("travel");
  const opts = $("travel-options");
  opts.innerHTML = "";
  for (const d of DESTINATIONS[currentWorld]) {
    const btn = document.createElement("button");
    btn.textContent = d.label;
    btn.onclick = () => { closeTravel(); onPick(d.to); };
    opts.appendChild(btn);
  }
  wrap.style.display = "flex";
  travelVisible = true;
}

export function closeTravel() {
  $("travel").style.display = "none";
  travelVisible = false;
}

export function travelOpen() { return travelVisible; }

export function initTravel() {
  $("travel-close").onclick = closeTravel;
  window.addEventListener("keydown", (e) => {
    if (travelVisible && e.code === "Escape") closeTravel();
  });
}

// ------------------------------------------------------------------- fade
export function fadeIn(text) {
  $("fade-text").textContent = text ?? "";
  $("loading-pct").textContent = "";
  $("fade").classList.add("on");
}

export function fadeOut() {
  $("fade").classList.remove("on");
  $("loading-pct").textContent = "";
}

export function setLoading(pct, label) {
  $("loading-pct").textContent = pct < 1 ? `${Math.round(pct * 100)}% · ${label}` : "";
}

// ------------------------------------------------------------------ login
export function initEmotes(onEmote) {
  document.querySelectorAll("#emotes button").forEach((btn) => {
    btn.addEventListener("click", () => onEmote(btn.dataset.emote));
  });
}
