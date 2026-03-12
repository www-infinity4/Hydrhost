"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type FC,
  type ReactNode,
} from "react";
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Star,
  Search,
  Clock,
  BookOpen,
  Home,
  Radio,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Pencil,
  X,
} from "lucide-react";
import type {
  UserProfile,
  Contact,
  CallRecord,
  DialState,
  ContactStatus,
} from "./types";
import {
  loadProfile,
  persistProfile,
  loadContacts,
  persistContacts,
  toggleFavorite,
  loadHistory,
  appendRecord,
} from "./storage";
import { formatDuration, formatRelative } from "./phone-utils";

// ═══════════════════════════════════════════════════════════════════
// Primitive helpers
// ═══════════════════════════════════════════════════════════════════

type Tab = "home" | "number" | "contacts" | "dialer" | "history";

const STATUS_DOT: Record<ContactStatus, string> = {
  online: "bg-emerald-500",
  offline: "bg-gray-400",
  busy: "bg-amber-500",
};

function Dot({ status }: { status: ContactStatus }) {
  return (
    <span
      aria-label={`Status: ${status}`}
      className={`inline-block w-2.5 h-2.5 rounded-full ring-2 ring-white ${STATUS_DOT[status]}`}
    />
  );
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`glass rounded-3xl p-5 ${className}`}>{children}</div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PhoneNumberDisplay
// ═══════════════════════════════════════════════════════════════════

interface PhoneNumProps {
  pn: { blocks: string[]; raw: string; deviceId: string };
  size?: "sm" | "lg";
}

function PhoneNumberDisplay({ pn, size = "lg" }: PhoneNumProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pn.raw);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable */ }
  };

  const blockSize = size === "lg" ? "text-3xl" : "text-xl";

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        role="group"
        aria-label="Emoji phone number blocks"
        className="flex flex-wrap gap-1 justify-center"
      >
        {pn.blocks.map((b, i) => (
          <span
            key={i}
            className={`${blockSize} leading-none select-none hover:scale-110 transition-transform cursor-default`}
            aria-label={`Block ${i + 1}`}
            title={`Block ${i + 1}: ${b}`}
          >
            {b}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap justify-center">
        <span className="text-xs font-mono bg-green-100 text-green-700 px-3 py-1 rounded-full">
          ID: {pn.deviceId}
        </span>
        <button
          onClick={copy}
          className="flex items-center gap-1 text-xs border border-green-300 text-green-600 hover:bg-green-50 px-3 py-1 rounded-full transition-colors"
          aria-label="Copy phone number"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Navigation
// ═══════════════════════════════════════════════════════════════════

const NAV_TABS: Array<{ id: Tab; label: string; icon: FC<{ size?: number }> }> = [
  { id: "home",     label: "Home",     icon: Home },
  { id: "number",   label: "My #",     icon: Phone },
  { id: "contacts", label: "Contacts", icon: BookOpen },
  { id: "dialer",   label: "Dialer",   icon: Radio },
  { id: "history",  label: "History",  icon: Clock },
];

function Nav({
  active,
  onChange,
  historyCount,
}: {
  active: Tab;
  onChange: (t: Tab) => void;
  historyCount: number;
}) {
  return (
    <nav
      aria-label="Main navigation"
      className="sticky top-0 z-50 glass border-b border-green-200 shadow-sm"
    >
      <div className="max-w-2xl mx-auto px-4">
        {/* brand bar */}
        <div className="flex items-center justify-between py-3 border-b border-green-100">
          <div className="flex items-center gap-2">
            <span className="text-2xl" aria-hidden="true">🌱</span>
            <span className="font-bold text-green-800 tracking-tight">HydrHost</span>
          </div>
          <span className="text-xs text-green-500 flex items-center gap-1">
            <span aria-hidden="true">🐴🎵🌿</span> Emoji Phone Network
          </span>
        </div>

        {/* tab row */}
        <div className="flex overflow-x-auto" role="tablist" aria-label="App sections">
          {NAV_TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              role="tab"
              aria-selected={active === id}
              aria-label={label}
              onClick={() => onChange(id)}
              className={`relative flex flex-col items-center gap-0.5 px-4 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-all min-w-[60px] ${
                active === id
                  ? "border-green-600 text-green-700 bg-green-50/60"
                  : "border-transparent text-green-500 hover:text-green-700 hover:bg-green-50/40"
              }`}
            >
              <Icon size={16} />
              {label}
              {id === "history" && historyCount > 0 && (
                <span className="absolute top-1 right-1 min-w-[16px] h-4 bg-green-600 text-white text-[9px] rounded-full flex items-center justify-center px-0.5">
                  {historyCount > 9 ? "9+" : historyCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Home tab
// ═══════════════════════════════════════════════════════════════════

function HomeTab({
  profile,
  contacts,
  history,
  onNav,
}: {
  profile: UserProfile | null;
  contacts: Contact[];
  history: CallRecord[];
  onNav: (t: Tab) => void;
}) {
  const online = contacts.filter((c) => c.status === "online").length;
  const favs   = contacts.filter((c) => c.favorite);

  return (
    <div className="space-y-5 animate-grow-in">
      {/* hero */}
      <Card className="text-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.07] text-5xl flex flex-wrap gap-3 justify-center items-center pointer-events-none select-none" aria-hidden="true">
          {["🌿","🍀","🌻","🐴","🎵","🌊","⭐","🌸"].map((e, i) => (
            <span key={i} className="animate-float" style={{ animationDelay: `${i * 0.4}s` }}>{e}</span>
          ))}
        </div>
        <div className="relative z-10 py-2">
          <div className="text-5xl mb-3 animate-float" aria-hidden="true">🌱</div>
          <h2 className="text-2xl font-bold text-green-800">Welcome to HydrHost</h2>
          <p className="text-green-600 text-sm mt-2 max-w-xs mx-auto">
            Your nature-inspired emoji phone network. Every device gets a unique 8-block number.
          </p>
        </div>
      </Card>

      {/* quick stats */}
      <div className="grid grid-cols-3 gap-3">
        {([
          { emoji: "📱", value: profile ? "Active" : "…", label: "My Number",   tab: "number"   as Tab },
          { emoji: "🟢", value: String(online),           label: "Online Now",  tab: "contacts" as Tab },
          { emoji: "📡", value: String(history.length),   label: "Calls Made",  tab: "history"  as Tab },
        ] as const).map((s) => (
          <button
            key={s.label}
            onClick={() => onNav(s.tab)}
            aria-label={`${s.label}: ${s.value}`}
            className="glass rounded-2xl p-4 text-center hover:bg-green-50/60 transition-colors group"
          >
            <div className="text-2xl mb-1 group-hover:animate-float" aria-hidden="true">{s.emoji}</div>
            <div className="font-bold text-green-800">{s.value}</div>
            <div className="text-xs text-green-500">{s.label}</div>
          </button>
        ))}
      </div>

      {/* my number preview */}
      {profile && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-green-800 flex items-center gap-2">
              <Phone size={16} /> My Number
            </h3>
            <button
              onClick={() => onNav("number")}
              className="text-xs text-green-500 hover:text-green-700 underline"
              aria-label="View full number details"
            >
              Details →
            </button>
          </div>
          <PhoneNumberDisplay pn={profile.phoneNumber} size="lg" />
        </Card>
      )}

      {/* favorites */}
      {favs.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-green-800 flex items-center gap-2">
              <Star size={16} /> Favorites
            </h3>
            <button
              onClick={() => onNav("contacts")}
              className="text-xs text-green-500 hover:text-green-700 underline"
              aria-label="View all contacts"
            >
              All contacts →
            </button>
          </div>
          <ul className="space-y-2">
            {favs.slice(0, 3).map((c) => (
              <li key={c.id} className="flex items-center gap-3 p-3 rounded-xl bg-green-50 hover:bg-green-100 transition-colors">
                <Dot status={c.status} />
                <span className="flex-1 text-sm font-medium text-green-800 truncate">{c.name}</span>
                <span className="text-xs text-green-400 truncate max-w-[80px]">
                  {c.phoneNumber.blocks.slice(0, 3).join("")}…
                </span>
                <button
                  onClick={() => onNav("dialer")}
                  aria-label={`Dial ${c.name}`}
                  className="text-green-600 hover:text-green-800 transition-colors"
                >
                  <Radio size={16} />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* how it works */}
      <Card>
        <h3 className="font-semibold text-green-800 mb-3 flex items-center gap-2">
          <span aria-hidden="true">🌿</span> How It Works
        </h3>
        <ul className="space-y-2 text-sm text-green-700">
          {[
            { e: "📱", t: "Your device fingerprint becomes an 8-block emoji number" },
            { e: "🟥🟦🟨", t: "Blocks use colored squares and themed emojis as identifiers" },
            { e: "📖", t: "Contact numbers grow longer as the network expands" },
            { e: "📡", t: "The Signal Generator lets you instantly dial any contact" },
          ].map((row, i) => (
            <li key={i} className="flex items-start gap-3 p-2 rounded-xl hover:bg-green-50 transition-colors">
              <span className="text-lg flex-shrink-0" aria-hidden="true">{row.e}</span>
              <span>{row.t}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// My Number tab
// ═══════════════════════════════════════════════════════════════════

function NumberTab({
  profile,
  onNameSave,
}: {
  profile: UserProfile | null;
  onNameSave: (n: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(profile?.name ?? "");
  const [err, setErr]         = useState<string | null>(null);

  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[220px] gap-4">
        <div className="text-5xl animate-pulse-s" aria-hidden="true">🌱</div>
        <p className="text-green-600 text-sm animate-pulse-s">Generating your number…</p>
      </div>
    );
  }

  const save = () => {
    const v = draft.trim();
    if (!v) { setErr("Name cannot be empty"); return; }
    if (v.length > 40) { setErr("Max 40 characters"); return; }
    setErr(null);
    onNameSave(v);
    setEditing(false);
  };

  return (
    <div className="space-y-5 animate-grow-in">
      <Card className="text-center">
        <div className="text-4xl mb-2" aria-hidden="true">📱</div>
        <h2 className="text-xl font-bold text-green-800">My Emoji Phone Number</h2>
        <p className="text-xs text-green-400 mb-4 mt-1">
          Deterministically generated from your device fingerprint
        </p>
        <PhoneNumberDisplay pn={profile.phoneNumber} size="lg" />
      </Card>

      {/* profile name */}
      <Card>
        <h3 className="font-semibold text-green-800 mb-3 flex items-center gap-2">
          <span aria-hidden="true">🌿</span> Display Name
        </h3>
        {editing ? (
          <div className="flex flex-col gap-2">
            <input
              autoFocus
              type="text"
              value={draft}
              maxLength={40}
              onChange={(e) => { setDraft(e.target.value); setErr(null); }}
              placeholder="Your name"
              className="w-full border border-green-300 rounded-xl px-4 py-2 text-green-800 bg-white focus:outline-none focus:ring-2 focus:ring-green-400 text-sm"
              aria-label="Display name input"
              aria-describedby={err ? "name-err" : undefined}
            />
            {err && <p id="name-err" role="alert" className="text-red-500 text-xs">{err}</p>}
            <div className="flex gap-2">
              <button
                onClick={save}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-xl py-2 text-sm font-medium transition-colors"
                aria-label="Save name"
              >
                Save
              </button>
              <button
                onClick={() => { setEditing(false); setDraft(profile.name); setErr(null); }}
                className="flex-1 border border-green-300 text-green-700 hover:bg-green-50 rounded-xl py-2 text-sm font-medium transition-colors"
                aria-label="Cancel"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-green-800 font-medium">{profile.name}</span>
            <button
              onClick={() => { setEditing(true); setDraft(profile.name); }}
              className="flex items-center gap-1 text-xs border border-green-300 text-green-600 hover:bg-green-50 px-3 py-1 rounded-full transition-colors"
              aria-label="Edit display name"
            >
              <Pencil size={11} /> Edit
            </button>
          </div>
        )}
      </Card>

      {/* device scan history */}
      <Card>
        <h3 className="font-semibold text-green-800 mb-3 flex items-center gap-2">
          <span aria-hidden="true">🔍</span> Device Scan History
        </h3>
        <dl className="space-y-1.5 text-sm">
          {[
            ["Platform",    profile.device.platform],
            ["Language",    profile.device.language],
            ["Timezone",    profile.device.timezone],
            ["Resolution",  profile.device.screenResolution],
            ["Color Depth", `${profile.device.colorDepth}-bit`],
            ["Registered",  new Date(profile.device.registeredAt).toLocaleDateString()],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between items-center border-b border-green-100 pb-1 last:border-0 last:pb-0">
              <dt className="text-green-500">{label}</dt>
              <dd className="font-mono text-green-800 text-xs text-right truncate max-w-[55%]">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {/* block breakdown */}
      <Card>
        <h3 className="font-semibold text-green-800 mb-3 flex items-center gap-2">
          <span aria-hidden="true">🔢</span> Block Breakdown
        </h3>
        <div className="grid grid-cols-4 gap-2">
          {profile.phoneNumber.blocks.map((b, i) => (
            <div
              key={i}
              className="flex flex-col items-center gap-1 p-3 bg-green-50 rounded-xl hover:bg-green-100 transition-colors"
              aria-label={`Block ${i + 1}: ${b}`}
            >
              <span className="text-2xl" aria-hidden="true">{b}</span>
              <span className="text-[10px] text-green-400 font-mono">#{i + 1}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-green-400 mt-3 text-center">
          Numbers extend beyond 8 blocks as the network grows to stay unique
        </p>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Contacts tab
// ═══════════════════════════════════════════════════════════════════

function ContactsTab({
  contacts,
  onToggleFav,
  onDial,
}: {
  contacts: Contact[];
  onToggleFav: (id: string) => void;
  onDial: (c: Contact) => void;
}) {
  type Filter = "all" | "online" | "favorites";
  const [query,  setQuery]  = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const shown = contacts.filter((c) => {
    const q = query.toLowerCase();
    const matchQ =
      !q ||
      c.name.toLowerCase().includes(q) ||
      c.phoneNumber.raw.includes(q);
    const matchF =
      filter === "all" ||
      (filter === "online"    && c.status === "online") ||
      (filter === "favorites" && c.favorite);
    return matchQ && matchF;
  });

  return (
    <div className="space-y-4 animate-grow-in">
      {/* search */}
      <div className="glass rounded-2xl flex items-center gap-2 px-4 py-2.5">
        <Search size={16} className="text-green-400 flex-shrink-0" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name or emoji number…"
          className="flex-1 bg-transparent outline-none text-green-800 placeholder-green-400 text-sm"
          aria-label="Search contacts"
        />
        {query && (
          <button onClick={() => setQuery("")} aria-label="Clear search" className="text-green-400 hover:text-green-600">
            <X size={14} />
          </button>
        )}
      </div>

      {/* filters */}
      <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Filter contacts">
        {(["all", "online", "favorites"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={`px-4 py-1 rounded-full text-xs font-medium transition-colors capitalize ${
              filter === f
                ? "bg-green-600 text-white"
                : "bg-white border border-green-300 text-green-600 hover:bg-green-50"
            }`}
          >
            {f === "online" ? "🟢 Online" : f === "favorites" ? "⭐ Favorites" : "👥 All"}
          </button>
        ))}
        <span className="ml-auto text-xs text-green-400">{shown.length} contact{shown.length !== 1 ? "s" : ""}</span>
      </div>

      {/* list */}
      {shown.length === 0 ? (
        <Card className="text-center py-10">
          <div className="text-4xl mb-2" aria-hidden="true">🌿</div>
          <p className="text-green-500 text-sm">
            {query ? "No contacts match your search" : "Nothing to show here"}
          </p>
        </Card>
      ) : (
        <ul className="space-y-2" aria-label="Contact list">
          {shown.map((c) => (
            <ContactRow key={c.id} contact={c} onToggleFav={onToggleFav} onDial={onDial} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ContactRow({
  contact,
  onToggleFav,
  onDial,
}: {
  contact: Contact;
  onToggleFav: (id: string) => void;
  onDial: (c: Contact) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <li className="glass rounded-2xl overflow-hidden" aria-label={`Contact: ${contact.name}`}>
      {/* summary */}
      <div className="flex items-center gap-3 p-4">
        {/* avatar */}
        <div className="relative flex-shrink-0">
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center font-bold text-green-700">
            {contact.name[0]}
          </div>
          <span className="absolute -bottom-0.5 -right-0.5">
            <Dot status={contact.status} />
          </span>
        </div>

        {/* name + short number */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className="text-sm font-medium text-green-800 truncate">{contact.name}</span>
            {contact.favorite && <Star size={11} className="text-amber-400 flex-shrink-0" fill="currentColor" aria-label="Favorite" />}
          </div>
          <div className="text-xs text-green-400 truncate">
            {contact.phoneNumber.blocks.slice(0, 4).join("")}
            {contact.phoneNumber.blocks.length > 4 && (
              <span className="text-green-300">+{contact.phoneNumber.blocks.length - 4}</span>
            )}
          </div>
        </div>

        {/* actions */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => onDial(contact)}
            aria-label={`Dial ${contact.name}`}
            className="w-8 h-8 bg-green-600 hover:bg-green-700 text-white rounded-full flex items-center justify-center transition-colors"
          >
            <Phone size={14} />
          </button>
          <button
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={open ? "Collapse" : "Expand contact details"}
            className="w-8 h-8 text-green-400 hover:text-green-600 rounded-full flex items-center justify-center transition-colors"
          >
            {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* expanded */}
      {open && (
        <div className="border-t border-green-100 bg-green-50/50 p-4 space-y-3 animate-slide-up">
          <PhoneNumberDisplay pn={contact.phoneNumber} size="sm" />

          <div className="flex items-center justify-between text-xs text-green-600">
            <span>
              {contact.status === "offline" && contact.lastSeen
                ? `Last seen ${formatRelative(contact.lastSeen)}`
                : contact.status === "busy"
                ? "🔴 Currently busy"
                : "🟢 Online now"}
            </span>
            <button
              onClick={() => onToggleFav(contact.id)}
              aria-label={contact.favorite ? "Remove from favorites" : "Add to favorites"}
              className="flex items-center gap-1 border border-green-300 hover:bg-green-100 px-2 py-0.5 rounded-full transition-colors"
            >
              <Star size={11} className={contact.favorite ? "text-amber-400" : "text-green-400"} fill={contact.favorite ? "currentColor" : "none"} />
              {contact.favorite ? "Unfavorite" : "Favorite"}
            </button>
          </div>

          {contact.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {contact.tags.map((t) => (
                <span key={t} className="px-2 py-0.5 bg-green-100 text-green-600 rounded-full text-xs">#{t}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Dialer tab (Signal Generator)
// ═══════════════════════════════════════════════════════════════════

function DialerTab({
  contacts,
  seedTarget,
  onCallDone,
}: {
  contacts: Contact[];
  seedTarget: Contact | null;
  onCallDone: (r: CallRecord) => void;
}) {
  const [state, setState] = useState<DialState>({
    phase: "idle",
    isMuted: false,
    duration: 0,
    target: seedTarget,
    error: null,
  });
  const [query, setQuery] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Accept a new seedTarget if we're idle
  useEffect(() => {
    if (seedTarget && state.phase === "idle") {
      setState((s) => ({ ...s, target: seedTarget, error: null }));
    }
  }, [seedTarget, state.phase]);

  // Timer
  useEffect(() => {
    if (state.phase === "connected") {
      timerRef.current = setInterval(
        () => setState((s) => ({ ...s, duration: s.duration + 1 })),
        1000
      );
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [state.phase]);

  const dial = useCallback(() => {
    if (!state.target) return;
    setState((s) => ({ ...s, phase: "dialing", error: null, duration: 0 }));
    setTimeout(() => setState((s) => ({ ...s, phase: "connected" })), 2000);
  }, [state.target]);

  const hangUp = useCallback(() => {
    const { target, duration, phase } = state;
    setState({ phase: "idle", isMuted: false, duration: 0, target, error: null });
    if (target) {
      onCallDone({
        id: `call-${Date.now()}`,
        contactId: target.id,
        contactName: target.name,
        contactNumber: target.phoneNumber.raw,
        direction: "outgoing",
        duration: phase === "connected" ? duration : 0,
        timestamp: new Date().toISOString(),
      });
    }
  }, [state, onCallDone]);

  const filtered = contacts.filter(
    (c) =>
      c.name.toLowerCase().includes(query.toLowerCase()) ||
      c.phoneNumber.raw.includes(query)
  );

  const isActive = state.phase === "dialing" || state.phase === "connected";

  return (
    <div className="space-y-5 animate-grow-in">
      {/* header */}
      <Card className="text-center">
        <div className="text-4xl mb-2" aria-hidden="true">📡</div>
        <h2 className="text-xl font-bold text-green-800">Signal Generator</h2>
        <p className="text-xs text-green-500 mt-1">
          Select a contact and send an emoji-block signal connection
        </p>
      </Card>

      {/* target */}
      <Card>
        <h3 className="text-xs font-semibold text-green-500 uppercase tracking-wide mb-3">
          Target
        </h3>
        {state.target ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center text-xl font-bold text-green-700">
                {state.target.name[0]}
              </div>
              <div>
                <div className="font-semibold text-green-800">{state.target.name}</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Dot status={state.target.status} />
                  <span className="text-xs text-green-500">{state.target.status}</span>
                </div>
              </div>
              {!isActive && (
                <button
                  onClick={() => setState((s) => ({ ...s, target: null }))}
                  aria-label="Clear target"
                  className="ml-auto text-green-400 hover:text-green-600"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            <PhoneNumberDisplay pn={state.target.phoneNumber} size="sm" />
          </div>
        ) : (
          <p className="text-green-400 text-sm text-center py-6">
            No contact selected — pick one below
          </p>
        )}
      </Card>

      {/* call controls */}
      {state.target && (
        <Card className="text-center space-y-4">
          {state.phase === "connected" && (
            <p
              className="text-2xl font-mono font-bold text-green-600 animate-pulse-s"
              aria-live="polite"
              aria-label={`Connected — ${formatDuration(state.duration)}`}
            >
              ⏱ {formatDuration(state.duration)}
            </p>
          )}
          {state.phase === "dialing" && (
            <p className="text-green-500 text-sm animate-pulse-s" aria-live="polite">
              📡 Sending signal…
            </p>
          )}
          {state.error && (
            <p className="text-red-500 text-sm" role="alert">⚠️ {state.error}</p>
          )}

          <div className="flex justify-center items-center gap-5">
            {state.phase === "idle" && (
              <button
                onClick={dial}
                aria-label={`Call ${state.target.name}`}
                className="w-16 h-16 bg-green-500 hover:bg-green-600 text-white rounded-full flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-transform"
              >
                <Phone size={24} />
              </button>
            )}
            {state.phase === "connected" && (
              <button
                onClick={() => setState((s) => ({ ...s, isMuted: !s.isMuted }))}
                aria-label={state.isMuted ? "Unmute" : "Mute"}
                aria-pressed={state.isMuted}
                className={`w-12 h-12 rounded-full flex items-center justify-center shadow transition-colors ${
                  state.isMuted ? "bg-amber-400 text-white" : "bg-white border border-green-300 text-green-600"
                }`}
              >
                {state.isMuted ? <MicOff size={20} /> : <Mic size={20} />}
              </button>
            )}
            {isActive && (
              <button
                onClick={hangUp}
                aria-label="End call"
                className="w-16 h-16 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-transform"
              >
                <PhoneOff size={24} />
              </button>
            )}
          </div>
        </Card>
      )}

      {/* quick-dial list */}
      {!isActive && (
        <Card>
          <h3 className="font-semibold text-green-800 mb-3 flex items-center gap-2">
            <Radio size={16} /> Quick Dial
          </h3>
          <div className="flex items-center gap-2 border border-green-200 rounded-xl px-3 py-2 bg-white mb-3">
            <Search size={14} className="text-green-400 flex-shrink-0" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search to dial…"
              className="flex-1 bg-transparent outline-none text-sm text-green-800 placeholder-green-400"
              aria-label="Search contacts to dial"
            />
          </div>
          <ul className="space-y-1 max-h-60 overflow-y-auto" aria-label="Quick dial list">
            {filtered.length === 0 ? (
              <li className="text-green-400 text-sm text-center py-4">No matches</li>
            ) : (
              filtered.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => setState((s) => ({ ...s, target: c, error: null }))}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-green-50 transition-colors text-left"
                    aria-label={`Select ${c.name}`}
                  >
                    <Dot status={c.status} />
                    <span className="flex-1 text-sm font-medium text-green-800 truncate">{c.name}</span>
                    <span className="text-xs text-green-400 truncate max-w-[80px]">
                      {c.phoneNumber.blocks.slice(0, 3).join("")}
                    </span>
                    <ChevronDown size={14} className="text-green-300 -rotate-90" aria-hidden="true" />
                  </button>
                </li>
              ))
            )}
          </ul>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// History tab
// ═══════════════════════════════════════════════════════════════════

function HistoryTab({ history }: { history: CallRecord[] }) {
  const icons: Record<CallRecord["direction"], JSX.Element> = {
    incoming: <Phone    size={18} className="text-green-500" />,
    outgoing: <Radio    size={18} className="text-blue-500"  />,
    missed:   <PhoneOff size={18} className="text-red-400"   />,
  };

  if (history.length === 0) {
    return (
      <Card className="text-center py-12 animate-grow-in">
        <div className="text-5xl mb-3" aria-hidden="true">⏱️</div>
        <h2 className="text-lg font-semibold text-green-800 mb-2">No Call History</h2>
        <p className="text-green-400 text-sm">Your calls will appear here.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3 animate-grow-in">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-green-800">Call History</h2>
        <span className="text-xs text-green-400">{history.length} record{history.length !== 1 ? "s" : ""}</span>
      </div>
      <ul className="space-y-2" aria-label="Call history">
        {history.map((r) => (
          <li key={r.id} className="glass rounded-2xl p-4 flex items-center gap-3">
            <div aria-label={r.direction} className="flex-shrink-0">{icons[r.direction]}</div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-green-800">{r.contactName}</div>
              <div className="text-xs text-green-400">
                {new Date(r.timestamp).toLocaleString()}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-xs font-mono text-green-600">
                {r.direction === "missed" ? "Missed" : formatDuration(r.duration)}
              </div>
              <div className="text-[10px] text-green-400 capitalize">{r.direction}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Root page
// ═══════════════════════════════════════════════════════════════════

export default function Page() {
  const [tab,       setTab]       = useState<Tab>("home");
  const [profile,   setProfile]   = useState<UserProfile | null>(null);
  const [contacts,  setContacts]  = useState<Contact[]>([]);
  const [history,   setHistory]   = useState<CallRecord[]>([]);
  const [dialTarget,setDialTarget]= useState<Contact | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [initErr,   setInitErr]   = useState<string | null>(null);

  useEffect(() => {
    try {
      setProfile(loadProfile());
      setContacts(loadContacts());
      setHistory(loadHistory());
    } catch (e) {
      setInitErr(e instanceof Error ? e.message : "Initialisation failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleNameSave = useCallback((name: string) => {
    setProfile((p) => {
      if (!p) return p;
      const updated = { ...p, name };
      persistProfile(updated);
      return updated;
    });
  }, []);

  const handleToggleFav = useCallback((id: string) => {
    setContacts((prev) => {
      const updated = toggleFavorite(prev, id);
      persistContacts(updated);
      return updated;
    });
  }, []);

  const handleDial = useCallback((c: Contact) => {
    setDialTarget(c);
    setTab("dialer");
  }, []);

  const handleCallDone = useCallback((r: CallRecord) => {
    appendRecord(r);
    setHistory((h) => [r, ...h].slice(0, 50));
  }, []);

  // ── Loading screen ─────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 nature-bg">
        <div className="text-6xl animate-float" aria-hidden="true">🌱</div>
        <div className="text-center">
          <h1 className="text-2xl font-bold text-green-800">HydrHost</h1>
          <p className="text-green-500 text-sm mt-1 animate-pulse-s">
            Generating your emoji phone number…
          </p>
        </div>
        <div className="flex gap-2 text-3xl" aria-hidden="true">
          {["🟥","🟦","🟨","🟩","🟪","⬜","🟧","🟫"].map((b, i) => (
            <span key={i} className="animate-float" style={{ animationDelay: `${i * 0.15}s` }}>{b}</span>
          ))}
        </div>
      </div>
    );
  }

  // ── Error screen ───────────────────────────────────────────────
  if (initErr) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 nature-bg px-6">
        <div className="text-5xl" aria-hidden="true">⚠️</div>
        <h1 className="text-xl font-bold text-green-800">Failed to Load</h1>
        <p className="text-green-600 text-sm text-center max-w-xs">{initErr}</p>
        <button
          onClick={() => window.location.reload()}
          className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-full text-sm font-medium transition-colors"
          aria-label="Reload application"
        >
          🔄 Retry
        </button>
      </div>
    );
  }

  // ── App ────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col">
      <Nav active={tab} onChange={setTab} historyCount={history.length} />

      <main
        className="flex-1 max-w-2xl w-full mx-auto px-4 py-6"
        role="main"
        aria-label="HydrHost content"
      >
        {tab === "home" && (
          <HomeTab
            profile={profile}
            contacts={contacts}
            history={history}
            onNav={setTab}
          />
        )}
        {tab === "number" && (
          <NumberTab profile={profile} onNameSave={handleNameSave} />
        )}
        {tab === "contacts" && (
          <ContactsTab
            contacts={contacts}
            onToggleFav={handleToggleFav}
            onDial={handleDial}
          />
        )}
        {tab === "dialer" && (
          <DialerTab
            contacts={contacts}
            seedTarget={dialTarget}
            onCallDone={handleCallDone}
          />
        )}
        {tab === "history" && <HistoryTab history={history} />}
      </main>

      <footer className="text-center py-5 text-xs text-green-400 border-t border-green-100">
        🌱 HydrHost · Emoji Phone Network · <span aria-hidden="true">🐴 🎵 🍀</span>
      </footer>
    </div>
  );
}
