// Tiny Web Audio score: one synthesized loop per scene, no audio files.
// window.Music.toggle() (call from a tap — browsers block audio until a gesture), .scene(name), .on
(function () {
  const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
  const midi = (n) => { const m = /^([A-G]#?)(\d)$/.exec(n); return m ? 12 * (+m[2] + 1) + NOTE[m[1]] : 0; };
  const seq = (s) => s.trim().split(/\s+/).map((x) => (x === '.' ? 0 : midi(x)));
  const hits = (s) => s.trim().split(/\s+/);

  // 32 sixteenth-note steps per loop (two bars)
  const TRACKS = {
    // ch1: tiptoeing minor walk, brushed hats
    sneak: {
      bpm: 100, leadType: 'square', leadVol: 0.07, leadLen: 0.12,
      bass: seq('E2 . . . . . G2 . G#2 . . . A2 . . . E2 . . . . . G2 . G#2 . . . B2 . A#2 .'),
      lead: seq('. . . . . . . . . . . . E5 . D#5 . . . . . . . . . . . . . B4 . . .'),
      drums: hits('h . . . h . . . h . . . h . . . h . . . h . . . h . . . h . h .'),
    },
    // ch2: clock ticking over a low pulse
    heist: {
      bpm: 90, leadType: 'triangle', leadVol: 0.12, leadLen: 0.35,
      bass: seq('D2 . D2 . D2 . D2 . D2 . D2 . D2 . F2 . F2 . F2 . F2 . E2 . E2 . E2 . E2 .'),
      lead: seq('. . . . . . . . A4 . . . . . . . . . . . . . . . C5 . . . A#4 . . .'),
      drums: hits('w . . . w . . . w . . . w . . . w . . . w . . . w . . . w . . .'),
    },
    // ch3: silly galop
    chase: {
      bpm: 150, leadType: 'square', leadVol: 0.06, leadLen: 0.1,
      bass: seq('F2 . C3 . F2 . C3 . A#1 . F2 . A#1 . F2 . C2 . G2 . C2 . G2 . F2 . C3 . F2 . C3 .'),
      lead: seq('C5 A4 F4 A4 C5 . F5 . D5 A#4 F4 A#4 D5 . A#4 . C5 G4 E4 G4 C5 . E5 . F5 . C5 . A4 . F4 .'),
      drums: hits('k . h . s . h . k . h . s . h . k . h . s . h . k k h . s . s s'),
    },
    // ch4 + epilogue: warm arpeggios
    love: {
      bpm: 84, leadType: 'sine', leadVol: 0.12, leadLen: 0.5,
      bass: seq('C3 . . . . . . . A2 . . . . . . . F2 . . . . . . . G2 . . . . . . .'),
      lead: seq('C5 . G5 . E5 . G5 . A4 . E5 . C5 . E5 . F4 . C5 . A4 . C5 . G4 . D5 . B4 . D5 .'),
      drums: hits('k . . . . . . . h . . . . . . . k . . . . . . . h . . . . . . .'),
    },
  };

  let ctx, master, noise, timer, step = 0, nextT = 0, playing = null, want = 'sneak', on = false;

  function init() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    document.addEventListener('visibilitychange', () => { if (on) document.hidden ? ctx.suspend() : ctx.resume(); });
  }

  function tone(type, freq, t, len, vol) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + len + 0.05);
    return o;
  }
  function hiss(t, len, vol, hp) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise;
    f.type = 'highpass';
    f.frequency.value = hp;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    s.connect(f).connect(g).connect(master);
    s.start(t);
    s.stop(t + len);
  }
  const hz = (m) => 440 * 2 ** ((m - 69) / 12);

  function play(tr, i, t) {
    if (tr.bass[i]) tone('triangle', hz(tr.bass[i]), t, 0.22, 0.32);
    if (tr.lead[i]) tone(tr.leadType, hz(tr.lead[i]), t, tr.leadLen, tr.leadVol);
    const d = tr.drums[i];
    if (d === 'k') { const o = tone('sine', 120, t, 0.18, 0.5); o.frequency.exponentialRampToValueAtTime(45, t + 0.15); }
    else if (d === 's') hiss(t, 0.12, 0.18, 1500);
    else if (d === 'h') hiss(t, 0.04, 0.07, 7000);
    else if (d === 'w') tone('triangle', 1600, t, 0.05, 0.12);
  }

  // lookahead scheduler; the track only changes on a bar line so switches stay in time
  function tick() {
    while (nextT < ctx.currentTime + 0.12) {
      if (step % 16 === 0 && playing !== want) { playing = want; step = 0; }
      const tr = TRACKS[playing];
      play(tr, step, nextT);
      nextT += 60 / tr.bpm / 4;
      step = (step + 1) % 32;
    }
  }

  window.Music = {
    get on() { return on; },
    scene(name) { if (TRACKS[name]) want = name; },
    toggle() {
      if (!ctx) init();
      on = !on;
      if (on) {
        ctx.resume();
        nextT = ctx.currentTime + 0.05;
        if (!timer) timer = setInterval(tick, 25);
      }
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(on ? 0.5 : 0, ctx.currentTime, 0.15);
      if (!on) setTimeout(() => { if (!on) { clearInterval(timer); timer = null; ctx.suspend(); } }, 600);
      return on;
    },
  };
})();
