# Changelog

Changes listed under Unreleased are still in development. They do not describe
a published release. See [Release status](RELEASE_STATUS.md) for current
limitations and the checks required before release.

## Unreleased

### Added

- Guides for development, testing, support, conduct, and releases.
- A browser-only GitHub Pages demo for time recording, booking corrections, and
  approval decisions, with invented data and no API connection.
- A three-screen README tour and instructions for previewing the demo locally.
- GitHub configuration for dependency updates and generated release notes.
- Architecture checks for workspace dependencies, API feature imports, module
  cycles, and writes that involve more than one feature.

### Changed

- Reorganized the former `shared`, `core`, `common`, and `phase2` code into
  contracts, policy, domain, database, platform, and API feature modules.
- Roster staffing uses `ShiftAssignment`. A migration backfills assignments and
  removes the deprecated `Shift.personId` database and response field.
- Moved dependency overrides into the pnpm workspace configuration and aligned
  the lockfile with the declared toolchain.
- Local development servers and Docker ports bind to loopback by default.
  Binding development servers to another interface requires `CUEQ_DEV_HOST`.
- Replaced the Pages screenshot viewer with an interactive, responsive demo.
- Simplified the GitHub issue and pull request templates.

### Fixed

- API routes reject access unless they declare public access, allowed roles, or
  an ownership or organization check in the service.
- Person, calendar, and roster reads enforce more specific access rules. Team
  leads cannot read draft roster details.
- Team-calendar access excludes Admin. Absence reasons are omitted for roles
  other than Team Lead and HR.
- HR HTTP imports validate transport settings, reject redirects, limit timeouts,
  and keep upstream network details out of errors.
- The OpenAPI document describes authentication for machine integrations.
- Repository commands and database helpers use the pinned pnpm version.
- OpenAPI and schema generation build the API's workspace dependencies first.
  `make generate` and `make openapi-check` no longer need existing `dist`
  directories. CI checks the generated files for drift.
- Local development loads the repository `.env` consistently. Production
  startup still rejects missing required configuration.
- Approval identifiers wrap inside their columns instead of overlapping labels.
- The Pages demo handles mobile navigation, keyboard controls, reset, empty
  command searches, and zero open approvals. Time totals match the example
  bookings.
- Ignore rules cover nested database files and allow `RELEASE_STATUS.md` on
  case-insensitive filesystems. The hygiene check rejects additional private
  and generated files, including forced additions.
- `.node-version` matches the Node.js version used in CI.
- Updated NestJS to 11.1.18, `next-intl` to 4.9.2, Vitest to 3.2.6, Turbo to
  2.9.14, and transitive overrides to address reported dependency advisories.
