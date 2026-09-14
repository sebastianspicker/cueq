'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { SectionCard } from '../../components/SectionCard';
import { StatusBanner } from '../../components/StatusBanner';
import type { NativePhase } from './use-native-resource';

export function NativePanel({
  title,
  phase,
  empty,
  reload,
  more,
  children,
}: {
  title: string;
  phase: NativePhase;
  empty?: boolean;
  reload: () => Promise<unknown>;
  more?: () => Promise<unknown>;
  children?: ReactNode;
}) {
  const t = useTranslations('pages.nativeHr');
  return (
    <SectionCard className="cq-native-panel">
      <h2>{t(title)}</h2>
      <button
        type="button"
        className="cq-btn-ghost cq-btn-sm"
        disabled={phase === 'loading'}
        onClick={() => void reload()}
      >
        {t('reload')}
      </button>
      {phase === 'loading' ? <p role="status">{t('loading')}</p> : null}
      {['error', 'restricted', 'conflict', 'unavailable'].includes(phase) ? (
        <StatusBanner error={t(phase)} />
      ) : null}
      {phase === 'ready' && empty ? <p>{t('empty')}</p> : null}
      {phase === 'ready' ? children : null}
      {phase === 'ready' && more ? (
        <button type="button" onClick={() => void more()}>
          {t('more')}
        </button>
      ) : null}
    </SectionCard>
  );
}
export function NativeFacts({ values }: { values: Record<string, unknown> }) {
  const t = useTranslations('pages.nativeHr');
  return (
    <dl className="cq-kv-grid">
      {Object.entries(values).map(([key, value]) => (
        <div key={key}>
          <dt>{t(`fields.${key}`)}</dt>
          <dd>
            {value === null || value === undefined
              ? '—'
              : Array.isArray(value)
                ? value.join(', ')
                : t.has(`values.${String(value)}`)
                  ? t(`values.${String(value)}`)
                  : String(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
