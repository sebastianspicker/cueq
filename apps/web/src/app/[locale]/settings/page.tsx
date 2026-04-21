'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { FormField } from '../../../components/FormField';
import { PageShell } from '../../../components/PageShell';
import { SectionCard } from '../../../components/SectionCard';
import { StatusBanner } from '../../../components/StatusBanner';
import { useApiContext } from '../../../lib/api-context';

export default function SettingsPage() {
  const t = useTranslations('pages.settings');
  const { apiBaseUrl, setApiBaseUrl, token, setToken } = useApiContext();

  const [theme, setTheme] = useState('system');
  const [pageSize, setPageSize] = useState('20');
  const [message, setMessage] = useState<string | null>(null);

  function handleSave() {
    try {
      localStorage.setItem('cq-theme', theme);
      localStorage.setItem('cq-page-size', pageSize);
      setMessage(t('saved'));
    } catch {
      // localStorage unavailable
    }
  }

  return (
    <PageShell title={t('title')} description={t('description')}>
      <SectionCard>
        <h2>{t('connectionTitle')}</h2>
        <div className="cq-grid-2">
          <FormField label={t('apiBaseLabel')}>
            <input
              value={apiBaseUrl}
              onChange={(e) => setApiBaseUrl(e.target.value)}
              autoComplete="off"
            />
          </FormField>
          <FormField label={t('tokenLabel')}>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="mock.eyJzdWIiOiJjLi4uIn0"
              autoComplete="off"
            />
          </FormField>
        </div>
      </SectionCard>

      <SectionCard>
        <h2>{t('preferencesTitle')}</h2>
        <div className="cq-grid-3">
          <FormField label={t('themeLabel')}>
            <select value={theme} onChange={(e) => setTheme(e.target.value)}>
              <option value="system">{t('themeSystem')}</option>
              <option value="light">{t('themeLight')}</option>
              <option value="dark">{t('themeDark')}</option>
            </select>
          </FormField>
          <FormField label={t('pageSizeLabel')}>
            <select value={pageSize} onChange={(e) => setPageSize(e.target.value)}>
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </FormField>
        </div>

        <button type="button" onClick={handleSave}>
          {t('save')}
        </button>
      </SectionCard>

      <StatusBanner message={message} />
    </PageShell>
  );
}
