# Canva-Style Mobile Bottom Navigation Bar & Action Dock

A mobile-first navigation overhaul introducing a persistent bottom dock with an elevated quick-action button, direct access to key hubs (Launchpad, Funding, Needs), and an interactive slide-up drawer for secondary utilities.

### User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural decisions were aligned during the interactive clarification turn and guide this implementation:

- **Confirmed Navigation Items**: The bottom bar will feature 5 touch targets: **Launchpad**, **Funding Explorer**, an **Elevated Canva-Style Center Action Button (+)**, **Compliance & Needs**, and **More & Tools**.
- **Confirmed Center Action Button**: An elevated, glowing gradient button centered in the bottom dock that opens an instant Canva-style modal sheet for rapid AI generation (Pitch Deck, Logo, Document Digitizer, Business Plan) and instant funding search.
- **Confirmed Side Panel Behavior**: The top-left mobile hamburger menu is retained as an account & settings drawer (profile info, subscription badge, billing, notifications, and logout) while all primary product destinations migrate into the thumb-friendly bottom dock and slide-up drawer.
- **Ergonomics & Layout Safety**: Main viewports will receive bottom safe-area padding (`pb-24 pb-safe`) so that sticky or scrollable content never collides with or hides behind the fixed dock.

---

### 1. Overview & Core Concept

- **What It Does**: Replaces the desktop-style left menu dependence on mobile devices with a Canva-inspired persistent bottom navigation dock. Users can transition between their Launchpad, Funding Opportunities, and Compliance & Funding Needs with a single thumb tap, trigger high-value AI workflows via the elevated center button, and access the remaining suite of tools through a smooth slide-up drawer.
- **Target Audience & Persona**: Mobile South African entrepreneurs and SMEs navigating grant applications, checking compliance scores, and searching for capital on smartphones with one hand.
- **Key Value**: Drastically reduces tap fatigue, eliminates multi-step drawer dives for core daily tools, and brings StacFund's visual polish in line with top-tier mobile creation platforms like Canva.

---

### 2. User Experience & Visual Design

- **Key User Flows**:
  1. *Daily Navigation*: Tapping bottom tabs instantly switches views between Launchpad, Funding Explorer, and Compliance & Needs with zero lag.
  2. *Elevated Quick Create (Canva-Style)*: Tapping the center elevated button opens a sleek bottom action sheet with rich cards for:
     - Search & Match Grants
     - AI Pitch Deck Builder
     - Offline Form Auto-Fill / Digitizer
     - AI Logo Generator
     - WhatsApp Crowdsourcing
     - Instant Business Plan Studio
  3. *More Sheet*: Tapping the "More" tab slides up a categorized drawer presenting Applications Tracker, Documents Vault, and additional ecosystem utilities.
  4. *Mobile Top Bar*: Streamlined to display brand identity, notification badge, and profile avatar/drawer trigger.

- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Dark glassmorphism matching StacFund's cosmic branding (`#050510` canvas, `backdrop-blur-xl`, subtle border hairlines `border-white/10`).
  - *Color Palette & Tokens*: Dark slate canvas with purple-to-indigo gradients (`from-purple-600 to-indigo-600`) and amber accents for Pro/upgrade affordances.
  - *Bottom Dock Geometry*: Fixed at `bottom-0 left-0 right-0 z-40`, height of $64\text{px}$ + safe-area inset (`pb-safe`), with the center button elevated $14\text{px}$ above the top edge using an inset circular cutaway effect and subtle purple radial glow.
  - *Typography & Captions*: Micro labels at $10\text{px}$ (`text-[10px] font-bold tracking-tight`), with single-line labels and clear active-color highlighting (`text-purple-400` vs `text-gray-400`).

- **Interactive Feedback & Motion**:
  - Center button tap ripple and active scale feedback (`active:scale-95 transition-all`).
  - Slide-up bottom sheets with drag-handle pill indicator, blurred backdrop (`bg-black/60 backdrop-blur-sm`), and animated entrance (`animate-in slide-in-from-bottom duration-300`).

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Dock Layout Architecture (4 Tabs + 1 Elevated Center Action)**
  - *Chosen Approach*: 2 left tabs (Launchpad, Funding), 1 center raised button (Quick AI / Search), 2 right tabs (Needs, More).
  - *Why*: Perfectly mirrors Canva's proven mobile ergonomics, keeping primary read/monitor workflows reachable while prioritizing creation and discovery at the physical center of the thumb zone.
  - *Alternatives Considered*: 5 equal flat tabs without a center button (less visual delight and misses the requested Canva aesthetic).

- **Decision 2: Retention of Account Drawer in Top Bar**
  - *Chosen Approach*: Keep the hamburger menu / avatar trigger in the mobile header specifically for secondary account actions (profile details, BYOK Gemini key modal, subscription tier badge, and logout).
  - *Why*: Prevents cluttering the bottom dock with rarely used account settings while ensuring users can still easily manage billing and logout anytime.

- **Decision 3: Slide-Up Action Sheet for Deep Tools**
  - *Chosen Approach*: Modular `MobileQuickActionSheet` and `MobileMoreSheet` components rather than cramming 8+ icons into a horizontal scroll strip.
  - *Why*: Eliminates accidental side-swipes and horizontal navigation fatigue, providing large touch targets ($48\text{px}+$ height) for all secondary actions.

---

### 4. Technical Architecture & Data Strategy *(Technical Reference)*

```
┌────────────────────────────────────────────────────────┐
│                      App.tsx                           │
│  - currentPage: 'dashboard' | 'funding' | 'needs' ...  │
│  - isMobileMenuOpen, isQuickActionOpen, isMoreOpen     │
└───────────────────────┬────────────────────────────────┘
                        │
       ┌────────────────┴────────────────┐
       ▼                                 ▼
┌──────────────────────────────┐  ┌──────────────────────────────┐
│       Desktop Layout         │  │        Mobile Layout         │
│  - Sticky Desktop Sidebar    │  │  - Compact Sticky Header     │
│  - Full Viewport Canvas      │  │  - Main View with pb-24      │
└──────────────────────────────┘  │  - MobileBottomNav (Dock)    │
                                  └──────────────┬───────────────┘
                                                 │
                        ┌────────────────────────┴────────────────────────┐
                        ▼                                                 ▼
        ┌──────────────────────────────┐                  ┌──────────────────────────────┐
        │  MobileQuickActionSheet      │                  │       MobileMoreSheet        │
        │  - AI Pitch Deck Builder     │                  │  - Applications Tracker      │
        │  - Form Auto-Fill Scanner    │                  │  - Documents Vault           │
        │  - AI Logo Generator         │                  │  - Smart Tools Hub           │
        │  - Quick Funding Search      │                  │  - Plan & Pricing Modal      │
        └──────────────────────────────┘                  └──────────────────────────────┘
```

- **Interactive Component Mapping**:
  - `MobileBottomNav.tsx`: Renders the fixed bottom dock on screens `< md` (hidden on desktop). Handles active tab highlighting, tab navigation clicks, and center button sheet triggers.
  - `MobileQuickActionSheet.tsx`: Bottom sheet modal displaying instant creation and search shortcuts. Tapping an action triggers tool navigation (e.g. `open_ai_tool` event or page transition) and dismisses the sheet cleanly.
  - `MobileMoreSheet.tsx`: Bottom sheet modal exposing Applications, Documents Vault, and Hub utilities without navigating away from the current context.
  - `App.tsx`: Incorporates the bottom nav, adjusts `<main>` container padding (`pb-24 md:pb-0`) to ensure 0 content clipping, and integrates the quick modal states.
