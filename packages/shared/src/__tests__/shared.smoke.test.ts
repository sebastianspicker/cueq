import { describe, expect, it } from 'vitest';
import * as shared from '../index';

describe('@cueq/shared schema behavior', () => {
  it('distinguishes skipped outbox events from delivery attempt statuses', () => {
    expect(shared.OutboxStatusSchema.parse('SKIPPED')).toBe('SKIPPED');
    expect(() => shared.OutboxStatusSchema.parse('SUCCESS')).toThrow();
    expect(shared.WebhookDeliveryStatusSchema.parse('SUCCESS')).toBe('SUCCESS');
    expect(() => shared.WebhookDeliveryStatusSchema.parse('SKIPPED')).toThrow();
  });

  it('validates custom closing-completion report preview contracts', () => {
    const payload = {
      reportType: 'CLOSING_COMPLETION',
      groupBy: 'ORGANIZATION_UNIT',
      metrics: ['completionRate', 'exported'],
      organizationUnitId: 'c00000000000000000000001',
      from: '2026-05-01',
      to: '2026-05-31',
    };

    expect(shared.CustomReportPreviewQuerySchema.parse(payload)).toMatchObject(payload);
    expect(() =>
      shared.CustomReportPreviewQuerySchema.parse({
        ...payload,
        from: '2026-06-01',
        to: '2026-05-31',
      }),
    ).toThrow('to must be on or after from');
  });

  it('rejects ambiguous workflow decision commands', () => {
    expect(() =>
      shared.WorkflowDecisionBodySchema.parse({
        action: 'APPROVE',
        decision: 'APPROVED',
      }),
    ).toThrow('action and decision cannot be provided together');

    expect(() =>
      shared.WorkflowDecisionBodySchema.parse({
        action: 'DELEGATE',
      }),
    ).toThrow('delegateToId is required for DELEGATE action');
  });

  it('rejects invalid time-rule evaluation intervals', () => {
    expect(() =>
      shared.TimeRuleEvaluationRequestSchema.parse({
        week: '2026-W10',
        targetHours: 39.83,
        intervals: [],
      }),
    ).toThrow();

    expect(() =>
      shared.TimeRuleEvaluationRequestSchema.parse({
        week: '2026-W10',
        targetHours: 39.83,
        intervals: [
          {
            start: '2026-03-03T15:00:00.000Z',
            end: '2026-03-03T07:00:00.000Z',
            type: 'WORK',
          },
        ],
      }),
    ).toThrow('start must be before end');
  });
});
