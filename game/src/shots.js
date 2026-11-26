// Sky Courier — the screenshot scenes behind ?shot=start|play|end. Each one
// plays the real rules forward from a fresh world for a fixed number of
// steps, steered by the autopilot, so the frame is what a real sortie looks
// like and the same seed always gives the same frame.
//   start — title screen over the islands, the plane climbing out with the
//           runway behind it and the first ring ahead.
//   play  — mid-course: chasing the next ring over the lagoon, HUD lit.
//   end   — on final approach to runway 07, gear down, the strip filling
//           the windscreen.
import { STEP } from './config.js';
import { autopilotInput, courseCarrot, currentTarget, landingInput, nextRingTarget } from './missions.js';
import { SCREEN_COMPLETE, SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { resetWorld, stepWorld } from './world.js';

const START_SECONDS = 9;
const PLAY_SECONDS = 34;
const END_SECONDS = 130;
const SAMPLE = STEP;

function flyToward(world, seconds, chooseInput) {
  const steps = Math.round(seconds / SAMPLE);
  for (let i = 0; i < steps; i += 1) {
    if (world.over || world.complete) break;
    stepWorld(world, chooseInput(world), null);
  }
}

/** Fly the rings until the course is done or the time runs out. */
function ringInput(world) {
  const target = courseCarrot(world.plane, world.course);
  return autopilotInput(world.plane, target, 62, SAMPLE);
}

/** After the rings, bring Langit-7 home to runway 07. */
function homeInput(world) {
  if (nextRingTarget(world.course)) return ringInput(world);
  return landingInput(world.plane, SAMPLE);
}

/**
 * Set `world` to the named scene and return the screen to draw over it.
 * Any other name is the start scene.
 */
export function stageShot(name, world) {
  resetWorld(world);
  if (name === 'play') {
    // Take off, climb out and chase the rings.
    world.plane.throttle = 1;
    flyToward(world, PLAY_SECONDS, ringInput);
    return { screen: world.over ? SCREEN_OVER : SCREEN_PLAY, best: 0 };
  }
  if (name === 'end') {
    // The whole sortie: rings, then the approach and the landing.
    world.plane.throttle = 1;
    flyToward(world, END_SECONDS, homeInput);
    if (world.complete) return { screen: SCREEN_COMPLETE, best: world.course.score };
    if (world.over) return { screen: SCREEN_OVER, best: world.course.score };
    return { screen: SCREEN_PLAY, best: world.course.score };
  }
  // start: a short climb-out with the title screen over it.
  world.plane.throttle = 1;
  flyToward(world, START_SECONDS, ringInput);
  return { screen: SCREEN_TITLE, best: 0 };
}
