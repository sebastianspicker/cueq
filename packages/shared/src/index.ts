/**
 * @cueq/shared — Shared schemas, types, and utilities
 *
 * This package contains Zod schemas that serve as the single source of truth
 * for validation across the API (NestJS) and UI (Next.js) layers.
 *
 * Import from `@cueq/shared` in both apps.
 */

export * from './schemas/booking';
export * from './schemas/absence';
export * from './schemas/time-type';
export * from './schemas/workflow';
export * from './schemas/roster';
export * from './schemas/oncall';
export * from './schemas/policy';
export * from './schemas/events';
export * from './schemas/reporting';
export * from './schemas/time-engine';
export * from './schemas/common';
export * from './schemas/closing';
export * from './generated/core-schema-types';
