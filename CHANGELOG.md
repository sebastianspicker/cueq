# Changelog

All notable public changes will be recorded here. cueq has no versioned release
or published package yet; do not interpret the `Unreleased` section as a tag or
immutable release identity.

## Unreleased

### Added

- Source-only alpha evaluation, roadmap, quality-gate, support, conduct, and
  release-status documentation.
- A static GitHub Pages walkthrough built from six reviewed screenshots that
  contain synthetic data.
- GitHub dependency-update and generated-release-note configuration.
- A documented source-alpha release process with tag identity, evidence gates,
  privacy review, screenshot manifest, and explicit publication approval.
- Modular-monolith boundary enforcement for workspace dependencies, API public
  surfaces, feature-module cycles, and cross-feature aggregate writes.

### Changed

- The historical `shared`, `core`, `common`, and `phase2` layout is replaced by
  contracts, policy, pure domain, database, platform, and capability-owned API
  modules.
- Roster staffing now has one authority: `ShiftAssignment`. The deprecated
  `Shift.personId` storage and response field is backfilled and removed by a
  forward migration.
- Dependency overrides now live in the workspace configuration consumed by pnpm,
  and the lockfile is synchronized with the declared toolchain.
- Docker-published services and local development servers default to loopback
  interfaces. Non-loopback development binding requires `CUEQ_DEV_HOST`.

### Fixed

- API routes now fail closed unless explicitly public, role-restricted, or
  marked for service-layer ownership/organization-unit authorization.
- Person, calendar, and roster reads now use narrower role and data boundaries;
  team leads cannot read draft roster detail.
- HR HTTP imports validate transport configuration, reject redirects, cap
  timeouts, and avoid leaking upstream network details.
- Machine integration authentication is represented in the generated OpenAPI
  contract.
- Repository commands and database helpers consistently use the pinned pnpm
  version.
- OpenAPI and schema generation now builds the API's workspace dependencies, so
  `make generate` and `make openapi-check` work without pre-existing `dist`
  directories. CI checks the committed generated artifacts after generation.
- Local development now loads the repository `.env` deterministically, while
  production startup remains fail-closed.
- Team-calendar authorization excludes Admin, and service-level mapping redacts
  absence reasons for roles outside Team Lead and HR.
- The static walkthrough reflects the current dashboard, absence, roster, and
  workflow surfaces.
- Approval detail identifiers wrap within their grid instead of overlapping
  adjacent labels.
- NestJS 11.1.18, `next-intl` 4.9.2, Vitest 3.2.6, Turbo 2.9.14, and compatible
  transitive overrides close the advisories reported by the package-manager
  audit.

Current boundaries and local evidence are recorded in
[RELEASE_STATUS.md](RELEASE_STATUS.md). Planned work is described in the
[roadmap](docs/ROADMAP.md). Commit history uses
[Conventional Commits](https://www.conventionalcommits.org/).
