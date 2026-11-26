// Sky Courier — the world: one object holding the plane, the course and the
// messages, and the step that advances them together. main.js drives it;
// shots.js replays it with an autopilot for the screenshots.
import { STEP } from './config.js';
import { createPlane, stepPlane } from './plane.js';
import { checkRings, createCourse, scoreLanding, stepCourse } from './missions.js';

/** Fresh world: a plane on runway 07 and an untouched course. */
export function createWorld() {
  return {
    plane: createPlane(),
    course: createCourse(),
    message: '',
    messageKind: 'good',
    messageUntil: 0,
    over: false,
    complete: false,
    time: 0,
  };
}

export function resetWorld(world) {
  const fresh = createWorld();
  world.plane = fresh.plane;
  world.course = fresh.course;
  world.message = '';
  world.messageKind = 'good';
  world.messageUntil = 0;
  world.over = false;
  world.complete = false;
  world.time = 0;
}

function showMessage(world, text, kind = 'good', seconds = 2.6) {
  world.message = text;
  world.messageKind = kind;
  world.messageUntil = world.time + seconds;
}

/**
 * Advance the world one fixed step with the given flight input.
 * Returns nothing; the world records events as messages and as its
 * over/complete flags, and the caller reads them for sound and screens.
 */
export function stepWorld(world, input, sounds) {
  if (world.over || world.complete) return;
  const events = [];
  stepPlane(world.plane, input, STEP, events);
  checkRings(world.course, world.plane, events);
  stepCourse(world.course, STEP, events);
  world.time += STEP;

  for (const event of events) {
    if (event.startsWith('ring-')) {
      const n = event.slice(5);
      showMessage(world, `RING ${n}/8  +250  •  +12s`, 'good');
      sounds?.ring();
    } else if (event === 'landed') {
      const gained = scoreLanding(world.course, false);
      showMessage(world, `LANDED ON RUNWAY 07  +${gained}`, 'good', 4);
      world.complete = true;
      sounds?.touchdown();
    } else if (event === 'landed-perfect') {
      const gained = scoreLanding(world.course, true);
      showMessage(world, `PERFECT LANDING  +${gained}`, 'good', 4);
      world.complete = true;
      sounds?.touchdown();
    } else if (event === 'crash') {
      showMessage(world, world.plane.crashReason || 'CRASHED', 'bad', 4);
      world.over = true;
      sounds?.crash();
    } else if (event === 'time-up') {
      showMessage(world, "TIME'S UP", 'bad', 4);
      world.over = true;
      sounds?.warning();
    } else if (event === 'fuel-low') {
      showMessage(world, 'FUEL LOW — HEAD FOR THE RUNWAY', 'bad', 3.5);
      sounds?.warning();
    } else if (event === 'fuel-empty') {
      showMessage(world, 'FUEL EMPTY — GLIDING', 'bad', 3.5);
      sounds?.warning();
    } else if (event === 'edge') {
      showMessage(world, 'TURNING BACK — EDGE OF THE CHART', 'bad', 3);
    } else if (event === 'field-landing') {
      showMessage(world, 'ROUGH FIELD LANDING — NO DAMAGE', 'good', 3);
    } else if (event === 'touchdown-fast') {
      showMessage(world, 'TOO FAST TO STOP — ROLLING OUT', 'bad', 2.5);
    } else if (event === 'touchdown-hard') {
      showMessage(world, 'HARD TOUCHDOWN — ROLLING OUT', 'bad', 2.5);
    }
  }
  if (world.time > world.messageUntil) world.message = '';
}

/** The message to draw right now, or '' when none is showing. */
export function currentMessage(world) {
  return world.time <= world.messageUntil ? world.message : '';
}
