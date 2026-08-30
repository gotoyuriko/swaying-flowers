# Meadow 🌸

A WebGL scene built with [Three.js](https://threejs.org/) that renders a dense
wildflower meadow — cosmos, larkspur spikes, orange blooms, and baby's breath —
swaying in the wind under a cloud-streaked sky.

## Run

The page uses ES modules, so it needs to be served over HTTP (opening the file
directly won't work):

```bash
cd swaying-flowers
python3 -m http.server 8000
# or: npx serve .
```

Then open http://localhost:8000

Three.js is loaded from the jsDelivr CDN via an import map — no build step or
`npm install` required (internet access needed at load time).

## Controls

- **Drag** — orbit the camera (auto-rotates gently when idle)
- **Scroll** — zoom in/out
- **♪ sound off** (bottom right) — toggle the sound

## How it works

- **Four procedural species** — each is built once from `ShapeGeometry` petals
  and `TubeGeometry` stems, merged, then instanced:
  - *Cosmos* (300) — 8 wide flat petals, golden center, nodding head
  - *Larkspur* (130) — tall spike of ~45 tiny 4-petal rosettes in a spiral
  - *Orange blooms* (150) — short cosmos variant near the ground
  - *Baby's breath* (120) — thin stems with clouds of tiny white blossoms
  Per species, two `InstancedMesh`es (green body + petals) share the same
  instance matrices; petals get a per-instance tint from a palette via
  `instanceColor`.
- **Wind in the vertex shader** — a shared `onBeforeCompile` injection bends
  vertices sideways proportionally to `pow(y / bendHeight, 1.5)`, driven by
  layered sines plus a slow gust term. Per-instance `aPhase` / `aAmp`
  instanced attributes give every plant its own rhythm; petals get an extra
  high-frequency flutter.
- **Grass** — 8,000 instanced tapered blades using the same wind shader, with
  root-to-tip vertex-color gradient and per-instance HSL tint.
- **Environment** — rolling terrain from a shared height function (plants sit
  on it), sky-dome shader with gradient + slowly drifting FBM cumulus clouds,
  fog, hemisphere + shadow-casting directional light, ACES tone mapping,
  additive-blended drifting pollen.
- **Soundscape** — a soft piano loop plus one birdsong every 14-48s at varied
  pitch and stereo pan. The music loops by crossfade: each copy schedules its
  own successor on the audio clock and fades in over the 4s tail of the one
  before, so there is no seam. Level is normalized to a measured RMS on load,
  so replacing the mp3 needs no retuning. Off by default (browsers block audio
  until a gesture).

## Credits

| File | Source | License |
|---|---|---|
| `ghibli.mp3` | user-supplied ("Studio-Ghibli inspired, soft & whimsical piano") | per its original source |
| `birdsong.mp3` | ["Birdsong single isolated"](https://freesound.org/people/deleted_user_2104797/sounds/164483/) | CC0 |

`ghibli.mp3` has its 14.28s intro removed, cut to the exact point the piano
enters, with a 40ms fade-in. Re-encoded rather than stream-copied: `-c copy`
cuts on a frame boundary and leaves the decoder unprimed, which pops.

## License

Code © 2026 Goto Yuriko. Audio files are credited above and licensed
separately by their respective sources.
