// Colyseus connection wrapper. The game still works offline if the
// server can't be reached — you just walk the world alone.
import { Client, getStateCallbacks } from "colyseus.js";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "ws://localhost:2567";

export const Net = {
  room: null,
  sessionId: null,
  connected: false,
  listeners: { chat: [], emote: [], players: [] },

  async connect({ role, name, world, x, z }) {
    const client = new Client(SERVER_URL);
    this.room = await client.joinOrCreate("world", { role, name, world, x, z });
    this.sessionId = this.room.sessionId;
    this.connected = true;

    this.room.onMessage("chat", (m) => this.listeners.chat.forEach((fn) => fn(m)));
    this.room.onMessage("emote", (m) => this.listeners.emote.forEach((fn) => fn(m)));

    const $ = getStateCallbacks(this.room);
    $(this.room.state).players.onAdd((player, id) => {
      this._emitPlayers();
      $(player).onChange(() => this._emitPlayers());
    });
    $(this.room.state).players.onRemove(() => this._emitPlayers());

    this.room.onLeave(() => { this.connected = false; });
    return this.room;
  },

  _emitPlayers() {
    if (!this.room) return;
    const others = [];
    this.room.state.players.forEach((p, id) => {
      if (id !== this.sessionId) {
        others.push({ id, x: p.x, y: p.y, z: p.z, ry: p.ry, speed: p.speed, world: p.world, name: p.name, role: p.role });
      }
    });
    this.listeners.players.forEach((fn) => fn(others));
  },

  on(event, fn) { this.listeners[event].push(fn); },

  sendMove(data) { if (this.connected) this.room.send("move", data); },
  sendWorld(data) { if (this.connected) this.room.send("world", data); },
  sendChat(text) { if (this.connected) this.room.send("chat", { text }); },
  sendEmote(kind) { if (this.connected) this.room.send("emote", { kind }); },
};
