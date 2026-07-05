/* ============================================================
 * RETROPOLIS — Chiptune-Audio v2 (WebAudio, komplett generativ)
 * Zwei Songs mit Tag/Nacht-Varianten, Ambient-Layer
 * (Wasserrauschen, Verkehrssummen), Lautstärkeregler.
 * ============================================================ */
'use strict';

const Sound = (() => {
  let ctx = null;
  let sfxOn = true, musicOn = true;
  let musicVol = 0.5, sfxVol = 0.7;         // 0..1 (Regler)
  let musicTimer = null, musicStep = 0, musicGain = null;
  let songIdx = 0, loopsPlayed = 0;
  let night = false;
  let ambWater = null, ambTraffic = null;    // Ambient-Knoten {gain}

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.10 * musicVol * 2;
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
    g.gain.setValueAtTime((vol || 0.12) * sfxVol, t);
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
    g.gain.value = (vol || 0.15) * sfxVol;
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
    // 90er-Modem: Wählton, DTMF, Carrier-Kreischen, Connect
    modem: () => {
      if (!ensure()) return;
      beep(350, 0.35, 'sine', 0.06);
      beep(440, 0.35, 'sine', 0.06);
      [697, 770, 852, 941, 1209].forEach((f, i) => {
        setTimeout(() => { beep(f, 0.09, 'sine', 0.08); beep(1336, 0.09, 'sine', 0.08); }, 400 + i * 120);
      });
      setTimeout(() => { beep(2100, 0.5, 'square', 0.04); beep(1300, 0.5, 'sawtooth', 0.03, 600); }, 1100);
      setTimeout(() => noise(0.55, 0.06), 1250);
      setTimeout(() => { beep(1650, 0.18, 'square', 0.06); beep(980, 0.22, 'square', 0.05); }, 1850);
    },
    shutter: () => { beep(1800, 0.03, 'square', 0.10); noise(0.08, 0.10); },
  };

  // ---------- Musik: 2 Songs × Tag/Nacht ----------
  // Frequenzen; 0 = Pause. Bass läuft je 4 Steps.
  const SONGS = [
    { // Song A: „Hauptstraße“ (Dur, fröhlich)
      tempo: 170,
      bass: [110, 110, 87.3, 87.3, 98, 98, 73.4, 82.4],
      lead: [
        440, 0, 523, 587, 0, 523, 440, 0,
        392, 440, 0, 349, 392, 0, 330, 0,
        440, 523, 587, 659, 0, 587, 523, 440,
        0, 392, 440, 523, 440, 0, 392, 0,
      ],
      nightLead: [
        440, 0, 0, 523, 0, 0, 440, 0,
        392, 0, 0, 349, 0, 0, 330, 0,
        440, 0, 523, 0, 587, 0, 523, 0,
        0, 392, 0, 440, 0, 0, 392, 0,
      ],
    },
    { // Song B: „Flussufer“ (moll-pentatonisch, ruhiger)
      tempo: 195,
      bass: [82.4, 82.4, 98, 98, 110, 110, 73.4, 73.4],
      lead: [
        330, 0, 392, 440, 0, 392, 330, 294,
        0, 330, 392, 0, 440, 494, 440, 0,
        587, 0, 494, 440, 0, 392, 330, 0,
        294, 330, 0, 392, 330, 0, 294, 0,
      ],
      nightLead: [
        330, 0, 0, 392, 0, 0, 330, 0,
        0, 294, 0, 0, 330, 0, 0, 0,
        440, 0, 0, 392, 0, 0, 330, 0,
        0, 294, 0, 330, 0, 0, 0, 0,
      ],
    },
  ];

  function musicTick() {
    if (!ctx || !musicOn) return;
    const t = ctx.currentTime;
    const song = SONGS[songIdx];
    const step = musicStep++;
    const lead = night ? song.nightLead : song.lead;
    // Songwechsel nach 4 Loops
    if (step > 0 && step % lead.length === 0) {
      loopsPlayed++;
      if (loopsPlayed >= 4) {
        loopsPlayed = 0;
        songIdx = (songIdx + 1) % SONGS.length;
        restartTimer();
        return;
      }
    }
    if (step % 4 === 0) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = song.bass[(step / 4) % song.bass.length];
      g.gain.setValueAtTime(night ? 0.35 : 0.5, t);
      g.gain.exponentialRampToValueAtTime(0.01, t + 0.4);
      o.connect(g); g.connect(musicGain);
      o.start(t); o.stop(t + 0.45);
    }
    const f = lead[step % lead.length];
    if (f > 0) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = night ? 'triangle' : 'square';   // nachts weicher
      o.frequency.value = f;
      g.gain.setValueAtTime(night ? 0.20 : 0.16, t);
      g.gain.exponentialRampToValueAtTime(0.01, t + (night ? 0.30 : 0.18));
      o.connect(g); g.connect(musicGain);
      o.start(t); o.stop(t + 0.35);
    }
    if (!night && step % 2 === 1) { // Hi-Hat nur tagsüber
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

  function restartTimer() {
    if (musicTimer) clearInterval(musicTimer);
    musicTimer = setInterval(musicTick, SONGS[songIdx].tempo * (night ? 1.25 : 1));
  }
  function startMusic() {
    if (!ensure() || musicTimer) return;
    restartTimer();
  }
  function stopMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  }

  // ---------- Ambient: Wasserrauschen + Verkehrssummen ----------
  function makeLoopNoise(filterType, freq) {
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { // gefiltertes Rauschen (weich)
      const w = Math.random() * 2 - 1;
      last = last * 0.96 + w * 0.04;
      d[i] = last * 6;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filterType; f.frequency.value = freq;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(ctx.destination);
    src.start();
    return { gain: g };
  }

  // Wird ~1×/s von der UI gerufen: Wasseranteil im Bild, Anzahl Autos
  function ambient(waterFrac, carCount) {
    if (!ctx || !musicOn) {
      if (ambWater) ambWater.gain.gain.value = 0;
      if (ambTraffic) ambTraffic.gain.gain.value = 0;
      return;
    }
    if (!ambWater) ambWater = makeLoopNoise('lowpass', 600);
    if (!ambTraffic) ambTraffic = makeLoopNoise('bandpass', 140);
    const t = ctx.currentTime;
    ambWater.gain.gain.linearRampToValueAtTime(Math.min(0.06, waterFrac * 0.12) * musicVol * 2, t + 0.5);
    ambTraffic.gain.gain.linearRampToValueAtTime(Math.min(0.05, carCount / 40 * 0.05) * musicVol * 2, t + 0.5);
  }

  return {
    sfx,
    unlock: ensure,
    ambient,
    get sfxOn() { return sfxOn; },
    get musicOn() { return musicOn; },
    setNight(n) {
      if (night !== n) { night = n; if (musicTimer) restartTimer(); }
    },
    setMusicVol(v) {
      musicVol = Math.max(0, Math.min(1, v));
      if (musicGain) musicGain.gain.value = 0.10 * musicVol * 2;
    },
    setSfxVol(v) { sfxVol = Math.max(0, Math.min(1, v)); },
    get musicVol() { return musicVol; },
    get sfxVol() { return sfxVol; },
    toggleSfx() { sfxOn = !sfxOn; return sfxOn; },
    toggleMusic() {
      musicOn = !musicOn;
      if (musicOn) startMusic(); else { stopMusic(); ambient(0, 0); }
      return musicOn;
    },
    startMusic,
  };
})();
