// Sky Courier — sound, synthesised live with WebAudio: an engine hum that
// follows the throttle, wind that rises with speed, a chime for each ring and
// a thud for a hard landing. No audio files, no network, nothing to load.
// Everything starts on the first user gesture, as browsers require.
export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let windSource = null;
  let windGain = null;
  let windFilter = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (started) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      ctx = new AudioContext();
      // Engine: two detuned saws through a low-pass, pitched by throttle.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      const engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'sawtooth';
      engineOsc2.frequency.value = 58;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineOsc.connect(engineFilter);
      engineOsc2.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(ctx.destination);
      engineOsc.start();
      engineOsc2.start();
      // Wind: looped noise through a band-pass that opens with speed.
      const noiseLength = ctx.sampleRate * 2;
      const noiseBuffer = ctx.createBuffer(1, noiseLength, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < noiseLength; i += 1) data[i] = Math.random() * 2 - 1;
      windSource = ctx.createBufferSource();
      windSource.buffer = noiseBuffer;
      windSource.loop = true;
      windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 700;
      windFilter.Q.value = 0.6;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      windSource.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(ctx.destination);
      windSource.start();
      started = true;
      return true;
    } catch {
      return false;
    }
  }

  function blip(frequency, duration, type, volume, when = 0) {
    if (!ctx || muted) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    const gain = ctx.createGain();
    const start = ctx.currentTime + when;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }

  return {
    /** Call from any user gesture; safe to call repeatedly. */
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },

    setMuted(value) {
      muted = value;
      if (engineGain) engineGain.gain.value = 0;
      if (windGain) windGain.gain.value = 0;
    },

    /** Continuous engine + wind, called every frame while flying. */
    update(throttle, speed, flying) {
      if (!started || muted || !ctx) return;
      const target = flying ? 0.05 + throttle * 0.06 : 0.02;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(48 + throttle * 70, ctx.currentTime, 0.1);
      const windTarget = Math.min(0.14, (speed / 92) * 0.14);
      windGain.gain.setTargetAtTime(flying ? windTarget : 0, ctx.currentTime, 0.15);
      windFilter.frequency.setTargetAtTime(500 + speed * 12, ctx.currentTime, 0.15);
    },

    ring() {
      blip(880, 0.35, 'sine', 0.16);
      blip(1318, 0.45, 'sine', 0.12, 0.07);
    },

    touchdown() {
      blip(120, 0.25, 'triangle', 0.2);
      blip(660, 0.3, 'sine', 0.14, 0.05);
      blip(990, 0.4, 'sine', 0.12, 0.12);
    },

    crash() {
      blip(70, 0.7, 'sawtooth', 0.22);
      blip(45, 0.9, 'triangle', 0.2, 0.05);
    },

    click() {
      blip(520, 0.08, 'square', 0.06);
    },

    warning() {
      blip(440, 0.18, 'square', 0.08);
      blip(440, 0.18, 'square', 0.08, 0.22);
    },
  };
}
