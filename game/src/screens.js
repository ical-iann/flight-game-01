// Sky Courier — the screens: title, paused, crashed / out of time, and the
// mission-complete debrief. Each is drawn over the live 3D scene, so the
// game is always visible behind the words.
import { SCREEN_COMPLETE, SCREEN_OVER, SCREEN_PAUSED, SCREEN_TITLE } from './render.js';

function dim(ctx, width, height, alpha) {
  ctx.fillStyle = `rgba(8, 12, 18, ${alpha})`;
  ctx.fillRect(0, 0, width, height);
}

function centred(ctx, width, y, text, font, color) {
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.fillText(text, width / 2, y);
}

function panel(ctx, width, height, top, bottom) {
  ctx.fillStyle = 'rgba(10, 14, 20, 0.72)';
  ctx.fillRect(0, top, width, bottom - top);
}

export function drawScreen(ctx, width, height, screen, game) {
  const { plane, course, best, crashReason } = game;
  if (screen === SCREEN_TITLE) {
    dim(ctx, width, height, 0.35);
    centred(ctx, width, height * 0.22, 'SKY COURIER', 'bold 64px system-ui, sans-serif', '#ffd60a');
    centred(ctx, width, height * 0.22 + 44, 'KEPULAUAN RUN  •  LANGIT-7 ISLAND COURIER', 'bold 19px system-ui, sans-serif', '#f5f5f0');
    centred(ctx, width, height * 0.22 + 84, 'Fly the eight rings over the islands, then land on runway 07 before the fuel runs out.', '16px system-ui, sans-serif', '#cfe3ff');
    const top = height * 0.42;
    panel(ctx, width, height, top, top + 150);
    centred(ctx, width, top + 34, 'W / S — throttle up / down        ↑ / ↓ — pitch        ← / → — bank', '16px system-ui, sans-serif', '#f5f5f0');
    centred(ctx, width, top + 62, 'A / D — rudder        MOUSE — steer        G — landing gear        F — flaps        P — pause        M — mute', '16px system-ui, sans-serif', '#f5f5f0');
    centred(ctx, width, top + 90, 'Rings pay 250 points and 12 seconds. A soft landing on the centreline pays 1,000 — 1,500 with a perfect flare.', '16px system-ui, sans-serif', '#ffd60a');
    centred(ctx, width, top + 122, 'Gear must be DOWN to land. Stall below 50 knots — keep the speed up in the turns.', '16px system-ui, sans-serif', '#ff9d8a');
    if (best > 0) centred(ctx, width, top + 178, `BEST SCORE: ${best.toLocaleString('en-US')}`, 'bold 18px system-ui, sans-serif', '#7dffb0');
    const blink = Math.sin(game.time * 4) > -0.2;
    if (blink) centred(ctx, width, height - 90, 'PRESS SPACE OR CLICK TO FLY', 'bold 24px system-ui, sans-serif', '#ffffff');
    return;
  }
  if (screen === SCREEN_PAUSED) {
    dim(ctx, width, height, 0.55);
    centred(ctx, width, height * 0.4, 'PAUSED', 'bold 52px system-ui, sans-serif', '#f5f5f0');
    centred(ctx, width, height * 0.4 + 40, 'Press P or Space to keep flying', '18px system-ui, sans-serif', '#cfe3ff');
    return;
  }
  if (screen === SCREEN_OVER) {
    dim(ctx, width, height, 0.55);
    const crashed = plane.crashed;
    centred(ctx, width, height * 0.3, crashed ? 'CRASHED' : "TIME'S UP", 'bold 56px system-ui, sans-serif', '#ff6b5e');
    if (crashReason) centred(ctx, width, height * 0.3 + 40, crashReason, '18px system-ui, sans-serif', '#f5f5f0');
    centred(ctx, width, height * 0.3 + 86, `SCORE ${course.score.toLocaleString('en-US')}   •   RINGS ${course.ringsHit}/8`, 'bold 20px system-ui, sans-serif', '#ffd60a');
    if (course.score >= best && course.score > 0) {
      centred(ctx, width, height * 0.3 + 120, 'NEW BEST SCORE!', 'bold 20px system-ui, sans-serif', '#7dffb0');
    }
    centred(ctx, width, height - 90, 'PRESS SPACE OR CLICK TO FLY AGAIN', 'bold 22px system-ui, sans-serif', '#ffffff');
    return;
  }
  if (screen === SCREEN_COMPLETE) {
    dim(ctx, width, height, 0.45);
    centred(ctx, width, height * 0.28, 'MISSION COMPLETE', 'bold 54px system-ui, sans-serif', '#7dffb0');
    centred(ctx, width, height * 0.28 + 44, 'All eight rings flown — and Langit-7 is down safe on runway 07.', '18px system-ui, sans-serif', '#f5f5f0');
    centred(ctx, width, height * 0.28 + 92, `FINAL SCORE  ${course.score.toLocaleString('en-US')}`, 'bold 26px system-ui, sans-serif', '#ffd60a');
    centred(ctx, width, height * 0.28 + 126, `Rings ${course.ringsHit}/8  •  Fuel left ${Math.round(plane.fuel)}%  •  Time left ${Math.max(0, Math.ceil(course.timeLeft))}s`, '17px system-ui, sans-serif', '#cfe3ff');
    if (course.score >= best && course.score > 0) {
      centred(ctx, width, height * 0.28 + 160, 'NEW BEST SCORE!', 'bold 20px system-ui, sans-serif', '#7dffb0');
    }
    centred(ctx, width, height - 90, 'PRESS SPACE OR CLICK TO FLY AGAIN', 'bold 22px system-ui, sans-serif', '#ffffff');
  }
}
