import { z } from 'zod';
import { DateSchema, DateTimeSchema } from './common';

export const TimeRuleIntervalTypeSchema = z.enum(['WORK', 'PAUSE', 'DEPLOYMENT']);
export type TimeRuleIntervalType = z.infer<typeof TimeRuleIntervalTypeSchema>;

export const TimeRuleIntervalSchema = z
  .object({
    start: DateTimeSchema,
    end: DateTimeSchema,
    type: TimeRuleIntervalTypeSchema,
  })
  .refine((value) => value.start < value.end, {
    message: 'start must be before end',
    path: ['end'],
  });
export type TimeRuleInterval = z.infer<typeof TimeRuleIntervalSchema>;

export const TimeRuleEvaluationRequestSchema = z.object({
  week: z.string(),
  targetHours: z.number(),
  timezone: z.string().optional(),
  holidayDates: z.array(DateSchema).optional(),
  intervals: z.array(TimeRuleIntervalSchema).min(1),
});
export type TimeRuleEvaluationRequest = z.infer<typeof TimeRuleEvaluationRequestSchema>;

export const RuleViolationSchema = z.object({
  code: z.string(),
  severity: z.enum(['ERROR', 'WARNING', 'INFO']),
  message: z.string(),
  ruleId: z.string().optional(),
  ruleName: z.string().optional(),
  context: z.record(z.unknown()).optional(),
});
export type RuleViolation = z.infer<typeof RuleViolationSchema>;

export const DomainWarningSchema = z.object({
  code: z.string(),
  message: z.string(),
  context: z.record(z.unknown()).optional(),
});
export type DomainWarning = z.infer<typeof DomainWarningSchema>;

export const SurchargeMinutesLineSchema = z.object({
  category: z.enum(['NIGHT', 'WEEKEND', 'HOLIDAY']),
  ratePercent: z.number().nonnegative(),
  minutes: z.number().int().nonnegative(),
});
export type SurchargeMinutesLine = z.infer<typeof SurchargeMinutesLineSchema>;

export const ProratedTargetSegmentSchema = z
  .object({
    from: DateSchema,
    to: DateSchema,
    weeklyHours: z.number().nonnegative(),
  })
  .refine((value) => value.from <= value.to, {
    message: 'from must be on or before to',
    path: ['to'],
  });
export type ProratedTargetSegment = z.infer<typeof ProratedTargetSegmentSchema>;

export const ProratedTargetRequestSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Must be YYYY-MM format'),
  actualHours: z.number(),
  transitionAdjustmentHours: z.number().optional(),
  segments: z.array(ProratedTargetSegmentSchema).min(1),
});
export type ProratedTargetRequest = z.infer<typeof ProratedTargetRequestSchema>;

export const TimeRuleEvaluationResponseSchema = z.object({
  actualHours: z.number(),
  deltaHours: z.number(),
  violations: z.array(RuleViolationSchema),
  warnings: z.array(DomainWarningSchema),
  surchargeMinutes: z.array(SurchargeMinutesLineSchema),
});
export type TimeRuleEvaluationResponse = z.infer<typeof TimeRuleEvaluationResponseSchema>;
