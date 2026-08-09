const screens = [
  {
    title: 'Today and time balance',
    role: 'Employee',
    summary:
      'The employee view brings the daily time ledger, current balance, recent bookings, and common next actions into one operational workspace.',
    image: './assets/screenshots/alpha/01-dashboard.png',
    width: 1440,
    height: 937,
    alt: 'cueq employee dashboard populated with synthetic time and balance records',
    actions: [
      'Load dashboard data',
      'Clock in or out',
      'Request leave',
      'Request overtime approval',
    ],
  },
  {
    title: 'Leave balance and absences',
    role: 'Employee',
    summary:
      'Entitlement, remaining leave, and personal absence records are shown together so a request can be understood in its current context.',
    image: './assets/screenshots/alpha/02-leave.png',
    width: 1440,
    height: 1231,
    alt: 'cueq leave workspace populated with synthetic entitlement and absence records',
    actions: ['Load leave balance', 'Load personal absences', 'Submit an absence request'],
  },
  {
    title: 'Published roster and plan versus actual',
    role: 'Shift planner',
    summary:
      'A published roster connects shift coverage, named assignments, and plan-versus-actual evidence for an operational planning role.',
    image: './assets/screenshots/alpha/03-roster.png',
    width: 1440,
    height: 1785,
    alt: 'cueq roster workspace populated with synthetic shifts and staff assignments',
    actions: [
      'Load the current roster',
      'Create or edit a roster',
      'Assign or remove staff',
      'Submit a shift swap',
    ],
  },
  {
    title: 'Approval inbox and decision context',
    role: 'Team lead',
    summary:
      'The approval view keeps the request, workflow state, and decision context together before a team lead acts.',
    image: './assets/screenshots/alpha/04-approvals.png',
    width: 1440,
    height: 1125,
    alt: 'cueq approval inbox populated with a synthetic leave request',
    actions: [
      'Load the approval inbox',
      'Open request details',
      'Approve or reject a request',
      'Delegate a decision',
    ],
  },
  {
    title: 'Monthly closing evidence',
    role: 'HR',
    summary:
      'Closing periods, readiness checks, export evidence, and exception state are grouped into a controlled monthly workflow.',
    image: './assets/screenshots/alpha/05-closing.png',
    width: 1440,
    height: 2106,
    alt: 'cueq monthly closing workspace populated with synthetic readiness and export evidence',
    actions: [
      'Load closing periods',
      'Review or approve closing',
      'Reopen a period',
      'Create or download an export',
      'Submit a post-close correction',
    ],
  },
  {
    title: 'Aggregate and compliance reports',
    role: 'HR',
    summary:
      'Aggregate absence and compliance views demonstrate reporting guardrails without exposing real or individual workforce data.',
    image: './assets/screenshots/alpha/06-reports.png',
    width: 1440,
    height: 1661,
    alt: 'cueq reports workspace populated with synthetic aggregate and compliance data',
    actions: ['Load aggregate reports', 'Change reporting filters', 'Prepare a report export'],
  },
];

const tabs = Array.from(document.querySelectorAll('[data-screen]'));
const title = document.querySelector('#screen-title');
const meta = document.querySelector('#screen-meta');
const summary = document.querySelector('#screen-summary');
const actions = document.querySelector('#screen-actions');
const image = document.querySelector('#screen-image');
const caption = document.querySelector('#screen-caption');
const position = document.querySelector('#screen-position');
const previous = document.querySelector('#previous-screen');
const next = document.querySelector('#next-screen');
const panel = document.querySelector('#demo-panel');
let currentScreen = 0;

function renderScreen(index, { focusTab = false } = {}) {
  currentScreen = Math.max(0, Math.min(index, screens.length - 1));
  const screen = screens[currentScreen];

  title.textContent = screen.title;
  meta.textContent = `Screen ${String(currentScreen + 1).padStart(2, '0')} · ${screen.role}`;
  summary.textContent = screen.summary;
  actions.replaceChildren(
    ...screen.actions.map((action) => {
      const item = document.createElement('li');
      const label = document.createElement('span');
      label.className = 'demo-simulated-label';
      label.textContent = 'Simulated';
      item.append(label, document.createTextNode(action));
      return item;
    }),
  );
  image.src = screen.image;
  image.alt = screen.alt;
  image.width = screen.width;
  image.height = screen.height;
  caption.textContent = `${screen.title}. Captured from deterministic sanitized fixtures; controls shown in the image do not run.`;
  position.textContent = `${currentScreen + 1} of ${screens.length}`;
  previous.disabled = currentScreen === 0;
  next.disabled = currentScreen === screens.length - 1;
  panel.setAttribute('aria-labelledby', `screen-tab-${currentScreen + 1}`);

  tabs.forEach((tab, tabIndex) => {
    const selected = tabIndex === currentScreen;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected && focusTab) tab.focus();
  });

  window.history.replaceState(null, '', `#screen-${currentScreen + 1}`);
}

tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => renderScreen(index));
  tab.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const nextIndex = Math.max(
      0,
      Math.min(
        screens.length - 1,
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? screens.length - 1
            : currentScreen + (event.key === 'ArrowRight' ? 1 : -1),
      ),
    );
    renderScreen(nextIndex, { focusTab: true });
  });
});

previous.addEventListener('click', () => renderScreen(currentScreen - 1));
next.addEventListener('click', () => renderScreen(currentScreen + 1));

const requestedScreen = Number.parseInt(window.location.hash.replace('#screen-', ''), 10) - 1;
renderScreen(Number.isInteger(requestedScreen) ? requestedScreen : 0);

window.addEventListener('hashchange', () => {
  const hashScreen = Number.parseInt(window.location.hash.replace('#screen-', ''), 10) - 1;
  if (Number.isInteger(hashScreen) && hashScreen !== currentScreen) renderScreen(hashScreen);
});
