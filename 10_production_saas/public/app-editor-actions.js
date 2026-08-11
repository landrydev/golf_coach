function editorContent(golfer, check) {
  const currentPhase = golfer.phases.find((item) => item.id === golfer.currentPhaseId) || golfer.phases[0];
  const tab = state.editorTab === 'foundation' ? foundationTab(golfer) : state.editorTab === 'roadmap' ? roadmapTab(golfer) : state.editorTab === 'journey' ? journeyTab(golfer) : publishTab(golfer, check);
  return `
    <header class="editor-header"><button class="back-link" data-route="dashboard">← All golfers</button><div class="editor-heading"><div><p class="eyebrow">${golfer.share.status === 'published' ? 'Published private journey' : 'Roadmap draft'}</p><h1>${escapeHtml(golfer.name)}</h1><p>${escapeHtml(currentPhase?.title || 'Define the current phase')} · Updated ${dateLabel(golfer.updatedAt)}</p></div><div class="editor-header-actions"><span id="save-state" class="save-state">Saved</span><button id="save-golfer" class="button primary">Save changes</button></div></div>${editorNav()}</header>
    <form id="golfer-form" class="editor-form">${tab}</form>`;
}

function collectGolferForm() {
  const golfer = structuredClone(state.golfer);
  const form = document.querySelector('#golfer-form');
  const data = new FormData(form);
  for (const key of ['name', 'email', 'goal', 'motivation', 'constraints', 'assessment', 'strengths', 'barriers', 'currentPriority', 'evidenceBoundary', 'packageId', 'nextActionLabel', 'nextActionUrl']) {
    if (data.has(key)) golfer[key] = data.get(key);
  }
  if (state.editorTab === 'roadmap') {
    golfer.phases = golfer.phases.map((phase, index) => ({ ...phase, title: data.get(`phaseTitle-${index}`) ?? phase.title, purpose: data.get(`phasePurpose-${index}`) ?? phase.purpose, evidence: data.get(`phaseEvidence-${index}`) ?? phase.evidence, status: data.get(`phaseStatus-${index}`) ?? phase.status }));
    golfer.currentPhaseId = data.get('currentPhaseId') || golfer.currentPhaseId;
  }
  if (state.editorTab === 'journey') {
    for (const [type, schema] of Object.entries(ENTRY_SCHEMAS)) {
      golfer[type] = golfer[type].map((entry, index) => {
        const updated = { ...entry, title: data.get(`${type}-${index}-title`) ?? entry.title, date: data.get(`${type}-${index}-date`) ?? entry.date };
        for (const fieldSpec of schema.fields) updated[fieldSpec.key] = data.get(`${type}-${index}-${fieldSpec.key}`) ?? entry[fieldSpec.key];
        return updated;
      });
    }
  }
  return golfer;
}

async function saveGolfer({ quiet = false } = {}) {
  const draft = collectGolferForm();
  setBusy(true);
  try {
    const result = await api(`/api/golfers/${encodeURIComponent(draft.id)}`, { method: 'PUT', body: JSON.stringify(draft) });
    state.golfer = result.golfer;
    if (!quiet) toast('Roadmap saved.');
    return result;
  } catch (error) {
    toast(error.message, 'error');
    throw error;
  } finally {
    setBusy(false);
  }
}

async function renderGolfer(id) {
  if (!state.golfer || state.golfer.id !== id) {
    const result = await api(`/api/golfers/${encodeURIComponent(id)}`);
    state.golfer = result.golfer;
    state.lastShareUrl = '';
  }
  const check = { ready: Boolean(state.golfer.name && state.golfer.goal && state.golfer.assessment && state.golfer.currentPriority && state.golfer.phases.length >= 3 && state.golfer.phases.every((item) => item.title && item.purpose)), missing: [] };
  if (!state.golfer.name) check.missing.push('golfer name');
  if (!state.golfer.goal) check.missing.push('goal');
  if (!state.golfer.assessment) check.missing.push('starting assessment');
  if (!state.golfer.currentPriority) check.missing.push('current priority');
  if (state.golfer.phases.length < 3 || state.golfer.phases.some((item) => !item.title || !item.purpose)) check.missing.push('three complete phases');
  app.innerHTML = shell(editorContent(state.golfer, check));
  attachShellEvents();
  attachEditorEvents();
}

function attachEditorEvents() {
  document.querySelectorAll('[data-editor-tab]').forEach((button) => button.addEventListener('click', async () => {
    try { await saveGolfer({ quiet: true }); } catch { return; }
    state.editorTab = button.dataset.editorTab;
    renderGolfer(state.golfer.id);
  }));
  document.querySelector('#save-golfer')?.addEventListener('click', saveGolfer);
  document.querySelector('#golfer-form')?.addEventListener('input', () => {
    const save = document.querySelector('#save-state');
    if (save) save.textContent = 'Unsaved changes';
  });
  document.querySelector('#add-phase')?.addEventListener('click', async () => {
    state.golfer = collectGolferForm();
    if (state.golfer.phases.length < 4) state.golfer.phases.push({ id: `local_${crypto.randomUUID()}`, title: `Phase ${state.golfer.phases.length + 1}`, purpose: '', evidence: '', status: 'directional' });
    renderGolfer(state.golfer.id);
  });
  document.querySelectorAll('[data-remove-phase]').forEach((button) => button.addEventListener('click', () => {
    state.golfer = collectGolferForm();
    const index = Number(button.dataset.removePhase);
    if (state.golfer.phases.length <= 3) return;
    const removed = state.golfer.phases.splice(index, 1)[0];
    if (removed.id === state.golfer.currentPhaseId) state.golfer.currentPhaseId = state.golfer.phases[0].id;
    renderGolfer(state.golfer.id);
  }));
  document.querySelectorAll('[data-add-entry]').forEach((button) => button.addEventListener('click', () => {
    state.golfer = collectGolferForm();
    const type = button.dataset.addEntry;
    const base = { id: `local_${crypto.randomUUID()}`, title: '', date: new Date().toISOString().slice(0, 10), status: type === 'practices' ? 'active' : 'complete' };
    for (const fieldSpec of ENTRY_SCHEMAS[type].fields) base[fieldSpec.key] = '';
    state.golfer[type].push(base);
    renderGolfer(state.golfer.id);
  }));
  document.querySelectorAll('[data-remove-entry]').forEach((button) => button.addEventListener('click', () => {
    state.golfer = collectGolferForm();
    const [type, index] = button.dataset.removeEntry.split(':');
    state.golfer[type].splice(Number(index), 1);
    renderGolfer(state.golfer.id);
  }));
  document.querySelector('#open-preview')?.addEventListener('click', async () => {
    try {
      await saveGolfer({ quiet: true });
      renderPublicPreview(state.golfer, state.session.profile);
    } catch { /* toast already shown */ }
  });
  document.querySelector('#publish-roadmap')?.addEventListener('click', async () => {
    try {
      await saveGolfer({ quiet: true });
      const result = await api(`/api/golfers/${encodeURIComponent(state.golfer.id)}/publish`, { method: 'POST', body: '{}' });
      state.lastShareUrl = result.shareUrl;
      const refreshed = await api(`/api/golfers/${encodeURIComponent(state.golfer.id)}`);
      state.golfer = refreshed.golfer;
      renderGolfer(state.golfer.id);
      toast('Private link published. Copy the new link now.');
    } catch (error) {
      const missing = error.details?.missing?.join(', ');
      toast(missing ? `Complete: ${missing}.` : error.message, 'error');
    }
  });
  document.querySelector('#copy-share')?.addEventListener('click', async () => {
    await navigator.clipboard.writeText(state.lastShareUrl);
    toast('Private link copied.');
  });
  document.querySelector('#revoke-roadmap')?.addEventListener('click', async () => {
    if (!confirm('Revoke the current private link?')) return;
    try {
      await api(`/api/golfers/${encodeURIComponent(state.golfer.id)}/revoke`, { method: 'POST', body: '{}' });
      const refreshed = await api(`/api/golfers/${encodeURIComponent(state.golfer.id)}`);
      state.golfer = refreshed.golfer;
      state.lastShareUrl = '';
      renderGolfer(state.golfer.id);
      toast('Private link revoked.');
    } catch (error) { toast(error.message, 'error'); }
  });
  document.querySelector('#delete-golfer')?.addEventListener('click', async () => {
    if (!confirm(`Permanently delete ${state.golfer.name}?`)) return;
    try {
      await api(`/api/golfers/${encodeURIComponent(state.golfer.id)}`, { method: 'DELETE', body: '{}' });
      state.golfer = null;
      routeTo('dashboard');
      toast('Golfer deleted.');
    } catch (error) { toast(error.message, 'error'); }
  });
}

