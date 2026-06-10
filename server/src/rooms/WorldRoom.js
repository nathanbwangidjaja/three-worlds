import { Room } from "colyseus";
import { Schema, MapSchema, type } from "@colyseus/schema";

export class Player extends Schema {
  constructor() {
    super();
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.ry = 0;          // heading
    this.speed = 0;       // horizontal m/s, drives remote walk animation
    this.world = "boston"; // boston | tangerang | paris
    this.name = "?";
    this.role = "you";    // "you" (him) or "her"
  }
}
type("number")(Player.prototype, "x");
type("number")(Player.prototype, "y");
type("number")(Player.prototype, "z");
type("number")(Player.prototype, "ry");
type("number")(Player.prototype, "speed");
type("string")(Player.prototype, "world");
type("string")(Player.prototype, "name");
type("string")(Player.prototype, "role");

export class WorldState extends Schema {
  constructor() {
    super();
    this.players = new MapSchema();
  }
}
type({ map: Player })(WorldState.prototype, "players");

export class WorldRoom extends Room {
  // just the two of them (a couple spare slots so a quick refresh never locks anyone out)
  maxClients = 4;

  onCreate() {
    this.setState(new WorldState());

    this.onMessage("move", (client, d) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || typeof d !== "object") return;
      if (Number.isFinite(d.x)) p.x = d.x;
      if (Number.isFinite(d.y)) p.y = d.y;
      if (Number.isFinite(d.z)) p.z = d.z;
      if (Number.isFinite(d.ry)) p.ry = d.ry;
      if (Number.isFinite(d.speed)) p.speed = d.speed;
    });

    this.onMessage("world", (client, d) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || typeof d !== "object") return;
      if (typeof d.world === "string") p.world = d.world.slice(0, 24);
      if (Number.isFinite(d.x)) p.x = d.x;
      if (Number.isFinite(d.z)) p.z = d.z;
      p.speed = 0;
    });

    this.onMessage("chat", (client, d) => {
      const p = this.state.players.get(client.sessionId);
      const text = String(d?.text ?? "").slice(0, 200).trim();
      if (!p || !text) return;
      this.broadcast("chat", { id: client.sessionId, name: p.name, role: p.role, text });
    });

    this.onMessage("emote", (client, d) => {
      const p = this.state.players.get(client.sessionId);
      const kind = String(d?.kind ?? "heart").slice(0, 16);
      if (!p) return;
      this.broadcast("emote", { id: client.sessionId, kind });
    });
  }

  onJoin(client, options) {
    const player = new Player();
    player.role = options?.role === "her" ? "her" : "you";
    player.name = String(options?.name ?? (player.role === "her" ? "Her" : "Him")).slice(0, 24);
    player.world = typeof options?.world === "string" ? options.world : "boston";
    if (Number.isFinite(options?.x)) player.x = options.x;
    if (Number.isFinite(options?.z)) player.z = options.z;
    this.state.players.set(client.sessionId, player);
    console.log(`[room] ${player.name} (${player.role}) joined ${player.world} — ${this.clients.length} online`);
  }

  onLeave(client) {
    const p = this.state.players.get(client.sessionId);
    if (p) console.log(`[room] ${p.name} left`);
    this.state.players.delete(client.sessionId);
  }
}
