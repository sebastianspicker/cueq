/**
 * @cueq/policy — Policy-as-Code Engine
 *
 * This package contains versioned, testable, reviewable rules for:
 * - Working time models (break enforcement, rest periods, max hours)
 * - Leave/absence rules (accrual, carry-over, forfeiture)
 * - Compliance checks (cross-midnight shifts, on-call rest requirements)
 * - Monthly closing rules (cut-off, checklist generation)
 *
 * DESIGN PRINCIPLES:
 * 1. Rules are DATA, not code — defined as typed configurations
 * 2. Rules are VERSIONED — each has effectiveFrom/effectiveTo dates
 * 3. Rules are TESTABLE — golden-case test suite gates every change
 * 4. Rules are REVIEWABLE — changes generate human-readable changelog
 * 5. Rules are ROLLBACK-CAPABLE — previous versions are retained
 *
 * See: docs/product-specs/policy-as-code.md
 */

export * from './types';
export * from './rules/break-rules';
export * from './rules/rest-rules';
export * from './rules/max-hours-rules';
export * from './rules/leave-rules';
