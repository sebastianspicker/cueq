import { describe, expect, it } from 'vitest';
import * as shared from '../index';

describe('@cueq/shared smoke test', () => {
  it('exports domain schemas', () => {
    expect(shared.BookingSchema).toBeDefined();
    expect(shared.AbsenceSchema).toBeDefined();
    expect(shared.WorkflowInstanceSchema).toBeDefined();
    expect(shared.PolicyBundleSchema).toBeDefined();
    expect(shared.DomainEventEnvelopeSchema).toBeDefined();
    expect(shared.TeamAbsenceReportSchema).toBeDefined();
  });
});
