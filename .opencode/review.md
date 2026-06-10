# Code Review Summary

**Scope**: `.opencode/plan.md` for gamified task tracker implementation plan
**Overall risk**: Low (all findings resolved)
**Verdict**: Approve

## Resolution Status

All 11 findings from the original review have been addressed in `plan.md`:

### [P1] High — RESOLVED

- **Public Vercel deployment access control** → RESOLVED: Added `ADMIN_PASSWORD` env var, `src/middleware.ts` for `/admin` route protection, defense-in-depth validation in mutation Server Actions. Game view (`/`) remains public-readable.

- **LLM schema child-counter contradiction** → RESOLVED: Changed `max_count` from `.positive()` to `.nonnegative()` with comment documenting that `0` is valid for unallocated child tasks. Added publish-time validation ensures all published tasks have positive allocated counters.

- **Tier-scaled parent XP undefined** → RESOLVED: Defined clear XP award rules: leaf increments award leaf XP only. When parent's Σ(children.current_count) reaches max_count for the first time, a one-time parent completion bonus (parent.xp_per_unit × parent.max_count × tier_multiplier) is awarded, guarded by application-level check on `(source_task_id, reason: "parent_completion")`.

- **Undo flow incomplete** → RESOLVED: `decrementProgress` now accepts `undoToken` parameter, validates server-side 3-minute window, writes negative `XPTransaction` with reason "undo" and linked_transaction_id, recalculates parent chain, and unsets parent completion when sum drops below max.

- **Recurring task regeneration contradiction** → RESOLVED: Removed "immediate regeneration" rule. Completed recurring tasks stay `completed` until period boundary passes. Added `recurrence_group_id`, `period_start`, `period_end` fields with unique constraint for idempotency.

### [P2] Medium — RESOLVED

- **Publish validation root-only** → RESOLVED: `publishTasks` now does recursive validation at every parent-child boundary with specific error reporting (which parent/child failed, what the imbalance is).

- **Supabase/Prisma connection URL split** → RESOLVED: Added `DIRECT_URL` env var. Prisma datasource uses `url = env("DATABASE_URL")` + `directUrl = env("DIRECT_URL")`. Migrations run with `DIRECT_URL` (session mode), runtime uses `DATABASE_URL` (pooled).

- **Recurrence schema underspecified** → RESOLVED: Added `recurrence_group_id`, `period_start`, `period_end` to Task model with unique constraint on `(recurrence_group_id, period_start)`.

- **Testing plan SQLite vs Postgres** → RESOLVED: Removed SQLite mention. Integration tests use dedicated Supabase test database with separate `.env.test.local`. Pure XP math tests remain DB-free.

### [P3] Low — RESOLVED

- **Provider switching scope** → RESOLVED: Limited MVP to OpenAI only. Config `provider` field documented as reserved for future expansion. Provider switching instructions deferred to future work.

- **Progress propagation contradiction** → RESOLVED: Removed "parent children may not all be individually complete" line. Under sum enforcement (Σ(children.max_count) == parent.max_count), all children must be individually complete when parent completes.

## Suggested Next Steps

- [x] All review findings implemented in plan.md
- [ ] Execute Sub-Task 1 (project scaffold)
