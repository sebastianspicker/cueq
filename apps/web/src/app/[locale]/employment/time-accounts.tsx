'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { FormField } from '../../../components/FormField';
import { SectionCard } from '../../../components/SectionCard';
import { TimeAccountPageSchema } from '@cueq/contracts';
import { useOptionalSessionContext } from '../../../components/AppWorkspace';
import { NativeFacts, NativePanel } from '../../../shared/native-hr/native-panels';
import { useNativeCollection } from '../../../shared/native-hr/use-native-resource';
import { TimeAccountSplit } from './time-account-split';

export function OwnTimeAccounts() {
  const session = useOptionalSessionContext();
  const canSplit = session?.profile?.role === 'HR' || session?.profile?.role === 'ADMIN';
  return (
    <>
      {session?.assignmentId ? (
        <TimeAccounts
          key={session.assignmentId}
          assignmentId={session.assignmentId}
          canSplit={canSplit}
        />
      ) : null}
      {canSplit ? (
        <OperatorAccountLookup key={`${session?.profile?.id}:${session?.assignmentId}`} />
      ) : null}
    </>
  );
}
function OperatorAccountLookup() {
  const t = useTranslations('pages.nativeHr');
  const [personId, setPersonId] = useState('');
  const [assignmentId, setAssignmentId] = useState('');
  const [target, setTarget] = useState<{ personId: string; assignmentId: string } | null>(null);
  return (
    <SectionCard>
      <h3>{t('operatorTimeAccounts')}</h3>
      <p>{t('operatorTimeAccountsDescription')}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (personId.trim() && assignmentId.trim())
            setTarget({ personId: personId.trim(), assignmentId: assignmentId.trim() });
        }}
      >
        <div className="cq-grid-2">
          <FormField label={t('fields.personId')}>
            <input
              required
              value={personId}
              onChange={(event) => {
                setPersonId(event.target.value);
                setTarget(null);
              }}
            />
          </FormField>
          <FormField label={t('fields.assignmentId')}>
            <input
              required
              value={assignmentId}
              onChange={(event) => {
                setAssignmentId(event.target.value);
                setTarget(null);
              }}
            />
          </FormField>
        </div>
        <button type="submit" disabled={!personId.trim() || !assignmentId.trim()}>
          {t('search')}
        </button>
      </form>
      {target ? <TimeAccounts key={JSON.stringify(target)} {...target} canSplit /> : null}
    </SectionCard>
  );
}
function TimeAccounts({
  assignmentId,
  personId,
  canSplit,
}: {
  assignmentId: string;
  personId?: string;
  canSplit: boolean;
}) {
  const resource = useNativeCollection(
    `/v1/time-accounts?${new URLSearchParams({ assignmentId, ...(personId ? { personId } : {}) })}`,
    TimeAccountPageSchema,
  );
  return (
    <NativePanel
      title={personId ? 'operatorTimeAccounts' : 'ownTimeAccounts'}
      phase={resource.phase}
      empty={!resource.data?.items.length}
      reload={resource.load}
      more={resource.data?.nextCursor ? resource.more : undefined}
    >
      <NativeFacts values={{ assignmentId, ...(personId ? { personId } : {}) }} />
      {resource.data?.items.map((account) => (
        <div key={account.id} className="cq-list-item">
          <NativeFacts
            values={{
              accountId: account.id,
              periodStart: account.periodStart,
              periodEnd: account.periodEnd,
              targetHours: account.targetHours,
              actualHours: account.actualHours,
              balance: account.balance,
              overtimeHours: account.overtimeHours,
              updatedAt: account.updatedAt,
            }}
          />
          {canSplit ? (
            <TimeAccountSplit
              key={`${account.id}:${account.updatedAt}`}
              account={account}
              after={resource.load}
            />
          ) : null}
        </div>
      ))}
    </NativePanel>
  );
}
