// ── HydrHost — complete domain types ────────────────────────────────────────

// ── Phone / Signal ────────────────────────────────────────────────────────────

export interface PhoneNumber {
  blocks: string[];
  raw: string;
  deviceId: string;
  createdAt: string;
}

export interface DeviceInfo {
  fingerprint: string;
  userAgent: string;
  platform: string;
  language: string;
  timezone: string;
  screenResolution: string;
  colorDepth: number;
  registeredAt: string;
}

export interface UserProfile {
  id: string;
  name: string;
  phoneNumber: PhoneNumber;
  device: DeviceInfo;
}

export type ContactStatus = "online" | "offline" | "busy";

export interface Contact {
  id: string;
  name: string;
  phoneNumber: PhoneNumber;
  status: ContactStatus;
  lastSeen?: string;
  favorite: boolean;
  tags: string[];
}

export type CallDirection = "incoming" | "outgoing" | "missed";

export interface CallRecord {
  id: string;
  contactId: string;
  contactName: string;
  contactNumber: string;
  direction: CallDirection;
  duration: number;
  timestamp: string;
}

/**
 * idle      → device broadcasting carrier signal, no call active
 * scanning  → AI exchange scanning hydrogen shell for target signal
 * ringing   → target signal locked; ringing their device
 * connected → picked up; voice electrons attached to carrier proton
 */
export type CallPhase = "idle" | "scanning" | "ringing" | "connected";

export interface DialState {
  phase: CallPhase;
  isMuted: boolean;
  duration: number;
  target: Contact | null;
  error: string | null;
}

// ── Token Economy ─────────────────────────────────────────────────────────────

/**
 * 4 level stages represented by card suits.
 * Earned through activity — never purchased.
 */
export type UserLevel = "♣️" | "♦️" | "♥️" | "♠️";

export const LEVEL_THRESHOLDS: Record<UserLevel, number> = {
  "♣️": 0,
  "♦️": 100,
  "♥️": 500,
  "♠️": 2000,
};

export const LEVEL_NAMES: Record<UserLevel, string> = {
  "♣️": "Club",
  "♦️": "Diamond",
  "♥️": "Heart",
  "♠️": "Spade",
};

export type BoostType = "star" | "mushroom";

export interface ActiveBoost {
  type: BoostType;
  /** ISO timestamp when this boost expires */
  expiresAt: string;
  emoji: string;
  label: string;
}

export interface TokenWallet {
  balance: number;
  totalEarned: number;
  level: UserLevel;
  /** 0–100 progress toward the next level */
  levelProgress: number;
  activeBoosts: ActiveBoost[];
  /** Number of times user has Warped (spent tokens for upgrades) */
  warpsUsed: number;
  /** Bugs stomped (quality metric / fun stat) */
  bugsStomped: number;
}

export interface EarnRecord {
  id: string;
  amount: number;
  reason: string;
  timestamp: string;
}

// ── Value Chain ───────────────────────────────────────────────────────────────

export interface ChainStep {
  emoji: string;
  label: string;
  description: string;
  tokenCost: number;
  unlocked: boolean;
}
