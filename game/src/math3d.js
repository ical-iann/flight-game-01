// Sky Courier — tiny 3D math written for this game: no library, just the
// vectors, rotations and perspective projection the renderer needs.
// World axes: +x east, +y up, +z south. Heading 0 faces north (-z),
// heading grows clockwise, like a compass.

/** A 3D vector. */
export function vec3(x = 0, y = 0, z = 0) {
  return { x, y, z };
}

export function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale(a, s) {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

export function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function length(a) {
  return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
}

export function normalize(a) {
  const len = length(a) || 1;
  return { x: a.x / len, y: a.y / len, z: a.z / len };
}

export function distance(a, b) {
  return length(sub(a, b));
}

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Wrap an angle to (-PI, PI]. */
export function wrapAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle <= -Math.PI) angle += Math.PI * 2;
  return angle;
}

export function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad) {
  return (rad * 180) / Math.PI;
}

/**
 * The three body axes of the plane from its heading (yaw), pitch and roll.
 * forward: where the nose points. right: the starboard wing. up: the cabin roof.
 */
export function bodyAxes(heading, pitch, roll) {
  const ch = Math.cos(heading);
  const sh = Math.sin(heading);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  // Forward first, then right = forward x world-up rotated by roll, up = right x forward.
  const forward = { x: sh * cp, y: sp, z: -ch * cp };
  const rightFlat = { x: ch, y: 0, z: sh };
  const upFlat = { x: -sh * sp, y: cp, z: ch * sp };
  const right = {
    x: rightFlat.x * cr + upFlat.x * sr,
    y: rightFlat.y * cr + upFlat.y * sr,
    z: rightFlat.z * cr + upFlat.z * sr,
  };
  const up = cross(right, forward);
  return { forward: normalize(forward), right: normalize(right), up: normalize(up) };
}

/** Turn a point in the plane's local space (x right, y up, z forward) into the world. */
export function localToWorld(local, origin, axes) {
  return {
    x: origin.x + axes.right.x * local.x + axes.up.x * local.y + axes.forward.x * local.z,
    y: origin.y + axes.right.y * local.x + axes.up.y * local.y + axes.forward.y * local.z,
    z: origin.z + axes.right.z * local.x + axes.up.z * local.y + axes.forward.z * local.z,
  };
}

/**
 * A pinhole camera: position, the point it looks at, up hint, focal length in
 * pixels (from the field of view and the canvas height) and the canvas size.
 * project() returns {x, y, depth} in screen pixels, or null behind the camera.
 */
export function createCamera(position, lookAt, upHint, focal, width, height) {
  const forward = normalize(sub(lookAt, position));
  const right = normalize(cross(forward, upHint));
  const up = cross(right, forward);
  return {
    position,
    forward,
    right,
    up,
    focal,
    width,
    height,
    project(point) {
      const rel = sub(point, position);
      const z = dot(rel, forward);
      if (z < 0.6) return null; // behind the lens
      const x = dot(rel, right);
      const y = dot(rel, up);
      return {
        x: width / 2 + (x / z) * focal,
        y: height / 2 - (y / z) * focal,
        depth: z,
        scale: focal / z,
      };
    },
  };
}

/** Focal length in pixels for a vertical field of view and a canvas height. */
export function focalFromFov(fovDeg, height) {
  return height / 2 / Math.tan(degToRad(fovDeg) / 2);
}
