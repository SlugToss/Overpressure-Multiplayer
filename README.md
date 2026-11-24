# OVERPRESSURE — Multiplayer Server

Play OVERPRESSURE with friends on different computers. One person creates a room, everyone else joins with the
4-letter room code, the host presses READY and a 5-second countdown starts the match. Up to 5 v 5; any empty
slot is filled with a Regular-difficulty bot.

The match is simulated in the **host's** browser and this server relays it, so the host should keep the game tab
open until the match ends (it keeps running in a background tab, just don't close it).

## Put it online for free (Render)

1. Make a free account at github.com and create a new **public or private repository** (e.g. `overpressure`).
2. Click **Add file → Upload files** and drag in everything in this folder:
   `server.js`, `package.json`, `render.yaml`, `README.md` and the `public` folder (with `index.html` inside).
   Commit.
3. Make a free account at render.com → **New → Web Service** → connect your GitHub and pick the repository.
4. Settings: Runtime **Node**, Build command `npm install`, Start command `node server.js`, Instance type **Free**.
   (Render may pick these up automatically from `render.yaml`.) Create the service.
5. After a couple of minutes Render gives you an address like `https://overpressure-xxxx.onrender.com`.
   Send that link to your friends.

Free Render services go to sleep after ~15 minutes with nobody connected; the first person to open the link
afterwards waits about a minute while it wakes up.

## Playing

1. Everyone opens the link and presses **MULTIPLAYER** on the title screen.
2. One person presses **CREATE ROOM** and reads out the room code.
3. Everyone else types the code and presses **JOIN**.
4. In the lobby: **SWITCH CREW** to change sides, the host picks the map, then the host presses **READY · START**.
   Press it again during the countdown to cancel.
5. After the match, **BACK TO LOBBY** returns everyone to the room for another round.

If someone drops out mid-match, a bot takes over their soldier. If the host leaves, the match ends and the room
returns to the lobby with a new host.

## Run it on your own PC instead

Install Node.js 18+, then in this folder: `npm install` and `npm start`. It listens on port 8080
(`http://localhost:8080`). Friends on the same Wi-Fi can use `http://<your-local-IP>:8080`; for friends elsewhere
you'd need to forward port 8080 on your router, or use a tunnel such as Cloudflare Tunnel or ngrok.

## Updating the game

The game page is `public/index.html`, built from the game source with `node build.mjs` (it writes
`server/public/index.html`). Replace that file in your repository and Render redeploys automatically.
