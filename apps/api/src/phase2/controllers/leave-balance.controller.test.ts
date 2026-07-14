import { BadRequestException } from '@nestjs/common';
import { Role } from '@cueq/database';
import { describe, expect, it, vi } from 'vitest';
import { LeaveBalanceController } from './leave-balance.controller';

const user = {
  subject: 'person-1',
  email: 'employee@example.invalid',
  role: Role.EMPLOYEE,
  claims: {},
};

describe('LeaveBalanceController date validation', () => {
  it.each(['2026-02-30', '2026-04-31'])('rejects impossible calendar date %s', (asOfDate) => {
    const absenceService = { leaveBalance: vi.fn() };
    const controller = new LeaveBalanceController(absenceService as never);

    expect(() => controller.getMe(user, '2026', asOfDate)).toThrow(BadRequestException);
    expect(absenceService.leaveBalance).not.toHaveBeenCalled();
  });

  it('passes a valid leap day to the domain service', () => {
    const absenceService = { leaveBalance: vi.fn().mockResolvedValue({}) };
    const controller = new LeaveBalanceController(absenceService as never);

    controller.getMe(user, '2028', '2028-02-29');

    expect(absenceService.leaveBalance).toHaveBeenCalledWith(user, 2028, '2028-02-29');
  });
});
