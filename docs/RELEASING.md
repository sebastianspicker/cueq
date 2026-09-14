# Publishing an alpha release

A cueq release is a snapshot of the source tree. The project does not publish
npm packages, application images, a hosted cueq instance, or production support.

## Choose the candidate

Designate one commit and run every release check against that commit. Alpha tags
use `vMAJOR.MINOR.PATCH-alpha.N` without leading zeroes; CI validates the name
with `scripts/validate-release-tag.mjs`. Workspace packages remain private at
version `0.0.0`.

Before publishing, confirm that the candidate contains only the intended source,
configuration, migrations, contracts, assets, and documentation. Seeds,
screenshots, examples, and the Pages demo must use synthetic data. Credentials,
database dumps, exports, production logs, personal data, and local tool state do
not belong in the release.

## Verify the candidate

Use Node.js 22.13 or later and pnpm 11.24.0, then complete these checks:

1. Install with `./scripts/pnpm.sh install --frozen-lockfile`.
2. Run `make generate` and review the generated diff. The committed OpenAPI,
   database documentation, and schema-derived TypeScript must be current.
3. Run `make docs-check`, `make schemas`, `make openapi-check`, `make quick`,
   `make knip`, and `make build`.
4. Against a migrated, disposable PostgreSQL database, run `make check`.
5. Build and verify the static demo:

   ```bash
   node scripts/build-pages-demo.mjs
   node scripts/verify-pages-demo.mjs
   ```

6. Review the demo and screenshots for synthetic data, accurate roles, German
   copy, clipping, stale content, and a clear statement that the demo has no API.
7. Read `README.md`, `CHANGELOG.md`, `RELEASE_STATUS.md`, `SECURITY.md`,
   `SUPPORT.md`, and `docs/DEVELOPMENT.md` as a first-time evaluator.
8. Confirm CI, Dependency Review, CodeQL, and Pages on the same commit.

A failure or unavailable check leaves the release as a draft. Record the commit,
date, environment, commands, and results in `RELEASE_STATUS.md`. Any change to
the commit creates a new candidate and requires fresh hosted results.

## Write the release notes

Move entries out of `Unreleased` only when the release is approved. Release
notes should identify the tag and commit, summarize changes visible to users,
and link to the release status, changelog, development guide, and security
policy. State plainly that the release is for local evaluation with synthetic
data and includes no package, image, hosted application, or production support.
List checks that could not be run.

Avoid claims of deployment readiness or legal, privacy, security, accessibility,
employee-representation, payroll-provider, or operational approval. Those
decisions depend on the target organization and deployment.

## Publish

Publication requires explicit maintainer approval. Once approved:

1. Create the release commit.
2. Push the approved branch and wait for its required checks.
3. Create an annotated alpha tag on that verified commit and push it.
4. Wait for tag-triggered CI and CodeQL.
5. Create a GitHub prerelease from the reviewed changelog text.
6. From a signed-out browser, verify the rendered documentation, Pages demo,
   release notes, and source archives.

Preparing or verifying a candidate does not itself authorize a commit, push,
tag, GitHub release, or deployment.
