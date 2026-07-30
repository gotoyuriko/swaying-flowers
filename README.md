# Swaying Flowers 🌸

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
