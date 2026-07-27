/** Route metadata for handlers protected by authenticated identity plus service-layer scope checks. */
import { SetMetadata } from '@nestjs/common';

/** Metadata key consumed by the global authorization guard for service-scoped routes. */
export const AUTHENTICATED_ROUTE_METADATA = 'isAuthenticatedRoute';

/**
 * Marks a handler whose authorization is enforced by authenticated identity,
 * ownership, or organization-unit checks in its service layer.
 */
export function Authenticated(): MethodDecorator {
  const setMetadata = SetMetadata(AUTHENTICATED_ROUTE_METADATA, true);

  return (target, propertyKey, descriptor) => {
    if (propertyKey === undefined || descriptor === undefined) {
      throw new Error('@Authenticated() may only be applied to a route handler.');
    }

    setMetadata(target, propertyKey, descriptor);
  };
}
