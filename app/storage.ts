"use client";

import type {
  UserProfile, Contact, CallRecord,
  TokenWallet, UserLevel, EarnRecord, ActiveBoost, BoostType,
} from "./types";
import { LEVEL_THRESHOLDS as THRESH } from "./types";
import {
  collectFingerprint, buildPhoneNumber, buildDeviceInfo,
  generateSeedContacts, djb2,
} from "./phone-utils";

const K = {
  PROFILE:  "hh_profile_v1",
  CONTACTS: "hh_contacts_v1",
  HISTORY:  "hh_history_v1",
  WALLET:   "hh_wallet_v1",
  EARN_LOG: "hh_earn_log_v1",
} as const;

function safeGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch { return null; }
}

function safeSet(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* full */ }
}

// ── Profile ───────────────────────────────────────────────────────────────────

export function loadProfile(): UserProfile {
  const stored = safeGet<UserProfile>(K.PROFILE);
  if (stored) return stored;
  const fp = collectFingerprint();
  const profile: UserProfile = {
    id: `u-${buildPhoneNumber(fp).deviceId}`,
    name: "My Profile",
    phoneNumber: buildPhoneNumber(fp),
    device: buildDeviceInfo(fp),
  };
  safeSet(K.PROFILE, profile);
  return profile;
}

export function persistProfile(p: UserProfile): void { safeSet(K.PROFILE, p); }

// ── Contacts ──────────────────────────────────────────────────────────────────

export function loadContacts(): Contact[] {
  const stored = safeGet<Contact[]>(K.CONTACTS);
  if (stored) return stored;
  const seeded = generateSeedContacts(10);
  safeSet(K.CONTACTS, seeded);
  return seeded;
}

export function persistContacts(c: Contact[]): void { safeSet(K.CONTACTS, c); }

export function toggleFavorite(contacts: Contact[], id: string): Contact[] {
  return contacts.map((c) => (c.id === id ? { ...c, favorite: !c.favorite } : c));
}

// ── Call history ──────────────────────────────────────────────────────────────

export function loadHistory(): CallRecord[] {
  return safeGet<CallRecord[]>(K.HISTORY) ?? [];
}

export function appendRecord(r: CallRecord): void {
  safeSet(K.HISTORY, [r, ...loadHistory()].slice(0, 50));
}

// ── Token wallet ──────────────────────────────────────────────────────────────

const LEVEL_ORDER: UserLevel[] = ["♣️","♦️","♥️","♠️"];

function computeLevel(total: number): { level: UserLevel; levelProgress: number } {
  let level: UserLevel = "♣️";
  for (const l of LEVEL_ORDER) {
    if (total >= THRESH[l]) level = l;
  }
  const idx  = LEVEL_ORDER.indexOf(level);
  const next = LEVEL_ORDER[idx + 1];
  if (!next) return { level, levelProgress: 100 };
  const base  = THRESH[level];
  const ceil  = THRESH[next];
  return { level, levelProgress: Math.min(100, Math.round(((total - base) / (ceil - base)) * 100)) };
}

function freshWallet(): TokenWallet {
  return { balance: 0, totalEarned: 0, level: "♣️", levelProgress: 0, activeBoosts: [], warpsUsed: 0, bugsStomped: 0 };
}

export function loadWallet(): TokenWallet {
  const stored = safeGet<TokenWallet>(K.WALLET);
  if (stored) {
    const now = Date.now();
    return { ...stored, activeBoosts: stored.activeBoosts.filter((b) => new Date(b.expiresAt).getTime() > now) };
  }
  const w = freshWallet();
  safeSet(K.WALLET, w);
  return w;
}

export function persistWallet(w: TokenWallet): void { safeSet(K.WALLET, w); }

export function earnTokens(wallet: TokenWallet, base: number, reason: string): TokenWallet {
  const hasMushroom = wallet.activeBoosts.some(
    (b) => b.type === "mushroom" && new Date(b.expiresAt).getTime() > Date.now(),
  );
  const amount      = hasMushroom ? base * 2 : base;
  const totalEarned = wallet.totalEarned + amount;
  const { level, levelProgress } = computeLevel(totalEarned);
  const updated: TokenWallet     = { ...wallet, balance: wallet.balance + amount, totalEarned, level, levelProgress };

  const record: EarnRecord = {
    id: `earn-${Date.now()}-${djb2(reason)}`,
    amount, reason, timestamp: new Date().toISOString(),
  };
  safeSet(K.EARN_LOG, [record, ...(safeGet<EarnRecord[]>(K.EARN_LOG) ?? [])].slice(0, 100));
  safeSet(K.WALLET, updated);
  return updated;
}

export function spendTokens(wallet: TokenWallet, amount: number): TokenWallet | null {
  if (wallet.balance < amount) return null;
  const updated: TokenWallet = { ...wallet, balance: wallet.balance - amount };
  safeSet(K.WALLET, updated);
  return updated;
}

const BOOST_COSTS: Record<BoostType, number> = { star: 50, mushroom: 75 };
const BOOST_DURATION_MS = 60 * 60 * 1000;

export function activateBoost(wallet: TokenWallet, type: BoostType): TokenWallet | null {
  const spent = spendTokens(wallet, BOOST_COSTS[type]);
  if (!spent) return null;
  const boost: ActiveBoost = {
    type,
    expiresAt: new Date(Date.now() + BOOST_DURATION_MS).toISOString(),
    emoji: type === "star" ? "⭐" : "🍄",
    label: type === "star" ? "Star Boost (2× earn)" : "Mushroom (2× research)",
  };
  const updated: TokenWallet = {
    ...spent,
    activeBoosts: [...spent.activeBoosts.filter((b) => b.type !== type), boost],
  };
  safeSet(K.WALLET, updated);
  return updated;
}

export function executeWarp(wallet: TokenWallet): TokenWallet | null {
  const spent = spendTokens(wallet, 200);
  if (!spent) return null;
  const updated: TokenWallet = { ...spent, warpsUsed: spent.warpsUsed + 1 };
  safeSet(K.WALLET, updated);
  return updated;
}

export function stompBug(wallet: TokenWallet): TokenWallet {
  const updated  = earnTokens(wallet, 2, "Bug stomped 🐛");
  const final: TokenWallet = { ...updated, bugsStomped: wallet.bugsStomped + 1 };
  safeSet(K.WALLET, final);
  return final;
}

export function loadEarnLog(): EarnRecord[] {
  return safeGet<EarnRecord[]>(K.EARN_LOG) ?? [];
}
