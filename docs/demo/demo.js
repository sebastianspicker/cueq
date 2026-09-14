const demoData = {
  bookings: [
    {
      id: 'b1',
      date: '31.08.2026',
      type: 'Kommen',
      time: '08:07',
      source: 'Terminal',
      status: 'Bestätigt',
    },
    {
      id: 'b2',
      date: '31.08.2026',
      type: 'Pause',
      time: '12:14–12:42',
      source: 'Automatisch',
      status: 'Bestätigt',
    },
    {
      id: 'b3',
      date: '31.08.2026',
      type: 'Kommen',
      time: '12:42',
      source: 'Terminal',
      status: 'Laufend',
    },
    {
      id: 'b4',
      date: '28.08.2026',
      type: 'Kommen',
      time: '08:11',
      source: 'Terminal',
      status: 'Bestätigt',
    },
    {
      id: 'b5',
      date: '28.08.2026',
      type: 'Gehen',
      time: '—',
      source: '—',
      status: 'Unvollständig',
    },
    {
      id: 'b6',
      date: '27.08.2026',
      type: 'Arbeitszeit',
      time: '08:04–16:31',
      source: 'Terminal',
      status: 'Bestätigt',
    },
  ],
  approvals: [
    {
      id: 'a1',
      person: 'Jonas Weber',
      initials: 'JW',
      title: 'Urlaub · 5 Arbeitstage',
      period: '14.–18. September 2026',
      submitted: '28.08.2026 · 10:14',
      due: 'Heute',
      status: 'Offen',
      note: 'Vertretung im Team ist mit Lena Vogt abgestimmt.',
    },
    {
      id: 'a2',
      person: 'Lena Vogt',
      initials: 'LV',
      title: 'Buchungskorrektur',
      period: '28. August · Gehen 16:18',
      submitted: '30.08.2026 · 08:43',
      due: 'Morgen',
      status: 'Offen',
      note: 'Das Terminal war beim Verlassen des Gebäudes nicht verfügbar.',
    },
    {
      id: 'a3',
      person: 'Amir Haddad',
      initials: 'AH',
      title: 'Mehrarbeit · 3:30 Std.',
      period: 'August 2026',
      submitted: '27.08.2026 · 15:06',
      due: '2 Tage überfällig',
      status: 'Offen',
      note: 'Mehrarbeit im Rahmen der Einschreibungsphase.',
    },
  ],
};

const viewLabels = {
  heute: 'Heute',
  buchungen: 'Buchungen',
  genehmigungen: 'Genehmigungen',
};

const state = {
  view: 'heute',
  selectedApproval: 0,
  clockedIn: true,
  paletteIndex: 0,
  toastTimer: null,
};

const commands = [
  { label: 'Heute öffnen', hint: 'Persönlich', action: () => navigate('heute') },
  { label: 'Buchungen öffnen', hint: 'Persönlich', action: () => navigate('buchungen') },
  { label: 'Genehmigungen öffnen', hint: 'Team', action: () => navigate('genehmigungen') },
  { label: 'Farbschema wechseln', hint: 'Darstellung', action: () => toggleTheme() },
  { label: 'Demo-Daten zurücksetzen', hint: 'Lokal', action: () => window.location.reload() },
];

const commandDialog = document.querySelector('[data-command-dialog]');
const commandSearch = document.querySelector('[data-command-search]');
const commandResults = document.querySelector('[data-command-results]');
const approvalList = document.querySelector('[data-approval-list]');
const approvalDetail = document.querySelector('[data-approval-detail]');
const bookingsBody = document.querySelector('[data-bookings-body]');
const sidebar = document.querySelector('[data-demo-sidebar]');
const scrim = document.querySelector('[data-demo-scrim]');
const toast = document.querySelector('[data-demo-toast]');
const menuButton = document.querySelector('[data-demo-open-nav]');
const main = document.querySelector('#demo-main');
const mobileNavigation = window.matchMedia('(max-width: 56rem)');

function showToast(message) {
  window.clearTimeout(state.toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  state.toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 2800);
}

function navigate(view, updateHistory = true) {
  if (!Object.hasOwn(viewLabels, view)) view = 'heute';
  state.view = view;
  document.querySelectorAll('[data-demo-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.demoPanel !== view;
  });
  document.querySelectorAll('[data-demo-view]').forEach((control) => {
    if (control.closest('.demo-nav')) {
      if (control.dataset.demoView === view) control.setAttribute('aria-current', 'page');
      else control.removeAttribute('aria-current');
    }
  });
  document.querySelector('[data-view-label]').textContent = viewLabels[view];
  document.title = `cueq · ${viewLabels[view]} · Demo`;
  if (updateHistory) window.history.pushState({ view }, '', `#${view}`);
  closeNavigation();
  if (view === 'genehmigungen') renderApprovals();
  if (updateHistory) {
    document.querySelector(`[data-demo-panel="${view}"] h1`)?.focus({ preventScroll: true });
  }
}

function openNavigation() {
  sidebar.dataset.open = 'true';
  sidebar.inert = false;
  main.inert = true;
  menuButton.setAttribute('aria-expanded', 'true');
  scrim.hidden = false;
  document.querySelector('[data-demo-close-nav]').focus();
}

function closeNavigation() {
  const wasOpen = sidebar.dataset.open === 'true';
  delete sidebar.dataset.open;
  scrim.hidden = true;
  sidebar.inert = mobileNavigation.matches;
  main.inert = false;
  menuButton.setAttribute('aria-expanded', 'false');
  if (wasOpen) menuButton.focus();
}

mobileNavigation.addEventListener('change', closeNavigation);

function readTheme() {
  try {
    return localStorage.getItem('cueq-demo-theme') === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const themeButton = document.querySelector('[data-demo-theme]');
  themeButton.setAttribute('aria-pressed', String(theme === 'dark'));
  document.querySelector('[data-theme-icon]').textContent = theme === 'dark' ? '☀' : '☾';
  try {
    localStorage.setItem('cueq-demo-theme', theme);
  } catch {}
}

function toggleTheme() {
  setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  showToast(`Farbschema: ${document.documentElement.dataset.theme === 'dark' ? 'Dunkel' : 'Hell'}`);
}

function renderBookings() {
  bookingsBody.replaceChildren(
    ...demoData.bookings.map((booking) => {
      const row = document.createElement('tr');
      const warning = booking.status !== 'Bestätigt' && booking.status !== 'Laufend';
      row.innerHTML = `
        <td>${booking.date}</td>
        <td>${booking.type}</td>
        <td>${booking.time}</td>
        <td>${booking.source}</td>
        <td><span class="demo-chip${warning ? ' warn' : ''}">${booking.status}</span></td>
        <td><button type="button" data-correct-booking="${booking.id}">Korrigieren</button></td>`;
      return row;
    }),
  );
}

function addBooking() {
  if (demoData.bookings.some((booking) => booking.id === 'demo-manual')) {
    showToast('Die Demo-Buchung wurde bereits ergänzt.');
    return;
  }
  demoData.bookings.unshift({
    id: 'demo-manual',
    date: '26.08.2026',
    type: 'Arbeitszeit',
    time: '08:15–16:20',
    source: 'Manuell',
    status: 'Korrektur beantragt',
  });
  renderBookings();
  showToast('Synthetische Buchung ergänzt und als Korrektur markiert.');
}

function requestCorrection(id) {
  const booking = demoData.bookings.find((item) => item.id === id);
  if (!booking) return;
  booking.status = 'Korrektur beantragt';
  renderBookings();
  showToast(`Korrekturantrag für ${booking.date} angelegt.`);
}

function toggleClock() {
  state.clockedIn = !state.clockedIn;
  document.querySelector('[data-clock-label]').textContent = state.clockedIn
    ? 'Gehen buchen'
    : 'Buchung zurücksetzen';
  const liveEvent = document.querySelector('[data-live-event]');
  liveEvent.innerHTML = state.clockedIn
    ? '<i class="live"></i><strong>12:42</strong> Kommen · laufend'
    : '<i class="ok"></i><strong>12:42–16:42</strong> Arbeitszeit';
  document.querySelector('[data-now-marker]').hidden = !state.clockedIn;
  const booking = demoData.bookings.find((item) => item.id === 'b3');
  if (booking) {
    booking.type = state.clockedIn ? 'Kommen' : 'Arbeitszeit';
    booking.time = state.clockedIn ? '12:42' : '12:42–16:42';
    booking.status = state.clockedIn ? 'Laufend' : 'Bestätigt';
  }
  renderBookings();
  showToast(
    state.clockedIn
      ? 'Tagesjournal auf den Demo-Ausgangszustand zurückgesetzt.'
      : 'Gehen um 16:42 gebucht. Tagesjournal aktualisiert.',
  );
}

function openApprovalCount() {
  return demoData.approvals.filter((approval) => approval.status === 'Offen').length;
}

function renderApprovals() {
  if (state.selectedApproval >= demoData.approvals.length) state.selectedApproval = 0;
  document.querySelectorAll('[data-approval-count]').forEach((node) => {
    node.textContent = String(openApprovalCount());
    node.hidden = openApprovalCount() === 0 && Boolean(node.closest('.demo-nav'));
  });
  approvalList.replaceChildren(
    ...demoData.approvals.map((approval, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'demo-inbox-item';
      button.setAttribute('role', 'option');
      button.tabIndex = index === state.selectedApproval ? 0 : -1;
      button.setAttribute('aria-selected', String(index === state.selectedApproval));
      button.dataset.approvalIndex = String(index);
      const urgency = approval.due.includes('überfällig') || approval.due === 'Heute';
      button.innerHTML = `
        <span class="demo-inbox-item-head"><strong>${approval.person}</strong><span class="demo-chip${urgency ? ' warn' : ''}">${approval.status}</span></span>
        <p>${approval.title}</p>
        <small>${approval.period} · ${approval.due}</small>`;
      return button;
    }),
  );
  renderApprovalDetail();
}

function renderApprovalDetail() {
  const approval = demoData.approvals[state.selectedApproval];
  if (!approval) {
    approvalDetail.innerHTML =
      '<h2>Keine offenen Anträge</h2><p>Alle Entscheidungen sind bearbeitet.</p>';
    return;
  }
  const decisionControls =
    approval.status === 'Offen'
      ? `<div class="demo-decision-actions">
        <button class="approve" type="button" data-approval-decision="Genehmigt">Genehmigen <kbd>a</kbd></button>
        <button class="reject" type="button" data-approval-decision="Abgelehnt">Ablehnen <kbd>x</kbd></button>
      </div>`
      : '<p class="demo-decision-note">Diese Demo-Entscheidung ist im lokalen Datensatz abgeschlossen. Neu laden setzt alle Beispieldaten zurück.</p>';
  approvalDetail.innerHTML = `
    <p class="demo-eyebrow">Antrag · ${approval.status}</p>
    <h2>${approval.title}</h2>
    <p>${approval.person}</p>
    <div class="demo-facts">
      <div><small>Zeitraum</small><strong>${approval.period}</strong></div>
      <div><small>Frist</small><strong>${approval.due}</strong></div>
      <div><small>Eingereicht</small><strong>${approval.submitted}</strong></div>
      <div><small>Status</small><strong>${approval.status}</strong></div>
    </div>
    <p class="demo-decision-note"><strong>Kontext:</strong> ${approval.note}</p>
    ${decisionControls}`;
}

function selectApproval(index) {
  const nextIndex = Math.max(0, Math.min(index, demoData.approvals.length - 1));
  state.selectedApproval = nextIndex;
  renderApprovals();
  document.querySelector(`[data-approval-index="${nextIndex}"]`)?.focus();
}

function decideApproval(status) {
  const approval = demoData.approvals[state.selectedApproval];
  if (!approval || approval.status !== 'Offen') {
    showToast('Dieser Antrag ist bereits entschieden.');
    return;
  }
  approval.status = status;
  renderApprovals();
  document.querySelector(`[data-approval-index="${state.selectedApproval}"]`)?.focus();
  showToast(`${approval.person}: ${status}. Offener Eingang: ${openApprovalCount()}.`);
}

function filteredCommands() {
  const query = commandSearch.value.trim().toLocaleLowerCase('de');
  return commands.filter((command) => command.label.toLocaleLowerCase('de').includes(query));
}

function renderCommands() {
  const visibleCommands = filteredCommands();
  if (state.paletteIndex >= visibleCommands.length) state.paletteIndex = 0;
  document.querySelector('[data-command-empty]').hidden = visibleCommands.length > 0;
  commandSearch.removeAttribute('aria-activedescendant');
  if (visibleCommands.length) {
    commandSearch.setAttribute('aria-activedescendant', `demo-command-${state.paletteIndex}`);
  }
  commandResults.replaceChildren(
    ...visibleCommands.map((command, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.commandIndex = String(index);
      button.id = `demo-command-${index}`;
      button.setAttribute('role', 'option');
      button.tabIndex = -1;
      button.setAttribute('aria-selected', String(index === state.paletteIndex));
      button.innerHTML = `<span>${command.label}</span><small>${command.hint}</small>`;
      return button;
    }),
  );
}

function openPalette() {
  closeNavigation();
  if (!commandDialog.open) commandDialog.showModal();
  commandSearch.value = '';
  state.paletteIndex = 0;
  renderCommands();
  window.setTimeout(() => commandSearch.focus(), 0);
}

function runCommand(index = state.paletteIndex) {
  const command = filteredCommands()[index];
  if (!command) return;
  commandDialog.close();
  command.action();
}

document.querySelectorAll('[data-demo-view]').forEach((control) => {
  control.addEventListener('click', () => navigate(control.dataset.demoView));
});
document
  .querySelector('[data-demo-reset]')
  .addEventListener('click', () => window.location.reload());
menuButton.addEventListener('click', openNavigation);
document.querySelector('[data-demo-close-nav]').addEventListener('click', closeNavigation);
scrim.addEventListener('click', closeNavigation);
document.querySelector('[data-demo-theme]').addEventListener('click', toggleTheme);
document.querySelector('[data-demo-command]').addEventListener('click', openPalette);
document.querySelector('[data-clock-action]').addEventListener('click', toggleClock);
document.querySelector('[data-add-booking]').addEventListener('click', addBooking);

bookingsBody.addEventListener('click', (event) => {
  const button = event.target.closest('[data-correct-booking]');
  if (button) requestCorrection(button.dataset.correctBooking);
});
approvalList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-approval-index]');
  if (button) selectApproval(Number.parseInt(button.dataset.approvalIndex, 10));
});
approvalDetail.addEventListener('click', (event) => {
  const button = event.target.closest('[data-approval-decision]');
  if (button) decideApproval(button.dataset.approvalDecision);
});
commandSearch.addEventListener('input', () => {
  state.paletteIndex = 0;
  renderCommands();
});
commandResults.addEventListener('click', (event) => {
  const button = event.target.closest('[data-command-index]');
  if (button) runCommand(Number.parseInt(button.dataset.commandIndex, 10));
});
commandDialog.addEventListener('close', () =>
  document.querySelector('[data-demo-command]').focus(),
);

window.addEventListener('hashchange', () =>
  navigate(window.location.hash.slice(1) || 'heute', false),
);
window.addEventListener('keydown', (event) => {
  if (sidebar.dataset.open === 'true') {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeNavigation();
      return;
    }
    if (event.key === 'Tab') {
      const controls = [...sidebar.querySelectorAll('a[href], button')];
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }
  const editable = event.target.matches('input, textarea, select, [contenteditable="true"]');
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    openPalette();
    return;
  }
  if (commandDialog.open) {
    const count = filteredCommands().length;
    if (event.key === 'ArrowDown' && count) {
      event.preventDefault();
      state.paletteIndex = (state.paletteIndex + 1) % count;
      renderCommands();
    } else if (event.key === 'ArrowUp' && count) {
      event.preventDefault();
      state.paletteIndex = (state.paletteIndex - 1 + count) % count;
      renderCommands();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      runCommand();
    }
    return;
  }
  if (editable || event.metaKey || event.ctrlKey || event.altKey) return;
  if (
    event.target.closest('[data-approval-list]') &&
    ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)
  ) {
    event.preventDefault();
    const index =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? demoData.approvals.length - 1
          : state.selectedApproval + (event.key === 'ArrowDown' ? 1 : -1);
    selectApproval(index);
    return;
  }
  if (event.key === '1') navigate('heute');
  if (event.key === '2') navigate('buchungen');
  if (state.view !== 'genehmigungen') return;
  if (event.key.toLowerCase() === 'j') selectApproval(state.selectedApproval + 1);
  if (event.key.toLowerCase() === 'k') selectApproval(state.selectedApproval - 1);
  if (event.key.toLowerCase() === 'a') decideApproval('Genehmigt');
  if (event.key.toLowerCase() === 'x') decideApproval('Abgelehnt');
});

setTheme(readTheme());
renderBookings();
renderApprovals();
navigate(window.location.hash.slice(1) || 'heute', false);
