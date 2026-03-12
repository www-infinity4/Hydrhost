import type { PhoneNumber, DeviceInfo, Contact, ContactStatus } from "./types";

// ── Frequency table ───────────────────────────────────────────────────────────

const BLOCK_FREQ: Record<string, number> = {
  "🟥": 220,  "🟦": 246,  "🟨": 277,  "🟩": 311,
  "🟪": 349,  "⬜": 392,  "🟧": 440,  "🟫": 494,
  "😎": 523,  "👌": 554,  "🎷": 587,  "♣️": 622,
  "🛸": 659,  "🌻": 698,  "💃": 740,  "🐴": 784,
  "♠️": 831,  "♦️": 880,  "♥️": 932,  "⭐": 988,
  "🌿": 1047, "🍀": 1109, "🌊": 1175, "🎵": 1245,
  "🎶": 1319, "🌙": 1397, "⚡": 1480, "🌸": 1568,
  "🎸": 1661, "🦋": 1760, "🌲": 1865, "🏇": 1976,
};

const DEFAULT_FREQ = 440;

// ── Signal config (lives here so both page.tsx and use-signal.ts can import) ──

export interface SignalConfig {
  /** Primary carrier frequency Hz (block 0 — proton state) */
  freqA: number;
  /** Secondary carrier frequency Hz (block 1 — proton state) */
  freqB: number;
  /** Pulse ON duration ms — unique per device */
  pulseOnMs: number;
  /** Pulse OFF duration ms — unique per device */
  pulseOffMs: number;
  /** Carrier gain 0–1 */
  gain: number;
}

export function buildSignalConfig(pn: PhoneNumber): SignalConfig {
  const freqA = BLOCK_FREQ[pn.blocks[0]] ?? DEFAULT_FREQ;
  const freqB = BLOCK_FREQ[pn.blocks[1]] ?? DEFAULT_FREQ * 1.25;
  const seed  = parseInt(pn.deviceId, 16) || 12345;
  return {
    freqA,
    freqB,
    pulseOnMs:  200 + (seed % 400),
    pulseOffMs: 150 + ((seed >> 4) % 350),
    gain: 0.08,
  };
}

// ── Hashing ───────────────────────────────────────────────────────────────────

export function djb2(input: string): number {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(h, 33) ^ input.charCodeAt(i);
    h = h >>> 0;
  }
  return h;
}

// ── Device fingerprint ────────────────────────────────────────────────────────

export function collectFingerprint(): string {
  if (typeof window === "undefined") {
    return `ssr-${Math.random().toString(36).slice(2, 10)}`;
  }
  return [
    navigator.userAgent,
    navigator.language,
    String(screen.width),
    String(screen.height),
    String(screen.colorDepth),
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    String(navigator.hardwareConcurrency ?? 0),
    String(new Date().getTimezoneOffset()),
    navigator.platform ?? "",
  ].join("|");
}

// ── Block palette ─────────────────────────────────────────────────────────────

const SIGNAL_BLOCKS = ["🟥","🟦","🟨","🟩","🟪","⬜","🟧","🟫"] as const;
const ACCENT_BLOCKS = [
  "😎","👌","🎷","♣️","🛸","🌻","💃","🐴",
  "♠️","♦️","♥️","⭐","🌿","🍀","🌊","🎵",
  "🎶","🌙","⚡","🌸","🎸","🦋","🌲","🏇",
] as const;
const ALL_BLOCKS: readonly string[] = [...SIGNAL_BLOCKS, ...ACCENT_BLOCKS];

// ── Phone number generation ───────────────────────────────────────────────────

export function fingerprintToBlocks(fp: string, length = 8): string[] {
  const blocks: string[] = [];
  let seed = djb2(fp);
  for (let i = 0; i < length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    blocks.push(ALL_BLOCKS[seed % ALL_BLOCKS.length]);
  }
  return blocks;
}

export function buildPhoneNumber(fp: string, length = 8): PhoneNumber {
  const blocks = fingerprintToBlocks(fp, length);
  return {
    blocks,
    raw: blocks.join(""),
    deviceId: djb2(fp).toString(16).padStart(8, "0"),
    createdAt: new Date().toISOString(),
  };
}

export function buildDeviceInfo(fp: string): DeviceInfo {
  if (typeof window === "undefined") {
    return {
      fingerprint: fp, userAgent: "server", platform: "server",
      language: "en", timezone: "UTC", screenResolution: "unknown",
      colorDepth: 0, registeredAt: new Date().toISOString(),
    };
  }
  return {
    fingerprint: fp,
    userAgent: navigator.userAgent,
    platform: navigator.platform ?? "unknown",
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    screenResolution: `${screen.width}×${screen.height}`,
    colorDepth: screen.colorDepth,
    registeredAt: new Date().toISOString(),
  };
}

// ── Seed contacts ─────────────────────────────────────────────────────────────

export function generateSeedContacts(count = 10): Contact[] {
  const names = [
    "Alex Rivera","Morgan Chen","Sam Okafor","Jordan Walsh",
    "Taylor Brooks","Casey Kim","Riley Patel","Drew Nguyen",
    "Avery Johnson","Quinn Martinez","Reese Thompson","Blake Davis",
  ];
  const statuses: ContactStatus[] = ["online","offline","busy"];
  const tagPool = ["nature","music","tech","horses","engineer","local"];

  return names.slice(0, count).map((name, i) => {
    const seed = djb2(`contact:${name}`);
    const blockCount = 8 + Math.floor(i / 4);
    const fp = `seed:${name.toLowerCase().replace(/\s/g, "-")}`;
    const blocks = fingerprintToBlocks(fp, blockCount);
    return {
      id: `c${i + 1}`,
      name,
      phoneNumber: {
        blocks, raw: blocks.join(""),
        deviceId: seed.toString(16).padStart(8, "0"),
        createdAt: new Date(Date.now() - i * 86_400_000).toISOString(),
      },
      status: statuses[seed % statuses.length],
      lastSeen: statuses[seed % statuses.length] === "offline"
        ? new Date(Date.now() - (seed % 3_600_000)).toISOString()
        : undefined,
      favorite: i < 3,
      tags: tagPool.filter((_, ti) => ((seed >> ti) & 1) === 1).slice(0, 3),
    };
  });
}

// ── Value chain steps ─────────────────────────────────────────────────────────

export const VALUE_CHAIN = [
  { emoji: "🟡", label: "Token",       description: "Earn tokens by watching & playing",        tokenCost: 0    },
  { emoji: "👑", label: "Website",     description: "Claim your site on the network",            tokenCost: 10   },
  { emoji: "🤓", label: "Research",    description: "Unlock deep research on any topic",         tokenCost: 25   },
  { emoji: "🦾", label: "Tools",       description: "Access builder tools & signal generators",  tokenCost: 50   },
  { emoji: "⚙️", label: "Development", description: "Ship features & grow your platform",        tokenCost: 100  },
  { emoji: "💰", label: "Value",       description: "Your platform accumulates real value",      tokenCost: 250  },
  { emoji: "💲", label: "Assets",      description: "Convert platform value to real assets",     tokenCost: 500  },
] as const;

// ── Formatting helpers ────────────────────────────────────────────────────────

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export function formatRelative(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const s = Math.floor(diff / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return "just now";
}
