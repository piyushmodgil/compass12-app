# Compass12 — Phase 1: Architecture & Database Schema

Status: **for review** (per your "Phase 1 only" scope). Nothing beyond this has been built yet.

## Stack (matches the original spec)

- Next.js 15 (App Router) + TypeScript + Tailwind CSS 4 — scaffolded in this folder
- Prisma 7 ORM + PostgreSQL (Vercel Postgres / Neon)
- Auth.js (NextAuth) — schema is in place, wiring comes in a later phase
- Zod — installed, for input validation on every API route
- Recharts, server-side PDF — added when we reach the report/admin phases

## Database schema (`prisma/schema.prisma`)

Covers all 16 entities from the spec, plus two small additions explained below.

| Spec entity | Prisma model(s) | Notes |
|---|---|---|
| users | `User`, `Account`, `Session`, `VerificationToken` | Auth.js-standard shape |
| students | `Student` | consent timestamp required before any PII is stored |
| assessment_sessions | `AssessmentSession` | freezes `blueprintSnapshot` + `questionOrder` at start, so later question-bank edits never alter an in-flight/completed assessment; `resumeToken` + `currentQuestionIndex` power autosave/resume |
| questions | `Question` | `category` kept as a string, not an enum, so admins can add/rename categories without a migration |
| question_options | `QuestionOption` | `isNoneOption` maps to the bank's `"none": true` flag |
| answers | `Answer` | one row per (session, question), unique constraint lets re-answering just update it |
| assessment_factors | `AssessmentFactor` | the `int_tech` / `sub_math` / `ws_solo`-style dimensions; self-relation captures bipolar pairs (`ws_solo` ↔ `ws_team`, etc.) |
| factor_scores | `FactorScore` | per-session normalized 0–100 score per dimension |
| career_profiles | `CareerProfile` | the generated report body (summary, top interests, traits, strengths, areas to develop) |
| career_clusters | `CareerCluster` | the 14 clusters (Engineering & Technology, ...) |
| career_scores | `CareerScore` | per-session, per-cluster score + `alignment` label (Strong/Moderate/Explore) + rank |
| courses | `Course` | the 119 programmes |
| career_course_mapping | `CourseClusterMapping` | many-to-many — a course like B.Sc Data Science can be relevant to more than one cluster |
| reports | `Report` | PDF storage URL, share token, view/download counters |
| leads | `Lead` | counselling enquiries, with status pipeline (New → ... → Converted/Closed) |
| admin_users | `AdminUser` | role: Super Admin / Content Editor / Counsellor Admin |
| scoring_rules | `ScoringRule` | the `cluster_weights` table from `question_bank.json`, editable per cluster/factor, versioned via `configVersion` |

Two additions beyond the spec's literal list, both needed to keep the engine "configurable... without rewriting core code" (principle #9) and to support the Analytics section (#19) without duplicating data already on other tables:

- **`EngineConfig`** — a key/value table for the scoring constants in `assessment_engine.py` (`W_DIMS`, `W_CAREER`, `W_CLUSTER`, `W_KEY`, `PRIOR`, `SHRINK_K`, `NOT_PICKED`). These are currently Python constants; moving them into the DB means an admin can retune the engine without a code change.
- **`AnalyticsEvent`** — a lightweight funnel-event log (`LANDING_VIEWED`, `ASSESSMENT_STARTED`, `COURSE_VIEWED`, etc. — exactly the event list from spec section 19). Dashboard metrics that are really just counts over existing tables (completion rate, popular clusters) are computed from `AssessmentSession`/`CareerScore` directly, not duplicated here.

Two join tables carry explicit weights rather than being plain many-to-many, because the scoring engine needs them:
- `OptionFactorWeight` (option → factor, weight) — an option can nudge more than one dimension.
- `CourseKeyDimension` (course → factor, weight) — the programme-level "key dims" used in the 40% programme-fit term.

## How this maps to your existing data

`question_bank.json` (500 questions, 14 clusters, 119 programmes) and `assessment_engine.py` already contain everything needed to seed this schema — nothing needs to be re-authored:

- `questions[]` → `Question` + `QuestionOption` + `OptionFactorWeight`
- `clusters{}` / `cluster_weights{}` → `CareerCluster` + `ScoringRule`
- `dim_labels{}` → `AssessmentFactor`
- `programmes[]` → `Course` + `CourseKeyDimension` + `CourseClusterMapping`
- `modes.quick` / `modes.detailed` blueprints → frozen into `AssessmentSession.blueprintSnapshot` at session start
- the `W_DIMS` / `W_CAREER` / `PRIOR` / ... constants → seed rows in `EngineConfig`

The seed script that does this port is Phase 4 work (question/scoring engine), not this phase — flagging it now so the schema can be sanity-checked against the real data shape rather than a guess.

## Planned API surface (routes not yet created)

```
POST   /api/students                    create/find student record (registration)
POST   /api/assessment/start            create AssessmentSession, freeze blueprint + question order
GET    /api/assessment/questions        next question(s) for a session (resume-aware)
POST   /api/assessment/answer           upsert one Answer, autosave
POST   /api/assessment/submit           mark session COMPLETED, trigger scoring pipeline
GET    /api/assessment/:id/result       FactorScore + CareerScore summary
GET    /api/report/:id                  CareerProfile + report sections
GET    /api/report/:id/pdf              server-rendered PDF

GET    /api/admin/students
GET    /api/admin/assessments
POST   /api/admin/questions             PATCH /api/admin/questions/:id
POST   /api/admin/careers               PATCH /api/admin/careers/:id
POST   /api/admin/courses               PATCH /api/admin/courses/:id
```

## Folder layout (created so far)

```
compass12-app/
  prisma/schema.prisma       <- this phase's main deliverable
  src/
    lib/prisma.ts            <- Prisma client singleton (Next.js hot-reload safe)
    app/                     <- Next.js App Router (default create-next-app scaffold only, for now)
  .env.example
  ARCHITECTURE.md            <- this file
```

Routes, components, the scoring engine port, and the admin panel are not built yet — that's Phase 2 onward.

## One known limitation in this sandbox

This cloud workspace's network allowlist blocks `binaries.prisma.sh`, which Prisma needs to download its query/schema-engine binaries. That means I can't run `prisma generate`, `prisma validate`, or `prisma migrate` in here to mechanically verify the schema compiles — I've reviewed it by hand for relation/type correctness instead. This isn't a blocker: `npx prisma migrate dev` will run normally on your own machine, in CI, or as part of a Vercel deploy, all of which have normal access to Prisma's CDN. I'd suggest running `npx prisma generate` once you pull this down, just to confirm, before we build on top of it.

One consequence of this: `src/lib/prisma.ts` currently fails typecheck (`@prisma/client` has no generated `PrismaClient` export yet) because `npx prisma generate` couldn't run here. `npm run build` passes cleanly with that one file set aside — confirmed by temporarily removing it and rebuilding. Running `npx prisma generate` locally resolves it; no code change needed.

## Next steps (after you review this)

1. You provision a Postgres database from the Vercel dashboard (Storage tab → Create Database → Postgres) — I'll walk you through it, it's a couple of clicks; the MCP connection I have to your Vercel account can't provision storage directly.
2. Drop the resulting `DATABASE_URL` / `DIRECT_URL` into `.env`, run `npx prisma migrate dev --name init`.
3. Move to Phase 2 (landing page + registration) per the spec's phased build order.
