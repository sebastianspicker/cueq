'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { AssignmentOptionPageSchema } from '@cueq/contracts';
import { FormField } from '../../../components/FormField';
import { chooseAssignment } from '../../../components/workspace/assignment-selection';
import { NativePanel } from '../../../shared/native-hr/native-panels';
import { useNativeCollection } from '../../../shared/native-hr/use-native-resource';

interface Props {
  rosterId: string;
  personId: string;
  from: string;
  to: string;
  disabled: boolean;
  onAssign: (assignmentId: string) => void;
}
export function RosterMemberAppointments(props: Props) {
  const t = useTranslations('pages.nativeHr');
  const [open, setOpen] = useState(false);
  return open ? (
    <AppointmentOptions {...props} />
  ) : (
    <button
      type="button"
      className="cq-btn-sm"
      disabled={props.disabled || !props.personId}
      onClick={() => setOpen(true)}
    >
      {t('chooseAppointment')}
    </button>
  );
}
function AppointmentOptions(props: Props) {
  const t = useTranslations('pages.nativeHr');
  const query = new URLSearchParams({ from: props.from, to: props.to });
  const resource = useNativeCollection(
    `/v1/rosters/${props.rosterId}/members/${props.personId}/assignments?${query}`,
    AssignmentOptionPageSchema,
  );
  const [selected, setSelected] = useState<string | null>(null);
  const assignmentId = chooseAssignment(
    resource.data?.items ?? [],
    selected,
    resource.data?.nextCursor ?? null,
  );
  return (
    <NativePanel
      title="appointments"
      phase={resource.phase}
      empty={!resource.data?.items.length}
      reload={resource.load}
      more={resource.data?.nextCursor ? resource.more : undefined}
    >
      <FormField label={t('chooseAppointment')}>
        <select value={assignmentId ?? ''} onChange={(event) => setSelected(event.target.value)}>
          <option value="" disabled>
            {t('choose')}
          </option>
          {resource.data?.items.map((item) => (
            <option value={item.id} key={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </FormField>
      <button
        type="button"
        className="cq-btn-sm"
        disabled={props.disabled || !assignmentId}
        onClick={() => {
          if (assignmentId) props.onAssign(assignmentId);
        }}
      >
        {t('assign')}
      </button>
    </NativePanel>
  );
}
