import type { PhoneNumber, DeviceInfo, Contact, ContactStatus } from "./types";

// ── Emoji palette ─────────────────────────────────────────────────────────────

/** Colored-square "signal blocks" from the spec */
const SIGNAL_BLOCKS = ["🟥", "🟦", "🟨", "🟩", "🟪", "⬜", "🟧", "🟫"] as const;

/** Thematic accent emojis tied to the green-engineer persona */
const ACCENT_BLOCKS = [
  "😎", "👌", "🎷", "♣️", "🛸", "🌻", "💃", "🐴",
  "♠️", "♦️", "♥️", "⭐", "🌿", "🍀", "🌊", "🎵",
  "🎶", "🌙", "⚡", "🌸", "🎸", "🦋", "🌲", "🏇",
] as const;

const ALL_BLOCKS: readonly string[] = [...SIGNAL_BLOCKS, ...ACCENT_BLOCKS];

// ── Hashing ───────────────────────────────────────────────────────────────────

/** djb2 hash — fast, deterministic, non-cryptographic */
function djb2(input: string): number {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(h, 33) ^ input.charCodeAt(i);
    h = h >>> 0; // keep unsigned 32-bit
  }
  return h;
}

// ── Device fingerprint ────────────────────────────────────────────────────────

/**
 * Collect browser signals into a deterministic fingerprint string.
 * Returns a fallback when called server-side.
 */
export function collectFingerprint(): string {
  if (typeof window === "undefined") {
    return `ssr-fallback-${Math.random().toString(36).slice(2, 10)}`;
  }
  const parts = [
    navigator.userAgent,
    navigator.language,
    String(screen.width),
    String(screen.height),
    String(screen.colorDepth),
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    String(navigator.hardwareConcurrency ?? 0),
    String(new Date().getTimezoneOffset()),
    navigator.platform ?? "",
  ];
  return parts.join("|");
}

// ── Phone number generation ───────────────────────────────────────────────────

/**
 * Turn a fingerprint into `length` deterministic emoji blocks (default 8).
 * As more users join and collisions occur, callers can pass length > 8.
 */
export function fingerprintToBlocks(
  fingerprint: string,
  length: number = 8
): string[] {
  const blocks: string[] = [];
  let seed = djb2(fingerprint);
  for (let i = 0; i < length; i++) {
    // LCG mixing for each step
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    blocks.push(ALL_BLOCKS[seed % ALL_BLOCKS.length]);
  }
  return blocks;
}

/** Build a complete PhoneNumber from a raw fingerprint string */
export function buildPhoneNumber(
  fingerprint: string,
  length: number = 8
): PhoneNumber {
  const blocks = fingerprintToBlocks(fingerprint, length);
  return {
    blocks,
    raw: blocks.join(""),
    deviceId: djb2(fingerprint).toString(16).padStart(8, "0"),
    createdAt: new Date().toISOString(),
  };
}

/** Build DeviceInfo from the browser environment */
export function buildDeviceInfo(fingerprint: string): DeviceInfo {
  if (typeof window === "undefined") {
    return {
      fingerprint,
      userAgent: "server",
      platform: "server",
      language: "en",
      timezone: "UTC",
      screenResolution: "unknown",
      colorDepth: 0,
      registeredAt: new Date().toISOString(),
    };
  }
  return {
    fingerprint,
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

/** Generate a deterministic roster of demo contacts */
export function generateSeedContacts(count: number = 10): Contact[] {
  const names = [
    "Alex Rivera", "Morgan Chen", "Sam Okafor", "Jordan Walsh",
    "Taylor Brooks", "Casey Kim", "Riley Patel", "Drew Nguyen",
    "Avery Johnson", "Quinn Martinez", "Reese Thompson", "Blake Davis",
  ];
  const statuses: ContactStatus[] = ["online", "offline", "busy"];
  const tagPool = ["nature", "music", "tech", "horses", "engineer", "local"];

  return names.slice(0, count).map((name, i) => {
    const seed = djb2(`contact:${name}`);
    // Contacts added later get longer numbers (simulates growing network)
    const blockCount = 8 + Math.floor(i / 4);
    const fp = `seed:${name.toLowerCase().replace(/\s/g, "-")}`;
    const blocks = fingerprintToBlocks(fp, blockCount);

    return {
      id: `c${i + 1}`,
      name,
      phoneNumber: {
        blocks,
        raw: blocks.join(""),
        deviceId: seed.toString(16).padStart(8, "0"),
        createdAt: new Date(Date.now() - i * 86_400_000).toISOString(),
      },
      status: statuses[seed % statuses.length],
      lastSeen:
        statuses[seed % statuses.length] === "offline"
          ? new Date(Date.now() - (seed % 3_600_000)).toISOString()
          : undefined,
      favorite: i < 3,
      tags: tagPool.filter((_, ti) => ((seed >> ti) & 1) === 1).slice(0, 3),
    };
  });
}

// ── Formatting helpers ────────────────────────────────────────────────────────

/** Format call duration as mm:ss */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

/** Human-readable relative timestamp */
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
