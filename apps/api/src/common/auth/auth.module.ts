import { Module } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import { OidcIdentityProviderAdapter } from './oidc-identity-provider.adapter';
import { AuthGuard } from '../guards/auth.guard';
import { RolesGuard } from '../guards/roles.guard';

@Module({
  providers: [
    Reflector,
    AuthService,
    OidcIdentityProviderAdapter,
    {
      provide: APP_GUARD,
      inject: [Reflector, AuthService],
      useFactory: (reflector: Reflector, authService: AuthService) =>
        new AuthGuard(reflector, authService),
    },
    {
      provide: APP_GUARD,
      inject: [Reflector],
      useFactory: (reflector: Reflector) => new RolesGuard(reflector),
    },
  ],
  exports: [AuthService],
})
export class AuthModule {}
