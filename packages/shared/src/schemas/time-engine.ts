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

export const TimeRuleEvaluationResponseSchema = z.object({
  actualHours: z.number(),
  deltaHours: z.number(),
  violations: z.array(RuleViolationSchema),
  warnings: z.array(DomainWarningSchema),
  surchargeMinutes: z.array(SurchargeMinutesLineSchema),
});
export type TimeRuleEvaluationResponse = z.infer<typeof TimeRuleEvaluationResponseSchema>;
