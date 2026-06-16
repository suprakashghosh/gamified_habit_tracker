# Code Review Summary

**Scope**: Sub-Task 8 — Mobile-Responsive Layout & Polish for QuestBoard
**Overall risk**: Medium
**Verdict**: Request changes

## Findings

### [P1] High

- **Active task grid does not follow the required responsive breakpoints**
  - **Location**: `src/components/QuestBoard.tsx:250-310`
  - **Why it matters**: The plan requires active tasks to be 1-column on mobile, 2-column on tablet, and 3-column on desktop; completed tasks should be a single column at the bottom. The current implementation renders every task as a single full-width column at all breakpoints (`flex flex-col gap-2`), so tablet/desktop real estate is wasted and the UI diverges from the acceptance criteria.
  - **Evidence**: `Reorder.Group` and the completed/missed containers all use `flex flex-col gap-2` with no `md:grid-cols-2 lg:grid-cols-3` breakpoints.
  - **Fix**: Convert active-task containers to a responsive grid and keep completed/missed tasks in a single column. Preserve drag-to-reorder behavior inside the grid, or switch between grid and list layouts per breakpoint.

### [P2] Medium

- **Loading skeleton shape does not mimic the dense horizontal task card**
  - **Location**: `src/components/LoadingSkeleton.tsx:5-16`
  - **Why it matters**: The plan states skeletons should mimic the task card shape. `TaskCard` is a dense horizontal rectangle with an icon square, title row, and embedded progress bar, while `LoadingSkeleton` renders 1–3 vertical cards with a large title block and two lines.
  - **Evidence**: Skeleton uses `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` and three stacked divs of varying widths; it does not include a square placeholder, counter placeholder, or horizontal progress bar placeholder.
  - **Fix**: Redesign `LoadingSkeleton` to render full-width horizontal placeholders matching `TaskCard`'s three rows (icon square + title/counter + progress bar), and keep the responsive grid only where active tasks will actually use it.

- **Admin table inputs remove focus outlines**
  - **Location**: `src/components/admin/TaskTable.tsx:128, 137, 146, 153, 169, 179, 188, 221, etc.`
  - **Why it matters**: The sub-task requires focus-visible rings and no `outline: none`. All admin inputs/selects use `outline-none` and rely solely on a border-color change, which can be hard to see and fails the stated accessibility rule.
  - **Evidence**: Every editable field uses `className="... outline-none focus:border-[--color-link] ..."`.
  - **Fix**: Keep the border change but add the shared `focus-ring` class (or an equivalent `focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2`) to every interactive control. Remove `outline-none` so the native outline remains as a fallback.

### [P3] Low

- **Task card aria-label does not match the requested pattern**
  - **Location**: `src/components/TaskCard.tsx:148`
  - **Why it matters**: The plan explicitly asks for aria-labels like "Increment [task name] counter". The current label only describes the title and count, so screen-reader users do not know the card is actionable.
  - **Evidence**: `aria-label={`${optimisticTask.title}: ${optimisticTask.current_count} of ${optimisticTask.max_count}`}`.
  - **Fix**: Change to `aria-label={`Increment ${optimisticTask.title} counter`}` or similar actionable text.

- **Tab selection uses page semantics instead of tab semantics**
  - **Location**: `src/components/MobileTabBar.tsx:21-45`, `src/components/QuestBoard.tsx:185-203`, `src/components/QuestBoard.tsx:213-230`
  - **Why it matters**: `aria-current="page"` is intended for navigation links, not tab controls. The tab bars would be more accessible as a `tablist` with `role="tab"`, `aria-selected`, and an associated `tabpanel`.
  - **Evidence**: `aria-current={activeTab === key ? "page" : undefined}` on buttons inside a `nav`.
  - **Fix**: Add `role="tablist"` to the nav container, `role="tab"` and `aria-selected` to each button, and `role="tabpanel"` to the task grid.

- **Error retry uses `reset` instead of `router.refresh()`**
  - **Location**: `src/app/error.tsx:25-30`
  - **Why it matters**: The plan specifies a retry button calling `router.refresh()`. `reset` only re-renders the error boundary segment; a transient server failure may require a full route refresh to recover.
  - **Evidence**: `<button onClick={reset}>Try again</button>`.
  - **Fix**: Import `useRouter` and call `router.refresh()` in the retry handler, or call `refresh()` then `reset()`.

- **Empty-state copy does not match the requested "No quests for today"**
  - **Location**: `src/components/QuestBoard.tsx:244-248`
  - **Why it matters**: The plan specifies the empty-state title "No quests for today". The current title is generic ("No quests yet"), which is less contextually helpful.
  - **Evidence**: `<EmptyState title="No quests yet" ...>`.
  - **Fix**: Pass `title="No quests for today"`.

## Positives

- Dark sci-fi game theme is applied via `dark-game` on the game routes, while admin loading/error remain light-themed.
- `TaskCard` implements dense horizontal cards with embedded progress bars and tier icon squares.
- Desktop sidebar contains `XPHUD` and category pills; mobile uses the bottom `MobileTabBar` and hides the sidebar.
- `loading.tsx`, `error.tsx`, and `not-found.tsx` exist in both `app/` and `app/admin/`.
- `EmptyState` provides icon, title, description, and optional CTA.
- Design tokens are used consistently across game UI components.
- `npx eslint .` exits 0 and `npx tsc --noEmit` / `npx next build` all pass.
- Admin table wraps the table in `overflow-x-auto`, satisfying the mobile horizontal-scroll requirement.

## Suggested Next Steps

- [ ] Fix the active-task responsive grid in `QuestBoard.tsx` before merging.
- [ ] Update `LoadingSkeleton.tsx` to match the horizontal `TaskCard` shape.
- [ ] Restore focus-visible rings on admin table inputs/selects in `TaskTable.tsx`.
- [ ] Improve tab semantics and `aria-label`s for screen-reader clarity.
- [ ] Re-run ESLint, type-check, and build after changes.
