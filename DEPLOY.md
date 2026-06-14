# Publishing the game 🌍❤️

The game has two halves:

- **Client** — the Three.js world (a static site) → **Vercel**
- **Server** — the Colyseus multiplayer server (a live WebSocket) → **Render**

Both have free tiers and deploy straight from this GitHub repo. Do the
server first (you need its URL for the client).

---

## 1. Server → Render (~3 min)

1. Go to https://render.com and sign in with GitHub.
2. **New +** → **Blueprint** → pick the `three-worlds` repo → **Apply**.
   (It reads `render.yaml` and creates the `anniversary-server` web service.)
3. Wait for it to go **Live**, then copy its URL, e.g.
   `https://anniversary-server.onrender.com`
4. Visiting that URL should say **"anniversary-gift server ok"**.

> Free plan note: the server sleeps after ~15 min idle and takes ~50s to
> wake. Just open the game yourself a minute before you share it so it's warm.

---

## 2. Client → Vercel (~3 min)

1. Go to https://vercel.com and sign in with GitHub.
2. **Add New… → Project** → import the `three-worlds` repo.
3. Vercel reads `vercel.json` automatically (build `npm run build`,
   output `client/dist`). Leave the defaults.
4. Before deploying, open **Environment Variables** and add:
   - **Name:** `VITE_SERVER_URL`
   - **Value:** `wss://anniversary-server.onrender.com`
     (your Render URL from step 1, but with **`wss://`** instead of `https://`)
5. **Deploy.** You'll get a link like `https://three-worlds.vercel.app` —
   that's the one you share. 💌

> If you ever change the Render URL, update `VITE_SERVER_URL` in Vercel and
> redeploy (Vercel → Deployments → ⋯ → Redeploy).

---

## 3. Play together

- Open the Vercel link, pick **Play as Him**; she opens the same link and
  picks **Play as Her**. You'll spawn in your home cities and can meet up.
- You do NOT need the Google Maps key — the stylized world doesn't use it.

That's it. Two links, two free accounts, and it's live for both of you. 🎆
