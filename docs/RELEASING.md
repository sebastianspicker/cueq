# Public Alpha Release Process

cueq publishes source evaluation snapshots, not npm packages, container images,
hosted services, production deployments, or compliance certifications.

## Release identity

- Public source tags use `vMAJOR.MINOR.PATCH-alpha.N`.
- The first planned public tag is `v0.1.0-alpha.1`.
- The GitHub Release must be marked as a prerelease.
- The Git tag and GitHub Release are the public identity. Workspace packages
  remain private and are not published from this repository.
- CI validates source-alpha tag names directly against the required pattern.
- A release is immutable evidence for one commit. Do not describe results from
  another working tree, branch, or later local run as release evidence.

## Candidate checklist

Complete every applicable item on the exact candidate commit:

1. Confirm the worktree contains only the intended release changes and no
   credentials, real personal data, local tool state, analyzer output, dumps,
   exports, or local working files.
2. Regenerate and commit a lockfile that matches `package.json`,
   `pnpm-workspace.yaml`, all workspace manifests, catalogs, and overrides.
   Verify a fresh `pnpm install --frozen-lockfile`.
3. Run `make generate`, `make openapi-check`, `make schemas`, and
   `make docs-check`; review every generated diff.
4. Run `make quick`, `make knip`, and `make build`.
5. With disposable PostgreSQL available, run `make check`.
6. Review all six static images listed in the
   [screenshot contract](assets/screenshots/README.md) for synthetic-only data,
   role visibility, German labels, clipping, error states, and stale content.
7. Review `README.md`, `CHANGELOG.md`, `RELEASE_STATUS.md`, `SECURITY.md`,
   `SUPPORT.md`, and `docs/ALPHA.md` as a first-time evaluator.
8. Confirm Dependency Review on the pull-request candidate and CI/CodeQL on the
   final release commit. If that commit differs, treat it as a new candidate and
   rerun every applicable gate.

Any unavailable or failing gate keeps the candidate in draft status. Record the
exact command, failure, and environment boundary in `RELEASE_STATUS.md`; do not
convert partial evidence into a pass.

## Release notes

Move the intended entries out of `Unreleased` only when the tag is approved.
The release notes must:

- lead with the synthetic-data, local-evaluation boundary;
- summarize user-visible capability families without claiming deployment,
  legal, privacy, security, accessibility, or works-council approval;
- list the exact tag and commit;
- name all unavailable service-backed or browser gates;
- link the release status, alpha guide, security policy, and changelog; and
- state that no npm package, image, hosted service, or production support is
  included.

## Publication sequence

After explicit maintainer approval:

1. Create the release commit.
2. Push the approved branch and wait for required checks.
3. Create the annotated `v0.1.0-alpha.N` tag on that verified commit.
4. Push the tag and wait for tag-triggered CI and CodeQL.
5. Create a GitHub prerelease using the reviewed changelog text.
6. Verify the rendered README links, screenshot assets, release notes, and
   downloadable source archives from a signed-out browser.

Do not commit, push, tag, or create a GitHub Release as part of preparation
unless the maintainer explicitly authorizes that publication action.
