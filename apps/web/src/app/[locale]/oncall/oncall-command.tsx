'use client';

import type { useTranslations } from 'next-intl';

type TranslationFn = ReturnType<typeof useTranslations>;

/** Renders command controls for the on-call workspace. */
export function OnCallCommandBar({
  t,
  loading,
  onLoadRotations,
  onLoadDeployments,
  onRunCompliance,
}: {
  t: TranslationFn;
  loading: boolean;
  onLoadRotations: () => void;
  onLoadDeployments: () => void;
  onRunCompliance: () => void;
}) {
  return (
    <div className="cq-flex-wrap">
      <button type="button" disabled={loading} onClick={onLoadRotations}>
        {loading ? t('loading') : t('loadRotations')}
      </button>
      <button type="button" disabled={loading} onClick={onLoadDeployments}>
        {loading ? t('loading') : t('loadDeployments')}
      </button>
      <button type="button" disabled={loading} onClick={onRunCompliance}>
        {loading ? t('loading') : t('runCompliance')}
      </button>
    </div>
  );
}
