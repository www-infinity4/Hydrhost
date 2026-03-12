// ── Core domain types for HydrHost emoji phone network ──────────────────────

export interface PhoneNumber {
  /** Exactly 8 (or more) emoji blocks making up the number */
  blocks: string[];
  /** Blocks joined without separators */
  raw: string;
  /** Hex digest derived from the device fingerprint */
  deviceId: string;
  /** ISO-8601 timestamp of generation */
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
  /** Duration in seconds */
  duration: number;
  timestamp: string;
}

/**
 * Phases of a call lifecycle driven by the hydrogen-shell signal model:
 *
 *  idle       – no call in progress, device emitting its own signal
 *  scanning   – scanning the hydrogen shell for the target's signal pulse
 *  ringing    – signal found; phone is ringing the target device
 *  connected  – target picked up; live call in progress
 */
export type CallPhase = "idle" | "scanning" | "ringing" | "connected";

export interface DialState {
  phase: CallPhase;
  isMuted: boolean;
  duration: number;
  target: Contact | null;
  error: string | null;
}
