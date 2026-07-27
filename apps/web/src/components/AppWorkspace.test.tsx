import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppWorkspace, type CueqRole } from './AppWorkspace';

let connectionKey = 'https://api.example.test|first-token';
const requests = new Map<string, Deferred<Profile>>();
const apiRequest = () => {
  const request = requests.get(connectionKey);
  if (!request) {
    throw new Error(`Missing deferred request for ${connectionKey}`);
  }
  return request.promise;
};

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.ComponentProps<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/de/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('../lib/api-context', () => ({
  useApiContext: () => ({
    connectionKey,
    apiRequest,
  }),
}));

interface Profile {
  id: string;
  email: string;
  role: CueqRole;
  organizationUnitId: string;
  firstName: string;
  lastName: string;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

const messages = {
  title: 'cueq',
  brandDescriptor: 'Zeiterfassung, Abwesenheit und Dienstplanung für Hochschulen',
  universityName: 'Universität NRW',
  workforceSection: 'Mitarbeitende',
  operationsSection: 'HR & Betrieb',
  todaySection: 'Heute',
  timeSection: 'Zeit & Abwesenheit',
  planningSection: 'Planung',
  decisionsSection: 'Freigaben & Abschluss',
  insightsSection: 'Auswertung',
  settingsSection: 'Arbeitsplatz',
  skipLink: 'Zum Inhalt springen',
  localeSwitch: 'Sprache',
  errorTitle: 'Etwas ist schiefgelaufen',
  errorRetry: 'Erneut versuchen',
  openNavigation: 'Navigation öffnen',
  closeNavigation: 'Navigation schließen',
  navigationMenu: 'Menü',
  sessionLoading: 'Sitzung wird geprüft',
  sessionReady: 'Verbunden',
  sessionOffline: 'Offline',
  sessionError: 'Verbindung konnte nicht geprüft werden',
  sessionRetry: 'Verbindung erneut prüfen',
  sessionSettings: 'Verbindung und Darstellung',
  organizationUnit: 'Organisationseinheit',
  nav: {
    dashboard: 'Heute',
    bookings: 'Buchungen',
    leave: 'Abwesenheiten',
    teamCalendar: 'Team-Kalender',
    roster: 'Dienstplan',
    oncall: 'Rufbereitschaft',
    approvals: 'Freigaben',
    closing: 'Monatsabschluss',
    reports: 'Berichte',
    policyAdmin: 'Policy-Admin',
    timeEngine: 'Time Engine',
    audit: 'Audit-Protokoll',
    settings: 'Einstellungen',
  },
  roles: {
    EMPLOYEE: 'Mitarbeitende',
    TEAM_LEAD: 'Teamleitung',
    SHIFT_PLANNER: 'Dienstplanung',
    HR: 'Personalstelle',
    PAYROLL: 'Bezügestelle',
    ADMIN: 'Administration',
    DATA_PROTECTION: 'Datenschutz',
    WORKS_COUNCIL: 'Personalrat',
  },
} as const;

const hrProfile: Profile = {
  id: 'hr-1',
  email: 'hr@example.test',
  role: 'HR',
  organizationUnitId: 'ou-1',
  firstName: 'Hanna',
  lastName: 'Recht',
};

function renderWorkspace() {
  return render(
    <AppWorkspace locale="de" altLocale="en" messages={messages}>
      <p>Inhalt</p>
    </AppWorkspace>,
  );
}

async function rerenderWorkspace(view: ReturnType<typeof renderWorkspace>) {
  await act(async () => {
    view.rerender(
      <AppWorkspace locale="de" altLocale="en" messages={messages}>
        <p>Inhalt</p>
      </AppWorkspace>,
    );
  });
}

async function replaceCredentials(
  view: ReturnType<typeof renderWorkspace>,
  nextConnectionKey: string,
) {
  connectionKey = nextConnectionKey;
  const request = deferred<Profile>();
  requests.set(connectionKey, request);
  await rerenderWorkspace(view);
  return request;
}

async function settleFirstIdentity() {
  const request = requests.get(connectionKey);
  if (!request) {
    throw new Error(`Missing initial request for ${connectionKey}`);
  }
  await act(async () => {
    request.resolve(hrProfile);
    await request.promise;
  });
  await waitFor(() => expect(screen.getByText('Hanna Recht')).toBeVisible());
}

async function renderSettledWorkspace() {
  requests.set(connectionKey, deferred<Profile>());
  const view = renderWorkspace();
  await settleFirstIdentity();
  return view;
}

afterEach(() => {
  connectionKey = 'https://api.example.test|first-token';
  requests.clear();
});

describe('AppWorkspace identity changes', () => {
  it('contains keyboard focus in the open compact navigation and restores it on Escape', async () => {
    await renderSettledWorkspace();
    const toggle = screen.getByRole('button', { name: 'Navigation öffnen' });

    fireEvent.click(toggle);

    const navigation = document.getElementById('workspace-navigation');
    expect(navigation).not.toBeNull();
    // Flat task nav: dashboard uses todaySection ("Heute") and is active on /dashboard.
    const firstLink = within(navigation as HTMLElement).getByRole('link', { name: 'Heute' });
    await waitFor(() => expect(firstLink).toHaveFocus());
    expect(document.querySelector('#main-content')).toHaveAttribute('inert');

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(toggle).toHaveFocus();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(document.querySelector('#main-content')).not.toHaveAttribute('inert');
  });

  it('hides team calendar navigation from roles outside the API allowlist', async () => {
    const view = await renderSettledWorkspace();
    // Flat task links are always present in chrome + drawer when the role allows them.
    expect(screen.getAllByRole('link', { name: 'Team-Kalender' }).length).toBeGreaterThan(0);

    const replacement = await replaceCredentials(view, 'https://api.example.test|admin-token');
    await act(async () => {
      replacement.resolve({ ...hrProfile, role: 'ADMIN' });
      await replacement.promise;
    });

    await waitFor(() =>
      expect(document.querySelector('.cq-session-person')).toHaveTextContent('Administration'),
    );
    expect(screen.queryAllByRole('link', { name: 'Team-Kalender' })).toHaveLength(0);
  });

  it('hides a prior privileged identity while replacement credentials are pending', async () => {
    const view = await renderSettledWorkspace();

    await replaceCredentials(view, 'https://api.example.test|replacement-token');

    expect(screen.queryByText('Hanna Recht')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('link', { name: 'Policy-Admin' })).toHaveLength(0);
    expect(document.querySelector('.cq-session-state')).toHaveAttribute('data-phase', 'loading');
  });

  it('does not restore prior identity when a replacement request fails', async () => {
    const view = await renderSettledWorkspace();

    const replacement = await replaceCredentials(view, 'https://api.example.test|invalid-token');
    await act(async () => {
      replacement.reject(new Error('Unauthorized'));
      await replacement.promise.catch(() => undefined);
    });

    await waitFor(() =>
      expect(document.querySelector('.cq-session-state')).toHaveAttribute('data-phase', 'error'),
    );
    expect(screen.queryByText('Hanna Recht')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('link', { name: 'Policy-Admin' })).toHaveLength(0);
  });

  it('ignores a superseded request that resolves after its abort signal', async () => {
    const first = deferred<Profile>();
    requests.set(connectionKey, first);
    const view = renderWorkspace();

    const second = await replaceCredentials(view, 'https://api.example.test|second-token');
    await act(async () => {
      first.resolve(hrProfile);
      await first.promise;
    });

    expect(screen.queryByText('Hanna Recht')).not.toBeInTheDocument();
    await act(async () => {
      second.resolve({ ...hrProfile, firstName: 'Erika', role: 'EMPLOYEE' });
      await second.promise;
    });
    await waitFor(() => expect(screen.getByText('Erika Recht')).toBeVisible());
    expect(screen.queryAllByRole('link', { name: 'Policy-Admin' })).toHaveLength(0);
  });
});
