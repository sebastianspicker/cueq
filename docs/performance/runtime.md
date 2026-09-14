# Runtime performance checks

These checks use deterministic synthetic data to catch avoidable full scans,
unbounded concurrency, unstable pagination, and ineffective build caching. They
do not measure production throughput, network latency, process memory, or live
PostgreSQL query plans.

## Domain and API workloads

The roster benchmark evaluates 400 one-hour slots against 4,000 bookings and
checks the complete output against a stored digest. Its timing method and
measurements are in [Roster coverage benchmark](roster.md).

Cursor tests give bookings and audit records identical timestamps, then verify
that pagination uses the record ID as a stable tie-breaker and rejects malformed
cursors. A dashboard fixture with 51 bookings on a Berlin daylight-saving-time
day returns the first 50 records and a continuation cursor while preserving the
full count and worked-time sum.

Workflow escalation and automatic closing cut-off scans read 100 records per
keyset page. Their 205-record fixtures therefore require three page reads.
Mutation decisions still repeat the relevant checks inside their transaction.

## Webhook dispatch and database checksums

A webhook fixture targets 19 independent synthetic endpoints. Dispatch allows
at most 8 requests in flight, so it runs in 3 waves and renews its lease before
each wave. Deterministic adapters verify this scheduling behavior; the test does
not include real network latency or competing worker processes.

The database snapshot test processes 1,501 synthetic records in 4 reads of at
most 500 rows. It retains only counts and checksums in the report, not record
payloads. Snapshot format 3 discovers persisted models through the Prisma
client, including shift assignments, time-threshold policies, and webhook jobs,
and adds the verified private-document object manifest.

## Reporting and imports

Overtime, closing, audit, and compliance reports use parameterized aggregate
queries. Absence reporting groups totals in PostgreSQL and orders each bucket by
its earliest start date and type. Reference fixtures run the former reducer to
check decimal and grouping parity. Distinct-person denominators, privacy
suppression, and audits of report access remain part of the report contract.

The import batching fixture creates 1,001 people in one organization unit and
work-time model. The API path issues 14 write statements; the older per-row path
issued 2,004. The CLI path issues 13 rather than 2,003 because an omitted
supervisor mapping remains unchanged. Both paths use one transaction and split
person writes into batches of 500, 500, and 1.

Those counts exclude preflight reads, advisory locks, and audit or import-run
statements. Six of the counted statements create appointments and initial terms
across the three batches. Six bounded reads reject implicit changes to effective
terms or to people covered by a locked closing period. These are
adapter-observed statement counts, not live database timings.

## Build cache inputs

Turborepo dry runs with two different synthetic `DATABASE_URL` values produced
the same hashes for all 12 lint and build tasks. Changing
`CUEQ_INCLUDE_SPECIALIZED_TESTS` changed all 6 test-task hashes. Database
integration tasks are configured without caching.

## What remains unmeasured

These checks do not cover PostgreSQL execution plans, live import throughput,
migration recovery, simultaneous webhook processes, or a real dump-and-restore
exercise. No production throughput or query-plan-dependent index claim should
be inferred from them.
