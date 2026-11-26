# Sky Courier: Kepulauan Run

[![make.fun](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/ical-iann/flight-game-01/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/ical-iann/flight-game-01/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

A complete original flight game for the [make.fun best flight game bounty](https://make.fun/bounty/best-flight-game-20261126-0057): fly **Langit-7**, a little island courier plane, through eight glowing rings over a tropical island group, then bring her home to land on runway 07 before the fuel runs out. Chase camera, a lit instrument panel (airspeed, altimeter, artificial horizon, fuel and throttle), a compass tape and a digital ALT/SPD/HDG readout, keyboard + mouse controls, and synthesised engine and wind sound — all from static files, no network at run time.

## Play it

Serve `game/` with any static server, or run `node serve.ts` and open http://localhost:8080.

- **W / S** — throttle up / down
- **↑ / ↓** — pitch (climb / descend)
- **← / →** — bank (turn)
- **A / D** — rudder
- **Mouse** — steer
- **G** — landing gear (must be down to land), **F** — flaps, **P** — pause, **M** — mute
- **Space / click** — start and restart

Rings pay 250 points and 12 seconds each. A landing on runway 07 pays 1,000 points, 1,500 with a soft, centred flare. Stall below 50 knots, watch the fuel gauge, and keep the gear down.

## How it is built

Pure HTML + JavaScript, no engine and no downloaded library: the 3D view is a small software renderer written for this game (`game/src/math3d.js`, `game/src/render.js`, `game/src/terrain.js`), the flight model lives in `game/src/plane.js`, the course in `game/src/missions.js`, and the cockpit in `game/src/hud.js`. The islands are a seeded heightfield, so the same seed always grows the same terrain. `main.ts` hands the game in: it copies `game/` and `screenshots/` to `/output` and writes `dossier.json` with the kit's `vendor/makefun-game.ts`.

## Screenshots

The three screenshots in `screenshots/` are real renders of this game running in a desktop browser: the title screen over a climb-out, mid-course chasing a ring, and the final approach to runway 07.
