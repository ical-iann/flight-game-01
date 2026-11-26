// Sky Courier — the sortie: eight glowing rings over the islands, then a
// landing on runway 07. Rings are scored in order; the timer rewards a
// pilot who flies the course, not one who wanders.
import { COURSE, FLIGHT, RUNWAY } from './config.js';
import { degToRad, distance, vec3 } from './math3d.js';
import { groundHeight } from './terrain.js';

// Ring positions: a tour of the island group, each ring standing vertical and
// facing the direction of travel. Heights sit well above the hills below:
// every ring is lifted to at least 48 m above the ground beneath it, so the
// course never asks the pilot to fly through a hillside.
const RING_DEFS = [
  { x: 60, z: -640, y: 70 },
  { x: 320, z: -780, y: 95 },
  { x: 620, z: -700, y: 110 },
  { x: 780, z: -260, y: 100 },
  { x: 700, z: 180, y: 85 },
  { x: 240, z: 420, y: 90 },
  { x: -320, z: 420, y: 80 },
  { x: -420, z: -120, y: 75 },
];

function ringHeight(def) {
  return Math.max(def.y, groundHeight(def.x, def.z) + 48);
}

export function createCourse() {
  return {
    rings: RING_DEFS.map((def, index) => ({
      index,
      pos: vec3(def.x, ringHeight(def), def.z),
      radius: COURSE.ringRadius,
      passed: false,
    })),
    nextRing: 0,
    score: 0,
    ringsHit: 0,
    timeLeft: COURSE.timeLimit,
    finished: false,
    landedAt: null,
  };
}

/** The ring the pilot must fly through next, or null when the course is done. */
export function nextRingTarget(course) {
  return course.nextRing < course.rings.length ? course.rings[course.nextRing] : null;
}

/** Where the pilot should aim right now: the next ring, or the runway. */
export function currentTarget(course) {
  const ring = nextRingTarget(course);
  if (ring) return { kind: 'ring', pos: ring.pos, radius: ring.radius };
  // Final approach: aim for a point on the glide path, 260 m out, 55 m up.
  const heading = degToRad(RUNWAY.headingDeg);
  const approach = vec3(
    RUNWAY.x - Math.sin(heading) * 260,
    55,
    RUNWAY.z + Math.cos(heading) * 260,
  );
  return { kind: 'approach', pos: approach, radius: 30 };
}

/**
 * Check the plane against the next ring. A pass counts when the plane comes
 * within the ring's radius of its centre — the ring is generous on purpose,
 * the skill is in flying the line, not threading a needle.
 */
export function checkRings(course, plane, events) {
  const ring = nextRingTarget(course);
  if (!ring) return;
  if (distance(plane.pos, ring.pos) < ring.radius) {
    ring.passed = true;
    course.nextRing += 1;
    course.ringsHit += 1;
    course.score += COURSE.ringScore;
    course.timeLeft += COURSE.ringTimeBonus;
    events.push(`ring-${course.ringsHit}`);
  }
}

/** Countdown; the sortie ends when the clock runs out. */
export function stepCourse(course, dt, events) {
  if (course.finished) return;
  course.timeLeft -= dt;
  if (course.timeLeft <= 0) {
    course.timeLeft = 0;
    course.finished = true;
    events.push('time-up');
  }
}

/** Score the landing once the wheels are down on the strip. */
export function scoreLanding(course, perfect) {
  if (course.landedAt !== null) return 0;
  course.landedAt = course.score;
  const gained = COURSE.landingScore + (perfect ? COURSE.perfectLandingBonus : 0);
  course.score += gained;
  course.finished = true;
  return gained;
}

export function courseSummary(course) {
  return {
    score: course.score,
    rings: `${course.ringsHit}/${course.rings.length}`,
    timeLeft: Math.ceil(course.timeLeft),
  };
}

// --- Autopilot ---------------------------------------------------------------
// Steers the plane toward a target point the way a careful pilot would: bank
// toward the heading error, pitch toward the altitude error, throttle to hold
// a chosen speed. The screenshot scenes and the title-screen attract mode fly
// with this; a human pilot can beat it by cutting corners.
//
// The bank gain shrinks as the target gets close: near the ring the pilot
// holds the line and flies straight through it instead of banking into an
// orbit around it (pure pursuit with a fixed gain circles forever).
export function autopilotInput(plane, target, speedTarget, dt) {
  const dx = target.pos.x - plane.pos.x;
  const dz = target.pos.z - plane.pos.z;
  const dist = Math.hypot(dx, dz);
  const wantedHeading = Math.atan2(dx, -dz);
  let headingError = wantedHeading - plane.heading;
  while (headingError > Math.PI) headingError -= Math.PI * 2;
  while (headingError < -Math.PI) headingError += Math.PI * 2;
  const gain = 1.6 * Math.max(0.25, Math.min(1, dist / 180));
  // PD heading control: bank toward the heading error, minus damping from
  // the turn rate the current bank already produces. Without the damping
  // term the heading overshoots and the plane snakes across the course.
  const headingRate = Math.sin(plane.roll) * FLIGHT.yawFromRoll * (plane.speed / FLIGHT.cruiseSpeed);
  const roll = Math.max(-1, Math.min(1, headingError * gain * 1.2 - headingRate * 1.5));
  const altError = target.pos.y - plane.pos.y;
  const pitch = Math.max(-1, Math.min(1, altError * 0.02 + 0.08));
  const speedError = speedTarget - plane.speed;
  const throttle = Math.max(0, Math.min(1, 0.62 + speedError * 0.03));
  return { pitch, roll, yaw: 0, throttle, gear: plane.gearDown, flaps: false };
}

/**
 * The carrot the autopilot chases: a point on the line from the previous
 * ring to the next one, 150 m ahead of the plane's projection onto that
 * line. Following the line (instead of chasing the ring itself) lines the
 * plane up early, so it flies straight through the 16 m ring instead of
 * banking into an orbit around it. Past the ring the carrot runs 40 m
 * beyond it, on the same line.
 */
export function courseCarrot(plane, course) {
  const ring = nextRingTarget(course);
  if (!ring) return null;
  const prev = ring.index === 0
    ? vec3(RUNWAY.startX, ring.pos.y, RUNWAY.startZ)
    : course.rings[ring.index - 1].pos;
  const ab = { x: ring.pos.x - prev.x, y: ring.pos.y - prev.y, z: ring.pos.z - prev.z };
  const len2 = ab.x * ab.x + ab.y * ab.y + ab.z * ab.z || 1;
  const ap = { x: plane.pos.x - prev.x, y: plane.pos.y - prev.y, z: plane.pos.z - prev.z };
  const t = Math.max(0, Math.min(1, (ap.x * ab.x + ap.y * ab.y + ap.z * ab.z) / len2));
  const lineLen = Math.sqrt(len2);
  const ahead = Math.min(1, t + 90 / lineLen);
  const carrot = {
    x: prev.x + ab.x * ahead,
    y: prev.y + ab.y * ahead,
    z: prev.z + ab.z * ahead,
  };
  if (ahead >= 1) {
    // Past the ring: keep going 40 m beyond it on the same line.
    const n = 40 / lineLen;
    carrot.x = ring.pos.x + ab.x * n;
    carrot.y = ring.pos.y + ab.y * n;
    carrot.z = ring.pos.z + ab.z * n;
  }
  return { pos: vec3(carrot.x, carrot.y, carrot.z) };
}

/** Landing autopilot: a proper circuit, not a straight dive at the strip.
 * After the last ring the plane joins a downwind leg over the sea west of
 * the runway, turns onto the final approach fix 400 m out, then flies a
 * steady glide slope to the threshold and flares. The phase lives on the
 * plane so the pattern survives from step to step. Until the plane is
 * established on final it never descends below 48 m — the hills north of
 * the strip are what a direct dive runs into.
 */
export function landingInput(plane, dt) {
  if (plane.landingPhase === undefined) plane.landingPhase = 0;
  const heading = degToRad(RUNWAY.headingDeg);
  const sinH = Math.sin(heading);
  const cosH = Math.cos(heading);
  // Downwind: 450 m west of the strip, over the sea, 55 m up.
  const downwind = vec3(RUNWAY.x - 450, 55, RUNWAY.z);
  // Final approach fix: 400 m out on the extended centreline, 50 m up.
  const faf = vec3(RUNWAY.x - sinH * 400, 50, RUNWAY.z + cosH * 400);
  const distToThreshold = Math.hypot(plane.pos.x - RUNWAY.x, plane.pos.z - RUNWAY.z);
  if (plane.landingPhase === 0 && distance(plane.pos, downwind) < 90) plane.landingPhase = 1;
  if (plane.landingPhase === 1 && distance(plane.pos, faf) < 90) plane.landingPhase = 2;
  let target;
  let speedTarget = 52;
  let onFinal = false;
  let flare = false;
  if (plane.landingPhase === 0) {
    target = { pos: downwind };
  } else if (plane.landingPhase === 1) {
    target = { pos: faf };
  } else {
    onFinal = true;
    // Follow the centreline itself: a carrot 100 m ahead of the plane's
    // projection onto the strip, so a lateral error steers the nose back
    // to the middle instead of just pointing at a far point.
    const relX = plane.pos.x - RUNWAY.x;
    const relZ = plane.pos.z - RUNWAY.z;
    const u = relX * sinH - relZ * cosH;
    const carrotU = u + 100;
    const carrot = vec3(RUNWAY.x + sinH * carrotU, 6, RUNWAY.z - cosH * carrotU);
    // The flare latches on the along-strip coordinate: once the plane is
    // within 80 m of the threshold it stays in the flare, even after it
    // flies past the threshold point (a distance check would re-engage the
    // climb to the slope altitude and balloon the plane away). Starting the
    // flare any earlier floats the plane past the end of the strip.
    flare = u > -80;
    if (!flare) {
      target = { pos: vec3(carrot.x, Math.min(50, 6 + distToThreshold * 0.11), carrot.z) };
      speedTarget = 46;
    } else {
      target = { pos: carrot };
      speedTarget = 38;
    }
  }
  const input = autopilotInput(plane, target, speedTarget, dt);
  // Glide-slope pitch, replacing the ring-chasing pitch: proportional to
  // the altitude error and damped by the vertical speed, so a held nose-down
  // input cannot wind the dive up. In the flare the pitch is held by an
  // inner loop instead: the nose angle that gives the wanted descent rate,
  // which decays with the height above the strip, so the wheels kiss the
  // ground instead of thumping it or ballooning away from it.
  if (flare) {
    const heightAboveStrip = Math.max(0, plane.pos.y - 6);
    // The wanted descent rate decays with the height above the strip, so
    // the wheels kiss the ground instead of thumping it.
    const vsTarget = -Math.max(1.0, heightAboveStrip * 0.6);
    const pitchTarget = Math.asin(Math.max(-0.3, Math.min(0.3, vsTarget / Math.max(20, plane.speed))));
    input.pitch = Math.max(-1, Math.min(1, (pitchTarget - plane.pitch) * 2.5));
  } else {
    const altError = target.pos.y - plane.pos.y;
    const gain = onFinal ? 0.02 : 0.008;
    const damp = onFinal ? 0.02 : 0.03;
    const pitchMax = onFinal ? 0.15 : 0.12;
    input.pitch = Math.max(-0.15, Math.min(pitchMax, altError * gain - plane.verticalSpeed * damp));
  }
  if (!onFinal && plane.pos.y < 55) input.pitch = Math.max(input.pitch, 0.08);
  input.gear = true;
  input.flaps = true;
  return input;
}
