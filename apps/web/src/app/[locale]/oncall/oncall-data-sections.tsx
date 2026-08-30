'use client';

import type { useTranslations } from 'next-intl';
import { SectionCard } from '../../../components/SectionCard';
import { StatusBadge } from '../../../components/StatusBadge';
import type { ComplianceResult, OnCallDeployment, OnCallRotation } from './oncall-types';

type TranslationFn = ReturnType<typeof useTranslations>;

export function RotationsSection({
  t,
  rotations,
}: {
  t: TranslationFn;
  rotations: OnCallRotation[];
}) {
  return (
    <SectionCard>
      <h2>{t('rotationsTitle')}</h2>
      {rotations.length === 0 ? (
        <p>{t('noRotations')}</p>
      ) : (
        <ul className="cq-list-stack">
          {rotations.map((rotation) => (
            <li key={rotation.id} className="cq-list-item">
              <div className="cq-list-item-header">
                <div className="cq-list-item-meta">
                  <StatusBadge
                    status={rotation.rotationType}
                    variant="info"
                    label={rotation.rotationType}
                  />
                  <span>
                    {rotation.startTime} &ndash; {rotation.endTime}
                  </span>
                </div>
              </div>
              <p className="cq-mono">{rotation.id}</p>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

export function DeploymentsSection({
  t,
  deployments,
}: {
  t: TranslationFn;
  deployments: OnCallDeployment[];
}) {
  return (
    <SectionCard>
      <h2>{t('deploymentsTitle')}</h2>
      {deployments.length === 0 ? (
        <p>{t('noDeployments')}</p>
      ) : (
        <ul className="cq-list-stack">
          {deployments.map((deployment) => (
            <li key={deployment.id} className="cq-list-item">
              <div className="cq-list-item-header">
                <div className="cq-list-item-meta">
                  <StatusBadge
                    status={deployment.remote ? 'Remote' : 'On-site'}
                    variant={deployment.remote ? 'info' : 'muted'}
                  />
                  <span>
                    {deployment.startTime} &ndash; {deployment.endTime ?? '-'}
                  </span>
                </div>
              </div>
              {deployment.description ? <p>{deployment.description}</p> : null}
              <p className="cq-mono">{deployment.id}</p>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

export function ComplianceSection({
  t,
  compliance,
}: {
  t: TranslationFn;
  compliance: ComplianceResult | null;
}) {
  if (!compliance) {
    return null;
  }

  return (
    <SectionCard>
      <h2>{t('complianceTitle')}</h2>
      <dl className="cq-kv-grid">
        <dt>{t('personIdLabel')}</dt>
        <dd>{compliance.personId}</dd>
        <dt>{t('compliantLabel')}</dt>
        <dd>
          <StatusBadge
            status={compliance.compliant ? 'COMPLIANT' : 'FAIL'}
            label={compliance.compliant ? t('compliantYes') : t('compliantNo')}
          />
        </dd>
        <dt>{t('requiredRestLabel')}</dt>
        <dd>{compliance.minimumRestHours}h</dd>
        <dt>{t('actualRestLabel')}</dt>
        <dd>{compliance.restHoursAfterDeployment}h</dd>
      </dl>
      {compliance.violations.map((violation) => (
        <div key={`${violation.code}:${violation.message}`} className="cq-status-warning">
          {violation.message}
        </div>
      ))}
    </SectionCard>
  );
}
