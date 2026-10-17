import type { ThemeId } from "@/game/content";

type Bus = {
  ctx: AudioContext;
  master: GainNode;
  music: GainNode;
  sfx: GainNode;
  noise: AudioBuffer;
};

let bus: Bus | null = null;
let muted = false;
const live: AudioScheduledSourceNode[] = [];

function AC(): typeof AudioContext {
  return window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
}

function makeNoise(ctx: AudioContext) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

export function unlockAudio() {
  const Ctor = AC();
  if (!Ctor) return;
  if (!bus) {
    const ctx = new Ctor({ latencyHint: "interactive" });
    const master = ctx.createGain();
    const music = ctx.createGain();
    const sfx = ctx.createGain();
    music.connect(master);
    sfx.connect(master);
    master.connect(ctx.destination);
    master.gain.value = muted ? 0 : 0.85;
    music.gain.value = 0.7;
    sfx.gain.value = 0.8;
    bus = { ctx, master, music, sfx, noise: makeNoise(ctx) };
  }
  if (bus.ctx.state === "suspended") void bus.ctx.resume();
}

export function setMuted(next: boolean) {
  muted = next;
  if (!bus) return;
  bus.master.gain.setTargetAtTime(next ? 0 : 0.85, bus.ctx.currentTime, 0.02);
}

export function resumeAudio() {
  if (bus && bus.ctx.state === "suspended") void bus.ctx.resume();
}

function tone(freq: number, dur: number, type: OscillatorType, gain: number, when: number, dest: GainNode) {
  if (!bus) return;
  const osc = bus.ctx.createOscillator();
  const g = bus.ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, when);
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(Math.max(0.001, gain), when + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  osc.connect(g);
  g.connect(dest);
  osc.start(when);
  osc.stop(when + dur + 0.02);
  live.push(osc);
  osc.onended = () => {
    osc.disconnect();
    g.disconnect();
  };
}

function noiseBurst(dur: number, gain: number) {
  if (!bus) return;
  const src = bus.ctx.createBufferSource();
  src.buffer = bus.noise;
  const filter = bus.ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 420;
  const g = bus.ctx.createGain();
  const now = bus.ctx.currentTime;
  g.gain.setValueAtTime(gain, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(bus.sfx);
  src.start(now);
  src.stop(now + dur);
}

const N: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function freq(name: string) {
  const m = /^([A-G])(#?)(\d)$/.exec(name);
  if (!m) return 440;
  const semi = N[m[1]] + (m[2] ? 1 : 0) + (Number(m[3]) - 4) * 12;
  return 440 * Math.pow(2, (semi - 9) / 12);
}

const THEMES: Record<ThemeId, string[]> = {
  kleine: [
    "G4", "D4", "G4", "D4", "G4", "D5", "B4", "G4",
    "A4", "F#4", "G4", "E4", "D4", "B3", "C4", "D4",
    "G4", "D4", "G4", "B4", "D5", "B4", "G4", "D4",
    "C5", "B4", "A4", "G4", "F#4", "G4", "A4", "G4",
  ],
  figaro: [
    "D4", "D4", "D4", "D4", "A4", "A4", "A4", "F#4",
    "G4", "G4", "G4", "E4", "A4", "A4", "D5", "A4",
    "B4", "B4", "G4", "B4", "D5", "B4", "G4", "E4",
    "A4", "F#4", "G4", "E4", "D4", "F#4", "A4", "D5",
  ],
  cancan: [
    "G4", "G4", "E4", "G4", "A4", "A4", "F4", "A4",
    "B4", "G4", "D5", "B4", "A4", "G4", "F#4", "G4",
    "D5", "D5", "B4", "G4", "D5", "D5", "C5", "A4",
    "B4", "G4", "A4", "F#4", "G4", "D4", "G4", "G4",
  ],
  rain: [
    "E4", "G4", "B4", "G4", "D4", "F#4", "A4", "F#4",
    "C4", "E4", "G4", "E4", "B3", "D4", "F#4", "D4",
    "E4", "G4", "B4", "D5", "B4", "G4", "E4", "D4",
    "C4", "E4", "G4", "B4", "A4", "G4", "F#4", "E4",
  ],
  andante: [
    "C4", "E4", "G4", "E4", "F4", "A4", "G4", "E4",
    "D4", "F4", "A4", "F4", "E4", "G4", "B4", "G4",
    "C5", "G4", "E4", "C4", "D4", "B3", "C4", "E4",
    "F4", "A4", "G4", "E4", "D4", "B3", "C4", "C4",
  ],
};

export function stopMusic() {
  for (const node of live) {
    try {
      node.stop();
    } catch {
      /* already stopped */
    }
  }
  live.length = 0;
}

export function playTheme(theme: ThemeId, grace: number, hurried: boolean) {
  if (!bus) return;
  stopMusic();
  const notes = THEMES[theme];
  const eighth = hurried ? 0.17 : grace < 40 ? 0.23 : 0.2;
  const now = bus.ctx.currentTime + 0.06;
  const harmony = grace >= 70;
  notes.forEach((name, i) => {
    if (grace < 42 && i % 5 === 4) return;
    const when = now + i * eighth;
    const f = freq(name);
    tone(f, eighth * 0.92, "square", 0.07, when, bus!.music);
    tone(f / 2, eighth * 0.92, "triangle", 0.05, when, bus!.music);
    if (harmony) tone(f * 1.25, eighth * 0.7, "triangle", 0.03, when, bus!.music);
  });
}

export function sfxHop() {
  if (!bus) return;
  const now = bus.ctx.currentTime;
  tone(520, 0.09, "square", 0.05, now, bus.sfx);
  tone(300, 0.1, "triangle", 0.04, now, bus.sfx);
}

export function sfxLane() {
  if (!bus) return;
  tone(680 + Math.random() * 40, 0.045, "triangle", 0.04, bus.ctx.currentTime, bus.sfx);
}

export function sfxCoin() {
  if (!bus) return;
  const now = bus.ctx.currentTime;
  tone(880, 0.06, "square", 0.05, now, bus.sfx);
  tone(1320, 0.08, "square", 0.04, now + 0.05, bus.sfx);
}

export function sfxHit() {
  noiseBurst(0.12, 0.18);
  if (!bus) return;
  tone(140, 0.14, "sawtooth", 0.05, bus.ctx.currentTime, bus.sfx);
}

export function sfxLand() {
  if (!bus) return;
  tone(180, 0.05, "triangle", 0.03, bus.ctx.currentTime, bus.sfx);
}

const PHRASE = [523, 587, 659, 698, 784, 880, 988, 1046];

export function sfxNote(step: number) {
  if (!bus) return;
  const f = PHRASE[Math.max(0, Math.min(7, step - 1))];
  tone(f, 0.09, "square", 0.05, bus.ctx.currentTime, bus.sfx);
}

export function sfxPhrase() {
  if (!bus) return;
  const now = bus.ctx.currentTime;
  const dest = bus.sfx;
  [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.14, "square", 0.055, now + i * 0.06, dest));
}
