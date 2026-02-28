# Core Beliefs — cueq Design Principles


---

## 1. Correctness Over Convenience

The system deals with legally relevant data (working hours, leave quotas, payroll exports). **Incorrect calculations are worse than slow calculations.** Every arithmetic operation on time, leave, or surcharges must be:
- Backed by a reference calculation fixture
- Tested against the fixture in CI
- Versioned alongside the rule that governs it

## 2. Auditability Is Not Optional

A German university under TV-L must demonstrate compliance to the Personalrat (works council), data protection officers, and external auditors. Therefore:
- Every state change produces an **immutable audit entry** (who, what, when, why)
- Audit entries are **append-only** — no update, no delete, no truncate
- Workflow decisions (approval, rejection, delegation) are part of the audit trail
- Rule changes are versioned (which rule set was active when a calculation was performed?)

## 3. Privacy by Default

Data minimization is a legal requirement (GDPR / DSGVO) and an institutional expectation:
- **Colleagues see "absent", not "sick".** Absence reasons are role-gated.
- **Reports must not enable individual performance monitoring.** Aggregation and role checks are mandatory.
- **Retention is configurable.** Data categories have distinct deletion schedules.
- **No telemetry.** The system does not phone home, does not collect usage analytics, does not embed third-party trackers.

## 4. Configuration Over Hard-Coding

The university has diverse employee groups (TV-L admin, shifts, student assistants, lecturers, potentially civil servants) and four distinct shift domains (Pforte, IT, Hausdienst, Veranstaltungstechnik). Rules differ across groups:
- Work-time models, pause rules, surcharge rules, and leave quotas are **data, not code**
- Rule sets are assigned per employee group / organizational unit
- Changes to rules take effect from a configurable date (not retroactively by default)

## 5. Schema-Driven Contracts

Every interface boundary is defined by a machine-readable schema:
- **Domain entities** → JSON Schema
- **API endpoints** → OpenAPI 3.1
- **Events** → JSON Schema event envelopes
- **Exports** → Schema-defined column/field layouts

Types are **generated from schemas**, not hand-written. If the schema and the code disagree, the schema wins.

## 6. Offline Resilience

Honeywell terminals can go offline. The system must:
- Buffer bookings locally at the terminal or gateway
- Synchronize without data loss when connectivity returns
- Flag and resolve conflicts (duplicate bookings, out-of-order timestamps)
- Support a **manual fallback process** (emergency bookings with approval)

## 7. Small, Verifiable Changes

Complexity kills correctness. Every change to cueq must be:
- **Small** — max 400 lines per PR (excl. generated files)
- **Reviewable** — one concern per PR, conventional commit format
- **Testable** — new behavior includes new tests
- **Documented** — design decisions recorded as ADRs

---

## Domain Glossary

> Canonical German → English mappings for the cueq domain. Use these terms consistently in code, comments, schemas, and documentation.

| German Term | English Term | Definition |
|---|---|---|
| Zeiterfassung | Time tracking | Recording actual work hours |
| Buchung | Booking | A single time-recording event (start/stop) |
| Zeitart | Time type | Category of a booking (work, pause, on-call, deployment, etc.) |
| Sollzeit | Target time | Expected work hours from model/roster |
| Istzeit | Actual time | Recorded work hours from bookings |
| Gleitzeit | Flextime | Flexible working hours with core hours |
| Kernzeit | Core hours | Mandatory presence window within flextime |
| Fixzeit | Fixed time | Non-flexible scheduled hours |
| Schichtmodell | Shift model | Configuration of shift rotations and patterns |
| Dienstplan | Roster / shift plan | Published schedule assigning people to shifts |
| Mindestbesetzung | Minimum staffing | Required headcount per shift/time slot |
| Qualifikation | Qualification / skill | Role-specific capability required for a shift |
| Schichttausch | Shift swap | Exchange of assigned shifts between employees |
| Rufbereitschaft | On-call duty | Standby status; employee reachable but not at workplace |
| Einsatz | Deployment / callout | Actual work performed during on-call |
| Dienstgang | Official errand | Off-site work during work hours |
| Mehrarbeit | Overtime (ordered) | Work beyond contract hours, ordered by supervisor |
| Überstunden | Overtime (accrued) | Hours accrued beyond target in flextime |
| Zuschlag | Surcharge / premium | Additional pay/time credit for night/weekend/holiday work |
| Abwesenheit | Absence | Any time away from work (leave, sick, etc.) |
| Urlaub | Annual leave | Paid vacation days per TV-L entitlement |
| Resturlaub | Remaining leave | Unused leave days from current/prior year |
| Übertrag | Carry-over | Leave or hours transferred to next period |
| Verfall | Forfeiture / expiry | Loss of unused leave/hours after deadline |
| Sonderurlaub | Special leave | Leave for specific life events (wedding, bereavement, etc.) |
| Krankheit | Sick leave | Absence due to illness |
| eAU | Electronic sick note | Digital incapacity certificate from physician |
| Freizeitausgleich | Compensatory time off | Time off in lieu of overtime pay |
| Gleittag | Flex day | Full day off using accrued flextime balance |
| Monatsabschluss | Monthly closing | End-of-month process: review, approve, lock, export |
| Cut-off | Cut-off | Deadline after which changes require HR workflow |
| Prüfliste | Checklist | List of items requiring attention before closing |
| Korrekturfenster | Correction window | Time period where corrections are still allowed |
| Genehmigung | Approval | Authorization of a request by a supervisor |
| Vertretung | Delegation / deputy | Acting on behalf of an absent supervisor |
| Stellvertretungskette | Delegation chain | Ordered list of deputies for a role |
| Eskalation | Escalation | Automatic routing when an approval is overdue |
| Audittrail | Audit trail | Immutable log of all changes and decisions |
| Organisationseinheit (OE) | Organizational unit | Department, team, or cost center |
| Personalrat | Works council | Employee representation body with co-determination rights |
| Bezügestelle | Payroll office | Department processing salary payments |
| Dienstvereinbarung | Works agreement | Binding agreement between employer and works council |
| Pforte | Security desk | University reception/security (24/7 shift operation) |
| Hausdienst | Facility services | Building maintenance and caretaking |
| Veranstaltungstechnik (VT) | Event technology | Audio/visual/staging tech services |
| TV-L | TV-L | Collective agreement for public-sector employees of German states |
| NRW | NRW | Nordrhein-Westfalen (North Rhine-Westphalia) |
| DSGVO | GDPR | General Data Protection Regulation (EU) |
| DSFA | DPIA | Data Protection Impact Assessment |

---

## References

- [`ARCHITECTURE.md`](../../ARCHITECTURE.md) — System architecture
- [`docs/DESIGN.md`](../DESIGN.md) — Design patterns and conventions
