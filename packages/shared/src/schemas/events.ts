import { z } from 'zod';
import { DateTimeSchema, IdSchema } from './common';

export const DomainEventTypeSchema = z.enum([
  'booking.created',
  'closing.completed',
  'export.ready',
  'violation.detected',
]);
export type DomainEventType = z.infer<typeof DomainEventTypeSchema>;

export const DomainEventEnvelopeSchema = z.object({
  eventId: IdSchema,
  eventType: DomainEventTypeSchema,
  timestamp: DateTimeSchema,
  version: z.number().int().positive(),
  source: z.string(),
  aggregateType: z.string(),
  aggregateId: IdSchema,
  payload: z.record(z.unknown()),
});
export type DomainEventEnvelope = z.infer<typeof DomainEventEnvelopeSchema>;

export const OutboxStatusSchema = z.enum(['PENDING', 'FAILED', 'DELIVERED']);
export type OutboxStatus = z.infer<typeof OutboxStatusSchema>;

export const OutboxEventSchema = z.object({
  id: IdSchema,
  eventType: DomainEventTypeSchema,
  aggregateType: z.string(),
  aggregateId: IdSchema,
  payload: z.record(z.unknown()),
  status: OutboxStatusSchema,
  attempts: z.number().int().nonnegative(),
  nextAttemptAt: DateTimeSchema.nullable(),
  lastError: z.string().nullable(),
  processedAt: DateTimeSchema.nullable(),
  createdAt: DateTimeSchema,
});
export type OutboxEvent = z.infer<typeof OutboxEventSchema>;

export const CreateWebhookEndpointSchema = z
  .object({
    name: z.string().min(1).max(200),
    url: z.string().url(),
    subscribedEvents: z.array(DomainEventTypeSchema).min(1),
  })
  .strict();
export type CreateWebhookEndpoint = z.infer<typeof CreateWebhookEndpointSchema>;

export const WebhookEndpointSchema = z.object({
  id: IdSchema,
  name: z.string(),
  url: z.string().url(),
  subscribedEvents: z.array(DomainEventTypeSchema),
  isActive: z.boolean(),
  createdById: IdSchema,
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});
export type WebhookEndpoint = z.infer<typeof WebhookEndpointSchema>;

export const WebhookDeliveryStatusSchema = z.enum(['PENDING', 'SUCCESS', 'FAILED']);
export type WebhookDeliveryStatus = z.infer<typeof WebhookDeliveryStatusSchema>;

export const WebhookDeliverySchema = z.object({
  id: IdSchema,
  outboxEventId: IdSchema,
  endpointId: IdSchema,
  attempt: z.number().int().positive(),
  status: WebhookDeliveryStatusSchema,
  httpStatus: z.number().int().nullable(),
  responseBody: z.string().nullable(),
  error: z.string().nullable(),
  deliveredAt: DateTimeSchema.nullable(),
  createdAt: DateTimeSchema,
});
export type WebhookDelivery = z.infer<typeof WebhookDeliverySchema>;

export const OutboxQuerySchema = z.object({
  status: OutboxStatusSchema.optional(),
});
export type OutboxQuery = z.infer<typeof OutboxQuerySchema>;

export const DeliveryQuerySchema = z.object({
  eventId: IdSchema.optional(),
});
export type DeliveryQuery = z.infer<typeof DeliveryQuerySchema>;
