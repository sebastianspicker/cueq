import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedIdentity } from '../../platform/auth/auth.types.js';
import type { AbsenceDomainService } from './absence-domain.service.js';
import { LeaveBalanceController } from './leave-balance.controller.js';

const USER = {
  subject: 'subject-1',
  email: 'person@example.test',
  role: 'EMPLOYEE',
  personId: 'person-1',
  claims: {},
} satisfies AuthenticatedIdentity;

describe('LeaveBalanceController', () => {
  it('rejects array-valued asOfDate query parameters', () => {
    const leaveBalance = vi.fn();
    const controller = new LeaveBalanceController({
      leaveBalance,
    } as unknown as AbsenceDomainService);

    expect(() => controller.getMe(USER, undefined, ['2026-03-01', '2026-03-02'])).toThrow(
      BadRequestException,
    );
    expect(leaveBalance).not.toHaveBeenCalled();
  });
});
