import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppWorkspace } from './AppWorkspace';

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
  role: 'HR' | 'EMPLOYEE';
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
  subtitle: 'Arbeitsplatz',
  universityName: 'Universität NRW',
  workforceSection: 'Mitarbeitende',
  operationsSection: 'HR & Betrieb',
  settingsSection: 'Arbeitsplatz',
  skipLink: 'Zum Inhalt springen',
  localeSwitch: 'Sprache',
  errorTitle: 'Etwas ist schiefgelaufen',
  errorRetry: 'Erneut versuchen',
  openNavigation: 'Navigation öffnen',
  closeNavigation: 'Navigation schließen',
  sessionLoading: 'Sitzung wird geprüft',
  sessionReady: 'Verbunden',
  sessionOffline: 'Offline',
  sessionError: 'Verbindung konnte nicht geprüft werden',
  sessionRetry: 'Verbindung erneut prüfen',
  sessionSettings: 'Verbindung und Darstellung',
  organizationUnit: 'Organisationseinheit',
  nav: {
    dashboard: 'Dashboard',
    bookings: 'Meine Buchungen',
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

afterEach(() => {
  connectionKey = 'https://api.example.test|first-token';
  requests.clear();
});

describe('AppWorkspace identity changes', () => {
  it('hides a prior privileged identity while replacement credentials are pending', async () => {
    requests.set(connectionKey, deferred<Profile>());
    const view = renderWorkspace();
    await settleFirstIdentity();

    connectionKey = 'https://api.example.test|replacement-token';
    requests.set(connectionKey, deferred<Profile>());
    await act(async () => {
      view.rerender(
        <AppWorkspace locale="de" altLocale="en" messages={messages}>
          <p>Inhalt</p>
        </AppWorkspace>,
      );
    });

    expect(screen.queryByText('Hanna Recht')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Policy-Admin' })).not.toBeInTheDocument();
    expect(document.querySelector('.cq-session-state')).toHaveAttribute('data-phase', 'loading');
  });

  it('does not restore prior identity when a replacement request fails', async () => {
    requests.set(connectionKey, deferred<Profile>());
    const view = renderWorkspace();
    await settleFirstIdentity();

    connectionKey = 'https://api.example.test|invalid-token';
    const replacement = deferred<Profile>();
    requests.set(connectionKey, replacement);
    await act(async () => {
      view.rerender(
        <AppWorkspace locale="de" altLocale="en" messages={messages}>
          <p>Inhalt</p>
        </AppWorkspace>,
      );
    });
    await act(async () => {
      replacement.reject(new Error('Unauthorized'));
      await replacement.promise.catch(() => undefined);
    });

    await waitFor(() =>
      expect(document.querySelector('.cq-session-state')).toHaveAttribute('data-phase', 'error'),
    );
    expect(screen.queryByText('Hanna Recht')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Policy-Admin' })).not.toBeInTheDocument();
  });

  it('ignores a superseded request that resolves after its abort signal', async () => {
    const first = deferred<Profile>();
    requests.set(connectionKey, first);
    const view = renderWorkspace();

    connectionKey = 'https://api.example.test|second-token';
    const second = deferred<Profile>();
    requests.set(connectionKey, second);
    await act(async () => {
      view.rerender(
        <AppWorkspace locale="de" altLocale="en" messages={messages}>
          <p>Inhalt</p>
        </AppWorkspace>,
      );
    });
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
    expect(screen.queryByRole('link', { name: 'Policy-Admin' })).not.toBeInTheDocument();
  });
});
