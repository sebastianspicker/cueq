'use client';

import { useTranslations } from 'next-intl';
import type { PrepareTimeAccountsResultSchema } from '@cueq/contracts';
import { SectionCard } from '../../../components/SectionCard';
import { StatusBanner } from '../../../components/StatusBanner';
import type { ClosingPeriod } from './closing-types';

export function PrepareClosingAccounts({
  period,
  disabled,
  onPrepare,
  result,
}: {
  period: ClosingPeriod;
  disabled: boolean;
  onPrepare: () => void;
  result: ReturnType<typeof PrepareTimeAccountsResultSchema.parse> | null;
}) {
  const t = useTranslations('pages.closing');
  return (
    <SectionCard>
      <h2>{t('prepareAccountsTitle')}</h2>
      <p>{t('prepareAccountsDescription')}</p>
      <button type="button" disabled={disabled || period.status !== 'OPEN'} onClick={onPrepare}>
        {t('prepareAccounts')}
      </button>
      {period.status !== 'OPEN' ? <p>{t('prepareAccountsUnavailable')}</p> : null}
      <StatusBanner
        message={
          result?.closingPeriodId === period.id
            ? t('accountsPrepared', { created: result.created, existing: result.existing })
            : null
        }
      />
    </SectionCard>
  );
}
