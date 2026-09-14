# Architecture decisions

Architecture decision records explain choices that are still relevant to how
cueq is built and operated.

| Record                                        | Decision                                               | Status   |
| --------------------------------------------- | ------------------------------------------------------ | -------- |
| [ADR-002](002-deployment-strategy.md)         | Keep production deployment outside this repository     | Accepted |
| [ADR-005](005-modular-monolith-boundaries.md) | Keep explicit feature and workspace package boundaries | Accepted |

Use [the ADR template](000-template.md) for a new decision. Package versions and
the current source inventory belong in manifests and architecture documentation,
where contributors can verify them directly.
