// Sky Courier — the 3D scene: sky, sun, clouds, terrain, rings and the
// plane, painted on one canvas with the renderer's own software projection.
// The HUD and the instrument panel live in hud.js; the screens in screens.js
// are drawn on top by main.js.
import { CAMERA } from './config.js';
import {
  bodyAxes, clamp, createCamera, degToRad, focalFromFov, lerp, normalize, sub, vec3,
} from './math3d.js';
import { drawTerrain } from './terrain.js';
import { planeFaces } from './plane.js';
import { nextRingTarget } from './missions.js';

// Clouds: fixed, seeded positions so the sky is the same every run.
const CLOUDS = [];
{
  let seed = 1234567;
  const rand = () => {
    seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = 0; i < 26; i += 1) {
    CLOUDS.push({
      x: (rand() - 0.5) * 3600,
      y: 190 + rand() * 110,
      z: (rand() - 0.5) * 3600 - 300,
      s: 60 + rand() * 90,
    });
  }
}

// The sun hangs low in the west so the light rakes across the islands.
const SUN_DIR = normalize(vec3(-0.55, 0.42, -0.35));

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_COMPLETE = 'complete';

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let width = 0;
  let height = 0;
  // Smoothed chase camera position and look target.
  let camPos = null;
  let camLook = null;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    width = Math.max(320, Math.round(rect.width * dpr));
    height = Math.max(240, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  function chaseCamera(plane, dt) {
    const axes = bodyAxes(plane.heading, plane.pitch * 0.35, 0);
    const wanted = {
      x: plane.pos.x - axes.forward.x * CAMERA.back + axes.up.x * CAMERA.up,
      y: plane.pos.y - axes.forward.y * CAMERA.back + axes.up.y * CAMERA.up,
      z: plane.pos.z - axes.forward.z * CAMERA.back + axes.up.z * CAMERA.up,
    };
    const look = {
      x: plane.pos.x + axes.forward.x * CAMERA.lookAhead,
      y: plane.pos.y + axes.forward.y * CAMERA.lookAhead + 1.2,
      z: plane.pos.z + axes.forward.z * CAMERA.lookAhead,
    };
    if (!camPos) {
      camPos = { ...wanted };
      camLook = { ...look };
    } else {
      const k = 1 - Math.exp(-CAMERA.smooth * dt);
      camPos = {
        x: lerp(camPos.x, wanted.x, k),
        y: lerp(camPos.y, wanted.y, k),
        z: lerp(camPos.z, wanted.z, k),
      };
      camLook = {
        x: lerp(camLook.x, look.x, k),
        y: lerp(camLook.y, look.y, k),
        z: lerp(camLook.z, look.z, k),
      };
    }
    // Never let the camera sink below the waves.
    if (camPos.y < 2.5) camPos.y = 2.5;
    const focal = focalFromFov(CAMERA.fov, height);
    return createCamera(camPos, camLook, vec3(0, 1, 0), focal, width, height);
  }

  function drawSky(camera, plane) {
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, '#1e6fb8');
    grad.addColorStop(0.45, '#7db8e0');
    grad.addColorStop(0.62, '#cfe8f2');
    grad.addColorStop(1, '#e8f2f2');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    // Sun: a bright disc with a soft halo, placed by projecting far away.
    const sunPoint = {
      x: camera.position.x + SUN_DIR.x * 3000,
      y: camera.position.y + SUN_DIR.y * 3000,
      z: camera.position.z + SUN_DIR.z * 3000,
    };
    const sun = camera.project(sunPoint);
    if (sun) {
      const glow = ctx.createRadialGradient(sun.x, sun.y, 4, sun.x, sun.y, 130);
      glow.addColorStop(0, 'rgba(255, 244, 190, 0.95)');
      glow.addColorStop(0.25, 'rgba(255, 236, 160, 0.55)');
      glow.addColorStop(1, 'rgba(255, 236, 160, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(sun.x, sun.y, 130, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff7cf';
      ctx.beginPath();
      ctx.arc(sun.x, sun.y, 26, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawClouds(camera) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    for (const cloud of CLOUDS) {
      const p = camera.project(vec3(cloud.x, cloud.y, cloud.z));
      if (!p) continue;
      const s = cloud.s * p.scale;
      if (s < 4 || p.x < -s * 2 || p.x > width + s * 2 || p.y < -s || p.y > height + s) continue;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, s, s * 0.32, 0, 0, Math.PI * 2);
      ctx.ellipse(p.x - s * 0.55, p.y + s * 0.06, s * 0.55, s * 0.22, 0, 0, Math.PI * 2);
      ctx.ellipse(p.x + s * 0.55, p.y + s * 0.06, s * 0.55, s * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawRings(camera, course, time, showLabels = true) {
    for (const ring of course.rings) {
      const next = nextRingTarget(course);
      const isNext = next === ring;
      // The ring faces the pilot's line of travel: its normal points at the
      // following ring (or the runway for the last one).
      const after = course.rings[ring.index + 1];
      const toward = after ? sub(after.pos, ring.pos) : vec3(0, -20, -560 - ring.pos.z);
      const normal = normalize(toward);
      const side = normalize({ x: -normal.z, y: 0, z: normal.x });
      const up = { x: 0, y: 1, z: 0 };
      const points = [];
      let visible = true;
      for (let i = 0; i <= 26; i += 1) {
        const a = (i / 26) * Math.PI * 2;
        const p = {
          x: ring.pos.x + (side.x * Math.cos(a) + up.x * Math.sin(a)) * ring.radius,
          y: ring.pos.y + (side.y * Math.cos(a) + up.y * Math.sin(a)) * ring.radius,
          z: ring.pos.z + (side.z * Math.cos(a) + up.z * Math.sin(a)) * ring.radius,
        };
        const projected = camera.project(p);
        if (!projected) {
          visible = false;
          break;
        }
        points.push(projected);
      }
      if (!visible) continue;
      const depth = points.reduce((sum, p) => sum + p.depth, 0) / points.length;
      const pulse = isNext ? 0.75 + 0.25 * Math.sin(time * 5) : 1;
      const color = ring.passed ? '#37d67a' : isNext ? '#ffd60a' : '#22c8e5';
      ctx.save();
      ctx.globalAlpha = clamp(1.15 - depth / 1400, 0.25, 1) * pulse;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(2, points[0].scale * 1.5);
      ctx.lineJoin = 'round';
      ctx.shadowColor = color;
      ctx.shadowBlur = isNext ? 18 : 6;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
      // Number tag above the next ring so the pilot can read the course.
      if (isNext && showLabels) {
        const top = camera.project({ x: ring.pos.x, y: ring.pos.y + ring.radius + 10, z: ring.pos.z });
        if (top) {
          ctx.save();
          ctx.font = `bold ${Math.max(13, Math.round(top.scale * 9))}px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillStyle = '#ffd60a';
          ctx.strokeStyle = 'rgba(20, 30, 40, 0.8)';
          ctx.lineWidth = 4;
          ctx.strokeText(`RING ${ring.index + 1}`, top.x, top.y);
          ctx.fillText(`RING ${ring.index + 1}`, top.x, top.y);
          ctx.restore();
        }
      }
    }
  }

  function drawPlane(camera, plane) {
    const faces = planeFaces(plane, camera);
    for (const face of faces) {
      if (face.prop) {
        // Spinning propeller: a translucent disc and two blades.
        ctx.save();
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = '#dfe6ea';
        ctx.beginPath();
        ctx.arc(face.centre.x, face.centre.y, face.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = '#3a3f44';
        ctx.lineWidth = Math.max(1.5, face.radius * 0.12);
        for (const blade of [face.angle, face.angle + Math.PI]) {
          ctx.beginPath();
          ctx.moveTo(face.centre.x, face.centre.y);
          ctx.lineTo(
            face.centre.x + Math.cos(blade) * face.radius,
            face.centre.y + Math.sin(blade) * face.radius,
          );
          ctx.stroke();
        }
        ctx.restore();
        continue;
      }
      ctx.fillStyle = face.color;
      ctx.beginPath();
      ctx.moveTo(face.pts[0].x, face.pts[0].y);
      for (let i = 1; i < face.pts.length; i += 1) ctx.lineTo(face.pts[i].x, face.pts[i].y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(30, 30, 40, 0.25)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  /** Paint one frame of the 3D world. Returns the camera for the HUD. */
  function drawScene(plane, course, dt, showLabels = true) {
    resize();
    const camera = chaseCamera(plane, dt);
    drawSky(camera, plane);
    drawClouds(camera);
    drawTerrain(ctx, camera, plane.pos, width, height);
    drawRings(camera, course, plane.time, showLabels);
    drawPlane(camera, plane);
    return { camera, width, height };
  }

  return {
    drawScene,
    get ctx() {
      return ctx;
    },
    get width() {
      return width;
    },
    get height() {
      return height;
    },
  };
}
