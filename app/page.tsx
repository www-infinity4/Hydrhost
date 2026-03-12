"use client";

import {
  useState, useEffect, useCallback, useRef,
  type ReactNode, type FC,
} from "react";
import {
  Phone, PhoneOff, Mic, MicOff, Star, Search,
  Clock, BookOpen, Home, Radio, ChevronDown, ChevronUp,
  Copy, Check, Pencil, X, Wifi, Activity, Zap, TrendingUp,
} from "lucide-react";
import type {
  UserProfile, Contact, CallRecord, DialState, ContactStatus,
  TokenWallet, BoostType,
} from "./types";
import { LEVEL_NAMES } from "./types";
import {
  loadProfile, persistProfile,
  loadContacts, persistContacts, toggleFavorite,
  loadHistory, appendRecord,
  loadWallet, earnTokens, spendTokens, activateBoost, executeWarp, stompBug,
} from "./storage";
import {
  formatDuration, formatRelative, buildSignalConfig, VALUE_CHAIN,
  type SignalConfig,
} from "./phone-utils";
import { useSignal } from "./use-signal";

// ═══════════════════════════════════════════════════════════════════════════════
// Types & constants
// ═══════════════════════════════════════════════════════════════════════════════

type Tab = "home" | "number" | "contacts" | "dialer" | "earn" | "history";

const STATUS_COLOR: Record<ContactStatus, string> = {
  online: "bg-emerald-500",
  offline: "bg-gray-400",
  busy: "bg-amber-500",
};

// ═══════════════════════════════════════════════════════════════════════════════
// Primitive components
// ═══════════════════════════════════════════════════════════════════════════════

function Dot({ status }: { status: ContactStatus }) {
  return (
    <span
      aria-label={`Status: ${status}`}
      className={`inline-block w-2.5 h-2.5 rounded-full ring-2 ring-white ${STATUS_COLOR[status]}`}
    />
  );
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`glass rounded-3xl p-5 ${className}`}>{children}</div>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Signal Orb
// ═══════════════════════════════════════════════════════════════════════════════

function SignalOrb({
  config, phase, canvasRef, micActive, label, size = "md",
}: {
  config: SignalConfig | null;
  phase: DialState["phase"];
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  micActive: boolean;
  label: string;
  size?: "sm" | "md" | "lg";
}) {
  const orbCls  = size === "lg" ? "w-24 h-24" : size === "md" ? "w-16 h-16" : "w-10 h-10";
  const iconCls = size === "lg" ? "text-3xl"  : size === "md" ? "text-xl"   : "text-sm";

  const borderColor = {
    idle: "border-green-400", scanning: "border-yellow-400",
    ringing: "border-blue-400", connected: "border-emerald-500",
  }[phase];

  const orbEmoji = {
    idle: "📶", scanning: "🔭", ringing: "📳", connected: "📡",
  }[phase];

  return (
    <div className="flex flex-col items-center gap-3" aria-label={label}>
      <div className="relative flex items-center justify-center">
        {phase !== "idle" && (
          <>
            <span className="signal-ripple" aria-hidden="true" />
            <span className="signal-ripple" aria-hidden="true" />
            <span className="signal-ripple" aria-hidden="true" />
          </>
        )}
        <div
          className={`relative ${orbCls} rounded-full border-2 ${borderColor} bg-white/70 shadow-lg flex items-center justify-center transition-all duration-300`}
        >
          {phase === "scanning" && (
            <span className="absolute inset-0 rounded-full border-2 border-yellow-400 border-t-transparent animate-scan" aria-hidden="true" />
          )}
          <span className={iconCls} aria-hidden="true">{orbEmoji}</span>
          {micActive && (
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full ring-2 ring-white animate-pulse-s" aria-label="Mic active" />
          )}
        </div>
      </div>
      <canvas
        ref={canvasRef}
        width={200}
        height={44}
        className="rounded-xl bg-green-50 border border-green-100"
        aria-label={micActive ? "Voice-on-carrier waveform" : "Carrier signal waveform"}
      />
      {config && (
        <p className="text-xs font-mono text-green-400 flex items-center gap-1">
          <Wifi size={10} aria-hidden="true" />
          {config.freqA}Hz · {config.freqB}Hz · {config.pulseOnMs}/{config.pulseOffMs}ms
        </p>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Phone Number Display
// ═══════════════════════════════════════════════════════════════════════════════

function PhoneNumberDisplay({
  pn, size = "lg",
}: {
  pn: { blocks: string[]; raw: string; deviceId: string };
  size?: "sm" | "lg";
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pn.raw);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* unavailable */ }
  };
  return (
    <div className="flex flex-col items-center gap-3">
      <div role="group" aria-label="Emoji phone number" className="flex flex-wrap gap-1 justify-center">
        {pn.blocks.map((b, i) => (
          <span
            key={i}
            className={`leading-none select-none hover:scale-110 transition-transform cursor-default ${size === "lg" ? "text-3xl" : "text-xl"}`}
            aria-label={`Block ${i + 1}: ${b}`}
            title={`Block ${i + 1}`}
          >{b}</span>
        ))}
      </div>
      <div className="flex items-center gap-2 flex-wrap justify-center">
        <span className="text-xs font-mono bg-green-100 text-green-700 px-3 py-1 rounded-full">
          ID: {pn.deviceId}
        </span>
        <button
          onClick={copy}
          className="flex items-center gap-1 text-xs border border-green-300 text-green-600 hover:bg-green-50 px-3 py-1 rounded-full transition-colors"
          aria-label="Copy number"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Token badge
// ═══════════════════════════════════════════════════════════════════════════════

function TokenBadge({ balance, onClick }: { balance: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={`Token balance: ${balance}. Go to Earn tab.`}
      className="flex items-center gap-1 bg-yellow-50 border border-yellow-200 text-yellow-700 text-xs font-bold px-3 py-1 rounded-full hover:bg-yellow-100 transition-colors"
    >
      <span aria-hidden="true">🟡</span>
      {balance}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Navigation
// ═══════════════════════════════════════════════════════════════════════════════

const NAV_ITEMS: Array<{ id: Tab; label: string; Icon: FC<{ size?: number }> }> = [
  { id: "home",     label: "Home",     Icon: Home     },
  { id: "number",   label: "My #",     Icon: Phone    },
  { id: "contacts", label: "Contacts", Icon: BookOpen },
  { id: "dialer",   label: "Dialer",   Icon: Radio    },
  { id: "earn",     label: "Earn",     Icon: Zap      },
  { id: "history",  label: "History",  Icon: Clock    },
];

function Nav({
  active, onChange, wallet, historyCount,
}: {
  active: Tab;
  onChange: (t: Tab) => void;
  wallet: TokenWallet | null;
  historyCount: number;
}) {
  return (
    <nav aria-label="Main navigation" className="sticky top-0 z-50 glass border-b border-green-200 shadow-sm">
      <div className="max-w-2xl mx-auto px-4">
        <div className="flex items-center justify-between py-2.5 border-b border-green-100">
          <div className="flex items-center gap-2">
            <span className="text-xl" aria-hidden="true">🌱</span>
            <span className="font-bold text-green-800 tracking-tight text-sm">HydrHost</span>
            {wallet && (
              <span className="text-xs text-green-500 ml-1">
                {wallet.level} {LEVEL_NAMES[wallet.level]}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-green-400 hidden sm:block">Hydrogen Shell Active</span>
            {wallet && <TokenBadge balance={wallet.balance} onClick={() => onChange("earn")} />}
          </div>
        </div>
        <div className="flex overflow-x-auto" role="tablist" aria-label="App sections">
          {NAV_ITEMS.map(({ id, label, Icon }) => (
            <button
              key={id}
              role="tab"
              aria-selected={active === id}
              aria-label={label}
              onClick={() => onChange(id)}
              className={`relative flex flex-col items-center gap-0.5 px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-all min-w-[52px] ${
                active === id
                  ? "border-green-600 text-green-700 bg-green-50/60"
                  : "border-transparent text-green-500 hover:text-green-700 hover:bg-green-50/40"
              }`}
            >
              <Icon size={15} />
              {label}
              {id === "history" && historyCount > 0 && (
                <span className="absolute top-1 right-0.5 min-w-[14px] h-3.5 bg-green-600 text-white text-[8px] rounded-full flex items-center justify-center px-0.5">
                  {historyCount > 9 ? "9+" : historyCount}
                </span>
              )}
              {id === "earn" && wallet && wallet.balance > 0 && (
                <span className="absolute top-1 right-0.5 min-w-[14px] h-3.5 bg-yellow-500 text-white text-[8px] rounded-full flex items-center justify-center px-0.5">
                  🟡
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Home tab
// ═══════════════════════════════════════════════════════════════════════════════

function HomeTab({
  profile, mySignalConfig, contacts, history, wallet, onNav, onEarn,
}: {
  profile: UserProfile | null;
  mySignalConfig: SignalConfig | null;
  contacts: Contact[];
  history: CallRecord[];
  wallet: TokenWallet | null;
  onNav: (t: Tab) => void;
  onEarn: (amount: number, reason: string) => void;
}) {
  const { canvasRef } = useSignal(mySignalConfig, "idle");
  const online = contacts.filter((c) => c.status === "online").length;
  const favs   = contacts.filter((c) => c.favorite);

  // Award +3 tokens for visiting home each session (once per mount)
  useEffect(() => {
    onEarn(3, "Daily visit bonus 🌱");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-5 animate-grow-in">
      {/* Hero */}
      <Card className="text-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.06] text-5xl flex flex-wrap gap-3 justify-center items-center pointer-events-none select-none" aria-hidden="true">
          {["🌿","🍀","🌻","🐴","🎵","🌊","⭐","🌸"].map((e, i) => (
            <span key={i} className="animate-float" style={{ animationDelay: `${i * 0.4}s` }}>{e}</span>
          ))}
        </div>
        <div className="relative z-10 space-y-4 py-2">
          <div>
            <h2 className="text-2xl font-bold text-green-800">HydrHost</h2>
            <p className="text-green-500 text-sm mt-1">
              Free forever · Your signal is always broadcasting
            </p>
          </div>
          <SignalOrb
            config={mySignalConfig} phase="idle"
            canvasRef={canvasRef} micActive={false}
            label="My device carrier signal" size="lg"
          />
          <p className="text-xs text-green-400 max-w-xs mx-auto">
            Your unique pulsing carrier is live in the hydrogen shell. The AI exchange
            monitors it and routes calls to your exact frequency fingerprint.
          </p>
        </div>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2">
        {([
          { emoji: "📡", value: profile ? "Live"         : "…", label: "Signal",   tab: "number"   as Tab },
          { emoji: "🟢", value: String(online),                   label: "Online",   tab: "contacts" as Tab },
          { emoji: "🟡", value: String(wallet?.balance ?? 0),     label: "Tokens",   tab: "earn"     as Tab },
          { emoji: "⏱️", value: String(history.length),           label: "Calls",    tab: "history"  as Tab },
        ] as const).map((s) => (
          <button
            key={s.label}
            onClick={() => onNav(s.tab)}
            aria-label={`${s.label}: ${s.value}`}
            className="glass rounded-2xl p-3 text-center hover:bg-green-50/60 transition-colors group"
          >
            <div className="text-xl mb-0.5 group-hover:animate-float" aria-hidden="true">{s.emoji}</div>
            <div className="font-bold text-green-800 text-sm">{s.value}</div>
            <div className="text-[10px] text-green-500">{s.label}</div>
          </button>
        ))}
      </div>

      {/* Value chain */}
      <Card>
        <h3 className="font-semibold text-green-800 mb-3 flex items-center gap-2">
          <TrendingUp size={15} /> One-Click Value Chain
        </h3>
        <div className="flex items-center gap-1 overflow-x-auto pb-1" role="list" aria-label="Value chain steps">
          {VALUE_CHAIN.map((step, i) => {
            const unlocked = (wallet?.totalEarned ?? 0) >= step.tokenCost;
            return (
              <div key={step.label} className="flex items-center gap-1 flex-shrink-0" role="listitem">
                <div
                  className={`flex flex-col items-center gap-0.5 p-2 rounded-xl min-w-[52px] transition-all ${
                    unlocked ? "bg-green-50 border border-green-200" : "bg-gray-50 border border-gray-200 opacity-50"
                  }`}
                  aria-label={`${step.label}${unlocked ? " — unlocked" : ` — requires ${step.tokenCost} tokens`}`}
                >
                  <span className="text-xl" aria-hidden="true">{step.emoji}</span>
                  <span className="text-[10px] text-green-700 font-medium">{step.label}</span>
                  {!unlocked && step.tokenCost > 0 && (
                    <span className="text-[9px] text-gray-400 font-mono">{step.tokenCost}🟡</span>
                  )}
                  {unlocked && <span className="text-[9px] text-green-500">✓</span>}
                </div>
                {i < VALUE_CHAIN.length - 1 && (
                  <span className="text-green-300 text-xs flex-shrink-0" aria-hidden="true">→</span>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-xs text-green-400 mt-2">
          Earn 🟡 tokens by using HydrHost — free forever, no charges
        </p>
      </Card>

      {/* My number */}
      {profile && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-green-800 flex items-center gap-2">
              <Phone size={15} /> My Number
            </h3>
            <button onClick={() => onNav("number")} className="text-xs text-green-500 hover:text-green-700 underline" aria-label="View full number">
              Details →
            </button>
          </div>
          <PhoneNumberDisplay pn={profile.phoneNumber} size="lg" />
        </Card>
      )}

      {/* Favorites */}
      {favs.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-green-800 flex items-center gap-2">
              <Star size={15} /> Favorites
            </h3>
            <button onClick={() => onNav("contacts")} className="text-xs text-green-500 hover:text-green-700 underline" aria-label="All contacts">
              All →
            </button>
          </div>
          <ul className="space-y-2">
            {favs.slice(0, 3).map((c) => (
              <li key={c.id} className="flex items-center gap-3 p-3 rounded-xl bg-green-50 hover:bg-green-100 transition-colors">
                <Dot status={c.status} />
                <span className="flex-1 text-sm font-medium text-green-800 truncate">{c.name}</span>
                <span className="text-xs text-green-400 truncate max-w-[60px]">{c.phoneNumber.blocks.slice(0, 3).join("")}…</span>
                <button onClick={() => onNav("dialer")} aria-label={`Dial ${c.name}`} className="text-green-600 hover:text-green-800">
                  <Radio size={14} />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* How it works */}
      <Card>
        <h3 className="font-semibold text-green-800 mb-3 flex items-center gap-2">
          <Activity size={15} /> Signal Architecture
        </h3>
        <ul className="space-y-2 text-sm text-green-700">
          {[
            { e:"📶", t:"Your device emits a unique pulsing tone from its emoji blocks" },
            { e:"🤖", t:"The AI exchange scans the hydrogen shell, ignoring all signals unless routing a call" },
            { e:"🔭", t:"To call someone it scans for their signal, locks on, then rings with their frequency" },
            { e:"🎙️", t:"Once connected your voice attaches to the carrier like electrons on proton states" },
            { e:"🟡", t:"Everything is free — you earn tokens just by being here" },
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

// ═══════════════════════════════════════════════════════════════════════════════
// My Number tab
// ═══════════════════════════════════════════════════════════════════════════════

function NumberTab({
  profile, mySignalConfig, onNameSave,
}: {
  profile: UserProfile | null;
  mySignalConfig: SignalConfig | null;
  onNameSave: (n: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(profile?.name ?? "");
  const [err, setErr]         = useState<string | null>(null);
  const { canvasRef }         = useSignal(mySignalConfig, "idle");

  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[220px] gap-4">
        <div className="text-5xl animate-pulse-s" aria-hidden="true">🌱</div>
        <p className="text-green-600 text-sm animate-pulse-s">Generating your signal…</p>
      </div>
    );
  }

  const save = () => {
    const v = draft.trim();
    if (!v)       { setErr("Name cannot be empty"); return; }
    if (v.length > 40) { setErr("Max 40 characters"); return; }
    setErr(null);
    onNameSave(v);
    setEditing(false);
  };

  const cfg = buildSignalConfig(profile.phoneNumber);

  return (
    <div className="space-y-5 animate-grow-in">
      <Card className="text-center">
        <h2 className="text-xl font-bold text-green-800 mb-1">My Hydrogen Shell Signal</h2>
        <p className="text-xs text-green-400 mb-4">Unique carrier — always broadcasting, never silent</p>
        <SignalOrb config={mySignalConfig} phase="idle" canvasRef={canvasRef} micActive={false} label="My carrier" size="lg" />
        <div className="mt-5">
          <PhoneNumberDisplay pn={profile.phoneNumber} size="lg" />
        </div>
      </Card>

      <Card>
        <h3 className="font-semibold text-green-800 mb-3 flex items-center gap-2">
          <span aria-hidden="true">🌿</span> Display Name
        </h3>
        {editing ? (
          <div className="flex flex-col gap-2">
            <input
              autoFocus type="text" value={draft} maxLength={40}
              onChange={(e) => { setDraft(e.target.value); setErr(null); }}
              placeholder="Your name"
              className="w-full border border-green-300 rounded-xl px-4 py-2 text-green-800 bg-white focus:outline-none focus:ring-2 focus:ring-green-400 text-sm"
              aria-label="Display name" aria-describedby={err ? "name-err" : undefined}
            />
            {err && <p id="name-err" role="alert" className="text-red-500 text-xs">{err}</p>}
            <div className="flex gap-2">
              <button onClick={save} className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-xl py-2 text-sm font-medium transition-colors">Save</button>
              <button onClick={() => { setEditing(false); setDraft(profile.name); setErr(null); }} className="flex-1 border border-green-300 text-green-700 hover:bg-green-50 rounded-xl py-2 text-sm font-medium transition-colors">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-green-800 font-medium">{profile.name}</span>
            <button onClick={() => { setEditing(true); setDraft(profile.name); }} className="flex items-center gap-1 text-xs border border-green-300 text-green-600 hover:bg-green-50 px-3 py-1 rounded-full transition-colors" aria-label="Edit name">
              <Pencil size={11} /> Edit
            </button>
          </div>
        )}
      </Card>

      <Card>
        <h3 className="font-semibold text-green-800 mb-3 flex items-center gap-2">
          <span aria-hidden="true">🔍</span> Device Scan (Signal Source)
        </h3>
        <dl className="space-y-1.5 text-sm">
          {[
            ["Platform",   profile.device.platform],
            ["Language",   profile.device.language],
            ["Timezone",   profile.device.timezone],
            ["Resolution", profile.device.screenResolution],
            ["Color",      `${profile.device.colorDepth}-bit`],
            ["Imprinted",  new Date(profile.device.registeredAt).toLocaleString()],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between items-center border-b border-green-100 pb-1 last:border-0 last:pb-0">
              <dt className="text-green-500">{label}</dt>
              <dd className="font-mono text-green-800 text-xs text-right truncate max-w-[55%]">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card>
        <h3 className="font-semibold text-green-800 mb-3 flex items-center gap-2">
          <Wifi size={15} /> Signal Block Frequencies
        </h3>
        <div className="grid grid-cols-4 gap-2">
          {profile.phoneNumber.blocks.map((b, i) => (
            <div key={i} className="flex flex-col items-center gap-1 p-3 bg-green-50 rounded-xl hover:bg-green-100 transition-colors" aria-label={`Block ${i + 1}: ${b}`}>
              <span className="text-2xl" aria-hidden="true">{b}</span>
              {i === 0 && <span className="text-[10px] text-green-500 font-mono">{cfg.freqA}Hz</span>}
              {i === 1 && <span className="text-[10px] text-green-500 font-mono">{cfg.freqB}Hz</span>}
              {i > 1   && <span className="text-[10px] text-green-300 font-mono">#{i + 1}</span>}
            </div>
          ))}
        </div>
        <p className="text-xs text-green-400 mt-3 text-center">
          Blocks 1 &amp; 2 form your carrier chord — your proton-state signal
        </p>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Contacts tab
// ═══════════════════════════════════════════════════════════════════════════════

function ContactsTab({
  contacts, onToggleFav, onDial,
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
    return (
      (!q || c.name.toLowerCase().includes(q) || c.phoneNumber.raw.includes(q)) &&
      (filter === "all" ||
       (filter === "online"    && c.status === "online") ||
       (filter === "favorites" && c.favorite))
    );
  });

  return (
    <div className="space-y-4 animate-grow-in">
      <div className="glass rounded-2xl flex items-center gap-2 px-4 py-2.5">
        <Search size={15} className="text-green-400 flex-shrink-0" />
        <input
          type="search" value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name or emoji number…"
          className="flex-1 bg-transparent outline-none text-green-800 placeholder-green-400 text-sm"
          aria-label="Search contacts"
        />
        {query && <button onClick={() => setQuery("")} aria-label="Clear" className="text-green-400 hover:text-green-600"><X size={14} /></button>}
      </div>

      <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Filter contacts">
        {(["all","online","favorites"] as Filter[]).map((f) => (
          <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f}
            className={`px-4 py-1 rounded-full text-xs font-medium transition-colors ${filter === f ? "bg-green-600 text-white" : "bg-white border border-green-300 text-green-600 hover:bg-green-50"}`}>
            {f === "online" ? "🟢 Online" : f === "favorites" ? "⭐ Favorites" : "👥 All"}
          </button>
        ))}
        <span className="ml-auto text-xs text-green-400">{shown.length} contact{shown.length !== 1 ? "s" : ""}</span>
      </div>

      {shown.length === 0 ? (
        <Card className="text-center py-10">
          <div className="text-4xl mb-2" aria-hidden="true">��</div>
          <p className="text-green-500 text-sm">{query ? "No matches" : "Nothing here"}</p>
        </Card>
      ) : (
        <ul className="space-y-2" aria-label="Contact list">
          {shown.map((c) => <ContactRow key={c.id} contact={c} onToggleFav={onToggleFav} onDial={onDial} />)}
        </ul>
      )}
    </div>
  );
}

function ContactRow({
  contact, onToggleFav, onDial,
}: {
  contact: Contact;
  onToggleFav: (id: string) => void;
  onDial: (c: Contact) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className="glass rounded-2xl overflow-hidden" aria-label={`Contact: ${contact.name}`}>
      <div className="flex items-center gap-3 p-4">
        <div className="relative flex-shrink-0">
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center font-bold text-green-700">{contact.name[0]}</div>
          <span className="absolute -bottom-0.5 -right-0.5"><Dot status={contact.status} /></span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className="text-sm font-medium text-green-800 truncate">{contact.name}</span>
            {contact.favorite && <Star size={11} className="text-amber-400 flex-shrink-0" fill="currentColor" aria-label="Favorite" />}
          </div>
          <div className="text-xs text-green-400 truncate">
            {contact.phoneNumber.blocks.slice(0, 4).join("")}
            {contact.phoneNumber.blocks.length > 4 && <span className="text-green-300">+{contact.phoneNumber.blocks.length - 4}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => onDial(contact)} aria-label={`Dial ${contact.name}`} className="w-8 h-8 bg-green-600 hover:bg-green-700 text-white rounded-full flex items-center justify-center transition-colors">
            <Phone size={14} />
          </button>
          <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={open ? "Collapse" : "Expand"} className="w-8 h-8 text-green-400 hover:text-green-600 rounded-full flex items-center justify-center transition-colors">
            {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>
      {open && (
        <div className="border-t border-green-100 bg-green-50/50 p-4 space-y-3 animate-slide-up">
          <PhoneNumberDisplay pn={contact.phoneNumber} size="sm" />
          <div className="flex items-center justify-between text-xs text-green-600">
            <span>
              {contact.status === "offline" && contact.lastSeen ? `Last seen ${formatRelative(contact.lastSeen)}`
               : contact.status === "busy" ? "🔴 Busy" : "🟢 Online"}
            </span>
            <button onClick={() => onToggleFav(contact.id)} aria-label={contact.favorite ? "Unfavorite" : "Favorite"}
              className="flex items-center gap-1 border border-green-300 hover:bg-green-100 px-2 py-0.5 rounded-full transition-colors">
              <Star size={11} className={contact.favorite ? "text-amber-400" : "text-green-400"} fill={contact.favorite ? "currentColor" : "none"} />
              {contact.favorite ? "Unfavorite" : "Favorite"}
            </button>
          </div>
          {contact.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {contact.tags.map((t) => <span key={t} className="px-2 py-0.5 bg-green-100 text-green-600 rounded-full text-xs">#{t}</span>)}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Dialer tab
// ═══════════════════════════════════════════════════════════════════════════════

function DialerTab({
  mySignalConfig, contacts, seedTarget, onCallDone, onEarn,
}: {
  mySignalConfig: SignalConfig | null;
  contacts: Contact[];
  seedTarget: Contact | null;
  onCallDone: (r: CallRecord) => void;
  onEarn: (amount: number, reason: string) => void;
}) {
  const [state, setState] = useState<DialState>({
    phase: "idle", isMuted: false, duration: 0, target: seedTarget, error: null,
  });
  const [query, setQuery]   = useState("");
  const timerRef            = useRef<ReturnType<typeof setInterval> | null>(null);
  const targetCfg           = state.target ? buildSignalConfig(state.target.phoneNumber) : null;
  const { canvasRef, micActive, audioError } = useSignal(mySignalConfig, state.phase, targetCfg);

  useEffect(() => {
    if (seedTarget && state.phase === "idle") {
      setState((s) => ({ ...s, target: seedTarget, error: null }));
    }
  }, [seedTarget, state.phase]);

  useEffect(() => {
    if (state.phase === "connected") {
      timerRef.current = setInterval(() => setState((s) => ({ ...s, duration: s.duration + 1 })), 1000);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [state.phase]);

  const dial = useCallback(() => {
    if (!state.target) return;
    setState((s) => ({ ...s, phase: "scanning", error: null, duration: 0 }));
    setTimeout(() => {
      setState((s) => ({ ...s, phase: "ringing" }));
      setTimeout(() => setState((s) => ({ ...s, phase: "connected" })), 4000);
    }, 1600);
  }, [state.target]);

  const hangUp = useCallback(() => {
    const { target, duration, phase } = state;
    setState({ phase: "idle", isMuted: false, duration: 0, target, error: null });
    if (target) {
      const record: CallRecord = {
        id: `call-${Date.now()}`,
        contactId: target.id, contactName: target.name,
        contactNumber: target.phoneNumber.raw, direction: "outgoing",
        duration: phase === "connected" ? duration : 0,
        timestamp: new Date().toISOString(),
      };
      onCallDone(record);
      if (phase === "connected" && duration > 0) {
        onEarn(5, `Call with ${target.name} 📡`);
      }
    }
  }, [state, onCallDone, onEarn]);

  const isActive  = state.phase !== "idle";
  const filtered  = contacts.filter((c) =>
    c.name.toLowerCase().includes(query.toLowerCase()) || c.phoneNumber.raw.includes(query)
  );

  const phaseText: Record<DialState["phase"], string> = {
    idle:      "Select a contact to begin",
    scanning:  "AI scanning hydrogen shell for signal…",
    ringing:   "Signal locked — ringing target device",
    connected: "Connected · voice on carrier",
  };

  return (
    <div className="space-y-5 animate-grow-in">
      <Card className="text-center">
        <div className="text-3xl mb-1" aria-hidden="true">📡</div>
        <h2 className="text-xl font-bold text-green-800">Signal Generator</h2>
        <p className="text-xs text-green-500 mt-1">AI Exchange · Hydrogen Shell Routing</p>
      </Card>

      <Card>
        <div className="flex flex-col items-center gap-1 mb-3">
          <h3 className="text-xs font-semibold text-green-500 uppercase tracking-wide text-center">
            {isActive && state.target ? `${state.target.name} — ${phaseText[state.phase]}` : "Your Device Signal"}
          </h3>
          {audioError && <p className="text-amber-600 text-xs" role="alert">⚠️ {audioError}</p>}
        </div>
        <SignalOrb
          config={isActive ? (targetCfg ?? mySignalConfig) : mySignalConfig}
          phase={state.phase} canvasRef={canvasRef} micActive={micActive}
          label="Signal waveform" size="md"
        />
        {state.phase === "connected" && (
          <p className="text-xs text-green-400 text-center mt-2">
            🎙️ Your voice is attached to the carrier as electron states
          </p>
        )}
      </Card>

      <Card>
        <h3 className="text-xs font-semibold text-green-500 uppercase tracking-wide mb-3">Target</h3>
        {state.target ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center text-xl font-bold text-green-700">{state.target.name[0]}</div>
              <div>
                <div className="font-semibold text-green-800">{state.target.name}</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Dot status={state.target.status} />
                  <span className="text-xs text-green-500">{state.target.status}</span>
                  {targetCfg && <span className="text-xs text-green-300 font-mono ml-1">{targetCfg.freqA}Hz</span>}
                </div>
              </div>
              {!isActive && (
                <button onClick={() => setState((s) => ({ ...s, target: null }))} aria-label="Clear target" className="ml-auto text-green-400 hover:text-green-600">
                  <X size={16} />
                </button>
              )}
            </div>
            <PhoneNumberDisplay pn={state.target.phoneNumber} size="sm" />
          </div>
        ) : (
          <p className="text-green-400 text-sm text-center py-6">No contact selected — pick one below</p>
        )}
      </Card>

      {state.target && (
        <Card className="text-center space-y-4">
          {state.phase === "connected" && (
            <div aria-live="polite" aria-label={`Duration: ${formatDuration(state.duration)}`}>
              <p className="text-3xl font-mono font-bold text-green-600 animate-pulse-s">{formatDuration(state.duration)}</p>
              <div className="flex justify-center gap-0.5 mt-2 text-green-400 h-8">
                {[1,2,3,4,5,6,7].map((n) => <div key={n} className="wave-bar" style={{ height: `${18+n*3}px` }} aria-hidden="true" />)}
              </div>
            </div>
          )}
          {(state.phase === "scanning" || state.phase === "ringing") && (
            <p className="text-green-600 text-sm animate-pulse-s" aria-live="polite" aria-atomic="true">
              {state.phase === "scanning" ? "🔭 Scanning hydrogen shell…" : "📳 Signal locked — ringing…"}
            </p>
          )}
          {state.error && <p className="text-red-500 text-sm" role="alert">⚠️ {state.error}</p>}
          <div className="flex justify-center items-center gap-5">
            {state.phase === "idle" && (
              <button onClick={dial} aria-label={`Call ${state.target.name}`} className="w-16 h-16 bg-green-500 hover:bg-green-600 text-white rounded-full flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all animate-pulse-ring">
                <Phone size={24} />
              </button>
            )}
            {state.phase === "connected" && (
              <button
                onClick={() => setState((s) => ({ ...s, isMuted: !s.isMuted }))}
                aria-label={state.isMuted ? "Unmute" : "Mute"} aria-pressed={state.isMuted}
                className={`w-12 h-12 rounded-full flex items-center justify-center shadow transition-colors ${state.isMuted ? "bg-amber-400 text-white" : "bg-white border border-green-300 text-green-600"}`}
              >
                {state.isMuted ? <MicOff size={20} /> : <Mic size={20} />}
              </button>
            )}
            {isActive && (
              <button onClick={hangUp} aria-label="End call" className="w-16 h-16 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all">
                <PhoneOff size={24} />
              </button>
            )}
          </div>
        </Card>
      )}

      {!isActive && (
        <Card>
          <h3 className="font-semibold text-green-800 mb-3 flex items-center gap-2">
            <Radio size={15} /> Quick Dial
          </h3>
          <div className="flex items-center gap-2 border border-green-200 rounded-xl px-3 py-2 bg-white mb-3">
            <Search size={13} className="text-green-400 flex-shrink-0" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search to dial…" className="flex-1 bg-transparent outline-none text-sm text-green-800 placeholder-green-400" aria-label="Search contacts to dial" />
          </div>
          <ul className="space-y-1 max-h-60 overflow-y-auto" aria-label="Quick dial list">
            {filtered.length === 0 ? (
              <li className="text-green-400 text-sm text-center py-4">No matches</li>
            ) : filtered.map((c) => (
              <li key={c.id}>
                <button onClick={() => setState((s) => ({ ...s, target: c, error: null }))} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-green-50 transition-colors text-left" aria-label={`Select ${c.name}`}>
                  <Dot status={c.status} />
                  <span className="flex-1 text-sm font-medium text-green-800 truncate">{c.name}</span>
                  <span className="text-xs text-green-300 font-mono truncate max-w-[60px]">{c.phoneNumber.blocks.slice(0, 3).join("")}</span>
                  <Wifi size={11} className="text-green-300 flex-shrink-0" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Earn tab — Watch & Earn, Bug Stomper, Level, Boosts, Warps, Value Chain
// ═══════════════════════════════════════════════════════════════════════════════

function EarnTab({
  wallet, onEarn, onBoost, onWarp, onStompBug,
}: {
  wallet: TokenWallet;
  onEarn: (amount: number, reason: string) => void;
  onBoost: (type: BoostType) => void;
  onWarp: () => void;
  onStompBug: () => void;
}) {
  const [watchCooldown, setWatchCooldown] = useState(30);
  const [watchReady,    setWatchReady]    = useState(false);
  const [bugGrid,       setBugGrid]       = useState<Array<boolean>>(() => Array(12).fill(false));
  const [lastEarned,    setLastEarned]    = useState<string | null>(null);
  const watchTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Seed initial bugs
  useEffect(() => {
    const grid = Array(12).fill(false).map((_, i) => i % 5 === 0);
    setBugGrid(grid);
  }, []);

  // Watch & Earn countdown
  useEffect(() => {
    watchTimerRef.current = setInterval(() => {
      setWatchCooldown((c) => {
        if (c <= 1) { setWatchReady(true); return 30; }
        return c - 1;
      });
    }, 1000);
    return () => { if (watchTimerRef.current) clearInterval(watchTimerRef.current); };
  }, []);

  const claimWatch = () => {
    if (!watchReady) return;
    const hasStar = wallet.activeBoosts.some((b) => b.type === "star" && new Date(b.expiresAt).getTime() > Date.now());
    const amount = hasStar ? 10 : 5;
    onEarn(amount, "Watched & earned 🟡");
    setLastEarned(`+${amount} 🟡`);
    setWatchReady(false);
    setWatchCooldown(30);
    setTimeout(() => setLastEarned(null), 2000);
  };

  const stompBugAt = (idx: number) => {
    if (!bugGrid[idx]) return;
    setBugGrid((g) => g.map((v, i) => (i === idx ? false : v)));
    onStompBug();
    setLastEarned("+2 🟡 Bug stomped!");
    setTimeout(() => {
      setLastEarned(null);
      // Respawn a random bug after 3s
      setTimeout(() => {
        setBugGrid((g) => {
          const empty = g.map((v, i) => (!v ? i : -1)).filter((i) => i >= 0);
          if (empty.length === 0) return g;
          const pick = empty[Math.floor(Math.random() * empty.length)];
          return g.map((v, i) => (i === pick ? true : v));
        });
      }, 3000);
    }, 1500);
  };

  const levelOrder = ["♣️","♦️","♥️","♠️"] as const;
  const levelCls   = { "♣️":"level-club","♦️":"level-diamond","♥️":"level-heart","♠️":"level-spade" };
  const nextLevel  = levelOrder[levelOrder.indexOf(wallet.level) + 1];

  return (
    <div className="space-y-5 animate-grow-in">
      {/* Token balance + level */}
      <Card className="text-center">
        <div className="text-5xl mb-1 animate-level" aria-label={`${wallet.balance} tokens`}>🟡</div>
        <div className="text-4xl font-bold text-green-800">{wallet.balance}</div>
        <p className="text-xs text-green-500 mt-1">tokens · earned, never charged</p>

        {lastEarned && (
          <div className="mt-2 text-lg font-bold text-yellow-600 animate-coin" aria-live="polite" aria-atomic="true">
            {lastEarned}
          </div>
        )}

        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-green-600 mb-1">
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${levelCls[wallet.level]}`}>
              {wallet.level} {LEVEL_NAMES[wallet.level]}
            </span>
            {nextLevel && <span className="text-green-400">{wallet.levelProgress}% → {nextLevel}</span>}
            {!nextLevel && <span className="text-green-600 font-bold">Max Level!</span>}
          </div>
          <div className="w-full bg-green-100 rounded-full h-2" role="progressbar" aria-valuenow={wallet.levelProgress} aria-valuemin={0} aria-valuemax={100} aria-label="Level progress">
            <div className="bg-green-500 h-2 rounded-full transition-all duration-500" style={{ width: `${wallet.levelProgress}%` }} />
          </div>
        </div>
      </Card>

      {/* Watch & Earn */}
      <Card>
        <h3 className="font-semibold text-green-800 mb-3 flex items-center gap-2">
          <span aria-hidden="true">👁️</span> Watch &amp; Earn
        </h3>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <p className="text-sm text-green-700">Stay active and claim tokens every 30 seconds</p>
            <p className="text-xs text-green-400 mt-0.5">⭐ Star boost doubles your earn rate</p>
          </div>
          <button
            onClick={claimWatch}
            disabled={!watchReady}
            aria-label={watchReady ? "Claim watch reward" : `Next reward in ${watchCooldown}s`}
            className={`flex flex-col items-center justify-center w-16 h-16 rounded-full text-sm font-bold transition-all shadow ${
              watchReady
                ? "bg-yellow-400 hover:bg-yellow-500 text-white scale-105 animate-pulse-ring"
                : "bg-green-100 text-green-600"
            }`}
          >
            <span className="text-lg" aria-hidden="true">{watchReady ? "🟡" : "⏱"}</span>
            <span className="text-[10px]">{watchReady ? "Claim!" : `${watchCooldown}s`}</span>
          </button>
        </div>
      </Card>

      {/* Bug Stomper mini-game */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-green-800 flex items-center gap-2">
            <span aria-hidden="true">🐛</span> Bug Stomper
          </h3>
          <span className="text-xs text-green-500 bg-green-100 px-2 py-0.5 rounded-full">
            {wallet.bugsStomped} stomped · +2🟡 each
          </span>
        </div>
        <p className="text-xs text-green-500 mb-3">Tap the bugs to stomp them and earn tokens</p>
        <div className="grid grid-cols-6 gap-2" role="grid" aria-label="Bug grid">
          {bugGrid.map((hasBug, idx) => (
            <button
              key={idx}
              onClick={() => stompBugAt(idx)}
              disabled={!hasBug}
              role="gridcell"
              aria-label={hasBug ? `Stomp bug at position ${idx + 1}` : `Empty cell ${idx + 1}`}
              className={`w-full aspect-square rounded-xl flex items-center justify-center text-xl transition-all ${
                hasBug
                  ? "bg-red-50 border border-red-200 hover:bg-red-100 hover:scale-110 animate-bug cursor-pointer"
                  : "bg-green-50 border border-green-100 cursor-default"
              }`}
            >
              {hasBug ? "🐛" : <span className="text-green-200 text-xs">✓</span>}
            </button>
          ))}
        </div>
      </Card>

      {/* Active boosts */}
      {wallet.activeBoosts.length > 0 && (
        <Card>
          <h3 className="font-semibold text-green-800 mb-3 flex items-center gap-2">
            <Zap size={15} /> Active Boosts
          </h3>
          <ul className="space-y-2">
            {wallet.activeBoosts.map((b) => {
              const remaining = Math.max(0, Math.round((new Date(b.expiresAt).getTime() - Date.now()) / 60000));
              return (
                <li key={b.type} className="flex items-center gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-xl">
                  <span className="text-2xl" aria-hidden="true">{b.emoji}</span>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-green-800">{b.label}</div>
                    <div className="text-xs text-green-500">{remaining}m remaining</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* Boost shop */}
      <Card>
        <h3 className="font-semibold text-green-800 mb-3 flex items-center gap-2">
          <span aria-hidden="true">🛒</span> Boost Shop — spend tokens
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {([
            { type: "star" as BoostType, emoji: "⭐", label: "Star Boost", desc: "2× earn rate for 1 hour", cost: 50 },
            { type: "mushroom" as BoostType, emoji: "🍄", label: "Mushroom", desc: "2× research output for 1 hour", cost: 75 },
          ]).map((item) => {
            const active   = wallet.activeBoosts.some((b) => b.type === item.type);
            const canAfford = wallet.balance >= item.cost;
            return (
              <button
                key={item.type}
                onClick={() => onBoost(item.type)}
                disabled={active || !canAfford}
                aria-label={active ? `${item.label} already active` : `Buy ${item.label} for ${item.cost} tokens`}
                className={`flex flex-col items-center gap-1.5 p-4 rounded-2xl border text-center transition-all ${
                  active
                    ? "bg-yellow-50 border-yellow-300 opacity-80"
                    : canAfford
                    ? "bg-white border-green-300 hover:bg-green-50 hover:border-green-400 hover:scale-105"
                    : "bg-gray-50 border-gray-200 opacity-50"
                }`}
              >
                <span className="text-3xl" aria-hidden="true">{item.emoji}</span>
                <span className="text-sm font-semibold text-green-800">{item.label}</span>
                <span className="text-xs text-green-500">{item.desc}</span>
                <span className={`text-xs font-bold mt-1 ${canAfford ? "text-yellow-600" : "text-gray-400"}`}>
                  {active ? "✓ Active" : `${item.cost} 🟡`}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Warp portal */}
      <Card>
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <h3 className="font-semibold text-green-800 flex items-center gap-2">
              <span aria-hidden="true">⚪</span> Warp Portal
            </h3>
            <p className="text-xs text-green-500 mt-1">
              Spend 200 🟡 to warp — leaves a clone, opens new capabilities.{" "}
              {wallet.warpsUsed > 0 && `You've warped ${wallet.warpsUsed} time${wallet.warpsUsed !== 1 ? "s" : ""}.`}
            </p>
          </div>
          <button
            onClick={onWarp}
            disabled={wallet.balance < 200}
            aria-label="Execute warp (costs 200 tokens)"
            className={`w-16 h-16 rounded-full flex flex-col items-center justify-center text-sm font-bold transition-all shadow ${
              wallet.balance >= 200
                ? "bg-purple-100 border-2 border-purple-300 text-purple-700 hover:bg-purple-200 hover:animate-warp"
                : "bg-gray-100 border border-gray-200 text-gray-400 opacity-60"
            }`}
          >
            <span className="text-2xl" aria-hidden="true">⚪</span>
            <span className="text-[10px]">200🟡</span>
          </button>
        </div>
        {wallet.warpsUsed > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {Array.from({ length: wallet.warpsUsed }).map((_, i) => (
              <span key={i} className="text-lg" aria-label={`Warp ${i + 1}`} title={`Warp ${i + 1}`}>⚪</span>
            ))}
          </div>
        )}
      </Card>

      {/* Value chain */}
      <Card>
        <h3 className="font-semibold text-green-800 mb-3 flex items-center gap-2">
          <TrendingUp size={15} /> 🟡 → 💲 Value Chain
        </h3>
        <div className="space-y-2">
          {VALUE_CHAIN.map((step) => {
            const unlocked = wallet.totalEarned >= step.tokenCost;
            return (
              <div
                key={step.label}
                className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${
                  unlocked ? "bg-green-50 border border-green-200" : "bg-gray-50 border border-gray-100 opacity-50"
                }`}
                aria-label={`${step.label}: ${unlocked ? "unlocked" : `requires ${step.tokenCost} tokens`}`}
              >
                <span className="text-2xl flex-shrink-0" aria-hidden="true">{step.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-green-800">{step.label}</div>
                  <div className="text-xs text-green-500 truncate">{step.description}</div>
                </div>
                <div className="flex-shrink-0 text-right">
                  {unlocked
                    ? <span className="text-green-500 text-sm font-bold">✓</span>
                    : <span className="text-xs text-gray-400 font-mono">{step.tokenCost}🟡</span>}
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-green-400 mt-3 text-center italic">
          Free forever — you give, not take 🌿
        </p>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// History tab
// ═══════════════════════════════════════════════════════════════════════════════

function HistoryTab({ history }: { history: CallRecord[] }) {
  const dirIcon: Record<CallRecord["direction"], ReactNode> = {
    incoming: <Phone    size={17} className="text-green-500" />,
    outgoing: <Radio    size={17} className="text-blue-500"  />,
    missed:   <PhoneOff size={17} className="text-red-400"   />,
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
            <div aria-label={r.direction} className="flex-shrink-0">{dirIcon[r.direction]}</div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-green-800">{r.contactName}</div>
              <div className="text-xs text-green-400">{new Date(r.timestamp).toLocaleString()}</div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-xs font-mono text-green-600">{r.direction === "missed" ? "Missed" : formatDuration(r.duration)}</div>
              <div className="text-[10px] text-green-400 capitalize">{r.direction}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Root page
// ═══════════════════════════════════════════════════════════════════════════════

export default function Page() {
  const [tab,        setTab]        = useState<Tab>("home");
  const [profile,    setProfile]    = useState<UserProfile | null>(null);
  const [contacts,   setContacts]   = useState<Contact[]>([]);
  const [history,    setHistory]    = useState<CallRecord[]>([]);
  const [wallet,     setWallet]     = useState<TokenWallet | null>(null);
  const [dialTarget, setDialTarget] = useState<Contact | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [initErr,    setInitErr]    = useState<string | null>(null);

  useEffect(() => {
    try {
      setProfile(loadProfile());
      setContacts(loadContacts());
      setHistory(loadHistory());
      setWallet(loadWallet());
    } catch (e) {
      setInitErr(e instanceof Error ? e.message : "Initialisation failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const mySignalConfig: SignalConfig | null = profile
    ? buildSignalConfig(profile.phoneNumber)
    : null;

  const handleEarn = useCallback((amount: number, reason: string) => {
    setWallet((w) => {
      if (!w) return w;
      return earnTokens(w, amount, reason);
    });
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

  const handleBoost = useCallback((type: BoostType) => {
    setWallet((w) => {
      if (!w) return w;
      return activateBoost(w, type) ?? w;
    });
  }, []);

  const handleWarp = useCallback(() => {
    setWallet((w) => {
      if (!w) return w;
      return executeWarp(w) ?? w;
    });
  }, []);

  const handleStompBug = useCallback(() => {
    setWallet((w) => {
      if (!w) return w;
      return stompBug(w);
    });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 nature-bg">
        <div className="text-6xl animate-float" aria-hidden="true">🌱</div>
        <div className="text-center">
          <h1 className="text-2xl font-bold text-green-800">HydrHost</h1>
          <p className="text-green-500 text-sm mt-1 animate-pulse-s">Imprinting signal to hydrogen shell…</p>
        </div>
        <div className="flex gap-1.5 text-3xl" aria-hidden="true">
          {["🟥","🟦","🟨","🟩","🟪","⬜","🟧","🟫"].map((b, i) => (
            <span key={i} className="animate-float" style={{ animationDelay: `${i * 0.15}s` }}>{b}</span>
          ))}
        </div>
      </div>
    );
  }

  if (initErr) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 nature-bg px-6">
        <div className="text-5xl" aria-hidden="true">⚠️</div>
        <h1 className="text-xl font-bold text-green-800">Failed to Load</h1>
        <p className="text-green-600 text-sm text-center max-w-xs">{initErr}</p>
        <button onClick={() => window.location.reload()} className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-full text-sm font-medium transition-colors">
          🔄 Retry
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Nav active={tab} onChange={setTab} wallet={wallet} historyCount={history.length} />
      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-6" role="main" aria-label="HydrHost content">
        {tab === "home"     && <HomeTab profile={profile} mySignalConfig={mySignalConfig} contacts={contacts} history={history} wallet={wallet} onNav={setTab} onEarn={handleEarn} />}
        {tab === "number"   && <NumberTab profile={profile} mySignalConfig={mySignalConfig} onNameSave={handleNameSave} />}
        {tab === "contacts" && <ContactsTab contacts={contacts} onToggleFav={handleToggleFav} onDial={handleDial} />}
        {tab === "dialer"   && <DialerTab mySignalConfig={mySignalConfig} contacts={contacts} seedTarget={dialTarget} onCallDone={handleCallDone} onEarn={handleEarn} />}
        {tab === "earn"     && wallet && <EarnTab wallet={wallet} onEarn={handleEarn} onBoost={handleBoost} onWarp={handleWarp} onStompBug={handleStompBug} />}
        {tab === "history"  && <HistoryTab history={history} />}
      </main>
      <footer className="text-center py-4 text-xs text-green-400 border-t border-green-100">
        🌱 HydrHost · Free Forever · Hydrogen Shell Signal Network · <span aria-hidden="true">🐴 🎵 🍀</span>
      </footer>
    </div>
  );
}
