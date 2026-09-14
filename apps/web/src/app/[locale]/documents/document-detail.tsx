'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  DocumentAcknowledgementSchema,
  PersonnelDocumentDetailSchema,
  PersonnelDocumentVersionPageSchema,
  PersonnelDocumentVersionSchema,
  type PersonnelDocumentVersion,
} from '@cueq/contracts';
import { FormField } from '../../../components/FormField';
import { StatusBanner } from '../../../components/StatusBanner';
import { NativeFacts, NativePanel } from '../../../shared/native-hr/native-panels';
import {
  useNativeCollection,
  useNativeMutation,
  useNativeResource,
} from '../../../shared/native-hr/use-native-resource';
import { documentUploadRequest } from './document-transfer';
import { useDocumentDownload } from './use-document-download';

export function DocumentDetail({ documentId }: { documentId: string }) {
  const resource = useNativeResource(`/v1/documents/${documentId}`, PersonnelDocumentDetailSchema);
  return (
    <NativePanel title="documentDetail" phase={resource.phase} reload={resource.load}>
      {resource.data ? (
        <>
          <h3>{resource.data.title}</h3>
          <NativeFacts
            values={{
              personId: resource.data.personId,
              assignmentId: resource.data.assignmentId,
              expiresAt: resource.data.expiresAt,
              retainUntil: resource.data.retainUntil,
            }}
          />
          <DocumentVersions
            documentId={documentId}
            latestVersion={resource.data.latestVersion}
            onUploaded={resource.load}
          />
        </>
      ) : null}
    </NativePanel>
  );
}
function DocumentVersions({
  documentId,
  latestVersion,
  onUploaded,
}: {
  documentId: string;
  latestVersion: number;
  onUploaded: () => Promise<unknown>;
}) {
  const resource = useNativeCollection(
    `/v1/documents/${documentId}/versions`,
    PersonnelDocumentVersionPageSchema,
  );
  return (
    <NativePanel
      title="versions"
      phase={resource.phase}
      empty={!resource.data?.items.length}
      reload={resource.load}
      more={resource.data?.nextCursor ? resource.more : undefined}
    >
      {resource.data?.items.map((version) => (
        <DocumentVersion
          key={version.id}
          documentId={documentId}
          version={version}
          reload={resource.load}
        />
      ))}
      <DocumentUpload documentId={documentId} expectedVersion={latestVersion} reload={onUploaded} />
    </NativePanel>
  );
}
function DocumentUpload({
  documentId,
  expectedVersion,
  reload,
}: {
  documentId: string;
  expectedVersion: number;
  reload: () => Promise<unknown>;
}) {
  const t = useTranslations('pages.nativeHr');
  const [file, setFile] = useState<File | null>(null);
  const [invalid, setInvalid] = useState(false);
  const mutation = useNativeMutation();
  return (
    <details>
      <summary>{t('uploadVersion')}</summary>
      <p>{t('uploadDescription')}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setInvalid(false);
          try {
            if (!file) throw new Error('File required');
            const request = documentUploadRequest(documentId, expectedVersion, file);
            void mutation.send(request.path, request.init, PersonnelDocumentVersionSchema, reload);
          } catch {
            setInvalid(true);
          }
        }}
      >
        <FormField label={t('fields.documentFile')}>
          <input
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            required
            disabled={mutation.loading}
            onChange={(event) => {
              setInvalid(false);
              setFile(event.target.files?.[0] ?? null);
            }}
          />
        </FormField>
        {file ? (
          <p>
            {file.name} · {file.size} {t('bytes')}
          </p>
        ) : null}
        <button type="submit" disabled={!file || mutation.loading}>
          {mutation.loading ? t('loading') : t('uploadVersion')}
        </button>
      </form>
      <StatusBanner
        message={mutation.message}
        error={invalid ? t('invalidDocument') : mutation.error}
      />
    </details>
  );
}
function DocumentVersion({
  documentId,
  version,
  reload,
}: {
  documentId: string;
  version: PersonnelDocumentVersion;
  reload: () => Promise<unknown>;
}) {
  const t = useTranslations('pages.nativeHr');
  const download = useDocumentDownload();
  const mutation = useNativeMutation();
  return (
    <div className="cq-list-item">
      <NativeFacts
        values={{
          version: version.version,
          mimeType: version.mimeType,
          sizeBytes: version.sizeBytes,
          createdAt: version.createdAt,
          acknowledgedAt: version.acknowledgedAt,
        }}
      />
      <button
        type="button"
        disabled={download.loading}
        onClick={() => void download.download(documentId, version)}
      >
        {download.loading ? t('loading') : t('download')}
      </button>
      {!version.acknowledgedAt ? (
        <>
          <p>{t('acknowledgementDescription')}</p>
          <button
            type="button"
            disabled={mutation.loading}
            onClick={() =>
              void mutation.save(
                `/v1/documents/${documentId}/versions/${version.id}/acknowledgements`,
                {},
                DocumentAcknowledgementSchema,
                reload,
              )
            }
          >
            {t('acknowledgeVersion', { version: version.version })}
          </button>
        </>
      ) : null}
      <StatusBanner error={download.error ?? mutation.error} message={mutation.message} />
    </div>
  );
}
