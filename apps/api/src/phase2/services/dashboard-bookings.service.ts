import { Inject, Injectable } from '@nestjs/common';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { Phase2Service } from '../phase2.service';

@Injectable()
export class DashboardBookingsService {
  constructor(@Inject(Phase2Service) private readonly phase2Service: Phase2Service) {}

  me(user: AuthenticatedIdentity): Promise<unknown> {
    return this.phase2Service.me(user);
  }

  dashboard(user: AuthenticatedIdentity): Promise<unknown> {
    return this.phase2Service.dashboard(user);
  }

  listMyBookings(user: AuthenticatedIdentity): Promise<unknown> {
    return this.phase2Service.listMyBookings(user);
  }

  createBooking(user: AuthenticatedIdentity, payload: unknown): Promise<unknown> {
    return this.phase2Service.createBooking(user, payload);
  }

  createBookingCorrection(user: AuthenticatedIdentity, payload: unknown): Promise<unknown> {
    return this.phase2Service.createBookingCorrection(user, payload);
  }
}
