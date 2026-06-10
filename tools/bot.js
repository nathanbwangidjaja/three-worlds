// Headless test partner: joins as "her", walks a little circle,
// chats and sends an emote. Used to verify multiplayer end-to-end.
// Usage: node tools/bot.js [world] [seconds]
import { Client } from "colyseus.js";

if (typeof globalThis.WebSocket === "undefined") {
  const { WebSocket } = await import("ws");
  globalThis.WebSocket = WebSocket;
}

const world = process.argv[2] || "boston";
const seconds = Number(process.argv[3]) || 45;
// ground height to walk at (photoreal cities have real terrain: boston ≈ -26, paris ≈ 71)
const baseY = Number(process.argv[4]) || { boston: -26, paris: 71, tangerang: 0 }[world] || 0;
const url = process.env.SERVER_URL || "ws://localhost:2567";

const client = new Client(url);
const room = await client.joinOrCreate("world", { role: "her", name: "TestHer", world });
console.log("[bot] joined as", room.sessionId, "in", world);

room.onMessage("chat", (m) => console.log("[bot] chat:", m.name + ":", m.text));
room.onMessage("emote", (m) => console.log("[bot] emote:", m.kind, "from", m.id));

const cx = 8, cz = 14, r = 4;
let t = 0;
const iv = setInterval(() => {
  t += 0.1;
  const x = cx + Math.cos(t) * r;
  const z = cz + Math.sin(t) * r;
  room.send("move", { x, y: baseY, z, ry: t + Math.PI / 2, speed: 2.5 });
}, 100);

setTimeout(() => room.send("chat", { text: "hii it's me!! this city is so cute 🥺" }), 3000);
setTimeout(() => room.send("emote", { kind: "heart" }), 6000);
setTimeout(() => room.send("chat", { text: "meet me in paris? 🗼" }), 10000);

setTimeout(() => {
  clearInterval(iv);
  room.leave();
  console.log("[bot] left");
  process.exit(0);
}, seconds * 1000);
