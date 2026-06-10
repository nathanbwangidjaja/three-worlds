import { Client } from "colyseus.js";

const SERVER_URL =
  import.meta.env.VITE_SERVER_URL || "ws://localhost:2567";

class NetworkManager {
  constructor() {
    this.client = null;
    this.room = null;
    this.role = "her";
    this.name = "Player";
    this.connected = false;
  }

  async connect({ role, name }) {
    this.role = role;
    this.name = name;
    try {
      this.client = new Client(SERVER_URL);
      this.room = await this.client.joinOrCreate("world", { role, name });
      this.connected = true;
      console.log("[net] joined as", this.room.sessionId);
    } catch (err) {
      console.warn("[net] could not connect, running solo:", err.message);
      this.connected = false;
    }
  }

  sendMove(x, y, dir, scene) {
    if (!this.connected) return;
    this.room.send("move", { x, y, dir, scene });
  }

  sendEnterScene(scene, x, y) {
    if (!this.connected) return;
    this.room.send("enter-scene", { scene, x, y });
  }

  onStateChange(cb) {
    if (!this.connected) return () => {};
    const handler = (state) => cb(state);
    this.room.onStateChange(handler);
    return () => this.room.onStateChange.remove?.(handler);
  }

  get sessionId() {
    return this.room?.sessionId;
  }
}

export const Net = new NetworkManager();
