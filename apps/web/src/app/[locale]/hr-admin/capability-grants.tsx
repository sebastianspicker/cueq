'use client';

import { useTranslations } from 'next-intl';
import {
  CapabilityGrantPageSchema,
  CapabilityGrantSchema,
  CapabilityScopeSchema,
  CreateCapabilityGrantSchema,
  HrCapabilitySchema,
} from '@cueq/contracts';
import { NativeForm } from '../../../shared/native-hr/native-form';
import { NativeFacts, NativePanel } from '../../../shared/native-hr/native-panels';
import { useNativeCollection } from '../../../shared/native-hr/use-native-resource';

const EmptyBodySchema = { parse: () => ({}) };
export function CapabilityGrants() {
  const t = useTranslations('pages.nativeHr');
  const grants = useNativeCollection('/v1/hr/capability-grants', CapabilityGrantPageSchema);
  return (
    <NativePanel
      title="grants"
      phase={grants.phase}
      empty={!grants.data?.items.length}
      reload={grants.load}
      more={grants.data?.nextCursor ? grants.more : undefined}
    >
      <p>{t('grantsDescription')}</p>
      {grants.data?.items.map((grant) => (
        <div key={grant.id} className="cq-list-item">
          <NativeFacts
            values={{
              granteeId: grant.granteeId,
              capability: grant.capability,
              scope: grant.scope,
              targetId: grant.targetId,
              activeFrom: grant.activeFrom,
              activeTo: grant.activeTo,
              revokedAt: grant.revokedAt,
              reason: grant.reason,
            }}
          />
          {!grant.revokedAt ? (
            <NativeForm
              path={`/v1/hr/capability-grants/${grant.id}/revoke`}
              fields={[]}
              inputSchema={EmptyBodySchema}
              responseSchema={CapabilityGrantSchema}
              after={grants.load}
              submitLabel="revoke"
            />
          ) : null}
        </div>
      ))}
      <details>
        <summary>{t('createGrant')}</summary>
        <NativeForm
          path="/v1/hr/capability-grants"
          inputSchema={CreateCapabilityGrantSchema}
          responseSchema={CapabilityGrantSchema}
          fields={[
            { key: 'granteeId' },
            { key: 'capability', options: HrCapabilitySchema.options },
            { key: 'scope', options: CapabilityScopeSchema.options },
            { key: 'targetId', nullable: true },
            { key: 'activeFrom', type: 'datetime-local' },
            { key: 'activeTo', type: 'datetime-local', nullable: true },
            { key: 'reason', type: 'textarea' },
          ]}
          after={grants.load}
        />
      </details>
    </NativePanel>
  );
}
