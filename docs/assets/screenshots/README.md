# Alpha screenshots

The images under `alpha/` come from deterministic synthetic frontend fixtures.
They document the evaluation interface only. They are not evidence of API,
database, migration, identity-provider, or production behavior.

## Required set

The directory must contain exactly:

| File               | Surface           | Evaluation role |
| ------------------ | ----------------- | --------------- |
| `01-dashboard.png` | Dashboard         | Employee        |
| `02-leave.png`     | Leave balance     | Employee        |
| `03-roster.png`    | Roster            | Shift planner   |
| `04-approvals.png` | Approval inbox    | Team lead       |
| `05-closing.png`   | Monthly closing   | HR              |
| `06-reports.png`   | Aggregate reports | HR              |

## Fixture-backed capture

Run from the repository root:

```bash
make demo-screenshots
```

The command:

1. builds the Next.js application;
2. runs the fixture-backed Playwright configuration;
3. checks for the exact six filenames under
   `apps/web/test-results/demo-screenshots/latest/`; and
4. replaces the tracked files only after the complete set passes.

This lane verifies browser rendering and selected read interactions against a
request whitelist. It does not start PostgreSQL or the API.

## Database-backed capture

Run:

```bash
docker compose up -d postgres
pnpm --filter @cueq/web test:demo-screenshots:database
```

This lane starts the built web and API applications against an isolated
`web_demo_screenshots` schema. It uses the synthetic database seed and writes
results under `apps/web/test-results/demo-screenshots/database/`.

It uses `prisma db push`, so it does not verify committed migration deployment.
It does not replace the tracked screenshots.

## Publication review

Before publishing a capture:

- confirm every visible person, identifier, date, organization, and value is
  synthetic;
- verify that the role label, navigation, and visible data match the intended
  role;
- inspect headings, controls, tables, badges, and empty or error states at the
  documented viewport;
- reject browser overlays, console errors, clipping, horizontal overflow, and
  unfinished loading states;
- confirm that the fixture request whitelist recorded no unexpected request;
- run the relevant accessibility checks; and
- run `make docs-check`.

Record browser versions, viewport, command results, and review date with the
release candidate evidence. Do not treat results from another revision as
current.
