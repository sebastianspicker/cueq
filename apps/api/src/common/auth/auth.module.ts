import { Module } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import { OidcIdentityProviderAdapter } from './oidc-identity-provider.adapter';
import { SamlIdentityProviderAdapter } from './saml-identity-provider.adapter';
import { AuthGuard } from '../guards/auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { PrismaModule } from '../../persistence/prisma.module';
import { PrismaService } from '../../persistence/prisma.service';

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
