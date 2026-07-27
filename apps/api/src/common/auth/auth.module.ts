/** Authentication module that installs global authentication and fail-closed authorization guards. */
import { Module } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { AuthService } from './auth.service.js';
import { OidcIdentityProviderAdapter } from './oidc-identity-provider.adapter.js';
import { SamlIdentityProviderAdapter } from './saml-identity-provider.adapter.js';
import { AuthGuard } from '../guards/auth.guard.js';
import { RolesGuard } from '../guards/roles.guard.js';
import { PrismaModule } from '../../persistence/prisma.module.js';
import { PrismaService } from '../../persistence/prisma.service.js';

/** NestJS composition boundary for identity providers, guards, and persistence-backed resolution. */
@Module({
  imports: [PrismaModule],
  providers: [
    Reflector,
    AuthService,
    OidcIdentityProviderAdapter,
    SamlIdentityProviderAdapter,
    {
      provide: APP_GUARD,
      inject: [Reflector, AuthService, PrismaService],
      useFactory: (reflector: Reflector, authService: AuthService, prisma: PrismaService) =>
        new AuthGuard(reflector, authService, prisma),
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
