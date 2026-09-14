'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { PersonnelOrganizationPageSchema } from '@cueq/contracts';
import { FormField } from '../../components/FormField';
import { useNativeCollection } from './use-native-resource';

export function OrganizationPicker({
  value,
  onChange,
  required = false,
}: {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  const t = useTranslations('pages.nativeHr');
  const [manual, setManual] = useState(false);
  const resource = useNativeCollection(
    '/v1/personnel/organizations',
    PersonnelOrganizationPageSchema,
  );
  return (
    <div>
      <FormField label={t('fields.organizationUnitId')}>
        {manual ? (
          <input
            value={value}
            required={required}
            onChange={(event) => onChange(event.target.value)}
          />
        ) : (
          <select
            value={value}
            required={required}
            disabled={resource.phase === 'loading' || resource.phase === 'restricted'}
            onChange={(event) => onChange(event.target.value)}
          >
            <option value="">{t('choose')}</option>
            {resource.data?.items.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
        )}
      </FormField>
      <button
        type="button"
        className="cq-btn-ghost cq-btn-sm"
        onClick={() => setManual((value) => !value)}
      >
        {manual ? t('chooseOrganizationName') : t('enterOrganizationId')}
      </button>
      {resource.phase === 'loading' ? <p role="status">{t('loading')}</p> : null}
      {resource.phase === 'ready' && resource.data?.items.length === 0 ? <p>{t('empty')}</p> : null}
      {['restricted', 'conflict', 'error', 'unavailable'].includes(resource.phase) ? (
        <p role="alert">{t(resource.phase)}</p>
      ) : null}
      {resource.data?.nextCursor ? (
        <button
          type="button"
          disabled={resource.phase === 'loading'}
          onClick={() => void resource.more()}
        >
          {t('more')}
        </button>
      ) : null}
      {resource.phase === 'error' ? (
        <button type="button" onClick={() => void resource.load()}>
          {t('reload')}
        </button>
      ) : null}
    </div>
  );
}
