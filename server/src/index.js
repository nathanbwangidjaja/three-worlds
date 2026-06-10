import http from "http";
import express from "express";
import cors from "cors";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { WorldRoom } from "./rooms/WorldRoom.js";

const port = Number(process.env.PORT) || 2567;
const app = express();
app.use(cors());
app.get("/", (_req, res) => res.send("anniversary-gift server ok"));

const server = http.createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server }),
});

gameServer.define("world", WorldRoom);

server.listen(port, () => {
  console.log(`[server] listening on :${port}`);
});
