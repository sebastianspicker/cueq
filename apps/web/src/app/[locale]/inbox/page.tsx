'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { InboxNotificationPageSchema, InboxNotificationSchema } from '@cueq/contracts';
import { PageShell } from '../../../components/PageShell';
import { NativeForm } from '../../../shared/native-hr/native-form';
import { NativeFacts, NativePanel } from '../../../shared/native-hr/native-panels';
import { useNativeCollection } from '../../../shared/native-hr/use-native-resource';

const EmptyBodySchema = { parse: () => ({}) };
export default function InboxPage() {
  const t = useTranslations('pages.nativeHr');
  const locale = useLocale();
  const resource = useNativeCollection('/v1/inbox', InboxNotificationPageSchema);
  return (
    <PageShell title={t('inboxTitle')} description={t('inboxDescription')}>
      <NativePanel
        title="notifications"
        phase={resource.phase}
        empty={!resource.data?.items.length}
        reload={resource.load}
        more={resource.data?.nextCursor ? resource.more : undefined}
      >
        <ul className="cq-list-stack">
          {resource.data?.items.map((item) => (
            <li className="cq-list-item" key={item.id}>
              <strong>{t(`values.${item.messageCode}`)}</strong>
              <NativeFacts values={{ createdAt: item.createdAt, readAt: item.readAt }} />
              <Link
                className="cq-session-settings"
                href={`/${locale}/${item.resourceType === 'PersonnelDocument' ? 'documents' : 'tasks'}`}
              >
                {t('openResource')}
              </Link>
              {!item.readAt ? (
                <NativeForm
                  path={`/v1/inbox/${item.id}/read`}
                  inputSchema={EmptyBodySchema}
                  responseSchema={InboxNotificationSchema}
                  fields={[]}
                  after={resource.load}
                  submitLabel="markRead"
                />
              ) : null}
            </li>
          ))}
        </ul>
      </NativePanel>
    </PageShell>
  );
}
