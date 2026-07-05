/* ============================================================
 * RETROPOLIS — Chiptune-Audio (WebAudio, komplett generativ)
 * SFX + Hintergrundmusik im 16-Bit-Stil, keine Audiodateien.
 * ============================================================ */
'use strict';

const Sound = (() => {
  let ctx = null;
  let sfxOn = true, musicOn = true;
  let musicTimer = null, musicStep = 0, musicGain = null;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.10;
      musicGain.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function beep(freq, dur, type, vol, slide) {
    if (!sfxOn || !ensure()) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol || 0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, vol) {
    if (!sfxOn || !ensure()) return;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = vol || 0.15;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 900;
    src.connect(f); f.connect(g); g.connect(ctx.destination);
    src.start(t);
  }

  // ---------- SFX ----------
  const sfx = {
    place:  () => { beep(440, 0.08, 'square', 0.10); beep(660, 0.10, 'square', 0.10); },
    road:   () => beep(220, 0.05, 'square', 0.08),
    wire:   () => beep(330, 0.05, 'triangle', 0.09),
    zone:   () => beep(520, 0.06, 'triangle', 0.09),
    dozer:  () => noise(0.18, 0.14),
    error:  () => { beep(140, 0.15, 'sawtooth', 0.10); beep(110, 0.18, 'sawtooth', 0.08); },
    cash:   () => { beep(880, 0.07, 'square', 0.09); setTimeout(() => beep(1175, 0.10, 'square', 0.09), 70); },
    click:  () => beep(700, 0.03, 'square', 0.05),
    fire:   () => { noise(0.4, 0.12); beep(180, 0.3, 'sawtooth', 0.06, -80); },
    milestone: () => {
      [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.16, 'square', 0.10), i * 110));
    },
  };

  // ---------- Musik: einfacher Sequenzer (Pentatonik-Loop) ----------
  const BASS = [110, 110, 87.3, 87.3, 98, 98, 73.4, 82.4];
  const LEAD = [
    440, 0, 523, 587, 0, 523, 440, 0,
    392, 440, 0, 349, 392, 0, 330, 0,
    440, 523, 587, 659, 0, 587, 523, 440,
    0, 392, 440, 523, 440, 0, 392, 0,
  ];

  function musicTick() {
    if (!ctx || !musicOn) return;
    const t = ctx.currentTime;
    const step = musicStep++;
    // Bass (alle 4 Steps)
    if (step % 4 === 0) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = BASS[(step / 4) % BASS.length];
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.01, t + 0.4);
      o.connect(g); g.connect(musicGain);
      o.start(t); o.stop(t + 0.45);
    }
    // Melodie
    const f = LEAD[step % LEAD.length];
    if (f > 0) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.16, t);
      g.gain.exponentialRampToValueAtTime(0.01, t + 0.18);
      o.connect(g); g.connect(musicGain);
      o.start(t); o.stop(t + 0.2);
    }
    // Hi-Hat-artiges Ticken
    if (step % 2 === 1) {
      const len = Math.floor(ctx.sampleRate * 0.03);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) * 0.4;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain(); g.gain.value = 0.35;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 6000;
      src.connect(hp); hp.connect(g); g.connect(musicGain);
      src.start(t);
    }
  }

  function startMusic() {
    if (!ensure() || musicTimer) return;
    musicTimer = setInterval(musicTick, 170);
  }
  function stopMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  }

  return {
    sfx,
    unlock: ensure,
    get sfxOn() { return sfxOn; },
    get musicOn() { return musicOn; },
    toggleSfx() { sfxOn = !sfxOn; return sfxOn; },
    toggleMusic() {
      musicOn = !musicOn;
      if (musicOn) startMusic(); else stopMusic();
      return musicOn;
    },
    startMusic,
  };
})();
