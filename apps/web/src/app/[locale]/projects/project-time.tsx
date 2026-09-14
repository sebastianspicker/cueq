'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  AllocateProjectTimeSchema,
  ProjectAllocationPageSchema,
  ProjectAllocationSchema,
  UnallocatedBookingPageSchema,
} from '@cueq/contracts';
import { NativeForm } from '../../../shared/native-hr/native-form';
import { NativeFacts, NativePanel } from '../../../shared/native-hr/native-panels';
import { useNativeCollection } from '../../../shared/native-hr/use-native-resource';

const EmptyBodySchema = { parse: () => ({}) };
const UnallocatedRowsSchema = UnallocatedBookingPageSchema.transform((page) => ({
  ...page,
  items: page.items.map((item) => ({ ...item, id: item.bookingId })),
}));
export function ProjectTime({
  assignmentId,
  projectId,
}: {
  assignmentId: string;
  projectId: string | null;
}) {
  const t = useTranslations('pages.nativeHr');
  const params = new URLSearchParams({ assignmentId });
  if (projectId) params.set('projectId', projectId);
  const unallocated = useNativeCollection(
    `/v1/projects/time/unallocated?${params}`,
    UnallocatedRowsSchema,
  );
  const allocations = useNativeCollection(
    `/v1/projects/time/allocations?${params}`,
    ProjectAllocationPageSchema,
  );
  const [bookingId, setBookingId] = useState<string | null>(null);
  async function reload() {
    await Promise.all([unallocated.load(), allocations.load()]);
  }
  return (
    <>
      <NativePanel
        title="unallocated"
        phase={unallocated.phase}
        empty={!unallocated.data?.items.length}
        reload={unallocated.load}
        more={unallocated.data?.nextCursor ? unallocated.more : undefined}
      >
        <p>{t('allocationDescription')}</p>
        {unallocated.data?.items.map((booking) => (
          <div key={booking.id} className="cq-list-item">
            <NativeFacts
              values={{
                bookingId: booking.bookingId,
                assignmentId: booking.assignmentId,
                startTime: booking.startTime,
                endTime: booking.endTime,
                durationMinutes: booking.durationMinutes,
                allocatedMinutes: booking.allocatedMinutes,
                unallocatedMinutes: booking.unallocatedMinutes,
              }}
            />
            <button type="button" onClick={() => setBookingId(booking.id)}>
              {t('allocateTime')}
            </button>
            {bookingId === booking.id ? (
              <NativeForm
                key={booking.id}
                path="/v1/projects/time/allocations"
                inputSchema={AllocateProjectTimeSchema}
                responseSchema={ProjectAllocationSchema}
                defaults={{ bookingId: booking.id, assignmentId: booking.assignmentId }}
                fields={[
                  { key: 'projectId', defaultValue: projectId ?? '' },
                  { key: 'minutes', type: 'number' },
                  { key: 'note', type: 'textarea', nullable: true },
                ]}
                after={reload}
                submitLabel="allocateTime"
              />
            ) : null}
          </div>
        ))}
      </NativePanel>
      <NativePanel
        title="allocations"
        phase={allocations.phase}
        empty={!allocations.data?.items.length}
        reload={allocations.load}
        more={allocations.data?.nextCursor ? allocations.more : undefined}
      >
        {allocations.data?.items.map((item) => (
          <div key={item.id} className="cq-list-item">
            <NativeFacts
              values={{
                projectId: item.projectId,
                bookingId: item.bookingId,
                assignmentId: item.assignmentId,
                minutes: item.minutes,
                note: item.note,
              }}
            />
            {item.minutes > 0 ? (
              <details>
                <summary>{t('releaseAllocation')}</summary>
                <p>{t('releaseDescription')}</p>
                <NativeForm
                  path={`/v1/projects/time/allocations/${item.id}/release`}
                  fields={[]}
                  inputSchema={EmptyBodySchema}
                  responseSchema={ProjectAllocationSchema}
                  after={reload}
                  submitLabel="releaseAllocation"
                />
              </details>
            ) : (
              <p>{t('allocationReleased')}</p>
            )}
            <details>
              <summary>{t('adjustAllocation')}</summary>
              <NativeForm
                path="/v1/projects/time/allocations"
                inputSchema={AllocateProjectTimeSchema}
                responseSchema={ProjectAllocationSchema}
                defaults={{
                  bookingId: item.bookingId,
                  assignmentId: item.assignmentId,
                  projectId: item.projectId,
                }}
                fields={[
                  { key: 'minutes', type: 'number', defaultValue: String(item.minutes) },
                  { key: 'note', type: 'textarea', nullable: true, defaultValue: item.note ?? '' },
                ]}
                after={reload}
                submitLabel="adjustAllocation"
              />
            </details>
          </div>
        ))}
      </NativePanel>
    </>
  );
}
