# Code Review Summary

**Scope**: Sub-Task 1 — Project Scaffold & Design Tokens (QuestBoard gamified habit tracker)
**Overall risk**: Low
**Verdict**: Approve with comments

---

## Per-File Pass/Fail

| # | File | Verdict | Issues |
|---|------|---------|--------|
| 1 | `src/app/globals.css` | **PASS** | Letter-spacing values from DESIGN.md not embedded (P2) |
| 2 | `src/app/layout.tsx` | **PASS** | None |
| 3 | `gamified.config.json` | **PASS** | None |
| 4 | `src/types/config.ts` | **PASS** | None |
| 5 | `src/lib/config.ts` | **PASS** | Sync fs blocks event loop (P3) |
| 6 | `src/middleware.ts` | **PASS** | Colon-in-password parsing (P3); Buffer in Edge (P3) |
| 7 | `.env.local.example` | **PASS** | None |
| 8 | `package.json` | **PASS** | None |

---

## Findings

### [P2] Medium

#### 1. Typography tokens omit letter-spacing — DESIGN.md tracking values lost
- **Location**: `src/app/globals.css:43-56`
- **Why it matters**: DESIGN.md defines aggressive negative tracking as core brand voice: `display-xl` at -2.4px, `display-lg` at -1.28px, `display-md` at -0.96px, `display-sm` at -0.6px, `body-sm`/`body-sm-strong` at -0.28px. The CSS `font` shorthand cannot carry letter-spacing — it only accepts `[font-style] [font-variant] [font-weight] [font-stretch] font-size/line-height font-family`. Consumers of `--font-display-xl` will get correct size/weight/line-height but zero tracking, which DESIGN.md explicitly warns "breaks the brand."
- **Evidence**: `globals.css:43` defines `--font-display-xl: 600 48px/48px var(--font-geist-sans)` — no tracking. DESIGN.md:446-464 specifies tracking for all display sizes and `body-sm` variants.
- **Fix**: Either add companion custom properties (e.g., `--tracking-display-xl: -0.05em`) that consumers can reference, or document in a token readme that letter-spacing must be applied via Tailwind utilities (`tracking-*`) separately.

### [P3] Low

#### 2. Boilerplate page.tsx carries inert `dark:` Tailwind variants
- **Location**: `src/app/page.tsx:8,18,37,45`
- **Why it matters**: The project is light-mode only MVP — no `dark` class is ever applied to `<html>`. These `dark:*` utilities are dead code. They may confuse future devs into thinking dark mode support exists.
- **Fix**: Remove `dark:invert`, `dark:bg-white/[.06]`, `dark:hover:bg-[#ccc]`, `dark:border-white/[.145]`, `dark:hover:bg-[#1a1a1a]` from the boilerplate. (Full page.tsx replacement is out of scope for Sub-Task 1 anyway.)

#### 3. Basic Auth parsing breaks on passwords containing colons
- **Location**: `src/middleware.ts:34`
- **Why it matters**: `credentials.split(":")[1]` splits on ALL colons but only takes the second element (`[1]`). If `ADMIN_PASSWORD=abc:def:ghi`, only `def` is captured. A legitimate password with embedded colons would silently fail authentication.
- **Evidence**: Line 34: `providedPassword = credentials.split(":")[1] || "";` — `"user:abc:def".split(":")` = `["user","abc","def"]`; `[1]` = `"abc"` (missing `":def"`).
- **Fix**: Use `credentials.slice(credentials.indexOf(":") + 1)` to capture everything after the first colon.

#### 4. `Buffer.from` in Edge middleware — non-standard Web API
- **Location**: `src/middleware.ts:33`
- **Why it matters**: Next.js middleware runs on Edge runtime. `Buffer` is polyfilled by Next.js and works, but `atob()` is the standard Web API for base64 decoding in Edge/serverless contexts. If this code is ever ported to another Edge platform (Cloudflare Workers, Deno Deploy), `Buffer` will not exist.
- **Fix**: Replace `Buffer.from(base64Credentials, "base64").toString("utf-8")` with `atob(base64Credentials)`. Not blocking for MVP — Next.js polyfill covers this.

#### 5. Synchronous `fs.readFileSync` in config loader
- **Location**: `src/lib/config.ts:11`
- **Why it matters**: Blocks the Node.js event loop on first config read (subsequent reads hit cache). If this module is ever imported in a request handler or Edge runtime path, it will cause problems. For MVP startup-only usage, this is fine — the file is only read once at import time.
- **Fix**: Consider wrapping in an async function with `fs.promises.readFile` if this module is expected to be used in request-path code. Low priority.

---

## Checklist Verification

| Criterion | Status |
|-----------|--------|
| DESIGN.md color tokens correctly mapped to CSS custom properties | ✓ All 36 colors match |
| DESIGN.md typography tokens mapped (size/weight/line-height/family) | ✓ All values match |
| DESIGN.md spacing tokens mapped | ✓ All 12 spacing tokens match |
| DESIGN.md radius tokens mapped | ✓ All 9 radius tokens match |
| DESIGN.md shadow tokens mapped | ✓ All 5 shadow levels match (L1-L5) |
| No dark mode (light only for MVP) | ✓ No `@media (prefers-color-scheme: dark)` or `.dark` rules |
| Geist fonts via `next/font/google` (not CDN) | ✓ Both Geist and Geist_Mono imported from `next/font/google` |
| `sonner` Toaster in layout | ✓ `<Toaster />` rendered in RootLayout body |
| `gamified.config.json` matches `AppConfigSchema` | ✓ All fields validate against zod schema |
| Middleware protects `/admin` without blocking `/`, `/api`, static assets | ✓ Matcher excludes api/_next/image/_next/static/favicon; `/` passes through with `NextResponse.next()` |
| Basic auth (base64) and Bearer token both supported | ✓ Both branches implemented |
| `.env.local.example` has all required vars | ✓ DATABASE_URL, DIRECT_URL, LLM_API_KEY, ADMIN_PASSWORD |
| `package.json` has all required deps | ✓ prisma, framer-motion, ai, zod, sonner, lucide-react, @ai-sdk/openai, @supabase/supabase-js, tailwindcss v4 |
| No UI components, no DB schema, no server actions | ✓ All scope-compliant — only scaffold files |
| Build passes (per executor) | ✓ Verified |

---

## Suggested Next Steps

- [ ] Add letter-spacing companion tokens (or docs note) — P2
- [ ] Fix colon-in-password Basic Auth parsing — P3
- [ ] Remove inert `dark:` utilities from boilerplate page.tsx — P3
- [ ] (Optional) Replace `Buffer.from` with `atob()` in middleware for portability — P3
- [ ] (Optional) Add unit test for middleware auth parsing edge cases (colon in password, empty password, missing header)
