import 'reflect-metadata';
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { Phase2Module } from '../../phase2/phase2.module.js';
import { AUTHENTICATED_ROUTE_METADATA } from '../decorators/authenticated.decorator.js';
import { PUBLIC_ROUTE_METADATA } from '../decorators/public.decorator.js';
import { ALLOWED_ROLES_METADATA } from '../decorators/roles.decorator.js';

type ControllerConstructor = abstract new (...args: never[]) => object;

function registeredControllers(): ControllerConstructor[] {
  return [AppModule, Phase2Module].flatMap(
    (module) =>
      (Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, module) as
        | ControllerConstructor[]
        | undefined) ?? [],
  );
}

function httpHandlers(controller: ControllerConstructor): Array<[string, Function]> {
  return Object.getOwnPropertyNames(controller.prototype).flatMap((name) => {
    const handler = controller.prototype[name as keyof object];
    return typeof handler === 'function' &&
      Reflect.hasMetadata(PATH_METADATA, handler) &&
      Reflect.hasMetadata(METHOD_METADATA, handler)
      ? [[name, handler] as [string, Function]]
      : [];
  });
}

describe('registered route authorization policies', () => {
  it('classifies every HTTP handler and forbids empty or class-level authenticated policies', () => {
    const violations = registeredControllers().flatMap((controller) => {
      const classRoles = Reflect.getMetadata(ALLOWED_ROLES_METADATA, controller) as unknown;
      const classAuthenticated = Reflect.getMetadata(AUTHENTICATED_ROUTE_METADATA, controller);
      const controllerName = controller.name;
      const classViolations = [
        ...(Array.isArray(classRoles) && classRoles.length === 0
          ? [`${controllerName}: empty @Roles()`]
          : []),
        ...(classAuthenticated ? [`${controllerName}: @Authenticated() must be method-level`] : []),
      ];

      return [
        ...classViolations,
        ...httpHandlers(controller).flatMap(([name, handler]) => {
          const publicRoute =
            Reflect.getMetadata(PUBLIC_ROUTE_METADATA, handler) === true ||
            Reflect.getMetadata(PUBLIC_ROUTE_METADATA, controller) === true;
          const roles = (Reflect.getMetadata(ALLOWED_ROLES_METADATA, handler) ??
            Reflect.getMetadata(ALLOWED_ROLES_METADATA, controller)) as unknown;
          const authenticated = Reflect.getMetadata(AUTHENTICATED_ROUTE_METADATA, handler) === true;
          const routeName = `${controllerName}.${name}`;

          if (Array.isArray(roles) && roles.length === 0) {
            return [`${routeName}: empty @Roles()`];
          }
          if (!publicRoute && !(Array.isArray(roles) && roles.length > 0) && !authenticated) {
            return [`${routeName}: missing @Public(), non-empty @Roles(), or @Authenticated()`];
          }
          return [];
        }),
      ];
    });

    expect(violations).toEqual([]);
  });
});
