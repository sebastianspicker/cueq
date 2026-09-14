'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { OrganizationPicker } from './organization-picker';
import { FormField } from '../../components/FormField';
import { StatusBanner } from '../../components/StatusBanner';
import type { ApiResponseSchema } from '../../platform/http/api-client';
import { nativePayload, type NativeField } from './native-payload';
import { useNativeMutation } from './use-native-resource';

function fieldRequired(field: NativeField) {
  return !field.nullable && !field.optional;
}
export function NativeForm({
  fields,
  path,
  inputSchema,
  responseSchema,
  after,
  defaults = {},
  submitLabel = 'save',
}: {
  fields: NativeField[];
  path: string;
  inputSchema: ApiResponseSchema<unknown>;
  responseSchema: ApiResponseSchema<unknown>;
  after?: () => Promise<unknown>;
  defaults?: Record<string, unknown>;
  submitLabel?: string;
}) {
  const t = useTranslations('pages.nativeHr');
  const [values, setValues] = useState<Record<string, string>>({});
  const [invalid, setInvalid] = useState(false);
  const mutation = useNativeMutation();
  return (
    <form
      className="cq-native-form"
      onSubmit={(event) => {
        event.preventDefault();
        setInvalid(false);
        try {
          const body = inputSchema.parse({ ...defaults, ...nativePayload(fields, values) });
          void mutation.save(path, body, responseSchema, after);
        } catch {
          setInvalid(true);
        }
      }}
    >
      <fieldset disabled={mutation.loading}>
        <div className="cq-grid-2">
          {fields.map((field) => {
            const value = values[field.key] ?? field.defaultValue ?? '';
            const change = (next: string) => setValues((old) => ({ ...old, [field.key]: next }));
            if (field.key.split('.').at(-1) === 'organizationUnitId')
              return (
                <OrganizationPicker
                  key={field.key}
                  value={value}
                  onChange={change}
                  required={fieldRequired(field)}
                />
              );
            return (
              <FormField
                key={field.key}
                label={t(`fields.${field.label ?? field.key.split('.').at(-1)}`)}
              >
                {field.options ? (
                  <select
                    value={value}
                    required={fieldRequired(field)}
                    onChange={(event) => change(event.target.value)}
                  >
                    <option value="">{t('choose')}</option>
                    {field.options.map((option) => (
                      <option key={option} value={option}>
                        {t.has(`values.${option}`) ? t(`values.${option}`) : option}
                      </option>
                    ))}
                  </select>
                ) : ['textarea', 'json', 'list'].includes(field.type ?? '') ? (
                  <textarea
                    value={value}
                    rows={3}
                    required={fieldRequired(field)}
                    onChange={(event) => change(event.target.value)}
                  />
                ) : field.type === 'checkbox' ? (
                  <input
                    type="checkbox"
                    checked={value === 'true'}
                    onChange={(event) => change(String(event.target.checked))}
                  />
                ) : (
                  <input
                    type={field.type === 'numbers' ? 'text' : (field.type ?? 'text')}
                    step={field.type === 'number' ? 'any' : undefined}
                    value={value}
                    required={fieldRequired(field)}
                    onChange={(event) => change(event.target.value)}
                    autoComplete="off"
                  />
                )}
              </FormField>
            );
          })}
        </div>
        <button type="submit">{mutation.loading ? t('loading') : t(submitLabel)}</button>
      </fieldset>
      <StatusBanner error={invalid ? t('invalid') : mutation.error} message={mutation.message} />
    </form>
  );
}
