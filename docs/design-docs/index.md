# Design Documents — Index

> Design documents capture the _why_ behind cueq's architecture and implementation choices. For the overall architecture, see [`ARCHITECTURE.md`](../../ARCHITECTURE.md).

---

## Core Documents

| Document                        | Description                                                        |
| ------------------------------- | ------------------------------------------------------------------ |
| [Core Beliefs](core-beliefs.md) | Design principles, domain glossary, and non-negotiable constraints |

Governance minutes, reviewer identities, internal ticket references, and
works-council decisions belong in the institution's private records system.
Public product specs document the required controls without publishing private
governance evidence.

## Architecture Decision Records (ADRs)

ADRs are stored in [`docs/design-decisions/`](../design-decisions/) and follow a numbered template. See the [ADR template](../design-decisions/000-template.md) for the format.

---

## How to Add a Design Document

1. Create a new `.md` file in this directory.
2. Add it to the table above.
3. Follow the [core beliefs](core-beliefs.md) naming and terminology conventions.
4. Submit it as a focused documentation change and run `make docs-check`.
