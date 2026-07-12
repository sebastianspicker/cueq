import { SetMetadata } from '@nestjs/common';

export const PUBLIC_ROUTE_METADATA = 'isPublicRoute';
export const Public = () => SetMetadata(PUBLIC_ROUTE_METADATA, true);
