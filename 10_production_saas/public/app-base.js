const app = document.querySelector('#app');
const toastRegion = document.querySelector('#toast-region');

const state = {
  session: null,
  golfers: [],
  golfer: null,
  route: 'dashboard',
  editorTab: 'foundation',
  busy: false,
  lastShareUrl: '',
};

const RESPONSE_LABELS = {
  ready: 'I am ready for the next step',
  ask: 'I have a question for my coach',
  wait: 'I want to wait and review',
  decline: 'I do not want to continue right now',
};

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function nl2br(value = '') {
  return escapeHtml(value).replaceAll('\n', '<br>');
}

function dateLabel(value) {
  if (!value) return 'Not dated';
  const date = new Date(value.length <= 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
}

function toast(message, tone = 'success') {
  const node = document.createElement('div');
  node.className = `toast ${tone}`;
  node.textContent = message;
  toastRegion.append(node);
  setTimeout(() => node.remove(), 4200);
}

async function api(path, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (state.session?.csrf && !['GET', 'HEAD'].includes((options.method || 'GET').toUpperCase())) {
    headers['X-CSRF-Token'] = state.session.csrf;
  }
  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Request failed (${response.status}).`);
    error.status = response.status;
    error.details = data.details;
    if (response.status === 401) {
      state.session = null;
      renderAuth('login');
    }
    throw error;
  }
  return data;
}

function setBusy(value) {
  state.busy = value;
  document.querySelectorAll('button, input, textarea, select').forEach((element) => {
    if (element.dataset.keepEnabled !== 'true') element.disabled = value;
  });
}

function routeTo(route, { replace = false } = {}) {
  state.route = route;
  const path = route === 'dashboard' ? '/app' : route === 'profile' ? '/app/profile' : route.startsWith('golfer:') ? `/app/golfers/${route.split(':')[1]}` : '/app';
  history[replace ? 'replaceState' : 'pushState']({}, '', path);
  renderRoute();
}

function currentRouteFromLocation() {
  const path = location.pathname;
  if (path === '/app/profile') return 'profile';
  const match = path.match(/^\/app\/golfers\/([^/]+)$/);
  if (match) return `golfer:${decodeURIComponent(match[1])}`;
  return 'dashboard';
}

function icon(name) {
  const icons = {
    home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5v8a1 1 0 0 1-1 1h-5.5v-6h-5v6H4a1 1 0 0 1-1-1z"/></svg>',
    people: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 20v-1.5a4.5 4.5 0 0 0-4.5-4.5h-3A4.5 4.5 0 0 0 4 18.5V20m6-10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7m7-1a3 3 0 0 0 0-6m1 10.5a4 4 0 0 1 3 3.9V20"/></svg>',
    settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7m7.4-3.5a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a8 8 0 0 0-1.8-1L14.8 3h-4l-.4 2.5a8 8 0 0 0-1.8 1l-2.4-1-2 3.4 2 1.5a7 7 0 0 0 0 2L4.2 14l2 3.4 2.4-1a8 8 0 0 0 1.8 1l.4 2.5h4l.4-2.5a8 8 0 0 0 1.8-1l2.4 1 2-3.4z"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
    link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.1 1.1M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.1-1.1"/></svg>',
  };
  return icons[name] || '';
}

function authShell(content) {
  return `
    <main id="main" class="auth-page">
      <section class="auth-story">
        <a class="wordmark wordmark-light" href="/">Roadmap<span>.</span></a>
        <div class="auth-story-copy">
          <p class="eyebrow light">Invite-only beta</p>
          <h1>Make the coaching plan feel as valuable as the coaching.</h1>
          <p>Turn an assessment into a private, coach-branded journey that gives a golfer clarity now and continuity between lessons.</p>
          <div class="story-sample">
            <span>Current priority</span>
            <strong>Keep the start window predictable before adding speed.</strong>
            <small>Coach-authored direction · no automated diagnosis</small>
          </div>
        </div>
        <p class="auth-foot">Adult golfers only · private links · no native lesson payment</p>
      </section>
      <section class="auth-panel">${content}</section>
    </main>`;
}

function renderAuth(mode = 'login') {
  const login = mode === 'login';
  app.innerHTML = authShell(`
    <div class="auth-card">
      <p class="eyebrow">Roadmap beta</p>
      <h2>${login ? 'Welcome back' : 'Create your instructor account'}</h2>
      <p class="muted">${login ? 'Sign in to manage your private coaching journeys.' : 'Registration requires the private beta invite code.'}</p>
      <form id="auth-form" class="stack-form">
        ${login ? '' : '<label>Your name<input name="name" autocomplete="name" required maxlength="120"></label>'}
        <label>Work email<input name="email" type="email" autocomplete="email" required maxlength="254"></label>
        <label>Password<input name="password" type="password" autocomplete="${login ? 'current-password' : 'new-password'}" required minlength="10"></label>
        ${login ? '' : '<label>Beta invite code<input name="inviteCode" type="password" autocomplete="off" required minlength="8"></label>'}
        <button class="button primary wide" type="submit">${login ? 'Sign in' : 'Create account'}</button>
      </form>
      <button id="auth-switch" class="text-button" type="button">${login ? 'Have an invite? Create an account' : 'Already registered? Sign in'}</button>
      <p class="tiny">This is a controlled beta. Do not enter sensitive medical information, junior data, or anything you are not authorized to share.</p>
    </div>`);

  document.querySelector('#auth-switch').addEventListener('click', () => renderAuth(login ? 'register' : 'login'));
  document.querySelector('#auth-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    try {
      const result = await api(login ? '/api/login' : '/api/register', { method: 'POST', body: JSON.stringify(body) });
      state.session = { csrf: result.csrf };
      await loadSession();
      history.replaceState({}, '', '/app');
      state.route = 'dashboard';
      await renderDashboard();
      toast(login ? 'Signed in.' : 'Your beta account is ready.');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  });
}

async function loadSession() {
  const result = await api('/api/session');
  state.session = result.authenticated ? result : null;
  return state.session;
}

async function loadGolfers() {
  const result = await api('/api/golfers');
  state.golfers = result.golfers;
}

function shell(content) {
  const initials = (state.session?.user?.name || 'Coach').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  const business = state.session?.profile?.businessName || state.session?.user?.name || 'Your coaching';
  return `
    <div class="app-shell">
      <aside class="sidebar">
        <button class="brand-button" data-route="dashboard"><span class="brand-mark">R</span><span><strong>Roadmap</strong><small>${escapeHtml(business)}</small></span></button>
        <nav aria-label="Instructor workspace">
          <button class="nav-item ${state.route === 'dashboard' ? 'active' : ''}" data-route="dashboard">${icon('home')}<span>Overview</span></button>
          <button class="nav-item ${state.route.startsWith('golfer:') ? 'active' : ''}" data-route="dashboard">${icon('people')}<span>Golfers</span></button>
          <button class="nav-item ${state.route === 'profile' ? 'active' : ''}" data-route="profile">${icon('settings')}<span>Profile & packages</span></button>
        </nav>
        <div class="beta-boundary"><strong>Beta boundary</strong><span>Private roadmap delivery, not booking, payment, diagnosis, or messaging.</span></div>
        <div class="sidebar-user"><span class="avatar">${escapeHtml(initials)}</span><span><strong>${escapeHtml(state.session?.user?.name)}</strong><small>${escapeHtml(state.session?.user?.email)}</small></span><button id="logout" class="icon-button" aria-label="Sign out">↗</button></div>
      </aside>
      <header class="mobile-header"><button class="mobile-brand" data-route="dashboard"><span class="brand-mark">R</span><strong>Roadmap</strong></button><button class="avatar" data-route="profile">${escapeHtml(initials)}</button></header>
      <main id="main" class="workspace">${content}</main>
    </div>`;
}

function attachShellEvents() {
  document.querySelectorAll('[data-route]').forEach((button) => button.addEventListener('click', () => routeTo(button.dataset.route)));
  document.querySelector('#logout')?.addEventListener('click', async () => {
    try { await api('/api/logout', { method: 'POST' }); } catch { /* cookie is still cleared server-side when reachable */ }
    state.session = null;
    history.replaceState({}, '', '/');
    renderAuth('login');
  });
}

function dashboardContent() {
  const published = state.golfers.filter((item) => item.published).length;
  const active = state.golfers.filter((item) => item.status === 'active').length;
  const responses = state.golfers.reduce((sum, item) => sum + item.responseCount, 0);
  return `
    <header class="workspace-header">
      <div><p class="eyebrow">Instructor workspace</p><h1>Make the next coaching decision clear.</h1><p>Build and maintain private development journeys without replacing the tools you already use.</p></div>
      <div class="header-actions"><button id="create-demo" class="button secondary">Open the example</button><button id="create-golfer" class="button primary">${icon('plus')} Add golfer</button></div>
    </header>
    <section class="stat-grid" aria-label="Workspace summary">
      <article><span>Golfers</span><strong>${state.golfers.length}</strong><small>${active} active journeys</small></article>
      <article><span>Private roadmaps</span><strong>${published}</strong><small>Published and revocable</small></article>
      <article><span>Golfer responses</span><strong>${responses}</strong><small>Bounded decisions, not chat</small></article>
    </section>
    <section class="section-block">
      <div class="section-title-row"><div><p class="eyebrow">Your golfers</p><h2>Current coaching journeys</h2></div><label class="search-field"><span class="sr-only">Search golfers</span><input id="golfer-search" type="search" placeholder="Search by golfer or goal"></label></div>
      <div id="golfer-list" class="golfer-list">${renderGolferRows(state.golfers)}</div>
    </section>
    <section class="getting-started">
      <div><p class="eyebrow light">The beta success event</p><h2>Create one credible roadmap and share it with one adult golfer.</h2><p>Do not fill every optional section. Start with the goal, assessment, current priority, three phases, and one honest next action.</p></div>
      <ol><li><span>01</span>Set your coach identity and one package.</li><li><span>02</span>Create the golfer’s plan.</li><li><span>03</span>Preview, publish, and learn from the response.</li></ol>
    </section>`;
}

function renderGolferRows(items) {
  if (!items.length) {
    return `<div class="empty-state"><span class="empty-symbol">◇</span><h3>No golfers yet</h3><p>Create a first journey or load the synthetic example to understand the full experience.</p><button class="button primary" id="empty-create">Add your first golfer</button></div>`;
  }
  return items.map((item) => `
    <button class="golfer-row" data-golfer-id="${escapeHtml(item.id)}">
      <span class="golfer-avatar">${escapeHtml(item.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase())}</span>
      <span class="golfer-main"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.goal || 'Goal not added yet')}</small></span>
      <span class="golfer-phase"><small>Current phase</small><strong>${escapeHtml(item.currentPhase || 'Not defined')}</strong></span>
      <span class="status-pill ${item.published ? 'published' : ''}">${item.published ? 'Published' : 'Draft'}</span>
      ${item.responseCount ? `<span class="response-count">${item.responseCount} response${item.responseCount === 1 ? '' : 's'}</span>` : ''}
      <span class="row-arrow">${icon('arrow')}</span>
    </button>`).join('');
}

async function renderDashboard() {
  await loadGolfers();
  app.innerHTML = shell(dashboardContent());
  attachShellEvents();
  attachDashboardEvents();
}

function attachDashboardEvents() {
  const create = async () => {
    const name = prompt('Golfer name');
    if (!name?.trim()) return;
    try {
      const result = await api('/api/golfers', { method: 'POST', body: JSON.stringify({ name }) });
      state.golfer = result.golfer;
      state.editorTab = 'foundation';
      routeTo(`golfer:${result.golfer.id}`);
    } catch (error) { toast(error.message, 'error'); }
  };
  document.querySelector('#create-golfer')?.addEventListener('click', create);
  document.querySelector('#empty-create')?.addEventListener('click', create);
  document.querySelector('#create-demo')?.addEventListener('click', async () => {
    try {
      setBusy(true);
      const result = await api('/api/demo', { method: 'POST', body: '{}' });
      state.golfer = result.golfer;
      state.editorTab = 'foundation';
      routeTo(`golfer:${result.golfer.id}`);
      toast(result.alreadyExisted ? 'Opened the existing demo.' : 'Synthetic demo created.');
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  });
  document.querySelectorAll('[data-golfer-id]').forEach((row) => row.addEventListener('click', () => routeTo(`golfer:${row.dataset.golferId}`)));
  document.querySelector('#golfer-search')?.addEventListener('input', (event) => {
    const term = event.target.value.trim().toLowerCase();
    const filtered = state.golfers.filter((item) => `${item.name} ${item.goal} ${item.currentPriority}`.toLowerCase().includes(term));
    document.querySelector('#golfer-list').innerHTML = renderGolferRows(filtered);
    document.querySelectorAll('[data-golfer-id]').forEach((row) => row.addEventListener('click', () => routeTo(`golfer:${row.dataset.golferId}`)));
  });
}
