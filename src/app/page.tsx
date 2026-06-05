"use client";

import * as React from "react";

import { cn } from "@/lib/cn";
import {
  AlertTriangle,
  Bell,
  Camera,
  Check,
  Edit3,
  ImageIcon,
  Keyboard,
  Mic,
  Plus,
  ShoppingBasket,
  X,
} from "@/lib/icons";

/* ──────────────────────────────────────────────────────────────────────────
 * Household List — V1 stickiness prototype (real input, no dummy list).
 * DESIGN.md + updated guardrails compliant.
 *
 * Flow: blank Start → Speak / Type / Scan → confirm (editable) → My List
 * → "Mark what you bought" → reconcile → ticked + remaining.
 * History tab: sample data clearly labelled.
 *
 * INPUT STATUS:
 *   • Type  → LIVE (local parser)
 *   • Speak → LIVE via Sarvam Saarika v3 (POST /api/stt).
 *             Falls back to VOICE_SAMPLE if SARVAM_API_KEY not set or API errors.
 *   • Scan  → LIVE via Sarvam Document Intelligence / Sarvam Vision
 *             (POST /api/ocr — 5-step async job, ~10-25 s).
 *             Falls back to SCAN_SAMPLE on error.
 * ────────────────────────────────────────────────────────────────────────── */

/* ─── i18n ─────────────────────────────────────────────────────────────────── */

const EN = {
  startTitle: "Your household shopping list",
  startSub: "Add items by speaking, typing, or scanning. See what's left, tick off what you buy.",
  benefitAdd: "Add anything",
  benefitTick: "Tick off bought",
  benefitPending: "See what's left",
  createCta: "Create your list",
  tabList: "My List",
  tabHistory: "History",
  toBuySuffix: "to buy",
  boughtSuffix: "bought",
  markBought: "Mark what you bought",
  addMore: "Add more",
  stillToBuy: "Still to buy",
  boughtHeading: "Bought",
  addTitle: "Add items",
  buyTitle: "What did you buy?",
  modeSpeak: "Speak",
  modeType: "Type",
  modeScan: "Scan",
  modePicture: "Picture",
  listening: "Listening…",
  stopRead: "Done",
  reading: "Reading your list…",
  typePlaceholder: "e.g. milk, 2 kg rice, salt",
  readList: "Read my list",
  scanPrompt: "Photo of your list or bill — not the items themselves",
  scanCta: "Take photo",
  scanGallery: "Upload from gallery",
  scanReading: "Scanning your list… this takes 10–20 seconds",
  confirmTitle: "We heard these — confirm",
  confirmHint: "Edit or untick to skip",
  addAnother: "Add another",
  itemPlaceholder: "e.g. potato 2 kg",
  reconcileTitle: "We matched these as bought",
  reconcileHint: "Tap to tick or untick, then tap Done",
  recognizedLabel: "From what you shared:",
  notMatched: "not on your list",
  updateList: "Done",
  sampleNote: "Sample data — not from your activity",
  historyFooter:
    "Every bill or photo would be recorded here — your spending ledger builds from this.",
  emptyListNote: "Your list is empty — add items to get going.",
  micDenied: "Mic access denied. Switch to Type mode or allow microphone access.",
};

type Strings = typeof EN;
const HI: Partial<Strings> = {};

/* ─── Types ───────────────────────────────────────────────────────────────── */

type Lang = "en" | "hi";
type Mode = "voice" | "type" | "scan";
type Item = { id: string; name: string; qty: string; bought: boolean };
type Draft = { id: string; name: string; qty: string; include: boolean; focusOnMount?: boolean };
type HistEntry = { id: string; store: string; icon: string; date: string; amount: string; items: string };

/* ─── Sample data ─────────────────────────────────────────────────────────── */

const SAMPLE_HISTORY: HistEntry[] = [
  { id: "s1", store: "Reliance Fresh", icon: "🛒", date: "28 May", amount: "₹540", items: "Atta, Onion, Salt" },
  { id: "s2", store: "Blinkit",        icon: "🛵", date: "24 May", amount: "₹215", items: "Milk, Bread, Eggs" },
  { id: "s3", store: "Local kirana",   icon: "🏪", date: "19 May", amount: "₹180", items: "Rice, Dal, Sugar" },
];

/* ─── Parser ──────────────────────────────────────────────────────────────── */

const NUM =
  "(?:\\d+(?:\\.\\d+)?|half|a|one|two|three|four|five|six|seven|eight|nine|ten|dozen|ek|do|teen|char|paanch|aadha)";
const UNIT =
  "(?:kgs?|kilos?|kilo|grams?|gms?|g|litres?|liters?|ltr|ml|l|pkts?|packets?|pcs?|pieces?|piece|dozen|gucch|bundle)";

function cap(s: string): string {
  s = s.trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/**
 * Pre-process Sarvam Markdown output before item parsing.
 * Handles: table rows, numbered lists, heading markers, bold/italic, bullets.
 */
function cleanMarkdown(raw: string): string {
  return raw
    .split("\n")
    .map((line) => {
      // Skip pure separator lines (e.g. "| --- | --- |" or "---")
      const stripped = line.replace(/[\s|:*_-]/g, "");
      if (!stripped) return "";

      // Strip heading markers (# ## ###)
      line = line.replace(/^#+\s*/, "");

      // Handle table rows: extract text from pipe-delimited cells
      // e.g. "| आटा | 5 kg |" → "आटा 5 kg"
      if (line.includes("|")) {
        const cells = line
          .split("|")
          .map((c) => c.trim())
          .filter((c) => c && !/^[-:\s]+$/.test(c));
        if (cells.length > 0) {
          line = cells.join(" ");
        }
      }

      // Strip numbered list markers: "1. " "2) " "१. " etc.
      line = line.replace(/^\s*[\d१२३४५६७८९०]+[.)]\s+/, "");

      // Strip bold/italic Markdown: **text** → text, *text* → text
      line = line.replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1");

      // Strip leading bullets/dashes (parseItems also does this)
      line = line.replace(/^\s*[-•*]\s*/, "");

      return line.trim();
    })
    .filter(Boolean)
    .join("\n");
}

function parseItems(raw: string): { name: string; qty: string }[] {
  if (!raw.trim()) return [];
  const parts = raw
    .split(/,|\n|;|\band\b|\baur\b|और/gi)
    .map((p) => p.trim())
    .filter(Boolean);
  const qtyRe = new RegExp(`\\b${NUM}\\s?${UNIT}\\b`, "i");
  return parts
    .map((part) => {
      let name = part;
      let qty = "";
      const m = part.match(qtyRe);
      if (m) {
        qty = m[0].replace(/\s+/g, " ").trim();
        name = part.replace(m[0], " ");
      } else {
        const lead = part.match(/^\s*(\d+(?:\.\d+)?)\s+(.+)$/);
        if (lead) { qty = lead[1]; name = lead[2]; }
      }
      name = name.replace(/\s{2,}/g, " ").replace(/^[-•*]\s*/, "").trim();
      if (!name) { name = part; qty = ""; }
      return { name: cap(name), qty };
    })
    .filter((i) => i.name.length > 0);
}

/* ─── Fallback samples (used when live APIs are unavailable) ─────────────── */

const VOICE_SAMPLE = "milk, three kilo rice, one packet salt";
const SCAN_SAMPLE  = "Aashirvaad Atta 5 kg\nOnion 1 kg\nTata Salt 1 pkt\nAmul Milk 1 l";

function recognize(typed: string): { name: string; qty: string }[] {
  return parseItems(typed);
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9ऀ-ॿ ]/g, " ").replace(/\s+/g, " ").trim();
}

/* ─── Cross-language synonym dictionary ───────────────────────────────────── */

/**
 * Maps canonical English grocery terms to their Hindi and Hinglish equivalents.
 * Used by matchBought so that "चावल" correctly matches "Rice" and vice versa.
 */
const SYNONYMS: Record<string, string[]> = {
  rice:    ["चावल", "chawal", "chaawal", "bhaat", "bhath", "javal", "chawl"],
  milk:    ["दूध", "doodh", "dudh", "doodha"],
  salt:    ["नमक", "namak", "loon", "nun"],
  atta:    ["आटा", "flour", "wheat flour", "gehu", "gehun", "maida", "मैदा", "गेहूं"],
  onion:   ["प्याज", "pyaaz", "pyaz", "kanda", "pyaja"],
  potato:  ["आलू", "aloo", "aalu", "batata", "aaloo"],
  tomato:  ["टमाटर", "tamatar", "tamaatar"],
  sugar:   ["चीनी", "cheeni", "shakkar", "chini"],
  dal:     ["दाल", "lentil", "lentils", "arhar", "moong", "masoor", "chana", "daal"],
  oil:     ["तेल", "tel", "cooking oil", "sarson", "refined oil"],
  bread:   ["ब्रेड", "pav", "pau", "double roti", "bread"],
  egg:     ["अंडा", "anda", "eggs", "अंडे", "ande"],
  ghee:    ["घी", "ghi", "clarified butter"],
  tea:     ["चाय", "chai"],
  coffee:  ["कॉफी", "kaafi", "coffee"],
  soap:    ["साबुन", "sabun"],
  shampoo: ["शैम्पू", "shampu"],
  paneer:  ["पनीर", "cottage cheese"],
  curd:    ["दही", "dahi", "yogurt", "yoghurt", "dahee"],
  butter:  ["मक्खन", "makhan"],
  biscuit: ["बिस्कुट", "biskut", "cookie"],
  chips:   ["चिप्स", "snacks"],
  water:   ["पानी", "paani"],
};

/** Return the full synonym group (all variants) for a given name string. */
function getSynonymGroup(name: string): Set<string> {
  const n = norm(name);
  const group = new Set<string>([n]);

  for (const [eng, synonyms] of Object.entries(SYNONYMS)) {
    const engN = norm(eng);
    if (engN === n || synonyms.some((s) => norm(s) === n)) {
      group.add(engN);
      synonyms.forEach((s) => group.add(norm(s)));
    }
  }
  return group;
}

function matchBought(boughtNames: string[], items: Item[]): Set<string> {
  const matched = new Set<string>();
  const bn = boughtNames.map(norm).filter(Boolean);
  for (const it of items) {
    const itn = norm(it.name);
    const itSynonyms = getSynonymGroup(it.name);
    const itTokens = itn.split(" ").filter((tk) => tk.length > 2);
    for (const b of bn) {
      const bSynonyms = getSynonymGroup(b);

      // Direct substring / token match
      if (
        itn.includes(b) ||
        b.includes(itn) ||
        itTokens.some((tk) => b.split(" ").includes(tk))
      ) {
        matched.add(it.id);
        break;
      }

      // Synonym overlap match
      const hasOverlap = [...itSynonyms].some((s) => bSynonyms.has(s));
      if (hasOverlap) {
        matched.add(it.id);
        break;
      }
    }
  }
  return matched;
}

/* ─── Sarvam API helpers ──────────────────────────────────────────────────── */

/** POST audio blob → /api/stt → transcript string */
async function sarvamSTT(blob: Blob): Promise<string> {
  const form = new FormData();
  form.append("audio", blob, "recording.webm");
  const res = await fetch("/api/stt", { method: "POST", body: form });
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error?: string };
    throw new Error(error ?? `HTTP ${res.status}`);
  }
  const { transcript } = await res.json() as { transcript?: string };
  return transcript ?? "";
}

/**
 * POST image file → /api/ocr → extracted text.
 * Sarvam Document Intelligence job (~10-25 s for a single-page photo).
 * Falls back to SCAN_SAMPLE in the caller if this throws.
 */
async function sarvamOCR(file: File): Promise<string> {
  const form = new FormData();
  form.append("image", file, file.name || "photo.jpg");
  const res = await fetch("/api/ocr", { method: "POST", body: form });
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error?: string };
    throw new Error(error ?? `HTTP ${res.status}`);
  }
  const { text } = await res.json() as { text?: string };
  return text ?? "";
}

/* ─── Root ────────────────────────────────────────────────────────────────── */

export default function HouseholdHub() {
  const [lang, setLang] = React.useState<Lang>("en");
  const [started, setStarted] = React.useState(false);
  const [tab, setTab] = React.useState<"list" | "history">("list");
  const [items, setItems] = React.useState<Item[]>([]);
  const [addOpen, setAddOpen] = React.useState(false);
  const [addInitialMode, setAddInitialMode] = React.useState<Mode>("voice");
  const [buyOpen, setBuyOpen] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);

  const t: Strings = lang === "hi" ? { ...EN, ...HI } : EN;

  const flashToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  };

  const openAdd = (mode: Mode = "voice") => {
    setAddInitialMode(mode);
    setAddOpen(true);
  };

  const addItems = (drafts: Draft[]) => {
    const incoming = drafts.filter((d) => d.include && d.name.trim());
    setItems((prev) => {
      const have = new Set(prev.map((i) => norm(i.name)));
      const fresh = incoming
        .filter((d) => !have.has(norm(d.name)))
        .map((d, i) => ({ id: `it-${Date.now()}-${i}`, name: cap(d.name), qty: d.qty.trim(), bought: false }));
      return [...prev, ...fresh];
    });
    setStarted(true);
    setAddOpen(false);
    flashToast(`${incoming.length} item${incoming.length === 1 ? "" : "s"} added`);
  };

  const applyBought = (ids: string[]) => {
    const set = new Set(ids);
    setItems((prev) => prev.map((it) => ({ ...it, bought: set.has(it.id) })));
    setBuyOpen(false);
    const remaining = items.length - ids.length;
    flashToast(`${ids.length} marked bought · ${remaining < 0 ? 0 : remaining} ${t.toBuySuffix}`);
  };

  const reset = () => {
    setStarted(false);
    setItems([]);
    setTab("list");
    setAddOpen(false);
    setBuyOpen(false);
  };

  return (
    <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
      {!started ? (
        <StartScreen t={t} lang={lang} setLang={setLang} onCreate={openAdd} />
      ) : (
        <>
          <TabBar t={t} lang={lang} setLang={setLang} tab={tab} setTab={setTab} onReset={reset} />
          {tab === "list" ? (
            <ListView t={t} items={items} onBuy={() => setBuyOpen(true)} onAdd={() => openAdd("voice")} />
          ) : (
            <HistoryView t={t} />
          )}
        </>
      )}

      {addOpen && (
        <AddSheet t={t} initialMode={addInitialMode} onClose={() => setAddOpen(false)} onConfirm={addItems} />
      )}
      {buyOpen && (
        <BuySheet t={t} items={items} onClose={() => setBuyOpen(false)} onConfirm={applyBought} />
      )}

      {toast && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 z-50 flex justify-center px-4">
          <div className="rounded-full bg-zinc-950 px-5 py-2.5 text-body-xs font-medium text-white">
            {toast}
          </div>
        </div>
      )}
    </main>
  );
}

/* ─── Chip (tabs / lang toggle only) ─────────────────────────────────────── */

function Chip({
  active, onClick, children, className,
}: {
  active?: boolean; onClick?: () => void; children: React.ReactNode; className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-label-s font-bold transition-colors",
        active ? "border-gray-900 bg-gray-900 text-gray-100" : "border-gray-300 bg-gray-200 text-gray-900",
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ─── ModeTab (input mode selector inside sheets) ─────────────────────────
 * Selected state uses primary brand colour instead of gray-900
 * so it reads as "active/chosen" not "darkened/disabled."
 * ────────────────────────────────────────────────────────────────────────── */

function ModeTab({
  active, onClick, children, className,
}: {
  active?: boolean; onClick?: () => void; children: React.ReactNode; className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-full border py-2.5 text-label-l font-bold transition-colors",
        active
          ? "border-primary bg-primary text-white"
          : "border-gray-300 bg-gray-100 text-gray-700",
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ─── Pill button ─────────────────────────────────────────────────────────── */

function PillButton({
  primary, full, disabled, onClick, children, className,
}: {
  primary?: boolean; full?: boolean; disabled?: boolean;
  onClick?: () => void; children: React.ReactNode; className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center justify-center gap-2 rounded-full py-3.5 text-button font-bold transition-colors disabled:opacity-40",
        primary ? "bg-primary text-white" : "bg-gray-100 text-text-high",
        full && "w-full",
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ─── Lang toggle ─────────────────────────────────────────────────────────── */

function LangToggle({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  return (
    <div className="flex shrink-0 gap-1">
      {(["en", "hi"] as const).map((l) => (
        <Chip key={l} active={lang === l} onClick={() => setLang(l)} className="px-2.5 py-0.5">
          {l === "en" ? "EN" : "हिं"}
        </Chip>
      ))}
    </div>
  );
}

/* ─── Start screen ────────────────────────────────────────────────────────── */

function StartScreen({
  t, lang, setLang, onCreate,
}: {
  t: Strings; lang: Lang; setLang: (l: Lang) => void; onCreate: (mode?: Mode) => void;
}) {
  return (
    <div className="pt-safe flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-end px-4 py-3">
        <LangToggle lang={lang} setLang={setLang} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 py-2">
        <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-primary">
          <ShoppingBasket size={36} className="text-white" />
        </div>

        <p className="text-center text-headline-m font-black leading-tight tracking-tight text-text-high">
          {t.startTitle}
        </p>
        <p className="mt-3 max-w-[270px] text-center text-body-s font-medium leading-normal text-text-low">
          {t.startSub}
        </p>

        <div className="mt-6 flex w-full gap-3">
          <BenefitTile iconBg="bg-amber-50" icon={<Edit3 size={18} className="text-amber-600" />} label={t.benefitAdd} />
          <BenefitTile iconBg="bg-green-50" icon={<Check size={18} className="text-green-600" />} label={t.benefitTick} />
          <BenefitTile iconBg="bg-blue-50"  icon={<Bell  size={18} className="text-blue-600"  />} label={t.benefitPending} />
        </div>
      </div>

      <div className="pb-safe shrink-0 px-4 pb-4 pt-3">
        {/* Fix 1: Mode entry chips use bg-gray-900/text-white so they read as solid,
            tappable action buttons — not the muted gray that looked disabled. */}
        <div className="mb-3 flex gap-2">
          <ModeEntryChip icon={<Mic      size={14} />} label={t.modeSpeak} onClick={() => onCreate("voice")} />
          <ModeEntryChip icon={<Keyboard size={14} />} label={t.modeType}  onClick={() => onCreate("type")}  />
          <ModeEntryChip icon={<Camera   size={14} />} label={t.modeScan}  onClick={() => onCreate("scan")}  />
        </div>
        <PillButton primary full onClick={() => onCreate("voice")}>
          <Plus size={18} />
          {t.createCta}
        </PillButton>
      </div>
    </div>
  );
}

function BenefitTile({ iconBg, icon, label }: { iconBg: string; icon: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-2.5 rounded-xl bg-gray-100 px-2 py-4">
      <span className={cn("flex h-10 w-10 items-center justify-center rounded-lg", iconBg)}>
        {icon}
      </span>
      <p className="text-center text-body-2xs font-medium leading-snug text-text-high">{label}</p>
    </div>
  );
}

/* Fix 1: Dark filled chips on the start screen so they clearly read as
   "tap me" buttons rather than greyed-out/disabled UI. */
function ModeEntryChip({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-gray-900 py-2.5 text-label-l font-bold text-white transition-colors active:bg-gray-700"
    >
      {icon}
      {label}
    </button>
  );
}

/* ─── Tab bar ─────────────────────────────────────────────────────────────── */

function TabBar({
  t, lang, setLang, tab, setTab, onReset,
}: {
  t: Strings; lang: Lang; setLang: (l: Lang) => void;
  tab: "list" | "history"; setTab: (v: "list" | "history") => void; onReset: () => void;
}) {
  return (
    <header className="pt-safe flex shrink-0 items-center gap-3 bg-white px-4 py-3">
      <button onClick={onReset} aria-label="Reset"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary">
        <ShoppingBasket size={18} className="text-white" />
      </button>
      <div className="flex flex-1 gap-1.5">
        {(["list", "history"] as const).map((id) => (
          <Chip key={id} active={tab === id} onClick={() => setTab(id)} className="flex-1 text-center">
            {id === "list" ? t.tabList : t.tabHistory}
          </Chip>
        ))}
      </div>
      <LangToggle lang={lang} setLang={setLang} />
    </header>
  );
}

/* ─── List view ───────────────────────────────────────────────────────────── */

function ListView({ t, items, onBuy, onAdd }: { t: Strings; items: Item[]; onBuy: () => void; onAdd: () => void }) {
  const toBuy  = items.filter((i) => !i.bought);
  const bought = items.filter((i) => i.bought);

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <p className="mb-4 text-body-xs font-medium text-text-disabled">
          {toBuy.length} {t.toBuySuffix}
          {bought.length > 0 ? ` · ${bought.length} ${t.boughtSuffix}` : ""}
        </p>

        {items.length === 0 && (
          <p className="mt-8 text-center text-body-s font-medium text-text-disabled">{t.emptyListNote}</p>
        )}

        {toBuy.length > 0 && (
          <div className="mb-6">
            {toBuy.map((it, i) => (
              <React.Fragment key={it.id}>
                {i > 0 && <div className="h-px bg-gray-200" />}
                <div className="flex items-center gap-3 py-3">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  <span className="flex-1 text-body-s font-medium text-text-high">{it.name}</span>
                  {it.qty && <span className="text-body-xs font-medium text-text-disabled">{it.qty}</span>}
                </div>
              </React.Fragment>
            ))}
          </div>
        )}

        {bought.length > 0 && (
          <div>
            <p className="mb-3 flex items-center gap-1.5 text-overline font-bold uppercase tracking-wide text-text-disabled">
              <Check size={11} className="text-success" />
              {t.boughtHeading} · {bought.length}
            </p>
            <div className="opacity-60">
              {bought.map((it, i) => (
                <React.Fragment key={it.id}>
                  {i > 0 && <div className="h-px bg-gray-200" />}
                  <div className="flex items-center gap-3 py-3">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success">
                      <Check size={11} className="text-white" />
                    </span>
                    <span className="flex-1 text-body-s font-medium text-text-low line-through">{it.name}</span>
                    {it.qty && <span className="text-body-xs font-medium text-text-disabled line-through">{it.qty}</span>}
                  </div>
                </React.Fragment>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="pb-safe flex shrink-0 flex-col gap-2.5 bg-white px-4 py-4">
        <PillButton primary full onClick={onBuy} disabled={toBuy.length === 0}>
          <Check size={18} />{t.markBought}
        </PillButton>
        <PillButton full onClick={onAdd}>
          <Plus size={18} />{t.addMore}
        </PillButton>
      </div>
    </>
  );
}

/* ─── History view ────────────────────────────────────────────────────────── */

function HistoryView({ t }: { t: Strings }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
      <div className="mb-4 flex items-center gap-2.5 rounded-xl bg-gray-100 p-3.5">
        <AlertTriangle size={14} className="shrink-0 text-text-disabled" />
        <p className="text-body-xs font-medium text-text-low">{t.sampleNote}</p>
      </div>
      <div className="flex flex-col gap-3">
        {SAMPLE_HISTORY.map((h) => (
          <div key={h.id} className="rounded-xl bg-gray-100 p-4">
            <div className="flex items-center gap-2.5">
              <span className="text-base">{h.icon}</span>
              <span className="text-title-s font-bold text-text-high">{h.store}</span>
              <span className="ml-auto text-title-s font-bold text-primary">{h.amount}</span>
            </div>
            <p className="mt-1.5 text-body-xs font-medium text-text-low">{h.date} · {h.items}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 px-1 text-body-xs font-medium leading-relaxed text-text-disabled">{t.historyFooter}</p>
    </div>
  );
}

/* ─── Sheet ───────────────────────────────────────────────────────────────── */

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 z-40 bg-black opacity-40" />
      <div className="absolute inset-x-0 bottom-0 z-50 flex max-h-[90%] flex-col rounded-t-3xl bg-white shadow-high">
        <div className="flex shrink-0 justify-center pt-3 pb-1">
          <span className="h-1 w-10 rounded-full bg-gray-200" />
        </div>
        <div className="flex shrink-0 items-center justify-between px-5 pb-3 pt-1">
          <p className="text-headline-3xs font-black text-text-high">{title}</p>
          <button onClick={onClose} aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-text-low">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

/* ─── Mode chips (inside sheets) — Fix 2 ─────────────────────────────────
 * Uses ModeTab instead of Chip: selected = brand primary (not gray-900/black).
 * ────────────────────────────────────────────────────────────────────────── */

function ModeChips({ t, mode, setMode, scanLabel }: {
  t: Strings; mode: Mode; setMode: (m: Mode) => void; scanLabel: string;
}) {
  const chips: { id: Mode; Icon: typeof Mic; label: string }[] = [
    { id: "voice", Icon: Mic,      label: t.modeSpeak },
    { id: "type",  Icon: Keyboard, label: t.modeType  },
    { id: "scan",  Icon: ImageIcon, label: scanLabel  },
  ];
  return (
    <div className="flex shrink-0 gap-2">
      {chips.map(({ id, Icon, label }) => (
        <ModeTab key={id} active={mode === id} onClick={() => setMode(id)}>
          <Icon size={14} />{label}
        </ModeTab>
      ))}
    </div>
  );
}

/* ─── Skeleton shimmer ────────────────────────────────────────────────────── */

function SkeletonLoader({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-3 py-2">
      <div className="h-12 w-full animate-pulse rounded-xl bg-gray-100" />
      <div className="h-20 w-full animate-pulse rounded-xl bg-gray-100" />
      <div className="h-12 w-full animate-pulse rounded-xl bg-gray-100" />
      <p className="pt-1 text-center text-body-xs font-medium text-text-disabled">{label}</p>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * CapturePane — handles voice / type / scan input.
 *
 * VOICE — MediaRecorder lifecycle:
 *   • Starts recording (getUserMedia) when mode === "voice" and not processing.
 *   • User taps "Done":
 *       1. Sets local `stopping` state (button disabled, label changes).
 *       2. Stops the MediaRecorder; `onstop` fires when the final chunk is flushed.
 *       3. Assembles chunks into a Blob and calls onCapture(blob).
 *   • Parent receives the blob, POSTs to /api/stt (Sarvam), parses result.
 *   • If mic is denied: shows a message, falls back gracefully.
 *   • Cleanup: stops stream tracks when mode changes or component unmounts.
 *
 * SCAN — Fix 7: Two separate buttons:
 *   • "Take photo"         → input with capture="environment" (opens rear camera)
 *   • "Upload from gallery" → input without capture attr (opens file picker / gallery)
 *
 * TYPE — unchanged; onCapture() called with no blob.
 * ────────────────────────────────────────────────────────────────────────── */

function CapturePane({
  t, mode, text, setText, processing, onCapture, pictureMode,
}: {
  t: Strings;
  mode: Mode;
  text: string;
  setText: (s: string) => void;
  processing: boolean;
  /** Voice: called with audio Blob. Scan: called with image File. Type: called with no arg. */
  onCapture: (data?: Blob | File) => void;
  pictureMode: boolean;
}) {
  const recorderRef    = React.useRef<MediaRecorder | null>(null);
  const chunksRef      = React.useRef<Blob[]>([]);
  const cameraInputRef = React.useRef<HTMLInputElement>(null);
  const galleryInputRef = React.useRef<HTMLInputElement>(null);
  const [micGranted, setMicGranted] = React.useState<boolean | null>(null);
  const [stopping,   setStopping]   = React.useState(false);

  /* Start/stop MediaRecorder whenever mode enters/leaves "voice" */
  React.useEffect(() => {
    if (mode !== "voice" || processing) return;

    setStopping(false);
    let cancelled = false;
    let localStream: MediaStream | null = null;
    let localRec: MediaRecorder | null = null;

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        localStream = stream;

        const mimeType =
          ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"]
            .find((t) => MediaRecorder.isTypeSupported(t)) ?? "";

        localRec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        chunksRef.current = [];
        localRec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
        localRec.start(200); // collect chunks every 200 ms
        recorderRef.current = localRec;
        setMicGranted(true);
      })
      .catch(() => { if (!cancelled) setMicGranted(false); });

    return () => {
      cancelled = true;
      if (localRec && localRec.state !== "inactive") localRec.stop();
      localStream?.getTracks().forEach((t) => t.stop());
      recorderRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, processing]);

  /* Fix 6: "Done" handler (was "Stop & read") */
  const handleDone = () => {
    setStopping(true);
    const rec = recorderRef.current;

    if (!rec || rec.state === "inactive" || chunksRef.current.length === 0) {
      onCapture(undefined);
      setStopping(false);
      return;
    }

    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
      rec.stream.getTracks().forEach((t) => t.stop());
      recorderRef.current = null;
      onCapture(blob);
      setStopping(false);
    };

    if (rec.state === "recording" || rec.state === "paused") rec.stop();
  };

  if (processing) {
    return <SkeletonLoader label={mode === "scan" ? t.scanReading : t.reading} />;
  }

  /* ── Voice mode ── */
  if (mode === "voice") {
    if (micGranted === false) {
      return (
        <div className="flex flex-col gap-4">
          <div className="flex min-h-36 flex-col items-center justify-center gap-3 rounded-xl bg-gray-100 px-6 py-6 text-center">
            <AlertTriangle size={24} className="text-warning" />
            <p className="text-body-s font-medium text-text-high">{t.micDenied}</p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-4">
        <div className="flex min-h-36 flex-col items-center justify-center gap-3 rounded-xl bg-gray-100 py-6">
          <span className={cn(
            "flex h-14 w-14 items-center justify-center rounded-full bg-primary transition-shadow",
            micGranted === true && !stopping && "shadow-[0_0_0_8px_rgba(180,130,90,0.2)]",
          )}>
            <Mic size={24} className={cn("text-white", micGranted === true && !stopping && "animate-pulse")} />
          </span>
          <p className="text-body-s font-medium text-text-high">
            {stopping ? "Reading…" : t.listening}
          </p>
          {micGranted === null && (
            <p className="px-6 text-center text-body-xs font-medium text-text-disabled">
              Waiting for mic permission…
            </p>
          )}
          {micGranted === true && !stopping && (
            <p className="px-6 text-center text-body-xs font-medium italic text-text-disabled">
              Speak naturally — Sarvam understands Hindi and English
            </p>
          )}
        </div>
        {/* Fix 6: CTA renamed from "Stop & read" → "Done" */}
        <PillButton primary full disabled={stopping} onClick={handleDone}>
          {stopping ? "Reading…" : t.stopRead}
        </PillButton>
      </div>
    );
  }

  /* ── Scan mode — Fix 7: two separate options (camera + gallery) ── */
  if (mode === "scan") {
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onCapture(file);
      e.target.value = "";
    };
    return (
      <div className="flex flex-col gap-3">
        {/* Camera input — forces rear camera on mobile */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileChange}
        />
        {/* Gallery input — opens file picker / photo library */}
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Visual tap target */}
        <button
          onClick={() => cameraInputRef.current?.click()}
          className="flex min-h-36 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 bg-gray-100"
        >
          <Camera size={28} className="text-text-disabled" />
          <p className="px-6 text-center text-body-xs font-medium text-text-disabled">{t.scanPrompt}</p>
        </button>

        {/* Two action buttons */}
        <div className="flex gap-2">
          <PillButton primary full onClick={() => cameraInputRef.current?.click()}>
            <Camera size={16} />{t.scanCta}
          </PillButton>
          <PillButton full onClick={() => galleryInputRef.current?.click()}>
            <ImageIcon size={16} />{t.scanGallery}
          </PillButton>
        </div>
      </div>
    );
  }

  /* ── Type mode ── */
  return (
    <div className="flex flex-col gap-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t.typePlaceholder}
        rows={4}
        autoFocus
        className="min-h-28 w-full resize-none rounded-xl bg-gray-100 px-4 py-3 text-body-m font-medium text-text-high placeholder:text-text-disabled outline-none focus:ring-2 focus:ring-primary"
      />
      <PillButton primary full disabled={!text.trim()} onClick={() => onCapture()}>
        {t.readList}
      </PillButton>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * AddSheet — capture → confirm → add to list.
 *
 * Fix 3:
 *   • Confirm stage shows ONE combined input per draft ("Potato 2 kgs").
 *   • onChange runs parseItems on the typed string to split name+qty.
 *   • "Add another" auto-focuses the new input via focusOnMount flag.
 * ────────────────────────────────────────────────────────────────────────── */

function AddSheet({
  t, initialMode, onClose, onConfirm,
}: {
  t: Strings; initialMode?: Mode; onClose: () => void; onConfirm: (drafts: Draft[]) => void;
}) {
  const [mode,       setMode]       = React.useState<Mode>(initialMode ?? "voice");
  const [stage,      setStage]      = React.useState<"capture" | "confirm">("capture");
  const [text,       setText]       = React.useState("");
  const [processing, setProcessing] = React.useState(false);
  const [drafts,     setDrafts]     = React.useState<Draft[]>([]);

  const makeDrafts = (parsed: { name: string; qty: string }[]) =>
    parsed.map((p, i) => ({ id: `d-${Date.now()}-${i}`, name: p.name, qty: p.qty, include: true }));

  /** Update one or more fields on a draft in a single setState call. */
  const patchDraft = (id: string, updates: Partial<Omit<Draft, "id">>) =>
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...updates } : d)));

  const toggle = (id: string) =>
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, include: !d.include } : d)));

  /** Add another item row and auto-focus it. */
  const addAnother = () =>
    setDrafts((prev) => [
      ...prev,
      { id: `d-${Date.now()}`, name: "", qty: "", include: true, focusOnMount: true },
    ]);

  /**
   * Handle changes to the combined "Potato 2 kgs" single input.
   * Runs parseItems to split into name+qty; falls back to raw string if unparseable.
   */
  const handleCombinedChange = (id: string, value: string) => {
    const parsed = parseItems(value);
    if (parsed.length === 1 && parsed[0].name) {
      patchDraft(id, { name: parsed[0].name, qty: parsed[0].qty });
    } else {
      patchDraft(id, { name: value, qty: "" });
    }
  };

  const capture = async (data?: Blob | File) => {
    setProcessing(true);

    if (mode === "voice") {
      if (data && data.size > 0) {
        try {
          const transcript = await sarvamSTT(data);
          const parsed = parseItems(transcript);
          setDrafts(makeDrafts(parsed.length > 0 ? parsed : parseItems(VOICE_SAMPLE)));
        } catch (err) {
          console.error("[AddSheet] STT failed, using sample:", err);
          setDrafts(makeDrafts(parseItems(VOICE_SAMPLE)));
        }
      } else {
        setDrafts(makeDrafts(parseItems(VOICE_SAMPLE)));
      }
      setProcessing(false);
      setStage("confirm");

    } else if (mode === "scan") {
      if (data instanceof File && data.size > 0) {
        try {
          const raw = await sarvamOCR(data);
          // Fix 5: clean Markdown before parsing so all items survive
          const cleaned = cleanMarkdown(raw);
          const parsed = parseItems(cleaned);
          setDrafts(makeDrafts(parsed.length > 0 ? parsed : parseItems(SCAN_SAMPLE)));
        } catch (err) {
          console.error("[AddSheet] OCR failed, using sample:", err);
          setDrafts(makeDrafts(parseItems(SCAN_SAMPLE)));
        }
      } else {
        setDrafts(makeDrafts(parseItems(SCAN_SAMPLE)));
      }
      setProcessing(false);
      setStage("confirm");

    } else {
      window.setTimeout(() => {
        setDrafts(makeDrafts(recognize(text)));
        setProcessing(false);
        setStage("confirm");
      }, 250);
    }
  };

  const count = drafts.filter((d) => d.include && d.name.trim()).length;

  return (
    <Sheet title={t.addTitle} onClose={onClose}>
      <div className="flex min-h-0 flex-col gap-4 px-5 pb-6">
        {stage === "capture" ? (
          <>
            <ModeChips t={t} mode={mode} setMode={setMode} scanLabel={t.modeScan} />
            <CapturePane t={t} mode={mode} text={text} setText={setText}
              processing={processing} onCapture={capture} pictureMode={false} />
          </>
        ) : (
          <>
            <div className="shrink-0">
              <p className="text-title-s font-bold text-text-high">{t.confirmTitle}</p>
              <p className="mt-0.5 text-body-xs font-medium text-text-disabled">{t.confirmHint}</p>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
              {drafts.map((d) => {
                /* Fix 3: single combined input — display "Potato 2 kg" */
                const displayValue = d.qty ? `${d.name} ${d.qty}`.trim() : d.name;
                return (
                  <div key={d.id} className="flex items-center gap-3 rounded-xl bg-gray-100 px-3 py-3">
                    <button onClick={() => toggle(d.id)}
                      aria-label={d.include ? "Included" : "Skipped"}
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                        d.include ? "border-primary bg-primary" : "border-gray-200",
                      )}>
                      {d.include && <Check size={11} className="text-white" />}
                    </button>
                    {/* Single combined field: type "potato 2 kgs", we parse it */}
                    <input
                      value={displayValue}
                      onChange={(e) => handleCombinedChange(d.id, e.target.value)}
                      placeholder={t.itemPlaceholder}
                      /* Fix 3: auto-focus newly added rows */
                      autoFocus={d.focusOnMount}
                      onFocus={() => {
                        // Clear focusOnMount flag after first focus
                        if (d.focusOnMount) patchDraft(d.id, { focusOnMount: false });
                      }}
                      className="min-w-0 flex-1 bg-transparent text-body-s font-medium text-text-high placeholder:text-text-disabled outline-none"
                    />
                  </div>
                );
              })}

              <button onClick={addAnother}
                className="flex items-center gap-1.5 px-1 py-1 text-body-xs font-bold text-text-low">
                <Plus size={13} />{t.addAnother}
              </button>
            </div>

            <PillButton primary full disabled={count === 0} onClick={() => onConfirm(drafts)}>
              Add {count} item{count === 1 ? "" : "s"}
            </PillButton>
          </>
        )}
      </div>
    </Sheet>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * BuySheet — capture → reconcile (tap to tick) → update list.
 * Fix 4: matchBought now uses synonym dictionary (चावल = Rice).
 * Fix 5: cleanMarkdown pre-processes OCR output before parseItems.
 * Fix 8: reconcile CTA is "Done" → closes sheet, returns to list view.
 * ────────────────────────────────────────────────────────────────────────── */

function BuySheet({
  t, items, onClose, onConfirm,
}: {
  t: Strings; items: Item[]; onClose: () => void; onConfirm: (ids: string[]) => void;
}) {
  const [mode,       setMode]       = React.useState<Mode>("voice");
  const [stage,      setStage]      = React.useState<"capture" | "reconcile">("capture");
  const [text,       setText]       = React.useState("");
  const [processing, setProcessing] = React.useState(false);
  const [ticked,     setTicked]     = React.useState<Record<string, boolean>>({});
  const [recognized, setRecognized] = React.useState<string[]>([]);

  const fallbackNames = () =>
    items.slice(0, Math.max(1, items.length - 1)).map((it) => it.name);

  const applyMatch = (names: string[]) => {
    const matched = matchBought(names, items);
    const init: Record<string, boolean> = {};
    items.forEach((it) => (init[it.id] = matched.has(it.id)));
    setRecognized(names);
    setTicked(init);
  };

  const capture = async (data?: Blob | File) => {
    setProcessing(true);

    if (mode === "voice") {
      if (data && data.size > 0) {
        try {
          const transcript = await sarvamSTT(data);
          const parsed = parseItems(transcript);
          applyMatch(parsed.length > 0 ? parsed.map((p) => p.name) : fallbackNames());
        } catch (err) {
          console.error("[BuySheet] STT failed, using fallback:", err);
          applyMatch(fallbackNames());
        }
      } else {
        applyMatch(fallbackNames());
      }
      setProcessing(false);
      setStage("reconcile");

    } else if (mode === "scan") {
      if (data instanceof File && data.size > 0) {
        try {
          const raw = await sarvamOCR(data);
          // Fix 5: clean Markdown before parsing
          const cleaned = cleanMarkdown(raw);
          const parsed = parseItems(cleaned);
          applyMatch(parsed.length > 0 ? parsed.map((p) => p.name) : fallbackNames());
        } catch (err) {
          console.error("[BuySheet] OCR failed, using fallback:", err);
          applyMatch(fallbackNames());
        }
      } else {
        applyMatch(fallbackNames());
      }
      setProcessing(false);
      setStage("reconcile");

    } else {
      window.setTimeout(() => {
        applyMatch(recognize(text).map((p) => p.name));
        setProcessing(false);
        setStage("reconcile");
      }, 250);
    }
  };

  const toggle = (id: string) => setTicked((p) => ({ ...p, [id]: !p[id] }));
  const chosen    = Object.keys(ticked).filter((id) => ticked[id]);
  const unmatched = recognized.filter((n) => matchBought([n], items).size === 0);

  return (
    <Sheet title={t.buyTitle} onClose={onClose}>
      <div className="flex min-h-0 flex-col gap-4 px-5 pb-6">
        {stage === "capture" ? (
          <>
            <ModeChips t={t} mode={mode} setMode={setMode} scanLabel={t.modePicture} />
            <CapturePane t={t} mode={mode} text={text} setText={setText}
              processing={processing} onCapture={capture} pictureMode />
          </>
        ) : (
          <>
            <div className="shrink-0">
              <p className="text-title-s font-bold text-text-high">{t.reconcileTitle}</p>
              <p className="mt-0.5 text-body-xs font-medium text-text-disabled">{t.reconcileHint}</p>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
              {items.map((it) => {
                const on = ticked[it.id];
                return (
                  <button key={it.id} onClick={() => toggle(it.id)}
                    className="flex w-full items-center gap-3 rounded-xl bg-gray-100 px-3 py-3 text-left">
                    <span className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                      on ? "border-success bg-success" : "border-gray-200",
                    )}>
                      {on && <Check size={11} className="text-white" />}
                    </span>
                    <span className={cn("flex-1 text-body-s font-medium", on ? "text-text-disabled line-through" : "text-text-high")}>
                      {it.name}
                    </span>
                    {it.qty && <span className="text-body-xs font-medium text-text-disabled">{it.qty}</span>}
                  </button>
                );
              })}

              {recognized.length > 0 && (
                <p className="px-1 pt-1 text-body-xs font-medium text-text-disabled">
                  {t.recognizedLabel} {recognized.join(", ")}
                </p>
              )}

              {unmatched.length > 0 && (
                <div className="flex items-start gap-2.5 rounded-xl bg-gray-100 p-3">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
                  <p className="text-body-xs font-medium text-text-high">
                    {unmatched.join(", ")} — {t.notMatched}
                  </p>
                </div>
              )}
            </div>

            {/* Fix 8: "Done" closes sheet and returns to My List */}
            <PillButton primary full onClick={() => onConfirm(chosen)}>
              {t.updateList}
            </PillButton>
          </>
        )}
      </div>
    </Sheet>
  );
}
