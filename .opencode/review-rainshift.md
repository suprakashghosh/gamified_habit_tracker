# Code Review: RainShift redesign

**Scope**: RainShift visual redesign of QuestBoard game UI (`src/app/globals.css`, `src/app/layout.tsx`, `src/components/{TaskCard,QuestBoard,XPHUD,XPBar,MobileTabBar,EmptyState,LoadingSkeleton}.tsx`) and `tsconfig.json`.

**Overall risk**: Low

**Verdict**: Approve with comments

## Checks summary

1. **RainShift visual patterns** — Mostly applied. Charcoal palette via `.dark-game` and game tokens; Orbitron loaded and used via `.font-display` in card/quest headings; achievement-card shape, top stripe, 64px icon square, uppercase tags, checkmark indicator, grid background, and glow orbs all present in `QuestBoard`/`TaskCard`.
2. **Functionality preserved** — Click increment, undo toast, drag reorder, lifecycle processing, and admin light theme remain intact.
3. **TypeScript / accessibility** — `next build` type-check passes; no new TS errors. Minor a11y nits noted below.
4. **Build / lint** — `npm run build` passes. `npm run lint` passes but emits 4 warnings from the excluded `RainShift/` directory.
5. **`tsconfig` exclude** — Justified: `RainShift` is a self-contained nested Next.js project with its own `tsconfig.json`, `node_modules`, and `@/*` path alias; excluding avoids duplicate type-checking and alias conflicts.

## Findings

### [P2] Font shorthand tokens used with invalid Tailwind arbitrary-value syntax

- **Location**: `src/components/LevelUpOverlay.tsx:87,95,106`, `src/components/XPNotification.tsx:19`, `src/components/admin/AdminClient.tsx:268,271,277`
- **Why it matters**: The RainShift "Orbitron headings" pattern is broken in the level-up overlay and XP floater. Admin headings also lose their intended typography.
- **Evidence**: Generated CSS contains `.font-\[--font-display-xl\]{font-family:--font-display-xl}` (and similar for `--font-button-lg`, `--font-body-sm`, etc.). Setting `font-family` to `--font-display-xl` is invalid; the declaration is ignored and the text falls back to Geist.
- **Fix**: Use the working `font-display` class for Orbitron, plus Tailwind text-size utilities. If the shorthand tokens must be reused, create explicit CSS utilities, e.g. `.font-display-xl { font: var(--font-display-xl); }`, instead of `font-[--font-display-xl]`.

### [P3] Admin loading skeleton uses dark game colors on a light page

- **Location**: `src/app/admin/loading.tsx:5-8`, `src/components/LoadingSkeleton.tsx`
- **Why it matters**: The admin route stays light-themed, but its loading state renders the dark charcoal `LoadingSkeleton`, creating a visual clash.
- **Evidence**: `admin/loading.tsx` wraps `<LoadingSkeleton count={3} />` in `bg-white`; `LoadingSkeleton` hard-codes `bg-game-bg-panel`, `border-game-border`, etc.
- **Fix**: Add a `variant?: "light" | "dark"` prop to `LoadingSkeleton` and use `variant="light"` in admin loading, or create a separate light skeleton.

### [P3] ESLint still scans the excluded `RainShift` directory

- **Location**: `eslint.config.mjs:14-22`, `tsconfig.json:26`
- **Why it matters**: `tsconfig.json` excludes `RainShift`, but ESLint does not, so `npm run lint` reports warnings from the nested project.
- **Evidence**: `npm run lint` output shows 4 warnings, all under `RainShift/src/...`.
- **Fix**: Add `"RainShift/**"` to the `ignores` array in `eslint.config.mjs`.

### [P3] Duplicate tablist and generic mobile labels

- **Location**: `src/components/QuestBoard.tsx:206,231`, `src/components/MobileTabBar.tsx:37`
- **Why it matters**: Two regions claim `role="tablist"` for the same tab state, which can confuse screen readers. Mobile tab buttons have non-descriptive `aria-label={key}`.
- **Evidence**: Sidebar nav and top header both use `role="tablist"`; `MobileTabBar` labels are just tier names.
- **Fix**: Remove `role="tablist"` from one navigation (likely the top header) or give each a distinct `aria-label`. Change mobile labels to `Show ${key} quests`.

## Suggested next steps

- [ ] Fix P2 font-token usage so Orbitron headings render in the level-up overlay and XP notification.
- [ ] Resolve P3 items before merge or in a fast-follow cleanup.
- [ ] Re-run `npm run build` and `npm run lint` after fixes.
