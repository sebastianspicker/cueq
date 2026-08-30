/** Route metadata marker for endpoints intentionally exempt from global authentication. */
import { SetMetadata } from '@nestjs/common';

/** Metadata key that makes a route bypass bearer authentication intentionally. */
export const PUBLIC_ROUTE_METADATA = 'isPublicRoute';
/** Marks an endpoint public; guards honor this before inspecting credentials. */
export const Public = () => SetMetadata(PUBLIC_ROUTE_METADATA, true);
