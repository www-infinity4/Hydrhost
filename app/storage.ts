"use client";

import type { UserProfile, Contact, CallRecord } from "./types";
import {
  collectFingerprint,
  buildPhoneNumber,
  buildDeviceInfo,
  generateSeedContacts,
} from "./phone-utils";

const KEY = {
  PROFILE: "hh_profile_v1",
  CONTACTS: "hh_contacts_v1",
  HISTORY: "hh_history_v1",
} as const;

// ── Profile ───────────────────────────────────────────────────────────────────

export function loadProfile(): UserProfile {
  try {
    const raw = localStorage.getItem(KEY.PROFILE);
    if (raw) return JSON.parse(raw) as UserProfile;
  } catch {
    /* corrupted — regenerate */
  }

  const fp = collectFingerprint();
  const profile: UserProfile = {
    id: `u-${buildPhoneNumber(fp).deviceId}`,
    name: "My Profile",
    phoneNumber: buildPhoneNumber(fp),
    device: buildDeviceInfo(fp),
  };
  persistProfile(profile);
  return profile;
}

export function persistProfile(profile: UserProfile): void {
  try {
    localStorage.setItem(KEY.PROFILE, JSON.stringify(profile));
  } catch { /* storage full */ }
}

// ── Contacts ──────────────────────────────────────────────────────────────────

export function loadContacts(): Contact[] {
  try {
    const raw = localStorage.getItem(KEY.CONTACTS);
    if (raw) return JSON.parse(raw) as Contact[];
  } catch { /* regenerate */ }

  const seeded = generateSeedContacts(10);
  persistContacts(seeded);
  return seeded;
}

export function persistContacts(contacts: Contact[]): void {
  try {
    localStorage.setItem(KEY.CONTACTS, JSON.stringify(contacts));
  } catch { /* storage full */ }
}

export function toggleFavorite(contacts: Contact[], id: string): Contact[] {
  return contacts.map((c) => (c.id === id ? { ...c, favorite: !c.favorite } : c));
}

// ── Call history ──────────────────────────────────────────────────────────────

export function loadHistory(): CallRecord[] {
  try {
    const raw = localStorage.getItem(KEY.HISTORY);
    if (raw) return JSON.parse(raw) as CallRecord[];
  } catch { /* empty */ }
  return [];
}

export function appendRecord(record: CallRecord): void {
  try {
    const hist = loadHistory();
    const updated = [record, ...hist].slice(0, 50);
    localStorage.setItem(KEY.HISTORY, JSON.stringify(updated));
  } catch { /* storage full */ }
}
