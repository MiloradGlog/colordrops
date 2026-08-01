// Universal save: one versioned JSON blob. Swap localStorage for Capacitor
// Preferences behind this same interface at ship stage.

const KEY = "colordrops-save";
const VERSION = 1;

export interface SaveData {
  version: number;
  settings: { sound: boolean };
  progress: { level: number; bestByLevel: Record<string, number>; completions?: number };
  best: number;
}

const defaults = (): SaveData => ({
  version: VERSION,
  settings: { sound: true },
  progress: { level: 1, bestByLevel: {} },
  best: 0,
});

export function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const data = JSON.parse(raw) as SaveData;
    return data.version === VERSION ? data : migrate(data);
  } catch {
    return defaults();
  }
}

export function save(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // storage full/blocked: losing a save beats crashing the game
  }
}

function migrate(old: SaveData): SaveData {
  // bump VERSION and translate old shapes here; never silently drop progress
  return { ...defaults(), ...old, version: VERSION };
}

export function installAutoSave(get: () => SaveData): void {
  window.addEventListener("pagehide", () => save(get()));
}
