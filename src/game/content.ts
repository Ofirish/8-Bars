export type ThemeId = "kleine" | "figaro" | "cancan" | "rain" | "andante";

export type Kind =
  | "pothole"
  | "puddle"
  | "pointe"
  | "car"
  | "tram"
  | "person"
  | "dog"
  | "swan"
  | "tuba"
  | "baguette"
  | "pigeon"
  | "rival"
  | "sign"
  | "barrier"
  | "umbrella";

export type StageId =
  | "residential"
  | "cobbles"
  | "jahnplatz"
  | "rain"
  | "niederwall"
  | "cityhall"
  | "pharmacy"
  | "ramen"
  | "station"
  | "hanover"
  | "hanoverback";

export type KindInfo = { jump: boolean; dmg: number; joke: boolean };

export const KIND: Record<Kind, KindInfo> = {
  pothole: { jump: true, dmg: 16, joke: false },
  puddle: { jump: true, dmg: 12, joke: false },
  pointe: { jump: true, dmg: 14, joke: true },
  car: { jump: false, dmg: 26, joke: false },
  tram: { jump: false, dmg: 30, joke: false },
  person: { jump: false, dmg: 18, joke: false },
  dog: { jump: false, dmg: 14, joke: false },
  swan: { jump: false, dmg: 16, joke: true },
  tuba: { jump: false, dmg: 20, joke: true },
  baguette: { jump: false, dmg: 14, joke: true },
  pigeon: { jump: false, dmg: 10, joke: true },
  rival: { jump: false, dmg: 22, joke: true },
  sign: { jump: false, dmg: 18, joke: true },
  barrier: { jump: false, dmg: 20, joke: false },
  umbrella: { jump: false, dmg: 16, joke: false },
};

export type StageDef = {
  id: StageId;
  title: string;
  line: string;
  sky0: string;
  sky1: string;
  road: string;
  edge: string;
  building: string;
  window: string;
  weather: "clear" | "rain";
  quest: boolean;
  density: number;
  ground: Kind[];
  tall: Kind[];
  jokes: Kind[];
  sign: string;
  theme: ThemeId;
};

const DEFS: Record<StageId, StageDef> = {
  residential: {
    id: "residential",
    title: "Residential",
    line: "Quiet street. One puddle is already judging you.",
    sky0: "#243044",
    sky1: "#3d4d66",
    road: "#3a414c",
    edge: "#2a3038",
    building: "#2c3544",
    window: "#e6a24a",
    weather: "clear",
    quest: false,
    density: 1,
    ground: ["pothole", "puddle"],
    tall: ["person", "dog", "umbrella"],
    jokes: ["pigeon", "baguette"],
    sign: "QUIET",
    theme: "kleine",
  },
  cobbles: {
    id: "cobbles",
    title: "Cobbles",
    line: "The scooter buzzes. Your turnout does not help.",
    sky0: "#2a3142",
    sky1: "#4a4038",
    road: "#4a453e",
    edge: "#2e2a26",
    building: "#3a342e",
    window: "#f0d8a8",
    weather: "clear",
    quest: false,
    density: 1.05,
    ground: ["pothole", "pointe", "puddle"],
    tall: ["person", "dog"],
    jokes: ["swan", "baguette"],
    sign: "ALTSTADT",
    theme: "kleine",
  },
  jahnplatz: {
    id: "jahnplatz",
    title: "Jahnplatz",
    line: "Cars, a tram, and nobody who rehearsed this.",
    sky0: "#1c2433",
    sky1: "#3a3328",
    road: "#323842",
    edge: "#22262c",
    building: "#2a3140",
    window: "#e6a24a",
    weather: "clear",
    quest: false,
    density: 1.2,
    ground: ["puddle", "pothole"],
    tall: ["car", "person", "tram"],
    jokes: ["rival", "sign"],
    sign: "JAHNPLATZ",
    theme: "cancan",
  },
  rain: {
    id: "rain",
    title: "Rain street",
    line: "The lanes lie a little. Hop the shine.",
    sky0: "#1a2430",
    sky1: "#2c3a4c",
    road: "#2e3642",
    edge: "#1e242c",
    building: "#263140",
    window: "#9ec4e0",
    weather: "rain",
    quest: false,
    density: 1.12,
    ground: ["puddle", "pothole"],
    tall: ["person", "umbrella", "car"],
    jokes: ["swan", "pigeon"],
    sign: "NASS",
    theme: "rain",
  },
  niederwall: {
    id: "niederwall",
    title: "Niederwall",
    line: "The opera is the red glow. Make the door.",
    sky0: "#241820",
    sky1: "#4a2430",
    road: "#34302e",
    edge: "#241c1c",
    building: "#32282c",
    window: "#e6a24a",
    weather: "clear",
    quest: false,
    density: 1.15,
    ground: ["pothole", "puddle", "pointe"],
    tall: ["car", "person", "umbrella"],
    jokes: ["rival", "sign"],
    sign: "NIEDERWALL",
    theme: "figaro",
  },
  cityhall: {
    id: "cityhall",
    title: "The long way to the Rathaus",
    line: "It is next door to the opera. The form is not.",
    sky0: "#222a38",
    sky1: "#3e4654",
    road: "#3c4148",
    edge: "#282c32",
    building: "#343c48",
    window: "#f4efe6",
    weather: "clear",
    quest: true,
    density: 1.08,
    ground: ["pothole"],
    tall: ["barrier", "person", "sign"],
    jokes: ["sign", "tuba"],
    sign: "RATHAUS",
    theme: "andante",
  },
  pharmacy: {
    id: "pharmacy",
    title: "Apotheke",
    line: "A fluorescent cross, a paper bag, back on the deck.",
    sky0: "#1a2828",
    sky1: "#1e4038",
    road: "#323a3a",
    edge: "#222828",
    building: "#2a3836",
    window: "#7dcea0",
    weather: "clear",
    quest: true,
    density: 1.05,
    ground: ["puddle", "pothole"],
    tall: ["person", "umbrella"],
    jokes: ["pigeon", "baguette"],
    sign: "APOTHEKE",
    theme: "andante",
  },
  ramen: {
    id: "ramen",
    title: "A bowl of ramen",
    line: "Steam on the visor. The next street will be softer.",
    sky0: "#2a221c",
    sky1: "#5a3828",
    road: "#3a342e",
    edge: "#2a221c",
    building: "#3a3028",
    window: "#e6a24a",
    weather: "clear",
    quest: true,
    density: 0.96,
    ground: ["puddle"],
    tall: ["person", "dog"],
    jokes: ["baguette", "pigeon"],
    sign: "RAMEN",
    theme: "andante",
  },
  station: {
    id: "station",
    title: "Make the train",
    line: "Hauptbahnhof. Fold the scooter. Don't miss it.",
    sky0: "#1c2430",
    sky1: "#3a4450",
    road: "#3a4048",
    edge: "#262a30",
    building: "#303840",
    window: "#d8e4ee",
    weather: "clear",
    quest: false,
    density: 1.18,
    ground: ["puddle", "pothole"],
    tall: ["person", "barrier", "sign"],
    jokes: ["tuba", "sign"],
    sign: "HBF",
    theme: "cancan",
  },
  hanover: {
    id: "hanover",
    title: "Hannover, the show",
    line: "Off the train. Opernplatz is this way.",
    sky0: "#1e2638",
    sky1: "#3a3058",
    road: "#343844",
    edge: "#242830",
    building: "#323848",
    window: "#c9b6f0",
    weather: "clear",
    quest: false,
    density: 1.28,
    ground: ["puddle", "pothole"],
    tall: ["car", "tram", "person"],
    jokes: ["rival", "swan"],
    sign: "OPER",
    theme: "figaro",
  },
  hanoverback: {
    id: "hanoverback",
    title: "Back to the train",
    line: "The return does not wait. Neither does the rain.",
    sky0: "#182028",
    sky1: "#243848",
    road: "#2e3640",
    edge: "#1c2228",
    building: "#2a3440",
    window: "#9ec4e0",
    weather: "rain",
    quest: false,
    density: 1.32,
    ground: ["puddle", "pothole"],
    tall: ["car", "person", "umbrella"],
    jokes: ["pigeon", "sign"],
    sign: "ZUG",
    theme: "rain",
  },
};

export type ResolvedStage = StageDef & { speed: number; length: number; index: number; count: number };

export function planNight(day: number): StageId[] {
  if (day % 5 === 0) return ["station", "hanover", "hanoverback"];
  const quests: StageId[] = ["ramen", "pharmacy", "cityhall"];
  const quest = quests[(day - 1) % 3];
  const pool: StageId[] = ["residential", "cobbles", "jahnplatz", "rain"];
  const a = pool[(day - 1) % pool.length];
  let b = pool[(day + 1) % pool.length];
  if (b === a) b = pool[(day + 2) % pool.length];
  if (day % 2 === 0) return [a, b, quest, "niederwall"];
  return [a, quest, b, "niederwall"];
}

export function resolveStage(id: StageId, day: number, index: number, count: number): ResolvedStage {
  const base = { ...DEFS[id] };
  if ((id === "niederwall" && day >= 3) || (id === "jahnplatz" && day >= 7)) base.weather = "rain";
  const speed = 13 * Math.min(1.62, 1 + (day - 1) * 0.055) * (1 + index * 0.045);
  const length = 340 + index * 36 + Math.min(90, (day - 1) * 6);
  return {
    ...base,
    density: base.density * (1 + (day - 1) * 0.07),
    speed,
    length,
    index,
    count,
  };
}

export function isGastspiel(day: number) {
  return day % 5 === 0;
}

export type Item = {
  id: string;
  name: string;
  price: number;
  blurb: string;
};

export const ITEMS: Item[] = [
  { id: "poster", name: "Photocopied headshot", price: 12000, blurb: "The face is yours. The paper is not sure." },
  { id: "marks", name: "Tape marks", price: 16000, blurb: "The parquet stays visible. The floor is the point." },
  { id: "plant", name: "Rubber plant", price: 22000, blurb: "It believes in you more than the clerk did." },
  { id: "stool", name: "Ramen stool", price: 28000, blurb: "For after Niederwall." },
  { id: "stamp", name: "Framed stamp", price: 36000, blurb: "The Rathaus kept a copy. Of course it did." },
  { id: "cabinet", name: "Pharmacy cabinet", price: 44000, blurb: "Mostly plasters. One of them is moral." },
  { id: "spot", name: "One spotlight", price: 56000, blurb: "The room becomes a studio for eight seconds." },
  { id: "curtain", name: "Curtain, a little short", price: 70000, blurb: "Eight centimeters of ambition, hemmed wrong." },
  { id: "bowl", name: "Bowl that still steams", price: 82000, blurb: "Buy the stool first if you have any sense." },
  { id: "player", name: "Record player", price: 96000, blurb: "Eight bars, at home, on the good floor." },
  { id: "chairs", name: "Three folding chairs", price: 110000, blurb: "An audience that does not clap." },
  { id: "hook", name: "Scooter hook", price: 124000, blurb: "Learned on the station stairs." },
  { id: "hanover", name: "Hanover poster", price: 138000, blurb: "Proof the guest night happened." },
  { id: "clock", name: "Station clock", price: 156000, blurb: "Always almost your train." },
  { id: "chandelier", name: "Chandelier, one bulb", price: 190000, blurb: "The parquet finally answers." },
];

export const QUEST_BONUS = 2800;
export const GUEST_BONUS = 8200;
export const RIDE_RATE = 64;
