# Our Little World 🌍❤️🗼

A 3D multiplayer anniversary game for two. You each start at your **real home** — his street
in Cambridge (Boston) and her street in Tangerang — rebuilt in 3D from real OpenStreetMap
data (every building, road, park, and the rivers are real). Travel through glowing portals
and meet under a sparkling Eiffel Tower in Paris at midnight, where being together triggers
fireworks.

Built with **Three.js** (rendering) + **Colyseus** (multiplayer) + **Vite**.

## Quick start

```bash
npm install
npm run dev
```

- client → http://localhost:5173
- server → ws://localhost:2567

Open the URL in two tabs/devices, one picks **Play as Him 💙**, the other **Play as Her 🩷**.
He spawns in Boston, she spawns in Tangerang. Meet in Paris. 🗼

If the server isn't running you can still explore solo (offline mode).

## Controls

| key | action |
|---|---|
| WASD / arrows | walk |
| Shift | run |
| Space | hop |
| drag mouse | orbit camera, wheel to zoom |
| E | interact (home markers, plaque, bench, portals) |
| M | travel menu |
| Enter | chat (Esc closes) |
| 1 / 2 / 3 / 4 | emotes: ❤️ 👋 ✨ 😘 |

## ✏️ Before gift day: write your words

All the text in the game lives in **`client/src/game/story.js`** — the home messages,
the plaque at the Eiffel Tower, the bench note. Replace every `[bracketed placeholder]`
with your own words. Names/subtitles per city are in `client/src/game/themes.js`.

## The special moment

When **both of you stand within ~110 m of the Eiffel Tower at the same time**, the tower's
sparkle goes into overdrive, a banner appears, and fireworks launch over the Seine for as
long as you stay together.

## Photorealistic mode (Google 3D Tiles)

With `VITE_GOOGLE_MAPS_API_KEY` set in `client/.env` (Map Tiles API enabled),
**Boston and Paris stream Google's real photogrammetry** — his actual street in
Cambridge and the real Eiffel Tower, walkable, with terrain-following movement.
Tangerang stays in the stylized OSM world because Google has no 3D building mesh
for that area (per-city switch: `CITY_COORDS` in `client/src/game/RealWorld.js`).
Without a key, every city falls back to the stylized world automatically.

## Real map data

`client/public/data/{boston,tangerang,paris}.json` were baked from OpenStreetMap
(© OpenStreetMap contributors, ODbL) via:

```bash
node tools/fetch-osm.js      # buildings, roads, water, parks, trees
node tools/fetch-rivers.js   # river ribbons (the Seine, the Broad Canal)
```

Re-run them if you want to change the radius (default 700 m) or center coordinates —
they're at the top of each script.

## Testing multiplayer alone

```bash
node tools/bot.js paris 60   # a fake "her" joins Paris for 60s, walks, chats, emotes
```

## Deploying (so she can play from Indonesia)

- **Server** → Render (see `server/render.yaml`): deploy `server/`, note the wss URL.
- **Client** → Vercel (see `client/vercel.json`): deploy `client/`, set env var
  `VITE_SERVER_URL=wss://your-server.onrender.com`.

Then send her the Vercel link. That's it.

## Project layout

```
client/src/game/   Game.js (orchestrator) · WorldBuilder.js (OSM→3D city)
                   landmarks.js (Eiffel tower, hearts, portals, bench, picnic)
                   Avatar.js · Controls.js · Effects.js · ui.js
                   themes.js (city moods) · story.js (✏️ your words)
client/src/net.js  Colyseus client wrapper (offline-tolerant)
server/src/        Colyseus room: positions, chat, emotes
tools/             OSM bakers + test bot
client/legacy-2d/  the old 2D Phaser version, kept for memories
```
