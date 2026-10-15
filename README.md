# RomeoVille Records

Document & Indenture Management System. Replaces an Excel-based workflow with
typed record registers, Excel import/export, role-based access control,
invitation-only accounts, Mailjet email and a full audit trail.

Built with Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4,
Drizzle ORM (MySQL/TiDB) and SheetJS.

## Features

- **Registers** — typed tables of records with user-defined columns
  (text, long text, number, date, datetime, boolean, select, multi-select,
  email, phone, URL), per-register access grants, archive/restore/duplicate.
- **Records** — searchable, sortable, filterable tables; create/edit forms
  with per-type validation; optimistic concurrency via `data_version`;
  bulk archive/restore and bulk set-field.
- **Excel import** — chunked uploads (safe on Vercel's 4.5 MB body limit),
  sheet/profile analysis, column mapping with type suggestions, append /
  match-and-update strategies, resumable batch processing with per-row error
  reporting. Dates are day-first (DD/MM/YYYY) per organisation policy.
- **Excel / CSV export** — current view, filtered or selected rows; every
  string cell is guarded against spreadsheet formula injection.
- **Authentication** — Argon2id password hashing, DB-backed sessions,
  single-use hashed tokens for invitations / activation / password reset,
  DB rate limiting. No public registration.
- **Roles** — `super_admin`, `admin`, `editor`, `viewer` with capability-based
  RBAC plus explicit per-register user/role grants.
- **Audit log** — append-only trail of every meaningful action; secrets are
  scrubbed from metadata before writing.
- **Email** — Mailjet transactional templates for invitations, activation,
  password reset and security notifications (emails degrade gracefully when
  Mailjet is not configured).

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in the values
npm run db:migrate           # apply drizzle/migrations to DATABASE_URL
npm run bootstrap            # send the first super-admin activation email
npm run dev                  # http://localhost:3000
```

`npm run bootstrap` (or `POST /api/bootstrap` with header
`x-bootstrap-secret: $BOOTSTRAP_SECRET`) emails an activation link to
`INITIAL_SUPER_ADMIN_EMAIL`. Until an active super administrator exists, the
bootstrap endpoint stays open (guarded by the secret); afterwards it refuses.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit tests (`tests/unit`) |
| `npm run test:e2e` | Playwright end-to-end (needs a running server; port 3100) |
| `npm run db:generate` | Generate SQL from `src/lib/db/schema.ts` |
| `npm run db:migrate` | Apply migrations in `drizzle/migrations` |
| `npm run bootstrap` | Trigger the initial super-admin activation email |
| `npm run verify` | typecheck + lint + test |

## Environment

See `.env.example` for the full annotated list. Required:
`DATABASE_URL`, `APP_BASE_URL`, `BOOTSTRAP_SECRET`, `INITIAL_SUPER_ADMIN_EMAIL`.
Mailjet keys are optional in development (emails are skipped/logged).
Optional: `DATABASE_SSL_CA` (path to a PEM for managed MySQL), `MAX_UPLOAD_MB`
(default 20), `MAX_IMPORT_ROWS` (default 20000).

## Deployment (Vercel + TiDB Cloud)

1. Create a TiDB Cloud Serverless cluster and copy the connection string into
   `DATABASE_URL` (port 4000, include TLS params from the console).
2. Deploy the repo to Vercel; set every key from `.env.example` in the project
   settings. `APP_BASE_URL` must be the production URL.
3. From your machine: `npm run db:migrate` against the production URL, then
   `npm run bootstrap`.
4. Import jobs are created via API routes and processed in the background with
   Next's `after()`; uploads are split into DB-backed chunks so they stay well
   under Vercel's request body limit.

## Project layout

```
src/
  app/                 Routes: (auth), (app) shell, api (bootstrap, imports, export)
  components/
    ui/                Primitives (button, dialog, table, …)
    app/               Feature components (records, imports, users, forms)
  server/              Domain services (registers, records, imports, activity, search)
    actions/           "use server" actions; shared.ts holds non-async helpers
  lib/
    auth/              Session, RBAC, guards, tokens, password hashing/policy
    db/                Drizzle client + schema (single migration source)
    excel/             Import parsing + injection-guarded export
    email/             Mailjet client + templates
    import/            Import engine (validation, batching, conversion)
drizzle/migrations/    SQL migrations (run with db:migrate)
tests/                 unit (vitest), integration (needs TEST_DATABASE_URL), e2e
```

## Testing

- `tests/unit` — pure logic (RBAC, field values, Excel guard, import engine…);
  runs without any services.
- `tests/integration` — real-database suites; skipped automatically unless
  `TEST_DATABASE_URL` is set.
- `tests/e2e` — Playwright smoke suite; start a server on port 3100 first.

## Known limitations

- Import accepts `.xlsx/.xls/.xlsm` only (no CSV uploads).
- Date parsing in imports is day-first only (organisation policy).
- Not runtime-verified against a live database/Mailjet instance in this
  environment; integration tests cover the DB paths when credentials exist.
- `npm audit` reports vulnerabilities inherited from SheetJS 0.18.5 and the
  transitive tree; review before production rollout.
