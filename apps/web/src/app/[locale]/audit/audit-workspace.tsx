'use client';

/** Renders the audit workspace from its route-owned state. */

import type { useTranslations } from 'next-intl';
import { PageShell } from '../../../components/PageShell';
import { StatusBanner } from '../../../components/StatusBanner';
import {
  AuditEntriesSection,
  AuditSummaryRequestSection,
  AuditSummaryResultsSection,
} from './audit-sections';
import type { useAuditWorkspace } from './use-audit-workspace';

type TranslationFn = ReturnType<typeof useTranslations>;
type AuditWorkspaceState = ReturnType<typeof useAuditWorkspace>;

interface AuditWorkspaceProps {
  t: TranslationFn;
  workspace: AuditWorkspaceState;
}

/** Hosts the unchanged audit shell and section ordering. */
export function AuditWorkspace({ t, workspace }: AuditWorkspaceProps) {
  return (
    <PageShell title={t('title')} description={t('description')}>
      <StatusBanner error={workspace.error} />
      <AuditSummaryRequestSection
        t={t}
        from={workspace.from}
        to={workspace.to}
        loading={workspace.loading}
        onFromChange={workspace.setFrom}
        onToChange={workspace.setTo}
        onLoad={() => void workspace.loadSummary()}
      />
      <AuditSummaryResultsSection
        t={t}
        summary={workspace.summary}
        loading={workspace.loading}
        pageSize={workspace.pageSize}
      />
      <AuditEntriesSection
        t={t}
        loading={workspace.entriesLoading}
        error={workspace.entriesError}
        filterAction={workspace.filterAction}
        filterEntityType={workspace.filterEntityType}
        filterActorId={workspace.filterActorId}
        filterEntityId={workspace.filterEntityId}
        entries={workspace.entries}
        entriesTotal={workspace.entriesTotal}
        entriesSkip={workspace.entriesSkip}
        onFilterActionChange={workspace.setFilterAction}
        onFilterEntityTypeChange={workspace.setFilterEntityType}
        onFilterActorIdChange={workspace.setFilterActorId}
        onFilterEntityIdChange={workspace.setFilterEntityId}
        onLoad={() => void workspace.loadEntriesFromStart()}
        onLoadMore={() => void workspace.loadEntries(workspace.entriesSkip)}
      />
    </PageShell>
  );
}
