// Sky Courier — keyboard and mouse input. Arrows / WASD fly the plane,
// the mouse steers too (move it and the plane banks toward it), and the
// buttons on the title screen start the game. One module owns every listener
// so the game loop only ever reads a plain input object.
import { clamp } from './math3d.js';

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_GEAR = 4;
export const ACTION_FLAPS = 8;
export const ACTION_MUTE = 16;

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseActive = false;
  let mouseSeenAt = 0;
  let throttle = 0.55;
  let gearDown = true;
  let flaps = false;
  let muted = false;

  function onKeyDown(event) {
    if (event.repeat) return;
    keys.add(event.code);
    if (event.code === 'Space' || event.code === 'Enter') {
      actions |= ACTION_CONFIRM;
      event.preventDefault();
    } else if (event.code === 'KeyP' || event.code === 'Escape') {
      actions |= ACTION_PAUSE;
    } else if (event.code === 'KeyG') {
      actions |= ACTION_GEAR;
    } else if (event.code === 'KeyF') {
      actions |= ACTION_FLAPS;
    } else if (event.code === 'KeyM') {
      actions |= ACTION_MUTE;
    }
    if (event.code.startsWith('Arrow') || event.code === 'Space') event.preventDefault();
  }

  function onKeyUp(event) {
    keys.delete(event.code);
  }

  function onMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    mouseX = (event.clientX - rect.left) / rect.width - 0.5;
    mouseY = (event.clientY - rect.top) / rect.height - 0.5;
    mouseActive = true;
    mouseSeenAt = performance.now();
  }

  function onMouseDown(event) {
    if (event.button === 0) actions |= ACTION_CONFIRM;
  }

  function onBlur() {
    keys.clear();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);

  function held(name) {
    return keys.has(name);
  }

  return {
    /** One-shot actions since the last call (confirm, pause, gear, ...). */
    takeActions() {
      const taken = actions;
      actions = 0;
      if (taken & ACTION_GEAR) gearDown = !gearDown;
      if (taken & ACTION_FLAPS) flaps = !flaps;
      if (taken & ACTION_MUTE) muted = !muted;
      return taken;
    },

    /** Continuous flight controls for this frame. */
    flight() {
      // Throttle: W/S nudge it, held keys move it smoothly.
      if (held('KeyW')) throttle = clamp(throttle + 0.45 / 60, 0, 1);
      if (held('KeyS')) throttle = clamp(throttle - 0.45 / 60, 0, 1);
      let pitch = 0;
      let roll = 0;
      if (held('ArrowUp')) pitch += 1;
      if (held('ArrowDown')) pitch -= 1;
      if (held('ArrowLeft')) roll -= 1;
      if (held('ArrowRight')) roll += 1;
      // Mouse steering: banking follows the pointer, gently, and only for a
      // few seconds after the mouse last moved. Mouse up climbs.
      if (mouseActive && performance.now() - mouseSeenAt < 4000) {
        roll += clamp(mouseX * 2.4, -1, 1);
        pitch -= clamp(mouseY * 1.6, -1, 1);
      }
      const yaw = (held('KeyA') ? -1 : 0) + (held('KeyD') ? 1 : 0);
      return {
        pitch: clamp(pitch, -1, 1),
        roll: clamp(roll, -1, 1),
        yaw,
        throttle,
        gear: gearDown,
        flaps,
      };
    },

    setThrottle(value) {
      throttle = clamp(value, 0, 1);
    },

    get gearDown() {
      return gearDown;
    },

    get flaps() {
      return flaps;
    },

    get muted() {
      return muted;
    },

    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mousedown', onMouseDown);
    },
  };
}
