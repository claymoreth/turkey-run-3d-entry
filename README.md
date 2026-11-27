# 🦃 Turkey Run 3D

[![make.fun](https://make.fun/badge/turkey-run-game-01.svg)](https://make.fun/bounty/turkey-run-game-01)
[![Prize $250](https://img.shields.io/badge/prize-%24250-gold)](https://make.fun/bounty/turkey-run-game-01)
[![Top 20](https://img.shields.io/badge/top-20-green)](https://make.fun/bounty/turkey-run-game-01)

3D third-person lane runner built with Three.js r187 (vendored, no network).
You are the turkey. The farmer is right behind you — and dinner is at stake.

Run 1400 m through the farmyard, the barn, and the kitchen to reach the
forest gate. Jump fences and hay bales, slide under beams, dodge rolling
pumpkins, swinging knives, oven firejets, and falling knives. Grab corn
(+10), golden feathers (+1 life), and pie (speed boost + 2 s invulnerable).

## How to play

| Key | Action |
| --- | --- |
| ← / → or A / D | Switch lane |
| Space / ↑ | Jump |
| ↓ / S | Slide |
| P | Pause |
| M | Mute |
| R | Restart |
| Click / tap | Start |

The farmer chases with a real FSM: he closes in when you stumble, lunges
when he gets close (listen for "Kembali kau!"), and falls behind when you
pull away. If he touches you, you lose a life and get knocked forward.
Three lives — then it's dinner time.

## Run locally

```sh
node serve.ts --port 8080
# open http://127.0.0.1:8080/
```

Static screenshots: `?shot=title|farmyard|kitchen|escaped&seed=N`.

## Debug API

`window.__turkeyrun3d.state` is a read-only snapshot (mode, score, distance,
lives, speed, farmer gap/state, turkey lane/height). `window.__turkeyrun3d.autopilot`
exposes `{ enabled, setSeed, step }` for automated verification runs.
