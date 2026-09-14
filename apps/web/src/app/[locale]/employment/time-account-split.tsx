'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { SplitTimeAccountResultSchema, type TimeAccount } from '@cueq/contracts';
import { FormField } from '../../../components/FormField';
import { StatusBanner } from '../../../components/StatusBanner';
import { useNativeMutation } from '../../../shared/native-hr/use-native-resource';
import {
  segmentFields,
  emptyAccountSegment,
  splitAccountPayload,
  type AccountSegmentDraft,
} from './time-account-draft';

export function TimeAccountSplit({
  account,
  after,
}: {
  account: TimeAccount;
  after: () => Promise<unknown>;
}) {
  const t = useTranslations('pages.nativeHr');
  const [segments, setSegments] = useState<AccountSegmentDraft[]>(() => [
    emptyAccountSegment(),
    emptyAccountSegment(),
  ]);
  const [reason, setReason] = useState('');
  const [invalid, setInvalid] = useState(false);
  const mutation = useNativeMutation();
  return (
    <details>
      <summary>{t('splitAccount')}</summary>
      <p>{t('splitAccountDescription')}</p>
      <form
        className="cq-native-form"
        onSubmit={(event) => {
          event.preventDefault();
          setInvalid(false);
          try {
            const body = splitAccountPayload(account, reason, segments);
            void mutation.save(
              `/v1/time-accounts/${account.id}/split`,
              body,
              SplitTimeAccountResultSchema,
              after,
            );
          } catch {
            setInvalid(true);
          }
        }}
      >
        <fieldset disabled={mutation.loading}>
          <FormField label={t('fields.reason')}>
            <textarea
              value={reason}
              required
              minLength={10}
              maxLength={1000}
              onChange={(event) => setReason(event.target.value)}
            />
          </FormField>
          {segments.map((segment, index) => (
            <fieldset key={index} className="cq-list-item">
              <legend>{t('accountSegment', { number: index + 1 })}</legend>
              <div className="cq-grid-2">
                {segmentFields.map((key) => (
                  <FormField key={key} label={t(`fields.${key}`)}>
                    <input
                      type={
                        key === 'periodStart' || key === 'periodEnd' ? 'datetime-local' : 'number'
                      }
                      step={key === 'periodStart' || key === 'periodEnd' ? 1 : 'any'}
                      required
                      value={segment[key]}
                      onChange={(event) =>
                        setSegments((old) =>
                          old.map((item, position) =>
                            position === index ? { ...item, [key]: event.target.value } : item,
                          ),
                        )
                      }
                    />
                  </FormField>
                ))}
              </div>
              <button
                type="button"
                disabled={segments.length <= 2}
                onClick={() =>
                  setSegments((old) => old.filter((_item, position) => position !== index))
                }
              >
                {t('removeSegment')}
              </button>
            </fieldset>
          ))}
          <button
            type="button"
            disabled={segments.length >= 100}
            onClick={() => setSegments((old) => [...old, emptyAccountSegment()])}
          >
            {t('addSegment')}
          </button>
          <button type="submit">{mutation.loading ? t('loading') : t('splitAccount')}</button>
        </fieldset>
      </form>
      <StatusBanner
        message={mutation.message}
        error={invalid ? t('invalidSplit') : mutation.error}
      />
    </details>
  );
}
