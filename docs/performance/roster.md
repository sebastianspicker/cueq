# Roster coverage benchmark

This benchmark measures `evaluatePlanVsActualCoverage` with a deterministic
synthetic roster containing 400 one-hour slots and 4,000 bookings. The fixture
includes adjacent and overlapping work intervals, eligible people without an
assignment, and bookings in ineligible categories.

Run it from the repository root:

```bash
./scripts/pnpm.sh --filter @cueq/domain exec vitest bench benchmarks/plan-vs-actual.bench.ts --run
```

Vitest performs 5 warm-up iterations followed by 30 measured iterations. The
benchmark has no wall-clock assertion. Instead, it checks the complete result
against the SHA-256 digest produced by the implementation before optimization:
`5dc9820bd203c9620895b7d5def0c0f319783f3a69b0c0e2c7153a77f6998376`.

The measurements below were collected on 2026-09-07 from a checkout based on
revision `7f95647`, with the optimization present in the working tree. The
machine used an Apple M4, macOS 26.6.2, Node.js 26.8.1, and Vitest 3.2.6. This
benchmark was added during the optimization because no roster benchmark existed
before it.

| Implementation             | Time per evaluation                 | Measured range             | Result digest         |
| -------------------------- | ----------------------------------- | -------------------------- | --------------------- |
| Full scan of every booking | 620.57 ms mean                      | 605.06 to 661.07 ms        | `5dc9820b...f6998376` |
| Preparsed interval index   | 3.29 ms median of seven trial means | 1.98 to 8.11 ms trial mean | `5dc9820b...f6998376` |

All seven optimized trials produced the same digest as the baseline. Their
median mean was about 189 times faster; even the slowest optimized trial mean
was about 76 times faster than the baseline mean.

A later integration run on the same day used the same runtime, fixture, 5
warm-ups, and 30 measurements. It averaged 1.4064 ms per evaluation, with a
range of 1.3382 to 1.6438 ms, and produced the same digest. It is recorded as an
additional observation rather than folded into the seven-trial distribution.

These numbers describe one synthetic workload on one machine. They are useful
for comparing these two implementations, not as production throughput claims or
CI timing requirements.
