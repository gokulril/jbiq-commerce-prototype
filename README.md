# JBIQ Commerce — Household List Prototype

V1 usability-test prototype for the JBIQ Commerce vertical.  
A smart household shopping list that lets users add items by **speaking, typing, or scanning**, tracks what's still to buy, and ticks off what's been bought.

---

## What this is

This is a **single-session PWA prototype** built for user testing — not a production app. No database, no auth, no persistence beyond the browser session.

**User flow:**
1. Start screen → choose input mode (Speak / Type / Scan)
2. Add items → editable confirm step
3. My List → see what's pending
4. Mark what you bought (voice / type / photo of bill)
5. Reconcile → list updates

**History tab** shows sample data to illustrate the spend-ledger vision.

---

## Stack

- **Next.js 15** · React 19 · TypeScript
- **Tailwind v4** with JBIQ design system tokens
- **JioType** variable font (loaded from CDN)
- **Sarvam Saarika v3** for Hindi/English speech-to-text
- Browser **MediaRecorder API** for audio capture

---

## Getting started

```bash
npm install
npm run dev
# → http://localhost:3000
```

### Enable voice input (Sarvam STT)

```bash
cp .env.local.example .env.local
# Open .env.local and paste your key from https://dashboard.sarvam.ai
```

Without the key, voice mode falls back silently to a sample transcript so the flow still works for testing.

---

## Voice input — how it works

```
Browser MediaRecorder → audio/webm blob
    → POST /api/stt (server-side proxy)
        → Sarvam Saarika v3 (Hindi/English code-switching)
            → transcript string
                → parseItems() → confirm step
```

The API key never touches the browser. If Sarvam returns an error, the app falls back to a hardcoded sample so the test session isn't interrupted.

---

## Design system

Built to the **JBIQ design system** (DESIGN.md):
- JioType font (Black weight for headlines, Medium for body)
- Warm tan brand colour (`#B4825A` light / `#D4AF8C` dark)
- Pill-shaped buttons and chips · `rounded-xl` cards · no shadows · no gradients
- Neutral chip selection (gray-900 selected, never action colour for filter chips)
- Skeleton shimmer for all loading states — no spinners

---

## Persona

**Anjali** — Tier 2/3 woman, joint household, voice-first. Sarvam handles Hindi + Hinglish naturally.

---

## What's not built yet (Phase 2)

- `Scan` mode → OCR (stub marked `TODO(phase-2)` in `page.tsx`)
- Hindi UI strings (EN dictionary done, HI map stubbed)
- Persistence / user accounts
- Real bill parsing / UPI SMS ingestion
