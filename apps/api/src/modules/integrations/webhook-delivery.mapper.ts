import { truncateForStorage, WEBHOOK_ERROR_MAX_CHARS } from './webhook-dispatch-format.js';

export type DeliveryRecord = {
  outboxEventId: string;
  endpointId: string;
  attempt: number;
  status: 'SUCCESS' | 'FAILED';
  httpStatus: number | null;
  responseBody: string | null;
  error: string | null;
  deliveredAt: Date | null;
};

export function webhookDeliveryRecord(
  eventId: string,
  endpointId: string,
  attempt: number,
  httpStatus: number,
  responseBody: string,
): DeliveryRecord {
  if (httpStatus >= 200 && httpStatus < 300) {
    return {
      outboxEventId: eventId,
      endpointId,
      attempt,
      status: 'SUCCESS',
      httpStatus,
      responseBody,
      error: null,
      deliveredAt: new Date(),
    };
  }
  return failedWebhookDeliveryRecord(
    eventId,
    endpointId,
    attempt,
    `HTTP ${httpStatus}`,
    httpStatus,
    responseBody,
  );
}

export function failedWebhookDeliveryRecord(
  eventId: string,
  endpointId: string,
  attempt: number,
  error: string,
  httpStatus: number | null = null,
  responseBody: string | null = null,
): DeliveryRecord {
  return {
    outboxEventId: eventId,
    endpointId,
    attempt,
    status: 'FAILED',
    httpStatus,
    responseBody,
    error: truncateForStorage(error, WEBHOOK_ERROR_MAX_CHARS),
    deliveredAt: null,
  };
}
