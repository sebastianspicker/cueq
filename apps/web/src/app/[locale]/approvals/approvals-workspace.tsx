'use client';

import { useEffect } from 'react';
import type { useTranslations } from 'next-intl';
import { PageShell } from '../../../components/PageShell';
import { StatusBanner } from '../../../components/StatusBanner';
import { FiltersSection } from './approvals-filters';
import { InboxSection } from './approvals-inbox';
import { WorkflowDetailSection } from './approvals-detail';
import type { useApprovalsWorkspace } from './use-approvals-workspace';

type TranslationFn = ReturnType<typeof useTranslations>;
type ApprovalsWorkspaceState = ReturnType<typeof useApprovalsWorkspace>;
const KEYBOARD_ACTIONS = { a: 'APPROVE', x: 'REJECT' } as const;

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest('input, select, textarea, [contenteditable="true"]'))
  );
}

function keyboardSelection(
  key: string,
  items: ApprovalsWorkspaceState['items'],
  selectedId: string | null,
) {
  const direction = key === 'j' ? 1 : key === 'k' ? -1 : 0;
  if (direction === 0 || items.length === 0) {
    return null;
  }
  const currentIndex = items.findIndex((item) => item.id === selectedId);
  const nextIndex = Math.min(items.length - 1, Math.max(0, currentIndex + direction));
  return items[nextIndex] ?? null;
}

interface ApprovalsWorkspaceProps {
  t: TranslationFn;
  locale: string;
  workspace: ApprovalsWorkspaceState;
}

export function ApprovalsWorkspace({ t, locale, workspace }: ApprovalsWorkspaceProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isTypingTarget(event.target)
      ) {
        return;
      }
      const next = keyboardSelection(event.key, workspace.items, workspace.selectedId);
      if (next) {
        event.preventDefault();
        void workspace.loadDetail(next.id);
        return;
      }
      const action = KEYBOARD_ACTIONS[event.key as keyof typeof KEYBOARD_ACTIONS];
      if (
        workspace.loading ||
        !workspace.detail ||
        !action ||
        !workspace.detail.availableActions.includes(action)
      ) {
        return;
      }
      event.preventDefault();
      void workspace.applyAction(action);
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [workspace]);

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
          selectedId={workspace.selectedId}
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
          onApplyAction={(action) => void workspace.applyAction(action)}
        />
      </div>
      {workspace.nextCursor ? (
        <button
          type="button"
          disabled={workspace.loading}
          onClick={() => void workspace.loadMore()}
        >
          {t('loadMore')}
        </button>
      ) : null}
    </PageShell>
  );
}
