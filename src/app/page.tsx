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
 * Household List — V1 stickiness prototype.
 * JBIQ indigo colour scheme (#3535f3) from JBIQ design system.
 *
 * LANGUAGE FLOW:
 *   • Items stored as canonical English key (canonicalize on add).
 *   • displayName(key, lang) renders in selected language everywhere.
 *   • Confirm screen shows translated name; onChange stores rawEdit (unprocessed).
 *   • addItems() parses rawEdit at submit time → fixes space+qty typing bugs.
 * ────────────────────────────────────────────────────────────────────────── */

/* ─── i18n strings ────────────────────────────────────────────────────────── */

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
  modePicture: "Photo",
  listening: "Listening…",
  stopRead: "Done",
  reading: "Reading your list…",
  typePlaceholder: "e.g. milk, 2 kg rice, salt",
  readList: "Read my list",
  scanPrompt: "Photo of your list or bill — not the items themselves",
  scanCta: "Take photo",
  scanGallery: "Gallery",
  scanReading: "Scanning… 10–20 seconds",
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
  historyFooter: "Every bill or photo would be recorded here — your spending ledger builds from this.",
  emptyListNote: "Your list is empty — add items to get going.",
  micDenied: "Mic access denied. Switch to Type mode or allow microphone access.",
};

const HI: typeof EN = {
  startTitle: "आपकी घरेलू खरीदारी सूची",
  startSub: "बोलकर, टाइप करके या स्कैन करके आइटम जोड़ें। देखें क्या बाकी है, खरीदा हुआ टिक करें।",
  benefitAdd: "कुछ भी जोड़ें",
  benefitTick: "खरीदा टिक करें",
  benefitPending: "बाकी देखें",
  createCta: "सूची बनाएं",
  tabList: "मेरी सूची",
  tabHistory: "इतिहास",
  toBuySuffix: "खरीदना है",
  boughtSuffix: "खरीदा",
  markBought: "क्या खरीदा?",
  addMore: "और जोड़ें",
  stillToBuy: "अभी भी खरीदना है",
  boughtHeading: "खरीदा",
  addTitle: "आइटम जोड़ें",
  buyTitle: "क्या खरीदा?",
  modeSpeak: "बोलें",
  modeType: "टाइप",
  modeScan: "स्कैन",
  modePicture: "फ़ोटो",
  listening: "सुन रहे हैं…",
  stopRead: "हो गया",
  reading: "पढ़ रहे हैं…",
  typePlaceholder: "जैसे: दूध, 2 किलो चावल, नमक",
  readList: "सूची पढ़ें",
  scanPrompt: "अपनी सूची या बिल की फ़ोटो — आइटम की नहीं",
  scanCta: "फ़ोटो लें",
  scanGallery: "गैलरी",
  scanReading: "स्कैन हो रही है… 10–20 सेकंड",
  confirmTitle: "हमने सुना — पुष्टि करें",
  confirmHint: "बदलें या अनटिक करें",
  addAnother: "और जोड़ें",
  itemPlaceholder: "जैसे: आलू 2 किलो",
  reconcileTitle: "हमने इन्हें खरीदा हुआ माना",
  reconcileHint: "टिक या अनटिक करें, फिर हो गया दबाएं",
  recognizedLabel: "जो आपने बोला:",
  notMatched: "सूची में नहीं",
  updateList: "हो गया",
  sampleNote: "नमूना डेटा — आपकी गतिविधि से नहीं",
  historyFooter: "हर बिल या फ़ोटो यहाँ दर्ज होगी — आपका खर्च का लेजर यहीं बनेगा।",
  emptyListNote: "सूची खाली है — शुरू करने के लिए आइटम जोड़ें।",
  micDenied: "माइक एक्सेस नहीं। टाइप मोड चुनें या माइक की अनुमति दें।",
};

/* ─── Types ───────────────────────────────────────────────────────────────── */

type Lang = "en" | "hi";
type Mode = "voice" | "type" | "scan";
type Item = { id: string; name: string; qty: string; bought: boolean };

/**
 * rawEdit: the user's literal typed value in the confirm screen (undefined = untouched).
 * At submit time, rawEdit is parsed for name+qty. This avoids the live-parse
 * bugs that ate trailing spaces and dropped quantities (issues #6 and #7).
 */
type Draft = {
  id: string;
  name: string; // canonical raw name from voice/OCR
  qty: string;
  include: boolean;
  focusOnMount?: boolean;
  rawEdit?: string;
};

type HistEntry = { id: string; store: string; icon: string; date: string; amount: string; items: string };

/* ─── Sample data ─────────────────────────────────────────────────────────── */

const SAMPLE_HISTORY: HistEntry[] = [
  { id: "s1", store: "Reliance Fresh", icon: "🛒", date: "28 May", amount: "₹540", items: "atta, onion, salt" },
  { id: "s2", store: "Blinkit",        icon: "🛵", date: "24 May", amount: "₹215", items: "milk, bread, egg" },
  { id: "s3", store: "Local kirana",   icon: "🏪", date: "19 May", amount: "₹180", items: "rice, dal, sugar" },
];

/** Store name translations for Hindi history view (issue #4). */
const STORE_NAMES_HI: Record<string, string> = {
  "Reliance Fresh": "रिलायंस फ्रेश",
  "Blinkit": "ब्लिंकिट",
  "Local kirana": "स्थानीय किराना",
  "JioMart": "जिओमार्ट",
  "Smart Bazaar": "स्मार्ट बाज़ार",
  "BigBasket": "बिगबास्केट",
  "Amazon": "अमेज़न",
};

const MONTHS_EN = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTHS_HI = ["जन","फर","मार्च","अप्रैल","मई","जून","जुलाई","अग","सित","अक्त","नव","दिस"];

function localiseDate(date: string, lang: Lang): string {
  if (lang !== "hi") return date;
  let d = date;
  MONTHS_EN.forEach((m, i) => { d = d.replace(m, MONTHS_HI[i]); });
  return d;
}

/* ─── Parser ──────────────────────────────────────────────────────────────── */

/** Normalise Devanagari numerals → Arabic (e.g. ४ → 4) for quantity parsing. */
function normalizeDigits(s: string): string {
  return s.replace(/[०-९]/g, (d) => String(d.codePointAt(0)! - "०".codePointAt(0)!));
}

// NUM: Arabic digits + English words + common Hinglish + Hindi words
const NUM =
  "(?:\\d+(?:\\.\\d+)?|half|a|one|two|three|four|five|six|seven|eight|nine|ten|twelve|twenty|dozen" +
  "|ek|do|teen|char|paanch|chhe|saat|aath|nau|das|baara|bees" +
  "|एक|दो|तीन|चार|पाँच|छह|सात|आठ|नौ|दस|बारह|बीस|आधा|aadha)";

// UNIT: English + Hindi abbreviations/words
const UNIT =
  "(?:kgs?|kilos?|kilo|किलो|grams?|gms?|g|ग्राम|litres?|liters?|ltr|ml|l|लीटर" +
  "|pkts?|packets?|पैकेट|pcs?|pieces?|piece|पीस|नग|dozen|दर्जन|gucch|bundle)";

function cap(s: string): string {
  s = s.trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function cleanMarkdown(raw: string): string {
  return raw
    .split("\n")
    .map((line) => {
      const stripped = line.replace(/[\s|:*_-]/g, "");
      if (!stripped) return "";
      line = line.replace(/^#+\s*/, "");
      if (line.includes("|")) {
        const cells = line.split("|").map((c) => c.trim()).filter((c) => c && !/^[-:\s]+$/.test(c));
        if (cells.length > 0) line = cells.join(" ");
      }
      line = line.replace(/^\s*[\d१२३४५६७८९०]+[.)]\s+/, "");
      line = line.replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1");
      line = line.replace(/^\s*[-•*]\s*/, "");
      return line.trim();
    })
    .filter(Boolean)
    .join("\n");
}

function parseItems(raw: string): { name: string; qty: string }[] {
  if (!raw.trim()) return [];
  const normalised = normalizeDigits(raw);
  const parts = normalised
    .split(/,|\n|;|\band\b|\baur\b|और/gi)
    .map((p) => p.trim())
    .filter(Boolean);
  const qtyRe = new RegExp(`\\b${NUM}\\s?${UNIT}\\b`, "i");
  return parts
    .map((part) => {
      let name = part;
      let qty = "";

      // Pattern 1: has NUM+UNIT anywhere (e.g. "milk 2 kg", "2 kg milk")
      const m = part.match(qtyRe);
      if (m) {
        qty = m[0].replace(/\s+/g, " ").trim();
        name = part.replace(m[0], " ");
      } else {
        // Pattern 2: number-first ("2 milk", "4 onion")
        const numFirst = part.match(/^\s*(\d+(?:\.\d+)?)\s+(.+)$/);
        if (numFirst) { qty = numFirst[1]; name = numFirst[2]; }
        else {
          // Pattern 3: number-last ("milk 2", "onions 4") — bare number after item name
          const numLast = part.match(/^(.+?)\s+(\d+(?:\.\d+)?)$/);
          if (numLast) { qty = numLast[2]; name = numLast[1]; }
        }
      }

      name = name.replace(/\s{2,}/g, " ").replace(/^[-•*]\s*/, "").trim();
      if (!name) { name = part; qty = ""; }
      return { name: cap(name), qty };
    })
    .filter((i) => i.name.length > 0);
}

/* ─── Fallback samples ────────────────────────────────────────────────────── */

const VOICE_SAMPLE    = "milk, 3 kg rice, 1 packet salt";
const VOICE_SAMPLE_HI = "दूध, 3 किलो चावल, 1 पैकेट नमक";
const SCAN_SAMPLE     = "Aashirvaad Atta 5 kg\nOnion 1 kg\nTata Salt 1 pkt\nAmul Milk 1 l";

function recognize(typed: string): { name: string; qty: string }[] {
  return parseItems(typed);
}

function norm2(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9ऀ-ॿ ]/g, " ").replace(/\s+/g, " ").trim();
}

/* ─── Canonical item dictionary ───────────────────────────────────────────── */

/**
 * English canonical key → Hindi display name.
 * Covers grocery items, household items, clothing, and common brands.
 * Unknown items display in their original script (no bad transliteration).
 */
const CANONICAL_TO_HI: Record<string, string> = {
  // Grains & staples
  rice: "चावल", atta: "आटा", maida: "मैदा", suji: "सूजी",
  poha: "पोहा", besan: "बेसन", cornflour: "कॉर्नफ्लोर",
  cornflakes: "कॉर्नफ्लेक्स", wheat: "गेहूं", bajra: "बाजरा",
  jowar: "ज्वार", maize: "मकई",
  // Pulses
  dal: "दाल", moong: "मूंग दाल", chana: "चना", rajma: "राजमा",
  urad: "उड़द दाल", toor: "तूर दाल", masoor: "मसूर दाल",
  // Dairy
  milk: "दूध", curd: "दही", paneer: "पनीर", ghee: "घी",
  butter: "मक्खन", cheese: "चीज़", cream: "मलाई", buttermilk: "छाछ",
  // Vegetables
  potato: "आलू", onion: "प्याज", tomato: "टमाटर", garlic: "लहसुन",
  ginger: "अदरक", carrot: "गाजर", peas: "मटर", cauliflower: "गोभी",
  cabbage: "पत्तागोभी", spinach: "पालक", ladyfinger: "भिंडी",
  brinjal: "बैंगन", bittergourd: "करेला", bottlegourd: "लौकी",
  mushroom: "मशरूम", capsicum: "शिमला मिर्च", pumpkin: "कद्दू",
  radish: "मूली", beetroot: "चुकंदर", beans: "फलियाँ",
  // Fruits
  mango: "आम", banana: "केला", apple: "सेब", orange: "संतरा",
  lemon: "नींबू", grapes: "अंगूर", pomegranate: "अनार", papaya: "पपीता",
  guava: "अमरूद", watermelon: "तरबूज", coconut: "नारियल",
  pineapple: "अनानास", strawberry: "स्ट्रॉबेरी",
  // Spices
  salt: "नमक", turmeric: "हल्दी", cumin: "जीरा", coriander: "धनिया",
  chili: "मिर्च", pepper: "काली मिर्च", cardamom: "इलायची",
  cloves: "लौंग", cinnamon: "दालचीनी", mustard: "सरसों",
  fennel: "सौंफ", fenugreek: "मेथी", asafoetida: "हींग", masala: "मसाला",
  // Sweeteners & condiments
  sugar: "चीनी", jaggery: "गुड़", honey: "शहद",
  pickle: "अचार", ketchup: "केचप", jam: "जैम", tamarind: "इमली",
  // Oils & nuts
  oil: "तेल", groundnut: "मूंगफली", sesame: "तिल",
  // Snacks & processed
  biscuit: "बिस्किट", chips: "चिप्स", namkeen: "नमकीन",
  papad: "पापड़", chocolate: "चॉकलेट", maggi: "मैगी",
  noodles: "नूडल्स", pasta: "पास्ता",
  // Bread & bakery
  bread: "ब्रेड", cake: "केक",
  // Beverages
  tea: "चाय", coffee: "कॉफी", water: "पानी", juice: "जूस", lassi: "लस्सी",
  // Protein
  egg: "अंडे", chicken: "चिकन", mutton: "मटन", fish: "मछली",
  // Personal care
  soap: "साबुन", shampoo: "शैम्पू", toothpaste: "टूथपेस्ट",
  toothbrush: "टूथब्रश", handwash: "हैंडवॉश", sanitizer: "सैनिटाइज़र",
  deodorant: "डियोड्रेंट",
  // Household
  detergent: "डिटर्जेंट", tissues: "टिशू",
  bucket: "बाल्टी", towel: "तौलिया", bedsheet: "चादर", curtain: "पर्दा",
  bulb: "बल्ब", battery: "बैटरी",
  // Clothing & accessories
  shirt: "कमीज़", tshirt: "टी-शर्ट", pant: "पैंट", socks: "मोज़े",
  underwear: "अंडरवेयर", saree: "साड़ी", dupatta: "दुपट्टा",
  // General household items
  scissors: "कैंची", pen: "पेन", pencil: "पेंसिल", paper: "कागज़",
  notebook: "नोटबुक", bag: "बैग", umbrella: "छाता",
  pillow: "तकिया", cushion: "तकिया", bed: "बिस्तर", mattress: "गद्दा",
  television: "टेलीविज़न", phone: "फ़ोन", charger: "चार्जर",
  laptop: "लैपटॉप",
};

/** Synonym groups for canonical matching (Hindi/Hinglish/English → canonical key). */
const SYNONYMS: Record<string, string[]> = {
  rice:        ["चावल", "chawal", "chaawal", "bhaat", "javal"],
  milk:        ["दूध", "doodh", "dudh"],
  salt:        ["नमक", "namak", "loon"],
  atta:        ["आटा", "flour", "wheat flour", "gehun", "गेहूं"],
  onion:       ["प्याज", "pyaaz", "pyaz", "kanda"],
  potato:      ["आलू", "aloo", "aalu", "batata"],
  tomato:      ["टमाटर", "tamatar"],
  sugar:       ["चीनी", "cheeni", "shakkar", "chini"],
  dal:         ["दाल", "lentil", "lentils", "arhar", "moong", "masoor", "chana"],
  oil:         ["तेल", "tel", "cooking oil", "sarson"],
  bread:       ["ब्रेड", "pav", "pau"],
  egg:         ["अंडा", "anda", "eggs", "अंडे"],
  ghee:        ["घी", "ghi"],
  tea:         ["चाय", "chai"],
  coffee:      ["कॉफी", "kaafi"],
  soap:        ["साबुन", "sabun"],
  shampoo:     ["शैम्पू", "shampu"],
  paneer:      ["पनीर", "cottage cheese"],
  curd:        ["दही", "dahi", "yogurt", "dahee"],
  butter:      ["मक्खन", "makhan"],
  biscuit:     ["बिस्किट", "biskut"],
  chips:       ["चिप्स"],
  water:       ["पानी", "paani"],
  mango:       ["आम", "aam", "mangoes"],
  banana:      ["केला", "kela", "kele"],
  apple:       ["सेब", "seb"],
  lemon:       ["नींबू", "nimbu", "neembu"],
  coriander:   ["धनिया", "dhaniya", "cilantro", "धनिये"],
  ginger:      ["अदरक", "adrak"],
  garlic:      ["लहसुन", "lahsun"],
  turmeric:    ["हल्दी", "haldi"],
  cumin:       ["जीरा", "jeera", "zeera"],
  chili:       ["मिर्च", "mirch"],
  peas:        ["मटर", "matar"],
  cauliflower: ["गोभी", "gobhi", "phool gobhi"],
  spinach:     ["पालक", "palak"],
  ladyfinger:  ["भिंडी", "bhindi", "okra"],
  guava:       ["अमरूद", "amrood"],
  jaggery:     ["गुड़", "gur"],
  honey:       ["शहद", "shahad"],
  pickle:      ["अचार", "achaar"],
  maggi:       ["मैगी"],
  noodles:     ["नूडल्स"],
  cornflakes:  ["कॉर्नफ्लेक्स"],
  // Household & clothing
  scissors:    ["कैंची", "kaichi", "sisar", "सिज़र", "scissor"],
  shirt:       ["कमीज़", "kamiz", "कमीज"],
  socks:       ["मोज़े", "moze", "juraab", "सॉक्स", "jurab"],
  bed:         ["बिस्तर", "bistar", "palang", "पलंग"],
  pillow:      ["तकिया", "takiya", "पिलो", "pilo"],
  cushion:     ["कुशन", "takiya"],
  deodorant:   ["डियोड्रेंट", "deo", "डियो"],
  television:  ["टेलीविज़न", "टीवी", "tivi", "tv"],
  pen:         ["पेन", "pen"],
  paper:       ["कागज़", "kagaz", "पेपर", "pepper"],
  bag:         ["बैग"],
  umbrella:    ["छाता", "chhata"],
  bedsheet:    ["चादर", "chadar"],
  towel:       ["तौलिया", "towelia"],
  soap_dish:   ["साबुनदानी"],
};

function getSynonymGroup(name: string): Set<string> {
  const n = norm2(name);
  const group = new Set<string>([n]);
  for (const [eng, synonyms] of Object.entries(SYNONYMS)) {
    const engN = norm2(eng);
    if (engN === n || synonyms.some((s) => norm2(s) === n)) {
      group.add(engN);
      synonyms.forEach((s) => group.add(norm2(s)));
    }
  }
  return group;
}

function canonicalize(rawName: string): string {
  const n = norm2(rawName);
  for (const [eng, synonyms] of Object.entries(SYNONYMS)) {
    if (norm2(eng) === n || synonyms.some((s) => norm2(s) === n)) return eng;
  }
  // Partial/substring match (catches "दो किलो चावल" → "rice")
  for (const [eng, synonyms] of Object.entries(SYNONYMS)) {
    const terms = [norm2(eng), ...synonyms.map(norm2)];
    if (terms.some((t) => t.length > 2 && n.includes(t))) return eng;
  }
  return rawName;
}

function displayName(name: string, lang: Lang): string {
  if (lang === "hi") {
    const hi = CANONICAL_TO_HI[name.toLowerCase()];
    if (hi) return hi;
    if (/[ऀ-ॿ]/.test(name)) return name; // already Devanagari
    return name; // Roman — not in dict, show as-is
  }
  return cap(name);
}

function matchBought(boughtNames: string[], items: Item[]): Set<string> {
  const matched = new Set<string>();
  const bn = boughtNames.map(norm2).filter(Boolean);
  for (const it of items) {
    const itn = norm2(it.name);
    const itSynonyms = getSynonymGroup(it.name);
    const itTokens = itn.split(" ").filter((tk) => tk.length > 2);
    for (const b of bn) {
      const bSynonyms = getSynonymGroup(b);
      if (itn.includes(b) || b.includes(itn) || itTokens.some((tk) => b.split(" ").includes(tk))) {
        matched.add(it.id); break;
      }
      if ([...itSynonyms].some((s) => bSynonyms.has(s))) {
        matched.add(it.id); break;
      }
    }
  }
  return matched;
}

/* ─── Sarvam API helpers ──────────────────────────────────────────────────── */

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
  const [lang, setLang]             = React.useState<Lang>("en");
  const [started, setStarted]       = React.useState(false);
  const [tab, setTab]               = React.useState<"list" | "history">("list");
  const [items, setItems]           = React.useState<Item[]>([]);
  const [addOpen, setAddOpen]       = React.useState(false);
  const [addInitialMode, setAddInitialMode] = React.useState<Mode>("type");
  const [buyOpen, setBuyOpen]       = React.useState(false);
  const [toast, setToast]           = React.useState<string | null>(null);

  const t = lang === "hi" ? HI : EN;

  const flashToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  };

  // Fix #5: default mode is "type" — no mic permission until user explicitly taps "Speak"
  const openAdd = (mode: Mode = "type") => {
    setAddInitialMode(mode);
    setAddOpen(true);
  };

  /** Direct tap-to-tick: toggle an item's bought state from the list view (issue #3). */
  const toggleItem = (id: string) => {
    setItems((prev) => prev.map((it) => it.id === id ? { ...it, bought: !it.bought } : it));
  };

  /**
   * Fix #6 + #7: parse name+qty here at commit time, not during keystroke.
   * If the user edited a draft in the confirm screen (rawEdit present),
   * we parse rawEdit to extract proper name and quantity.
   */
  const addItems = (drafts: Draft[]) => {
    const incoming = drafts.filter((d) => d.include && (d.rawEdit?.trim() || d.name.trim()));
    setItems((prev) => {
      const have = new Set(prev.map((i) => norm2(i.name)));
      const fresh = incoming
        .filter((d) => {
          const raw = d.rawEdit !== undefined ? d.rawEdit : d.name;
          return !have.has(norm2(canonicalize(raw)));
        })
        .map((d, i) => {
          // rawEdit = user typed; use parseItems on it to re-extract name+qty
          const raw = d.rawEdit !== undefined
            ? d.rawEdit
            : d.qty ? `${d.name} ${d.qty}` : d.name;
          const parsed = parseItems(raw);
          const finalName = canonicalize(parsed[0]?.name ?? d.name);
          const finalQty  = parsed[0]?.qty || d.qty || "";
          return {
            id: `it-${Date.now()}-${i}`,
            name: finalName,
            qty: finalQty.trim(),
            bought: false,
          };
        });
      return [...prev, ...fresh];
    });
    setStarted(true);
    setAddOpen(false);
    flashToast(`${incoming.length} item${incoming.length === 1 ? "" : "s"} added`);
  };

  /**
   * Issue #2: also accepts newBoughtNames — items the user spoke that weren't
   * on the list. They get added to the list and immediately marked as bought.
   */
  const applyBought = (ids: string[], newBoughtNames: string[] = []) => {
    const set = new Set(ids);
    setItems((prev) => {
      const updated = prev.map((it) => ({ ...it, bought: set.has(it.id) }));
      const have = new Set(updated.map((i) => norm2(i.name)));
      const brandNew = newBoughtNames
        .map((n) => canonicalize(n))
        .filter((name) => !have.has(norm2(name)))
        .map((name, i) => ({ id: `it-new-${Date.now()}-${i}`, name, qty: "", bought: true }));
      return [...updated, ...brandNew];
    });
    setBuyOpen(false);
    const total = ids.length + newBoughtNames.length;
    flashToast(`${total} marked bought`);
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
            <ListView t={t} lang={lang} items={items} onBuy={() => setBuyOpen(true)} onAdd={() => openAdd("type")} onToggle={toggleItem} />
          ) : (
            <HistoryView t={t} lang={lang} />
          )}
        </>
      )}

      {addOpen && (
        <AddSheet t={t} lang={lang} initialMode={addInitialMode} onClose={() => setAddOpen(false)} onConfirm={addItems} />
      )}
      {buyOpen && (
        // Fix #5: BuySheet starts in "type" mode — mic not requested until Speak is tapped
        <BuySheet t={t} lang={lang} items={items} onClose={() => setBuyOpen(false)} onConfirm={applyBought} />
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

/* ─── Chip (tabs / lang toggle) ──────────────────────────────────────────── */

function Chip({ active, onClick, children, className }: {
  active?: boolean; onClick?: () => void; children: React.ReactNode; className?: string;
}) {
  return (
    <button onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-label-s font-bold transition-colors",
        active ? "border-gray-900 bg-gray-900 text-gray-100" : "border-gray-300 bg-gray-200 text-gray-900",
        className,
      )}>
      {children}
    </button>
  );
}

/* ─── ModeTab (input mode selector — indigo active) ──────────────────────── */

function ModeTab({ active, onClick, children, className }: {
  active?: boolean; onClick?: () => void; children: React.ReactNode; className?: string;
}) {
  return (
    <button onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-full border py-2.5 text-label-l font-bold transition-colors",
        active ? "border-primary bg-primary text-white" : "border-gray-300 bg-gray-100 text-gray-700",
        className,
      )}>
      {children}
    </button>
  );
}

/* ─── Pill button ─────────────────────────────────────────────────────────── */

function PillButton({ primary, full, disabled, onClick, children, className }: {
  primary?: boolean; full?: boolean; disabled?: boolean;
  onClick?: () => void; children: React.ReactNode; className?: string;
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={cn(
        "flex items-center justify-center gap-2 rounded-full py-3.5 text-button font-bold transition-colors disabled:opacity-40",
        primary ? "bg-primary text-white" : "bg-gray-100 text-text-high",
        full && "w-full",
        className,
      )}>
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

function StartScreen({ t, lang, setLang, onCreate }: {
  t: typeof EN; lang: Lang; setLang: (l: Lang) => void; onCreate: (mode: Mode) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className="flex shrink-0 items-center justify-end px-4 pb-3"
        style={{ paddingTop: "max(16px, env(safe-area-inset-top))" }}
      >
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
          <BenefitTile iconBg="bg-indigo-50" icon={<Edit3 size={18} className="text-indigo-600" />} label={t.benefitAdd} />
          <BenefitTile iconBg="bg-green-50"  icon={<Check size={18} className="text-green-600"  />} label={t.benefitTick} />
          <BenefitTile iconBg="bg-blue-50"   icon={<Bell  size={18} className="text-blue-600"   />} label={t.benefitPending} />
        </div>
      </div>
      <div className="pb-safe shrink-0 px-4 pb-4 pt-3">
        <div className="mb-3 flex gap-2">
          {/* Explicit mode selection — only "Speak" starts mic */}
          <ModeEntryChip icon={<Mic      size={14} />} label={t.modeSpeak} onClick={() => onCreate("voice")} />
          <ModeEntryChip icon={<Keyboard size={14} />} label={t.modeType}  onClick={() => onCreate("type")}  />
          <ModeEntryChip icon={<Camera   size={14} />} label={t.modeScan}  onClick={() => onCreate("scan")}  />
        </div>
        <PillButton primary full onClick={() => onCreate("type")}>
          <Plus size={18} />{t.createCta}
        </PillButton>
      </div>
    </div>
  );
}

function BenefitTile({ iconBg, icon, label }: { iconBg: string; icon: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-2.5 rounded-xl bg-gray-100 px-2 py-4">
      <span className={cn("flex h-10 w-10 items-center justify-center rounded-lg", iconBg)}>{icon}</span>
      <p className="text-center text-body-2xs font-medium leading-snug text-text-high">{label}</p>
    </div>
  );
}

function ModeEntryChip({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="flex flex-1 items-center justify-center gap-1 overflow-hidden rounded-full bg-primary px-2 py-2.5 text-label-s font-bold whitespace-nowrap text-white transition-colors active:bg-indigo-700">
      {icon}<span className="truncate">{label}</span>
    </button>
  );
}

/* ─── Tab bar — 2 rows ────────────────────────────────────────────────────── */

function TabBar({ t, lang, setLang, tab, setTab, onReset }: {
  t: typeof EN; lang: Lang; setLang: (l: Lang) => void;
  tab: "list" | "history"; setTab: (v: "list" | "history") => void; onReset: () => void;
}) {
  return (
    /* Issue #4: min 16px top padding so icons are never clipped by browser chrome */
    <header
      className="shrink-0 bg-white px-4 pb-2.5 shadow-low"
      style={{ paddingTop: "max(16px, env(safe-area-inset-top))" }}
    >
      <div className="mb-2.5 flex items-center justify-between">
        <button onClick={onReset} aria-label="Reset"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary">
          <ShoppingBasket size={18} className="text-white" />
        </button>
        <LangToggle lang={lang} setLang={setLang} />
      </div>
      <div className="flex gap-1.5">
        {(["list", "history"] as const).map((id) => (
          <Chip key={id} active={tab === id} onClick={() => setTab(id)} className="flex-1 text-center">
            {id === "list" ? t.tabList : t.tabHistory}
          </Chip>
        ))}
      </div>
    </header>
  );
}

/* ─── List view ───────────────────────────────────────────────────────────── */
/*
 * Issue #1 fix: absolute-positioned button bar so it's always visible at
 * the bottom regardless of list length. The scroll area gets bottom padding
 * to compensate so no content is hidden behind the buttons.
 *
 * Issue #3 fix: "to buy" items have a tappable circle that marks them bought
 * directly without opening the BuySheet. Tap to tick; tap again to untick.
 */

function ListView({ t, lang, items, onBuy, onAdd, onToggle }: {
  t: typeof EN; lang: Lang; items: Item[];
  onBuy: () => void; onAdd: () => void; onToggle: (id: string) => void;
}) {
  const toBuy  = items.filter((i) => !i.bought);
  const bought = items.filter((i) => i.bought);

  return (
    /* Relative container fills remaining space after TabBar */
    <div className="relative min-h-0 flex-1">

      {/* Scrollable list — pb-28 leaves room for the button bar */}
      <div className="absolute inset-0 overflow-y-auto px-4 pt-6 pb-28">

        <p className="mb-5 text-body-xs font-medium text-text-disabled">
          {toBuy.length} {t.toBuySuffix}
          {bought.length > 0 ? ` · ${bought.length} ${t.boughtSuffix}` : ""}
        </p>

        {items.length === 0 && (
          <p className="mt-12 text-center text-body-s font-medium text-text-disabled">{t.emptyListNote}</p>
        )}

        {toBuy.length > 0 && (
          <div className="mb-6">
            {toBuy.map((it, i) => (
              <React.Fragment key={it.id}>
                {i > 0 && <div className="h-px bg-gray-200" />}
                {/* Issue #3: full row is tappable; circle shows tap affordance */}
                <button
                  onClick={() => onToggle(it.id)}
                  className="flex w-full items-center gap-3 py-3.5 text-left active:bg-gray-50 rounded-lg transition-colors"
                >
                  {/* Empty circle → tap to mark bought */}
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-gray-300 transition-colors" />
                  <span className="flex-1 text-body-s font-medium text-text-high">
                    {displayName(it.name, lang)}
                  </span>
                  {it.qty && <span className="text-body-xs font-medium text-text-disabled">{it.qty}</span>}
                </button>
              </React.Fragment>
            ))}
          </div>
        )}

        {bought.length > 0 && (
          <div className="mb-4">
            <p className="mb-3 flex items-center gap-1.5 text-overline font-bold uppercase tracking-wide text-text-disabled">
              <Check size={11} className="text-success" />
              {t.boughtHeading} · {bought.length}
            </p>
            <div className="opacity-60">
              {bought.map((it, i) => (
                <React.Fragment key={it.id}>
                  {i > 0 && <div className="h-px bg-gray-200" />}
                  {/* Bought items: tap to un-tick back to list */}
                  <button
                    onClick={() => onToggle(it.id)}
                    className="flex w-full items-center gap-3 py-3.5 text-left active:bg-gray-50 rounded-lg transition-colors"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success">
                      <Check size={11} className="text-white" />
                    </span>
                    <span className="flex-1 text-body-s font-medium text-text-low line-through">
                      {displayName(it.name, lang)}
                    </span>
                    {it.qty && <span className="text-body-xs font-medium text-text-disabled line-through">{it.qty}</span>}
                  </button>
                </React.Fragment>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Issue #1: absolute-pinned button bar — always visible, never pushed down */}
      <div
        className="absolute bottom-0 left-0 right-0 bg-white px-4 py-4 flex flex-col gap-2.5 border-t border-gray-100"
        style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
      >
        <PillButton primary full onClick={onBuy} disabled={toBuy.length === 0}>
          <Check size={18} />{t.markBought}
        </PillButton>
        <PillButton full onClick={onAdd}>
          <Plus size={18} />{t.addMore}
        </PillButton>
      </div>

    </div>
  );
}

/* ─── History view — Fix #4: store names + dates in Hindi ────────────────── */

function HistoryView({ t, lang }: { t: typeof EN; lang: Lang }) {
  const entries = SAMPLE_HISTORY.map((h) => ({
    ...h,
    store: lang === "hi" ? (STORE_NAMES_HI[h.store] ?? h.store) : h.store,
    date: localiseDate(h.date, lang),
    items: h.items
      .split(", ")
      .map((name) => displayName(canonicalize(name.trim()), lang))
      .join(", "),
  }));

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
      <div className="mb-4 flex items-center gap-2.5 rounded-xl bg-gray-100 p-3.5">
        <AlertTriangle size={14} className="shrink-0 text-text-disabled" />
        <p className="text-body-xs font-medium text-text-low">{t.sampleNote}</p>
      </div>
      <div className="flex flex-col gap-3">
        {entries.map((h) => (
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

/* ─── Mode chips ──────────────────────────────────────────────────────────── */

function ModeChips({ t, mode, setMode, scanLabel }: {
  t: typeof EN; mode: Mode; setMode: (m: Mode) => void; scanLabel: string;
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

/* ─── CapturePane ─────────────────────────────────────────────────────────── */

function CapturePane({ t, mode, text, setText, processing, onCapture, pictureMode }: {
  t: typeof EN; mode: Mode; text: string; setText: (s: string) => void;
  processing: boolean; onCapture: (data?: Blob | File) => void; pictureMode: boolean;
}) {
  const recorderRef     = React.useRef<MediaRecorder | null>(null);
  const chunksRef       = React.useRef<Blob[]>([]);
  const cameraInputRef  = React.useRef<HTMLInputElement>(null);
  const galleryInputRef = React.useRef<HTMLInputElement>(null);
  const [micGranted, setMicGranted] = React.useState<boolean | null>(null);
  const [stopping,   setStopping]   = React.useState(false);

  // Fix #5: recording starts ONLY when mode is "voice" (not on default type/scan open)
  React.useEffect(() => {
    if (mode !== "voice" || processing) return;
    setStopping(false);
    let cancelled = false;
    let localStream: MediaStream | null = null;
    let localRec: MediaRecorder | null = null;

    navigator.mediaDevices.getUserMedia({ audio: true })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        localStream = stream;
        const mimeType = ["audio/webm;codecs=opus","audio/webm","audio/ogg;codecs=opus","audio/mp4"]
          .find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
        localRec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        chunksRef.current = [];
        localRec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
        localRec.start(200);
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

  const handleDone = () => {
    setStopping(true);
    const rec = recorderRef.current;
    if (!rec || rec.state === "inactive" || chunksRef.current.length === 0) {
      onCapture(undefined); setStopping(false); return;
    }
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
      rec.stream.getTracks().forEach((t) => t.stop());
      recorderRef.current = null;
      onCapture(blob); setStopping(false);
    };
    if (rec.state === "recording" || rec.state === "paused") rec.stop();
  };

  if (processing) return <SkeletonLoader label={mode === "scan" ? t.scanReading : t.reading} />;

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
            micGranted === true && !stopping && "shadow-[0_0_0_8px_rgba(53,53,243,0.18)]",
          )}>
            <Mic size={24} className={cn("text-white", micGranted === true && !stopping && "animate-pulse")} />
          </span>
          <p className="text-body-s font-medium text-text-high">
            {stopping ? t.reading : t.listening}
          </p>
          {micGranted === null && (
            <p className="px-6 text-center text-body-xs font-medium text-text-disabled">
              {t === HI ? "माइक की अनुमति का इंतज़ार…" : "Waiting for mic permission…"}
            </p>
          )}
          {micGranted === true && !stopping && (
            <p className="px-6 text-center text-body-xs font-medium italic text-text-disabled">
              {t === HI ? "स्वाभाविक रूप से बोलें — हिंदी और English समझी जाती है" : "Speak naturally — Sarvam understands Hindi and English"}
            </p>
          )}
        </div>
        <PillButton primary full disabled={stopping} onClick={handleDone}>
          {stopping ? t.reading : t.stopRead}
        </PillButton>
      </div>
    );
  }

  if (mode === "scan") {
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onCapture(file);
      e.target.value = "";
    };
    return (
      <div className="flex flex-col gap-3">
        <input ref={cameraInputRef}  type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />
        <input ref={galleryInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        <button onClick={() => cameraInputRef.current?.click()}
          className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 bg-gray-100">
          <Camera size={28} className="text-text-disabled" />
          <p className="px-6 text-center text-body-xs font-medium text-text-disabled">{t.scanPrompt}</p>
        </button>
        <PillButton primary full onClick={() => cameraInputRef.current?.click()}>
          <Camera size={16} />{t.scanCta}
        </PillButton>
        <PillButton full onClick={() => galleryInputRef.current?.click()}>
          <ImageIcon size={16} />{t.scanGallery}
        </PillButton>
      </div>
    );
  }

  // Type mode — autoFocus opens keyboard immediately when type tab is selected
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

/* ─── AddSheet ────────────────────────────────────────────────────────────── */

function AddSheet({ t, lang, initialMode, onClose, onConfirm }: {
  t: typeof EN; lang: Lang; initialMode?: Mode; onClose: () => void; onConfirm: (drafts: Draft[]) => void;
}) {
  const [mode,       setMode]       = React.useState<Mode>(initialMode ?? "type");
  const [stage,      setStage]      = React.useState<"capture" | "confirm">("capture");
  const [text,       setText]       = React.useState("");
  const [processing, setProcessing] = React.useState(false);
  const [drafts,     setDrafts]     = React.useState<Draft[]>([]);

  const makeDrafts = (parsed: { name: string; qty: string }[]) =>
    parsed.map((p, i) => ({ id: `d-${Date.now()}-${i}`, name: p.name, qty: p.qty, include: true }));

  const patchDraft = (id: string, updates: Partial<Omit<Draft, "id">>) =>
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...updates } : d)));

  const toggle = (id: string) =>
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, include: !d.include } : d)));

  const addAnother = () =>
    setDrafts((prev) => [...prev, { id: `d-${Date.now()}`, name: "", qty: "", include: true, focusOnMount: true }]);

  const capture = async (data?: Blob | File) => {
    setProcessing(true);
    const voiceFallback = lang === "hi" ? VOICE_SAMPLE_HI : VOICE_SAMPLE;

    if (mode === "voice") {
      if (data && data.size > 0) {
        try {
          const transcript = await sarvamSTT(data);
          const parsed = parseItems(transcript);
          setDrafts(makeDrafts(parsed.length > 0 ? parsed : parseItems(voiceFallback)));
        } catch { setDrafts(makeDrafts(parseItems(voiceFallback))); }
      } else { setDrafts(makeDrafts(parseItems(voiceFallback))); }
      setProcessing(false); setStage("confirm");

    } else if (mode === "scan") {
      if (data instanceof File && data.size > 0) {
        try {
          const raw = await sarvamOCR(data);
          const parsed = parseItems(cleanMarkdown(raw));
          setDrafts(makeDrafts(parsed.length > 0 ? parsed : parseItems(SCAN_SAMPLE)));
        } catch { setDrafts(makeDrafts(parseItems(SCAN_SAMPLE))); }
      } else { setDrafts(makeDrafts(parseItems(SCAN_SAMPLE))); }
      setProcessing(false); setStage("confirm");

    } else {
      window.setTimeout(() => {
        setDrafts(makeDrafts(recognize(text)));
        setProcessing(false); setStage("confirm");
      }, 250);
    }
  };

  const count = drafts.filter((d) => d.include && (d.rawEdit?.trim() || d.name.trim())).length;

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
                /**
                 * Fix #1, #2, #6, #7:
                 * - Display: shows translated canonical name + qty (so Hindi speakers see Hindi)
                 * - If user has edited (rawEdit present): show their raw typed text
                 * - onChange: store raw value in rawEdit — NO live parsing (fixes space bug)
                 * - Actual parsing happens in addItems() at submit time
                 */
                const displayVal = d.rawEdit !== undefined
                  ? d.rawEdit
                  : d.qty
                    ? `${displayName(canonicalize(d.name), lang)} ${d.qty}`.trim()
                    : displayName(canonicalize(d.name), lang);

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
                    <input
                      value={displayVal}
                      onChange={(e) => patchDraft(d.id, { rawEdit: e.target.value })}
                      placeholder={t.itemPlaceholder}
                      autoFocus={d.focusOnMount}
                      onFocus={() => { if (d.focusOnMount) patchDraft(d.id, { focusOnMount: false }); }}
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
              {lang === "hi" ? `${count} आइटम जोड़ें` : `Add ${count} item${count === 1 ? "" : "s"}`}
            </PillButton>
          </>
        )}
      </div>
    </Sheet>
  );
}

/* ─── BuySheet ────────────────────────────────────────────────────────────── */
/*
 * Issue #2: if user says an item that's not on the list, it gets passed back
 * via onConfirm's second argument so applyBought can add it + mark it bought.
 */

function BuySheet({ t, lang, items, onClose, onConfirm }: {
  t: typeof EN; lang: Lang; items: Item[]; onClose: () => void;
  onConfirm: (ids: string[], newBoughtNames: string[]) => void;
}) {
  // Fix #5: default "type" — mic permission NOT requested on open
  const [mode,       setMode]       = React.useState<Mode>("type");
  const [stage,      setStage]      = React.useState<"capture" | "reconcile">("capture");
  const [text,       setText]       = React.useState("");
  const [processing, setProcessing] = React.useState(false);
  const [ticked,     setTicked]     = React.useState<Record<string, boolean>>({});
  const [recognized, setRecognized] = React.useState<string[]>([]);

  const fallbackNames = () => items.slice(0, Math.max(1, items.length - 1)).map((it) => it.name);

  const applyMatch = (names: string[]) => {
    const matched = matchBought(names, items);
    const init: Record<string, boolean> = {};
    items.forEach((it) => (init[it.id] = matched.has(it.id)));
    setRecognized(names);
    setTicked(init);
  };

  const capture = async (data?: Blob | File) => {
    setProcessing(true);
    const voiceFallback = lang === "hi" ? VOICE_SAMPLE_HI : VOICE_SAMPLE;

    if (mode === "voice") {
      if (data && data.size > 0) {
        try {
          const transcript = await sarvamSTT(data);
          const parsed = parseItems(transcript);
          applyMatch(parsed.length > 0 ? parsed.map((p) => p.name) : fallbackNames());
        } catch { applyMatch(fallbackNames()); }
      } else { applyMatch(fallbackNames()); }
      setProcessing(false); setStage("reconcile");

    } else if (mode === "scan") {
      if (data instanceof File && data.size > 0) {
        try {
          const raw = await sarvamOCR(data);
          const parsed = parseItems(cleanMarkdown(raw));
          applyMatch(parsed.length > 0 ? parsed.map((p) => p.name) : fallbackNames());
        } catch { applyMatch(fallbackNames()); }
      } else { applyMatch(fallbackNames()); }
      setProcessing(false); setStage("reconcile");

    } else {
      window.setTimeout(() => {
        applyMatch(recognize(text).map((p) => p.name));
        setProcessing(false); setStage("reconcile");
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
                      {displayName(it.name, lang)}
                    </span>
                    {it.qty && <span className="text-body-xs font-medium text-text-disabled">{it.qty}</span>}
                  </button>
                );
              })}
              {recognized.length > 0 && (
                <p className="px-1 pt-1 text-body-xs font-medium text-text-disabled">
                  {t.recognizedLabel} {recognized.map((n) => displayName(canonicalize(n), lang)).join(", ")}
                </p>
              )}
              {unmatched.length > 0 && (
                /* Issue #2: unmatched items will be auto-added + marked bought on Done */
                <div className="flex items-start gap-2.5 rounded-xl bg-indigo-50 p-3">
                  <Plus size={14} className="mt-0.5 shrink-0 text-primary" />
                  <p className="text-body-xs font-medium text-text-high">
                    {unmatched.map((n) => displayName(canonicalize(n), lang)).join(", ")}
                    {" — "}
                    {lang === "hi" ? "सूची में जोड़कर खरीदा गया दिखाएंगे" : "will be added to your list and marked bought"}
                  </p>
                </div>
              )}
            </div>
            {/* Pass unmatched names so applyBought can add + mark them bought */}
            <PillButton primary full onClick={() => onConfirm(chosen, unmatched)}>
              {t.updateList}
            </PillButton>
          </>
        )}
      </div>
    </Sheet>
  );
}
