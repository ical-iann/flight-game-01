// Sky Courier — the aircraft: a little high-wing courier plane built from
// polygons, and the flight model that moves it. The plane is "Langit-7", a
// fictional island courier with an orange-and-cream livery.
import { COURSE, FLIGHT, FUEL, DAMAGE, RUNWAY } from './config.js';
import {
  bodyAxes, clamp, degToRad, localToWorld, radToDeg, vec3, wrapAngle,
} from './math3d.js';
import { groundHeight, onRunway, runwayOffset } from './terrain.js';

export const PLANE_NAME = 'Langit-7';

/** Fresh flight state: parked on runway 07, engine idling. */
export function createPlane() {
  return {
    pos: vec3(RUNWAY.startX, groundHeight(RUNWAY.startX, RUNWAY.startZ) + 0.6, RUNWAY.startZ),
    heading: degToRad(RUNWAY.startHeadingDeg),
    pitch: 0,
    roll: 0,
    speed: 0,
    throttle: 0,
    fuel: FUEL.capacity,
    damage: 0,
    gearDown: true,
    flaps: false,
    verticalSpeed: 0,
    onGround: true,
    landed: false,
    hasFlown: false,
    crashed: false,
    crashReason: '',
    propAngle: 0,
    time: 0,
  };
}

/**
 * One physics step. `input` is { pitch: -1..1 (stick back is +), roll: -1..1,
 * yaw: -1..1, throttle: 0..1, gear, flaps } and `events` collects what happened
 * this step (strings the world turns into score and messages).
 * Returns the plane, mutated in place.
 */
export function stepPlane(plane, input, dt, events) {
  plane.time += dt;
  const wasOnGround = plane.onGround;
  const ground = groundHeight(plane.pos.x, plane.pos.z);

  // Throttle and fuel.
  if (plane.fuel <= 0) {
    plane.throttle = 0;
    if (!plane.fuelWarned) {
      plane.fuelWarned = true;
      events.push('fuel-empty');
    }
  } else {
    plane.throttle = clamp(input.throttle, 0, 1);
    plane.fuel = Math.max(0, plane.fuel - (FUEL.burnIdle + (FUEL.burnFull - FUEL.burnIdle) * plane.throttle) * dt);
  }
  if (plane.fuel < FUEL.reserveWarn && !plane.fuelWarnedLow) {
    plane.fuelWarnedLow = true;
    events.push('fuel-low');
  }
  if (input.gear !== undefined) plane.gearDown = input.gear;
  if (input.flaps !== undefined) plane.flaps = input.flaps;

  // Speed chases the throttle target; drag grows when slow and nose-high.
  const targetSpeed = plane.throttle * FLIGHT.maxSpeed;
  const drag = FLIGHT.drag * (1 + Math.max(0, plane.pitch) * 2) * (plane.flaps ? 1.4 : 1);
  plane.speed += (targetSpeed - plane.speed) * Math.min(1, (FLIGHT.accel / FLIGHT.maxSpeed + drag * 0.02) * dt * 10) * 0.35;
  plane.speed = Math.max(0, plane.speed - drag * dt * (plane.speed > 0 ? 1 : 0) * 0.4);
  if (plane.speed > FLIGHT.maxSpeed) plane.speed = FLIGHT.maxSpeed;

  const flying = plane.speed > FLIGHT.minFlySpeed || !plane.onGround;
  const stalled = flying && plane.speed < FLIGHT.minFlySpeed;

  // Attitude: stick moves pitch and roll; bank turns the nose.
  const pitchInput = clamp(input.pitch, -1, 1);
  const rollInput = clamp(input.roll, -1, 1);
  const yawInput = clamp(input.yaw, -1, 1);
  if (!plane.onGround || plane.speed > 12) {
    plane.pitch += pitchInput * FLIGHT.pitchRate * dt;
    plane.roll += rollInput * FLIGHT.rollRate * dt;
    // Gentle spiral stability: the wings level themselves a little.
    plane.roll -= plane.roll * 0.25 * dt;
    plane.pitch -= (plane.pitch - (flying ? FLIGHT.climbPitch * 0.12 : 0)) * 0.18 * dt;
  }
  plane.pitch = clamp(plane.pitch, -0.6, 0.65);
  plane.roll = clamp(plane.roll, -1.15, 1.15);
  if (stalled) plane.pitch -= 0.35 * dt; // the nose drops in a stall
  plane.heading += (Math.sin(plane.roll) * FLIGHT.yawFromRoll * (plane.speed / FLIGHT.cruiseSpeed) + yawInput * FLIGHT.rudderRate * 0.4) * dt;
  plane.heading = wrapAngle(plane.heading);

  // Move along the nose.
  const axes = bodyAxes(plane.heading, plane.pitch, plane.roll);
  const forwardSpeed = plane.speed;
  const prevY = plane.pos.y;
  plane.pos.x += axes.forward.x * forwardSpeed * dt;
  plane.pos.z += axes.forward.z * forwardSpeed * dt;
  let climb = axes.forward.y * forwardSpeed;
  if (stalled) climb -= FLIGHT.stallSink * (1 - plane.speed / FLIGHT.minFlySpeed);
  if (plane.onGround && plane.speed < FLIGHT.minFlySpeed) climb = 0;
  plane.pos.y += climb * dt;
  plane.verticalSpeed = (plane.pos.y - prevY) / dt;
  plane.propAngle += (2 + plane.throttle * 38) * dt;

  // Keep the sortie inside the island group: a soft turn back at the edge.
  const distCentre = Math.hypot(plane.pos.x, plane.pos.z + 300);
  if (distCentre > 1500) {
    const homeHeading = Math.atan2(-plane.pos.x, plane.pos.z + 300);
    plane.heading += wrapAngle(homeHeading - plane.heading) * 0.5 * dt;
    if (!plane.edgeWarned) {
      plane.edgeWarned = true;
      events.push('edge');
    }
  } else {
    plane.edgeWarned = false;
  }

  // Ground contact. The vertical-speed allowance is generous on purpose:
  // taxiing over rising ground must not read as going airborne.
  const clearance = plane.pos.y - ground;
  plane.onGround = clearance <= 0.6 && plane.verticalSpeed <= 2;
  if (!plane.onGround && plane.speed > 30) plane.hasFlown = true;
  if (clearance <= 0.6) {
    plane.pos.y = ground + 0.6;
    if (!wasOnGround) {
      // Touchdown: judge it.
      const vs = -plane.verticalSpeed;
      const runway = onRunway(plane.pos.x, plane.pos.z);
      const aligned = Math.abs(wrapAngle(plane.heading - degToRad(RUNWAY.headingDeg))) < 0.35;
      const centreline = Math.abs(runwayOffset(plane.pos.x, plane.pos.z));
      if (!plane.gearDown) {
        plane.crashed = true;
        plane.crashReason = 'Belly landing — gear was up';
        events.push('crash');
      } else if (vs > DAMAGE.crashVs) {
        plane.crashed = true;
        plane.crashReason = 'Hard landing — touchdown too fast';
        events.push('crash');
      } else if (!runway && vs > DAMAGE.hardLandingVs) {
        plane.crashed = true;
        plane.crashReason = 'Crashed in the fields';
        events.push('crash');
      } else if (runway && plane.speed < 48 && aligned && vs <= DAMAGE.hardLandingVs) {
        plane.landed = true;
        events.push(centreline < 6 && vs < COURSE.smoothBonusVs ? 'landed-perfect' : 'landed');
        plane.speed *= 0.94;
      } else if (runway) {
        // Fast or hard touchdown on the strip: roll it out, bleeding speed;
        // slowing below 48 while still on the strip completes the landing.
        plane.speed *= 0.97;
        events.push(vs > DAMAGE.hardLandingVs ? 'touchdown-hard' : 'touchdown-fast');
      } else {
        // Off-strip ground contact at low speed: a rough field landing.
        plane.speed *= 0.9;
        events.push('field-landing');
      }
    } else if (plane.onGround && plane.hasFlown && !plane.landed && !plane.crashed) {
      // Rolling out on the strip after a fast touchdown: once slow, aligned
      // and on the centreline, the landing counts.
      const runway = onRunway(plane.pos.x, plane.pos.z);
      const aligned = Math.abs(wrapAngle(plane.heading - degToRad(RUNWAY.headingDeg))) < 0.35;
      const centreline = Math.abs(runwayOffset(plane.pos.x, plane.pos.z));
      if (runway && plane.speed < 48 && aligned && plane.gearDown) {
        plane.landed = true;
        events.push(centreline < 6 ? 'landed-perfect' : 'landed');
      }
    }
    if (plane.onGround) {
      plane.pitch *= 0.9;
      plane.roll *= 0.9;
      if (plane.speed > 0) plane.speed = Math.max(0, plane.speed - 6 * dt);
      if (plane.speed < 2 && plane.throttle < 0.1) plane.speed = 0;
    }
  }
  return plane;
}

/** Heading in degrees, compass style (0 = north). */
export function headingDeg(plane) {
  return (radToDeg(plane.heading) + 360) % 360;
}

/** Airspeed in knots, altitude in feet — the numbers the dials show. */
export function knots(plane) {
  return plane.speed * 1.944;
}

export function feet(plane) {
  return Math.max(0, plane.pos.y * 3.281);
}

// --- The aircraft model ------------------------------------------------------
// Local space: x right, y up, z forward (nose +z). Each face is a polygon with
// a colour; the renderer sorts faces far-to-near and paints them.
const FUSELAGE = '#e8590c'; // courier orange
const CREAM = '#f8f0dc';
const DARK = '#2b2d42';
const GLASS = '#8ecae6';

const FACES = [
  // Fuselage top (nose to tail).
  { pts: [[0, 0.62, 3.4], [-0.55, 0.35, 1.4], [-0.5, 0.3, -2.6], [0, 0.28, -3.1]], color: FUSELAGE },
  { pts: [[0, 0.62, 3.4], [0, 0.28, -3.1], [0.5, 0.3, -2.6], [0.55, 0.35, 1.4]], color: FUSELAGE },
  // Fuselage belly.
  { pts: [[0, -0.55, 3.0], [-0.5, -0.3, 1.2], [-0.45, -0.28, -2.6], [0, -0.25, -3.0]], color: CREAM },
  { pts: [[0, -0.55, 3.0], [0, -0.25, -3.0], [0.45, -0.28, -2.6], [0.5, -0.3, 1.2]], color: CREAM },
  // Fuselage sides.
  { pts: [[-0.55, 0.35, 1.4], [0, 0.62, 3.4], [0, -0.55, 3.0], [-0.5, -0.3, 1.2]], color: CREAM },
  { pts: [[0.55, 0.35, 1.4], [0.5, -0.3, 1.2], [0, -0.55, 3.0], [0, 0.62, 3.4]], color: CREAM },
  { pts: [[-0.5, 0.3, -2.6], [-0.55, 0.35, 1.4], [-0.5, -0.3, 1.2], [-0.45, -0.28, -2.6]], color: FUSELAGE },
  { pts: [[0.5, 0.3, -2.6], [0.45, -0.28, -2.6], [0.5, -0.3, 1.2], [0.55, 0.35, 1.4]], color: FUSELAGE },
  // Tail cone cap.
  { pts: [[0, 0.28, -3.1], [-0.5, 0.3, -2.6], [-0.45, -0.28, -2.6], [0, -0.25, -3.0]], color: DARK },
  { pts: [[0, 0.28, -3.1], [0, -0.25, -3.0], [0.45, -0.28, -2.6], [0.5, 0.3, -2.6]], color: DARK },
  // Canopy (glasshouse over the cockpit).
  { pts: [[0, 0.95, 1.9], [-0.42, 0.62, 1.5], [-0.38, 0.6, 0.2], [0, 0.72, 0.1]], color: GLASS },
  { pts: [[0, 0.95, 1.9], [0, 0.72, 0.1], [0.38, 0.6, 0.2], [0.42, 0.62, 1.5]], color: GLASS },
  // Main wings (high wing, slightly swept).
  { pts: [[-0.4, 0.62, 1.1], [-3.9, 0.55, 0.1], [-3.9, 0.55, -0.7], [-0.4, 0.62, -0.2]], color: CREAM },
  { pts: [[0.4, 0.62, 1.1], [0.4, 0.62, -0.2], [3.9, 0.55, -0.7], [3.9, 0.55, 0.1]], color: CREAM },
  // Wing tips (orange).
  { pts: [[-3.9, 0.55, 0.1], [-4.15, 0.5, -0.15], [-4.15, 0.5, -0.7], [-3.9, 0.55, -0.7]], color: FUSELAGE },
  { pts: [[3.9, 0.55, 0.1], [3.9, 0.55, -0.7], [4.15, 0.5, -0.7], [4.15, 0.5, -0.15]], color: FUSELAGE },
  // Horizontal stabiliser.
  { pts: [[-0.3, 0.32, -2.5], [-1.7, 0.3, -2.9], [-1.7, 0.3, -3.3], [-0.3, 0.32, -3.1]], color: CREAM },
  { pts: [[0.3, 0.32, -2.5], [0.3, 0.32, -3.1], [1.7, 0.3, -3.3], [1.7, 0.3, -2.9]], color: CREAM },
  // Vertical fin.
  { pts: [[0, 0.3, -2.5], [0, 1.35, -2.95], [0, 1.35, -3.25], [0, 0.28, -3.15]], color: FUSELAGE },
  // Fixed landing gear legs (visible when down).
  { pts: [[-0.45, -0.3, 1.0], [-0.45, -0.95, 1.0], [-0.35, -0.95, 1.0], [-0.35, -0.3, 1.0]], color: DARK },
  { pts: [[0.45, -0.3, 1.0], [0.45, -0.95, 1.0], [0.35, -0.95, 1.0], [0.35, -0.3, 1.0]], color: DARK },
];

/**
 * Project the plane's faces for the chase camera and return them sorted
 * far-to-near, each with screen points, colour and mean depth.
 * The propeller is two spinning blades drawn as a translucent disc.
 */
export function planeFaces(plane, camera) {
  const axes = bodyAxes(plane.heading, plane.pitch, plane.roll);
  const faces = [];
  for (const face of FACES) {
    if (face.pts[0][1] < -0.9 && !plane.gearDown) continue; // gear legs hide when up
    const world = face.pts.map(([x, y, z]) => localToWorld({ x, y, z }, plane.pos, axes));
    const projected = world.map((p) => camera.project(p));
    if (projected.some((p) => p === null)) continue;
    const depth = projected.reduce((sum, p) => sum + p.depth, 0) / projected.length;
    faces.push({ pts: projected, color: face.color, depth });
  }
  // Propeller: a spinning blur disc at the nose.
  const nose = localToWorld({ x: 0, y: 0.05, z: 3.55 }, plane.pos, axes);
  const prop = camera.project(nose);
  if (prop) {
    faces.push({ prop: true, centre: prop, angle: plane.propAngle, depth: prop.depth, radius: prop.scale * 1.15 });
  }
  faces.sort((a, b) => b.depth - a.depth);
  return faces;
}
