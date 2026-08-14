'use client';

/** Renders the policy administration workspace from its route-owned state. */

import type { useTranslations } from 'next-intl';
import { PageShell } from '../../../components/PageShell';
import { StatusBanner } from '../../../components/StatusBanner';
import {
  PolicyBundleSection,
  PolicyHistorySection,
  TimeThresholdsSection,
  WorkflowPolicySection,
} from './policy-admin-sections';
import type { usePolicyAdminWorkspace } from './use-policy-admin-workspace';

type TranslationFn = ReturnType<typeof useTranslations>;
type PolicyAdminWorkspaceState = ReturnType<typeof usePolicyAdminWorkspace>;

interface PolicyAdminWorkspaceProps {
  t: TranslationFn;
  workspace: PolicyAdminWorkspaceState;
}

/** Hosts the unchanged policy administration shell and section ordering. */
export function PolicyAdminWorkspace({ t, workspace }: PolicyAdminWorkspaceProps) {
  return (
    <PageShell title={t('title')} description={t('description')}>
      <StatusBanner message={workspace.message} error={workspace.error} />
      <WorkflowPolicySection
        t={t}
        loading={workspace.loading}
        wfType={workspace.wfType}
        wfEscDeadline={workspace.wfEscDeadline}
        wfEscRoles={workspace.wfEscRoles}
        wfMaxDepth={workspace.wfMaxDepth}
        onWfTypeChange={workspace.setWfType}
        onWfEscDeadlineChange={workspace.setWfEscDeadline}
        onWfEscRolesChange={workspace.setWfEscRoles}
        onWfMaxDepthChange={workspace.setWfMaxDepth}
        onLoad={() => void workspace.loadWorkflowPolicy()}
        onSave={() => void workspace.saveWorkflowPolicy()}
      />
      <PolicyHistorySection
        t={t}
        loading={workspace.loading}
        history={workspace.wfHistory}
        onLoad={() => void workspace.loadPolicyHistory()}
      />
      <TimeThresholdsSection
        t={t}
        loading={workspace.loading}
        dailyMax={workspace.dailyMax}
        minRest={workspace.minRest}
        onDailyMaxChange={workspace.setDailyMax}
        onMinRestChange={workspace.setMinRest}
        onLoad={() => void workspace.loadTimeThresholds()}
        onSave={() => void workspace.saveTimeThresholds()}
      />
      <PolicyBundleSection
        t={t}
        loading={workspace.loading}
        asOf={workspace.asOf}
        bundle={workspace.bundle}
        onAsOfChange={workspace.setAsOf}
        onLoad={() => void workspace.loadBundle()}
      />
    </PageShell>
  );
}
