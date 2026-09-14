# Contributing

Bug reports, documentation fixes, tests, and code contributions are welcome.
Use invented data in examples, screenshots, and test cases. Keep credentials,
real personnel records, and production logs out of issues and pull requests.

## Getting started

Follow [Development](docs/DEVELOPMENT.md) to install dependencies and start the
application. You will need Node.js 22.13 or later, Docker with Compose, GNU
Make, and OpenSSL. The repository wrapper uses pnpm 11.24.0.

An issue is a useful place to discuss a larger feature or behavior change
before implementation. Check existing issues before starting work so
others can coordinate with you.

## Making a change

Read the affected code and tests before editing. Keep each pull request focused
on one problem, and preserve unrelated changes in your checkout.

Shared packages and API features have dependency rules described in
[Architecture](ARCHITECTURE.md). When changing an API, event, or database
contract, check its callers as well as its tests. Prisma schema changes need a
migration. Change the source of generated files, then run `make generate` and
review the output.

Keep German and English interface text in sync. Update the relevant guide when
a change affects a command, configuration setting, or documented behavior.
Do not introduce telemetry or production dependencies without discussing them
with the maintainers.

## Checking your work

Run the affected tests while editing, then `make quick`. For documentation-only
changes, run `make docs-check` and Prettier on the edited files.

Other checks depend on the change:

| Change                                     | Checks                                                                                       |
| ------------------------------------------ | -------------------------------------------------------------------------------------------- |
| API, Zod, JSON Schema, or Prisma contracts | `make generate`, `make schemas`, `make openapi-check`; review generated files and migrations |
| Database or API behavior                   | `make check` against a disposable PostgreSQL database                                        |
| Build or packaging                         | `make build`                                                                                 |
| Browser behavior                           | Exercise the changed flow in the browser, including relevant error and permission states     |

Add tests for changed behavior, including invalid input and access restrictions
where relevant. [Testing](docs/TESTING.md) explains the suites and their
requirements.

## Opening a pull request

Describe the problem, what changes for the user or caller, and how you checked
it. Include screenshots for visible interface changes and explain any new
migration or configuration requirement. If you could not run a relevant
check, say which one and why.

Use a Conventional Commit subject, such as `fix: preserve booking filters` or
`docs: clarify local setup`. Add user-visible changes to
[CHANGELOG.md](CHANGELOG.md). Maintainers preparing a release should follow the
[release guide](docs/RELEASING.md).
