import {
  GUEST_BONUS,
  ITEMS,
  KIND,
  QUEST_BONUS,
  RIDE_RATE,
  isGastspiel,
  planNight,
  resolveStage,
  type Kind,
  type ResolvedStage,
  type StageId,
} from "@/game/content";
import {
  playTheme,
  resumeAudio,
  setMuted,
  sfxCoin,
  sfxHit,
  sfxHop,
  sfxLand,
  sfxLane,
  sfxNote,
  sfxPhrase,
  stopMusic,
  unlockAudio,
} from "@/game/audio";
import { loadSave, writeSave, type Save } from "@/game/save";

export type Snap = {
  mode: "room" | "ride" | "dance" | "recap";
  paused: boolean;
  purse: number;
  owned: string[];
  day: number;
  best: number;
  muted: boolean;
  plan: { id: StageId; title: string; quest: boolean }[];
  gastspiel: boolean;
  recap: {
    earned: number;
    hits: number;
    wipeouts: number;
    notes: number;
    onTime: boolean;
    gastspiel: boolean;
  } | null;
};

export type GameApi = {
  destroy: () => void;
  depart: () => void;
  buy: (id: string) => void;
  skipDance: () => void;
  toRoom: () => void;
  toggleMute: () => void;
  togglePause: () => void;
  holdSteady: (on: boolean) => void;
  nudge: (dir: -1 | 1) => void;
  hop: () => void;
};

const STEP = 1 / 60;
const LOOK = 42;
const HIT = 2.05;
const DANCE_LEN = 6.6;

type Note = { lane: number; meter: number; taken: boolean; prevZ: number };

type Obs = {
  lane: number;
  meter: number;
  kind: Kind;
  prevZ: number;
  resolved: boolean;
  text: string;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  alive: boolean;
};

type Floater = { x: number; y: number; text: string; life: number; alive: boolean };

type ControlsProbe = {
  getYaw: () => number;
  getSpeed: () => number;
  getLane: () => number;
  getMode: () => string;
  getScore: () => number;
  setKeys: (codes: string[]) => void;
  depart: () => void;
};

declare global {
  interface Window {
    __controlsTest?: ControlsProbe;
  }
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

const C = {
  bg: "#1a2230",
  ink: "#14181f",
  ivory: "#f4efe6",
  muted: "#b7b0a4",
  sodium: "#e6a24a",
  opera: "#c4373a",
  mint: "#6fbfa0",
  parquet: "#c4a574",
  parquetDark: "#8d6844",
  skin: "#e8b898",
  hair: "#3a2418",
  line: "#3c4a60",
};

function planOf(day: number): Snap["plan"] {
  return planNight(day).map((id) => {
    const s = resolveStage(id, day, 0, 1);
    return { id, title: s.title, quest: s.quest };
  });
}

export function blankSnap(): Snap {
  return {
    mode: "room",
    paused: false,
    purse: 0,
    owned: [],
    day: 1,
    best: 0,
    muted: false,
    plan: planOf(1),
    gastspiel: false,
    recap: null,
  };
}

export function createGame(
  canvas: HTMLCanvasElement,
  root: HTMLElement,
  onSnap: (snap: Snap) => void,
): GameApi {
  const gl = canvas.getContext("2d", { alpha: false });
  if (!gl) throw new Error("Canvas unavailable");
  const ctx = gl;

  const save = loadSave();
  let mode: Snap["mode"] = "room";
  let paused = false;
  let purse = save.purse;
  const owned = new Set(save.owned);
  let day = save.day;
  let best = save.best;
  let muted = save.muted;
  setMuted(muted);

  let stages: ResolvedStage[] = [];
  let index = 0;
  let stage: ResolvedStage | null = null;
  let obstacles: Obs[] = [];
  let notes: Note[] = [];
  let bars = 0;
  let notesCaught = 0;
  let distance = 0;
  let nightScore = 0;
  let stageScore = 0;
  let hits = 0;
  let wipeouts = 0;
  let banked = true;
  let recap: Snap["recap"] = null;

  let lane = 1;
  let laneTarget = 1;
  let queued: number | null = null;
  let jumpY = 0;
  let vy = 0;
  let grounded = true;
  let coyote = 0;
  let hopBuffer = 0;
  let airborne = false;
  let grace = 100;
  let danceGrace = 100;
  let invuln = 0;
  let stumble = 0;
  let wipe = 0;
  let combo = 0;
  let intro = 0;
  let titleT = 0;
  let ending = false;
  let speedNow = 0;
  let wellFed = false;
  let fedPending = false;
  let rideTime = 0;
  let cruise = 0;
  let hurried = true;
  let danceT = 0;
  let squash = 1;
  let squashTarget = 1;
  let trauma = 0;
  let hitStop = 0;
  let riderFlash = 0;
  let steadyHeld = false;
  let steadyPulse = 0;
  let time = 0;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const held = new Set<string>();
  const parts: Particle[] = Array.from({ length: 48 }, () => ({
    x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, color: C.ivory, alive: false,
  }));
  const floaters: Floater[] = Array.from({ length: 12 }, () => ({
    x: 0, y: 0, text: "", life: 0, alive: false,
  }));
  const drops = Array.from({ length: 42 }, () => ({
    x: Math.random(),
    y: Math.random(),
    v: 0.4 + Math.random() * 0.8,
  }));

  let viewW = 1;
  let viewH = 1;
  let city: HTMLCanvasElement | null = null;
  let sky: CanvasGradient | null = null;
  let skyKey = "";
  const drawList: Obs[] = [];
  let raf = 0;
  let last = performance.now();
  let acc = 0;
  let trackX = 0;
  let trackY = 0;
  let tracking = false;

  function persist() {
    const next: Save = {
      version: 1,
      purse,
      owned: [...owned],
      day,
      best,
      muted,
    };
    writeSave(next);
  }

  function emit() {
    onSnap({
      mode,
      paused,
      purse,
      owned: [...owned],
      day,
      best,
      muted,
      plan: planOf(day),
      gastspiel: isGastspiel(day),
      recap,
    });
  }

  function project(laneN: number, z: number) {
    const depth = Math.pow(clamp(1 - z / LOOK, 0, 1), 0.82);
    const spread = viewW * 0.055 + depth * viewW * 0.24;
    const horizon = viewH * 0.18;
    const feet = viewH * 0.56;
    return {
      x: viewW * 0.5 + (laneN - 1) * spread,
      y: horizon + depth * (feet - horizon),
      s: 0.28 + depth * 0.82,
      depth,
    };
  }

  function burst(x: number, y: number, color: string, n: number) {
    let left = n;
    for (const p of parts) {
      if (p.alive) continue;
      p.alive = true;
      p.x = x;
      p.y = y;
      p.vx = (Math.random() - 0.5) * 90;
      p.vy = -30 - Math.random() * 80;
      p.life = p.max = 0.35 + Math.random() * 0.25;
      p.color = color;
      if (--left <= 0) break;
    }
  }

  function floater(text: string, x: number, y: number) {
    const slot = floaters.find((f) => !f.alive) ?? floaters[0];
    slot.alive = true;
    slot.text = text;
    slot.x = x;
    slot.y = y;
    slot.life = 0.8;
  }

  function jokeName(kind: Kind) {
    if (kind === "pointe") return "pointe";
    if (kind === "swan") return "swan";
    if (kind === "tuba") return "tuba";
    if (kind === "baguette") return "baguette";
    if (kind === "pigeon") return "pigeon";
    if (kind === "rival") return "rival";
    if (kind === "sign") return "not here";
    return "";
  }

  function nudge(dir: -1 | 1) {
    if (mode !== "ride" || paused || wipe > 0.2) return;
    sfxLane();
    const base = queued ?? laneTarget;
    const next = clamp(base + dir, 0, 2);
    if (Math.abs(lane - laneTarget) > 0.22) queued = next;
    else {
      laneTarget = next;
      queued = null;
    }
  }

  function queueHop() {
    if (mode !== "ride" || paused || wipe > 0) return;
    hopBuffer = 0.14;
  }

  function braking() {
    return steadyHeld || steadyPulse > 0 || held.has("KeyS") || held.has("ArrowDown");
  }

  function pressCode(code: string) {
    held.add(code);
    if (code === "Escape" || code === "KeyP") {
      togglePause();
      return;
    }
    if (code === "KeyA" || code === "ArrowLeft") nudge(-1);
    if (code === "KeyD" || code === "ArrowRight") nudge(1);
    if (code === "KeyW" || code === "ArrowUp" || code === "Space") queueHop();
  }

  function setKeys(codes: string[]) {
    const next = new Set(codes);
    for (const code of [...held]) if (!next.has(code)) held.delete(code);
    for (const code of next) if (!held.has(code)) pressCode(code);
  }

  function buildObstacles(current: ResolvedStage, night: number) {
    const rng = mulberry32(night * 10007 + current.index * 97 + current.id.charCodeAt(0) * 13);
    const list: Obs[] = [];
    const add = (laneN: number, meter: number, kind: Kind) => {
      list.push({
        lane: laneN,
        meter,
        kind,
        prevZ: 999,
        resolved: false,
        text: kind === "sign" ? current.sign : "",
      });
    };
    if (night === 1 && current.index === 0) {
      add(1, 28, "puddle");
      add(0, 54, "person");
    }
    let m = night === 1 && current.index === 0 ? 74 : 34;
    const minGap = Math.max(13, current.speed * 0.98);
    while (m < current.length - 18) {
      const gap = (current.speed * (1.15 + rng() * 0.55)) / Math.pow(current.density, 0.28);
      m += Math.max(minGap, gap);
      if (m >= current.length - 18) break;
      const two = night >= 3 && m > 70 && rng() < Math.min(0.34, 0.06 + night * 0.018);
      const joke = rng() < 0.18 && current.jokes.length > 0;
      if (joke && !two) {
        add(Math.floor(rng() * 3), m, current.jokes[Math.floor(rng() * current.jokes.length)]);
      } else if (!two && rng() < 0.42) {
        add(Math.floor(rng() * 3), m, current.ground[Math.floor(rng() * current.ground.length)]);
      } else if (!two) {
        add(Math.floor(rng() * 3), m, current.tall[Math.floor(rng() * current.tall.length)]);
      } else {
        const open = Math.floor(rng() * 3);
        for (const laneN of [0, 1, 2]) {
          if (laneN === open) continue;
          const kind =
            rng() < 0.22
              ? current.ground[Math.floor(rng() * current.ground.length)]
              : current.tall[Math.floor(rng() * current.tall.length)];
          add(laneN, m, kind);
        }
        m += minGap * 0.35;
      }
    }
    return list;
  }

  function buildNotes(current: ResolvedStage, list: Obs[], night: number) {
    const rng = mulberry32(night * 30011 + current.index * 53 + 9);
    const out: Note[] = [];
    const place = (laneN: number, meter: number) => {
      out.push({ lane: laneN, meter, taken: false, prevZ: 999 });
    };
    if (night === 1 && current.index === 0) {
      place(1, 16);
      place(2, 46);
    }
    let m = night === 1 && current.index === 0 ? 68 : 22;
    while (m < current.length - 20) {
      m += 15 + rng() * 11;
      if (m >= current.length - 20) break;
      const open: number[] = [];
      for (let laneN = 0; laneN < 3; laneN++) {
        let blocked = false;
        for (const o of list) {
          if (o.lane === laneN && Math.abs(o.meter - m) < 6.5) blocked = true;
        }
        for (const n of out) {
          if (n.lane === laneN && Math.abs(n.meter - m) < 8) blocked = true;
        }
        if (!blocked) open.push(laneN);
      }
      if (open.length === 0) continue;
      place(open[Math.floor(rng() * open.length)], m);
    }
    return out;
  }

  function paintCity(current: ResolvedStage) {
    const c = document.createElement("canvas");
    c.width = 640;
    c.height = 220;
    const g = c.getContext("2d");
    if (!g) return c;
    const rng = mulberry32(current.id.length * 50 + current.index * 19 + 3);
    let x = 0;
    while (x < 640) {
      const w = 40 + Math.floor(rng() * 58);
      const h = 80 + Math.floor(rng() * 120);
      g.fillStyle = current.building;
      g.fillRect(x, 220 - h, w - 3, h);
      g.fillStyle = current.window;
      for (let wy = 220 - h + 10; wy < 206; wy += 16) {
        for (let wx = x + 6; wx < x + w - 12; wx += 12) {
          if (rng() > 0.4) g.fillRect(wx, wy, 5, 8);
        }
      }
      x += w;
    }
    return c;
  }

  function startStage(i: number) {
    stage = stages[i];
    index = i;
    distance = 0;
    stageScore = 0;
    intro = 0.35;
    titleT = 2;
    ending = false;
    lane = 1;
    laneTarget = 1;
    queued = null;
    jumpY = 0;
    vy = 0;
    grounded = true;
    airborne = false;
    wipe = 0;
    stumble = 0;
    invuln = 0.35;
    combo = 0;
    rideTime = 0;
    cruise = 0;
    wellFed = fedPending;
    fedPending = false;
    obstacles = buildObstacles(stage, day);
    notes = buildNotes(stage, obstacles, day);
    city = paintCity(stage);
    speedNow = stage.speed * (wellFed ? 0.9 : 1);
    mode = "ride";
    stopMusic();
  }

  function hurt(o: Obs) {
    if (invuln > 0) return;
    const info = KIND[o.kind];
    const dmg = info.dmg * (wellFed ? 0.75 : 1);
    grace = Math.max(0, grace - dmg);
    hits += 1;
    combo = 0;
    invuln = 0.85;
    stumble = 0.42;
    trauma = Math.min(1, trauma + (reduce ? 0 : 0.5));
    hitStop = 0.05;
    riderFlash = 1;
    sfxHit();
    const p = project(o.lane, HIT);
    burst(p.x, p.y, C.opera, 8);
    floater("down", p.x, p.y - 20);
    if (grace <= 0) {
      wipe = 0.9;
      wipeouts += 1;
      grace = 48;
      nightScore = Math.max(0, nightScore - 400);
      if (bars >= 4) floater("phrase dropped", p.x, p.y - 42);
      else floater("a bow", p.x, p.y - 42);
      bars = 0;
    }
  }

  function skim(o: Obs, hopped: boolean) {
    combo += 1;
    const info = KIND[o.kind];
    const bonus = (hopped ? 170 : 100) + Math.min(combo, 10) * 14 + (info.joke ? 90 : 0);
    nightScore += bonus;
    stageScore += bonus;
    sfxCoin();
    const p = project(o.lane, HIT);
    const tag = info.joke ? `${jokeName(o.kind)} +${bonus}` : `+${bonus}`;
    floater(tag, p.x, p.y - 24);
    burst(p.x, p.y, C.sodium, 5);
  }

  function resolve(o: Obs) {
    o.resolved = true;
    const distLane = Math.abs(lane - o.lane);
    const info = KIND[o.kind];
    const clearing = info.jump && jumpY > 2;
    if (distLane < 0.48) {
      if (clearing) skim(o, true);
      else hurt(o);
    } else if (distLane < 1.15) {
      skim(o, false);
    } else {
      combo += 1;
    }
  }

  function takeNote(n: Note) {
    const p = project(n.lane, HIT);
    bars += 1;
    notesCaught += 1;
    combo += 1;
    if (bars >= 8) {
      const bonus = 720 + Math.min(combo, 12) * 18;
      nightScore += bonus;
      stageScore += bonus;
      grace = Math.min(100, grace + 8);
      bars = 0;
      sfxPhrase();
      floater(`eight bars +${bonus}`, p.x, p.y - 28);
      burst(p.x, p.y, C.sodium, 14);
    } else {
      nightScore += 90;
      stageScore += 90;
      sfxNote(bars);
      floater(`${bars}/8`, p.x, p.y - 22);
      burst(p.x, p.y, C.sodium, 4);
    }
  }

  function resolveNotes() {
    for (const n of notes) {
      if (n.taken) continue;
      const z = n.meter - distance;
      if (n.prevZ > HIT && z <= HIT) {
        n.taken = true;
        if (wipe <= 0 && Math.abs(lane - n.lane) < 0.55) takeNote(n);
      }
      n.prevZ = z;
    }
  }

  function finishStage() {
    if (!stage || ending) return;
    ending = true;
    let extra = 800 + Math.round(grace * 4);
    if (stage.quest) extra += QUEST_BONUS;
    if (stage.id === "hanoverback") extra += GUEST_BONUS;
    nightScore += extra;
    danceGrace = grace;
    hurried = rideTime > 1 && cruise / rideTime > 0.7;
    if (stage.id === "pharmacy") grace = Math.min(100, grace + 32);
    fedPending = stage.id === "ramen";
    danceT = 0;
    mode = "dance";
    playTheme(stage.theme, danceGrace, hurried);
    emit();
  }

  function afterDance() {
    if (mode !== "dance") return;
    stopMusic();
    if (index + 1 < stages.length) {
      startStage(index + 1);
      emit();
    } else {
      recap = {
        earned: Math.round(nightScore),
        hits,
        wipeouts,
        notes: notesCaught,
        onTime: wipeouts === 0 && hits <= 3,
        gastspiel: isGastspiel(day),
      };
      mode = "recap";
      speedNow = 0;
      emit();
    }
  }

  function updateJuice(dt: number) {
    time += dt;
    trauma = Math.max(0, trauma - dt * 1.7);
    riderFlash = Math.max(0, riderFlash - dt * 4);
    squash += (squashTarget - squash) * (1 - Math.exp(-14 * dt));
    squashTarget += (1 - squashTarget) * (1 - Math.exp(-8 * dt));
    steadyPulse = Math.max(0, steadyPulse - dt);
    for (const p of parts) {
      if (!p.alive) continue;
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 180 * dt;
      if (p.life <= 0) p.alive = false;
    }
    for (const f of floaters) {
      if (!f.alive) continue;
      f.life -= dt;
      f.y -= 28 * dt;
      if (f.life <= 0) f.alive = false;
    }
  }

  function updateRain(dt: number) {
    if (!stage || stage.weather !== "rain") return;
    for (const d of drops) {
      d.y += d.v * dt * 0.85;
      if (d.y > 1) d.y -= 1;
    }
  }

  function updateRide(dt: number) {
    if (!stage) return;
    const brake = braking();
    const fed = wellFed ? 0.9 : 1;
    speedNow = stage.speed * fed * (brake ? 0.7 : 1) * (stumble > 0 ? 0.82 : 1) * (wipe > 0 ? 0.4 : 1);
    const k = stage.weather === "rain" ? 11 : 18;
    lane += (laneTarget - lane) * (1 - Math.exp(-k * dt));
    if (queued != null && Math.abs(lane - laneTarget) < 0.08) {
      laneTarget = queued;
      queued = null;
    }
    integrateBody(dt);
    updateRain(dt);
    if (intro > 0) {
      intro -= dt;
      titleT -= dt;
      return;
    }
    titleT -= dt;
    rideTime += dt;
    if (!brake && wipe <= 0) cruise += dt;
    distance += speedNow * dt;
    const tempo = speedNow / 13;
    const gmul = 0.55 + 0.45 * (grace / 100);
    if (wipe <= 0) {
      const gain = RIDE_RATE * tempo * gmul * dt;
      nightScore += gain;
      stageScore += gain;
    }
    grace = Math.min(100, grace + 2.4 * dt);
    invuln = Math.max(0, invuln - dt);
    stumble = Math.max(0, stumble - dt);
    wipe = Math.max(0, wipe - dt);
    for (const o of obstacles) {
      const z = o.meter - distance;
      if (!o.resolved && o.prevZ > HIT && z <= HIT) resolve(o);
      o.prevZ = z;
    }
    resolveNotes();
    if (distance >= stage.length) finishStage();
  }

  function integrateBody(dt: number) {
    if (grounded) coyote = 0.16;
    else coyote -= dt;
    hopBuffer -= dt;
    if (hopBuffer > 0 && (grounded || coyote > 0) && wipe <= 0) {
      hopBuffer = 0;
      vy = 12.2;
      grounded = false;
      squashTarget = 1.16;
      sfxHop();
    }
    vy -= 34 * dt;
    jumpY += vy * dt * 18;
    if (jumpY <= 0) {
      if (!grounded) {
        squashTarget = 0.8;
        sfxLand();
        const p = project(lane, 0);
        burst(p.x, p.y, C.muted, 4);
      }
      jumpY = 0;
      vy = 0;
      grounded = true;
    }
    airborne = jumpY > 8;
  }

  function tick(dt: number) {
    if (mode === "dance") {
      if (!paused) {
        danceT += dt;
        if (danceT >= DANCE_LEN) afterDance();
      }
      updateJuice(dt);
      return;
    }
    if (mode !== "ride") {
      updateJuice(dt);
      return;
    }
    if (paused) return;
    if (hitStop > 0) {
      hitStop -= dt;
      updateJuice(dt);
      return;
    }
    updateRide(dt);
    updateJuice(dt);
  }

  function drawRider(x: number, y: number, s: number, pose: "ride" | "hop" | "stumble" | "bow") {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    const tilt = (laneTarget - lane) * 0.35 + (pose === "stumble" ? 0.35 : pose === "bow" ? 0.9 : 0);
    ctx.rotate(reduce ? 0 : tilt);
    const st = pose === "hop" ? 1.08 : squash;
    ctx.scale((s * 1.15) / st, s * 1.15 * st);
    if (pose === "bow") ctx.translate(0, 8);
    if (pose === "hop") ctx.translate(0, -10);
    ctx.fillStyle = C.ink;
    const spin = Math.floor(time * 12) % 2;
    ctx.fillRect(-16, -8, 8, 8);
    ctx.fillRect(8, -8 + spin, 8, 8);
    ctx.fillStyle = C.mint;
    ctx.fillRect(-16, -12, 32, 6);
    ctx.fillRect(-2, -30, 4, 18);
    ctx.fillRect(-12, -32, 24, 4);
    ctx.fillStyle = C.sodium;
    ctx.fillRect(-4, -18, 8, 4);
    ctx.fillStyle = "#d7d2c8";
    ctx.fillRect(-8, -48, 16, 18);
    ctx.fillStyle = C.opera;
    ctx.fillRect(-7, -50, 14, 5);
    ctx.fillStyle = C.skin;
    ctx.fillRect(-7, -64, 14, 14);
    ctx.fillStyle = C.hair;
    ctx.fillRect(-8, -68, 16, 7);
    ctx.fillRect(-9, -64, 4, 10);
    ctx.fillRect(6, -64, 4, 8);
    if (riderFlash > 0.4) {
      ctx.fillStyle = "rgba(244,239,230,0.65)";
      ctx.fillRect(-10, -68, 20, 64);
    }
    ctx.restore();
  }

  function drawDancer(x: number, y: number, kick: number) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = C.ink;
    ctx.fillRect(-8, -4, 6, 10);
    ctx.fillRect(4 + kick * 8, -4 - kick * 10, 6, 10);
    ctx.fillStyle = "#d7d2c8";
    ctx.fillRect(-7, -28, 14, 16);
    ctx.fillStyle = C.opera;
    ctx.fillRect(-8, -30, 16, 4);
    ctx.fillStyle = C.skin;
    ctx.fillRect(-6, -42, 12, 12);
    ctx.fillStyle = C.hair;
    ctx.fillRect(-7, -46, 14, 6);
    ctx.restore();
  }

  function drawObstacle(o: Obs) {
    const z = o.meter - distance;
    if (z > LOOK || z < -3) return;
    const p = project(o.lane, Math.max(0, z));
    const s = p.s;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(s, s);
    const info = KIND[o.kind];
    if (info.jump) {
      ctx.scale(1, 0.5);
      ctx.fillStyle = o.kind === "puddle" ? "#3d6d88" : "#14181f";
      ctx.beginPath();
      ctx.ellipse(0, 0, o.kind === "pointe" ? 16 : 22, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      if (o.kind === "puddle") {
        ctx.fillStyle = "rgba(244,239,230,0.45)";
        ctx.fillRect(-8, -2, 10, 2);
      }
      if (o.kind === "pointe") {
        ctx.scale(1, 2);
        ctx.fillStyle = "#f4efe6";
        ctx.fillRect(6, -16, 8, 5);
        ctx.fillStyle = C.opera;
        ctx.fillRect(8, -20, 4, 6);
      }
      ctx.restore();
      return;
    }
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(0, 2, 16, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    if (o.kind === "car" || o.kind === "tram") {
      const colors = [C.opera, C.sodium, C.ivory, "#3d5a80", C.mint];
      ctx.fillStyle = o.kind === "tram" ? "#e6e0d4" : colors[o.lane + (Math.floor(o.meter) % 3)];
      const w = o.kind === "tram" ? 46 : 34;
      ctx.fillRect(-w / 2, -32, w, 26);
      ctx.fillStyle = "#9ec4e0";
      ctx.fillRect(-w / 2 + 4, -28, w - 8, 10);
      ctx.fillStyle = C.sodium;
      ctx.fillRect(-w / 2 + 2, -8, 6, 4);
      ctx.fillRect(w / 2 - 8, -8, 6, 4);
      if (o.kind === "tram") {
        ctx.fillStyle = C.opera;
        ctx.fillRect(-w / 2, -18, w, 3);
      }
    } else if (o.kind === "person" || o.kind === "umbrella" || o.kind === "tuba" || o.kind === "baguette") {
      const coats = ["#3d5a80", C.opera, "#5c4a3a", "#2f6f5e"];
      ctx.fillStyle = coats[Math.floor(o.meter) % coats.length];
      ctx.fillRect(-7, -28, 14, 18);
      ctx.fillStyle = C.skin;
      ctx.fillRect(-5, -40, 10, 12);
      ctx.fillStyle = C.ink;
      const step = Math.sin(time * 8 + o.meter) * 3;
      ctx.fillRect(-6, -10, 4, 10);
      ctx.fillRect(2, -10 + step, 4, 10);
      if (o.kind === "umbrella") {
        ctx.fillStyle = C.opera;
        ctx.beginPath();
        ctx.arc(0, -44, 14, Math.PI, 0);
        ctx.fill();
        ctx.fillRect(-1, -44, 2, 12);
      }
      if (o.kind === "tuba") {
        ctx.fillStyle = C.sodium;
        ctx.beginPath();
        ctx.arc(12, -16, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(2, -18, 12, 4);
      }
      if (o.kind === "baguette") {
        ctx.fillStyle = "#e2c48a";
        ctx.rotate(-0.5);
        ctx.fillRect(-4, -36, 28, 5);
      }
    } else if (o.kind === "dog") {
      ctx.fillStyle = "#8a5a32";
      ctx.fillRect(-10, -16, 20, 10);
      ctx.fillRect(8, -22, 6, 8);
      ctx.fillStyle = C.ink;
      ctx.fillRect(-8, -8, 3, 8);
      ctx.fillRect(4, -8, 3, 8);
    } else if (o.kind === "swan") {
      ctx.fillStyle = C.ivory;
      ctx.beginPath();
      ctx.ellipse(0, -10, 12, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(6, -28, 4, 18);
      ctx.fillStyle = "#e07a3d";
      ctx.fillRect(8, -32, 7, 3);
    } else if (o.kind === "pigeon") {
      ctx.fillStyle = "#8d93a0";
      ctx.beginPath();
      ctx.ellipse(0, -12, 8, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.ink;
      ctx.fillRect(-3, -6, 2, 6);
      ctx.fillRect(2, -6, 2, 6);
    } else if (o.kind === "rival") {
      ctx.fillStyle = C.mint;
      ctx.fillRect(-12, -8, 24, 4);
      ctx.fillStyle = C.ivory;
      ctx.fillRect(-6, -28, 12, 16);
      ctx.fillStyle = C.opera;
      ctx.fillRect(-7, -30, 14, 4);
      ctx.fillStyle = C.skin;
      ctx.fillRect(-5, -40, 10, 10);
      ctx.fillStyle = C.hair;
      ctx.fillRect(-6, -44, 12, 5);
      const leg = Math.max(0, Math.sin(time * 6 + o.meter));
      ctx.fillStyle = C.ink;
      ctx.fillRect(8, -24 - leg * 16, 4, 14);
    } else if (o.kind === "sign") {
      ctx.fillStyle = "#6b5434";
      ctx.fillRect(-2, -28, 4, 28);
      ctx.fillStyle = C.ivory;
      ctx.fillRect(-22, -48, 44, 20);
      ctx.fillStyle = C.ink;
      ctx.font = "700 9px Outfit, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(o.text || "SIGN", 0, -35);
    } else if (o.kind === "barrier") {
      ctx.fillStyle = "#c96a2c";
      ctx.fillRect(-18, -16, 36, 10);
      ctx.fillStyle = C.ivory;
      ctx.fillRect(-18, -13, 8, 4);
      ctx.fillRect(-2, -13, 8, 4);
      ctx.fillRect(10, -13, 8, 4);
      ctx.fillStyle = "#6b5434";
      ctx.fillRect(-14, -6, 3, 10);
      ctx.fillRect(11, -6, 3, 10);
    }
    ctx.restore();
  }

  function drawSkyline() {
    if (!stage) return;
    const horizon = viewH * 0.2;
    const dh = viewH * 0.26;
    const dw = viewW * 1.15;
    const y = horizon - dh + 10;
    if (city) {
      const sc = (distance * 18) % dw;
      ctx.drawImage(city, -sc, y, dw, dh);
      ctx.drawImage(city, -sc + dw, y, dw, dh);
    }
    if (stage.id === "niederwall" || stage.id === "hanover") {
      const glow = clamp(distance / stage.length, 0, 1);
      ctx.fillStyle = `rgba(196, 55, 58, ${0.25 + glow * 0.55})`;
      ctx.fillRect(viewW * 0.72, horizon - 36 - glow * 20, 28, 40 + glow * 16);
      ctx.fillStyle = C.sodium;
      ctx.fillRect(viewW * 0.78, horizon - 8, 8, 10);
    }
  }

  function drawRoad() {
    if (!stage) return;
    const horizon = viewH * 0.2;
    const bottom = viewH * 0.96;
    ctx.fillStyle = stage.edge;
    ctx.fillRect(0, horizon, viewW, bottom - horizon);
    ctx.fillStyle = stage.road;
    ctx.beginPath();
    ctx.moveTo(viewW * 0.32, horizon);
    ctx.lineTo(viewW * 0.68, horizon);
    ctx.lineTo(viewW * 1.08, bottom);
    ctx.lineTo(-viewW * 0.08, bottom);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(244,239,230,0.28)";
    ctx.lineWidth = 2;
    for (const divider of [0.5, 1.5]) {
      for (let i = 0; i < 10; i++) {
        const z0 = (i * 4.2 + (distance % 4.2)) % 42;
        const a = project(divider, z0);
        const b = project(divider, z0 + 1.5);
        ctx.globalAlpha = 0.35 + a.depth * 0.65;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    const head = project(lane, 0);
    const far = project(lane, 9);
    ctx.fillStyle = "rgba(230,162,74,0.16)";
    ctx.beginPath();
    ctx.moveTo(head.x - 16, head.y);
    ctx.lineTo(head.x + 16, head.y);
    ctx.lineTo(far.x + 8, far.y);
    ctx.lineTo(far.x - 8, far.y);
    ctx.fill();
  }

  function drawRain() {
    if (!stage || stage.weather !== "rain") return;
    ctx.strokeStyle = "rgba(210,224,234,0.45)";
    ctx.lineWidth = 1;
    for (const d of drops) {
      const x = d.x * viewW;
      const y = d.y * viewH;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 3, y + 12);
      ctx.stroke();
    }
  }

  function drawHud() {
    if (!stage) return;
    ctx.fillStyle = C.ivory;
    ctx.textAlign = "left";
    ctx.font = "650 18px Outfit, sans-serif";
    ctx.fillText(stage.title, 16, 36);
    ctx.font = "560 13px Outfit, sans-serif";
    ctx.fillStyle = C.muted;
    ctx.fillText(`Evening ${day} · ${index + 1}/${stage.count}`, 16, 56);
    ctx.fillStyle = C.sodium;
    ctx.font = "650 18px Outfit, sans-serif";
    ctx.fillText(Math.floor(nightScore).toLocaleString("en-US"), 16, 78);
    const tempo = speedNow / 13;
    const word = tempo > 1.18 ? "Allegro" : tempo > 0.86 ? "Andante" : "Adagio";
    ctx.font = "560 13px Outfit, sans-serif";
    ctx.fillStyle = C.ivory;
    ctx.fillText(word, 150, 78);
    if (combo >= 2) {
      ctx.fillStyle = C.mint;
      ctx.textAlign = "right";
      ctx.fillText(`×${combo}`, viewW - 16, viewH * 0.58);
      ctx.textAlign = "left";
    }
    const barW = Math.min(148, viewW * 0.42);
    ctx.fillStyle = C.line;
    ctx.fillRect(16, 90, barW, 7);
    ctx.fillStyle = grace > 45 ? C.mint : C.opera;
    ctx.fillRect(16, 90, barW * (grace / 100), 7);
    ctx.fillStyle = "rgba(244,239,230,0.25)";
    ctx.fillRect(16, 102, barW, 3);
    ctx.fillStyle = C.sodium;
    ctx.fillRect(16, 102, barW * clamp(distance / stage.length, 0, 1), 3);
    if (titleT > 0) {
      ctx.globalAlpha = clamp(titleT, 0, 1);
      ctx.textAlign = "center";
      ctx.fillStyle = C.ivory;
      ctx.font = "650 22px Fraunces, Georgia, serif";
      ctx.fillText(stage.title, viewW / 2, viewH * 0.3);
      ctx.font = "500 14px Outfit, sans-serif";
      ctx.fillStyle = C.muted;
      ctx.fillText(stage.line, viewW / 2, viewH * 0.3 + 24);
      if (day === 1 && index === 0) {
        ctx.fillText("Gold arrow: hop. Red dash: move. Catch the notes.", viewW / 2, viewH * 0.3 + 46);
      }
      ctx.globalAlpha = 1;
    }
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i < bars ? C.sodium : C.line;
      ctx.fillRect(16 + i * 12, 114, 8, 8);
    }
    ctx.font = "560 11px Outfit, sans-serif";
    ctx.fillStyle = C.muted;
    ctx.textAlign = "left";
    ctx.fillText("bars", 116, 122);
    const cue = rideCue();
    if (cue) {
      ctx.textAlign = "center";
      ctx.font = "650 22px Outfit, sans-serif";
      ctx.fillStyle = cue === "Hop" ? C.sodium : C.opera;
      ctx.fillText(cue, viewW / 2, titleT > 0.2 ? viewH * 0.48 : viewH * 0.38);
      ctx.textAlign = "left";
    }
  }

  function nearestThreat(): Obs | null {
    let best: Obs | null = null;
    let bestZ = 99;
    for (const o of obstacles) {
      if (o.resolved) continue;
      const z = o.meter - distance;
      if (z < 2.4 || z > 15) continue;
      if (Math.abs(lane - o.lane) > 0.62) continue;
      if (z < bestZ) {
        best = o;
        bestZ = z;
      }
    }
    return best;
  }

  function rideCue() {
    const threat = nearestThreat();
    if (!threat) return "";
    if (KIND[threat.kind].jump) return jumpY > 2 ? "" : "Hop";
    if (Math.abs(laneTarget - threat.lane) > 0.2) return "";
    return "Move";
  }

  function safeLane(meter: number) {
    const blocked = [false, false, false];
    for (const o of obstacles) {
      if (Math.abs(o.meter - meter) < 5 && !KIND[o.kind].jump) blocked[o.lane] = true;
    }
    const from = Math.round(laneTarget);
    const left = from - 1;
    const right = from + 1;
    if (left >= 0 && !blocked[left]) return left;
    if (right <= 2 && !blocked[right]) return right;
    for (let i = 0; i < 3; i++) if (!blocked[i]) return i;
    return from;
  }

  function drawMarks(layer: "road" | "cue") {
    for (const o of obstacles) {
      if (o.resolved) continue;
      const z = o.meter - distance;
      if (z < 1.5 || z > 28) continue;
      const p = project(o.lane, z);
      const jump = KIND[o.kind].jump;
      const mine = Math.abs(lane - o.lane) < 0.62;
      if (layer === "road") {
        ctx.globalAlpha = mine ? 0.7 : 0.32;
        ctx.fillStyle = jump ? C.sodium : C.opera;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 16 * p.s, 6 * p.s, 0, 0, Math.PI * 2);
        ctx.fill();
        if (!jump && mine && z < 16) {
          const free = safeLane(o.meter);
          if (free !== o.lane) {
            const q = project(free, z);
            ctx.globalAlpha = 0.55;
            ctx.fillStyle = C.mint;
            ctx.beginPath();
            ctx.ellipse(q.x, q.y, 14 * q.s, 5 * q.s, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      if (layer === "cue" && (jump || mine)) {
        const bob = reduce ? 0 : Math.sin(time * 7 + o.meter) * 3;
        ctx.globalAlpha = mine ? 0.95 : 0.4;
        ctx.fillStyle = jump ? C.sodium : C.opera;
        ctx.save();
        ctx.translate(p.x, p.y - 26 * p.s + bob);
        if (jump) {
          ctx.beginPath();
          ctx.moveTo(0, -11);
          ctx.lineTo(8, 3);
          ctx.lineTo(-8, 3);
          ctx.fill();
        } else {
          ctx.fillRect(-9, -3, 18, 4);
        }
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawNote(n: Note) {
    if (n.taken) return;
    const z = n.meter - distance;
    if (z > LOOK || z < -1) return;
    const p = project(n.lane, Math.max(0, z));
    const bob = reduce ? 0 : Math.sin(time * 6 + n.meter) * 5;
    const s = 0.7 + p.depth * 0.5;
    ctx.save();
    ctx.translate(p.x, p.y - 26 * s + bob);
    ctx.scale(s, s);
    ctx.fillStyle = C.sodium;
    ctx.beginPath();
    ctx.ellipse(-2, 0, 7, 5, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(4, -18, 2, 18);
    ctx.beginPath();
    ctx.moveTo(6, -18);
    ctx.lineTo(6, -12);
    ctx.lineTo(12, -14);
    ctx.fill();
    ctx.restore();
  }

  function drawRide() {
    if (!stage) return;
    const mag = reduce ? 0 : trauma * trauma;
    const sx = Math.sin(time * 42) * 12 * mag;
    const sy = Math.cos(time * 35) * 7 * mag;
    ctx.save();
    ctx.translate(sx, sy);
    const key = `${stage.id}:${Math.round(viewH)}:${stage.sky0}`;
    if (!sky || skyKey !== key) {
      skyKey = key;
      sky = ctx.createLinearGradient(0, 0, 0, viewH * 0.45);
      sky.addColorStop(0, stage.sky0);
      sky.addColorStop(1, stage.sky1);
    }
    ctx.fillStyle = sky;
    ctx.fillRect(-20, -20, viewW + 40, viewH + 40);
    ctx.fillStyle = "#f4efe6";
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(viewW * 0.78, viewH * 0.1, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    drawSkyline();
    drawRoad();
    drawMarks("road");
    drawList.length = 0;
    for (const o of obstacles) {
      const z = o.meter - distance;
      if (z < LOOK && z > -3) drawList.push(o);
    }
    drawList.sort((a, b) => b.meter - a.meter);
    for (const o of drawList) drawObstacle(o);
    for (const n of notes) drawNote(n);
    drawMarks("cue");
    drawRain();
    const feet = project(lane, 0);
    const pose = wipe > 0.15 ? "bow" : stumble > 0 ? "stumble" : airborne ? "hop" : "ride";
    drawRider(feet.x, feet.y - jumpY, 1, pose);
    for (const p of parts) {
      if (!p.alive) continue;
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, 3, 3);
    }
    ctx.globalAlpha = 1;
    for (const f of floaters) {
      if (!f.alive) continue;
      ctx.globalAlpha = clamp(f.life, 0, 1);
      ctx.fillStyle = C.ivory;
      ctx.font = "650 14px Outfit, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    drawHud();
    if (paused) {
      ctx.fillStyle = "rgba(20,24,31,0.45)";
      ctx.fillRect(0, 0, viewW, viewH);
    }
  }

  function drawDance() {
    ctx.fillStyle = "#100c10";
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.fillStyle = "#5c1c28";
    ctx.fillRect(0, 0, viewW * 0.1, viewH);
    ctx.fillRect(viewW * 0.9, 0, viewW * 0.1, viewH);
    const stageY = viewH * 0.62;
    ctx.fillStyle = "#6e4034";
    ctx.fillRect(viewW * 0.1, stageY, viewW * 0.8, viewH * 0.26);
    ctx.strokeStyle = "rgba(244,239,230,0.18)";
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      ctx.moveTo(viewW * 0.1, stageY + i * 16);
      ctx.lineTo(viewW * 0.9, stageY + i * 16);
      ctx.stroke();
    }
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = i % 2 ? C.sodium : C.ivory;
      ctx.fillRect(viewW * 0.16 + i * (viewW * 0.075), stageY - 7, 12, 7);
    }
    const corps = danceGrace >= 75 ? 5 : danceGrace >= 45 ? 3 : 1;
    for (let i = 0; i < corps; i++) {
      const u = corps === 1 ? 0.5 : i / (corps - 1);
      const x = viewW * (0.24 + u * 0.52);
      const late = danceGrace < 72 && i === corps - 1 ? 0.7 : 0;
      const phase = danceT * Math.PI * 4 + late;
      const bob = Math.sin(phase) * (reduce ? 1 : 8);
      const kick = Math.max(0, Math.sin(phase));
      drawDancer(x, stageY + bob, kick);
    }
    if (corps === 1) {
      ctx.fillStyle = C.ink;
      ctx.fillRect(viewW * 0.66, stageY - 50, 3, 50);
      ctx.fillStyle = "#2a241c";
      ctx.fillRect(viewW * 0.58, stageY - 58, 28, 16);
    }
    ctx.textAlign = "center";
    ctx.fillStyle = C.ivory;
    ctx.font = "650 32px Fraunces, Georgia, serif";
    ctx.fillText("Eight bars", viewW / 2, viewH * 0.16);
    ctx.font = "560 15px Outfit, sans-serif";
    ctx.fillStyle = C.muted;
    const line =
      danceGrace >= 75
        ? "The corps lands together."
        : danceGrace >= 45
          ? "Someone is artistically late."
          : "Solo. A music stand is in the way.";
    ctx.fillText(line, viewW / 2, viewH * 0.16 + 28);
    if (stage) ctx.fillText(stage.title, viewW / 2, viewH * 0.16 + 50);
    ctx.fillStyle = C.sodium;
    ctx.fillText(Math.floor(nightScore).toLocaleString("en-US"), viewW / 2, viewH * 0.16 + 76);
  }

  function drawRoom() {
    const wide = viewW >= 768;
    const sceneW = wide ? Math.max(320, viewW - 384) : viewW;
    const sceneH = wide ? viewH : viewH * 0.7;
    const floorY = sceneH * (wide ? 0.62 : 0.56);
    ctx.fillStyle = "#222a38";
    ctx.fillRect(0, 0, sceneW, floorY);
    const rows = 9;
    for (let i = 0; i < rows; i++) {
      const t0 = i / rows;
      const t1 = (i + 1) / rows;
      const y0 = floorY + (sceneH - floorY) * t0;
      const y1 = floorY + (sceneH - floorY) * t1;
      ctx.fillStyle = i % 2 === 0 ? "#c4a574" : "#a67c49";
      ctx.fillRect(0, y0, sceneW, Math.max(1, y1 - y0));
    }
    ctx.strokeStyle = "rgba(70,42,18,0.45)";
    for (let k = 0; k <= 8; k++) {
      const x = (k / 8) * sceneW;
      ctx.beginPath();
      ctx.moveTo(x, floorY);
      ctx.lineTo(x, sceneH);
      ctx.stroke();
    }
    ctx.fillStyle = "#3a342c";
    ctx.fillRect(0, floorY - 6, sceneW, 8);

    const wx = sceneW * 0.62;
    const wy = sceneH * 0.08;
    const ww = Math.min(150, sceneW * 0.26);
    const wh = sceneH * 0.28;
    if (owned.has("curtain")) {
      ctx.fillStyle = C.opera;
      ctx.fillRect(wx - 10, wy, 12, wh * 0.78);
      ctx.fillRect(wx + ww - 2, wy, 12, wh * 0.78);
    }
    ctx.fillStyle = "#101820";
    ctx.fillRect(wx, wy, ww, wh);
    ctx.fillStyle = "#f4efe6";
    ctx.beginPath();
    ctx.arc(wx + ww * 0.72, wy + 18, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.opera;
    ctx.fillRect(wx + 16, wy + wh - 28, 16, 22);
    ctx.strokeStyle = C.line;
    ctx.strokeRect(wx, wy, ww, wh);

    if (owned.has("poster")) {
      ctx.fillStyle = "#efe6d6";
      ctx.fillRect(sceneW * 0.08, sceneH * 0.1, 48, 64);
      ctx.fillStyle = C.hair;
      ctx.fillRect(sceneW * 0.08 + 14, sceneH * 0.1 + 10, 20, 14);
      ctx.fillStyle = C.opera;
      ctx.fillRect(sceneW * 0.08 + 12, sceneH * 0.1 + 40, 24, 8);
    }
    if (owned.has("hanover")) {
      ctx.fillStyle = "#2a3148";
      ctx.fillRect(sceneW * 0.28, sceneH * 0.08, 64, 40);
      ctx.fillStyle = C.ivory;
      ctx.font = "600 10px Outfit, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("HANNOVER", sceneW * 0.28 + 32, sceneH * 0.08 + 24);
    }
    if (owned.has("stamp")) {
      ctx.strokeStyle = C.sodium;
      ctx.strokeRect(sceneW * 0.08, floorY - 52, 44, 32);
      ctx.fillStyle = C.opera;
      ctx.font = "700 10px Outfit, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("AMT", sceneW * 0.08 + 22, floorY - 32);
    }
    if (owned.has("spot")) {
      ctx.fillStyle = "rgba(230,162,74,0.2)";
      ctx.beginPath();
      ctx.moveTo(sceneW * 0.46, 0);
      ctx.lineTo(sceneW * 0.32, floorY);
      ctx.lineTo(sceneW * 0.6, floorY);
      ctx.fill();
    }
    if (owned.has("chandelier")) {
      ctx.strokeStyle = C.sodium;
      ctx.beginPath();
      ctx.moveTo(sceneW * 0.48, 0);
      ctx.lineTo(sceneW * 0.48, sceneH * 0.12);
      ctx.stroke();
      ctx.fillStyle = C.sodium;
      ctx.beginPath();
      ctx.arc(sceneW * 0.48, sceneH * 0.14, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    if (owned.has("clock")) {
      ctx.strokeStyle = C.ivory;
      ctx.beginPath();
      ctx.arc(sceneW * 0.9, sceneH * 0.16, 14, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (owned.has("cabinet")) {
      ctx.fillStyle = "#efe6d6";
      ctx.fillRect(sceneW * 0.84, floorY - 56, 32, 44);
      ctx.fillStyle = C.mint;
      ctx.fillRect(sceneW * 0.84 + 12, floorY - 46, 8, 8);
    }

    ctx.fillStyle = "#d9d0c4";
    ctx.fillRect(sceneW * 0.06, floorY - 16, 72, 20);
    ctx.fillStyle = "#efe8de";
    ctx.fillRect(sceneW * 0.06, floorY - 26, 26, 12);

    if (owned.has("plant")) {
      ctx.fillStyle = "#6b4a32";
      ctx.fillRect(sceneW * 0.78, floorY - 14, 16, 14);
      ctx.fillStyle = "#2f6f4e";
      ctx.beginPath();
      ctx.arc(sceneW * 0.78 + 8, floorY - 26, 14, 0, Math.PI * 2);
      ctx.fill();
    }
    if (owned.has("player")) {
      ctx.fillStyle = "#2a241c";
      ctx.fillRect(sceneW * 0.3, floorY - 20, 34, 20);
      ctx.fillStyle = C.sodium;
      ctx.beginPath();
      ctx.arc(sceneW * 0.3 + 17, floorY - 22, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    if (owned.has("chairs")) {
      for (let i = 0; i < 3; i++) {
        const x = sceneW * 0.46 + i * 20;
        ctx.fillStyle = C.ink;
        ctx.fillRect(x, floorY - 24, 14, 14);
        ctx.fillRect(x + 2, floorY - 10, 3, 10);
        ctx.fillRect(x + 9, floorY - 10, 3, 10);
      }
    }
    if (owned.has("stool")) {
      ctx.fillStyle = "#6b4a32";
      ctx.fillRect(sceneW * 0.2, floorY - 14, 16, 6);
      ctx.fillRect(sceneW * 0.2 + 6, floorY - 8, 3, 10);
    }
    if (owned.has("bowl")) {
      ctx.fillStyle = C.ivory;
      ctx.fillRect(sceneW * 0.21, floorY - 22, 14, 6);
      ctx.fillStyle = "rgba(230,162,74,0.8)";
      ctx.fillRect(sceneW * 0.24, floorY - 30 - Math.sin(time * 3) * 2, 2, 8);
    }
    if (owned.has("marks")) {
      ctx.strokeStyle = "rgba(244,239,230,0.75)";
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(sceneW * 0.38, floorY + 10, 46, 14);
      ctx.setLineDash([]);
    }

    const sx = owned.has("hook") ? sceneW * 0.72 : sceneW * 0.42;
    const sy = floorY + 4;
    if (owned.has("hook")) {
      ctx.strokeStyle = C.ivory;
      ctx.beginPath();
      ctx.moveTo(sx, sceneH * 0.16);
      ctx.lineTo(sx, sy - 36);
      ctx.stroke();
    }
    const bob = Math.sin(time * 2) * (reduce ? 0 : 2);
    drawRider(sx, sy + bob, wide ? 1.3 : 1.45, "ride");
  }

  function draw() {
    ctx.setTransform(canvas.width / viewW, 0, 0, canvas.height / viewH, 0, 0);
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, viewW, viewH);
    if (mode === "room") drawRoom();
    else if (mode === "ride") drawRide();
    else if (mode === "dance") drawDance();
    else if (mode === "recap") {
      drawRoom();
      ctx.fillStyle = "rgba(20,24,31,0.35)";
      ctx.fillRect(0, 0, viewW, viewH);
    }
  }

  function resize() {
    const vv = window.visualViewport;
    const w = vv?.width ?? window.innerWidth;
    const h = vv?.height ?? window.innerHeight;
    root.style.width = `${w}px`;
    root.style.height = `${h}px`;
    const cssW = Math.max(1, root.clientWidth);
    const cssH = Math.max(1, root.clientHeight);
    let dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cssW * dpr > 1600) dpr = 1600 / cssW;
    if (cssH * dpr > 1800) dpr = Math.min(dpr, 1800 / cssH);
    dpr = Math.max(1, dpr);
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    viewW = cssW;
    viewH = cssH;
  }

  function frame(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    acc += dt;
    let steps = 0;
    while (acc >= STEP && steps < 5) {
      tick(STEP);
      acc -= STEP;
      steps += 1;
    }
    draw();
    raf = requestAnimationFrame(frame);
  }

  function leave() {
    if (mode !== "room") return;
    unlockAudio();
    nightScore = 0;
    hits = 0;
    wipeouts = 0;
    notesCaught = 0;
    bars = 0;
    banked = false;
    grace = 100;
    wellFed = false;
    fedPending = false;
    recap = null;
    const ids = planNight(day);
    stages = ids.map((id, i) => resolveStage(id, day, i, ids.length));
    paused = false;
    startStage(0);
    emit();
  }

  function buy(id: string) {
    if (mode !== "room" || owned.has(id)) return;
    const item = ITEMS.find((it) => it.id === id);
    if (!item || purse < item.price) return;
    purse -= item.price;
    owned.add(id);
    persist();
    emit();
  }

  function toRoom() {
    if (mode !== "recap") return;
    if (!banked) {
      const earned = Math.round(nightScore);
      purse += earned;
      if (earned > best) best = earned;
      day += 1;
      banked = true;
      persist();
    }
    nightScore = 0;
    recap = null;
    mode = "room";
    speedNow = 0;
    emit();
  }

  function toggleMute() {
    muted = !muted;
    setMuted(muted);
    persist();
    emit();
  }

  function togglePause() {
    if (mode !== "ride" && mode !== "dance") return;
    paused = !paused;
    emit();
  }

  function onKeyDown(e: KeyboardEvent) {
    const codes = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space", "KeyA", "KeyD", "KeyW", "KeyS", "KeyP", "Escape"];
    if ((mode === "ride" || mode === "dance") && codes.includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    unlockAudio();
    pressCode(e.code);
  }

  function onKeyUp(e: KeyboardEvent) {
    held.delete(e.code);
  }

  function onPointerDown(e: PointerEvent) {
    unlockAudio();
    const target = e.target as Element | null;
    if (target?.closest?.("button, a, [data-scroll]")) return;
    tracking = true;
    trackX = e.clientX;
    trackY = e.clientY;
  }

  function onPointerUp(e: PointerEvent) {
    if (!tracking) return;
    tracking = false;
    const dx = e.clientX - trackX;
    const dy = e.clientY - trackY;
    if (mode !== "ride" || paused) return;
    if (Math.hypot(dx, dy) < 22) {
      queueHop();
      return;
    }
    if (Math.abs(dx) > Math.abs(dy)) nudge(dx > 0 ? 1 : -1);
    else if (dy < 0) queueHop();
    else steadyPulse = 0.7;
  }

  function onVis() {
    if (document.hidden) {
      if (mode === "ride" || mode === "dance") {
        paused = true;
        emit();
      }
    } else {
      last = performance.now();
      resumeAudio();
    }
  }

  function onBlur() {
    held.clear();
    steadyHeld = false;
  }

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", () => {
    tracking = false;
  });
  window.addEventListener("blur", onBlur);
  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("resize", resize);
  window.visualViewport?.addEventListener("resize", resize);

  window.__controlsTest = {
    getYaw: () => (1 - laneTarget) * 0.8,
    getSpeed: () => speedNow,
    getLane: () => laneTarget,
    getMode: () => mode,
    getScore: () => nightScore,
    setKeys,
    depart: leave,
  };

  resize();
  emit();
  draw();
  raf = requestAnimationFrame(frame);

  return {
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("resize", resize);
      stopMusic();
      if (window.__controlsTest?.depart === leave) delete window.__controlsTest;
    },
    depart: leave,
    buy,
    skipDance() {
      if (mode !== "dance") return;
      danceT = DANCE_LEN;
      afterDance();
    },
    toRoom,
    toggleMute,
    togglePause,
    holdSteady(on: boolean) {
      steadyHeld = on;
    },
    nudge,
    hop: queueHop,
  };
}
