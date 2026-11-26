// Sky Courier — the cockpit: a lit instrument panel, the HUD readouts and
// the messages the pilot reads. Everything is drawn on the canvas so it is
// in every screenshot exactly as the pilot sees it.
import { FUEL } from './config.js';
import { clamp, degToRad, radToDeg } from './math3d.js';
import { feet, headingDeg, knots } from './plane.js';
import { currentTarget, nextRingTarget } from './missions.js';

const PANEL_H = 132;

/** The lit instrument panel across the bottom of the screen. */
export function drawPanel(ctx, width, height, plane, course, time) {
  const y0 = height - PANEL_H;
  // Panel body.
  const grad = ctx.createLinearGradient(0, y0, 0, height);
  grad.addColorStop(0, '#23262e');
  grad.addColorStop(1, '#14161b');
  ctx.fillStyle = grad;
  ctx.fillRect(0, y0, width, PANEL_H);
  ctx.fillStyle = '#3a3f4a';
  ctx.fillRect(0, y0, width, 3);
  // Screws.
  ctx.fillStyle = '#565d6b';
  for (const x of [14, width - 14]) {
    ctx.beginPath();
    ctx.arc(x, y0 + 14, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  const cx = width / 2;
  // Digital flight data, big enough to read at a glance (and in a screenshot).
  const alt = Math.round(feet(plane));
  const spd = Math.round(knots(plane));
  const hdg = Math.round(headingDeg(plane));
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#7dffb0';
  ctx.font = 'bold 26px "SF Mono", Consolas, monospace';
  ctx.fillText(`ALT ${alt.toLocaleString('en-US')} FT`, 24, y0 + 40);
  ctx.fillText(`SPD ${spd} KT`, 24, y0 + 74);
  ctx.fillStyle = '#ffd60a';
  ctx.fillText(`HDG ${String(hdg).padStart(3, '0')}°`, 24, y0 + 108);
  // Vertical speed.
  const vs = plane.verticalSpeed * 196.85; // m/s to ft/min
  ctx.fillStyle = vs < -500 ? '#ff7a6b' : '#cfe3ff';
  ctx.font = 'bold 15px "SF Mono", Consolas, monospace';
  ctx.fillText(`V/S ${vs >= 0 ? '+' : ''}${Math.round(vs)} FPM`, 24, y0 + 126);

  // Dials: airspeed (left of centre), attitude (centre), altimeter (right).
  drawAirspeedDial(ctx, cx - 190, y0 + PANEL_H / 2 + 4, 46, plane);
  drawAttitude(ctx, cx, y0 + PANEL_H / 2 + 4, 52, plane);
  drawAltimeterDial(ctx, cx + 190, y0 + PANEL_H / 2 + 4, 46, plane);

  // Fuel + throttle bars on the right.
  const barX = width - 150;
  drawVerticalGauge(ctx, barX, y0 + 16, 16, PANEL_H - 32, plane.fuel / FUEL.capacity, 'FUEL', fuelColor(plane.fuel));
  drawVerticalGauge(ctx, barX + 34, y0 + 16, 16, PANEL_H - 32, plane.throttle, 'THR', '#7db8e0');
  // Gear and flaps lights.
  drawLamp(ctx, barX + 78, y0 + 26, plane.gearDown, 'GEAR');
  drawLamp(ctx, barX + 78, y0 + 62, plane.flaps, 'FLAPS');
  // Stall warning blinks when the wing stops flying.
  if (plane.speed < 26 && !plane.onGround) {
    const blink = Math.sin(time * 10) > 0;
    ctx.fillStyle = blink ? '#ff4d3d' : '#7a1f16';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('STALL', barX + 78, y0 + 104);
  }
  ctx.textAlign = 'left';
}

function fuelColor(fuel) {
  if (fuel < FUEL.reserveCritical) return '#ff4d3d';
  if (fuel < FUEL.reserveWarn) return '#ffb020';
  return '#37d67a';
}

function drawVerticalGauge(ctx, x, y, w, h, fraction, label, color) {
  ctx.fillStyle = '#0c0e12';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#4a505c';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  const fillH = Math.max(0, h * clamp(fraction, 0, 1));
  ctx.fillStyle = color;
  ctx.fillRect(x + 2, y + h - fillH, w - 4, fillH);
  ctx.fillStyle = '#cfe3ff';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, x + w / 2, y + h + 12);
  ctx.textAlign = 'left';
}

function drawLamp(ctx, x, y, on, label) {
  ctx.beginPath();
  ctx.arc(x, y, 7, 0, Math.PI * 2);
  ctx.fillStyle = on ? '#37d67a' : '#3a3f4a';
  ctx.fill();
  ctx.strokeStyle = '#20242c';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#cfe3ff';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(label, x + 12, y + 4);
}

function dialFace(ctx, x, y, r, label) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = '#0e1116';
  ctx.fill();
  ctx.strokeStyle = '#8b93a3';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#cfe3ff';
  ctx.font = 'bold 10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, x, y + r - 8);
  ctx.textAlign = 'left';
}

function drawAirspeedDial(ctx, x, y, r, plane) {
  dialFace(ctx, x, y, r, 'KNOTS');
  const spd = knots(plane);
  const angle = degToRad(-120 + clamp(spd / 180, 0, 1) * 240);
  drawNeedle(ctx, x, y, r - 8, angle, '#7dffb0');
  ctx.fillStyle = '#7dffb0';
  ctx.font = 'bold 13px "SF Mono", Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(String(Math.round(spd)), x, y + 16);
  ctx.textAlign = 'left';
}

function drawAltimeterDial(ctx, x, y, r, plane) {
  dialFace(ctx, x, y, r, 'FEET');
  const alt = feet(plane);
  const angle = degToRad(-120 + clamp((alt % 1000) / 1000, 0, 1) * 240);
  drawNeedle(ctx, x, y, r - 8, angle, '#ffd60a');
  ctx.fillStyle = '#ffd60a';
  ctx.font = 'bold 12px "SF Mono", Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(String(Math.round(alt / 100) * 100), x, y + 16);
  ctx.textAlign = 'left';
}

function drawNeedle(ctx, x, y, len, angle, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(0, 6);
  ctx.lineTo(0, -len);
  ctx.stroke();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#e8ecf2';
  ctx.fill();
}

/** Artificial horizon: sky and ground split by pitch, rolled by bank. */
function drawAttitude(ctx, x, y, r, plane) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(x, y);
  ctx.rotate(-plane.roll);
  const pitchShift = clamp(plane.pitch, -0.6, 0.6) * r * 1.1;
  ctx.fillStyle = '#2f7fb8';
  ctx.fillRect(-r - 2, -r - 2 - pitchShift, r * 2 + 4, r + 2 + pitchShift);
  ctx.fillStyle = '#8a6b46';
  ctx.fillRect(-r - 2, pitchShift, r * 2 + 4, r + 2);
  ctx.strokeStyle = '#f5f5f0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-r, pitchShift);
  ctx.lineTo(r, pitchShift);
  ctx.stroke();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = '#8b93a3';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Fixed wings marker.
  ctx.strokeStyle = '#ffd60a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - r + 8, y);
  ctx.lineTo(x - 10, y);
  ctx.moveTo(x + 10, y);
  ctx.lineTo(x + r - 8, y);
  ctx.stroke();
  ctx.fillStyle = '#cfe3ff';
  ctx.font = 'bold 10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ATT', x, y + r - 8);
  ctx.textAlign = 'left';
}

// --- Top HUD ------------------------------------------------------------------
/** Mission card, compass tape and score across the top of the screen. */
export function drawHud(ctx, width, height, plane, course, best, time) {
  // Mission card (top left).
  const ring = nextRingTarget(course);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(12, 16, 22, 0.62)';
  roundRect(ctx, 12, 12, 300, 74, 10);
  ctx.fill();
  ctx.fillStyle = '#f5f5f0';
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillText(ring ? `MISSION: FLY RING ${ring.index + 1} OF 8` : 'MISSION: LAND ON RUNWAY 07', 24, 36);
  ctx.fillStyle = '#ffd60a';
  ctx.font = 'bold 14px system-ui, sans-serif';
  const target = currentTarget(course);
  const dist = Math.round(Math.hypot(plane.pos.x - target.pos.x, plane.pos.z - target.pos.z));
  ctx.fillText(`NEXT: ${target.kind === 'ring' ? `RING ${ring.index + 1}` : 'RUNWAY 07'}  •  ${dist} m`, 24, 58);
  ctx.fillStyle = '#7dffb0';
  ctx.fillText(`RINGS ${course.ringsHit}/8   •   TIME ${Math.max(0, Math.ceil(course.timeLeft))}s`, 24, 78);

  // Score (top right).
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(12, 16, 22, 0.62)';
  roundRect(ctx, width - 222, 12, 210, 74, 10);
  ctx.fill();
  ctx.fillStyle = '#f5f5f0';
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillText(`SCORE  ${course.score.toLocaleString('en-US')}`, width - 24, 36);
  ctx.fillStyle = '#9fb2c8';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.fillText(`BEST  ${Math.max(best, course.score).toLocaleString('en-US')}`, width - 24, 58);
  ctx.fillStyle = '#ffd60a';
  ctx.fillText('SKY COURIER — KEPULAUAN RUN', width - 24, 78);
  ctx.textAlign = 'left';

  // Compass tape (top centre).
  drawCompass(ctx, width / 2, 12, 340, plane);

  // Centre flight-path marker: a small ring the pilot flies through the sky with.
  const cx = width / 2;
  const cy = (height - PANEL_H) / 2 + 10;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 12, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - 20, cy);
  ctx.lineTo(cx - 13, cy);
  ctx.moveTo(cx + 13, cy);
  ctx.lineTo(cx + 20, cy);
  ctx.moveTo(cx, cy - 20);
  ctx.lineTo(cx, cy - 13);
  ctx.moveTo(cx, cy + 13);
  ctx.lineTo(cx, cy + 20);
  ctx.stroke();
}

function drawCompass(ctx, cx, y, w, plane) {
  const hdg = headingDeg(plane);
  ctx.fillStyle = 'rgba(12, 16, 22, 0.62)';
  roundRect(ctx, cx - w / 2, y, w, 40, 10);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  roundRect(ctx, cx - w / 2, y, w, 40, 10);
  ctx.clip();
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  const pxPerDeg = w / 120;
  for (let d = -60; d <= 60; d += 5) {
    const deg = (Math.round(hdg) + d + 360) % 360;
    const x = cx + d * pxPerDeg;
    const major = deg % 30 === 0;
    ctx.strokeStyle = major ? '#f5f5f0' : '#7d8aa0';
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x, y + 26);
    ctx.lineTo(x, y + (major ? 14 : 20));
    ctx.stroke();
    if (major) {
      const label = deg === 0 ? 'N' : deg === 90 ? 'E' : deg === 180 ? 'S' : deg === 270 ? 'W' : String(deg).padStart(3, '0');
      ctx.fillStyle = '#f5f5f0';
      ctx.fillText(label, x, y + 38);
    }
  }
  ctx.restore();
  // Centre caret: the heading right now.
  ctx.fillStyle = '#ffd60a';
  ctx.beginPath();
  ctx.moveTo(cx - 7, y + 2);
  ctx.lineTo(cx + 7, y + 2);
  ctx.lineTo(cx, y + 12);
  ctx.closePath();
  ctx.fill();
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillStyle = '#ffd60a';
  ctx.fillText(String(Math.round(hdg)).padStart(3, '0'), cx, y + 38);
}

/** A transient banner message in the middle of the screen. */
export function drawMessage(ctx, width, height, text, kind) {
  if (!text) return;
  const y = 110;
  ctx.font = 'bold 24px system-ui, sans-serif';
  const w = ctx.measureText(text).width + 36;
  ctx.fillStyle = kind === 'bad' ? 'rgba(160, 30, 20, 0.85)' : 'rgba(12, 60, 30, 0.85)';
  roundRect(ctx, (width - w) / 2, y, w, 42, 10);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(text, width / 2, y + 29);
  ctx.textAlign = 'left';
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export { PANEL_H };
