# PRODUCT_SENSE.md — Product Thinking for cueq

---

## 1. The Core Problem

A German university (NRW, TV-L) currently tracks working hours through fragmented tools — paper, Excel, disconnected terminal systems — creating:

- **Legal risk**: incomplete audit trails for working-time compliance
- **Operational friction**: shift planning via email/phone; manual export to payroll
- **Employee frustration**: opaque balances, slow leave approvals, no self-service
- **HR burden**: monthly closing requires manual reconciliation across systems
- **Privacy gaps**: unclear who sees what absence data; no systematic GDPR controls

cueq explores a single permission-aware system for these workflows. It is
designed for transparent rules and auditable operations, but institution-specific
legal, tariff, data-protection, and works-council approval remains external to
the software.

---

## 2. Who We Serve (Prioritized)

| Priority | Persona                              | Core Need                                                   | Success Metric                    |
| -------- | ------------------------------------ | ----------------------------------------------------------- | --------------------------------- |
| 1        | **Employee (Verwaltung)**            | Clock in/out, see balance, request leave — effortlessly     | <3 clicks to any core action      |
| 2        | **Shift Employee (Pforte/IT/HD/VT)** | Trust the roster, swap shifts safely, see surcharge credits | Zero "surprise" shift changes     |
| 3        | **Team Lead**                        | Approve quickly, ensure coverage, close the month cleanly   | Median approval <2 workdays       |
| 4        | **HR / Personalstelle**              | Correct data, reliable export, no post-close chaos          | Closing without manual Excel      |
| 5        | **Dienstplaner\*in**                 | Plan shifts, fill gaps, meet min-staffing                   | Min-staffing violations = 0       |
| 6        | **Bezügestelle / Payroll**           | Reliable, reproducible export with protocol                 | Export matches schema 100%        |
| 7        | **Personalrat / Datenschutz**        | Transparency, no hidden surveillance, auditable             | Compliance review approval target |
| 8        | **IT / Admin**                       | Stable operation, clear monitoring, safe rollback           | Terminal uptime >99.5%            |

---

## 3. Product Principles

### "Correct First, Fast Second"

Time tracking data feeds legal compliance and payroll. An incorrect balance displayed quickly is worse than a correct balance displayed with a 2-second delay. Accuracy of calculations is the non-negotiable baseline.

### "Transparent by Default"

- Employees always see their own data (balance, bookings, leave quota).
- Rules that affect them are explained, not just enforced ("Your booking was rejected because…").
- Managers see exactly what they need — no more.

### "Self-Service Reduces Burden"

Every workflow that employees and leads can complete without HR intervention is a win:

- Correction requests with approval
- Leave requests with conflict checks
- Shift swap proposals

The goal is that HR only handles exceptions and monthly closing.

### "Configuration, Not Customization"

The university has diverse employment groups and four distinct shift domains. The system handles this diversity through data-driven configuration — rule sets, work-time models, shift templates — not custom code per department.

### "Privacy Is a Feature"

In a works-council environment, privacy controls are not a constraint to work around — they are a feature that builds trust and enables adoption. The system makes it easy to do the right thing and hard to accidentally expose sensitive data.

---

## 4. What Success Looks Like (MVP)

| Metric                                | Target                            |
| ------------------------------------- | --------------------------------- |
| Booking gaps after 2 weeks of pilot   | <5% of workdays                   |
| Median leave approval turnaround      | <2 workdays                       |
| Monthly closing without manual Excel  | 100% of pilot OEs                 |
| Required service-backed release gates | All green on the candidate commit |

---

## 5. What We Deliberately Defer

| Item                                       | Why Deferred                                                         |
| ------------------------------------------ | -------------------------------------------------------------------- |
| Native mobile application                  | The responsive web workspace remains the supported client surface.   |
| Project/grant time tracking (Drittmittel)  | It has a separate accounting and compliance regime.                  |
| eAU technical integration                  | It depends on approved external infrastructure and contracts.        |
| Automated roster optimization              | It requires institution-specific policy and explainability review.   |
| Production identity/provider certification | Provider contracts and deployment evidence are environment-specific. |

---

## 6. Risks to Product Success

| Risk                                     | Impact                                   | Mitigation                                                |
| ---------------------------------------- | ---------------------------------------- | --------------------------------------------------------- |
| Provider-specific payroll contract drift | Can invalidate otherwise correct exports | Version contracts and verify with the target provider     |
| Works council / DSGVO concerns           | Can block rollout entirely               | Review before deployment; limit reports by design         |
| Low employee adoption                    | Undercuts the business case              | Self-service UX; transparent rules; fast corrections      |
| Terminal integration instability         | Erodes trust in the system               | Gateway with offline buffer; monitoring; fallback process |
| Shift-rule complexity explosion          | Delays core features                     | Start simple; add complexity incrementally per department |

---

## 7. References

- [`PLANS.md`](PLANS.md) — Current implementation and release status
- [`design-docs/core-beliefs.md`](design-docs/core-beliefs.md) — Design principles and glossary
