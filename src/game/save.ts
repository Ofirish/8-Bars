const KEY = "eight-bars-v1";

export type Save = {
  version: 1;
  purse: number;
  owned: string[];
  day: number;
  best: number;
  muted: boolean;
};

export function defaultSave(): Save {
  return { version: 1, purse: 0, owned: [], day: 1, best: 0, muted: false };
}

export function loadSave(): Save {
  if (typeof window === "undefined") return defaultSave();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    const parsed = JSON.parse(raw) as Partial<Save>;
    if (parsed.version !== 1) return defaultSave();
    return {
      version: 1,
      purse: Number(parsed.purse) || 0,
      owned: Array.isArray(parsed.owned) ? parsed.owned.filter((id) => typeof id === "string") : [],
      day: Math.max(1, Number(parsed.day) || 1),
      best: Number(parsed.best) || 0,
      muted: Boolean(parsed.muted),
    };
  } catch {
    return defaultSave();
  }
}

export function writeSave(save: Save) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    /* private mode / full storage — the night still plays */
  }
}

export function money(n: number) {
  return Math.floor(n).toLocaleString("en-US");
}
