'use client';

import { LoadingSpinner } from '../../../components/LoadingSpinner';
import { StatusBanner } from '../../../components/StatusBanner';
import { DashboardContextRail } from './dashboard-context-rail';
import { DashboardHero } from './dashboard-hero';
import { DashboardTasks, OrientationSection } from './dashboard-tasks';
import { DayLedgerSection } from './day-ledger';
import type { TranslationFn } from './types';
import type { useDashboardWorkspace } from './use-dashboard-workspace';

type DashboardWorkspaceState = ReturnType<typeof useDashboardWorkspace>;

/** Renders dashboard state and actions supplied by the route composition boundary. */
export function DashboardWorkspace({
  t,
  locale,
  workspace,
}: {
  t: TranslationFn;
  locale: string;
  workspace: DashboardWorkspaceState;
}) {
  return (
    <section className="cq-dashboard-page" aria-label={t('title')}>
      <DashboardHero
        t={t}
        locale={locale}
        firstName={workspace.firstName}
        loading={workspace.loading}
        summary={workspace.summary}
        onLoad={() => void workspace.loadSummary()}
      />

      {workspace.loading && !workspace.summary ? <LoadingSpinner label={t('loading')} /> : null}
      <StatusBanner message={workspace.message} error={workspace.error} />

      {workspace.summary ? (
        <div className="cq-dashboard-workspace">
          <div className="cq-dashboard-main">
            <DayLedgerSection
              t={t}
              locale={locale}
              summary={workspace.summary}
              bookings={workspace.bookings}
              loading={workspace.loading}
              formatHours={workspace.formatHours}
              onClockIn={() => void workspace.clockIn()}
            />
            <OrientationSection t={t} summary={workspace.summary} />
            <DashboardTasks
              t={t}
              locale={locale}
              loading={workspace.loading}
              summary={workspace.summary}
              overtimeHours={workspace.overtimeHours}
              overtimeReason={workspace.overtimeReason}
              overtimePeriodStart={workspace.overtimePeriodStart}
              overtimePeriodEnd={workspace.overtimePeriodEnd}
              onOvertimeHoursChange={workspace.setOvertimeHours}
              onOvertimeReasonChange={workspace.setOvertimeReason}
              onOvertimePeriodStartChange={workspace.setOvertimePeriodStart}
              onOvertimePeriodEndChange={workspace.setOvertimePeriodEnd}
              onRequestOvertimeApproval={() => void workspace.requestOvertimeApproval()}
            />
          </div>
          <DashboardContextRail
            t={t}
            locale={locale}
            summary={workspace.summary}
            formatHours={workspace.formatHours}
          />
        </div>
      ) : null}
    </section>
  );
}
