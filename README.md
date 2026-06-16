# gamified_habit_tracker

Quest-board habit tracker. Converts raw to-do lists into structured, gamified task hierarchies via LLM. Counter-based progress with XP and leveling.

## Features

- **Quest-board UI** — daily, weekly, monthly, long-term tabs. Tap-to-increment counters. Drag-to-reorder. Undo toast.
- **LLM-powered task generation** — paste a raw list; AI decomposes it into counter-based objectives with units and counts. Draft → publish flow with admin panel.
- **Strict hierarchy** — longterm → monthly → weekly → daily. Child progress propagates one-way to parent. Standalone tasks with optional recurrence.
- **Soft cap + hard root** — leaf/branch counters can exceed planned count (overflow indicator). Root/standalone tasks hard-cap and lock when complete.
- **Tier-scaled XP + leveling** — daily < weekly < monthly < longterm multipliers. Parent completion bonus. Exponential level thresholds (`100 × 1.5^(N-1)`).
- **Recurrence** — standalone tasks regenerate at period boundaries. Recurrence group id + period range for idempotency.

## Tech Stack

- **Next.js 15** (App Router), TypeScript, Tailwind CSS v4, Framer Motion
- **Supabase PostgreSQL** + Prisma ORM
- **Vercel AI SDK** (`generateObject`) + Zod for LLM calls
- **Vitest** (integration), **Playwright** (E2E)
- **Sonner** (toasts)

## Setup

### Prerequisites

- Node.js 20+
- npm
- Supabase project (PostgreSQL)
- OpenRouter API key

### Environment

Create `.env.local`:

```env
DATABASE_URL="postgresql://user:pass@host:6543/db?pgbouncer=true"
DIRECT_URL="postgresql://user:pass@host:5432/db"
OPENROUTER_API_KEY="sk-or-v1-..."
ADMIN_PASSWORD="your-admin-password"
```

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Pooled connection (Supavisor / PgBouncer) for normal operations |
| `DIRECT_URL` | Direct connection for Prisma migrations (`prisma migrate deploy`) |
| `OPENROUTER_API_KEY` | API key for OpenRouter (model gateway) |
| `ADMIN_PASSWORD` | Password to access `/admin` routes and mutation Server Actions |

### Install and Run

```bash
npm install
npx prisma migrate deploy
npx prisma generate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the game board, [http://localhost:3000/admin](http://localhost:3000/admin) for the admin panel.

## Project Structure

```
src/
├── app/                    # App Router pages
│   ├── page.tsx            # Game board (/)
│   ├── layout.tsx          # Root layout + providers
│   └── admin/              # Admin panel (/admin)
├── components/             # React components (TaskCard, QuestBoard, HUD, etc.)
├── lib/                    # Prisma client, XP math, LLM client, utils
├── actions/                # Server Actions (incrementProgress, decrementProgress, etc.)
└── middleware.ts            # Admin password protection
```

## License

MIT
