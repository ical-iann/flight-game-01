// Sky Courier: Kepulauan Run — boot and the one loop.
// The game moves between four screens: title, play, paused and over/complete.
// ?shot=start|play|end stages a screenshot scene instead of running the
// loop, paints it twice and sets window.__shotReady for the screenshot.
//
// Controls: W/S throttle, arrows pitch and bank, A/D rudder, mouse steers,
// G gear, F flaps, P pause, M mute. Space or click starts and restarts.
import { BEST_KEY, STEP } from './config.js';
import { createWorld, currentMessage, resetWorld, stepWorld } from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { createAudio } from './audio.js';
import {
  SCREEN_COMPLETE, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, createRenderer,
} from './render.js';
import { drawHud, drawMessage, drawPanel } from './hud.js';
import { drawScreen } from './screens.js';
import { stageShot } from './shots.js';
import { autopilotInput, courseCarrot, landingInput, nextRingTarget } from './missions.js';

/** The longest frame the loop catches up on; a longer stall is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld();
const renderer = createRenderer(canvas);
const sounds = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score lasts this visit.
  }
}

/** Paint the world and, over it, the HUD and the current screen. */
function paint(screen, best) {
  const { width, height } = renderer.drawScene(world.plane, world.course, STEP, screen !== SCREEN_TITLE);
  const ctx = renderer.ctx;
  if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) {
    drawHud(ctx, width, height, world.plane, world.course, best, world.time);
    drawPanel(ctx, width, height, world.plane, world.course, world.time);
    const message = currentMessage(world);
    if (message) drawMessage(ctx, width, height, message, world.messageKind);
  }
  if (screen !== SCREEN_PLAY) {
    drawScreen(ctx, width, height, screen, {
      plane: world.plane,
      course: world.course,
      best,
      crashReason: world.plane.crashReason,
      time: world.time,
    });
  }
  return { width, height };
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function frame() {
    paint(scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(frame);
    else window.__shotReady = true;
  }
  requestAnimationFrame(frame);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    resetWorld(world);
    input.setThrottle(0.55);
    accumulator = 0;
    screen = SCREEN_PLAY;
    sounds.unlock();
    sounds.click();
    announce('Playing. Fly the eight rings, then land on runway 07.');
  }

  function endGame() {
    screen = SCREEN_OVER;
    if (world.course.score > best) {
      best = world.course.score;
      saveBest(best);
    }
    announce(`Game over. Score ${world.course.score}. Best ${best}.`);
  }

  function completeGame() {
    screen = SCREEN_COMPLETE;
    if (world.course.score > best) {
      best = world.course.score;
      saveBest(best);
    }
    announce(`Mission complete. Score ${world.course.score}. Best ${best}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) sounds.setMuted(input.muted);
    if (actions & ACTION_CONFIRM) {
      sounds.unlock();
      if (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_COMPLETE) startGame();
      else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    } else if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE) {
      // The title screen watches a live attract flight, reset when it ends.
      if (world.over || world.complete || world.time > 70) resetWorld(world);
      stepWorld(world, attractInput(), null);
      sounds.update(0.4, world.plane.speed, false);
    } else if (screen === SCREEN_PLAY) {
      const flight = input.flight();
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        stepWorld(world, flight, sounds);
        if (world.over) endGame();
        else if (world.complete) completeGame();
        accumulator -= STEP;
      }
      sounds.update(flight.throttle, world.plane.speed, !world.plane.onGround);
    } else {
      accumulator = 0;
      sounds.update(0, 0, false);
    }
    paint(screen, best);
  }

  // The attract flight: full throttle, chase the rings, then land.
  function attractInput() {
    if (nextRingTarget(world.course)) {
      return autopilotInput(world.plane, courseCarrot(world.plane, world.course), 62, STEP);
    }
    return landingInput(world.plane, STEP);
  }

  // Leaving the tab pauses a running game rather than burning fuel unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Sky Courier. Press Space or click to fly.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
