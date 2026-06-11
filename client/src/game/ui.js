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

// ----------------------------------------------------------------- dining
let dineVisible = false;
let topicTimer = null;

function dineCard(title, sub) {
  const wrap = $("dine");
  $("dine-title").textContent = title;
  $("dine-sub").textContent = sub;
  $("dine-body").innerHTML = "";
  $("dine-actions").innerHTML = "";
  wrap.style.display = "flex";
  dineVisible = true;
  return { body: $("dine-body"), actions: $("dine-actions") };
}

export function closeDine() {
  $("dine").style.display = "none";
  dineVisible = false;
}

export function dineOpen() { return dineVisible; }

// pick up to 3 items, then "Order"
export function openMenu(name, cuisine, menu, onOrder) {
  const { body, actions } = dineCard(name, `${cuisine} · menu`);
  const picked = new Set();
  const orderBtn = document.createElement("button");
  const refresh = () => {
    orderBtn.disabled = picked.size === 0;
    orderBtn.textContent = picked.size ? `Order (${picked.size}) 🍽` : "pick something tasty…";
  };
  menu.forEach((item, i) => {
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `<span>${item[0]}</span><span class="price">${item[1]}</span>`;
    row.onclick = () => {
      if (picked.has(i)) picked.delete(i);
      else if (picked.size < 3) picked.add(i);
      row.classList.toggle("sel", picked.has(i));
      refresh();
    };
    body.appendChild(row);
  });
  orderBtn.onclick = () => {
    closeDine();
    onOrder([...picked].map((i) => menu[i]));
  };
  actions.appendChild(orderBtn);
  refresh();
}

export function showTopic(text, n) {
  const { body, actions } = dineCard("table talk 💬", `card ${n}`);
  const p = document.createElement("div");
  p.className = "topic-text";
  p.textContent = text;
  body.appendChild(p);
  const ok = document.createElement("button");
  ok.textContent = "talk it out 💛 (close)";
  ok.onclick = closeDine;
  actions.appendChild(ok);
  if (topicTimer) clearTimeout(topicTimer);
  topicTimer = setTimeout(() => { if (dineVisible) closeDine(); }, 30000);
}

export function openBill(name, order, total, currency, onPay) {
  const { body, actions } = dineCard(name, "the bill");
  for (const it of order) {
    const row = document.createElement("div");
    row.className = "bill-row";
    row.innerHTML = `<span>${it[0]}</span><span>${currency}${it[1]}</span>`;
    body.appendChild(row);
  }
  const tot = document.createElement("div");
  tot.className = "bill-row bill-total";
  tot.innerHTML = `<span>total · date #∞</span><span>${currency}${Math.round(total * 100) / 100}</span>`;
  body.appendChild(tot);
  const pay = document.createElement("button");
  pay.textContent = "pay 💳 (it's on us both)";
  pay.onclick = () => { closeDine(); onPay(); };
  actions.appendChild(pay);
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
