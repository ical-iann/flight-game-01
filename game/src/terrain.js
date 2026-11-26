// Sky Courier — the island group: a seeded heightfield of three islands in a
// lagoon, a flattened strip for runway 07, and the painter that draws it.
// Nothing here is loaded from a file: the islands are pure arithmetic, so the
// same seed always grows the same terrain.
import { WORLD_SEED, TERRAIN, RUNWAY } from './config.js';
import { clamp, lerp } from './math3d.js';

// --- Seeded value noise -----------------------------------------------------
// A hash of integer lattice points, smoothed into rolling hills at 3 octaves.
function hash2(ix, iz, seed) {
  let h = (ix * 374761393 + iz * 668265263 + seed * 974634211) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967295;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

function valueNoise(x, z, seed) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = smooth(x - ix);
  const fz = smooth(z - iz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fz);
}

function fbm(x, z, seed) {
  let total = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let octave = 0; octave < 3; octave += 1) {
    total += valueNoise(x * freq, z * freq, seed + octave * 101) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return total / norm; // 0..1
}

// --- Islands ----------------------------------------------------------------
// Each island is a smooth dome: 1 at its centre, 0 at its shore.
const ISLANDS = [
  { x: 0, z: -560, r: 620, h: 92, name: 'Pulau Besar' }, // runway island
  { x: 760, z: 240, r: 430, h: 74, name: 'Pulau Karang' },
  { x: -820, z: 420, r: 380, h: 62, name: 'Pulau Hijau' },
  { x: 420, z: -1150, r: 300, h: 50, name: 'Pulau Utara' },
];

function islandProfile(x, z) {
  let height = 0;
  for (const island of ISLANDS) {
    const dx = (x - island.x) / island.r;
    const dz = (z - island.z) / island.r;
    const d2 = dx * dx + dz * dz;
    if (d2 >= 1) continue;
    const dome = Math.pow(1 - d2, 1.6);
    const hills = 0.55 + 0.45 * fbm(x / 260, z / 260, WORLD_SEED);
    height = Math.max(height, dome * island.h * hills);
  }
  return height;
}

// The runway sits on flattened ground: the strip itself is dead level and
// the heightfield feathers back to the hills outside it.
function runwayBlend(x, z) {
  const heading = (RUNWAY.headingDeg * Math.PI) / 180;
  const dx = x - RUNWAY.x;
  const dz = z - RUNWAY.z;
  // Rotate into runway space: u along the strip, v across it.
  const u = dx * Math.sin(heading) - dz * Math.cos(heading);
  const v = dx * Math.cos(heading) + dz * Math.sin(heading);
  const halfL = RUNWAY.length / 2;
  const halfW = RUNWAY.width / 2;
  if (Math.abs(u) <= halfL && Math.abs(v) <= halfW) return 1;
  const t = Math.max((Math.abs(u) - halfL) / 60, (Math.abs(v) - halfW) / 55);
  if (t >= 1) return 0;
  return 1 - smooth(clamp(t, 0, 1));
}

const RUNWAY_HEIGHT = 6;

/** Ground height in metres at world (x, z). Below water level in the lagoon. */
export function groundHeight(x, z) {
  const raw = islandProfile(x, z) - 4; // -4 sinks the shores into the sea
  const blend = runwayBlend(x, z);
  if (blend <= 0) return raw;
  return lerp(raw, RUNWAY_HEIGHT, blend);
}

export function isWater(x, z) {
  return groundHeight(x, z) < TERRAIN.waterLevel;
}

/** True when (x, z) is on the runway strip itself. */
export function onRunway(x, z) {
  const heading = (RUNWAY.headingDeg * Math.PI) / 180;
  const dx = x - RUNWAY.x;
  const dz = z - RUNWAY.z;
  const u = dx * Math.sin(heading) - dz * Math.cos(heading);
  const v = dx * Math.cos(heading) + dz * Math.sin(heading);
  return Math.abs(u) <= RUNWAY.length / 2 && Math.abs(v) <= RUNWAY.width / 2;
}

/** Distance across the strip from its centreline, in metres. */
export function runwayOffset(x, z) {
  const heading = (RUNWAY.headingDeg * Math.PI) / 180;
  const dx = x - RUNWAY.x;
  const dz = z - RUNWAY.z;
  return dx * Math.cos(heading) + dz * Math.sin(heading);
}

// --- Terrain colours ---------------------------------------------------------
function shadeFor(height, slope, x, z) {
  const wobble = (fbm(x / 90, z / 90, WORLD_SEED + 7) - 0.5) * 18;
  if (height < TERRAIN.sandLine) return [216 + wobble, 196 + wobble * 0.7, 122];
  if (height > TERRAIN.snowLine) return [238, 240, 244];
  if (height > TERRAIN.rockLine || slope > 0.8) return [122 + wobble, 118 + wobble, 112];
  // Grass, darker in the forested patches.
  const forest = fbm(x / 140, z / 140, WORLD_SEED + 21);
  if (forest > 0.62) return [52 + wobble * 0.5, 104 + wobble * 0.5, 52];
  return [96 + wobble, 158 + wobble, 74];
}

// --- Drawing -----------------------------------------------------------------
/**
 * Draw the sea, then the terrain grid around the plane, far cells first.
 * Cells are culled when all four corners fall behind the camera or off the
 * screen, so only the ground the pilot can see is painted.
 */
export function drawTerrain(ctx, camera, planePos, width, height) {
  const { viewDistance, cell } = TERRAIN;
  // Sea: one huge quad at water level, drawn first so land paints over it.
  const seaY = TERRAIN.waterLevel + 0.4;
  const span = 5200;
  const corners = [
    { x: planePos.x - span, y: seaY, z: planePos.z - span },
    { x: planePos.x + span, y: seaY, z: planePos.z - span },
    { x: planePos.x + span, y: seaY, z: planePos.z + span },
    { x: planePos.x - span, y: seaY, z: planePos.z + span },
  ];
  const seaPts = corners.map((p) => camera.project(p));
  if (seaPts.every((p) => p !== null)) {
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, '#2f7fb8');
    grad.addColorStop(1, '#174f78');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(seaPts[0].x, seaPts[0].y);
    for (let i = 1; i < 4; i += 1) ctx.lineTo(seaPts[i].x, seaPts[i].y);
    ctx.closePath();
    ctx.fill();
  }

  const half = viewDistance;
  const x0 = Math.floor((planePos.x - half) / cell) * cell;
  const z0 = Math.floor((planePos.z - half) / cell) * cell;
  const cols = Math.ceil((half * 2) / cell);
  const quads = [];
  for (let ix = 0; ix < cols; ix += 1) {
    for (let iz = 0; iz < cols; iz += 1) {
      const x = x0 + ix * cell;
      const z = z0 + iz * cell;
      const cx = x + cell / 2;
      const cz = z + cell / 2;
      const dx = cx - planePos.x;
      const dz = cz - planePos.z;
      const dist2 = dx * dx + dz * dz;
      if (dist2 > viewDistance * viewDistance) continue;
      const h00 = groundHeight(x, z);
      const h10 = groundHeight(x + cell, z);
      const h01 = groundHeight(x, z + cell);
      const h11 = groundHeight(x + cell, z + cell);
      if (Math.max(h00, h10, h01, h11) < TERRAIN.waterLevel - 2) continue; // deep lagoon
      const p00 = camera.project({ x, y: h00, z });
      const p10 = camera.project({ x: x + cell, y: h10, z });
      const p01 = camera.project({ x, y: h01, z: z + cell });
      const p11 = camera.project({ x: x + cell, y: h11, z: z + cell });
      if (!p00 && !p10 && !p01 && !p11) continue;
      const pts = [p00, p10, p11, p01].filter((p) => p !== null);
      if (pts.length < 3) continue;
      if (pts.every((p) => p.x < -80 || p.x > width + 80)) continue;
      const avgH = (h00 + h10 + h01 + h11) / 4;
      const slope = Math.max(Math.abs(h10 - h00), Math.abs(h01 - h00)) / cell;
      const rgb = shadeFor(avgH, slope, cx, cz);
      // Far ground fades into haze so the horizon reads as distance.
      const dist = Math.sqrt(dist2);
      const haze = clamp((dist - 550) / 650, 0, 0.55);
      const r = Math.round(lerp(rgb[0], 168, haze));
      const g = Math.round(lerp(rgb[1], 190, haze));
      const b = Math.round(lerp(rgb[2], 205, haze));
      quads.push({ pts, dist, color: `rgb(${r},${g},${b})` });
    }
  }
  quads.sort((a, b) => b.dist - a.dist);
  for (const quad of quads) {
    ctx.fillStyle = quad.color;
    ctx.beginPath();
    ctx.moveTo(quad.pts[0].x, quad.pts[0].y);
    for (let i = 1; i < quad.pts.length; i += 1) ctx.lineTo(quad.pts[i].x, quad.pts[i].y);
    ctx.closePath();
    ctx.fill();
  }
  drawRunway(ctx, camera);
}

/** The runway strip: dark asphalt, white dashes, threshold bars and "07". */
function drawRunway(ctx, camera) {
  const heading = (RUNWAY.headingDeg * Math.PI) / 180;
  const sinH = Math.sin(heading);
  const cosH = Math.cos(heading);
  const halfL = RUNWAY.length / 2;
  const halfW = RUNWAY.width / 2;
  const y = RUNWAY_HEIGHT + 0.35;
  const corner = (u, v) => ({
    x: RUNWAY.x + u * sinH + v * cosH,
    y,
    z: RUNWAY.z - u * cosH + v * sinH,
  });
  const strip = [corner(-halfL, -halfW), corner(halfL, -halfW), corner(halfL, halfW), corner(-halfL, halfW)]
    .map((p) => camera.project(p));
  if (strip.some((p) => p === null)) return;
  ctx.fillStyle = '#33373d';
  ctx.beginPath();
  ctx.moveTo(strip[0].x, strip[0].y);
  for (let i = 1; i < 4; i += 1) ctx.lineTo(strip[i].x, strip[i].y);
  ctx.closePath();
  ctx.fill();
  // Centreline dashes.
  ctx.fillStyle = '#f5f5f0';
  for (let u = -halfL + 12; u < halfL - 12; u += 24) {
    const dash = [corner(u, -1.1), corner(u + 12, -1.1), corner(u + 12, 1.1), corner(u, 1.1)]
      .map((p) => camera.project(p));
    if (dash.some((p) => p === null)) continue;
    ctx.beginPath();
    ctx.moveTo(dash[0].x, dash[0].y);
    for (let i = 1; i < 4; i += 1) ctx.lineTo(dash[i].x, dash[i].y);
    ctx.closePath();
    ctx.fill();
  }
  // Threshold bars at both ends.
  for (const end of [-1, 1]) {
    for (let v = -halfW + 3; v < halfW - 3; v += 6) {
      const bar = [
        corner(end * (halfL - 9), v),
        corner(end * (halfL - 2), v),
        corner(end * (halfL - 2), v + 3),
        corner(end * (halfL - 9), v + 3),
      ].map((p) => camera.project(p));
      if (bar.some((p) => p === null)) continue;
      ctx.beginPath();
      ctx.moveTo(bar[0].x, bar[0].y);
      for (let i = 1; i < 4; i += 1) ctx.lineTo(bar[i].x, bar[i].y);
      ctx.closePath();
      ctx.fill();
    }
  }
}
