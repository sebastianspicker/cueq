'use client';

import type { useTranslations } from 'next-intl';
import { SectionCard } from '../../../components/SectionCard';
import { StatusBadge } from '../../../components/StatusBadge';
import type { RosterDetail } from './roster-types';

type TranslationFn = ReturnType<typeof useTranslations>;

export function RosterCommandBar({
  t,
  loading,
  roster,
  onLoadCurrentRoster,
  onCreateDraftRoster,
  onPublishRoster,
  canManage,
}: {
  t: TranslationFn;
  loading: boolean;
  roster: RosterDetail | null;
  onLoadCurrentRoster: () => void;
  onCreateDraftRoster: () => void;
  onPublishRoster: () => void;
  canManage: boolean;
}) {
  const canPublish = canManage && roster?.status === 'DRAFT';
  return (
    <div className="cq-inline-actions">
      <button type="button" disabled={loading} onClick={onLoadCurrentRoster}>
        {loading ? t('loading') : t('loadCurrent')}
      </button>
      {canManage ? (
        <>
          <button type="button" disabled={loading} onClick={onCreateDraftRoster}>
            {t('createDraft')}
          </button>
          <button
            type="button"
            disabled={loading || !canPublish}
            aria-describedby={!canPublish ? 'roster-publish-reason' : undefined}
            onClick={onPublishRoster}
          >
            {t('publish')}
          </button>
        </>
      ) : null}
      {canManage && !canPublish ? (
        <span id="roster-publish-reason" className="cq-form-hint">
          {t('draftActionsUnavailable')}
        </span>
      ) : null}
    </div>
  );
}

export function RosterDetailSection({
  t,
  roster,
}: {
  t: TranslationFn;
  roster: RosterDetail | null;
}) {
  if (!roster) {
    return null;
  }

  return (
    <SectionCard>
      <h2>{t('rosterDetail')}</h2>
      <dl className="cq-kv-grid">
        <dt>{t('status')}</dt>
        <dd>
          <StatusBadge status={roster.status} />
        </dd>
        <dt>{t('period')}</dt>
        <dd>
          {roster.periodStart} &ndash; {roster.periodEnd}
        </dd>
      </dl>
    </SectionCard>
  );
}

export function DraftRosterSection({
  t,
  draftOrganizationUnitId,
  draftPeriodStart,
  draftPeriodEnd,
  onDraftOrganizationUnitIdChange,
  onDraftPeriodStartChange,
  onDraftPeriodEndChange,
  canManage,
}: {
  t: TranslationFn;
  draftOrganizationUnitId: string;
  draftPeriodStart: string;
  draftPeriodEnd: string;
  onDraftOrganizationUnitIdChange: (value: string) => void;
  onDraftPeriodStartChange: (value: string) => void;
  onDraftPeriodEndChange: (value: string) => void;
  canManage: boolean;
}) {
  if (!canManage) {
    return null;
  }
  return (
    <SectionCard>
      <h2>{t('createDraft')}</h2>
      <div className="cq-grid-3">
        <label className="cq-form-field">
          <span>{t('organizationUnitId')}</span>
          <input
            value={draftOrganizationUnitId}
            onChange={(event) => onDraftOrganizationUnitIdChange(event.target.value)}
          />
        </label>

        <label className="cq-form-field">
          <span>{t('periodStart')}</span>
          <input
            type="datetime-local"
            value={draftPeriodStart}
            onChange={(event) => onDraftPeriodStartChange(event.target.value)}
          />
        </label>

        <label className="cq-form-field">
          <span>{t('periodEnd')}</span>
          <input
            type="datetime-local"
            value={draftPeriodEnd}
            onChange={(event) => onDraftPeriodEndChange(event.target.value)}
          />
        </label>
      </div>
    </SectionCard>
  );
}
