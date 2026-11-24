# OVERPRESSURE — source

Build: `npm install && node build.mjs` → `dist/index.html` + `dist/assets/guns/*.glb` (serve the folder; the page loads the guns by relative path).

- `src/data.js` — every gun (MODELS + WEAPONS), kits (ROLES: primary + sidearm + gadget + armor), factions, rules, skill-check tuning
- `assets/guns/` — optimized GLBs (webp 1024 textures, meshopt). To add a gun: optimize it (no meshopt — the hosted page blocks WebAssembly) with
  `npx gltf-transform optimize in.glb out.glb --texture-compress webp --texture-size 1024 --compress quantize`, drop it in, add a MODELS entry
  (`ry`/`rz` to point the muzzle down -Z, `len` in metres) and a WEAPONS entry.
- `src/maps/*.js` + `src/map.js` — map layouts. `deck(x0, x1, z0, z1, height, railedSides)` makes a raised iron gantry and `stairs(deck, side, at)` a flight up to it (bots path over both); `scatterCover()` fills big empty floors with small cover clusters (set `scatter: 0` on a map to turn it off, or e.g. `0.5` for half as much).
- `src/assets.js` — loads + normalizes guns (sight height measured automatically) and the factory kit
- `assets/factory_kit.glb` — the 29 kit pieces in use (walls, windows, trusses, columns, blocks, gantries); `src/world.js` `dressWithKit()` instances them over the collision boxes in `src/map.js`
- `src/player.js` — first-person viewmodel (hands, brass reflex sight, scope), controls, sabotage input
- `src/entities.js` — agent state, weapon slots, wires the rigged characters to movement
- `src/rig.js` — auto-rig for `assets/guardsman.glb` (SteamRunners) and `assets/automaton.glb` (Automata Allegia): joint positions + skin rules per model in `CHAR_MODELS`, procedural walk/run/sprint/crouch cycles and two-bone arm IK onto the held gun. To swap a character, drop in a new GLB and retune its `joints` / `vertex()` / `part()` entries.
- Tinker / Warden kits: `spawnDrone` / `droneBrain` / `droneZap` (clockwork beetle) and `placeShutter` / `damageShutter` (iron shutters on `DOORS`) in `src/game.js`; beetle driving in `src/player.js` (`driveDrone`); bot use in `src/ai.js` (`useKitGadget`, `gadgetTargets`)
- `src/game.js` — rounds, combat, overpressure skill checks (`updateActions`, `resolveCheck`), venting, gadgets
- `src/ai.js` — bots · `src/world.js` / `src/textures.js` / `src/fx.js` — district, boiler cores, steam, lighting · `src/hud.js` — UI and the pressure gauge
