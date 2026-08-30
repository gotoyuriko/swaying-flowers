import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------------------
// Config — species mix modeled on a dense wildflower meadow:
// cosmos (wide flat petals), larkspur spikes, orange accents, baby's breath.
// ---------------------------------------------------------------------------
const COSMOS_COUNT = 1000;
const SPIKE_COUNT = 300;
const ORANGE_COUNT = 400;
const GYPSO_COUNT = 300;
const GRASS_COUNT = 8000;
const POLLEN_COUNT = 260;
const FIELD_RADIUS = 15;

// Far field: simplified flowers carpet the land beyond the detailed meadow,
// out to where the fog swallows them — 見渡す限りの花畑.
const FAR_INNER = 14.5;
const FAR_OUTER = 60;
const FAR_COSMOS_COUNT = 10000;
const FAR_SPIKE_COUNT = 3000;

const COSMOS_PALETTE = [
  '#f7a8c9', '#ffffff', '#fff3d6', '#c2337a',
  '#ff8fb3', '#f6d1e2', '#e85f9e', '#fce9b8',
];
const SPIKE_PALETTE = [
  '#7b68d9', '#9a7fe8', '#b18ae0', '#e08bc0',
  '#f0a8d0', '#5f5fc4', '#8f6ad4',
];
const ORANGE_PALETTE = ['#f5a13d', '#f8b64c', '#ef8a2e', '#ffd166'];

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const rand = (min, max) => min + Math.random() * (max - min);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Gentle rolling terrain height, shared by ground mesh and plant placement.
function groundHeight(x, z) {
  return (
    0.22 * Math.sin(x * 0.32) * Math.cos(z * 0.27) +
    0.12 * Math.sin(x * 0.9 + z * 0.6) +
    0.05 * Math.cos(x * 1.7 - z * 1.3)
  );
}

// ---------------------------------------------------------------------------
// Renderer / scene / camera
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const HORIZON_COLOR = new THREE.Color('#dfe9f2');
scene.fog = new THREE.Fog(HORIZON_COLOR, 18, 75);

const camera = new THREE.PerspectiveCamera(
  55, window.innerWidth / window.innerHeight, 0.1, 400,
);
// Low, inside the meadow — flowers fill the frame like the reference.
camera.position.set(0, 2.1, 6.5);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.15, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 1.5;
controls.maxDistance = 22;
controls.maxPolarAngle = 1.56; // keep the camera above the meadow
controls.autoRotate = true;
controls.autoRotateSpeed = 0.3;

// ---------------------------------------------------------------------------
// Lights
// ---------------------------------------------------------------------------
scene.add(new THREE.HemisphereLight('#bfd9ff', '#3d5e35', 1.1));

const sun = new THREE.DirectionalLight('#fff0d0', 1.8);
sun.position.set(8, 12, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -20;
sun.shadow.camera.right = 20;
sun.shadow.camera.top = 20;
sun.shadow.camera.bottom = -20;
sun.shadow.camera.far = 40;
sun.shadow.bias = -0.0005;
scene.add(sun);

// ---------------------------------------------------------------------------
// Wind + sky uniforms, ticked from the main loop
// ---------------------------------------------------------------------------
const timeUniforms = [];

// ---------------------------------------------------------------------------
// Sky dome — gradient + slowly drifting FBM cumulus clouds
// ---------------------------------------------------------------------------
{
  const skyGeo = new THREE.SphereGeometry(180, 24, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      topColor: { value: new THREE.Color('#3f86cf') },
      midColor: { value: new THREE.Color('#8fbde4') },
      bottomColor: { value: HORIZON_COLOR },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPosition;
      void main() {
        vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 topColor;
      uniform vec3 midColor;
      uniform vec3 bottomColor;
      varying vec3 vWorldPosition;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
          f.y);
      }
      float fbm(vec2 p) {
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
        return v;
      }

      void main() {
        vec3 dir = normalize(vWorldPosition);
        float h = dir.y;
        vec3 col = h > 0.15
          ? mix(midColor, topColor, smoothstep(0.15, 0.75, h))
          : mix(bottomColor, midColor, smoothstep(-0.1, 0.15, h));

        // Puffy clouds: FBM on a plane-projected direction, drifting slowly
        if (h > 0.02) {
          vec2 uv = dir.xz / (h + 0.22);
          uv = uv * 0.7 + vec2(uTime * 0.006, uTime * 0.002);
          float n = fbm(uv + vec2(3.7, 1.3));
          float cloud = smoothstep(0.42, 0.64, n) * smoothstep(0.02, 0.12, h);
          vec3 cloudCol = mix(vec3(0.82, 0.84, 0.90), vec3(1.0),
                              smoothstep(0.5, 0.9, n));
          col = mix(col, cloudCol, cloud * 0.92);
        }
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  timeUniforms.push(skyMat.uniforms);
  scene.add(new THREE.Mesh(skyGeo, skyMat));
}

// ---------------------------------------------------------------------------
// Wind: shared vertex-shader injection.
// Bends geometry sideways proportionally to height, phase-shifted per
// instance so every plant moves on its own rhythm.
// ---------------------------------------------------------------------------
function makeSwayMaterial(
  baseMaterial,
  { bendHeight, strength, flutter = 0, translucency = 0.1 },
) {
  baseMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uWind = { value: strength };
    shader.uniforms.uBendHeight = { value: bendHeight };
    shader.uniforms.uFlutter = { value: flutter };
    shader.uniforms.uTranslucency = { value: translucency };
    timeUniforms.push(shader.uniforms);

    // Fake petal translucency: shadowed undersides still glow with the
    // surface color instead of going black.
    shader.fragmentShader =
      'uniform float uTranslucency;\n' +
      shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `
        #include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * uTranslucency;
        `,
      );

    shader.vertexShader =
      /* glsl */ `
      uniform float uTime;
      uniform float uWind;
      uniform float uBendHeight;
      uniform float uFlutter;
      attribute float aPhase;
      attribute float aAmp;
      ` + shader.vertexShader;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      /* glsl */ `
      #include <begin_vertex>
      {
        float bend = pow(clamp(transformed.y / uBendHeight, 0.0, 1.0), 1.5);
        float t = uTime;

        // Slow gusts layered over a steady breeze
        float gust = 0.7 + 0.4 * sin(t * 0.23 + aPhase * 0.37)
                         + 0.25 * sin(t * 0.61 + aPhase);

        vec2 wind = vec2(
          sin(t * 1.35 + aPhase)        * 0.60 +
          sin(t * 2.30 + aPhase * 1.7)  * 0.25,
          cos(t * 1.10 + aPhase * 1.3)  * 0.40 +
          sin(t * 1.90 + aPhase * 0.8)  * 0.20
        );

        transformed.xz += wind * bend * uWind * aAmp * gust;

        // High-frequency shimmer for petal tips
        transformed.y += uFlutter * bend *
          sin(t * 6.0 + aPhase * 3.1 + transformed.x * 8.0) * aAmp;
      }
      `,
    );
  };
  return baseMaterial;
}

// Per-instance phase/amplitude attributes, attached to each instanced geometry.
function addInstanceAttributes(geometry, phases, amps) {
  geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
  geometry.setAttribute('aAmp', new THREE.InstancedBufferAttribute(amps, 1));
}

// ---------------------------------------------------------------------------
// Ground
// ---------------------------------------------------------------------------
{
  const geo = new THREE.PlaneGeometry(180, 180, 128, 128);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const dark = new THREE.Color('#33582c');
  const light = new THREE.Color('#4c7a3e');
  const c = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = groundHeight(x, z);
    pos.setY(i, y);
    // Slightly lighter on the crests, darker in the dips
    c.lerpColors(dark, light, THREE.MathUtils.clamp(y * 1.6 + 0.5, 0, 1));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const ground = new THREE.Mesh(
    geo,
    new THREE.MeshLambertMaterial({ vertexColors: true }),
  );
  ground.receiveShadow = true;
  scene.add(ground);
}

// ---------------------------------------------------------------------------
// Geometry building blocks
// ---------------------------------------------------------------------------
function colorize(geometry, color) {
  const g = geometry.toNonIndexed();
  const count = g.attributes.position.count;
  const arr = new Float32Array(count * 3);
  const c = new THREE.Color(color);
  for (let i = 0; i < count; i++) arr.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

// A single petal in the XY plane pointing +Y, gently cupped toward +Z.
// widen=1 gives a cosmos-like wedge that is broadest near the tip.
function makePetalGeometry(length, width, { cup = 0.35, segments = 5 } = {}) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(width * 0.5, length * 0.25, width, length * 0.7,
    width * 0.55, length * 0.95);
  s.quadraticCurveTo(0, length * 1.03, -width * 0.55, length * 0.95);
  s.bezierCurveTo(-width, length * 0.7, -width * 0.5, length * 0.25, 0, 0);

  const geo = new THREE.ShapeGeometry(s, segments);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / length;
    pos.setZ(i, t * t * length * cup); // curl the tip upward
  }
  geo.computeVertexNormals();
  return geo;
}

// Ring of petals laid flat around the origin, tips tilted up by `tilt`.
function makePetalRing(count, length, width, tilt, offset = 0, opts) {
  const petals = [];
  for (let i = 0; i < count; i++) {
    const petal = makePetalGeometry(length, width, opts);
    petal.rotateX(-Math.PI / 2 + tilt);
    petal.rotateY((i / count) * Math.PI * 2 + offset);
    petals.push(petal);
  }
  return BufferGeometryUtils.mergeGeometries(petals);
}

function makeStem(height, radius, lean = 0.05) {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(lean * 0.6, height * 0.4, -lean * 0.4),
    new THREE.Vector3(-lean * 0.4, height * 0.75, lean * 0.6),
    new THREE.Vector3(0, height, lean),
  ]);
  return new THREE.TubeGeometry(curve, 10, radius, 6);
}

// ---------------------------------------------------------------------------
// Species builders — each returns { body, petals } geometries.
// body carries fixed vertex colors; petals are tinted per instance.
// ---------------------------------------------------------------------------

// Cosmos: tall thin stem, 8 wide flat petals, small golden center.
// Head nods slightly off vertical so blooms face outward, as in the field.
function buildCosmos({ stemH = 1.2, petalLen = 0.22, headTilt = 0.35 } = {}) {
  const stem = colorize(makeStem(stemH, 0.011, 0.06), '#3a7d33');

  const leaves = [];
  for (const [h, ry] of [[0.3, 0.4], [0.55, 2.6]]) {
    const leaf = colorize(makePetalGeometry(0.18, 0.03), '#4d9440');
    leaf.rotateX(-Math.PI / 2 + 0.9);
    leaf.rotateY(ry);
    leaf.translate(0, h, 0);
    leaves.push(leaf);
  }

  const center = colorize(new THREE.SphereGeometry(0.035, 10, 8), '#e8a832');
  center.scale(1, 0.5, 1);
  center.rotateX(headTilt);
  center.translate(0, stemH + 0.02, 0.02);

  const body = BufferGeometryUtils.mergeGeometries([stem, ...leaves, center]);

  const ring = makePetalRing(8, petalLen, petalLen * 0.34, 0.16, 0,
    { cup: 0.2, segments: 8 });
  ring.rotateX(headTilt);
  ring.translate(0, stemH + 0.02, 0.02);

  return { body, petals: ring.toNonIndexed() };
}

// Larkspur / delphinium: tall spike packed with small 4-petal blossoms.
function buildSpike({ stemH = 1.9 } = {}) {
  const stem = colorize(makeStem(stemH, 0.01, 0.04), '#3f7a35');

  const leaves = [];
  for (const [h, ry] of [[0.2, 0.9], [0.38, 3.4], [0.55, 5.1]]) {
    const leaf = colorize(makePetalGeometry(0.22, 0.045), '#457f38');
    leaf.rotateX(-Math.PI / 2 + 0.8);
    leaf.rotateY(ry);
    leaf.translate(0, h, 0);
    leaves.push(leaf);
  }
  const body = BufferGeometryUtils.mergeGeometries([stem, ...leaves]);

  // One tiny 4-petal rosette, facing +Y
  const rosette = makePetalRing(4, 0.08, 0.04, 0.55, 0, { cup: 0.5, segments: 3 });

  // Stack rosettes in a dense spiral column over the top half of the stem
  const blossoms = [];
  const ROWS = 18;
  for (let k = 0; k < ROWS; k++) {
    const t = k / (ROWS - 1);
    const y = stemH * (0.45 + 0.55 * t);
    const shrink = 1 - t * 0.5; // buds get smaller toward the tip
    for (let j = 0; j < 4; j++) {
      const a = k * 2.4 + (j / 4) * Math.PI * 2;
      const b = rosette.clone();
      b.scale(shrink, shrink, shrink);
      b.rotateX(1.15);   // face outward
      b.rotateY(a);
      b.translate(Math.sin(a) * 0.045, y, Math.cos(a) * 0.045);
      blossoms.push(b);
    }
  }
  return {
    body,
    petals: BufferGeometryUtils.mergeGeometries(blossoms).toNonIndexed(),
  };
}

// Two crossed quads — the cheapest stem that reads from every angle.
function crossQuads(height, width) {
  const a = new THREE.PlaneGeometry(width, height);
  a.translate(0, height / 2, 0);
  const b = a.clone();
  b.rotateY(Math.PI / 2);
  return BufferGeometryUtils.mergeGeometries([a, b]);
}

// Far-field cosmos: flat petal ring on a crossed-quad stem, ~70 triangles.
function buildFarCosmos() {
  const stem = colorize(crossQuads(1.1, 0.035), '#3a7d33');
  const center = colorize(new THREE.CircleGeometry(0.045, 6), '#e8a832');
  center.rotateX(-Math.PI / 2);
  center.translate(0, 1.115, 0);
  const body = BufferGeometryUtils.mergeGeometries([stem, center]);

  const ring = makePetalRing(8, 0.2, 0.07, 0.16, 0, { cup: 0.2, segments: 3 });
  ring.translate(0, 1.1, 0);
  return { body, petals: ring.toNonIndexed() };
}

// Far-field larkspur: tinted tapered column standing in for the blossom spike.
function buildFarSpike() {
  const body = colorize(crossQuads(1.05, 0.04), '#3f7a35');
  const column = new THREE.CylinderGeometry(0.035, 0.07, 0.95, 5);
  column.translate(0, 1.45, 0);
  return { body, petals: column.toNonIndexed() };
}

// Baby's breath: thin stem, loose cloud of tiny white blossoms. Body only.
function buildGypsophila({ stemH = 1.0 } = {}) {
  const parts = [colorize(makeStem(stemH, 0.007, 0.08), '#5a8a48')];
  for (let i = 0; i < 9; i++) {
    const blossom = colorize(new THREE.SphereGeometry(0.022, 6, 5), '#f8f6ee');
    const a = rand(0, Math.PI * 2);
    const r = rand(0.02, 0.16);
    blossom.translate(
      Math.cos(a) * r,
      stemH + rand(-0.14, 0.1),
      Math.sin(a) * r,
    );
    parts.push(blossom);
  }
  return { body: BufferGeometryUtils.mergeGeometries(parts), petals: null };
}

// ---------------------------------------------------------------------------
// Species planting: instanced body + petals sharing transforms
// ---------------------------------------------------------------------------
function scatterTransforms(count, {
  clusterCount = 12,
  clusterSpread = 1.6,
  clusterRatio = 0.45, // rest scatters uniformly so the field has no bare patches
  minRadius = 1.2,     // keep the look-at center clear
  avoidRing = null,    // e.g. { radius: 6.5, halfWidth: 1.4 } for the camera orbit
  annulus = null,      // [inner, outer]: uniform ring scatter for the far field
} = {}) {
  if (annulus) {
    const [inner, outer] = annulus;
    const transforms = [];
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2);
      const r = Math.sqrt(rand(inner * inner, outer * outer));
      transforms.push({ x: Math.cos(a) * r, z: Math.sin(a) * r });
    }
    return transforms;
  }
  const clusters = [];
  for (let i = 0; i < clusterCount; i++) {
    const a = rand(0, Math.PI * 2);
    const r = rand(minRadius + 0.5, FIELD_RADIUS - 2);
    clusters.push([Math.cos(a) * r, Math.sin(a) * r]);
  }

  const allowed = (x, z) => {
    const r = Math.hypot(x, z);
    if (r < minRadius) return false;
    if (avoidRing && Math.abs(r - avoidRing.radius) < avoidRing.halfWidth) {
      return false;
    }
    return true;
  };

  const transforms = [];
  for (let i = 0; i < count; i++) {
    let x = 0, z = 0;
    for (let tries = 0; tries < 20; tries++) {
      if (Math.random() < clusterRatio) {
        const [cx, cz] = pick(clusters);
        x = cx + rand(-clusterSpread, clusterSpread);
        z = cz + rand(-clusterSpread, clusterSpread);
      } else {
        const a = rand(0, Math.PI * 2);
        const r = Math.sqrt(Math.random()) * FIELD_RADIUS;
        x = Math.cos(a) * r;
        z = Math.sin(a) * r;
      }
      const len = Math.hypot(x, z);
      if (len > FIELD_RADIUS) { x *= FIELD_RADIUS / len; z *= FIELD_RADIUS / len; }
      if (allowed(x, z)) break;
    }
    transforms.push({ x, z });
  }
  return transforms;
}

function plantSpecies({
  geometries, count, palette,
  bendHeight, strength, flutter = 0,
  scaleRange = [0.75, 1.25], heightRange = [0.85, 1.25],
  scatter = {},
  castShadow = true,
}) {
  const { body, petals } = geometries;
  const transforms = scatterTransforms(count, scatter);

  const phases = new Float32Array(count);
  const amps = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    phases[i] = rand(0, Math.PI * 2);
    amps[i] = rand(0.7, 1.3);
  }

  const meshes = [];
  addInstanceAttributes(body, phases, amps);
  const bodyMesh = new THREE.InstancedMesh(
    body,
    makeSwayMaterial(
      new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
      { bendHeight, strength },
    ),
    count,
  );
  bodyMesh.castShadow = castShadow;
  meshes.push(bodyMesh);

  let petalMesh = null;
  if (petals) {
    addInstanceAttributes(petals, phases, amps);
    petalMesh = new THREE.InstancedMesh(
      petals,
      makeSwayMaterial(
        new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }),
        { bendHeight, strength, flutter, translucency: 0.28 },
      ),
      count,
    );
    petalMesh.castShadow = castShadow;
    meshes.push(petalMesh);
  }

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);

  transforms.forEach(({ x, z }, i) => {
    p.set(x, groundHeight(x, z) - 0.02, z);
    q.setFromAxisAngle(yAxis, rand(0, Math.PI * 2));
    const sc = rand(...scaleRange);
    s.set(sc, sc * rand(...heightRange), sc);
    m.compose(p, q, s);
    bodyMesh.setMatrixAt(i, m);
    if (petalMesh) {
      petalMesh.setMatrixAt(i, m);
      petalMesh.setColorAt(i, new THREE.Color(pick(palette)));
    }
  });
  if (petalMesh) petalMesh.instanceColor.needsUpdate = true;

  scene.add(...meshes);
}

// Cosmos — the stars of the field
plantSpecies({
  geometries: buildCosmos(),
  count: COSMOS_COUNT,
  palette: COSMOS_PALETTE,
  bendHeight: 1.4,
  strength: 0.1,
  flutter: 0.012,
});

// Larkspur spikes — tall vertical accents
plantSpecies({
  geometries: buildSpike(),
  count: SPIKE_COUNT,
  palette: SPIKE_PALETTE,
  bendHeight: 1.9,
  strength: 0.07,
  scaleRange: [0.8, 1.2],
  heightRange: [0.9, 1.35],
  // Tall spikes stay off the camera's auto-rotate orbit so they never
  // fill the whole frame.
  scatter: {
    clusterCount: 8,
    clusterSpread: 1.2,
    avoidRing: { radius: 6.5, halfWidth: 1.5 },
  },
});

// Short orange blooms near the ground
plantSpecies({
  geometries: buildCosmos({ stemH: 0.6, petalLen: 0.14, headTilt: 0.25 }),
  count: ORANGE_COUNT,
  palette: ORANGE_PALETTE,
  bendHeight: 0.65,
  strength: 0.07,
  flutter: 0.008,
  scaleRange: [0.7, 1.1],
  scatter: { clusterCount: 10, clusterSpread: 1.0 },
});

// Baby's breath filler
plantSpecies({
  geometries: buildGypsophila(),
  count: GYPSO_COUNT,
  palette: [],
  bendHeight: 1.0,
  strength: 0.09,
  scatter: { clusterCount: 9, clusterSpread: 1.4 },
});

// --- Far field: the flower carpet continues to the horizon ---------------
// A few splashes of orange mixed into the distant cosmos palette.
const FAR_COSMOS_PALETTE = [
  ...COSMOS_PALETTE, ...COSMOS_PALETTE, ...ORANGE_PALETTE,
];

plantSpecies({
  geometries: buildFarCosmos(),
  count: FAR_COSMOS_COUNT,
  palette: FAR_COSMOS_PALETTE,
  bendHeight: 1.2,
  strength: 0.1,
  scaleRange: [0.85, 1.35],
  scatter: { annulus: [FAR_INNER, FAR_OUTER] },
  castShadow: false,
});

plantSpecies({
  geometries: buildFarSpike(),
  count: FAR_SPIKE_COUNT,
  palette: SPIKE_PALETTE,
  bendHeight: 1.9,
  strength: 0.07,
  scaleRange: [0.8, 1.3],
  heightRange: [0.9, 1.35],
  scatter: { annulus: [FAR_INNER, FAR_OUTER] },
  castShadow: false,
});

// ---------------------------------------------------------------------------
// Grass: thousands of instanced tapered blades with the same wind shader
// ---------------------------------------------------------------------------
{
  const BLADE_H = 0.5;
  const geo = new THREE.PlaneGeometry(0.05, BLADE_H, 1, 3);
  geo.translate(0, BLADE_H / 2, 0);

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const root = new THREE.Color('#2e5528');
  const tip = new THREE.Color('#82b04f');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / BLADE_H;
    pos.setX(i, pos.getX(i) * (1 - t * 0.9)); // taper toward the tip
    c.lerpColors(root, tip, t);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const phases = new Float32Array(GRASS_COUNT);
  const amps = new Float32Array(GRASS_COUNT);
  for (let i = 0; i < GRASS_COUNT; i++) {
    phases[i] = rand(0, Math.PI * 2);
    amps[i] = rand(0.5, 1.5);
  }
  addInstanceAttributes(geo, phases, amps);

  const mat = makeSwayMaterial(
    new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    { bendHeight: BLADE_H, strength: 0.06 },
  );

  const grass = new THREE.InstancedMesh(geo, mat, GRASS_COUNT);
  grass.receiveShadow = true;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const tint = new THREE.Color();

  for (let i = 0; i < GRASS_COUNT; i++) {
    const a = rand(0, Math.PI * 2);
    const r = Math.sqrt(Math.random()) * (FIELD_RADIUS + 3);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    p.set(x, groundHeight(x, z) - 0.02, z);
    q.setFromAxisAngle(yAxis, rand(0, Math.PI * 2));
    s.set(rand(0.7, 1.4), rand(0.7, 1.6), 1);
    m.compose(p, q, s);
    grass.setMatrixAt(i, m);
    tint.setHSL(0.26 + rand(-0.03, 0.03), rand(0.45, 0.65), rand(0.45, 0.6));
    grass.setColorAt(i, tint);
  }
  grass.instanceColor.needsUpdate = true;
  scene.add(grass);
}

// ---------------------------------------------------------------------------
// Butterflies: one instanced mesh — wings flap in the vertex shader,
// lazy circling flight paths are updated on the CPU each frame.
// ---------------------------------------------------------------------------
const BUTTERFLY_COUNT = 28;
const BUTTERFLY_PALETTE = [
  '#ffa53d', '#fff3cf', '#ffd94a', '#9ecbff', '#ff8ab5', '#d8b4ff',
];

const butterflies = (() => {
  // One wing: forewing + hindwing lobes in a single outline (XY plane,
  // +x outward from the body, +y toward the head).
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0.015, 0.02);
  wingShape.bezierCurveTo(0.09, 0.10, 0.20, 0.08, 0.19, 0.0);
  wingShape.bezierCurveTo(0.185, -0.05, 0.10, -0.04, 0.06, -0.03);
  wingShape.bezierCurveTo(0.10, -0.09, 0.05, -0.14, 0.015, -0.07);
  wingShape.lineTo(0.015, 0.02);

  // Wings are white so instanceColor tints them; the body stays dark
  // (dark vertex color × any tint ≈ dark).
  const rightWing = colorize(new THREE.ShapeGeometry(wingShape, 6), '#ffffff');
  rightWing.rotateX(Math.PI / 2); // lie flat, head toward +z
  const leftWing = rightWing.clone();
  leftWing.scale(-1, 1, 1);

  const body = colorize(new THREE.CylinderGeometry(0.01, 0.014, 0.14, 5), '#3a2a20');
  body.rotateX(Math.PI / 2); // lie along the flight direction

  const geo = BufferGeometryUtils.mergeGeometries([rightWing, leftWing, body]);

  const phases = new Float32Array(BUTTERFLY_COUNT);
  const amps = new Float32Array(BUTTERFLY_COUNT);
  for (let i = 0; i < BUTTERFLY_COUNT; i++) {
    phases[i] = rand(0, Math.PI * 2);
    amps[i] = rand(0, 1);
  }
  addInstanceAttributes(geo, phases, amps);

  const mat = new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    timeUniforms.push(shader.uniforms);
    shader.vertexShader =
      'uniform float uTime;\nattribute float aPhase;\nattribute float aAmp;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        /* glsl */ `
        #include <begin_vertex>
        {
          // Hinge both wings up around the body axis
          float flap = sin(uTime * (7.0 + aAmp * 3.0) + aPhase) * 1.0;
          transformed.y += abs(transformed.x) * sin(flap);
          transformed.x *= cos(flap);
        }
        `,
      );
    // Keep wing undersides bright, like sunlit membrane
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      /* glsl */ `
      #include <emissivemap_fragment>
      totalEmissiveRadiance += diffuseColor.rgb * 0.3;
      `,
    );
  };

  const mesh = new THREE.InstancedMesh(geo, mat, BUTTERFLY_COUNT);
  mesh.castShadow = true;
  scene.add(mesh);

  const paths = [];
  for (let i = 0; i < BUTTERFLY_COUNT; i++) {
    const a = rand(0, Math.PI * 2);
    const r = Math.sqrt(Math.random()) * 11;
    paths.push({
      cx: Math.cos(a) * r,
      cz: Math.sin(a) * r,
      R: rand(1.5, 4),                              // circling radius
      speed: rand(0.15, 0.35) * (Math.random() < 0.5 ? -1 : 1),
      h: rand(1.5, 2.5),
      phase: rand(0, Math.PI * 2),
      scale: rand(0.7, 1.2),
    });
    mesh.setColorAt(i, new THREE.Color(pick(BUTTERFLY_PALETTE)));
  }
  mesh.instanceColor.needsUpdate = true;

  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();

  return {
    update(t) {
      for (let i = 0; i < BUTTERFLY_COUNT; i++) {
        const b = paths[i];
        const ang = t * b.speed + b.phase;
        p.set(
          b.cx + Math.cos(ang) * b.R,
          b.h + 0.3 * Math.sin(t * 1.2 + b.phase * 2)
              + 0.07 * Math.sin(t * 4.1 + b.phase),
          b.cz + Math.sin(ang) * b.R,
        );
        // Face along the flight direction (tangent of the circle)
        const vx = -Math.sin(ang) * b.speed;
        const vz = Math.cos(ang) * b.speed;
        e.set(0, Math.atan2(vx, vz), 0);
        q.setFromEuler(e);
        s.setScalar(b.scale);
        m.compose(p, q, s);
        mesh.setMatrixAt(i, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
})();

// ---------------------------------------------------------------------------
// Cats: three low-poly companions in the central clearing.
// Built from primitive parts so head and tail can be animated per cat.
// ---------------------------------------------------------------------------
const cats = (() => {
  const mat = (color) => new THREE.MeshLambertMaterial({ color });

  const part = (parent, geometry, material, x, y, z, sx = 1, sy = 1, sz = 1) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };

  const sphere = new THREE.SphereGeometry(1, 14, 12);

  // Shared head: ears, muzzle, eyes, nose — returned as a pivot group.
  function makeHead({ fur, belly, eye }) {
    const pivot = new THREE.Group();
    const furMat = mat(fur);
    const bellyMat = mat(belly);

    part(pivot, sphere, furMat, 0, 0, 0, 0.1, 0.09, 0.095);          // skull
    part(pivot, sphere, bellyMat, 0, -0.03, 0.075, 0.05, 0.038, 0.04); // muzzle
    part(pivot, sphere, mat('#e88a9b'), 0, -0.012, 0.108, 0.013, 0.01, 0.008); // nose
    for (const s of [-1, 1]) {
      part(pivot, sphere, mat(eye), s * 0.042, 0.015, 0.078,
        0.016, 0.02, 0.008);                                          // eyes
      const ear = part(pivot, new THREE.ConeGeometry(0.035, 0.065, 4),
        furMat, s * 0.06, 0.088, -0.005);
      ear.rotation.z = -s * 0.35;
      part(pivot, new THREE.ConeGeometry(0.018, 0.035, 4), mat('#e8a0ae'),
        s * 0.058, 0.082, 0.008).rotation.z = -s * 0.35;              // inner ear
    }
    return pivot;
  }

  // Tail: chain of shrinking spheres along an arc, hung off a pivot.
  function makeTail(furMat, { up = true } = {}) {
    const pivot = new THREE.Group();
    const SEGS = 7;
    for (let i = 0; i < SEGS; i++) {
      const t = i / (SEGS - 1);
      const r = 0.03 * (1 - t * 0.45);
      const x = up ? 0 : t * 0.16;
      const y = up ? Math.sin(t * 1.9) * 0.22 : 0.01;
      const z = up ? -t * 0.14 : -Math.sin(t * 2.2) * 0.16;
      part(pivot, sphere, furMat, x, y, z, r, r, r);
    }
    return pivot;
  }

  function makeCat({ fur, belly, eye, pose }) {
    const group = new THREE.Group();
    const furMat = mat(fur);
    const bellyMat = mat(belly);

    let headPivot, tailPivot, torso;

    if (pose === 'sit') {
      part(group, sphere, furMat, 0, 0.14, -0.02, 0.17, 0.14, 0.16);  // haunches
      torso = part(group, sphere, furMat, 0, 0.26, 0.04, 0.13, 0.17, 0.12);
      part(group, sphere, bellyMat, 0, 0.23, 0.09, 0.08, 0.12, 0.06); // chest patch
      for (const s of [-1, 1]) {
        part(group, new THREE.CylinderGeometry(0.028, 0.024, 0.22, 8),
          furMat, s * 0.05, 0.11, 0.12);
        part(group, sphere, bellyMat, s * 0.05, 0.02, 0.14,
          0.035, 0.025, 0.045);                                       // white paws
      }
      headPivot = makeHead({ fur, belly, eye });
      headPivot.position.set(0, 0.43, 0.06);
      tailPivot = makeTail(furMat, { up: true });
      tailPivot.position.set(0.1, 0.08, -0.14);
    } else { // 'loaf'
      torso = part(group, sphere, furMat, 0, 0.11, 0, 0.17, 0.115, 0.24);
      for (const s of [-1, 1]) {
        part(group, sphere, bellyMat, s * 0.055, 0.035, 0.22,
          0.035, 0.028, 0.05);                                        // tucked paws
      }
      headPivot = makeHead({ fur, belly, eye });
      headPivot.position.set(0, 0.24, 0.18);
      tailPivot = makeTail(furMat, { up: false });
      tailPivot.position.set(0.14, 0.05, -0.16);
    }
    group.add(headPivot, tailPivot);
    return { group, headPivot, tailPivot, torso };
  }

  const SPECS = [
    { // orange tabby, white chest — sitting
      fur: '#b06a35', belly: '#f6efe2', eye: '#7a9a3d', pose: 'sit',
      pos: [1.6, 1.2], rotY: -2.4, scale: 1.5,
    },
    { // tuxedo — loafing
      fur: '#2b2b30', belly: '#f4f4f2', eye: '#d8c94a', pose: 'loaf',
      pos: [-1.5, 0.9], rotY: 2.0, scale: 1.5,
    },
    { // grey and white — sitting
      fur: '#9a9aa2', belly: '#f4f2ee', eye: '#5f8a4a', pose: 'sit',
      pos: [0.2, -1.9], rotY: 0.35, scale: 1.4,
    },
  ];

  const instances = SPECS.map((spec, i) => {
    const cat = makeCat(spec);
    const [x, z] = spec.pos;
    cat.group.position.set(x, groundHeight(x, z) - 0.01, z);
    cat.group.rotation.y = spec.rotY;
    cat.group.scale.setScalar(spec.scale);
    scene.add(cat.group);
    return { ...cat, phase: i * 2.1 };
  });

  return {
    update(t) {
      for (const cat of instances) {
        // Slow curious head turns with a small tilt
        cat.headPivot.rotation.y = Math.sin(t * 0.35 + cat.phase) * 0.45;
        cat.headPivot.rotation.z = Math.sin(t * 0.22 + cat.phase * 1.7) * 0.08;
        // Tail sway
        cat.tailPivot.rotation.y = Math.sin(t * 0.9 + cat.phase) * 0.3;
        cat.tailPivot.rotation.x = Math.sin(t * 0.6 + cat.phase * 1.3) * 0.12;
        // Breathing
        const breathe = 1 + Math.sin(t * 1.8 + cat.phase) * 0.015;
        cat.torso.scale.y = cat.torso.userData.baseY ??= cat.torso.scale.y;
        cat.torso.scale.y = cat.torso.userData.baseY * breathe;
      }
    },
  };
})();

// ---------------------------------------------------------------------------
// Drifting pollen / dust motes
// ---------------------------------------------------------------------------
const pollen = (() => {
  const positions = new Float32Array(POLLEN_COUNT * 3);
  const base = [];
  for (let i = 0; i < POLLEN_COUNT; i++) {
    const a = rand(0, Math.PI * 2);
    const r = Math.sqrt(Math.random()) * FIELD_RADIUS;
    base.push({
      x: Math.cos(a) * r,
      y: rand(0.4, 2.8),
      z: Math.sin(a) * r,
      phase: rand(0, Math.PI * 2),
      speed: rand(0.3, 0.9),
    });
  }
  // Soft round sprite so motes don't render as squares
  const spriteCanvas = document.createElement('canvas');
  spriteCanvas.width = spriteCanvas.height = 64;
  const ctx = spriteCanvas.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: '#fff3c4',
    size: 0.06,
    map: new THREE.CanvasTexture(spriteCanvas),
    transparent: true,
    opacity: 0.7,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  scene.add(points);

  return {
    update(t) {
      for (let i = 0; i < POLLEN_COUNT; i++) {
        const b = base[i];
        positions[i * 3] = b.x + Math.sin(t * b.speed + b.phase) * 0.6;
        positions[i * 3 + 1] = b.y + Math.sin(t * b.speed * 0.7 + b.phase * 2) * 0.35;
        positions[i * 3 + 2] = b.z + Math.cos(t * b.speed * 0.8 + b.phase) * 0.6;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
})();

// ---------------------------------------------------------------------------
// Soundscape — a soft piano loop with one bird over the top. Continuous
// ambience beds (recorded wind, meadow, white and brown noise) were tried and
// abandoned: under a near-still scene a broadband wash reads as noise, because
// there is no motion for the ear to attribute it to. Music doesn't, since the
// ear attends to it rather than filtering it. Starts muted: browsers block
// audio until a gesture, and a page shouldn't make noise uninvited.
// ---------------------------------------------------------------------------
const soundscape = (() => {
  const MUSIC = './assets/audio/ghibli.mp3';
  const BIRD = './assets/audio/birdsong.mp3';
  const XFADE = 4; // seconds of overlap at the loop point

  const btn = document.getElementById('sound-toggle');
  let ctx, master, musicNorm;
  let birdBuffer = null;
  let birdOffset = 0;
  let nextBird = 0;
  let on = false;

  // Brings the track to a target RMS, so replacing the mp3 needs no retuning.
  // Sampled, not summed — scanning millions of floats for a level is wasted
  // work.
  function rmsGain(buf, target) {
    const d = buf.getChannelData(0);
    const step = Math.max(1, Math.floor(d.length / 200000));
    let sum = 0;
    let n = 0;
    for (let i = 0; i < d.length; i += step) {
      sum += d[i] * d[i];
      n++;
    }
    const rms = Math.sqrt(sum / n);
    return rms > 1e-6 ? THREE.MathUtils.clamp(target / rms, 0.02, 20) : 1;
  }

  function load(url) {
    return fetch(url)
      .then((r) => r.arrayBuffer())
      .then((b) => ctx.decodeAudioData(b));
  }

  // One copy fades in across the tail of the one before, so the join is a
  // crossfade rather than a cut. Each copy schedules its own successor: the
  // audio clock is sample-accurate, rAF is not and stops in a hidden tab.
  function scheduleCopy(buf, when) {
    const dur = buf.duration;
    const body = Math.max(dur - XFADE, XFADE); // gap between successive starts
    const s = ctx.createBufferSource();
    const g = ctx.createGain();
    s.buffer = buf;
    s.connect(g).connect(musicNorm);
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(1, when + XFADE);
    g.gain.setValueAtTime(1, when + body);
    g.gain.linearRampToValueAtTime(0, when + dur);
    s.start(when);
    s.stop(when + dur + 0.1);

    // Hand off early — setTimeout is throttled to ~1s in a background tab, so
    // the lead has to be generous or the loop drops out.
    const lead = Math.min(5, body / 2);
    setTimeout(
      () => scheduleCopy(buf, when + body),
      Math.max(0, (when + body - lead - ctx.currentTime) * 1000),
    );
  }

  function build() {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    musicNorm = ctx.createGain();
    musicNorm.gain.value = 0;
    musicNorm.connect(master);

    load(MUSIC)
      .then((buf) => {
        musicNorm.gain.value = rmsGain(buf, 0.12); // background, not foreground
        scheduleCopy(buf, ctx.currentTime + 0.05);
      })
      .catch(() => {}); // silence is a valid soundscape

    load(BIRD)
      .then((buf) => {
        birdBuffer = buf;
        // The recording is one chirp surrounded by silence — find the onset so
        // the timer fires a bird rather than a gap.
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) {
          if (Math.abs(d[i]) > 0.05) {
            birdOffset = Math.max(0, i / buf.sampleRate - 0.05);
            break;
          }
        }
      })
      .catch(() => {});
  }

  // Same recording every time, so vary pitch and position — one bird moving
  // around the field rather than a loop.
  function chirp() {
    if (!birdBuffer) return;
    const s = ctx.createBufferSource();
    s.buffer = birdBuffer;
    s.playbackRate.value = 0.88 + Math.random() * 0.3;
    const g = ctx.createGain();
    g.gain.value = 0.22 + Math.random() * 0.2;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;
    s.connect(g).connect(pan).connect(master);
    s.start(0, birdOffset);
  }

  btn.addEventListener('click', () => {
    if (!ctx) build();
    ctx.resume();
    on = !on;
    master.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.8);
    btn.setAttribute('aria-pressed', String(on));
    btn.textContent = on ? '♪ sound on' : '♪ sound off';
  });

  return {
    update(t) {
      if (!on) return;
      // 間 — one bird, then nothing; sparse enough to sit under the music.
      if (t > nextBird) {
        if (nextBird > 0) chirp();
        nextBird = t + 14 + Math.random() * 34;
      }
    },
  };
})();

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();

renderer.setAnimationLoop(() => {
  const t = clock.getElapsedTime();
  for (const u of timeUniforms) u.uTime.value = t;
  butterflies.update(t);
  cats.update(t);
  pollen.update(t);
  soundscape.update(t);
  controls.update();
  renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
