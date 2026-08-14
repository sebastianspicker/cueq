'use client';

/** Renders the approvals workspace from its route-owned state and locale. */

import type { useTranslations } from 'next-intl';
import { PageShell } from '../../../components/PageShell';
import { StatusBanner } from '../../../components/StatusBanner';
import { FiltersSection } from './approvals-filters';
import { InboxSection } from './approvals-inbox';
import { WorkflowDetailSection } from './approvals-detail';
import type { useApprovalsWorkspace } from './use-approvals-workspace';

type TranslationFn = ReturnType<typeof useTranslations>;
type ApprovalsWorkspaceState = ReturnType<typeof useApprovalsWorkspace>;

interface ApprovalsWorkspaceProps {
  t: TranslationFn;
  locale: string;
  workspace: ApprovalsWorkspaceState;
}

/** Hosts the unchanged approvals shell and workflow interaction order. */
export function ApprovalsWorkspace({ t, locale, workspace }: ApprovalsWorkspaceProps) {
  return (
    <PageShell
      title={t('title')}
      description={t('description')}
      breadcrumbs={[{ label: 'cueq', href: `/${locale}` }, { label: t('title') }]}
    >
      <FiltersSection
        t={t}
        loading={workspace.loading}
        statusFilter={workspace.statusFilter}
        typeFilter={workspace.typeFilter}
        overdueOnly={workspace.overdueOnly}
        onStatusFilterChange={workspace.setStatusFilter}
        onTypeFilterChange={workspace.setTypeFilter}
        onOverdueOnlyChange={workspace.setOverdueOnly}
        onLoadInbox={() => void workspace.loadInbox()}
      />

      <StatusBanner message={workspace.message} error={workspace.error} />

      <div className="cq-workspace-split">
        <InboxSection
          t={t}
          items={workspace.items}
          loading={workspace.loading}
          onLoadDetail={(workflowId) => void workspace.loadDetail(workflowId)}
        />
        <WorkflowDetailSection
          t={t}
          loading={workspace.loading}
          detail={workspace.detail}
          action={workspace.action}
          delegateToId={workspace.delegateToId}
          reason={workspace.reason}
          onActionChange={workspace.setAction}
          onDelegateToIdChange={workspace.setDelegateToId}
          onReasonChange={workspace.setReason}
          onApplyAction={() => void workspace.applyAction()}
        />
      </div>
    </PageShell>
  );
}
