<!-- Generated from the designer prototype (prototype.jsx) by Claude on 2026-10-29. Line refs point at rishabh-designer/bimaendorse-prototype prototype.jsx. Where code and docs disagreed, code was followed and the conflict is listed in Appendix A. -->
# BimaPlacement — UI / Design / Domain Extraction from `prototype.jsx`

Source: `/home/claude/repo/bimaendorse-prototype/prototype.jsx` (21,000 lines, single file, 4 apps). Only **Placement** (`pl*` / `Pl*` / `PL_*`, lines ~9850–19930 + `PlEngineChip`/`PlacementApp` 20735–20900) and the **shared chrome** it reuses are covered. Line numbers refer to `prototype.jsx` at the time of extraction.

Target rebuild: **React + TypeScript** frontend, **NestJS + Postgres** backend.

> Reading guide. §1 tokens, §2 shell, §3 screens, §4 modals, §5 component library, §6 data model, §7 API surface (from `makePlacementApi`), §8 business rules / SLA engine, §9 assets, §10 what not to port. Where the prototype is internally inconsistent this is called out as **⚠ Inconsistency**; where docs disagree with code, code wins and the conflict is noted.

---

## 0. Executive orientation

- **Product**: BimaPlacement = "Placement Manager Workbench" for BimaKavach (IRDAI-licensed commercial insurance broker). A ticket (`PLC-####`) is one **placement case for exactly one product type**: RFQ arrives (BimaSetu float or manual), PM validates it, picks insurer+branch "entities", sends the RFQ (one **thread** per entity), collects and judges **quotes**, a **QCR** (Quote Comparison Report) is generated (by an external service "Copycat", or uploaded manually, or a single quote PDF), released to the RM / BimaSetu, and the client decision closes the ticket (`quote_selected` / `lost` / `no_appetite`).
- **Two personas only**: `Bhupendra Singh` — *Placement Executive* (`bhupendra.solanki@bimakavach.com`) and `Himani Doshi` — *Placement Head* (`himani@bimakavach.com`). Universal RM: `Shubh Bangar`. Demo password `pass-word`.
- **Channels**: `bimasetu` (floated from the RM system "BimaSetu"; every in/out message is logged to `c.bimasetu[]`) vs `manual` (PM-created; RM contacted by mail).
- **Clocks**: Business hours Mon–Fri 10:00–19:00 IST (540 business minutes/day) minus the Keka 2026 holiday list. One case-level SLA at a time (`c.sla`), plus a per-thread insurer clock, plus a follow-up ladder and an internal escalation ladder ("SLA-P1").
- **All mutation goes through one factory** `makePlacementApi(setCases, say)` (L12727–13728) — ~50 methods, every one appends audit entries. This is effectively the backend API spec (§7).

---

## 1. Design tokens

### 1.1 Shared palette `C` (L20–47) — exact values in code

| Token | Value | Meaning (DESIGN-SYSTEM.md) |
|---|---|---|
| `ink` | `#0E1A1F` | primary text (data layer) |
| `ink2` | `#3D5058` | secondary text |
| `ink3` | `#7C8F97` | data tertiary (SLA codes, ages) |
| `line` | `#D2D5D8` | container borders |
| `lineSoft` | `#ECECF1` | row dividers, hairlines |
| `subtle` | `#E6E8EA` | recessed fills, card borders |
| `canvas` | `#F4F5F6` | sunken strips, breadcrumb, table header |
| `white` | `#FFFFFF` | surfaces |
| `teal` / `tealSoft` | `#0B6E5F` / `#E4F0ED` | healthy / verified (endorse semantics) |
| `link` | `#1458D2` | client names, references; **= BimaPlacement accent** |
| `breach` / `breachSoft` | `#B3261E` / `#FBEAE8` | overdue, terminal, destructive |
| `warn` / `warnSoft` | `#A15C00` / `#FDF2E1` | at risk, blocked |
| `wait` / `waitSoft` | `#4B5EAA` / `#EAECF7` | waiting on external party |
| `brand` | `#4100CF` | chrome primary: page titles, primary buttons, active pill |
| `brand600` | `#320099` | deep brand |
| `brand400` | `#7A4DEB` | |
| `brand200` | `#EDE6FF` | |
| `brandBg` | `#F4F1FF` | selected option bg, hover tint |
| `cream` | `#FFF6ED` | unused (Endorse page tint) |
| `accent` | `#FF7700` | Endorse wordmark, ikkat mark, **Exclusive Mandate** star |
| `greet` | `#9082B3` | greeting date line, scope-switch idle text |
| `figInk` | `#1C1D1F` | chrome body ink |
| `figHint` | `#6F7378` | chrome secondary |
| `figTert` | `#6F7378` | **⚠ code collapses to figHint**; DESIGN-SYSTEM.md says `#A9ACB1` |
| `figPlaceholder` | `#6F7378` | ditto (placeholders actually rendered `rgba(169,172,177,0.6)` via CSS) |
| `figDisabled` | `rgba(169,172,177,0.48)` | disabled text/icons |
| `semError` | `#CF0000` | countdown label "over" |
| `semCaution` | `#B38F0A` | countdown label "at risk" |
| `scrim` | `rgba(28,29,31,0.45)` | modal/drawer overlay |

Hard-coded extras used repeatedly: `#1C1C1C` (table header text), `#DFE0E2` (menu card border), `#D1C6FF` (lavender hover border / brand line), `#E8E2FF` (focus ring), `#F10000` (red dot / required asterisk), `#007B00` (success label green), `#00B200` (success dot), `#FFCF0E` (caution dot), `#1F9D6B` (menu option tick fill).

### 1.2 Indicator palette `IND` (L1219) — status pills / dots

| ind | dot | line | fill (table) | tint (status) | label text (`IND_TEXT`, outline variant) |
|---|---|---|---|---|---|
| `error` | `#F10000` | `#FFABAB` | `rgba(241,0,0,0.08)` | same | `#CF0000` |
| `caution` | `#FFCF0E` | `#FFE890` | `rgba(255,207,14,0.12)` | same | `#B38F0A` |
| `info` | `#1869F4` | `#B9D1FF` | `#FFFFFF` | `rgba(24,105,244,0.08)` | `#1868F4` |
| `neutral` | `#6F7378` | `#D2D5D8` | `#FFFFFF` | `rgba(169,172,177,0.16)` | `#6F7378` |
| `success` | `#00B200` | `#A9EAA2` | `#FFFFFF` | `rgba(0,178,0,0.08)` | `#007B00` |
| `brand` | `#4100CF` | `#D1C6FF` | `#FFFFFF` | `rgba(65,0,207,0.08)` | `#4100CF` |
| `muted` | `#A9ACB1` | `#E6E8EA` | `#F4F5F6` | `#F4F5F6` | `#A9ACB1` |
| `orange` | `#FF7700` | `#FFD2A8` | `#FFF6ED` | `rgba(255,119,0,0.08)` | `#A15C00` |

`Indicator` sizes (`IND_SIZE`): `default` pad 6 / r8 / 0.5px border; `big` pad 8 / r10 / 0.5px; `thick` pad 3×6 / r8 / 1px. Dot 4×4. Label 14/500 `#1C1C1C` (muted → figTert; outline → tone).

### 1.3 Placement palette `PL_T` (L13748) — resolved hex

| Token | Resolved | Notes |
|---|---|---|
| `bg`, `bgDeep`, `cardSunk` | `#F4F5F6` | |
| `card` | `#FFFFFF` | |
| `cardAlt` | `#FAFAFB` | table header strips, row hover (`.pl-row-hover` uses `#F4F5F6`) |
| `strip` / `stripLine` | `#EEF4FF` / `#B9D1FF` | |
| `border` | `#E6E8EA` | default card/hairline |
| `borderStrong` | `#D2D5D8` | inputs, default button border |
| `ink` / `ink2` / `ink3` | `#1C1D1F` / `#6F7378` / `#6F7378` | ⚠ ink2 == ink3 in code |
| `purple` / `purpleDeep` / `purpleSoft` / `purpleLine` | `#4100CF` / `#320099` / `#F4F1FF` / `#EDE6FF` | primary |
| `orange` / `orangeSoft` / `orangeLine` | `#A15C00` / `#FDF2E1` / `#F2DBBE` | SLA attention, clarification, mandate |
| `green` / `greenSoft` / `greenLine` | `#0F7A4C` / `#E4F5EC` / `#B6E2CB` | usable, success |
| `red` / `redSoft` / `redLine` | `#B3261E` / `#FBEAE8` / `#F1CCC8` | breach, decline, destructive |
| `blue` / `blueSoft` / `blueLine` | `#1458D2` / `#E8F1FA` / `#C3DAF0` | info, RM, links |
| `amber` / `amberSoft` / `amberLine` | `#8A6D1F` / `#FDF6DC` / `#EFE0A8` | **simulation-only** blocks |
| `navActive`/`navSelected` | `#F4F1FF` | |
| `navHover` | `#F4F5F6` | |
| `navLine` | `#ECECF1` | |
| `scrim` | `rgba(28,29,31,0.45)` | |

`PL_TONES` (L13764): `{ fg, bg, line }` per tone key `neutral | purple | orange | green | red | blue | amber` — neutral `{#6F7378, #F4F5F6, #E6E8EA}`, purple `{#320099, #F4F1FF, #EDE6FF}`, orange `{#A15C00,#FDF2E1,#F2DBBE}`, green `{#0F7A4C,#E4F5EC,#B6E2CB}`, red `{#B3261E,#FBEAE8,#F1CCC8}`, blue `{#1458D2,#E8F1FA,#C3DAF0}`, amber `{#8A6D1F,#FDF6DC,#EFE0A8}`.

Tone bridge `PL_IND` (L11874): `orange→caution, amber→caution, purple→brand, blue→info, green→success, red→error, neutral→neutral`. Reverse `plToneOf` (L19818).

### 1.4 Environment lockup `TOOLS.BimaPlacement` (L5521)

```
split: ["Bima", "Placement"], color: C.link (#1458D2), built: true,
bg: "#EEF4FF"         // page ground of the whole app
activeBg: "#DDE8FF"   // active sidebar row
activeFg: C.link      // active sidebar row text/icon
```
Wordmark = "Bima" in `figInk` + "Placement" in `#1458D2`, 20/500 in sidebar, 16/500 on login.
Sister envs: Endorse `#FF7700`/`#FFF6ED`/`#FFE9D3`; Claim `#4100CF`/`#F4F1FF`/`#E8E2FF`; Ops `#007B00`/`#ECFBEA`/`#D4F5CF`.

### 1.5 Typography

- **Family**: `FONT = "Anek Latin", "Anek Kannada", "Anek Devanagari", system-ui, -apple-system, "Segoe UI", sans-serif` (Google Fonts, weights 100–800). `PL_MONO = FONT` (no monospace anywhere; numbers use `.bk-num { font-variant-numeric: tabular-nums }`).
- **Display**: `SERIF = "Instrument Serif", Georgia, ...` italic — used ONLY for single-letter monograms (`PlAvatar` fallback, `PlActorMark`, mail-trail marks use Georgia italic). ⚠ a code comment claims "Placement is Anek-only"; it isn't.
- Greetings render in user's script: Bhupendra `નમસ્તે, ભૂપેન્દ્ર`, Himani `નમસ્તે, હિમાની` (Gujarati — **⚠ no Anek Gujarati is loaded**, falls back to system).
- **Sizes actually used in Placement** (count in Pl range): 12 (84), 11.5 (83), 12.5 (74), 13 (42), 11 (41), 14 (28), 13.5 (12), 20 (8), 16 (7), 10 (7), 18 (6), 10.5 (5), 24 (4), 15 (4), 9.5 (3), 28 (1), 22 (1).
- **Weights**: 600 (134), 500 (78), 550 (23), 650 (13), 700 (2).
- **Type roles**:
  | Role | Spec |
  |---|---|
  | Page title (`PageHead`) | 32/600, `letter-spacing -0.8px`, `brand` |
  | Page hint | 13/500 `figTert` |
  | Home greeting | 26/600 `-0.6px` brand; date line 12/500 `greet` |
  | Home section h2 | 24/600 brand |
  | Case ID in workspace header | 28/650 `-0.5px` purple |
  | Tab title (`PlTabHeader`) | 20/600 `-0.2px` figInk; meta 14/500 figHint |
  | Modal title | 18/600 purple `-0.1px`; subtitle 13 ink3 |
  | Card title | 12.5–13.5/600 |
  | Body / table rows (queue) | 14/500 |
  | Dense body | 12–12.5 |
  | Label (`PlLabel`) | xs 11/600, sm 12/600, md 12.5/600, `ink3`, **Title Case — "globally never use all caps"** (⚠ several table headers still render ALL-CAPS 9.5/650 letter-spacing 0.6: Inbox, Master, Reports) |
  | Chip | sm 11.5/500, xs 10.5/500 |
  | Button | md/lg 12.5/600, sm 12/600 |
  | Pill filters (queue/inbox/manual) | 16/500 |
  | Metric numbers (Reports) | 20/650 |
- **Copy rules** (DESIGN-SYSTEM.md): no em dashes in UI copy (hyphen `-`); durations capitalised `1 Min`, `3 Days Ago`; Title Case labels.

### 1.6 Radii, borders, shadows, spacing

- Radii: `rounded-lg` 8 (buttons, chips-square, inputs, callouts — 58 uses), `rounded-xl` 12 (cards, toast — 26), `rounded-2xl` 16 (modals, menu card, search modal, sections), `rounded-full` (pills, avatars, chips — 39), shell main card **24**, login card 16/24, `ScopeSwitch` 24/32, Mandate hover popover 16, Ticket Stage Timeline 12.
- Borders: 1px `PL_T.border` (#E6E8EA) on cards; inputs 1px `borderStrong` (#D2D5D8); chrome 0.5px hairlines (`subtle`); dashed borders = paused/held (orange) and simulation (amber).
- Shadows: shell `0 2px 8px rgba(28,27,31,0.06)`; menu card `0 2px 16px rgba(169,172,177,0.24)`; popovers `0 12px 32px rgba(28,29,31,0.16)`; drawer `-16px 0 40px rgba(28,29,31,0.16)`; tooltip `0 8px 24px rgba(28,29,31,0.16)`; modals `shadow-2xl`; SLA bar `0px 2px 8px rgba(169,172,177,0.24)`; scope pill `0 0 6px rgba(14,43,114,0.24)`; hover glow `0 0 12px rgba(65,0,207,0.10–0.12)`.
- Focus ring: `.pl-focus:focus-visible { border-color:#4100CF; box-shadow: 0 0 0 2px #E8E2FF }`; `.bk-btn:focus-visible { box-shadow: 0 0 0 2.5px #E8E2FF }`.
- Spacing rhythm (Tailwind 4px scale): most common `gap-2` (8), `px-3/px-4` (12/16), `py-2/2.5/3` (8/10/12), `mt-1.5/2/3`, card pad `p-4` (16), section header `px-3.5 py-3`, page `px-6 py-6` (24). Density is intentional ("operations console used all day").
- Layout constants: sidebar 237px / 92px collapsed; right rail 268px sticky (top 12); queue column widths `PCOLS` (L11878): `id 96, stage 150, type 92, urg 92, age 96(pl12), client 160 grow, product 180 grow, sla 130, usable 66, owner 148`.
- Grids: Market threads `180px 180px 100px minmax(0,1fr) 120px`; Quotes `minmax(160px,1.4fr) minmax(120px,1fr) 110px 100px 130px 20px`; QCR rows `minmax(120px,1.2fr) 130px minmax(110px,1fr) minmax(100px,1fr) minmax(140px,1.6fr)`.

### 1.7 Squircle / ikkat / motion

- **Squircle**: every element with `rounded-lg`-class radius ≥5 px gets a Figma-60%-smoothing superellipse via `mask-image` (`useSquircle`, `squirclePath` port of `figma-squircle` MIT, L58–167), plus CSS `corner-shape: superellipse(1.8)` where supported. Skips pills/circles, `data-no-squircle`, and overflow-visible containers with positioned children. **Rebuild recommendation**: use the `figma-squircle` npm package or CSS `corner-shape` progressive enhancement; do not port the global MutationObserver hack.
- **Ikkat rule** (brand motif): `.bk-rule` 4px tall purple, SVG mask alternating outlined/solid marks on 20px pitch (page rule under PageHead/Greeting/case header). `.bk-trail` 2px `#D2D5D8`, one mark per 16px (audit/BimaSetu row divider). `.bk-mark` 12×6 `#FF7700` single mark (audit row bullet). SVG paths `IKKAT_V1`/`IKKAT_V2` L192–193 — keep as assets.
- **Motion** (`GLOBAL_CSS` L208): `bkFadeUp` .45s `cubic-bezier(.22,1,.36,1)` + `stagger(i)` delay `0.1 + min(i,6)*0.06s`; `.bk-route` view enter .4s; `.bk-modal` slide-up 32px .6s `cubic-bezier(.5,0,.5,1)`; `.bk-scrim` fade .6s; `.bk-reveal` 8px .45s; `.bk-spin` .7s; full `prefers-reduced-motion` collapse.
- **Hover classes**: `.pl-btn-primary:hover brightness(.9)`, `active .78`; `.pl-btn-default:hover bg #F4F5F6`; `.pl-btn-ghost:hover bg #F4F1FF color #4100CF`; `.bk-pill:hover` brand border/text/dot; `.bk-tab:hover` underline `#D1C6FF` brand text; `.bk-navitem:hover` white bg figInk; `.bk-desk:hover` lavender border + glow; `.bk-iconctrl:hover` brandBg/lavender/brand; `.bk-opt:hover #F4F1FF`.

### 1.8 Icon library

`lucide-react@0.469.0` only (per CLAUDE.md). Sizes are load-bearing: 10–11 inline meta, 12–14 buttons/chips, 14–17 headers, 20/24 sidebar. Placement-specific inline SVGs (lucide icons not in 0.469 — use current lucide instead): `IconStarCheck` (lucide `star-check`, Exclusive Mandate, default color `#FF7700`), `IconShieldPlus` (`shield-plus`, Insurer actor), `IconBanknoteCheck` (`banknote-check`? — custom path, Target Premium).

Recurring Placement icon semantics: `HeartHandshake` Home · `ListChecks` My Tickets / Workflow Stages · `SquareDashedMousePointer` Manual Review · `Building2` Insurer Master / Client 360 · `TextSearch` Reports · `Search` search · `PanelLeftClose/Open` collapse · `LogOut` · `User` client · `Briefcase` product · `Clock` SLA · `Pause`/`Play` held/resume · `AlertTriangle` breach/early release · `Lock` locked panel / released QCR · `Ban` excluded insurer · `CheckCircle2`/`Circle` resolved/open query · `Info` · `FileText` docs · `Paperclip` attachment · `Link` (as `LinkIcon`) RFQ link · `MessageSquare` RM mail · `Zap` simulation · `ArrowRight` "Go there" · `ChevronDown/Up/Right` · `X` close · `Check`/`Minus` stage tick / live · `XCircle` exclude · `ArrowDownWideNarrow` sort · `CornerDownRight` nested open ticket.

### 1.9 Ready-to-use TypeScript tokens

```ts
// tokens.ts
export const color = {
  ink: '#1C1D1F', ink2: '#6F7378', ink3: '#6F7378', // PL_T; decide whether to restore ink3 '#A9ACB1'
  dataInk: '#0E1A1F', dataInk2: '#3D5058', dataInk3: '#7C8F97',
  tableHeadInk: '#1C1C1C',
  line: '#D2D5D8', lineSoft: '#ECECF1', subtle: '#E6E8EA',
  canvas: '#F4F5F6', card: '#FFFFFF', cardAlt: '#FAFAFB', white: '#FFFFFF',
  disabled: 'rgba(169,172,177,0.48)', placeholder: 'rgba(169,172,177,0.6)',
  scrim: 'rgba(28,29,31,0.45)',
  brand: { 50: '#F4F1FF', 100: '#E8E2FF', 200: '#EDE6FF', line: '#D1C6FF', 400: '#7A4DEB', 500: '#4100CF', 600: '#320099' },
  accent: '#FF7700', greet: '#9082B3',
  placement: { accent: '#1458D2', pageBg: '#EEF4FF', navActiveBg: '#DDE8FF', navActiveFg: '#1458D2' },
  sem: { error: '#CF0000', caution: '#B38F0A', successText: '#007B00' },
} as const;

export const tone = {
  neutral: { fg: '#6F7378', bg: '#F4F5F6', line: '#E6E8EA' },
  purple:  { fg: '#320099', bg: '#F4F1FF', line: '#EDE6FF' },
  orange:  { fg: '#A15C00', bg: '#FDF2E1', line: '#F2DBBE' },
  green:   { fg: '#0F7A4C', bg: '#E4F5EC', line: '#B6E2CB' },
  red:     { fg: '#B3261E', bg: '#FBEAE8', line: '#F1CCC8' },
  blue:    { fg: '#1458D2', bg: '#E8F1FA', line: '#C3DAF0' },
  amber:   { fg: '#8A6D1F', bg: '#FDF6DC', line: '#EFE0A8' }, // simulation only
} as const;
export type Tone = keyof typeof tone;

export const indicator = {
  error:   { dot: '#F10000', line: '#FFABAB', fill: 'rgba(241,0,0,0.08)',    tint: 'rgba(241,0,0,0.08)',    text: '#CF0000' },
  caution: { dot: '#FFCF0E', line: '#FFE890', fill: 'rgba(255,207,14,0.12)', tint: 'rgba(255,207,14,0.12)', text: '#B38F0A' },
  info:    { dot: '#1869F4', line: '#B9D1FF', fill: '#FFFFFF', tint: 'rgba(24,105,244,0.08)', text: '#1868F4' },
  neutral: { dot: '#6F7378', line: '#D2D5D8', fill: '#FFFFFF', tint: 'rgba(169,172,177,0.16)', text: '#6F7378' },
  success: { dot: '#00B200', line: '#A9EAA2', fill: '#FFFFFF', tint: 'rgba(0,178,0,0.08)', text: '#007B00' },
  brand:   { dot: '#4100CF', line: '#D1C6FF', fill: '#FFFFFF', tint: 'rgba(65,0,207,0.08)', text: '#4100CF' },
  muted:   { dot: '#A9ACB1', line: '#E6E8EA', fill: '#F4F5F6', tint: '#F4F5F6', text: '#A9ACB1' },
  orange:  { dot: '#FF7700', line: '#FFD2A8', fill: '#FFF6ED', tint: 'rgba(255,119,0,0.08)', text: '#A15C00' },
} as const;
export type Ind = keyof typeof indicator;
export const toneToInd: Record<Tone, Ind> = { orange: 'caution', amber: 'caution', purple: 'brand', blue: 'info', green: 'success', red: 'error', neutral: 'neutral' };

export const font = {
  sans: '"Anek Latin","Anek Kannada","Anek Devanagari","Anek Gujarati",system-ui,-apple-system,"Segoe UI",sans-serif',
  display: '"Instrument Serif",Georgia,"Times New Roman",serif', // italic, monogram initials only
};
export const text = {
  pageTitle: { size: 32, weight: 600, tracking: -0.8 },
  greeting: { size: 26, weight: 600, tracking: -0.6 },
  sectionH2: { size: 24, weight: 600 },
  caseId: { size: 28, weight: 650, tracking: -0.5 },
  tabTitle: { size: 20, weight: 600, tracking: -0.2 },
  modalTitle: { size: 18, weight: 600 },
  body: { size: 14, weight: 500 },
  dense: { size: 12.5, weight: 500 },
  meta: { size: 11.5, weight: 500 },
  label: { xs: 11, sm: 12, md: 12.5, weight: 600 },
  chip: { xs: 10.5, sm: 11.5, weight: 500 },
  button: { sm: 12, md: 12.5, weight: 600 },
};
export const radius = { sm: 6, md: 8, lg: 10, xl: 12, '2xl': 16, shell: 24, pill: 9999 };
export const shadow = {
  shell: '0 2px 8px rgba(28,27,31,0.06)',
  menu: '0 2px 16px rgba(169,172,177,0.24)',
  popover: '0 12px 32px rgba(28,29,31,0.16)',
  tooltip: '0 8px 24px rgba(28,29,31,0.16)',
  drawer: '-16px 0 40px rgba(28,29,31,0.16)',
  focus: '0 0 0 2px #E8E2FF',
  glow: '0 0 12px rgba(65,0,207,0.10)',
};
export const motion = {
  easeOut: 'cubic-bezier(.22,1,.36,1)', easeInOut: 'cubic-bezier(.5,0,.5,1)',
  item: '450ms', route: '400ms', modal: '600ms', staggerBase: 0.1, staggerStep: 0.06, staggerCap: 6,
};
export const layout = { sidebar: 237, sidebarCollapsed: 92, rail: 268, pagePad: 24 };
```

### 1.10 Tailwind `theme.extend`

```js
// tailwind.config.js (JIT is fine in the rebuild — the "no arbitrary values" rule was a prototype-artifact constraint)
module.exports = {
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Anek Latin"', '"Anek Kannada"', '"Anek Devanagari"', '"Anek Gujarati"', 'system-ui', 'sans-serif'],
        display: ['"Instrument Serif"', 'Georgia', 'serif'],
      },
      colors: {
        ink: { DEFAULT: '#1C1D1F', 2: '#6F7378', 3: '#6F7378', data: '#0E1A1F', data2: '#3D5058', data3: '#7C8F97' },
        line: { DEFAULT: '#D2D5D8', soft: '#ECECF1', subtle: '#E6E8EA', menu: '#DFE0E2' },
        canvas: '#F4F5F6', card: { DEFAULT: '#FFFFFF', alt: '#FAFAFB', sunk: '#F4F5F6' },
        brand: { 50: '#F4F1FF', 100: '#E8E2FF', 200: '#EDE6FF', line: '#D1C6FF', 400: '#7A4DEB', DEFAULT: '#4100CF', 600: '#320099' },
        accent: '#FF7700', greet: '#9082B3',
        placement: { DEFAULT: '#1458D2', bg: '#EEF4FF', nav: '#DDE8FF' },
        sem: { error: '#CF0000', caution: '#B38F0A', success: '#007B00' },
        t: {
          orange: { DEFAULT: '#A15C00', soft: '#FDF2E1', line: '#F2DBBE' },
          green: { DEFAULT: '#0F7A4C', soft: '#E4F5EC', line: '#B6E2CB' },
          red: { DEFAULT: '#B3261E', soft: '#FBEAE8', line: '#F1CCC8' },
          blue: { DEFAULT: '#1458D2', soft: '#E8F1FA', line: '#C3DAF0' },
          amber: { DEFAULT: '#8A6D1F', soft: '#FDF6DC', line: '#EFE0A8' },
          purple: { DEFAULT: '#320099', soft: '#F4F1FF', line: '#EDE6FF' },
        },
        ind: {
          error: '#F10000', caution: '#FFCF0E', info: '#1869F4', success: '#00B200', neutral: '#6F7378', muted: '#A9ACB1', orange: '#FF7700',
        },
      },
      fontSize: { '2xs': ['10.5px', '1.3'], meta: ['11.5px', '1.45'], dense: ['12.5px', '1.4'], 'page': ['32px', { lineHeight: '1.2', letterSpacing: '-0.8px', fontWeight: '600' }] },
      fontWeight: { 550: '550', 650: '650' },
      borderRadius: { shell: '24px' },
      boxShadow: {
        shell: '0 2px 8px rgba(28,27,31,0.06)', menu: '0 2px 16px rgba(169,172,177,0.24)',
        popover: '0 12px 32px rgba(28,29,31,0.16)', drawer: '-16px 0 40px rgba(28,29,31,0.16)',
        focus: '0 0 0 2px #E8E2FF', glow: '0 0 12px rgba(65,0,207,0.10)',
      },
      transitionTimingFunction: { out: 'cubic-bezier(.22,1,.36,1)', inout: 'cubic-bezier(.5,0,.5,1)' },
      keyframes: {
        fadeUp: { from: { opacity: 0, transform: 'translateY(10px)' }, to: { opacity: 1, transform: 'none' } },
        modalIn: { from: { opacity: 0, transform: 'translateY(32px)' }, to: { opacity: 1, transform: 'none' } },
        scrimIn: { from: { opacity: 0 }, to: { opacity: 1 } },
      },
      animation: {
        item: 'fadeUp .45s cubic-bezier(.22,1,.36,1) backwards',
        route: 'fadeUp .4s cubic-bezier(.22,1,.36,1) .05s backwards',
        modal: 'modalIn .6s cubic-bezier(.5,0,.5,1) both',
        scrim: 'scrimIn .6s cubic-bezier(.5,0,.5,1) both',
      },
      spacing: { sidebar: '237px', 'sidebar-c': '92px', rail: '268px' },
    },
  },
};
```

---

## 2. App shell & navigation

### 2.1 Frame (`PlacementApp` L20771)
- Page: `h-screen p-3`, background `TOOLS.BimaPlacement.bg` `#EEF4FF` (env tint replaces neutral canvas).
- Left: shared `Sidebar` (transparent, inherits page tint). Right: `main` white card, `borderRadius 24`, 1px `lineSoft`, shadow-shell; inner scroll area `pb-6`; content `px-6 pt-4`.
- Top of main: `Breadcrumb` (48px tall, `canvas` bg, r12, `px-3`, 12/600 letter-spacing .12px; ancestors `figTert` clickable, current `figInk`, separator `/` in `figDisabled`).
  - No case open: segments `[PL_NAV_LABEL[nav]]`; right slot = **Create Ticket** button (brand fill, r10, `10px 14px`, 12/600) → opens `PlCreateCaseModal`. Visible for both roles on every non-ticket screen.
  - Case open: segments `["My Tickets" (click → close case), case.id]`; right slot = `TicketPager` (id 12/600 + ▲/▼ 18×18 r6 buttons; list = visible cases not closed + current; tooltips "Previous/Next ticket, in urgency order").
- Global floating: `PlEngineChip` bottom-right (simulation, §10), toast bottom-center.
- Toast: `say(msg, tone="green")`, auto-dismiss 3400ms; white r12 card, 1px border in `PL_TONES[tone].line`, `CheckCircle2` 14 in tone fg, 12.5/500 text.

### 2.2 Sidebar (`Sidebar` L6033, shared)
- Width 237 / 92 collapsed (`.2s` transition). **Default collapsed = true** (App state).
- Top: wordmark lockup "Bima**Placement**" + environment chevron (18×18 r6; inert for single-env users — both Placement users have `envs: ["BimaPlacement"]`), collapse toggle (`PanelLeftClose/Open` 20).
- "Search Anything" button (r10, 0.5px `#D5D5D5`, 12/500) → `PlSearchModal`. Collapsed: 36×36 icon.
- "Menu" label 12/500, nav rows (`bk-item` staggered), 6×8 padding, r8, icon 24 (20 collapsed), label 14/600; active row bg `#DDE8FF` fg `#1458D2`; idle `figHint`; hover white/figInk; disabled `figDisabled` + not-allowed.
- Under "My Tickets", when a ticket is open: nested `CornerDownRight` + short id (strips `PLC`? — **⚠ `shortId` regex is `/^(END|CLM|PC)/` so `PLC-1024` → `LC-1024`; bug**).
- Footer: team roster (Head only: `TEAM_OF["Himani Doshi"].BimaPlacement = [bhupendra]` — 28px avatar + presence dot; tooltip "Online now" / "Out of office" / "Last online at h:mm PM" from `pseudoLastOnline`), then profile card (0.5px subtle, r12, 36px avatar, name 14/500 + 6px presence dot, role 12/500, `LogOut` 12). Presence: `online #00B200` / `offline rgba(169,172,177,.48)` / `ooo #FFCF0E`; derived from working hours unless `status` set.

### 2.3 Nav items per role — `plNavFor(u)` (L19906)
Identical for both roles in code:
| key | label | icon | Breadcrumb label (`PL_NAV_LABEL`) | Screen |
|---|---|---|---|---|
| `home` | Home | HeartHandshake | Home | `PlHomeScreen` |
| `cases` | My Tickets | ListChecks | My Tickets | `PlQueueScreen` |
| `manual` | Manual Review | SquareDashedMousePointer | Manual Review Queue | `PlManualScreen` |
| `master` | Insurer Master | Building2 | Insurer Master | `PlMasterScreen` (edit only if Head) |
| `reports` | Reports | TextSearch | Reports | `PlReportsScreen` |
| (`inbox`) | — not in nav | — | My Inbox | `PlInboxScreen` — **unreachable** ("hidden for now") |

⚠ Comments say Insurer Master is Head-only and "the executive never sees it" — code shows it to both, with read-only mode for the executive. Decide in rebuild.

Role helpers: `plIsAdmin(u) = u.role === "Placement Head" || u.first === "Himani"`; `plSetMe(user)` sets module-global `PL_ME = {name, role, initials, key}` used as audit actor.

### 2.4 Scope (mine / team)
- App-level `scope` state: Head defaults `"team"`, executive `"mine"` (no switcher).
- `plVisibleCases(cases, user, scope)` (L9950): executive → all cases **not** owned by Himani; Head + `mine` → only Himani-owned (escalated) cases; Head + `team` → everything.
- Ownership `plExecOf(c)`: `c.owner` if set → else `c.headEscalated` → Himani → else id in `PL_HEAD_ESCALATED_IDS = {PLC-1024, PLC-1028, PLC-1029, PLC-1035}` → Himani → else Bhupendra.
- `ScopeSwitch` (shared, L1124): segmented control 64×40 seats, brandBg track with `#D1C6FF` border r24, sliding white pill r32 with shadow, labels "Me"/"Team" 14/500 brand (active/hover) vs `greet`. Only rendered on Home for Head.
- Visible pool is passed to Queue, Manual, Inbox, Reports, Search, TicketPager. **Home receives the raw pool and applies `plVisibleCases` itself.** Insurer Master is not scoped.

### 2.5 Search modal (`PlSearchModal` L19849)
- Portal, scrim, white r16 card max-w 1000, max-h 86vh, `p-6`. `Esc` closes.
- `PlSearchField size="lg"` placeholder "Search Tickets, Clients, And Insurers", autoFocus.
- "Searching For" removable scope chips: `Tickets` (id, stage label, caseType, product labels) · `Clients` (client name, RM, SPOC) · `Insurers` (thread insurers + panel-selected insurers).
- Empty query: "Recent Tickets" = first 3 cases (open first). Results grid 3 cols of `PlSearchCard`: gradient `purpleSoft→white`, stage chip top-right, id 18/600 purple with `Highlight` (brand bg white text match), client w/ `User` icon, product, caseType chip, `Clock` + `PlSlaCell`, "Take Action →" button. Empty → `PlEmpty` "No matches".

### 2.6 Login (shared `Login` L5655)
- Page `canvas` p-7; inner full-bleed brand `#4100CF` r24; centered white card max-w-2xl r16 `p-6` shadow `0 8px 24px rgba(28,27,31,0.10)`.
- Title "Log in" 30/600 brand; sub "Welcome to Bimakavach Admin panel" 18/500.
- Step 1: Email (`LoginField` bottom-ruled, states idle/ok/error, help "Not a registered admin address"), **Verify** button (r16, `px-7 py-4`, 16/600; disabled grey `rgba(169,172,177,0.24)`).
- Step 2 (after verify): identity chip (16px avatar + name) + env lockup with chevron (picker if multi-env), Password field (masked/reveal, error "Incorrect Password"), **Login** button (busy → `Loader2` spinner, 900ms).
- Session persistence: URL hash `#s=<user><env>` (`s`=Bhupendra, `h`=Himani, `p`=BimaPlacement) + sessionStorage `bk_session_v1`. ⚠ `readSession` regex `/^#s=([nrush])([ecp])$/` does not accept `o`/`j` — irrelevant for Placement. Replace with real auth (JWT/OIDC) in rebuild.

### 2.7 PageHead / Greeting (shared)
- `PageHead({title, hint, right, ruleFirst, noRule})`: h1 32/600 brand truncate; hint 13/500; right slot (filter pills); ikkat rule below (mt-4) — Queue/Inbox/Manual/Master/Reports use it.
- `Greeting({right, user})`: 38px avatar, live wall-clock line "Wed, 26 August · 2:00 pm" (12/500 greet, ticks every 1s), greeting 26/600 brand (`user.greeting` or "Good morning/afternoon/evening, {first}."), right slot (ScopeSwitch), rule.

---

## 3. Screens

### 3.1 Home — `PlHomeScreen` (L14975)
**Purpose**: desk triage + performance snapshot. Read-only.
**Layout** (`space-y-6`): Greeting (+ScopeSwitch for Head) → "Your Desk"/"Your Team's Desk" (24/600 brand) grid `2 / md:3 / xl:5` of `DeskCard` → [Head+team only] divider + "Escalated to You" table → divider → "Your Progress"/"Your Team's Progress" + `RangePills` → 3-col grid: 2 `ProgressCard` stacked + `Donut` card (col-span 2).

**Desk cards** (all route to My Tickets via `setNav("cases")` — no pre-filter applied ⚠):
| Count | Pill (Indicator) | Tint (gradient end) | Rule |
|---|---|---|---|
| Insurer Response | `caution` | `#FFF6E0` | any thread status ∈ `rfq_sent, acknowledged, no_response, insurer_clarification` |
| RM Response | `info` | `#E9F1FF` | `plOpenRmQueries(c) > 0` |
| Quotes to Review | `success` | `#E9FBF0` | any live quote with no decision |
| Due Today | `caution` | `#FFF7DA` | internal SLA remaining ∈ [0, 480) mins (`PL_DUE_SOON_MINS = 8*60`) |
| Overdue | `error` | `#FFECEC` | internal SLA remaining < 0 |
DeskCard: 0.5px subtle, r12, pad 12.5, gradient `59.34deg white 49.85% → tint`, "N Ticket(s) in" 18/600, pill row, arrow button (white r10).

**Escalated to You** (Head, team scope): rows = active cases with internal, breached SLA, sorted by remaining desc. Columns: Ticket (id 13/700 + `Indicator "Escalated" error outline`, sub "SLA label · client"), Owner (exec name), Owed by (`Insurer` caution / `RM / Client` info / `Placement` brand outline Indicator), SLA breached ("N Days over" / "N Hrs. over" / "N Mins. over" in semError). Empty: "Nothing escalated to you right now." Footnote about H4 rule.

**Progress** (range pills: `Last Week | Last Month | Last Quarter | Custom`; Custom opens month-range modal):
- Last Week = live: "Tickets On Track" `onTrack/active` (onTrack = active minus internal breached); "Median SLA Used" = median of `(mins-remaining)/mins` over internal SLAs → displayed %, score = 1-used. `scoreStatus`: ≥0.7 "Well Done", ≥0.4 "On Track", else "Poor".
- Other ranges are **hard-coded illustrative numbers** (L15071–15094) — do not port as data.
- Donut "Ticket Time Distribution": hours held per party from the current SLA clock (`Insurer` caution `#FFF9E6` / `RM / Client` info `#EEF4FF` / `Placement` brand `#F4F1FF`), segments < 0.25h hidden; label "Last refreshed 4 Hrs. ago" (static ⚠).
- Computed-but-unrendered: `multiRfq` (cases with >1 RFQ), `earlyQcrs` (released QCRs with `earlyRelease.count < 3`).

### 3.2 My Tickets / Queue — `PlQueueScreen` (L14737)
**Purpose**: the work queue. Title "Placement Queue" (breadcrumb "My Tickets").
**Header right**: pill tabs (`PL_QTABS`) with counts:
| id | label | pool |
|---|---|---|
| `mine` | My Tickets | all non-closed visible cases |
| `action` | Action Required | non-closed with current SLA internal (`!s.external`) |
| `sla` | SLA Risk | internal & remaining < 60 min (includes breached) |
| `all` | All Tickets | all visible incl. closed |
Pill spec: `8px 12px`, gap 6, 0.5px border, r-full, 16/500; active brand fill white text + white 8px dot; idle white/`figHint`/line border; label `Label(N)`.
**Toolbar** (right-aligned): Sort control (187px, brand underline, "Sort by: Oldest First|Newest First", `ArrowDownWideNarrow`), MenuCard options. Sort by `plAgeDays` (from `receivedAt`).
**Table** (no outer border; header strip `canvas` r12 `px-2 py-3`):
| Column | Content | Filter |
|---|---|---|
| Ticket ID | `PLC-####` 14/500 brand + mandate star (`#FF7700` signed / ink3 requested·considering) + green "•" if `c.demo` | — |
| Stage | `Indicator status` label `plStageLabel(c)`, ind `plStageInd(c)` | `HeaderFilter` (options sorted by stage step) |
| Type | `Indicator` neutral `meta.caseType` | HeaderFilter |
| Ticket Age | `plFmtAge`: "Today" / "N Day(s)" | — |
| Client | name with "Pvt Ltd/Ltd/LLP" stripped | HeaderFilter |
| Product | full product label (`PL_PRODUCTS[code]`) | HeaderFilter (right-anchored menu) |
| Current SLA | `PlStageDue` | — |
| Owner (Head only) | 22px avatar + first name | — |
Row: `bk-item pl-row-hover r12 px-2 py-3`, staggered; dividers 1px `lineSoft`; click → open case. Empty: `Empty` "No tickets match these filters." Footer: "N of M tickets".
HeaderFilter: 20×20 r6 chevron square, label 14/600 `#1C1C1C`, brandBg count badge when active; multi-select with "All" reset; options computed from currently rendered rows. One menu open at a time; click-away / Esc closes.
Foot: amber `PlSimBlock` "Simulate BimaSetu (RM side)" → `PlFloatSimModal` (**sim only**).
Unused state: `fUrg` urgency filter (no header), `awaitingReview`, `PlUsableMeter` per row (computed `uc` not rendered).

### 3.3 Case Workspace — `PlCaseWorkspace` (L15226)
**Header** (`px-6 pt-5`):
- Row 1: case id 28/650 purple · mandate pill (`Indicator big status size16`):
  - `signed` → ind `orange`, label "Exclusive Mandate" (or "Exclusive Placement Mandate · on file (BimaSetu)" when `meta.mandate.source==="BimaSetu"`), leading `IconStarCheck #FF7700`, hover → `PlMandateHover` popover (320px, gradient white→orangeSoft, `PlMandateDetails`).
  - `requested` / `considering` → ind `neutral`, "Mandate requested" / "Mandate: client considering", ink3 star, hover → `PlMandateRequestHover`.
  - else none.
  · status pill: `Indicator big status` label = outcome label or `plCaseStatus(c).internal`; tone: outcome tone, else regex on internal: /Clarification|Awaiting RM/ → orange(caution), /Release|QCR/ → purple(brand), /Review/ → amber(caution), else blue(info). Priority chips intentionally suppressed.
- Row 2 (14/500, gap-x-6, each wrapped in `MetaHover` tooltip naming the field): `User` Client name · `Briefcase` product label · RM avatar (blue initial) "RM: **Shubh Bangar**" · "Placement Manager: **Himani Doshi**" (⚠ **always Himani**, hard-coded from PORTAL_USERS, not `plExecOf`) · `IconBanknoteCheck` "Target Premium: **₹78 L**" or "Not provided" (ink3/500) + purple underlined "Add"/"Edit" link (open cases) → `PlTargetPremiumModal`.
- Right cluster: `Indicator thick` caseType (`Renewal` → brand, else info) + `PlAvatarStack` (Bhupendra, Himani, RM [blue], Client SPOC [green]; portal tooltip "Name · Role") + **Contact RM** button (`PlBtn sm`, **no handler** ⚠).
- Ikkat rule `my-5`.
**Tab bar** (shared `TabBar`, right-aligned, h-40, active `rgba(65,0,207,0.08)` bg + 2px brand underline, top radii 8, 14/500; red 6px dot on the tab `plNextAction(c).tab` points to):
`overview` Overview · `rfq` RFQ · `strategy` Client 360 · `docs` Documents · `contact` Insurance Contact (sub: `insurers` Insurer Panel / `market` Insurer Threads) · `quotes` Quotes · `qcr` QCR · `mail` Mail Trail · `activity` Audit Trail.
Default tab: `initialTab` or `plNextAction(c).tab` (insurers/market → contact) or `rfq`. Workspace remounts on `key = id + openTab`.
**Body**: `flex gap-4 px-6 pb-8`: **`PlRightRail` on the LEFT** (268px sticky; ⚠ named "RightRail", audit T1.2 wanted it on the right; code still renders it first) + tab content `flex-1`.

#### 3.3.1 Rail — `PlRightRail` (L16161)
1. `PlTicketStageTimeline` — current case SLA card: gradient white 50% → state tint; border state colour; title "Ticket Stage Timeline" 12/500; owner chip (Insurer shield-plus purple / RM blue initial / executive photo + name); head 18/600 "Xh left" / "Xd Yh over" / "Clock stopped" (closed) / "No clock on this stage"; 3px bar (remaining portion in green/yellow, track red); "{target} • Xh elapsed"; `Clock` "Due in Xh" / "Was due Xh ago". States: noClock (neutral), ok green (`#ECFBEA/#A9EAA2/#007B00/#00B200`), atRisk ≤20% remaining (`#FFF9E6/#FFE890/#B38F0A/#FFCF0E`), breached (`#FFECEC/#FFABAB/#CF0000/#F10000`). Title tooltip `"{SLA id} - {target}"`.
2. **Next action** card (if `plNextAction(c)`): tone-tinted card, `PlLabel "Next action"`, label 13/550, primary full-width sm button "Go there →" → `goTo(na.tab)`.
3. `PlMandateCard` (§3.3.12).
4. `PlMandateRmSimBlock` (sim).
5. `PlBimaSetuSimBlock` (sim, floated & open only).
6. Outcome card (closed): `PlChip` outcome tone/label, KVs: Selected insurer (+logo), Selected quote "Quote V{n}", Premium, QCR version, Recorded by, Decision date; reason text.

#### 3.3.2 Overview tab — `PlOverviewTab` (L15561)
- `PlTabHeader "Ticket Workflow"` meta "Ticket Age: **N Days**".
- `PlPhaseBar`: 6 phases `PL_PHASES = ["Ticket Intake","RFQ Verification","Insurer Selection","RFQ Placement","Quote & QCR Generation","Ticket Closure"]`; current = `PL_STAGE_PHASE[stage]` (outcome → 5). Bars 3px r-full: done 100% success dot `#00B200`; current 55% caution `#FFCF0E` or error `#F10000` if internal SLA breached; future empty. Labels 13.5 (current 600 figInk).
- Collapsible "Workflow Stages" section (r16, `ListChecks` orange, chip "8 stages", chevron/X): rows from `PL_WORKFLOW_ROWS` (§6.3) — left 26×26 r8 badge (done `CheckCircle2` purple / now purple dot / next faded dot) with dashed connector; row card (done: sunk + strike-through; now: purpleSoft + purpleLine + 600 weight; next: white); right cluster `PlActorMark` (BimaKavach two-tone wordmark / Insurer shield / RM blue / System grey "S"), "LIVE" 11/600 purple when now, `{sla} {unit}` 12 ink3, 16×16 check box (done tick / now dash). Footnote explains BH/WD/Min.
- `currentStep = outcome ? 6 : PL_STAGE[stage].step`. Manual tickets: "Ticket created" actor = BimaKavach; floated = system.

#### 3.3.3 RFQ tab — `PlRfqTab` (L17504)
Header: "Request for Quote", meta `PlChip purple "V{active} of {n}"` + product short.
Stack (`space-y-3`):
1. Orange callout if product code not in `PL_PRODUCT_TYPES`: "Product not mapped — Admin to map. BimaSetu sent "{code}", which is not on the Placement product master yet."
2. If `c.float`: "BimaSetu float" card — KVs Line ref (mono), RM, Exclusive mandate Yes/No, Note to Placement.
3. `PlRfqSummaryAccordion` (collapsed by default) → `PlRfqSummaryCard` 2-col KVs: Source ("Manual ticket" / "BimaSetu float · {lineRef}"), Submitted by (+avatar: creator or RM), Received (mono), RFQ version (purple pill "V1 of 1"), Industry type, Business type ("Renewal - Our renewal"), Risk tier ("Not set"), Renewal date (Renewal only), RFQ template(s), Client SPOC; optional italic `rfq.rmNote`.
4. If >1 RFQ: "RFQ versions" chips `V{n} · {status}` (active purple) + "Change: {changeNote}".
5. `PlRiskTierCard`: "Risk tier" + hint; segmented pills `Preferred | Non-preferred` (active purple fill). Editable only in `rfq_review` → `api.setRiskTier`. **Gates Validate.**
6. `PlRfqSourceCard`: link card (header `LinkIcon` "RFQ V{v} · RFQ link · {product label}" + URL mono + time + "Open link"; body `PlDocViewer` with `PlRfqSheetGrid` — Excel-look read-only grid of `rfq.sections` [A/B columns, row numbers, bottom sheet tabs per product]) and/or Excel card (36px purple file icon, "EXCEL DOCUMENT" (uppercase ⚠), file name blue, "RFQ V1 · 46 KB · uploaded by X · time", Preview (if blob), Download → `plDownloadRfq`).
7. "Queries to the RM" card (shown in `rfq_review`/`awaiting_rm` or when any exist; orange border if unresolved): chip `None raised` / `N open` / `All queries resolved`; help "Optional... raise a query to the RM in BimaSetu / by mail ... you resolve each one"; **Raise query to RM** (primary sm, `rfq_review` only) → `PlAskRmModal`. Rows: `Circle` orange / `CheckCircle2` green, label, note or "Resolved by X · time", "RM answered {at}: {answer}", **Mark resolved** (sm, rfq_review only) → `api.resolveGap`. Empty: "No queries raised on RFQ V1. Raise one only if the RFQ needs clarification — otherwise validate directly."
8. "RM query mails" card (manual tickets, when rmThread non-empty or awaiting): chip "Waiting on {RM}"; sim "⚡ Simulate RM response" → `PlSimRmModal`; messages (PM purpleSoft vs RM cardAlt) with "- gap" bullets.
9. Validate card (`rfq_review` only, cardAlt): "Validate RFQ V{n}" + status text: "No open queries." / "Set risk tier to validate." / "N query(ies) still open. Set risk tier to validate." / "N query(ies) still open."; **Validate RFQ** primary, disabled unless no unresolved queries AND risk tier set → `api.validateRfq`.
Suppressed: Risk classification card (data still exists, `rfq.classification`).

#### 3.3.4 Client 360 tab (`strategy`)
Placeholder only: `PlTabHeader "Client 360" meta "Syncing"`, centered card (min-h 320, 44px brandBg circle `Building2`): "Client 360 is syncing…" / "Company 360 is taking some time to load. Kindly wait till you receive an update." Future integration slot. (`PlCaseStrategyCard` exists but is dead code: Ticket type slot, Incumbent, Target premium, mandate callout with "RM Approval / Placement Approval" ticks, rollover-without-mandate red warning.)

#### 3.3.5 Documents tab — `PlDocumentsTab` / `PlDocumentsCard` (L17130)
Header meta "N documents · X internal · Y external". `PlSubTabs` Internal(count) / External(count).
- Internal: RFQ rows per version (Excel: name + "RFQ V{v} · Excel · size · uploaded by · at"; link: "RFQ V{v} link" + URL) or fallback `RFQ_{id}_V{n}.pdf`; `Client_form_submission.pdf`; `{product}_expiring_schedule.pdf` (⚠ synthetic placeholders).
- External: every quote PDF (`q.doc`, sub "{insurer} · Quote V{v} against RFQ V{r} · {at}", chip Usable green / Superseded / Excluded red / Awaiting decision purple) + every QCR (file name, "QCR Version n · released at", chip Superseded / Released / Draft / Failed / Generating).
- Row: 26px purple file icon, name 11.5/550 blue, sub 10, chip, **View**, **Download** (synthesised placeholder blob for non-RFQ docs).
- Empty external: "No external documents yet. Insurer quote PDFs and QCR versions appear here as the ticket moves through the workflow."

#### 3.3.6 Insurance Contact tab — `PlInsuranceContactTab` (L15426)
Header "Insurance Contact", meta "N threads · M usable"; `PlSubTabs` "Insurer Panel" / "Insurer Threads" (red dot where next action points).

**(a) Insurer Panel — `PlInsurersTab` (L17766)**
- *Unlocked* (before send):
  - Info card: "Every insurer + branch on the Insurer Master with POCs for {group}. Each selection is one thread, and every POC on it gets every mail. Appetite chips are a hint only. Locked markets stay visible with the reason."
  - "Insurer Master" list card (header count "N insurers · M entities"): one row per **entity** (`plEntitiesFor(c)` — insurer+branch with ≥1 POC for the case's product group). Row: `PlTick` (hidden if locked) → `api.togglePanelBranch(id, insurerId, branch)`; entity label "Insurer — Branch"; lock chip (`Do Not Float` red / `Inactive` / `Branch inactive` / `No POC` / `Incumbent – mandate needed` neutral); appetite chip "{short} in appetite" green / "not in appetite" red; sectors; POCs column (168px). Selected rows purpleSoft; locked opacity .72.
  - Footer card (purpleSoft): "N insurer(s) selected" or "N entities across M insurers selected"; hint "Fewer than 3 insurers makes the usable-quote threshold hard to reach." / "Sending creates one independent thread per insurer + branch, each with its own SLA."; **Send to insurers** (disabled if none) → confirmation modal (§4) → `api.floatRfq`.
- *Locked* (after send): "Approved insurer panel" card + green "Locked" chip; one row per thread (logo or name, "POCs · branch · TH-nn", `PL_TSTAT` chip); "Removed from the recommended list" card for `panel.excluded` (`Ban` icon, "Name - reason").
- ⚠ No UI entry to add insurers after lock except via revision "Add an insurer" (`PlAddInsurerModal`); `togglePanelBranch` supports post-send add (creates a new thread).

**(b) Insurer Threads — `PlMarketTab` (L18090)**
- Empty (no threads): `PlEmpty Users` "RFQ has not been sent to insurers yet" / "Approve the insurer panel on the Insurers tab...".
- Green banner if `followUpsStopped`: "Automated follow-ups stopped — The usable-quote threshold was reached. N thread(s) remain open...".
- Intro: "Insurer threads — Independent per insurer + branch. A clarification, decline or held clock on one thread changes nothing on the others. Every POC on a thread is in To."
- Table (r12, sunk header 12/600): **Insurer & Activity** (logo 24px or name, branch chip if insurer has >1 branch in master, follow-up count chip: 0 neutral / 1 green / 2 amber / ≥3 red; `N/A` when terminal) · **Status** (`PL_TSTAT` chip) · **Date & Time** (last event at) · **Stage Due** (plain coloured text: `N/A` disabled / "Xh held" `#007B00` / "Xh over" semError / "Xh left" semCaution — ⚠ reads static `t.slaH`, not the live `plThreadRemainingMins`) · **Actions** (one state-driven button, full width, `ChevronRight`):
  | thread status | action |
  |---|---|
  | `declined`, `quote_usable`, `quote_excluded` | none |
  | `quote_received`, `quote_clarification` (with undecided quote) | **Review Quote** (primary) → Quotes tab |
  | `awaiting_rm` | RM responded → **Reply to insurer** (primary, `PlReplyInsurerModal`); else disabled **RM Response** |
  | `insurer_clarification` | **Request from RM** (primary, `PlHoldForRmModal`) |
  | `no_response` | **Send follow-up** (if active & <3) else **Send escalation** → `api.followUp` |
  | `rfq_sent`, `acknowledged` | **Send follow-up** (if `followUpsActive`) |
  Row bg: open → cardAlt, paused → orangeSoft. Row tooltip = `plThreadNext(c,t)`.
- Expanded row (2 cols): left "Thread history · TH-nn · To: POCs · branch" timeline (5px dot: Insurer blue / System grey / PM purple; text 11.5; "at · actor" mono 10). Right: held callout (dashed orange `Pause` "Insurer clock held at Xh" + reason), decline callout (red), "Insurer asked" box (question + green "{RM} replied" sub-callout), **Actions**: Request information from RM (insurer_clarification) · ⚡Simulate RM response (manual, awaiting_rm, no answer) · Reply to insurer and resume clock (awaiting_rm with answer) · Send follow-up (rfq_sent/acknowledged/no_response) · **Download quote** (primary) + **Re-upload quote** (ghost; hidden file input `.pdf,.doc,.docx,.xlsx,.xls` → `api.simulateInsurer(...,"quote")` ⚠ treated as new quote) · **Log call** → `api.logCall`. Then amber sim block "Simulate insurer response": Acknowledged / Clarification raised / Quote received / Declined → `api.simulateInsurer(kind)`.

#### 3.3.7 Quotes tab — `PlQuotesTab` (L18466)
- Header "Quotes", meta "No quotes yet" / "N quotes on RFQ V{r} · M usable".
- Empty: `PlEmpty FileText` "No quotes yet" / "Quotes appear here as insurers respond. Each one needs your decision before it can count toward the QCR threshold."
- Table (rows = quotes on active RFQ grouped by panel-selected insurers; default-expanded = first undecided): Insurer & Contact (logo, branch chip when insurer has >1 thread, `V{n}` chip when insurer has >1 quote) · Product · Status chip (`PL_DECISION_CHIP` or "Awaiting decision" purple / "Superseded" neutral) · Received · Premium (right, mono 12.5/650 + `plTargetFlag` chip if premium>0) · chevron. Superseded rows opacity .6.
- Expanded → `PlQuoteWorkspace` (L18575):
  - Header: insurer logo, chips `Quote V{v}`, `RFQ V{r}`, `V{x} superseded`; "{product} · received {at}"; right status chip ("Awaiting your decision" purple).
  - Quote PDF frame: file name + Download; `PlDocViewer` with placeholder skeleton lines (no extraction — "Quotes are stored as received").
  - **Premium block** — the only editable value: `PlInput kind="money"` "Premium (as recorded by you)" → `api.setQuotePremium` **on every keystroke** (⚠ audit spam; debounce/commit-on-blur in rebuild) + target flag chip; hint "Blank premium reads as Target Not Available. Every change is logged to the audit trail."
  - Decision bar (not superseded): orange callout if clarification open ("...can be marked usable once the insurer's revised quote arrives."); decision meta; buttons **Exclude from QCR** (danger, `XCircle`) → `PlQuoteExcludeModal`; **Needs clarification** → `PlQuoteClarifyModal`; **Mark usable** (success, `CheckCircle2`; disabled if `!plCanMarkUsable(q)` or already usable) → `api.decideQuote(...,"usable")`.
  - Superseded footer: "Superseded by a later revision from the same insurer. Retained for audit; does not count toward the threshold."

#### 3.3.8 QCR tab — `PlQcrTab` (L18789)
Header "Quote Comparison Report"; meta: released → "V{v} released [to RM] · round {r}"; draft → "V{v} draft · {source} · awaiting release" / "· awaiting release" / "· generation failed" / "· generating"; none → "{n} of 3 usable quotes".
Sections in order (each conditional):
1. **No draft, no release** — threshold card: explanation ("Once 3 usable quotes from 3 distinct insurers ... go to Copycat ..."), `PlUsableMeter` (pips + "n/3", "usable · distinct insurers"), green callout per usable insurer, "No quotes have been marked usable yet."; if 0<n<3: orange "Create the QCR with n quote(s)" + **Create QCR with n quote(s)** (`AlertTriangle`) → `PlEarlyReleaseModal` and **Upload QCR** → `PlQcrUploadModal`; if met: "Upload a QCR directly — Bypass Copycat ... lands at Pending Placement Release" + **Upload QCR**. (Threshold met normally auto-creates the draft, so this block is mostly pre-threshold.)
2. **Revision requested** (stage `revision_requested`, open revision): orange card "Revision requested · round N"; "{The client|Us} objected to QCR Vx: "reason" · at. No insurer has been contacted."; buttons by asks: **Restart threads (Re-rate / Revised terms)** → `PlRestartThreadsModal` (default reason "Revision round N: ..."); **Add an insurer** → `PlAddInsurerModal`; **Create RFQ V{n+1}** → `PlOutcomeModal kind="rfq_v2"`.
3. **Late quotes** (released, no draft, and either undecided quotes received after release or usable quotes not in released QCR): orange card + **Review quote**, **Create QCR V{n+1}** → `api.newQcrVersion`, **Upload V{n+1}**.
4. Versions row: chips `QCR V{n} · {status}` (released green+lock / superseded neutral + "· RFQ V{r}" / draft purple) + source chip (`Copycat` / `Manual` / `Single quote`).
5. Copycat **queued/generating** card: "Generating with Copycat" chip; "Copycat is building the QCR from N quote PDFs." + document list "{insurer} · {POCs} - {short} v{n} · {file}".
6. Copycat **failed** card: red chip "Generation failed"; red callout with error; **Retry with Copycat** → `api.regenerateQcr`.
7. `PlQcrDocument` (when ready or file-based): header "Quote Comparison Report - V{v}" + "Released and locked"/"Draft" chip + source chip; meta line (client · RFQ · counts · uploaded/generated/released stamps); early-release orange strip "Released below the usual threshold with N usable quote(s)" + reason; file row (name blue, "QCR V{v} · source") with **Open** (Copycat → `PlQcrReportModal`) or **Download** (manual/single); disclaimer "Terms are shown as quoted. This report does not rank the quotes or identify a preferred market - the choice sits with the client, advised by the RM."
8. **Stale draft** (Copycat ready but usable quotes missing from draft): orange "N usable quote(s) not in this draft" + **Regenerate with Copycat**.
9. `PlQcrRowsCard` (editable on draft): header "Quote rows · QCR V{v} · round {r}", columns Insurer / Premium (money input) / Sum insured / Validity / Terms note → `api.setQcrRow` per keystroke; footer `PlTick` **Quote rows checked** (sub "These rows go to BimaSetu/the RM with the QCR file.") → `api.setQcrRowsChecked`. Empty "No quotes in this draft."
10. Release card (draft): "Send QCR V{v} to BimaSetu · round r" / "Release QCR V{v} to the RM"; explanatory copy per state; **Send to BimaSetu / Send to RM** (lg primary; disabled unless `canRelease && rowsChecked`, tooltip "Tick Quote rows checked first") → `PlSendQcrModal`.
11. Sim block "Simulate Copycat → Fail the next generation" (Copycat drafts only; **sim**).
12. Closure controls (open tickets): manual → `PlClientDecisionMenu` "Log client decision ▾" (portal menu 340px: **Quote selected** [only if released QCR] "Pick a quote row from QCR Vn", **No appetite** "No insurer will write this risk", **Lost** "Client placed elsewhere or withdrew") → `PlOutcomeModal`; floated → **Close: No appetite** → `PlOutcomeModal kind="no_appetite"`.

#### 3.3.9 Mail Trail tab — `PlMailTab` (L19596)
- `PlSubTabs` Mail / BimaSetu.
- **Mail view**: header meta = `ThreadTab` pills: `RM (n)` (all non-insurer audit entries rendered as mail) + one per thread "{Insurer first word}[ · branch first word] (n)" + placeholder pills for panel-selected entities not yet threaded (0). Search box "Search sender, subject, body or attachment name" (with clear). Mail card: 40px italic-serif monogram (insurer in blue, outbound purple, else green), name 14/600, time mono 12, "to {POC <email>, ...}" for outbound or sender email for inbound, subject "{id} · {insurer} · {products}" / "{id} · {client} · RFQ / QCR", body (event + detail), attachment chips (`Paperclip` + RFQ file / "RFQ link (in mail body)") on RFQ-sent/restart events. Separator ikkat rule 40% opacity. Empty "Nothing on this thread yet." / `No mail matches "q".`
  - Emails are **synthesised** by `plMailFrom` (e.g. `underwriting@iciclombard.com`, `rm@bimakavach.com`, `{first}@bimakavach.com`, `bot@bimakavach.com`) and direction inferred by regex — in the rebuild mail must come from real stored messages.
- **BimaSetu view**: header meta "N BimaSetu messages"; reverse-chronological rows: `bk-mark` + "← In · {type}" / "→ Out · {type}", summary (`plBsSummary`), right "BS-n · at"; `bk-trail` dividers. Empty: "No BimaSetu messages yet." / "Manual ticket - nothing is exchanged with BimaSetu."

#### 3.3.10 Audit Trail tab — `PlActivityTab` (L19758)
- Header meta `ThreadTab` filters: All · You (`PM`) · Insurers (`Insurer`) · RM (`RM`) · System (`System`).
- Rows reverse-chronological: `bk-mark` bullet, event 14/500, detail 12/500 ink3 (indented 20), right: avatar (PM → **current exec photo** ⚠ regardless of actor; Insurer shield purple; System neutral "S"; RM blue initial), actor name, "·", timestamp mono 13. `bk-trail` dividers. Empty "Nothing logged yet."

#### 3.3.11 Next action engine (drives rail card, tab dot, default tab) — `plNextAction(c)` (L12013)
| Condition | label | tab | tone |
|---|---|---|---|
| closed | `null` | | |
| `rfq_review` + any unresolved query | "Resolve the queries the RM answered" | rfq | orange |
| `rfq_review` | "Review the RFQ - raise any queries to the RM, or validate" | rfq | purple |
| `awaiting_rm` | "Waiting on RM response" | rfq | orange |
| `insurer_selection` | "Select insurers and send the RFQ" | insurers | purple |
| market/quote_review + paused thread | "Reply to {insurer} clarification" | market | orange |
| … + undecided live quotes | "Review N quote(s) awaiting your decision" | quotes | purple |
| … + thread `slaH<0` not paused/declined | "{insurer} has breached SLA" | market | red |
| … else | "Monitor insurer responses" | market | neutral |
| `qcr_draft` file-based | "Check the quote rows and send the QCR to {BimaSetu\|RM}" | qcr | purple |
| `qcr_draft` copycat failed | "QCR generation failed - retry with Copycat" | qcr | red |
| `qcr_draft` copycat ready | same as file-based | qcr | purple |
| `qcr_draft` else | "Copycat is generating the QCR" | qcr | neutral |
| `revision_requested` | "Revision requested - act on what the RM asked for" | qcr | orange |
| `qcr_released` + undecided live quote | "Late quote received - decide on the next QCR version" | qcr | orange |
| `qcr_released` | "Awaiting client decision via BimaSetu" / "via RM" | qcr | neutral |

#### 3.3.12 Mandate card — `PlMandateCard` (L15932)
Hidden when closed or `signed`. Orange-line card, `IconStarCheck` + "Exclusive Mandate" label + status chip (Requested orange / Client considering orange / Declined red).
- `none`: "Ask {RM first} for the client's Exclusive Placement Mandate." + "For information only — it doesn't change insurers, quotes or the QCR." + **Request mandate** (full sm) → `PlRequestMandateModal`.
- `requested` / `considering`: "Waiting on {RM}" / "Client is still considering"; latest RM response bubble (18px blue avatar, note 2-line clamp); "Requested by {first} · at", "Preferred insurer: X", "Reason: X", "N reminder(s) sent · last at"; **Send reminder** → `PlMandateReminderModal`; **Withdraw** → `PlWithdrawMandateModal`.
- `declined`: "Declined by {RM} · closedAt" + note + **Request again** (prefilled from last request).
- Action gate: `PL_ME.key ∈ {bhupendra, himani}`.

#### 3.3.13 States summary for the workspace
- **Stages**: rfq_review, awaiting_rm (RFQ Clarification), insurer_selection (unlocked/approved), market, quote_review, qcr_draft (queued/generating/failed/ready/manual/single_quote), qcr_released, revision_requested, closed (quote_selected/lost/no_appetite).
- **SLA breach**: internal → red Ticket Stage Timeline, phase bar red, Home Overdue / Escalated; external → "On hold" in queue, never a breach.
- **Hold**: thread `paused` (orange dashed, clock held), case `awaiting_rm`.
- **Closed**: header pill = outcome; Target Premium edit hidden; rail outcome card; mandate card hidden; most actions disabled by api guards (UI still renders some buttons ⚠).
- **Escalated**: `headEscalated` / seed ids → owner Himani; hidden from executive entirely.

### 3.4 Manual Review — `PlManualScreen` (L16460)
**Purpose**: inbound insurer emails the bot would not apply alone. "Nothing here has updated a ticket automatically."
Header pills: **My reviews (n)** / **Unmatched (n)** (n = not yet done).
- *My reviews* (`PL_MY_REVIEWS`, seed): card header cardAlt: case id mono purple, insurer, amber chip "Mapped, interpretation unclear", time. Body: subject 12.5/600, body in sunk box, `Info` "why". Classification pills (`PL_CLASSES_IN = ["Quote Received", "Clarification Required", "Declined", "Not Applicable"]`) → **Confirm classification** (primary sm) + **Open thread** (→ case `market`). Confirm: finds thread by `TH-nn` in subject + insurer name; `Quote Received→simulateInsurer("quote")`, `Clarification Required→"clarify"`, `Declined→"decline"` (each with `{note: body, source: reviewId}`), `Not Applicable→logInbound("Inbound mail marked not applicable")`. Done state: green "Confirmed as X - applied to the thread". No thread → toast "No matching thread on {case} — nothing applied".
- *Unmatched* (`PL_UNMATCHED`, seed): chip "Ambiguous mapping" (orange) / "Unrecognised sender" (amber), id, time; subject, from, body, attachment (`FileText`), why. Two `PlMenuPicker`s: **Placement Ticket** (300px; options: product-matched cases first labelled "· matches GMC, …" via `plMatchProductTypes(subject+body+attachment)`, then others) and **Insurer thread** (240px, disabled until case) → **Confirm mapping** → `api.logInbound(case, thread, id, "Inbound mail mapped to thread", subject · attachment)`. Done: "Mapped to {case · thread} - routed to that thread".
- `done` state is app-level `reviewDone` (not persisted on cases ⚠). Sidebar red dot for Manual Review is wired to `mails=[]` → never shows in Placement.
- Rebuild: needs a real **InboundMail** entity + classifier output; the seeds `IN-4482/4479/4471/4468` are mocks.

### 3.5 Insurer Master — `PlMasterScreen` (L16666)
**Purpose**: routing master: Insurer + Branch + Product Group → POCs. Hint "Routing key is Insurer + Branch + Product Group. Every POC gets every mail."
- Header right: chip "Placement Head · can edit" (purple) or "Read-only · Placement Head maintains the master"; `PlSearchField sm` 200px "Search insurers..." (matches name + branch).
- Table (one row per insurer×branch): INSURER (name 12.5/600 + note 11 ink3) · PRODUCTS (appetite code chips xs) · BRANCH ("—" if blank) · POCS (per group "EB: a, b" / "Liability: …" / "P&C: …") · STATUS (dot chip: Active green / Inactive neutral / Do Not Float red / "Branch inactive" neutral) · [Edit ghost sm — Head only].
- "Change log" card (from `PL_MASTER_AUDIT`): "at · by · **entity** · field: before → after".
- Edit → `PlInsurerEditDrawer` (§4) → `api.saveInsurerMaster(insurerId, branchIdx, patch)` (refuses unless `PL_ME.role === "Placement Head"`).

### 3.6 Reports — `PlReportsScreen` (L16908)
PageHead "Reports", hint "Derived from the tickets in this prototype."
- 2-col grid: **Placement pipeline** card — metrics Active / Closed / Quote selected (green) 20/650; `PlBar` per non-closed stage (label 148px, 8px track, purple fill, count). **SLA** card — Within SLA (green) / Breached (red) / Under an hour left (orange); "Breaches by stage" red bars or "No Placement-owned breaches right now."; note "Time spent waiting on RM, client or insurer is excluded - those clocks have their own owners."
- **Insurer outcomes** table: INSURER / APPROACHED (threads) / RESPONDED (status ≠ `rfq_sent`) / QUOTED (status ∈ quote_*) / DECLINED; sorted by approached desc.
- Scope: visible cases. Backend: build as aggregate queries.

### 3.7 My Inbox — `PlInboxScreen` (L16356) — unreachable in nav
Entry queue. Pills All / Quotes / Clarifications. Items: `awaiting_rm` → "RM clarification pending" (cta Review response → rfq); unreplied thread clarifications → "RM has answered - reply to insurer" / "Insurer clock held, waiting on RM" / "Insurer clarification received" (Open thread → market); open revision → "Revision requested" (Open QCR); undecided quotes → "New quote received" (Review quote → quotes). Columns CASE / CLIENT / SOURCE / TYPE / RECEIVED / ACTION. Empty `PlEmpty` "Nothing waiting". Worth keeping as a notifications/inbox view.

---

## 4. Modals & drawers

All use `PlModal` (portal, scrim, r16 card, width 560 / `wide` 860 / `size="xl"` 1000, header title+subtitle+`PlIconBtn X`, body `px-5 py-4`, sunk footer right-aligned) unless noted.

| Component (line) | Opened from | Inputs | Primary action → API | Notes / validation |
|---|---|---|---|---|
| `PlCreateCaseModal` (14395), wide | Breadcrumb "Create Ticket" | RFQ Excel (`PlRfqUploadField`, `.xlsx/.xls/.csv`, no size limit) and/or RFQ link (must start http); Business name*; Industry type* (`PL_INDUSTRY_TYPES`); Product type* (one of 20 `PL_PRODUCT_TYPES`, label "EB · Group Medical Cover (GMC)"; shows "RFQ template: …"); Business type* (`New - New policy / Renewal - Our renewal / Rollover - Other Co. renewal`); Renewal date* (Renewal only, date input → "dd Mon yyyy"); Incumbent insurer (Renewal/Rollover, optional); Relationship Manager (disabled, `Shubh Bangar`); Client SPOC (opt); Urgency (High/Medium/Low, default Medium); Target premium (opt, money); Owner (Head only: Bhupendra default / Himani) | **Create ticket** → `api.createCase(d)`; then opens new case on RFQ tab | Subtitle "PLC-{next} · manual ticket"; footer "Missing: …" list; callout "Nothing is read from the RFQ…" |
| `PlTargetPremiumModal` (14591) | Header Target Premium Add/Edit | value (money, blank removes), note | **Save** → `api.setTargetPremium(id, value, note)` + toast added/updated/removed | Title "Add/Edit target premium"; blue callout "decision support only" |
| `PlAskRmModal` (17683) | RFQ tab "Raise query to RM" | dynamic query lines (`PlInput` + remove `X`, "Add another query"); Message (manual only, prefilled "Hi {RM}, before I can send RFQ V…") | **Send mail** / **Raise in BimaSetu** → `api.requestRmInfo(id, newGaps, note)` | Floated requires ≥1 new query; manual allows resend of still-open; orange callout "The ticket moves to **RFQ Clarification**…" |
| `PlSimRmModal` (17743) *sim* | RFQ tab | RM reply text | **Post reply** → `api.simulateRmReply` | manual tickets |
| Send-RFQ confirmation (inline in `PlInsurersTab`, 17883) | "Send to insurers" | — | **Send to N thread(s)** → `api.floatRfq(id)` | Shows Product type chip, RFQ attached (file "attached to every insurer mail" / link "in the body of every insurer mail" / "No RFQ source on the ticket yet."), per-entity row "POCs · own thread · target X business days", mandate on file, "One thread per insurer + branch; every POC is in To." |
| `PlAddInsurerModal` (17979) | QCR revision "Add an insurer" | search; multi-tick entities not already threaded on active RFQ; locked disabled with reason | **Add N** / **Done** → `api.togglePanelBranch` per pick | after lock this creates new threads |
| `PlRestartThreadsModal` (18380) | QCR revision "Restart threads" | `PlThreadPicker` (restartable threads: open & not awaiting_rm), Reason* | **Restart selected threads** → `api.restartThreads(id, threadIds, reason)` | |
| `PlHoldForRmModal` (18398) | Thread "Request from RM" | ask text (prefilled with insurer question) | **Send and hold the clock** (`Pause`) → `api.holdForRm(id, threadId, note)` | callout "This insurer's SLA holds at Xh…" |
| `PlSimThreadRmModal` (18420) *sim* | Thread | RM response | **Post response** → `api.rmAnswered` | |
| `PlReplyInsurerModal` (18432) | Thread "Reply to insurer" | reply text (prefilled incl. RM response) | **Send reply and resume clock** (`Play`) → `api.replyToInsurer` | green callout |
| `PlQuoteClarifyModal` (18693) | Quote "Needs clarification" | message to underwriting desk | **Send clarification** → `api.decideQuote(id,qid,"clarification","Clarification sent to insurer")` | ⚠ message text is not stored |
| `PlQuoteExcludeModal` (18715) | Quote "Exclude from QCR" | Reason* | **Exclude quote** (danger) → `api.decideQuote(...,"excluded", reason)` | |
| `PlEarlyReleaseModal` (19231) | QCR "Create QCR with n quote(s)" | reason* from `PL_EARLY_RELEASE_REASONS = ["RM has requested","Client wants it fast"]` | **Create draft QCR** / **Create QCR from this quote** → `api.startDraftQcr(id, reason)` | shows `c.urgentReason` red callout if any |
| `PlQcrUploadModal` (19270) | QCR "Upload QCR"/"Upload V{n}" | file (any type), early reason (if threshold not met) | **Upload** → `api.uploadQcr(id, file, reason|null)` | |
| `PlSendQcrModal` (19305), wide | QCR "Send to RM/BimaSetu" | covering note (manual only) | **Send to RM / Send to BimaSetu** → `api.releaseQcr(id, note)` | lists quote rows, QCR file; purple lock callout "QCR Vn locks on send…" |
| `PlQcrReportModal` (19166), xl | QCR document "Open" | — | Close | term × insurer table from `copycat.result.products[case product]` |
| `PlOutcomeModal` (19422) | Decision menu / revision / "Close: No appetite" | `kind`: `quote_selected` (pick row from released QCR + note) · `lost` (reason*) · `no_appetite` (reason*) · `rfq_v2` ("What changed"* + fresh source of every type V1 had: Excel and/or link) | `logClientDecision` / `closeNoAppetite` / `newRfqVersion(id, note, source)` | CTA tones: success / danger / primary |
| `PlRequestMandateModal` (16058) | Mandate card | Preferred insurer (opt; ordered usable → on panel → active), Reason* (`PL_MANDATE_REQUEST_REASONS`), Message* (auto template that tracks insurer) | **Send request** → `api.requestMandate(id,{preferredInsurerId, reason, message})` | subtitle "PLC · mail to RM"; blue info callout |
| `PlMandateReminderModal` (16132) | Mandate card | reminder message | **Send reminder** → `api.remindMandate(id, note)` | |
| `PlWithdrawMandateModal` (16147) | Mandate card | optional note | **Withdraw** (danger) → `api.withdrawMandateRequest(id, note)` | |
| `PlInsurerEditDrawer` (16759), right sheet 560px | Master "Edit" | Insurer name, Sectors written, Underwriter note, Insurer status pills (Active/Inactive/Do Not Float — "applies to every branch"), Appetite grid (all 20 codes, checkbox cards), Branch name ("blank means the insurer as a whole"), Branch status (Active/Inactive), POCs per group (comma-separated) | **Save changes** → `api.saveInsurerMaster` | header "Insurer Master · edit" + entity label |
| `PlFloatSimModal` (14363) *sim* | Queue sim block | — | per preset **Send float** → `api.receiveFloat(preset)`, or **Open PLC-x** | shows rejected floats |
| `PlBsRoundModal` (16235) *sim* | Rail BimaSetu sim | revision: who objected (Us/The client), reason, asks (`PL_REVISION_ASKS` ticks); confirm: pick row; lost: reason | `bsRevision` / `bsClientConfirmation` / `bsLineLost` | in production these are inbound webhooks |
| `PlBsAnswerModal` (16301) *sim* | Rail BimaSetu sim | answer text | `bsQueryAnswer` / `bsThreadAnswer` | inbound webhook in prod |
| `PlSearchModal` (19849) | Sidebar | see §2.5 | | own shell (not PlModal) |

Shared `ModalShell` (L2603, Endorse) is the canonical chrome reference (icon+title 18/600 brand, sub 13/500, 28×28 close r8, body max-h 68vh, sunk footer).

---

## 5. Reusable component library (Pl* primitives → proposed TS components)

| Prototype | Props (exact) | Variants / states | Proposed TS component |
|---|---|---|---|
| `PlChip` | `tone='neutral', children, dot=false, mono=false, size='sm'\|'xs', dashed=false, leading=null` | 7 tones; dot 6px; dashed border (paused/sim); xs 10.5 / sm 11.5 | `<Chip tone size dot dashed leading tabular>` |
| `Indicator` (shared) | `label, ind, outline, big, thick, status, size=14, leading` | fill vs tint(`status`) vs outline; 3 sizes | `<StatusPill ind variant="fill\|tint\|outline" size="sm\|lg\|thick">` |
| `PlAvatar` | `src, name, size=22, tone, icon` | photo / serif-italic initial on tone soft / icon-in-tone circle | `<Avatar src name size tone icon>` |
| `PlAvatarStack` | `participants:[{src,name,tone,role}], size` | −6px overlap, hover raises + portal tooltip "name · role" | `<AvatarStack>` |
| `PlBtn` | `variant='default'\|'primary'\|'ghost'\|'danger'\|'success', size='sm'\|'md'\|'lg', onClick, disabled, children, icon, iconRight, full, title` | sm `px-2.5 py-1` 12; md `px-3 py-1.5` 12.5; lg `px-4 py-2`; r8; disabled = sunk/ink3/border | `<Button variant size icon iconPosition fullWidth>` (also shared "chrome" Button: fill brand r12 `12/20` 14/600; small r10 `10/14` 12/600 — used for Create Ticket) |
| `PlIconBtn` | `icon, onClick, title, size=28` | | `<IconButton>` |
| `PlCard` | `children, pad=true, className, style, alt=false` | white / cardAlt; r12, 1px border, p-4 | `<Card padded variant="default\|alt">` |
| `PlSection` | `icon, title, badge, children` | header strip + body | `<SectionCard>` |
| `PlLabel` | `children, className, size='xs'\|'sm'\|'md'` | 11/12/12.5 600 ink3 | `<FieldLabel>` |
| `PlCallout` | `tone, children, className, style, pad='sm'\|'md'\|'lg'` | | `<Callout tone>` |
| `PlKV` | `k, v, mono, img, avatar, avatarName, pill` | label + value; leading logo or avatar; pill → purple chip | `<KeyValue>` |
| `PlMono` | `children, size=12, color, weight=500` | tabular numbers | `<Num>` |
| `PlDivider` | `vertical` | (unused) | `<Divider>` |
| `PlTabHeader` | `title, meta` | 20/600 + right meta | `<TabHeader>` |
| `PlSubTabs` | `items:[{id,label,dot}], value, onChange` | pill tabs; red dot | `<SegmentedTabs>` |
| `TabBar` (shared) | `tabs:[[key,label,off,dot]], tab, setTab` | active tint + 2px underline; disabled; dot | `<Tabs>` |
| `ThreadTab` (shared) | `label, title, on, onClick` | small pill filter | `<FilterPill size="sm">` |
| Pill filter (inline in Queue/Inbox/Manual, `StagePills`) | | 16/500 r-full + dot + count | `<FilterPills options counts>` |
| `HeaderFilter` (shared) | `id,label,options,selected:Set,setSelected,openKey,setOpenKey,right` | multi-select column filter | `<ColumnFilter>` |
| `MenuCard` / `MenuOpt` (shared) | `right, wide, up` / `label,on,onClick` | portal, auto-flip, r16; option 16/500 with tick circle | `<Menu>` / `<MenuOption>` |
| `SortControl` (inline in queue) | | brand underline select | `<SortSelect>` |
| `PlSearchField` | `value,onChange,placeholder,size='sm'\|'md'\|'lg',width,autoFocus,onClear` | | `<SearchInput>` |
| `PlInput` | `value,onChange,placeholder,mono,kind='text'\|'money'\|'percent'\|'hours',type` | money: ₹ prefix, right-aligned, en-IN grouping on blur | `<TextInput>` + `<MoneyInput>` |
| `PlTextArea` | `value,onChange,placeholder,rows=3` | | `<TextArea>` |
| `PlSelect` | (unused) | | — |
| `PlMenuPicker` | `value,options,placeholder,onChange,width,disabled,right` | single-select menu | `<Select>` |
| `PlMultiPicker` | same, value array | (unused) | `<MultiSelect>` |
| `PlPickerRow`/`PlPickerChip`/`PlOptionCard` | `selected,onClick,label,sub,tone,disabled` | (unused; intended consolidation) | `<OptionRow>`, `<ToggleChip>`, `<OptionCard>` |
| `PlTick` | `checked,onChange,label,sub` | 15px box purple | `<Checkbox>` |
| `PlEmpty` / `Empty` | `icon,title,body,action` | | `<EmptyState>` |
| `PlModal` | `title,subtitle,children,onClose,footer,wide,size='xl'` | 560/860/1000 | `<Modal size="md\|lg\|xl">` |
| `PlInsurerEditDrawer` shell | | right sheet 560 | `<Drawer side="right">` |
| `PlRfqUploadField` / `PlQcrUploadField` (wrap `UploadField`) | `label,file,setFile,say` | default/success/error/disabled; drag-drop; r24 dashed zone min-h 168 | `<FileDropzone accept>` |
| `PlSlaChip` | `hours,paused,pauseReason,stopped` | (unused) held/over/left/stopped | fold into `<SlaChip>` |
| `PlStageDue` | `sla` | Closed / On hold / over (semError) / ≤60m (semCaution) / left | `<SlaCountdown>` |
| `PlSlaCell` | `sla, wide` | Stopped / "Awaiting insurer/RM" + target / over / left | `<SlaCell>` |
| `PlTicketStageTimeline` | `c` | ok/atRisk/breached/noClock/stopped | `<StageTimelineCard sla owner>` |
| `PlPhaseBar` | `c` | 6 segments | `<PhaseBar phases current behind>` |
| `PlStageRail` | `stage,outcome` | (unused) 6-pill rail `PL_RAIL` | — |
| `PlUsableMeter` | `count,target=3,compact` | pips + n/3 | `<UsableMeter>` |
| `PlActorMark` | `actor: 'Insurer'\|'BimaKavach'\|'RM'\|'system'` | | `<ActorMark>` |
| `PlBar` | `label,n,max,tone` | | `<HBar>` |
| `PlFold` / `PlSlot` | | (Fold unused) | `<Collapsible>` |
| `PlDocViewer` | `children,pad,minHeight,maxWidth=780` | sunk frame + page | `<DocumentFrame>` |
| `PlRfqSheetGrid` | `sections` | Excel-look grid + sheet tabs | `<SheetPreview>` |
| `PlRfqSourceCard`, `PlRfqSummaryCard`/`Accordion`, `PlRiskTierCard` | `c, rfq` | | RFQ feature components |
| `PlQcrDocument`, `PlQcrRowsCard`, `PlClientDecisionMenu` | | | QCR feature components |
| `PlMandateCard`, `PlMandateDetails`, `PlMandateHover`, `PlMandateRequestHover` | `c, api` | none/requested/considering/declined/signed | Mandate feature components |
| `DeskCard`, `ProgressCard`, `Donut`, `RangePills`, `ScopeSwitch`, `Greeting`, `PageHead`, `Breadcrumb`, `TicketPager`, `Sidebar`, `Tip`/`MetaHover`/`InfoTip` (shared) | | | Shell/dashboard components |
| `PlSimBlock` / `PlSimBtn` | | amber dashed | **dev-only** `<DevSimPanel>` behind a feature flag |

Recommended React folder split: `ui/` (Button, Chip, StatusPill, Card, Callout, Input, MoneyInput, Select, Checkbox, Modal, Drawer, Menu, Tabs, SegmentedTabs, Avatar, AvatarStack, EmptyState, Tooltip, FileDropzone), `shell/` (AppShell, Sidebar, Breadcrumb, PageHead, Greeting, ScopeSwitch, SearchModal, Toast), `placement/` features (queue, workspace/{overview,rfq,docs,contact,quotes,qcr,mail,audit}, mandate, master, reports, manual-review).

---

## 6. Domain / data model (as implied)

### 6.1 Enumerations (exact strings)

```ts
export type StageKey = 'rfq_review' | 'awaiting_rm' | 'insurer_selection' | 'market' | 'quote_review'
  | 'qcr_draft' | 'qcr_released' | 'revision_requested' | 'closed';

export const PL_STAGE = {
  rfq_review:         { label: 'RFQ Review',          step: 0, tone: 'orange' },
  awaiting_rm:        { label: 'RFQ Clarification',   step: 0, tone: 'orange' },
  insurer_selection:  { label: 'Insurer Selection',   step: 1, tone: 'purple' },
  market:             { label: 'Quote Collection',    step: 2, tone: 'blue'   },
  quote_review:       { label: 'Quote Review',        step: 3, tone: 'amber'  },
  qcr_draft:          { label: 'QCR Ready',           step: 4, tone: 'purple' },
  qcr_released:       { label: 'QCR Released',        step: 5, tone: 'green'  },
  revision_requested: { label: 'Revision Requested',  step: 5, tone: 'orange' },
  closed:             { label: 'Closed',              step: 6, tone: 'neutral'},
} as const;

export type OutcomeType = 'quote_selected' | 'lost' | 'no_appetite';
export const PL_OUTCOME = {
  quote_selected: { label: 'Quote selected', tone: 'green' },
  lost:           { label: 'Lost',           tone: 'red'   },
  no_appetite:    { label: 'No appetite',    tone: 'red'   },
};

export type ThreadStatus = 'rfq_sent' | 'acknowledged' | 'insurer_clarification' | 'awaiting_rm'
  | 'quote_received' | 'quote_usable' | 'quote_clarification' | 'quote_excluded' | 'declined' | 'no_response';
export const PL_TSTAT = {
  rfq_sent:              { label: 'Awaiting Insurer Response', tone: 'neutral' },
  acknowledged:          { label: 'Awaiting Insurer Response', tone: 'blue',   sub: 'acknowledged' },
  insurer_clarification: { label: 'Clarification Required',    tone: 'orange' },
  awaiting_rm:           { label: 'Awaiting RM Information',   tone: 'orange' },
  quote_received:        { label: 'Quote Received',            tone: 'purple' },
  quote_usable:          { label: 'Quote Usable',              tone: 'green'  },
  quote_clarification:   { label: 'Quote Received',            tone: 'orange', sub: 'needs clarification' },
  quote_excluded:        { label: 'Quote Received',            tone: 'neutral', sub: 'excluded' },
  declined:              { label: 'Declined',                  tone: 'red'    },
  no_response:           { label: 'Awaiting Insurer Response', tone: 'red',    sub: 'SLA breached' },
};
// NOTE: 'no_response' is only ever seeded; no api method sets it (the sweep only adds follow-ups).

export type QuoteDecision = 'usable' | 'clarification' | 'excluded' | 'superseded' | null;
export const PL_DECISION_CHIP = {
  usable:        { tone: 'green',   label: 'Usable' },
  clarification: { tone: 'orange',  label: 'Needs clarification' },
  excluded:      { tone: 'neutral', label: 'Excluded from QCR' },
  superseded:    { tone: 'neutral', label: 'Superseded' },
};

export type RfqStatus = 'in_review' | 'validated' | 'floated' | 'superseded';
export type QcrStatus = 'draft' | 'released' | 'superseded';
export type QcrSource = 'copycat' | 'manual' | 'single_quote';     // labels: Copycat / Manual / Single quote
export type CopycatStatus = 'queued' | 'generating' | 'ready' | 'failed';
export type Channel = 'bimasetu' | 'manual';
export type BusinessType = 'New' | 'Renewal' | 'Rollover';          // meaning: New policy / Our renewal / Other Co. renewal
export type Urgency = 'High' | 'Medium' | 'Low';
export type RiskTier = '' | 'Preferred' | 'Non-preferred';
export type ProductGroup = 'EB' | 'Liability' | 'P&C';
export type Lob = 'EB' | 'Liability' | 'Property' | 'CAR-EAR' | 'Marine';
export type InsurerStatus = 'Active' | 'Inactive' | 'Do Not Float';
export type BranchStatus = 'Active' | 'Inactive';
export type LockReason = InsurerStatus | 'Branch inactive' | 'No POC' | 'Incumbent – mandate needed';
export type MandateType = 'Exclusive Placement Mandate' | 'Incumbent Approach Mandate';
export type MandateRequestStatus = 'requested' | 'considering' | 'signed' | 'declined' | 'withdrawn';
export type MandateState = 'none' | 'requested' | 'considering' | 'declined' | 'signed';
export type ActorType = 'PM' | 'RM' | 'Insurer' | 'System';
export type RevisionAsk = 'rerate' | 'insurer' | 'cover' | 'terms';
// PL_REVISION_ASKS = { rerate: 'Re-rate', insurer: 'A different insurer', cover: 'Changed sum insured or cover', terms: 'Revised terms' }
export type BsInType = 'float' | 'query_answer' | 'revision_request' | 'client_confirmation' | 'line_lost';
export type BsOutType = 'ticket_created' | 'stage_changed' | 'query_raised' | 'qcr_round' | 'closed_no_appetite';
export type SlaId = 'SLA-02'|'SLA-03'|'SLA-04'|'SLA-05'|'SLA-06'|'SLA-09'|'SLA-10'|'SLA-11'|'SLA-12'|'SLA-13'|'SLA-14'|'SLA-17';
export type PlRole = 'Placement Executive' | 'Placement Head';
```

Layered case status `plCaseStatus(c)` → `{ internal, portal }` (L12055) — internal is the header pill label; portal is the RM-facing status:

| Condition | internal | portal |
|---|---|---|
| closed + quote_selected | Quote selected | Quote selected |
| closed + lost | Lost | Closed |
| closed + no_appetite | No appetite | Closed |
| rfq_review | Ready for Placement | Placement In Progress |
| awaiting_rm | RFQ Clarification Required | Action Required |
| insurer_selection, panel unlocked | Insurer Selection Pending | Placement In Progress |
| insurer_selection, panel locked | Insurers Approved | Placement In Progress |
| market/quote_review + any thread awaiting_rm | Awaiting RM Information | Action Required |
| market/quote_review + undecided quote | Quote Review Required | Placement In Progress |
| market/quote_review else | Quote Collection In Progress | Placement In Progress |
| qcr_draft ready or file-based | Pending Placement Release | Placement In Progress |
| qcr_draft failed | QCR Generation Failed | Placement In Progress |
| qcr_draft else | QCR Generation In Progress | Placement In Progress |
| qcr_released | QCR Released | QCR Ready |
| revision_requested | Revision Requested | Placement In Progress |

For BimaSetu tickets, every change of `internal` emits `→ BimaSetu: stage_changed {stage: internal}`.

### 6.2 Interfaces

```ts
type Stamp = string;      // prototype uses "25 Aug, 09:40" display strings — use ISO timestamptz in the rebuild
type Ms = number;         // engine epoch ms (anchors)

interface PlacementCase {
  id: string;                         // "PLC-1024"; next = max numeric + 1 (start 1001)
  stage: StageKey;
  outcome: Outcome | null;
  channel: Channel;                   // same value as createdVia
  createdVia: Channel;
  createdBy: string | null;           // PM name (manual) or RM name (float)
  owner?: 'bhupendra' | 'himani';     // explicit owner; else derived (plExecOf)
  headEscalated?: boolean;            // set by SLA-P1 sweep → owner becomes Head
  insurerPick?: 'master';
  float?: FloatPayload | null;        // BimaSetu float that created it (lineRef is idempotency key)
  bimasetu: BimaSetuMessage[];
  client: {
    name: string; industryType: string; industry: string; city: string;
    headcount: number | null; turnover: string; spoc: string; rm: string;  // rm = 'Shubh Bangar'
  };
  products: [string];                 // exactly one product type code (single-product invariant)
  receivedAt: Stamp;
  renewal: string;                    // "01 Oct 2026" or ""
  activeRfq: number;                  // 1-based
  rfqs: RfqVersion[];
  panel: { locked: boolean; selected: string[] /*insurerIds*/; excluded: { id: string; reason: string }[] };
  branchPicks?: Record<string /*insurerId*/, string[] /*branch names*/>;
  threads: InsurerThread[];
  threadSeq: number;                  // monotonic high-water mark for TH-nn ids (never reset)
  quotes: Quote[];
  qcrs: Qcr[];
  followUpsStopped: boolean;
  round: number;                      // QCR round, starts 1
  revisions: Revision[];
  pendingRm?: string[];               // query ids carried by the latest RM ask
  meta: CaseMeta;
  mandateRequests: MandateRequest[];
  sla: CaseSla;
  slaP1?: { armedAt: Ms; remindersFired: Ms[]; escalatedAt: Ms | null } | null;
  audit: AuditEntry[];
  tasks: Task[];                      // ⚠ not rendered anywhere; two shapes in code
  // seed-only / dead: priority ('Standard'|'Urgent'), recommend[], notRecommended[], demo, urgentReason, demoQuotes
  urgentReason?: string;              // shown in early-release modal if present
}

interface CaseMeta {
  caseType: BusinessType;
  urgency: Urgency;
  targetPremium: number | null;       // integer INR, normalised by plNormTargetPremium
  mandate: Mandate | null;
  incumbent: string | null;           // insurer id or legacy free-text name
  slaLeftMins?: number | null;        // seed hint only
  riskTier: RiskTier;
}

interface Mandate {
  type: MandateType;
  ref: string;                        // "MND-1026-E" | "MND-1028-A"
  note: string;
  by?: string; byAvatar?: string | null;
  preferredInsurerId?: string | null;
  at?: Stamp;
  source?: 'BimaSetu';
  requestId?: string; requestedBy?: string; requestedAt?: Stamp;
}

interface MandateRequest {
  id: string;                         // "MR-01" per case
  type: 'Exclusive Placement Mandate';
  status: MandateRequestStatus;
  requestedBy: string; requestedByKey: 'bhupendra' | 'himani'; requestedAt: Stamp;
  to: string;                         // RM name
  preferredInsurerId: string | null;
  reason: string; message: string;
  reminders: { at: Stamp; by: string }[];
  responses: { at: Stamp; actor: string; kind: 'considering' | 'signed' | 'declined'; note: string }[];
  closedAt: Stamp | null;
}

interface RfqVersion {
  v: number;
  status: RfqStatus;
  createdAt: Stamp; validatedAt?: Stamp | null; floatedAt?: Stamp | null;
  source: { file?: RfqFile; link?: { url: string; at: Stamp; by?: string } };
  sections: { product: string; si: string; detail: [string, string][] }[];  // only for linked RFQ preview
  missing: RfqQuery[];                // "queries to the RM"
  rmThread: { at: Stamp; actor: string; text: string; items?: string[]; gaps?: string[] }[];
  classification: { rmEntered: string; suggested: string; flagged: boolean; confirmed: string | null; basis: string[]; impact: string }; // UI suppressed
  changeNote?: string;                // for V2+
  rmNote?: string;
}
interface RfqFile { name: string; size: string | null; by?: string; at: Stamp; blob?: unknown }
interface RfqQuery {
  id: string;                         // "g-PLC-1041-1-1" or seed "m1"
  label: string; note: string; material: boolean;
  resolved: boolean; resolvedAt?: Stamp; resolvedBy?: string;
  answer?: string; answeredAt?: Stamp; answeredBy?: string;   // BimaSetu answers
}

interface InsurerThread {
  id: string;                         // "TH-01"
  rfqV: number;
  insurerId: string; branch: string;  // "" = insurer as a whole
  pocs: string[];                     // every POC for the product group, all in To
  status: ThreadStatus;
  slaH: number;                       // legacy/static display hours ⚠
  floatedAt: Ms; targetMins: number; heldMins: number; pausedSince: Ms | null;
  paused: boolean; pauseReason?: string | null;
  followUps: number;                  // 0..3
  followUpsActive: boolean;
  declineReason?: string;
  events: ThreadEvent[];
  clarifications: Clarification[];
}
interface ThreadEvent { at: Stamp; actor: string /* 'System' | 'Insurer' | person */; text: string }
interface Clarification {
  id: string; question: string; askedAt: Stamp;
  rmRequested: boolean; rmRequestedAt?: Stamp;
  rmResponse: string | null; rmRespondedAt?: Stamp;
  repliedAt: Stamp | null;
}

interface Quote {
  id: string;                         // "Q-101" (global counter)
  insurerId: string; threadId: string;
  product: string; rfqV: number;
  version: number;                    // per thread+product+rfqV
  receivedAt: Stamp;
  doc: string;                        // "{InsurerFirstWord}_{product}_Quote_v{n}.pdf"
  decision: QuoteDecision; decisionAt: Stamp | null; decisionNote: string;
  openItems: string[];
  supersedes?: number;
  fields: QuoteField[];               // mock "Copycat" terms; only premium is PM-editable
}
interface QuoteField {
  key: string; label: string;
  extracted: string | number; value: string | number | null;
  confidence: 'high' | 'low'; required: boolean; material: boolean;
  correctedBy: string | null; correctedAt?: Stamp; page: string | null;
  kind: 'text' | 'money';
}

interface Qcr {
  v: number;                          // per case, across RFQ versions
  status: QcrStatus;
  source: QcrSource;
  rfqV: number;
  round: number;
  createdAt: Stamp;
  quoteIds: string[];
  rows: QcrRow[]; rowsChecked: boolean;
  earlyRelease: { reason: string; count: number } | null;
  file?: { name: string; size?: number | null; blob?: unknown; uploadedBy: string; uploadedAt: Stamp };  // manual / single_quote
  copycat?: {
    status: CopycatStatus; requestId: string /* CC-{caseId}-V{v}-{attempt} */; attempt: number;
    queuedAt: Stamp; startedAt?: Stamp; generatedAt?: Stamp; error?: string;
    documents: { quoteId: string; insurerId: string; insurer: string; contact: string; product: string; version: number; fileName: string }[];
    result?: CopycatResult;
  };
  releasedAt?: Stamp; releasedBy?: string; sentTo?: string /* 'BimaSetu' | 'Shubh Bangar (RM)' */; coverNote?: string;
  objection?: { by: 'client' | 'us'; reason: string; asks: RevisionAsk[]; at: Stamp };
  notes: Record<string, unknown>;
}
interface QcrRow { quoteId: string; insurerId: string; insurer: string; premium: number | ''; sumInsured: string; validity: string; terms: string }
interface CopycatResult {
  qcrId: string;                      // "CC-QCR-{caseId}-V{v}"
  generatedAt: Stamp;
  file: { name: string };             // "QCR_{caseId}_V{v}.pdf"
  products: { product: string;
    columns: { quoteId: string; insurerId: string; insurer: string; contact: string; version: number; receivedAt: Stamp; fileName: string }[];
    rows: { term: string; values: (string | null)[] }[] }[];
  quoteRows?: QcrRow[];
}

interface Revision { round: number; by: 'client' | 'us'; reason: string; asks: RevisionAsk[]; at: Stamp; handled: boolean; handledBy?: string }

interface Outcome {
  type: OutcomeType; reason: string; at: Stamp; by: string;
  insurerId?: string; quoteId?: string; premium?: number | ''; qcrV?: number;
}

interface CaseSla { id: SlaId | null; ownerType: 'internal' | 'external' | null; anchorAt: Ms | null; targetMins: number | null }

interface AuditEntry { at: Stamp; actor: string; actorType: ActorType; event: string; detail: string }

interface BimaSetuMessage { id: string /* BS-n */; dir: 'in' | 'out'; type: BsInType | BsOutType; payload: Record<string, unknown>; at: Stamp }

interface FloatPayload {
  id?: string; lineRef: string;       // "BS-LINE-201"
  product: string; businessName: string; businessType: BusinessType; industryType: string;
  rfq: { link: string | null; file: string | null } | null;
  exclusiveMandate: boolean; targetPremium: number | null; note: string; incumbent?: string; rm: string;
}

interface Task { id: string; label: string; due: string; owner: string; done: boolean } // manual-create writes {text, by, at} ⚠
```

Payloads of BimaSetu messages (from api):
- `in:float` → FloatPayload; `out:ticket_created {ticketId}`; `out:query_raised {queryId|threadId, query, note}`; `in:query_answer {queryId|threadId, answer, simKey}`; `out:qcr_round {qcrV, round, file, requestedAt, deliveredAt, earlyReason, rows:[{insurer,premium,sumInsured,validity,terms}], notice?}`; `in:revision_request {by, reason, asks, simKey}`; `in:client_confirmation {simKey, qcrV, round, insurer, premium, row}`; `in:line_lost {reason, simKey}`; `out:closed_no_appetite {reason}`; `out:stage_changed {stage}`. Each also writes audit `actor "BimaSetu", actorType "System", event "← BimaSetu: {type}" | "→ BimaSetu: {type}", detail plBsSummary(...)`. Idempotency: inbound with a `simKey` already seen is a no-op (→ in prod use message ids).

### 6.3 Workflow rows (Overview) `PL_WORKFLOW_ROWS` (L11829)

| key | label | step | actor | target |
|---|---|---|---|---|
| created | Ticket created | -1 | system (BimaKavach for manual) | 5 Min |
| rfq | RFQ under verification | 0 | BimaKavach | SLA-02 → 1 BH |
| insurers | Insurers selected | 1 | BimaKavach | SLA-04 → 2 BH |
| market | RFQ sent to insurers | 2 | Insurer | SLA-06 → 2 WD (1080/540) |
| quotes | Quotes reviewed | 3 | BimaKavach | SLA-10 → 2 BH |
| qcr | QCR released to RM | 4 | BimaKavach | SLA-12 → 2 BH |
| decision | RM decision | 5 | RM | SLA-14 → 3 WD |
| closed | Ticket closed | 6 | system | 15 Min |

`plWorkflowTarget`: <60 → Min; <540 → BH (mins/60); else WD (mins/540).

### 6.4 Masters

**Users / execs** (`PL_EXECS`, `PORTAL_USERS`): `bhupendra {name "Bhupendra Singh", initials "BS", avatar /bhupendra.webp, role "Placement Executive"}`, `himani {name "Himani Doshi", initials "HD", avatar /himani.webp, role "Placement Head"}`. RM avatars `PL_RM_AVATARS`: "Shubh Bangar"/"Shubh Agarwal" → Shubh. `PL_CONFIG.universalRm = "Shubh Bangar"`.

**Insurers** `PL_INSURERS` (16; id → `{name, status, appetite: ProductCode[], sectors, note}`): `icici` ICICI Lombard · `hdfc` HDFC ERGO · `bajaj` Bajaj Allianz · `tata` Tata AIG · `nia` New India Assurance · `digit` Go Digit · `sbi` SBI General · `chola` Cholamandalam MS · `reliance` Reliance General · `liberty` Liberty General · `care` Care Health · `star` Star Health · `sompo` Universal Sompo · `oriental` Oriental Insurance (**status "Do Not Float"**) · `united` United India Insurance. All others `Active`. Appetite lists are mock translations.

**Insurer branches** `PL_INSURER_BRANCHES` (L10085): id → `[{branch, status:'Active', pocs: {EB:[], Liability:[], 'P&C':[]}, cc: []}]`. Most insurers one branch (e.g. icici "Mumbai - Corporate" POCs Rahul Sharma, Neha Kulkarni, Anand Iyer); `nia`, `oriental`, `united` have 4 branches. POCs populated only for groups the insurer has appetite in. Mock names.

**Product types** `PL_PRODUCT_TYPES` (20) `{code, group, short, label, template, aliases, eligibility?, fieldset}`:
| code | group | short | label | RFQ template | fieldset | LOB |
|---|---|---|---|---|---|---|
| GMC | EB | GMC | Group Medical Cover (GMC) | EB RFQ – GMC block | GMC | EB |
| GPA | EB | GPA | Group Personal Accident (GPA) | EB RFQ – GPA block | GPA | EB |
| GTL | EB | GTL | Group Term Life (GTL) | EB RFQ – GTL block | GTL | EB |
| CGL | Liability | CGL | Commercial General Liability (CGL) | CGL + Common Questions | LIABILITY | Liability |
| DNO | Liability | D&O | Directors & Officers (D&O) | D&O + Common Questions | DNO | Liability |
| PI_ENGG | Liability | PI Engg | Professional Indemnity – Engineering | PI Engg + Common Questions | LIABILITY | Liability |
| PI_TECH | Liability | PI Tech | Professional Indemnity – Tech & Others | PI Tech & Rest + Common Questions | LIABILITY | Liability |
| CRIME | Liability | Crime | Crime | Crime + Common Questions | LIABILITY | Liability (Crime row) |
| PL_ACT | Liability | PL Act | Public Liability (Act) | Public Liability – ACT Policy tab | LIABILITY | Liability |
| PL_GEN | Liability | PL Gen | Public Liability | Fire RFQ Main (Public Liability section) | LIABILITY | Property ⚠ |
| WC | Liability | WC | Employee Compensation (WC) | WC Policy RFQ | WC | Marine ⚠ |
| FIRE_FACTORY | P&C | Fire Factory | Fire – Factory / Plant | Fire RFQ Main | PROPERTY | Property |
| FIRE_GODOWN | P&C | Fire Godown | Fire – Warehouse / Godown | Fire RFQ Open Godown | PROPERTY | Property |
| IAR | P&C | IAR | Industrial All Risk (IAR) | IAR RFQ | PROPERTY | Property |
| BURGLARY | P&C | Burglary | Burglary | Burglary RFQ | PROPERTY | Property |
| MBD_EEP | P&C | MBD & EEP | Machinery Breakdown (MBD) & EEP | MBD & EEP RFQ | PROPERTY | Property |
| CAR | P&C | CAR | Contractor All Risk (CAR) | CAR RFQ | PROPERTY | CAR-EAR |
| EAR | P&C | EAR | Erection All Risk (EAR) | EAR RFQ | PROPERTY | CAR-EAR |
| BGR | P&C | BGR | Bharat Griha Raksha (BGR) | BGR RFQ | PROPERTY | Property |
| MARINE_OPEN | P&C | Marine Open | Marine Open | Marine Open RFQ | MARINE | Marine |
| MARINE_STOP | P&C | Marine STOP | Marine STOP | Marine STOP RFQ | MARINE | Marine |
⚠ `PL_PRODUCT_LOB` maps WC → "Marine" (business matrix comment: "WC and a single Marine risk collect same-day") and PL_GEN → Property; confirm with business. Aliases (for email matching) listed in L10129–10151.

**Quote fieldsets** `PL_FIELDSETS` (mock Copycat terms): GMC (premium, si "Sum insured per family", family, roomRent, maternity, ped, buffer, copay, validity, exclusions); GPA (premium, si, scope, ttd, medEx, validity); GTL (premium, si, cover, fcl, validity); LIABILITY (premium, si "Limit of indemnity (AOY)", retention, extensions, territory, validity); MARINE (premium, si "Per-sending limit", clause, excess, validity); PROPERTY (premium, si "Total sum insured", basis, excess, addons, validity); DNO (premium, si, retention, basis, extensions, territory, validity, exclusions); WC (premium, wageRoll, headcount, scope, occupational, validity). Premium label "Annual premium (incl. GST)" (Marine: "Estimated annual premium (incl. GST)").

**Business types** `PL_BUSINESS_TYPES`: New/"New policy", Renewal/"Our renewal", Rollover/"Other Co. renewal".
**Industry types** `PL_INDUSTRY_TYPES` (11): Manufacturing; Warehousing & Logistics; Retail / Shops; Services (office-based); Construction & Contracting; Engineering Services; Technology; Power & Energy; Trading (Domestic / Import / Export); Residential / Individual; Others.
**Mandate reasons** `PL_MANDATE_REQUEST_REASONS`: "Client relies on our market view", "Several comparable quotes - client wants us to choose", "Tight renewal timeline", "Client has asked us to handle placement end to end", "Other". **Decline reasons** `PL_MANDATE_DECLINE_REASONS`: "Client wants to see all options and decide", "Client prefers to decide with the insurer directly", "Client's group policy requires its own approval", "Other".
**Early release reasons**: "RM has requested", "Client wants it fast".
**Manual review classes**: "Quote Received", "Clarification Required", "Declined", "Not Applicable".
**Config** `PL_CONFIG`: `universalRm`, `rfqUpload.accept [.xlsx,.xls,.csv]` (no size limit), `qcrUpload.accept null` (any), `copycat {mode:"mock"|"live", endpoint, headers, timeoutMs 60000, mockDelayMs 2500}`.
**Holidays** (`BIZ.holidays`, Keka 2026): 2026-01-01, 01-14, 01-26, 03-04, 03-31, 05-28, 09-14, 10-02, 10-20, 11-09, 12-25; days Mon–Fri; 10:00–19:00.

**SLA master** `PL_SLA_MASTER` (source "Placement_SLA_master.xlsx"):
| id | short | touchpoint | owner | target text | mins | external |
|---|---|---|---|---|---|---|
| SLA-02 | RFQ Review | RFQ review + completeness + risk tier | Placement Manager | 1 business hour | 60 | |
| SLA-03 | RM Clarification | RM / customer clarification | RM | 1 business day | 540 | ✓ |
| SLA-04 | Insurer Selection | Insurer selection | Placement Manager | 2 business hours | 120 | |
| SLA-05 | Send to Insurers | Send RFQ to selected insurers | System / PM | Within 30 minutes | 30 | |
| SLA-06 | Quote Collection | Insurer quote collection | Insurers / Placement | LOB x risk tier x business type matrix | 1080 | ✓ |
| SLA-09 | Insurer Escalation | Insurer escalation | System / PM | After 3 business days | 1620 | ✓ |
| SLA-10 | Quote Review | Quote review + PM validation | System + PM | 2 business hours per quote | 120 | |
| SLA-11 | QCR Generation | QCR generation | System | Within 15 minutes | 15 | |
| SLA-12 | QCR Release | PM QCR review and release | Placement Manager | 2 business hours | 120 | |
| SLA-13 | RM sends to Client | RM sends QCR to client | RM | 4 business hours | 240 | ✓ |
| SLA-14 | Client Decision | Client decision | RM / Client | 3 business days target | 1620 | ✓ |
| SLA-17 | RFQ V2 Re-float | Requirement change / RFQ V2 re-float | RM + Placement | 4 business hours | 240 | |
(SLA-01, 07, 08, 15, 16, 18 absent; SLA-09 and SLA-13 are never selected by `plSlaIdOf`.)

**Quote collection target matrix** `PL_QUOTE_TARGET_MATRIX` (business days, × 540):
| LOB | preferred | nonPreferred | renewal |
|---|---|---|---|
| Property | 2 | 3 | 2 |
| Marine | 1 | 3 | 2 |
| CAR-EAR | 2 | 3 | 2 |
| EB | 3 | 7 | 2 |
| Liability | 2 | 3 | 2 |
| Liability:Crime | 2 | 5 | 4 |

**Follow-up ladder** `PL_FOLLOWUP_LADDER`: `{n:1, after:"1 business day", label:"Follow-up 1"}`, `{n:2, "2 business days", "Follow-up 2"}`, `{n:3, "3 business days", "Escalation"}`.

**Constants**: `PL_THRESHOLD = 3`, `PL_THREAD_TARGET_H = 18`, `PL_DUE_SOON_MINS = 480`, `PL_BIZ_DAY_MINS = 540`.

### 6.5 Suggested Postgres tables
`users`, `insurers`, `insurer_branches`, `branch_pocs(branch_id, product_group, name, email)`, `product_types`, `industry_types`, `sla_master`, `quote_target_matrix`, `holidays`, `cases`, `case_meta` (or columns), `rfq_versions`, `rfq_queries`, `rfq_rm_messages`, `insurer_threads`, `thread_events`, `thread_clarifications`, `quotes`, `quote_fields`, `qcrs`, `qcr_rows`, `copycat_jobs`, `revisions`, `mandates`, `mandate_requests`, `mandate_request_events`, `outcomes`, `case_sla` (current) + `sla_events` (history: reminders, escalations), `audit_entries`, `bimasetu_messages`, `inbound_mails` (manual review), `master_audit`, `documents` (file storage refs). Use real timestamps everywhere (the prototype's "25 Aug, 09:40" strings and the year-guessing `plParseReceived` must go).

---

## 7. `makePlacementApi` methods → backend API surface

Infrastructure (L12731): `patch(id, fn)` = load case → `fn(c)` → `plReconcileSla(next, now)` → `plSweepClockEvents(next, now)` → if channel `bimasetu` and `plCaseStatus().internal` changed, append `out:stage_changed`. `withLog(c, actor, actorType, event, detail)` appends an audit entry stamped `plStamp()` (engine time). Every endpoint below should run inside one DB transaction doing exactly this pipeline. Guards that `return c` unchanged = **409/422** in the API.

Actor `PM` = `PL_ME.name` (current user). Suggested REST paths in brackets.

| Method (signature) | Guards | State mutation | Stage transition | Audit event(s) (`event` · detail) |
|---|---|---|---|---|
| `createCase(d)` [POST /cases] | `d.products.length === 1`; id unique | new case via `_doCreate`: stage `rfq_review`, channel `manual`, rfq V1 `in_review` with `source`, owner `himani` only if Head picked else `bhupendra`, client.rm = universal RM, `meta.slaLeftMins = 60`, `mandateRequests []`, tasks | → `rfq_review` | PM "Ticket created manually" · `RFQ V1 · {file · RFQ link url} · {template}`; System "Ticket assigned" · `Owner {name}`; toast "{id} created" |
| `receiveFloat(payload)` [POST /bimasetu/floats — webhook] | dedupe by `lineRef`; reject if no `rfq.link`/`rfq.file` (kept in rejected-floats list, toast "Float rejected: RFQ missing") | `_doCreate` with channel `bimasetu`, `float`, `createdBy` RM, meta from payload; `exclusiveMandate` → `meta.mandate {type EPM, ref MND-{n}-E, source "BimaSetu"}` | → `rfq_review` | BimaSetu/System "Ticket created from BimaSetu float" · `{lineRef} · RFQ V1 · {attach} · {template}`; "Ticket assigned"; `← BimaSetu: float`; `→ BimaSetu: ticket_created` |
| `setTargetPremium(id, value, note)` [PUT /cases/:id/target-premium] | not closed (`!outcome`); idempotent on normalised value | `meta.targetPremium = plNormTargetPremium(value)` | — | "Target premium added" · `₹x · note` / "Target premium removed" · note / "Target premium updated" · `₹a → ₹b · note` |
| `confirmClassification(id, value, changed)` | — | active RFQ `classification.confirmed`, `flagged=false` | — | "Classification corrected" · `rmEntered → value` / "Classification confirmed" · value (UI suppressed) |
| `setRiskTier(id, value)` [PUT /cases/:id/risk-tier] | stage `rfq_review`; changed | `meta.riskTier` | — | "Risk tier set" / "Risk tier updated" · `prev → value` |
| `requestRmInfo(id, gapLabels[], note)` [POST /cases/:id/rfq/queries] | floated: ≥1 new label | append `missing` items `{id g-{case}-{v}-{n}, label, note "Raised in BimaSetu · t" / "Raised in mail to RM · t", resolved:false, material:true}`; manual: also `rmThread` msg `{at, actor, text:note, items:allOpenIds, gaps:labels}`; `pendingRm` | → `awaiting_rm` | floated: "Queries raised to RM in BimaSetu" · `N query(ies): …` + `→ query_raised` per query; manual: "Query mail sent to RM" · `To RM · N query(ies): …` |
| `bsQueryAnswer(id, queryId, text, simKey)` [webhook] | channel bimasetu; not seen; query exists | query `answer, answeredAt, answeredBy` | `awaiting_rm` → `rfq_review` | `← query_answer`; RM "Query answered in BimaSetu" · `label · text` |
| `bsThreadAnswer(id, threadId, text, simKey)` [webhook] | bimasetu; thread | last clarification `rmResponse`, thread event "RM provided the requested information (BimaSetu)" | — | `← query_answer`; RM "Information provided" · thread label |
| `simulateRmReply(id, text)` [manual: POST /cases/:id/rfq/rm-replies — inbound mail] | — | `rmThread` append | → `rfq_review`, `pendingRm []` | RM "Query answered" |
| `resolveGap(id, gapId)` [POST /cases/:id/rfq/queries/:qid/resolve] | stage `rfq_review` | query `resolved, resolvedAt, resolvedBy` | — | "Query resolved" · label |
| `validateRfq(id)` [POST /cases/:id/rfq/validate] | no unresolved query AND `meta.riskTier` set | RFQ `validated`, `validatedAt` | → `insurer_selection` | "RFQ V{n} validated" · "Moved to insurer selection" |
| `togglePanel(id, insurerId)` | first unlocked entity | via `plToggleBranch` | | (see below) |
| `togglePanelBranch(id, insurerId, branch)` [PUT /cases/:id/panel/entities] | entity not locked; cannot remove after lock | `branchPicks`, `panel.selected`; **if panel locked** → new thread (`plMakeThread`, note "added after sending"), `threadSeq+1`, handle open revision | locked & stage `qcr_released`/`revision_requested` → `market` | unlocked: "Panel updated" · `{entity} added/removed`; locked: "Additional insurer approached" · `{entity} · new independent thread on RFQ Vn · {attach}` |
| `floatRfq(id)` [POST /cases/:id/rfq/send] | (UI: ≥1 selected) | one thread per selected insurer×picked branch (skip locked); RFQ `floated`, `floatedAt`; `panel.locked = true`; `threadSeq += n` | → `market` | "RFQ V{n} sent to insurers" · `N independent insurer threads created · {attach}`; thread event "RFQ V{n} sent to {entity} · To: {pocs} · {attach}" |
| `saveInsurerMaster(insurerId, branchIdx, patch)` [PATCH /master/insurers/:id/branches/:idx] | role Placement Head | mutates insurer (name, sectors, note, status, appetite) + branch (branch, status, pocs per group) | — | `PL_MASTER_AUDIT {at, by, entity, field, before, after}` per changed field (fields: name, sectors, note, "Insurer status", "Appetite", "Branch", "Branch status", "POCs – {group}") |
| `requestMandate(id, {preferredInsurerId, reason, message})` [POST /cases/:id/mandate-requests] | `plCanRequestMandate` (open case, state none/declined, PM is exec/head) | push request `MR-nn` status `requested` | — | "Exclusive Mandate requested" · `To RM · reason · preferred insurer X\n\nmessage` |
| `remindMandate(id, note)` [POST …/remind] | open request | `reminders.push` | — | "Mandate reminder sent" · `Reminder n to RM · note` |
| `withdrawMandateRequest(id, note)` | open request | status `withdrawn`, `closedAt` | — | "Mandate request withdrawn" · note |
| `rmMandateConsidering(id, note)` [webhook/RM] | open & `requested` | status `considering`, response | — | RM "Client still considering the mandate" |
| `rmMandateSigned(id, note)` [webhook/RM] | open | status `signed`, `closedAt`; **`meta.mandate`** = `{type EPM, ref MND-{num}-E, note, by RM, byAvatar, preferredInsurerId, at, requestId, requestedBy, requestedAt}` | — | RM "Exclusive Placement Mandate signed" · `ref · preferred insurer X · note` |
| `rmMandateDeclined(id, reason, note)` [webhook/RM] | open | status `declined`, `closedAt` | — | RM "Exclusive Placement Mandate declined" · `reason · note` |
| `logCall(id, threadId)` [POST /threads/:tid/calls] | thread | event "Call logged - spoke to the insurer POC, quote expected shortly" | — | "Call logged" · thread label |
| `followUp(id, threadId)` [POST /threads/:tid/follow-ups] | thread | `followUps+1`; event "Manual follow-up n / escalation sent to {entity} · To: pocs" | — | "Follow-up sent" · label |
| `holdForRm(id, threadId, note)` [POST /threads/:tid/hold] | thread | status `awaiting_rm`, `paused`, `pauseReason`, `pausedSince = now`, last clarification `rmRequested`; event "Information requested from RM · insurer clock held at Xh" | — | "Information requested from RM" · `label · SLA held at Xh remaining`; bimasetu: `→ query_raised {threadId, query}` |
| `rmAnswered(id, threadId, text)` [inbound] | thread | last clarification `rmResponse`; event "RM provided the requested information" | — | RM "Information provided" |
| `replyToInsurer(id, threadId, text)` [POST /threads/:tid/reply] | thread | status `acknowledged`, unpause, `heldMins += biz mins since pausedSince`, clarification `repliedAt`; event "Reply sent to insurer · clock resumed with Xh remaining" | — | "Replied to insurer clarification" · `label · SLA resumed` (⚠ reply text not stored) |
| `simulateInsurer(id, threadId, kind, {note, source})` [**inbound insurer mail** webhook/classifier] | thread | `ack` → `acknowledged`; `clarify` → `insurer_clarification` + clarification; `decline` → `declined`, `followUpsActive=false`, `declineReason`; `quote` → new `Quote` (version per thread), status `quote_received` | — | Insurer "Submission acknowledged" / "Clarification raised" · `label · q…` / "Declined to quote" · `label · reason` / "Quote received" · `label · product · awaiting Placement Manager review`; suffix "(applied from Manual Review IN-xxxx)" on thread events |
| `editField(id, quoteId, key, value)` | — | field value, `correctedBy` | — | "Extracted value corrected" (no UI) |
| `setQuotePremium(id, quoteId, premium)` [PUT /quotes/:qid/premium] | changed | premium field value (number or null) | — | "Quote premium recorded/cleared/updated" · `label · product · ₹x` |
| `decideQuote(id, quoteId, decision, note)` [POST /quotes/:qid/decision] | usable requires `plCanMarkUsable`; excluded requires note | quote decision; its thread status → `quote_usable` / `quote_clarification` / `quote_excluded`; **if threshold met and no draft/release and follow-ups not yet stopped** → stop follow-ups, queue Copycat draft QCR | `market` → `quote_review`; threshold → `qcr_draft` | "Quote marked usable" / "Quote marked needs clarification" / "Quote excluded from QCR" · `label · product · note`; then System "Usable-quote threshold reached" · `n usable quotes from n distinct insurers`, "Automated follow-ups stopped" · `n thread(s) still open`, "Draft QCR V{v} queued for Copycat" · `n PDF(s) · CC-…` |
| `startDraftQcr(id, earlyReason)` [POST /cases/:id/qcrs] | (UI gate) | usable=1 → `single_quote` draft (file = quote PDF, rows unfilled); else Copycat queued draft; stop follow-ups | → `qcr_draft` | "QCR V{v} created from a single quote (no Copycat)" · `file · early release · reason` / "Draft QCR V{v} queued for Copycat" · `Early release · n usable quote(s) · reason recorded` |
| `uploadQcr(id, file, earlyReason)` [POST /cases/:id/qcrs/upload] | no draft; released OR threshold OR reason; file | `manual` draft with file, rows for usable quotes, round bump if after release; stop follow-ups | → `qcr_draft` | "QCR V{v} uploaded manually" · `name · early release · reason · n usable quote(s) on file` |
| `releaseQcr(id, note)` [POST /qcrs/:v/release] | draft exists; copycat `ready` or file-based; `rowsChecked` | qcr `released`, `releasedAt/By`, `sentTo` ("BimaSetu" / "{RM} (RM)"), `coverNote` | → `qcr_released` | "QCR V{v} sent to BimaSetu" / "QCR V{v} released to RM" · `{Single-quote\|Manual\|Copycat} QCR · round r · … · version locked`; bimasetu `→ qcr_round` |
| `newQcrVersion(id)` [POST /cases/:id/qcrs (next)] | no draft | round bump (unless revision already opened it); single-quote or Copycat draft | → `qcr_draft` | "QCR V{v} created from a single quote (no Copycat)" / "Draft QCR V{v} queued for Copycat" · `Includes quotes received after the previous release · n PDF(s)` |
| `copycatStarted(id, v, requestId)` [internal worker] | requestId matches | copycat `generating`, `startedAt` | — | System "Quote PDFs sent to Copycat" · `n PDFs · files · requestId` |
| `copycatSucceeded(id, v, requestId, result)` | match | copycat `ready`, `result`, rows from `result.quoteRows` or filled from quotes, `rowsChecked=false` | (stage stays `qcr_draft`; SLA flips 11→12) | System "QCR V{v} generated by Copycat" · `file · n quotes` |
| `copycatFailed(id, v, requestId, message)` | match | copycat `failed`, `error` | — | System "Copycat could not generate QCR V{v}" · message |
| `regenerateQcr(id, v)` [POST /qcrs/:v/regenerate] | draft | re-queue with `attempt+1` (new requestId) | — | "QCR V{v} regeneration requested" · `n PDF(s) · attempt n · requestId` |
| `setQcrRow(id, v, quoteId, field, value)` [PATCH /qcrs/:v/rows/:quoteId] | draft; field ∈ premium/sumInsured/validity/terms; changed | row value; `rowsChecked=false` | — | "QCR V{v} quote row edited" · `insurer · Premium: a → b` |
| `setQcrRowsChecked(id, v, checked)` | draft; changed | `rowsChecked` | — | "QCR V{v} quote rows checked/unchecked" · `n row(s)` |
| `bsRevision(id, {by, reason, asks, simKey})` [webhook] | bimasetu; open; not seen; released QCR | released qcr `objection`; `round+1`; push revision; push task | → `revision_requested` | `← revision_request`; RM "Revision requested · round r" · `{The client\|Us} objected to QCR Vx · reason · asks: … · no insurer contacted` |
| `bsClientConfirmation(id, {rowIndex, simKey})` [webhook] | bimasetu; open; row exists on latest released QCR | outcome `quote_selected {insurerId, quoteId, premium, qcrV, reason "Client confirmation received in BimaSetu", by "RM (RM)"}` | → `closed` | `← client_confirmation`; RM "Client confirmation received" · `Quote selected - insurer · ₹ · QCR Vn` |
| `bsLineLost(id, {reason, simKey})` [webhook] | bimasetu; open | outcome `lost` | → `closed` | `← line_lost`; RM "Line lost" |
| `closeNoAppetite(id, reason)` [POST /cases/:id/close/no-appetite] | open; reason | outcome `no_appetite`; bimasetu: `→ qcr_round` (zero rows, notice "No insurer has appetite for this risk.") + `→ closed_no_appetite` | → `closed` | "Ticket closed - no appetite" · reason |
| `logClientDecision(id, kind, {rowIndex, reason})` [POST /cases/:id/client-decision] | channel manual; open; `quote_selected` needs released row; lost/no_appetite need reason | outcome | → `closed` | "Client decision logged" · `Quote selected - insurer · QCR Vn` / `{Lost\|No appetite} · reason` |
| `newRfqVersion(id, changeNote, source)` [POST /cases/:id/rfqs] | (UI: note + same source types) | old RFQ `superseded`; new RFQ V{n+1} (copies sections, empties queries/rmThread, new source); all QCRs on old RFQ `superseded`; `threads=[]` (threadSeq kept); follow-ups reset; panel unlocked (selection kept); revision handled | → `rfq_review` | "RFQ V{n} created" · `note · file uploaded · New RFQ link url`; System "Insurer threads reset" · "Quotes against RFQ V{n-1} retained for audit but no longer count toward the threshold" |
| `restartThreads(id, threadIds, reason)` [POST /cases/:id/threads/restart] | — | selected threads: follow-ups 0/active, fresh `floatedAt`, `targetMins`, unpause, status `acknowledged` or `rfq_sent`; event "Thread restarted - reason · RFQ re-sent (attach)"; revision handled; `followUpsStopped=false` | → `market` | "Threads restarted" · `labels · reason · RFQ re-sent (attach)` |
| `toggleTask(id, taskId)` | — | task `done` toggle | — | none (unused) |
| `logInbound(id, threadId, reviewId, event, detail)` [POST /inbound-mails/:id/apply] | — | thread event `{event} (Manual Review IN-…)` | — | System `{event}` · `detail · Manual Review IN-…` ("Inbound mail marked not applicable", "Inbound mail mapped to thread") |
| `say(msg, tone)` | — | UI toast only | | |

Derived, never stored (should be server-computed read models / selectors): `plCaseStatus`, `plNextAction`, `plSlaIdOf`, `plCurrentSla` (remaining), `plThreadRemainingMins`, `plUsableInsurers/Count`, `plThresholdMet`, `plLiveQuotes`, `plOpenRmQueries`, `plMandateState`, `plEntitiesFor` (locked reasons), `plTargetFlag`, `plExecOf`, `plVisibleCases`.

---

## 8. SLA engine & business rules

### 8.1 Business-time math (L2298, L11088)
- Working day: Mon–Fri, 10:00–19:00 local (IST), minus holidays → **540 business minutes/day**.
- `bizBetween(a,b)` hours of overlap with working windows; `addBiz(from, hours)` walks forward through windows; `subBiz` backward; `addWD(from, days)` = same clock time on the Nth next working day.
- Placement wrappers: `plBizMinutesBetween(fromMs,toMs)`, `plAddBizMinutes(fromMs, mins)`, `plWalkBackBizMinutes(fromMs, mins)`.
- "Now" = `PL_ENGINE_NOW_MS` (starts 2026-08-26 14:00 local; advanced by the sim chip). In prod: wall clock, and the sweep runs on a scheduler (e.g. every 5 min) plus after each mutation.
- Formatting: `plFmtMins` (`Xd` with one decimal at ≥540 / `Xh Ym` / `Xm`), `plFmtH` (`Xd Yh` / `Xh`), `fmtDur` ("2 Hrs. 5 Mins.", "3 Days 2 Hrs."), `plInr` (`₹12,34,567` en-IN), `plInrL` (`₹78 L`, `₹1.2 Cr`).

### 8.2 Case SLA (one clock at a time)
- `plSlaIdOf(c)`: closed → none; `rfq_review` SLA-02; `awaiting_rm` SLA-03; `insurer_selection` → SLA-05 if panel locked else SLA-04; `qcr_released` SLA-14; `revision_requested` SLA-17; `qcr_draft` → SLA-12 if Copycat ready or file-based else SLA-11; else (market/quote_review): any thread `awaiting_rm` → SLA-03; any undecided live quote → SLA-10; else SLA-06.
- `plSlaTargetMins`: SLA-06 uses `plThreadTargetMins(c)` (matrix) or 1080; others master mins.
- `plReconcileSla(c, now)` after every mutation: if the id changed, **re-anchor at now with full target** (`{id, ownerType: external?'external':'internal', anchorAt: now, targetMins}`); unchanged id keeps anchor.
- Remaining = `targetMins − bizMinutesBetween(anchorAt, now)`; negative = breached. External clocks are shown as "On hold"/"Awaiting …" and never count as breaches (rule "H4").
- Seeds: `meta.slaLeftMins` walks `anchorAt` back so remaining matches at engine start.

### 8.3 Thread (insurer) clock
- Created on send with `floatedAt = now`, `targetMins = plThreadTargetMins(c) || 18*60`, `heldMins 0`.
- `plScenarioOf(c)`: Renewal → `renewal`; Rollover → EB ? `nonPreferred` : `preferred`; else needs `riskTier` (Non-preferred → `nonPreferred`, else `preferred`); none → null → default 1080 min. Row: `Liability:Crime` for CRIME, else LOB row (fallback Property). Target = days × 540.
- Remaining = target − (bizMins(floatedAt→now) − heldMins − bizMins(pausedSince→now)). Null for declined/usable/excluded threads.
- Hold (`holdForRm`) sets `pausedSince`; `replyToInsurer` adds held time to `heldMins`. Other threads keep running ("one insurer event never overwrites anything else").
- `restartThreads` resets the clock and ladder.
- ⚠ UI (Market tab Stage Due, `plNextAction` breach check, hold/reply copy) still reads the static `t.slaH` — the rebuild should use the derived remaining everywhere.

### 8.4 Follow-up ladder (SLA-07/08/09 per comments) — in `plSweepClockEvents`
- Applies to threads with `followUpsActive`, case not `followUpsStopped`, status not declined/usable/excluded, `floatedAt` set.
- For step n = 1..3: due = `floatedAt + n × 540` business minutes; if now ≥ due and `followUps < n` → `followUps = n`, event stamped at the due time: "Follow-up 1 sent to {entity} · To: {pocs}" / "Follow-up 2 …" / "Escalation sent to …". Idempotent.
- Manual `followUp` increments the same counter ("Manual follow-up n" / "Manual escalation").
- Threshold met (3 distinct usable insurers) → `followUpsStopped = true`, all `followUpsActive = false`. Also stopped on any QCR draft creation.

### 8.5 Internal escalation "SLA-P1" — in `plSweepClockEvents`
- Only for `ownerType === 'internal'` SLAs.
- When remaining < 0 and not armed: arm at breach moment (`anchorAt + targetMins`), audit "SLA-P1 reminder 1 sent" · `{exec} · {SLA short} breached`.
- Then every **30 business minutes**: reminder 2, 3 ("… · no action recorded"). 30 business minutes after reminder 3: `escalatedAt`, **`headEscalated = true`** (owner → Himani; hidden from executive), audit "Escalation ladder exhausted" · "3 reminders sent · no action recorded" and "Escalated to Placement Head" · "SLA-P1 ladder exhausted · owner reassigned to Himani (Placement Head)".
- If the breach clears before escalation: audit "SLA-P1 cancelled" · "PM action cleared the breach", `slaP1 = null`. Escalation is sticky.
- (Comment-level: SLA-P1 is described as "follow-up count 3 every 60 BM" for Ops; Placement uses 30 BM.)

### 8.6 Quote/QCR rules
- **Threshold**: distinct insurers with ≥1 `usable` quote on the active RFQ (superseded excluded); revisions from one insurer count once. `PL_THRESHOLD = 3`.
- **Mark usable** blocked only while that quote's decision is `clarification` (`plCanMarkUsable`). Exclude needs a non-empty reason (UI and api).
- Quotes are stored as received; nothing extracted; only premium editable (audited). Quote version counts per thread.
- **Auto-draft**: the decision that reaches the threshold (with no draft/release and follow-ups not already stopped) queues a Copycat draft automatically.
- **Early release** (<3 usable): reason required from fixed list; 1 usable → `single_quote` QCR (insurer PDF is the QCR, no Copycat); 2 → Copycat with `earlyRelease {reason, count}`.
- **Manual upload**: allowed when no draft and (released OR threshold met OR early reason); any file type; lands as draft "Pending Placement Release".
- `plCanCreateQcr` = no released and no draft on active RFQ (gate for auto/early paths).
- **Release** requires Copycat `ready` (or file-based) **and** `rowsChecked`. Any row edit clears `rowsChecked`. Released versions are locked forever; later quotes → next QCR version = next **round** (unless a revision already opened it).
- **Stale draft**: Copycat-ready draft missing a current usable quote → prompt regenerate.
- **Late quote**: after release, undecided quotes received after `releasedAt` or usable quotes not in released `quoteIds` → prompt next version.
- **QCR round payload to BimaSetu**: file, round, requestedAt (`plRoundRequestedAt`: case `receivedAt` for round 1, revision time later), deliveredAt, earlyReason, rows (insurer/premium/sumInsured/validity/terms) — **never insurer documents or thread details**.
- **Copycat runner lifecycle** (`usePlCopycatRunner` + `plCopycatClient`): QCR with `copycat.status === 'queued'` → runner calls `copycatStarted` (→ generating) → `plCopycatClient.generate(payload)` (mock: delay 2500ms, builds `products[{product, columns, rows}]` from quote fields; live: multipart POST `files` + `metadata` JSON to `PL_CONFIG.copycat.endpoint`, timeout 60s, response mapped by `plCopycatMapResponse`) → `copycatSucceeded` / `copycatFailed`. `requestId = CC-{caseId}-V{v}-{attempt}`; stale requestIds ignored; regenerate bumps attempt. Payload: `{caseId, qcrVersion, rfqVersion, requestId, documents[{quoteId, insurerId, insurer, contact, product, productLabel, template, version, fileName, file}]}`. **Rebuild**: a NestJS job queue (BullMQ) worker; idempotent by requestId; status pushed to the client via SSE/WebSocket or polling.

### 8.7 RFQ rules
- Every ticket has exactly one product type (`createCase` rejects otherwise). Batch creation / sibling linking was removed.
- RFQ source = Excel (`.xlsx/.xls/.csv`) and/or link (`http(s)`), at least one; never parsed ("Nothing is read from the RFQ").
- Queries: optional; raised → `awaiting_rm`; an RM answer returns to `rfq_review` but **never resolves** a query — PM resolves each. Validate requires zero unresolved queries **and** a risk tier.
- RFQ V2 (`newRfqVersion`): needs change note + a fresh source of every type V1 had; supersedes old RFQ + its QCRs; resets threads (ids continue via `threadSeq`); panel unlocks keeping selection.

### 8.8 Insurer selection rules
- Entities = insurer × branch with ≥1 POC for the ticket's **product group** (EB/Liability/P&C). Every POC on the entity is in To; no primary/escalation contact; PM never picks POCs.
- Locked (visible but not selectable, also refused by api): insurer status ≠ Active (`Do Not Float`, `Inactive`), branch `Inactive`, no POC for group (add-insurer path), **incumbent on a Rollover without an "Incumbent Approach Mandate"** (`Incumbent – mandate needed`). Incumbent matched by id or name prefix.
- Appetite chips are a hint only. Warning if fewer than 3 insurers selected.
- Two branches of one insurer → two threads, but count once toward the threshold.
- After send, adding an entity creates a new thread (and if the case was in `qcr_released`/`revision_requested`, returns it to `market`). Removing is a no-op.

### 8.9 Mandate rules
- Two mandate types: **Exclusive Placement Mandate** (EPM; requested by Placement from the RM, or arrives on a BimaSetu float) and **Incumbent Approach Mandate** (unblocks the incumbent on a Rollover).
- `plMandateState`: `signed` if `meta.mandate.type === EPM`; else open request status (`requested`/`considering`); else last `declined`; else `none`.
- Request allowed only when state is `none` or `declined`, case open, user is exec or head. Reason and message mandatory; preferred insurer optional. Reminder unthrottled; requests never expire (both **[OPEN]**).
- Signing writes `meta.mandate` (`ref MND-{num}-E`). The mandate is **informational only**: it does not change insurers, quotes, QCR or the client decision.
- UI: header pill (signed orange / requested·considering neutral), queue star icon, rail card (hidden when signed/closed), hover popovers.

### 8.10 Target premium rules
- Optional everywhere; `plNormTargetPremium` accepts numbers or strings like "₹78 L", "1.2 Cr", "78,00,000", "50 lakh" → integer INR; ≤0 / unparseable / "TBD" → null.
- Decision support only: `plTargetFlag(c, premium)` → "Target Not Available" (neutral; when target or premium not a number) / "Target Met" (green, premium ≤ target) / "Above Target" (orange). Never blocks validate/send/usable/QCR/decision; QCR never contains it.
- Editable on open cases via header link; audited (added/updated/removed); idempotent.

### 8.11 Closure rules
- Only three outcomes: `quote_selected` (BimaSetu client confirmation, or manual "Log client decision" picking a row of the latest released QCR), `lost` (BimaSetu line lost, or manual with reason), `no_appetite` (PM with reason; floated → zero-row QCR round + `closed_no_appetite` to BimaSetu). Manual tickets: decision menu; floated: only "Close: No appetite" (others come from BimaSetu).
- Revision (BimaSetu only): opens round+1, stage `revision_requested`, **no insurer contacted** until PM acts: re-rate/terms → restart threads; insurer → add insurer; cover → RFQ V{n+1}.

### 8.12 Visibility / roles
- Executive: never sees Head-owned (escalated) tickets anywhere; Insurer Master read-only; no Owner column/field; no Escalated-to-You.
- Head: scope Me (only her escalated tickets) / Team (all); Owner column in queue; Owner field on create; edits Insurer Master; Escalated to You on Home (team scope).

### 8.13 Email product matcher `plMatchProductTypes(text)` (L10200)
Fire → FIRE_FACTORY if factory/plant, FIRE_GODOWN if warehouse/godown, both if neither; PI → PI_ENGG if "PI Engg" or engineering wording, else PI_TECH; others by alias longest-first, word-boundary, short all-caps aliases case-sensitive (`GMC, GPA, GTL, CGL, DNO, PI, WC, IAR, MBD, CAR, EAR, BGR, STOP`); "public liability" + "act" → PL_ACT (not PL_GEN); Fire present removes BURGLARY and MBD_EEP. Used for Manual Review case suggestions — port as a server util with unit tests.

---

## 9. Assets worth keeping

### 9.1 `Public/`
| Path | Keep? | Notes |
|---|---|---|
| `Public/Insurance.Comp/*.webp` (23 wordmarks) | **Keep** | Used via `INSURER_LOGO`/`plInsurerLogo` (match by insurer name, case-insensitive). Mapping to `PL_INSURERS`: ICICI.webp→ICICI Lombard, HDFC→HDFC ERGO, Bajaj→Bajaj Allianz, Tata→Tata AIG, New.India→New India Assurance, Digit→Go Digit, SBI→SBI General, Chola→Cholamandalam MS, Reliance→Reliance General, Oriental→Oriental Insurance, United→United India Insurance. **No files** for Liberty General, Care Health, Star Health, Universal Sompo → render name text. Extra (Acko, Aditya, Generali, IFFCO, Magma, National, Navi, Raheja, Royal, Shriram, Zuno, Placeholder.PSU) useful when the real insurer master lands. Rebuild: store `logoUrl` on the `insurers` table. |
| `Public/Prod.Icon/*.webp` (16 product rosettes) | Keep (low priority) | Named by long product names (with curly apostrophes — rename to slugs). Not used by Placement screens today; maps loosely to PL codes (Fire, Marine, CGL/Product Liability, D&O, PI, WC, Crime, CAR/EAR/CPM, MBD/MLOP, Office Package, Cyber). No EB (GMC/GPA/GTL) icons. |
| `Public/bhupendra.webp`, `Public/himani.webp`, `Public/Shubh.webp` | Keep for demo/seed only | Avatars of the Placement personas and the RM (Shubh also inlined as `AVATAR_SHUBH`). Real avatars come from the user store. |
| `Public/bajaj-logo.svg` | Optional | Used only in `PlMandateDetails` preferred-insurer hard-code for `bajaj` (⚠ special case) — use the generic logo path instead. |
| `Public/Jaishree.webp`, `Ruksana.webp`, `Salvi.webp`, `Umesh.webp` | Noise for Placement | Other apps' personas. |
| Inline data-URI SVGs in code: `IKKAT_V1/V2` paths (L192–193), `UP_ART` upload illustrations (Endorse UploadField art) | Keep ikkat paths as SVG assets; upload art optional | |

### 9.2 Docs
| File | Value for the rebuild |
|---|---|
| `PLACEMENT-BIMASETU-REPORT.md` | **High** — latest contract for channel model, BimaSetu message types, rounds, QCR payload, insurer branches/POC routing, Do-Not-Float, SLA master edits, assumptions list (§3). Supersedes parts of earlier reports (e.g. removed `rm_mail` intake, removed sibling linking, `PC-`→`PLC-`, `Fresh`→`New`). |
| `PLACEMENT-OVERHAUL-REPORT.md` | **High** — product-type master, thread-id model, Copycat seam, six→(now three) decision outcomes history, Manual Review wiring. Note: "six client-decision options" and `rm_mail` items are **superseded** by the BimaSetu report. |
| `PLACEMENT-MANDATE-REQUEST-REPORT.md` | **High** — mandate request state machine, copy, [OPEN] items. |
| `PLACEMENT-TARGET-PREMIUM-REPORT.md` | **Medium/High** — target premium normaliser & flags (its `plParseRfqMail` / `ingestRmMail` / "RFQ mails" parts were later **removed**). |
| `PLACEMENT-SINGLE-PRODUCT-REPORT.md` | **Medium** — single-product invariant rationale; batch create & "Linked:" header were later **removed**. Flags PRD v1.3 conflicts FR-006 / BR-003. |
| `PLACEMENT-AUDIT.md` | **Medium** — UI consistency debt list (primitive drift, rail placement, label idioms, focus rings, footer copy); use as a do-not-repeat checklist. |
| `DESIGN-SYSTEM.md` | **High** for tokens/philosophy (colour = meaning; purple = action not status; density; tabular numbers; no em dashes; squircle; ikkat; motion). Endorse-centric in places; `figTert` value differs from code. |
| `UI-INVENTORY.md` | **Medium** — endorsement screens, but the shell (Sidebar/Breadcrumb/PageHead/Greeting), component state matrix and "Decisions worth knowing" apply to Placement shared chrome. |
| `DATA-MASTERS.md` | Low for Placement (endorsement masters); the principle "do not invent business data" and BIZ hours/holidays apply. |
| `FUNCTIONAL-SPEC.md` | Low — BimaEndorse only (states Placement "not built" — stale). |
| `OPEN-QUESTIONS.md` | Low — endorsement-centric; one stale note about other tools being unbuilt. |
| `CLAUDE.md`, `CHANGE-PROTOCOL.md`, `README.md` | Process docs for the prototype; not needed. |
| `BIMAENDORSE-PRD-SOURCE.md`, `BIMAENDORSE-REFUND-LOGIC.md` | Not relevant. |
| `prototype2.jsx` | Old endorsement-only build; ignore. |

Missing (referenced but absent from repo): `Placement_SLA_master.xlsx`, `PLACEMENT-CLAUDE-PROMPT-v3.md`, `FUNCTIONAL-CONTRACT.md`, PRD v1.3, Figma nodes (e.g. `1536:31841` case header, `1536:35308` overview, `1559:46710` threads table, `1510:52625` mandate details). Request these from the product owner.

---

## 10. Noise / things NOT to port

**Simulation-only controls** (replace with real integrations or a dev-only flag):
- `PlEngineChip` + `PlEngineCtx`/`usePlEngine` + `plSetEngineNow`/`PL_ENGINE_START_MS` (engine time "+30 min / +1 BH / +1 BD / +3 BD / +1 WD").
- `PlSimBlock`, `PlSimBtn` and every amber block: "Simulate BimaSetu (RM side)" (queue + rail), `PlFloatSimModal`, `PL_FLOAT_PRESETS`, `PL_REJECTED_FLOATS`; `PlBimaSetuSimBlock`, `PlBsRoundModal`, `PlBsAnswerModal` (→ BimaSetu inbound webhooks: `float`, `query_answer`, `revision_request`, `client_confirmation`, `line_lost`); `PlMandateRmSimBlock` (→ RM responses via BimaSetu/mail); `PlSimRmModal`, `PlSimThreadRmModal` (→ inbound RM mail); "Simulate insurer response" buttons (→ inbound insurer mail classification); "Simulate Copycat → Fail the next generation" (`plCopycatFailNext`, `plCopycatSetFailNext`); `plCopycatMock`.
- `api.simulateInsurer` / `simulateRmReply` / `rmAnswered` / `rm*Mandate*` / `bs*` are real **domain events** but triggered by simulators — keep the semantics as inbound handlers.
- `simKey` replay protection → real message ids.

**Seed / demo data** (do not migrate as product data): `PL_SEED`, `PL_SEED_B`, `PL_SEED_C`, `PL_CASE_META`, `PL_SEED_MANDATE_REQUESTS`, `PL_SEED_SPLITS`, `PL_SEED_SPLIT_OVERRIDES`, `plSplitSeedByProduct`, `plSeedTextNamesOnlyOther`, `plNormalizeSeed`, `plSeedSla`, `plSeedRounds`, `plSeedThreadPocs`, `plSeedPocs`, `PL_ALL_CASES`, `PL_INDUSTRY_BY_CASE`, `PL_RFQ_LINK_CASES`, `PL_HEAD_ESCALATED_IDS`, `PL_MY_REVIEWS`, `PL_UNMATCHED`, `c.demo` "Happy Path Demo" dot, `demoQuotes`, the hard-coded Home "Last Month / Last Quarter / Custom" numbers, "Last refreshed 4 Hrs. ago", mock `PL_FIELDSETS` values and the `simulateInsurer("quote")` base payloads, mock POC names in `PL_INSURER_BRANCHES`, appetite lists (pending real Insurer Master). They are excellent **fixtures for tests/storybook**.

**Prototype hacks / workarounds**:
- Mutable module globals: `PL_ME`, `PL_ENGINE_NOW_MS`, `PL_QID`, `PL_MASTER_AUDIT`, `PL_REJECTED_FLOATS`, in-place mutation of `PL_INSURERS`/`PL_INSURER_BRANCHES` by `saveInsurerMaster` (+ `setCases([...cs])` to force re-render).
- Display-string timestamps ("25 Aug, 09:40") and `plParseReceived` year guessing; `Date.now()` mixed with engine time (`plAgeDays` uses wall clock).
- Session via URL hash + sessionStorage (`SESS_*`), shared demo password, login "Verify" step that only checks a hard-coded address list.
- `useSquircle` global MutationObserver mask manager; `Overlay` portal workaround for masked stacking contexts; inlined base64 avatars/logos; inlined lucide icons (`IconStarCheck`, `IconShieldPlus`, `IconBanknoteCheck`) because lucide 0.469; "Tailwind core only / no arbitrary values" constraint; inline `style` everywhere.
- Synthetic documents (`plDocSynthBlob`, CSV fallback in `plDownloadRfq`, `Client_form_submission.pdf`, `{code}_expiring_schedule.pdf`) and synthetic mail addresses / direction regex in `plMailFrom`/`plMailsForThread`.
- "Re-upload quote" calling `simulateInsurer("quote")`.
- `PlMandateDetails` special-casing `bajaj` with `LOGO_BAJAJ`.
- Hard-coded "Placement Manager: Himani Doshi" in the case header; "Contact RM" button with no handler.
- `setQuotePremium` / `setQcrRow` firing per keystroke (audit spam).

**Dead / unused code** (don't port): `PlSlaChip`, `PlStageRail` + `PL_RAIL`, `PlFold`, `PlDivider`, `PlOptionCard`, `PlPickerRow`, `PlPickerChip`, `PlMultiPicker`/`PlMultiOpt`, `PlSelect`, `PlCaseStrategyCard`, `PlInboxScreen` (unreachable — consider reviving as a notifications view), `editField`, `confirmClassification` + `PL_CLASSES` + classification data (UI suppressed), `tasks`/`toggleTask`, `recommend`/`notRecommended` seed arrays, `priority`, `plLowConfidence`, `plCorrected`, `plThreadOf`, `plQuotesOf`, `plProductCoverage`, `plRestartableThreads` usage only via modal, `PL_LEGACY_FIELDSET`, `PCOLS.urg/usable`, `fUrg` filter, `multiRfq`/`earlyQcrs` (computed, unrendered), "Negotiation" remnants (SLA-15/16 removed), `PlModal tone` prop.

**Endorsement / Claims / Ops-only** (ignore): everything prefixed `CL_`/`cl`, `OPS_`/`ops`/`Ops*`, and Endorse-specific `SEED`, `TYPES`, `PRODUCTS`, `INSURERS` (endorse desk), `ALL_STAGES`, `FLOW`, `TERMINAL`, refund logic (`FIN_ON_ENTER`, `NEFT`, `isRefund`), `PRIORITY`, `ESCALATION`, `MR_ESCALATION`, `REMINDERS`, `NOTIFY`, `TRAIL`, `POLICY_BOOK`, `PAN_BOOK`, `EndorseApp`, `ClaimsApp`, `OpsApp`, Endorse `SearchModal`/`SearchCard`, `CaseCard`, `StagePills` data, `KindTag`, etc. Shared pieces Placement **does** reuse and should be rebuilt as shared shell: `Sidebar`, `Breadcrumb`, `TicketPager`, `PageHead`, `Greeting`, `ScopeSwitch`, `RangePills` (+`CustomRangeModal`), `DeskCard`, `ProgressCard` (`Spark`, `PerfMeter`, `scoreStatus`), `Donut`, `Indicator`/`IND`, `MetaHover`/`Tip`/`InfoTip`, `TabBar`, `ThreadTab`, `HeaderFilter`, `MenuCard`/`MenuOpt`, `Empty`, `UploadField`, `ModalShell`/`Overlay`, `Login`/`LoginField`, `Highlight`, `TeamMemberAvatar`, `GLOBAL_CSS` utilities (`bk-rule`, `bk-trail`, `bk-mark`, `bk-num`, hover classes), `BIZ`/`bizBetween`/`addBiz`/`subBiz`/`addWD`, `fmtDur`.

---

## Appendix A — Inconsistencies & open questions to resolve before build

1. Insurer Master visibility: comments say Head-only, nav shows it to both (read-only for exec).
2. `figTert`/`PL_T.ink3` collapsed to `#6F7378` in code vs `#A9ACB1` in DESIGN-SYSTEM.md.
3. Thread SLA display uses static `slaH` instead of derived remaining (Market tab, next action, hold/reply copy).
4. `no_response` thread status is never set by any rule — define when a thread becomes "no response" (after ladder step 3?).
5. Case header "Placement Manager" hard-coded to Himani; should be `plExecOf(c)` (or both exec + head).
6. `PlRightRail` renders on the left; audit decided to move it right.
7. `PL_PRODUCT_LOB`: WC → Marine, PL_GEN → Property — confirm.
8. Tasks have two shapes and no UI.
9. `shortId` regex doesn't strip `PLC`.
10. Desk cards don't pre-filter the queue (Endorse version does).
11. Uppercase table headers (Inbox/Master/Reports/"EXCEL DOCUMENT") contradict the "never all caps" rule.
12. Gujarati greeting without a Gujarati webfont.
13. Mandate reminder throttle / request expiry / reason wording — [OPEN] per mandate report.
14. BimaSetu four-field check for floats; renewal-date mandatory; RFQ attachment mandatory — [OPEN] per target-premium & BimaSetu reports.
15. Clarification message text (quote clarify, reply to insurer) is not persisted — needs real outbound mail records.
16. Manual Review "done" state lives in UI only; needs an `inbound_mails` entity with status.
