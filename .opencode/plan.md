# Plan: Gamified Habit Tracker (QuestBoard)

## Objective

Build a Next.js 15 gamified habit tracker structured as a quest-board across daily/weekly/monthly/long-term tabs. An LLM (Vercel AI SDK) converts raw todo lists into gamified task hierarchies with consistent units. Users tap-to-increment progress, earn tier-scaled XP, and level up via exponential thresholds. Completed tasks grey out and sink to the bottom. Progress propagates up the parent-child chain automatically.

## Requirements Snapshot

| ID | Requirement |
|----|-------------|
| **R1** | Four-tier quest tab UI (daily/weekly/monthly/long-term) styled per RainShift/Geist design system with bottom tab bar on mobile, top pills on desktop |
| **R2** | Strict task hierarchy: longterm → monthly → weekly → daily. Standalone tasks allowed at any tier (parent_id null). Hierarchical tasks are always one-shot. Only standalone tasks can recur |
| **R3** | Unit consistency: root parent defines unit and total counter. Children get empty counters; user allocates them in admin panel. Σ(children.max_count) must equal parent.max_count before publish |
| **R4** | Counter-based progress: tap-to-increment (+1). Leaf tasks have soft caps (can exceed planned max_count with `+N` overflow indicator). Branch tasks auto-grow max_count to match child over-delivery. Root tasks (longterm hierarchy root or standalone at any tier) have hard caps — taps rejected when root reaches its max_count. Parent completion bonus fires once at planned threshold. Undo toast (3-second). Completed/fully-capped tasks greyed out, auto-sorted to bottom. Drag-to-reorder within each tab |
| **R5** | Tier-scaled XP + Levels: per-unit XP scaled by tier (daily < weekly < monthly < longterm). Exponential thresholds (100 × 1.5^(N-1)). Account-wide. Level-up animation. XP lost opportunity on task expiry (no deduction) |
| **R6** | LLM on-demand generation: user enters raw todo → LLM checks quantifiability → returns structured tree with clarifications for ambiguous items → user resolves clarifications → user allocates child counters → publishes. Model fallback configurable via `gamified.config.json` (uses OpenRouter as gateway, can switch to any model slug) |
| **R7** | Admin panel (`/admin`) with: raw todo input, generate button, clarification UI, inline editable table with counter allocation, publish button. Draft vs published state |
| **R8** | Repeated/recurring tasks expire at period end (marked as missed, no XP deducted) and auto-regenerate for next period. One-shot tasks archive on completion. Hierarchical tasks are one-shot by nature |
| **R9** | Supabase PostgreSQL + Prisma ORM. Vercel hosting. Secrets in Vercel env vars (`DATABASE_URL`, `OPENROUTER_API_KEY`). `gamified.config.json` safe to commit (model/provider/xp config) |
| **R10** | Mobile-first responsive (375px–1440px). Light mode only for MVP. Geist font via next/font. Framer Motion for animations |
| **R11** | Integration + E2E testing (Vitest + Playwright) |
| **R12** | Server mutations + revalidation for data flow. Server Components for data fetching, Client Components only where interactivity needed |

## Scope

**In scope:** Full gamified habit tracker with quest-board UI, counter-based progress, tier-scaled XP/leveling, LLM task generation with quantifiability checks and clarification flow, admin panel with counter allocation, Supabase persistence, Vercel deployment, mobile responsiveness.

**Out of scope:** Dark mode, streaks, PWA, recurring LLM coaching, AI-generated insights, social features, habit analytics dashboard, achievements/badges, character stats, boss battles.

**MVP access control (in scope):** Simple admin password via `ADMIN_PASSWORD` env var. Next.js middleware protects `/admin` route and all mutation Server Actions. Game view (`/`) remains public-readable for sharing progress. Not full multi-user auth — just a shared secret to prevent strangers from mutating data or burning LLM API credits.

## Assumptions and Constraints

- Single-user personal tool with admin password protection (middleware + `ADMIN_PASSWORD` env var) to guard admin route and all mutations
- Vercel hosting (serverless functions, env vars for secrets)
- Supabase free tier PostgreSQL (500MB)
- Geist font via `next/font` (bundled, no external CDN dependency)
- Tailwind CSS v4 with custom tokens from DESIGN.md
- Framer Motion for animation sequences (XP popups, level-up overlay, card transitions)
- npm + ESLint + Prettier (standard Next.js tooling)
- Node.js 20+ runtime

## Core Concepts

### Task Hierarchy Model

```
Task {
  id
  title: string
  description?: string
  unit: string                           // e.g. "pages", "chapters", "glasses", "km"
  tier: "daily" | "weekly" | "monthly" | "longterm"
  parent_id?: string (self-reference)
  max_count: number                      // planned total for this task. For roots/standalone: hard cap. For branches/leaves: estimate (can be exceeded via over-delivery)
  current_count: number                  // progress so far (can exceed max_count for non-root tasks)
  xp_per_unit: number                    // XP awarded per counter increment
  recurrence_group_id?: string          // groups recurring instances across periods
  period_start?: DateTime               // start of the period this instance belongs to
  period_end?: DateTime                 // end of the period (used for unique constraint)
  is_recurring: boolean                  // true only for standalone tasks without hierarchy
  is_published: boolean                  // false = draft in admin, true = live
  sort_order: number                     // manual drag-to-reorder position
  status: "draft" | "active" | "completed" | "missed"
  expires_at?: DateTime                  // for recurring tasks: when this instance expires (same as period_end)
  created_at: DateTime
  completed_at?: DateTime
}

// Unique constraint: @@unique([recurrence_group_id, period_start])
// Prevents duplicate recurring instances for the same period.
```

**Parenting rules + Cap behavior:**
| Tier | Can be parent of | Can be child of | Can recur? | Cap type |
|------|-----------------|------------------|------------|----------|
| longterm | monthly | nothing | No | Hard (hierarchy root) |
| monthly | weekly | longterm | No | Soft (auto-grows to match children) |
| weekly | daily | monthly | No | Soft (auto-grows to match children) |
| daily | nothing (leaf) | weekly | Only if standalone | Soft if child, Hard if standalone |

**Unit consistency rule:** Root parent defines `unit` and `max_count`. When LLM generates a hierarchical tree, children get `max_count: 0`. User allocates parent's `max_count` across children in admin panel. Before publish: Σ(children.max_count) must equal parent.max_count. This prevents unit-mixing errors (e.g., chapters vs pages).

### Task Types

| Type | parent_id | has children | cap | can recur | Example |
|------|-----------|--------------|-----|-----------|---------|
| Standalone | null | No | Hard | Optional | "Drink 8 glasses of water" (daily, recurring) / "Read 1 article" (daily, one-shot) |
| Hierarchical root | null | Yes | Hard | No | "Read The Pragmatic Programmer — 24 chapters" (longterm) |
| Hierarchical branch | Yes | Yes | Soft | No | "Read 12 chapters" (monthly, child of root) — max grows if children over-deliver |
| Hierarchical leaf | Yes | No | Soft | No | "Read 2 chapters" (daily, child of weekly) — can exceed 2, UI shows `3/2 (+1)` |

### Progress Propagation

**Cap model:**
- **Soft cap (branch/leaf):** Task can exceed its `max_count`. UI shows overflow indicator. Branch `max_count` auto-grows to match Σ(children.current_count) when children over-deliver.
- **Hard cap (root/standalone):** Task locks at `max_count`. `incrementProgress` walks up parent chain to find the root; if root.current_count >= root.max_count, tap rejected.
- **Parent completion bonus:** Fires once when a parent's Σ(children.current_count) first reaches its planned `max_count`. Never fires on over-delivery (guarded by existing `XPTransaction` with reason `"parent_completion"`).

```
tap leaf task → walk up to find root → if root.current_count >= root.max_count: REJECT
  → server: increment leaf counter (no per-tap ceiling for non-root)
  → if leaf counter exceeds leaf.max_count: mark leaf status as "completed" (already was), no bonus
  → walk up parent chain: recalculate each parent's current_count as Σ(children.current_count)
  → if parent Σ(current) > parent.max_count: auto-grow parent.max_count to match (soft cap)
  → if parent Σ(current) first reaches planned parent.max_count: mark parent completed, award parent completion bonus XP
  → if root Σ(current) >= root.max_count: root hard-cap hit, future taps on this tree rejected
```

### XP & Leveling System

**Tier multipliers (configurable in gamified.config.json):**
```json
{
  "xp": {
    "tier_multipliers": { "daily": 1, "weekly": 5, "monthly": 25, "longterm": 100 },
    "base_xp_per_unit": 5
  }
}
```

**XP calculation:** `awarded_xp = increment_count × xp_per_unit × tier_multiplier`

**XP award rules:**
- **Leaf tasks (daily, or standalone any tier):** Each tap awards its own tier-scaled XP per unit. No parent XP awarded during leaf taps.
- **Parent completion bonus:** When a parent task's `Σ(children.current_count)` reaches its `max_count` for the first time, award a one-time **parent completion bonus**: `parent.xp_per_unit × parent.max_count × tier_multiplier`. This is a milestone award, not per-child-increment. Prevent duplicates via `XPTransaction` unique key `(task_id, reason: "parent_completion")`.
- **Undo rollback:** When `decrementProgress` is called, reverse the corresponding XP transaction(s) by writing negative-adjustment `XPTransaction` rows, recompute the parent chain, and unset parent completion status if the sum drops below max. See Sub-Task 3 for full undo semantics.

Default `xp_per_unit` per tier (LLM-assigned, user-overridable):
| Tier | Default xp_per_unit | With multiplier | Example (max: 10) | Parent completion bonus |
|------|-------------------|-----------------|---------------------|--------------------------|
| Daily | 5 | 5 XP/unit | 50 XP for full leaf | N/A (leaf/daily has no children) |
| Weekly | 30 | 150 XP/unit | 1500 XP | 1500 XP when all children done |
| Monthly | 100 | 2500 XP/unit | 25000 XP | 25000 XP when all children done |
| Longterm | 300 | 30000 XP/unit | 300000 XP | 300000 XP when all children done |

**Level thresholds:** `100 × 1.5^(N-1)`
- Level 1: 0 XP (start)
- Level 2: 100 XP
- Level 3: 250 XP
- Level 4: 475 XP
- Level 5: 812 XP
- Level 10: 5,767 XP
- Level 20: 332,500 XP
- Level 30: ~19M XP

**XP on expiry:** When a recurring task expires incomplete, no XP is deducted. The unearned XP is simply lost opportunity. The task is marked "missed" with a visual indicator.

### LLM Generation Flow

```
1. User enters raw todo list in /admin textarea
2. User clicks "Generate"
3. Server action calls Vercel AI SDK generateObject with Zod schema
4. LLM analyzes each todo for quantifiability:
   a. Quantifiable → returns task tree: root with unit + max_count, children with max_count = 0
   b. Ambiguous → returns "needs clarification" with specific questions + suggested unit/total
5. Admin panel renders two sections:
   a. "Generated Tasks" — editable table with counter allocation controls
   b. "Needs Clarification" — LLM questions + user input fields
6. User resolves clarifications → triggers regeneration (now quantifiable)
7. User allocates child counters (sum must match parent)
8. User clicks "Publish" → tasks go live (is_published: true)
```

**LLM Zod Schema for response:**
```ts
const TaskDraft = z.object({
  title: z.string(),
  description: z.string().optional(),
  unit: z.string(),
  tier: z.enum(["daily", "weekly", "monthly", "longterm"]),
  max_count: z.number().int().nonnegative(),   // 0 for unallocated children, positive for roots/standalone
  xp_per_unit: z.number().int().positive(),
  is_recurring: z.boolean(),
  children: z.array(/* recursive TaskDraft */).optional(),
});

const GenerationResponse = z.object({
  tasks: z.array(TaskDraft),
  clarifications: z.array(z.object({
    originalTodo: z.string(),
    questions: z.array(z.string()),
    suggestedUnit: z.string().optional(),
    suggestedTotal: z.number().optional(),
  })),
});
```

### Config File Format

`gamified.config.json` (safe to commit):
```json
{
  "llm": {
    "provider": "openrouter",
    "model": "openai/gpt-4o"
  },
  "xp": {
    "tier_multipliers": {
      "daily": 1,
      "weekly": 5,
      "monthly": 25,
      "longterm": 100
    },
    "base_xp_per_unit": 5
  }
}
```

Secrets (`.env.local` / Vercel env vars, never committed):
```
DATABASE_URL=postgresql://... (Supabase pooled/transaction-mode connection for runtime)
DIRECT_URL=postgresql://... (Supabase direct/session-mode connection for migrations)
OPENROUTER_API_KEY=sk-or-v1-...
ADMIN_PASSWORD=your-shared-secret-here
```

`DATABASE_URL` is the pooled (PgBouncer/transaction-mode) URL for serverless runtime. `DIRECT_URL` is the direct (session-mode) URL used only for `prisma migrate deploy`. Both must be set in Vercel env vars.

## Sub-Tasks

### Sub-Task 1: Project Scaffold & Design Tokens

- **Status:** Completed
- **Objective:** Bootstrap Next.js 15 project with App Router, configure Tailwind v4 with RainShift design tokens, install all dependencies, set up config file schema.
- **Related Requirements:** R1, R9, R10
- **Dependencies:** None (starting point)
- **In Scope:**
  - `create-next-app` with TypeScript, Tailwind, App Router, ESLint, `src/` directory
   - Install: `prisma @prisma/client @supabase/supabase-js`, `framer-motion`, `ai @openrouter/ai-sdk-provider zod`, `sonner` (toasts), `next/font` (Geist)
  - Configure `tailwind.config.ts` or `globals.css` `@theme` block with all design tokens from DESIGN.md (colors, typography, spacing, shadows, radii)
  - Create `gamified.config.json` with default values and TypeScript types
  - Create `.env.local.example` with dummy values
  - Configure Geist + Geist Mono fonts in root layout
  - Create `src/middleware.ts` — protects `/admin` route and all mutation Server Actions by checking `ADMIN_PASSWORD` header/env var. Game view (`/`) remains public-readable. Store password hash in env, compare in middleware
  - Project structure: `src/app/`, `src/components/`, `src/actions/`, `src/lib/`, `src/types/`, `src/middleware.ts`
- **Out of Scope:** UI components, database schema, LLM logic, server actions
- **Instructions:**
  1. Run `npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --no-import-alias` (in current directory)
  2. Install additional packages via npm
  3. Map DESIGN.md tokens to Tailwind v4 `@theme` block in `src/app/globals.css`
  4. Create `src/types/config.ts` with Zod schema for config validation
  5. Create `src/lib/config.ts` to read and validate `gamified.config.json`
  6. Set up `src/app/layout.tsx` with Geist font
  7. Create `src/middleware.ts`: check for `/admin` path prefix → require `Authorization: Bearer <ADMIN_PASSWORD>` header or cookie. For mutation Server Actions, also validate the admin token in each action (defense in depth). Return 401 for unauthorized requests to protected routes/actions
- **Acceptance Criteria:**
  - `npm run dev` starts without errors
  - Tailwind tokens render with correct colors, spacing, typography
  - `gamified.config.json` is parseable and type-validated
  - Geist font loads and renders
- **Cautionary Points:**
  - Tailwind v4 uses CSS-first `@theme` directive, not v3 config
  - Geist font: use `next/font/google` with `Geist` and `Geist_Mono`
  - Don't commit `.env.local`
- **Validation:** `npm run build` passes. Create a test route showing all design tokens.

---

### Sub-Task 2: Database Schema & Prisma Setup

- **Status:** Completed
- **Objective:** Design and create Prisma schema for Task, XPTransaction, and AppState models. Run initial migration against Supabase.
- **Related Requirements:** R2, R3, R8, R9
- **Dependencies:** Sub-Task 1
- **In Scope:**
  - `schema.prisma` with:
     - `Task` model: id, title, description, unit, tier(enum), parent_id(self-relation), max_count, current_count, xp_per_unit, recurrence_group_id, period_start, period_end, is_recurring, is_published, sort_order, status(enum: draft|active|completed|missed), expires_at, created_at, completed_at
    - `XPTransaction` model: id, amount, source_task_id, reason (enum: "leaf_increment" | "parent_completion" | "undo" | "missed_penalty"), linked_transaction_id (nullable, for undo reversal), created_at
    - Application-level guard (or conditional unique index): before inserting parent_completion, check no existing row with same (source_task_id, reason). Prevents duplicate parent bonuses
    - `AppState` model: id(single row, "singleton"), total_xp, current_level, created_at, updated_at
   - Indexes on `tier`, `parent_id`, `sort_order`, `status`, `is_published`, `recurrence_group_id`
   - Unique constraint on `(recurrence_group_id, period_start)` for recurring task idempotency
   - Supabase connection via `DATABASE_URL` (pooled, runtime) and `DIRECT_URL` (session, migrations) env vars
  - Initial migration + Prisma client generation
- **Out of Scope:** Seed scripts, API routes, UI
- **Notes (post-implementation):** Prisma 7 dropped `directUrl`. Schema uses single `provider = "postgresql"` block (no URLs). All connection config lives in `prisma.config.ts`. For Supabase PgBouncer, set `DATABASE_URL` to pooled URL (port 6543) and optionally `DATABASE_URL_MIGRATIONS` to session-mode URL (port 5432) for migrations.
- **Instructions:**
  1. Create `prisma/schema.prisma` with models above (provider only, no URLs — Prisma 7)
   2. Create `prisma.config.ts` with `defineConfig({ datasource: { url: ... } })`. Use `DATABASE_URL` env var; optionally `DATABASE_URL_MIGRATIONS` for pooled setups.
   3. Run `npx prisma migrate dev --name init` (requires real Supabase credentials)
   4. Generate client: `npx prisma generate`
   5. Create `src/lib/prisma.ts` with singleton Prisma client
- **Acceptance Criteria:**
  - `npx prisma generate` succeeds ✓
  - Migration applies to Supabase (deferred — requires real Supabase credentials; schema DDL verified valid)
  - Can create/query tasks with parent-child relationships (verified via seed.ts when DB available)
  - Enum types enforced at DB level ✓
- **Cautionary Points:**
  - Supabase connection requires SSL (`sslmode=require` in connection string)
  - Prisma 7: no `directUrl` — use `DATABASE_URL_MIGRATIONS` env var fallback in `prisma.config.ts` for pooled setups
  - Prisma's `@relation` for self-referential fields needs explicit `references` and `fields`; `onDelete: Cascade` on parent for cleanup
  - `AppState` singleton pattern: use a fixed ID (e.g., "singleton") and `upsert`
- **Validation:** Write a small script (`prisma/seed.ts`) that creates a parent task with children, queries nested relations, and verifies hierarchy integrity. Run with `npx tsx prisma/seed.ts`.

---

### Sub-Task 3: Server Actions & Data Layer

- **Status:** Completed
- **Objective:** Implement all server actions for task CRUD, progress updates (tap-to-increment), XP calculation, hierarchy aggregation, task lifecycle (expiry/recurrence), and draft/publish flow.
- **Related Requirements:** R2, R3, R4, R5, R8
- **Dependencies:** Sub-Task 2
- **In Scope:**
  - `src/actions/tasks.ts` — Server actions:
    - `createTask(data)` — creates a single task (draft or active)
    - `updateTask(id, data)` — updates task fields (admin editing)
    - `deleteTask(id)` — removes a task and its children
    - `incrementProgress(taskId)` — tap handler. Pre-check: walk up parent_id chain to find root task (self if standalone). If root.current_count >= root.max_count, return `{ locked: true }` (hard cap). Otherwise: use Prisma $transaction to increment leaf counter (no per-tap ceiling check — soft cap). Award leaf XP per unit. If leaf.current_count == leaf.max_count (planned threshold first hit), mark leaf as "completed". Walk up parent chain recalculating parents: auto-grow parent.max_count if children exceed it, check for first-time parent completion at planned threshold, award one-time parent completion bonus if due. Update AppState XP, check level-up. Revalidate, return `{ newCount, isComplete, xpAwarded, parentCompletions, newLevel, leveledUp, undoToken }`
     - `decrementProgress(taskId, undoToken)` — undo handler: compensating transaction. Validates undo window server-side (3 minutes from original increment). Reverses XP (writes negative `XPTransaction` with `reason: "undo"` and `linked_transaction_id`), decrements counter, walks up parent chain to recalculate and possibly un-complete parents, revalidates. Requires undo token from original increment response to prevent replay attacks
    - `reorderTasks(orderedIds)` — updates sort_order for a list
    - `publishTasks(taskIds)` — recursively validates every parent-child boundary in the hierarchy: Σ(children.max_count) == parent.max_count, all children share parent.unit, and child tier is exactly one step lower. Rejects if any boundary fails (with specific error pointing to which parent/child). Flips is_published: true on all validated tasks
    - `allocateChildCounters(parentId, allocations: {childId, maxCount}[])` — distributes parent units to children, enforces sum equality
    - `processTaskLifecycle()` — finds expired recurring tasks, marks missed, creates next-period clones, recalculates affected parent progress
  - `src/actions/xp.ts` — Server actions:
    - `getXPState()` — returns current total_xp, level, XP to next level
    - `awardXP(amount, taskId)` — creates XPTransaction, updates AppState, checks level-up
    - `calculateLevel(totalXp)` — pure function: determines level from XP total
  - `src/lib/xp.ts` — Pure utility functions:
    - `xpForLevel(n)` — returns XP required to reach level N
    - `levelFromXP(xp)` — returns current level
    - `xpToNextLevel(xp)` — returns remaining XP to next level
    - `tierXP(taskTier, xpPerUnit, tierMultipliers)` — returns effective XP per unit
- **Out of Scope:** UI components, API routes (use Server Actions directly), LLM integration
- **Instructions:**
  1. Implement pure XP math first (`src/lib/xp.ts`) — thoroughly tested, no side effects
  2. Implement `awardXP` action: atomic (transaction), update AppState, return `{ newXP, newLevel, leveledUp }`
   3. Implement `incrementProgress`:
      - **Pre-check:** Walk `parent_id` chain to root. For standalone tasks, root = self. If `root.current_count >= root.max_count`, return `{ locked: true }` immediately. No transaction needed for rejection.
      - Use Prisma `$transaction`: increment leaf counter (allowed to exceed leaf.max_count — soft cap) → award leaf XP per unit → check if leaf.current_count == leaf.max_count for the first time, mark leaf completed → walk up parent chain (iterative, up to 4 levels): recalculate each parent's current_count as Σ(children.current_count). If parent.Σ > parent.max_count, auto-grow parent.max_count to match (soft cap for branches). If parent.Σ first reaches its planned max_count (check previous value < planned max), mark parent completed, award parent completion bonus XP with guard check `(taskId, reason: "parent_completion")` → recursively check parent-of-parent same way → update AppState XP total, check level-up
      - Generate server-side undo token for 3-minute window
      - Revalidate `/` path
      - Return `{ newCount, isComplete, overflow: currentCount > maxCount, xpAwarded, parentCompletions, newLevel, leveledUp, undoToken }`
   4. Implement `publishTasks`: recursively walk all tasks with children, validate at every boundary: Σ(children.max_count) == task.max_count, children.unit == task.unit, child.tier is one step below parent. Return specific error with failing task IDs if any boundary fails. If all pass, set is_published=true on all tasks in the tree
   5. Implement `processTaskLifecycle`:
      - Query: recurring tasks where status=active AND expires_at < now()
      - NOTE: completed recurring tasks stay `completed` until next period boundary — they do NOT regenerate mid-period (prevents XP farming)
      - For each expired active task: update status to missed, then create a new recurring instance with same fields but reset current_count=0, new period_start/period_end, new expires_at=next period boundary, same recurrence_group_id
      - Use `upsert` based on unique constraint `(recurrence_group_id, period_start)` for idempotency
      - Call from root layout server component on each page load (no cron needed for MVP)
- **Acceptance Criteria:**
   - `incrementProgress` works: counter++ (past max_count allowed for non-root), XP awarded, parent auto-grows when children over-deliver, parent completion bonus fires once at planned threshold, root hard cap rejects taps when root max reached
   - `decrementProgress` reverses counter AND XP (compensating transaction), propagates un-completion up parent chain
  - `publishTasks` rejects unbalanced children
  - `processTaskLifecycle` correctly expires tasks and creates next-period clones
  - XP correctly calculates tier multipliers
  - Level-up detection returns correct `leveledUp` boolean
- **Cautionary Points:**
   - Parent progress: since children share parent's unit, parent progress = Σ(children.current_count). Branch parent max_count auto-grows when children over-deliver (soft cap). Root parent max_count is a hard cap — taps rejected once root.current_count >= root.max_count
   - Root-walk pre-check: before incrementing, find root by walking parent_id chain. This is cheap (max 4 hops). If root is fully-capped, reject early to avoid starting a transaction that will fail
   - Over-delivery UI: leaf cards show `current/max (+overflow)` when current_count > max_count. Same grey-out treatment as completed tasks when root hard-caps
  - Concurrent taps: Prisma `$transaction` with optimistic locking (check current_count hasn't changed since read) or use `increment` atomically
  - Recursive parent walk: use iterative approach (while loop up parent_id chain). Hierarchies are max 4 deep (longterm→monthly→weekly→daily), so recursion with a depth limit also works
  - Timezone for expiry: default to UTC; `gamified.config.json` can include `timezone` field later
  - Recurrence-only-standalone rule: validate on `createTask` that `is_recurring` can only be true when `parent_id IS NULL` AND no children exist
- **Testing Suggestions:**
  - Vitest test: `xpForLevel(1)` → 0, `xpForLevel(2)` → 100, `xpForLevel(5)` → 812
  - Vitest test: create task tree, `incrementProgress` on leaf, assert parent current_count updated, assert XP awarded with tier multiplier
  - Vitest test: `processTaskLifecycle` on expired task, assert status=missed, assert new task created with reset counter
  - Vitest test: `publishTasks` with children sum != parent → throws error

---

### Sub-Task 4: Game View UI — Quest Tabs & Task Cards

- **Status:** Completed
- **Objective:** Build the main game view (`/`) with four quest tabs, interactive task cards, tap-to-increment, undo toasts, drag-to-reorder, and completed-task sinking.
- **Related Requirements:** R1, R4, R10, R12
- **Dependencies:** Sub-Task 3
- **In Scope:**
  - `src/app/page.tsx` — Server component: fetches published tasks, groups by tier, passes to QuestBoard
  - `src/components/QuestBoard.tsx` — Client component: tab navigation (pill-style from DESIGN.md), renders task lists per active tab
  - `src/components/TaskCard.tsx` — Client component: displays task (title, unit, counter N/M, XP badge, tier badge), tap-to-increment handler, undo toast, greyed-out completed state, entry animation (Framer Motion opacity + y slide)
  - `src/components/MobileTabBar.tsx` — Bottom tab bar for mobile (4 icon tabs: sun/moon/calendar/star), top pill tabs for desktop
  - `src/components/XPHUD.tsx` — Client component: displays current level badge + XP progress bar in header
  - Tab state in URL search param (`?tab=daily`) for shareable links
  - Completed tasks: opacity-50, grey background, auto-sorted to bottom (Framer Motion `Reorder.Group` with special bottom section)
  - Drag-to-reorder within active task list (Framer Motion `Reorder`)
- **Out of Scope:** XP animations (Sub-Task 5), admin panel, LLM integration
- **Instructions:**
  1. Build `XPHUD` first: reads XP state from a server component passed as prop, renders level badge + progress bar
   2. Build `TaskCard`: tailwind-styled card per DESIGN.md (canvas bg, md rounded, lg padding, L3 shadow). Counter display: `3 / 8 glasses` when within cap, `5 / 3 (+2)` when over-delivering (soft cap). Tap handler calls `incrementProgress` server action. If response is `{ locked: true }`, show a subtle "Complete" badge and disable tap. Undo: 3-second `setTimeout`, shows `sonner` toast with undo button, calls `decrementProgress`. Completed/capped state: opacity-50, muted text, background canvas-soft
  3. Build `QuestBoard`: tab pills (rounded pill-sm, 64px). Active tab highlighted with ink bg + white text. Inactive: canvas bg, ink text. Framer Motion `AnimatePresence` for tab transitions. `Reorder.Group` for drag-to-reorder with `onReorder` calling `reorderTasks` server action
  4. Build `MobileTabBar`: fixed bottom, 4 icon tabs, safe-area padding. Hidden on desktop (`md:hidden`)
  5. Wire `page.tsx`: fetch tasks with `prisma.task.findMany({ where: { is_published: true }, include: { children: true }, orderBy: [{ status: 'asc' }, { sort_order: 'asc' }] })`. Group by tier. Call `processTaskLifecycle` on page load
  6. Handle empty state: "No quests available. Generate some in the admin panel!" with link to `/admin`
- **Acceptance Criteria:**
  - Four tabs render, tab switching works (URL updates)
   - Tap increments counter, XP updates in HUD. Tapping past planned max shows overflow indicator. Hard-cap tasks reject taps when fully complete
   - Undo toast appears, undo reverses counter
  - Completed tasks grey out and sink to bottom of their tab
  - Drag reorder persists (calls server action)
  - Mobile: bottom tab bar, desktop: top pills
  - Tasks grouped correctly by tier
- **Cautionary Points:**
  - Server Component → Client Component: fetch data in `page.tsx` (server), pass as props to `QuestBoard` (client). Don't import `prisma` in client components
  - `useOptimistic`: wrap `incrementProgress` call with `useOptimistic` for instant UI update. Rollback on error via `startTransition`
  - `Reorder.Group` + completed sinking: split tasks into two arrays (active, completed), render completed below with `Reorder` disabled
  - Tap debounce: prevent rapid double-taps from exceeding max_count. Disable tap zone during server action execution (use `useTransition` isPending)
  - Mobile tap targets: minimum 44px height per WCAG. Card should be fully tappable
- **Testing Suggestions:** E2E test: tap active task, verify counter changes, verify completed task moves to bottom, verify XP updates

---

### Sub-Task 5: XP & Level-Up System UI

- **Status:** Completed
- **Objective:** Add floating +XP notification animations, level-up takeover sequence, smooth XP bar transitions, and confetti on level-up.
- **Related Requirements:** R5, R10
- **Dependencies:** Sub-Task 4
- **In Scope:**
  - `src/components/XPNotification.tsx` — Floating "+50 XP" text animating upward and fading out (Framer Motion `AnimatePresence`, absolute positioning near tap point or fixed bottom-center)
  - `src/components/LevelUpOverlay.tsx` — Full-screen overlay: screen flash (white → transparent), "LEVEL UP!" text scaling in, new level number, XP bar filling from old to new value, dismissible after animation
  - `src/components/XPBar.tsx` — Smooth animated fill bar showing current XP progress toward next level
  - Notification queuing: multiple rapid taps stack notifications with stagger delay
  - Configurable via context: tap position for notification origin, notification duration
- **Out of Scope:** Sound effects, haptic feedback, achievement badges, streak animations
- **Instructions:**
  1. Create `XPNotificationContext` + provider in `QuestBoard` to manage notification queue
  2. `XPNotification`: `<motion.div>` with initial opacity 0 y 20, animate opacity 1 y -40 fading out. Positioned at tap coordinates (passed from `TaskCard` via event.clientX/Y). Duration: 1.5s
  3. `LevelUpOverlay`: triggered when `incrementProgress` returns `leveledUp: true`. Sequence: 1) screen flash (200ms white overlay), 2) "LEVEL UP!" text scales in with spring animation, 3) new level number counts up, 4) XP bar fills to new position, 5) dismiss button or auto-dismiss after 3s
  4. `XPBar`: uses Framer Motion `motion.div` with `animate={{ width: `${percentage}%` }}` with spring transition
  5. Wire into `XPHUD`: receive `totalXP` and `level` from parent, compute percentage, pass to `XPBar`
- **Acceptance Criteria:**
  - Tapping a task shows floating "+X XP" where tapped, fades up and out
  - Multiple rapid taps show stacked notifications with stagger
  - Level-up triggers full overlay with flash, text, counting level number
  - XP bar animates smoothly on XP change
  - Overlay is dismissible
- **Cautionary Points:**
  - Notification positioning on mobile: use viewport-relative or fixed positioning, not absolute within card (card may scroll)
  - Multiple level-ups in one session: handle edge case where XP jumps multiple levels (from a large tier completion). Show each level sequentially or show final level with skip animation
  - `useEffect` cleanup: cancel pending notification timeouts on unmount
  - Server Component can't use context — XPHUD gets XP state as props from server parent
- **Testing Suggestions:** E2E test: tap task, verify +XP notification appears, complete enough tasks to level up, verify overlay triggers

---

### Sub-Task 6: Admin Panel — LLM Task Generation & Draft Editing

- **Status:** Completed
- **Objective:** Build `/admin` route with raw todo input, LLM generation (quantifiability check + clarification flow), inline table editor with counter allocation, and publish workflow.
- **Related Requirements:** R6, R7, R3
- **Dependencies:** Sub-Task 3
- **In Scope:**
  - `src/app/admin/page.tsx` — Server component: fetches draft tasks, renders admin UI
  - `src/components/admin/TodoInput.tsx` — Textarea for raw todo list + "Generate" button + loading state
  - `src/components/admin/ClarificationPanel.tsx` — Shows items needing clarification with LLM questions + user answer inputs + "Resolve" button
  - `src/components/admin/TaskTable.tsx` — Inline editable table: columns for title, description, unit, tier, max_count, xp_per_unit, is_recurring, parent task (dropdown). Counter allocation: for children of a root, shows "Allocated: N / Parent: M" with +/- controls. Red/green sum indicator
  - `src/components/admin/GenerateButton.tsx` — Triggers generation, shows spinner, calls `generateTasks` server action
  - `src/components/admin/PublishButton.tsx` — Validates all draft tasks (sum checks, unit consistency), publishes
  - `src/actions/llm.ts` — `generateTasks(rawTodos: string)` server action, `resolveClarifications(answers: Record<string, string>)` server action
  - Draft tasks in DB with `is_published: false`, not visible in game view
- **Out of Scope:** Task templates, batch import/export, re-flavoring, generating tasks from history/patterns
- **Instructions:**
   1. Create `src/actions/llm.ts`:
      - `generateTasks`: reads `gamified.config.json` for model. Uses `@openrouter/ai-sdk-provider` with the config's model slug (e.g., `"openai/gpt-4o"`). Constructs prompt with few-shot examples of good hierarchy decomposition. Includes rules: check quantifiability, root defines unit + total, children get empty max_count, tier-based XP defaults, recurring only for standalone. Calls `generateObject` from Vercel AI SDK with GenerationResponse Zod schema. Inserts draft tasks into DB (recursive for children with parent_id linking). Returns `{ tasks, clarifications }`
     - `resolveClarifications`: takes user answers, calls LLM again with answers as additional context, returns task tree. Merges/inserts draft tasks
  2. Build `TodoInput` → `ClarificationPanel` → `TaskTable` flow:
     - User pastes todos → clicks Generate → loading spinner
     - LLM returns → if clarifications exist, show `ClarificationPanel` with questions
     - User answers → clicks Resolve → LLM generates tasks → `TaskTable` populates
     - If no clarifications, `TaskTable` populates directly
  3. Build `TaskTable`: each row is editable (controlled inputs or `contentEditable`). Parent dropdown filters by tier>current. Counter allocation: for a task with children, show allocation UI (slider or +/- for each child, sum indicator). Red background if sum != parent, green if exact. Add/delete row buttons
  4. Build `PublishButton`: calls `publishTasks` server action (already built in Sub-Task 3). On success, redirect to `/` or show success toast. On failure, show validation error (which child sums are off)
- **Acceptance Criteria:**
  - User enters raw todos → clicks Generate → LLM returns tasks and/or clarifications
  - Clarifications displayed, user answers, tasks generated
  - Task table shows draft tasks, editable fields
  - Counter allocation enforces parent=sum(children), red/green indicator
  - Publish validates and makes tasks live
  - Published tasks appear in game view (`/`)
- **Cautionary Points:**
   - LLM API key: stored in Vercel env vars (`process.env.OPENROUTER_API_KEY`). Never exposed to client. `generateObject` call is in server action only
  - LLM failure handling: rate limits, timeouts, malformed JSON. Show specific error toast, allow retry. Don't crash the page
    - Model switching: MVP uses OpenRouter gateway via `@openrouter/ai-sdk-provider`. `gamified.config.json` `model` field holds the OpenRouter slug string (e.g., `"openai/gpt-4o"`, `"anthropic/claude-sonnet-4"`). Switching models is a config change only — no package swap needed. To use a non-OpenRouter provider later, replace the package and update config accordingly
  - Prompt engineering: include explicit few-shot examples covering: quantifiable todo decomposition, ambiguous todo detection, tier-appropriate XP values, unit assignment
  - Recursive task insertion: generate children with `parent_id` linking. Use Prisma `createMany` with explicit IDs for efficiency, or recursive `create` calls
  - Draft task cleanup: delete old drafts on each new generation, or allow user to manage drafts independently
- **Testing Suggestions:**
  - Vitest: mock `generateObject` return, verify `generateTasks` inserts correct DB records with proper hierarchy
  - E2E: navigate to `/admin`, enter todo, generate, verify table populated, edit a field, publish, navigate to `/`, verify tasks appear

---

### Sub-Task 7: Task Lifecycle — Expiry & Recurrence Engine

- **Status:** Completed
- **Objective:** Ensure recurring tasks expire at period end, get marked as missed, and auto-regenerate. Validate that hierarchical tasks remain one-shot.
- **Related Requirements:** R8, R2
- **Dependencies:** Sub-Task 3 (lifecycle action already implemented), Sub-Task 4 (UI view)
- **In Scope:**
  - Visual "missed" indicator: red badge on expired tasks in UI (appears briefly before being replaced by new instance or shown in a "Missed" section)
  - Optional: a small "Missed Yesterday" summary on daily tab showing expired tasks
  - Period-end calculation: daily = end of day (23:59:59 server time), weekly = end of Sunday, monthly = end of last day of month
  - Recurrence validation: enforce `is_recurring` only on standalone tasks (no parent, no children) in both server action and DB constraint (optional trigger or app-level only)
  - Lifecycle called from root layout `page.tsx` on each load (no cron needed for MVP)
  - Idempotency guard: mark processed with a timestamp or check status before re-processing
- **Out of Scope:** Vercel cron jobs, push notifications, grace period for missed tasks
- **Instructions:**
   1. Review and polish `processTaskLifecycle` from Sub-Task 3:
      - Ensure `expires_at` is set correctly in `createTask`: daily = end of today, weekly = end of week, monthly = end of month, longterm = far future or null
      - Set `period_start` and `period_end` matching the task's tier period boundaries
      - For new recurring instances: clone all fields except current_count (reset to 0), new period_start/period_end, new expires_at (end of next period), same recurrence_group_id, new id
      - Mark original as status: "missed" if expired and incomplete; leave as "completed" if it was completed
      - Completed recurring tasks stay `completed` until period boundary passes — no immediate regeneration mid-period
      - If original has parent relationship (shouldn't happen per rules, but defensive), recalculate parent progress
  2. Add visual indicator: missed tasks get a red "Missed" badge. Show for 24 hours after expiry, then hide (archived)
  3. Add `expires_at` display on task cards for recurring tasks (small clock icon + "Resets at midnight" tooltip)
  4. Add validation in `createTask` and `updateTask` server actions: reject `is_recurring: true` if task has parent_id or has existing children
- **Acceptance Criteria:**
  - Recurring daily task expires → original shows "Missed" → new instance appears for today
  - Non-recurring task expires → marked missed, no new instance
  - Hierarchical task cannot be set to recurring (validation error)
  - Lifecycle is idempotent: loading page twice doesn't double-create
- **Cautionary Points:**
  - Race condition: two rapid page loads could both create next-period instance. Use DB-level constraint (unique index on `recurrence_group_id` + `period_start`) or `upsert` with a generated key
  - Period boundaries: daily rollover at midnight server time. If user is in a different timezone, this feels off. Provide `timezone` field in config for v2
   - Marking missed vs completed: only mark missed if expired AND incomplete (current_count < max_count). Completed recurring tasks stay `completed` until the next period boundary (expires_at passes), then the lifecycle creates a new instance for the new period. This prevents XP farming from immediate regeneration
  - Missed task cleanup: eventually delete or archive old missed tasks to prevent DB bloat. For MVP, keep them
- **Testing Suggestions:**
  - Vitest: create recurring task with past expires_at, call lifecycle, assert missed + new task created
  - Vitest: create non-recurring task with past expires_at, call lifecycle, assert missed only
  - Vitest: attempt to set `is_recurring` on task with children → error

---

### Sub-Task 8: Mobile-Responsive Layout & Polish

- **Status:** Completed
- **Objective:** Ensure responsive design across 375px–1440px. Polish loading states, empty states, error boundaries, and accessibility.
- **Related Requirements:** R1, R10
- **Dependencies:** Sub-Task 4, 5, 6 (all UI sub-tasks)
- **In Scope:**
  - Mobile breakpoints: 375px (phone), 768px (tablet), 1024px (desktop)
  - Bottom tab bar on mobile (`<md`), top pill tabs on desktop (`>=md`)
  - Task cards: single column on mobile, 2-column grid on tablet, 3-column on desktop (active tasks only; completed tasks single column at bottom)
  - Admin panel: table scrolls horizontal on mobile; task editor uses card layout instead of table on small screens
  - `loading.tsx` in `app/` and `app/admin/`: skeleton cards mimicking task card shape (pulse animation)
  - `error.tsx` in both routes: friendly error message + retry button
  - `not-found.tsx`: custom 404 page
  - Empty states: "No quests for today" with illustration (emoji or SVG) and CTA to admin
  - `src/components/LoadingSkeleton.tsx` — Reusable skeleton component
  - `src/components/EmptyState.tsx` — Reusable empty state with icon, title, description, optional CTA
  - Toast system: already using `sonner` from Sub-Task 1. Ensure toasts for: undo, publish success, publish error, generate error, generic server error
  - Accessibility: focus outlines (not removed via `outline: none` — use `focus-visible:ring`), aria-labels on tap zones ("Increment [task name] counter"), semantic HTML, keyboard nav for admin table
- **Out of Scope:** Dark mode, PWA, offline support, internationalization
- **Instructions:**
  0. Screenshot-led polish direction: restyle main game UI toward provided dark sci-fi achievement-grid references: dark grid background, left stats sidebar, top category/search bar, uppercase techno/mono typography, dense rectangular entries with icon square, task title, description, status badge, and progress bar embedded within each card. Preserve QuestBoard domain semantics (daily/weekly/monthly/longterm tabs) while visually echoing the provided All/Survivors/Skins navigation style.
  1. Audit all components for responsive breakpoints. Use Tailwind prefixes (`sm:`, `md:`, `lg:`, `xl:`)
  2. Create `MobileTabBar` with 4 icon sections (use lucide-react icons: Sun, CalendarDays, CalendarRange, Star)
  3. Create `LoadingSkeleton`: `animate-pulse` with rounded-md divs mimicking card shape
  4. Create `EmptyState`: centered flex container, large emoji, `display-sm` title, `body-sm` description, optional `button-primary` CTA
  5. Add `error.tsx` (client component) with `useEffect` error logging, retry button calling `router.refresh()`
  6. Add `loading.tsx` with skeleton grid
  7. Test all pages at 375px, 768px, 1024px, 1280px in Chrome DevTools
  8. Run `npx eslint .` and fix all warnings
- **Acceptance Criteria:**
  - App fully usable at 375px width
  - Tabs navigable via bottom bar on mobile
  - Task cards render correctly at all breakpoints
  - Loading skeletons shown during navigation/server action delays
  - Error states recoverable with retry button
  - Empty states show helpful messaging
  - No console errors or ESLint warnings
- **Validation:** Manual test on Chrome DevTools responsive mode for all 4 breakpoints. Run Lighthouse audit for accessibility score > 90.

---

### Sub-Task 9: Testing — Integration & E2E

- **Status:** Pending
- **Objective:** Write integration tests for server actions and data layer, E2E tests for critical user flows.
- **Related Requirements:** R11
- **Dependencies:** Sub-Task 3 (server actions), Sub-Task 4-7 (UI complete)
- **In Scope:**
  - **Vitest integration tests** (`src/__tests__/`):
    - XP math: `xpForLevel`, `levelFromXP`, `xpToNextLevel`, tier XP calculation
    - Server actions: `incrementProgress` hierarchy propagation, `publishTasks` sum validation, `processTaskLifecycle` expiry/recurrence, `createTask` validation rules
    - Config parsing: `gamified.config.json` validation
    - Prisma queries: task hierarchy queries, ordering
  - **Playwright E2E tests** (`e2e/`):
    - Tap-to-complete flow: tap task → counter changes → XP popup appears → task shifts to bottom
    - Hierarchy propagation: tap daily leaf → weekly/monthly parent progress updates
    - Admin panel flow: enter todo → generate → edit → publish → tasks appear in game
    - Clarification flow: ambiguous todo → LLM asks questions → user answers → tasks generated
    - Task expiry: create expiring task, verify missed badge and new instance
    - Drag reorder: drag task to new position, verify persistence after page reload
    - Level-up: complete enough tasks to level up, verify overlay triggers
   - Test database: dedicated Supabase test database. Use `DATABASE_URL` and `DIRECT_URL` from `.env.test.local` (never committed). For pure XP math tests, no database needed. For Server Action and Prisma tests, run against Postgres (Supabase test project) to match production
- **Out of Scope:** Unit tests for individual React components, 100% code coverage, performance testing
- **Instructions:**
  1. Configure Vitest: install `vitest @vitejs/plugin-react`. Create `vitest.config.ts`
  2. For integration tests: use a test Supabase database. Create `prisma/.env.test` with test DB URL. Seed before tests, clean after
  3. Write XP math tests first (pure functions, no DB needed) — fastest to write and run
  4. Write server action integration tests with actual Prisma + test DB
  5. Configure Playwright: `npx create-playwright`. Create `playwright.config.ts` with `baseURL: http://localhost:3000`
  6. Write E2E tests for critical flows. Use Playwright fixtures for seeding test data
  7. Add `test` and `test:e2e` scripts to `package.json`
- **Acceptance Criteria:**
  - `npm run test` passes all integration tests
  - `npx playwright test` passes all E2E tests
  - Core flows verified: progress, hierarchy, XP, generate, publish, expiry
- **Cautionary Points:**
  - Test DB isolation: each test suite should seed its own data, not depend on global state
  - Playwright + Next.js: use `dev` server, not `build` + `start`, for E2E. Or use `next start` for CI-like testing
  - Server action testing: call actions directly (they're async functions), not through HTTP. Mock `revalidatePath` if needed
  - LLM mocking: mock `generateObject` to return predictable test data. Never call real LLM in tests
  - `.env.test.local` for test DB URL, not committed
- **Testing Suggestions:**
  - Key Vitest test: `incrementProgress` on daily leaf past leaf.max_count → leaf counter exceeds max, parent max_count auto-grows, parent completion bonus fires once at planned threshold, no duplicate bonus on over-delivery
  - Key Vitest test: `incrementProgress` on leaf when root is already at hard cap → returns `{ locked: true }`, counter unchanged, no XPTransaction
  - Key Vitest test: `incrementProgress` on standalone task at max_count → returns `{ locked: true }` (standalone = root = hard cap)
  - Key Vitest test: `decrementProgress` after `incrementProgress` → counter reversed, negative XPTransaction created with reason "undo", parent completion un-set if sum drops below max
  - Key E2E test: complete admin-to-game flow end-to-end with seeded dummy LLM response

---

### Sub-Task 10: Deployment to Vercel

- **Status:** Pending
- **Objective:** Deploy to Vercel with Supabase production database, configure env vars, run migrations on production, verify full functionality.
- **Related Requirements:** R9
- **Dependencies:** Sub-Task 1-9 (all features complete)
- **In Scope:**
  - Create Vercel project (linked to GitHub repo)
   - Set Vercel env vars: `DATABASE_URL` (pooled/production Supabase), `DIRECT_URL` (session/direct Supabase for migrations), `OPENROUTER_API_KEY`, `ADMIN_PASSWORD`
  - Push `gamified.config.json` with production model choice
  - Run `npx prisma migrate deploy` against production Supabase
  - Deploy to Vercel preview (staging) → verify → promote to production
  - Verify: LLM generation works, tasks persist, cookies/session not needed
- **Out of Scope:** Custom domain, CI/CD beyond Vercel git integration, uptime monitoring, analytics
- **Instructions:**
  1. Create Supabase project (if not already): get production `DATABASE_URL`
   2. Run `npx prisma migrate deploy` with production DIRECT_URL (direct connection string) — this ensures migrations apply via session mode while runtime uses pooled DATABASE_URL
  3. Install Vercel CLI: `npm i -g vercel`
  4. Run `vercel` → link to project → configure env vars in dashboard
  5. Deploy: `vercel --prod`
  6. Smoke test: navigate to Vercel URL, verify app loads, create test task via admin, verify it appears in game view
   7. Verify LLM generation works (ensure `OPENROUTER_API_KEY` is set)
  8. Test on mobile device
- **Acceptance Criteria:**
  - App accessible at `*.vercel.app` URL
  - Tasks persist across deploys (database is external)
  - LLM generation works with production API key
  - All features functional in production
- **Cautionary Points:**
   - Prisma migration in Vercel build: run `npx prisma migrate deploy` with `DIRECT_URL` env var as a manual pre-deploy step, NOT in `postinstall`/`build` (avoids unexpected migrations during deploys). For production, migrate manually before first deploy, then only when schema changes
   - `DATABASE_URL` for Supabase: pooled (port 6543 or Supavisor) for Vercel runtime. `DIRECT_URL` (port 5432, session mode) for migrations. Both set in Vercel env vars. `DIRECT_URL` is only used by `prisma migrate deploy`
  - Cold starts: Prisma can be slow on Vercel serverless. Consider Prisma Accelerate or use Supabase direct with `@supabase/supabase-js` for queries (v2 optimization)
  - Preview deployments share env vars but use separate databases — set `DATABASE_URL` per environment if needed
- **Validation:** Full end-to-end checklist run on production URL

---

## Final Integration & Verification

- **System-Wide Test (manual):**
  1. Generate tasks via admin: "Read The Pragmatic Programmer (24 chapters)" → verify longterm root created with 24 chapters unit
  2. Allocate counters: monthly gets 12, weekly gets 3 per week, daily gets 1
  3. Publish → verify tasks appear in all four tabs
   4. Tap daily task → verify counter becomes 1/1 → task greys out, shifts to bottom. Tap same task again → counter becomes 2/1 (+1) overflow → parent weekly absorbs to 2/3 (max grows from 3 to 4 if needed)
   5. Verify soft-cap overflow on leaf, parent auto-growth, parent completion bonus fires once at planned threshold
   6. Continue tapping until longterm root reaches 24/24 (hard cap) → verify all future taps on any child in this tree return `{ locked: true }`, root children grey out and lock
   7. Verify XP: daily taps award leaf XP. When parent reaches planned max_count, one-time parent completion bonus fires. Over-delivery taps award leaf XP only (no duplicate bonus)
   8. Complete enough to level up → verify level-up overlay triggers
  9. Create standalone recurring daily "Drink 8 glasses" → tap 8 times → task completes → new instance appears tomorrow
  10. Let recurring task expire incomplete → verify "missed" badge, new instance for next day

- **Completion Checklist:**
  - [ ] All four tabs render with correct task filtering
  - [ ] Task hierarchy progress propagates correctly
  - [ ] Unit consistency enforced (children sum = parent total)
  - [ ] Tap-to-increment + undo works
  - [ ] Tier-scaled XP awarded, level-up sequence plays
  - [ ] Completed tasks grey out, sink to bottom
  - [ ] Drag reorder persists across reloads
  - [ ] Admin panel generates, handles clarifications, allows counter allocation, publishes tasks
  - [ ] LLM config honors `gamified.config.json` (provider + model)
  - [ ] Recurring tasks expire and regenerate correctly, hierarchical tasks are one-shot
  - [ ] Mobile-responsive on all breakpoints
  - [ ] Loading, error, and empty states render correctly
  - [ ] Deployed to Vercel, fully functional
  - [ ] Tests pass (Vitest integration + Playwright E2E)

## Open Questions

None — all design branches resolved during grilling session.
