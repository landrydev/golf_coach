function field(label, name, value, { type = 'text', placeholder = '', help = '', required = false, rows = 4 } = {}) {
  const input = type === 'textarea'
    ? `<textarea name="${name}" rows="${rows}" ${required ? 'required' : ''} placeholder="${escapeHtml(placeholder)}">${escapeHtml(value || '')}</textarea>`
    : `<input name="${name}" type="${type}" value="${escapeHtml(value || '')}" ${required ? 'required' : ''} placeholder="${escapeHtml(placeholder)}">`;
  return `<label class="field"><span>${escapeHtml(label)}${required ? ' <em>Required</em>' : ''}</span>${input}${help ? `<small>${escapeHtml(help)}</small>` : ''}</label>`;
}

function editorNav() {
  const tabs = [
    ['foundation', 'Foundation'],
    ['roadmap', 'Roadmap'],
    ['journey', 'Living journey'],
    ['publish', 'Preview & share'],
  ];
  return `<nav class="editor-tabs" aria-label="Roadmap editor">${tabs.map(([id, label]) => `<button data-editor-tab="${id}" class="${state.editorTab === id ? 'active' : ''}">${label}</button>`).join('')}</nav>`;
}

function foundationTab(golfer) {
  return `
    <section class="editor-section">
      <div class="editor-intro"><p class="eyebrow">01 · Foundation</p><h2>Anchor the plan in the golfer’s real outcome.</h2><p>Use concise coach-owned language. A useful plan is specific without pretending the result or timeline is guaranteed.</p></div>
      <div class="form-grid two">
        ${field('Golfer name', 'name', golfer.name, { required: true })}
        ${field('Golfer email', 'email', golfer.email, { type: 'email', help: 'Optional. Roadmap does not send email in this beta.' })}
      </div>
      ${field('Desired outcome', 'goal', golfer.goal, { type: 'textarea', required: true, placeholder: 'What meaningful result is the golfer working toward?', rows: 3 })}
      <div class="form-grid two">
        ${field('Why it matters', 'motivation', golfer.motivation, { type: 'textarea', placeholder: 'What changes for the golfer if this improves?', rows: 4 })}
        ${field('Real constraints', 'constraints', golfer.constraints, { type: 'textarea', placeholder: 'Practice time, season, physical or equipment context—without medical diagnosis.', rows: 4 })}
      </div>
      ${field('Starting assessment', 'assessment', golfer.assessment, { type: 'textarea', required: true, placeholder: 'Summarize what you observed and how it affects the goal.', rows: 6 })}
      <div class="form-grid two">
        ${field('Useful strengths', 'strengths', golfer.strengths, { type: 'textarea', placeholder: 'What is already working or can be built on?', rows: 4 })}
        ${field('Priority barriers', 'barriers', golfer.barriers, { type: 'textarea', placeholder: 'The few barriers that matter most—not a technical data dump.', rows: 4 })}
      </div>
      ${field('What matters now', 'currentPriority', golfer.currentPriority, { type: 'textarea', required: true, placeholder: 'One clear current priority the golfer can repeat back.', rows: 3 })}
      ${field('Honest evidence boundary', 'evidenceBoundary', golfer.evidenceBoundary, { type: 'textarea', placeholder: 'What is known, what is only an early signal, and what is not yet proven?', rows: 3 })}
    </section>`;
}

function roadmapTab(golfer) {
  const packages = state.session.profile.packages || [];
  return `
    <section class="editor-section">
      <div class="editor-intro"><p class="eyebrow">02 · Roadmap</p><h2>Give the work direction without turning it into a promise.</h2><p>Three or four phases are enough. Future phases can change as evidence develops.</p></div>
      <div id="phase-list" class="phase-editor-list">${golfer.phases.map((phase, index) => `
        <article class="phase-editor-card" data-phase-index="${index}">
          <div class="phase-card-header"><span class="phase-number">0${index + 1}</span><div><small>${phase.id === golfer.currentPhaseId ? 'Current phase' : 'Directional phase'}</small><strong>${escapeHtml(phase.title || `Phase ${index + 1}`)}</strong></div><button type="button" class="icon-button danger" data-remove-phase="${index}" ${golfer.phases.length <= 3 ? 'disabled' : ''} aria-label="Remove phase">×</button></div>
          <div class="form-grid two">
            ${field('Phase title', `phaseTitle-${index}`, phase.title, { required: true })}
            <label class="field"><span>Phase status</span><select name="phaseStatus-${index}"><option value="current" ${phase.status === 'current' ? 'selected' : ''}>Current</option><option value="next" ${phase.status === 'next' ? 'selected' : ''}>Next direction</option><option value="directional" ${phase.status === 'directional' ? 'selected' : ''}>Directional</option><option value="complete" ${phase.status === 'complete' ? 'selected' : ''}>Complete</option></select></label>
          </div>
          ${field('Purpose', `phasePurpose-${index}`, phase.purpose, { type: 'textarea', required: true, rows: 3, placeholder: 'Why this phase comes here.' })}
          ${field('Evidence that would matter', `phaseEvidence-${index}`, phase.evidence, { type: 'textarea', rows: 2, placeholder: 'What would help the coach decide whether to continue, revise, or advance?' })}
          <label class="current-phase-choice"><input type="radio" name="currentPhaseId" value="${escapeHtml(phase.id)}" ${phase.id === golfer.currentPhaseId ? 'checked' : ''}> Make this the current phase</label>
        </article>`).join('')}</div>
      <button type="button" id="add-phase" class="button secondary" ${golfer.phases.length >= 4 ? 'disabled' : ''}>${icon('plus')} Add fourth phase</button>
      <hr>
      <div class="editor-intro compact"><p class="eyebrow">Package connection</p><h2>Make the next action clear and external.</h2><p>Roadmap does not process the instructor’s lesson payment. It explains the fit and sends the golfer to the instructor’s existing route.</p></div>
      <div class="form-grid two">
        <label class="field"><span>Connected package</span><select name="packageId"><option value="">No package recommendation</option>${packages.filter((item) => item.active !== false).map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === golfer.packageId ? 'selected' : ''}>${escapeHtml(item.name)}${item.priceLabel ? ` — ${escapeHtml(item.priceLabel)}` : ''}</option>`).join('')}</select><small>Manage packages in Profile & packages.</small></label>
        ${field('Next-action label', 'nextActionLabel', golfer.nextActionLabel, { placeholder: 'Book the first phase' })}
      </div>
      ${field('External booking, purchase, or contact URL', 'nextActionUrl', golfer.nextActionUrl, { type: 'url', placeholder: 'https://…', help: 'Optional. The golfer will be told they are leaving Roadmap.' })}
    </section>`;
}

function entryEditor(type, entries, schema) {
  if (!entries.length) return `<div class="empty-inline"><p>No ${type} added yet.</p><button type="button" class="button secondary" data-add-entry="${type}">${icon('plus')} Add ${schema.singular}</button></div>`;
  return `<div class="entry-editor-list">${entries.map((entry, index) => `
    <details class="entry-editor" ${index === entries.length - 1 ? 'open' : ''}>
      <summary><span><small>${escapeHtml(entry.date || entry.status || schema.singular)}</small><strong>${escapeHtml(entry.title || `Untitled ${schema.singular}`)}</strong></span><span class="summary-action">Edit</span></summary>
      <div class="entry-body">
        <div class="form-grid two">${field('Title', `${type}-${index}-title`, entry.title, { required: true })}${field('Date', `${type}-${index}-date`, entry.date, { type: 'date' })}</div>
        ${schema.fields.map((item) => field(item.label, `${type}-${index}-${item.key}`, entry[item.key], { type: item.type || 'textarea', rows: item.rows || 3, placeholder: item.placeholder || '' })).join('')}
        <button type="button" class="text-button danger-text" data-remove-entry="${type}:${index}">Remove ${schema.singular}</button>
      </div>
    </details>`).join('')}</div><button type="button" class="button secondary" data-add-entry="${type}">${icon('plus')} Add ${schema.singular}</button>`;
}

const ENTRY_SCHEMAS = {
  lessons: { singular: 'lesson', fields: [
    { key: 'purpose', label: 'Purpose' }, { key: 'observation', label: 'Coach observation', rows: 4 }, { key: 'takeaway', label: 'Current takeaway' }, { key: 'nextCheck', label: 'Next check' },
  ] },
  practices: { singular: 'practice assignment', fields: [
    { key: 'objective', label: 'Objective' }, { key: 'instructions', label: 'Instructions', rows: 5 }, { key: 'cadence', label: 'Cadence or dosage' }, { key: 'successCheck', label: 'Success check' }, { key: 'stopRule', label: 'Stop or ask rule' },
  ] },
  evidence: { singular: 'evidence entry', fields: [
    { key: 'source', label: 'Source', type: 'text' }, { key: 'observation', label: 'What it shows', rows: 4 }, { key: 'limitation', label: 'Limitation or uncertainty' }, { key: 'mediaUrl', label: 'Optional external media URL', type: 'url' },
  ] },
  reviews: { singular: 'phase review', fields: [
    { key: 'outcome', label: 'Outcome', type: 'text', placeholder: 'Continue, revise, advance, pause…' }, { key: 'summary', label: 'What changed and what remains', rows: 5 }, { key: 'nextPhase', label: 'Next direction and rationale', rows: 4 },
  ] },
};

function journeyTab(golfer) {
  return `
    <section class="editor-section">
      <div class="editor-intro"><p class="eyebrow">03 · Living journey</p><h2>Preserve the useful coaching story between sessions.</h2><p>This beta keeps four bounded records: lesson chapters, current practice, selected evidence, and phase reviews. It is not a transcript or message thread.</p></div>
      <div class="journey-group"><div class="journey-heading"><span>Lessons</span><small>What mattered, the takeaway, and the next check</small></div>${entryEditor('lessons', golfer.lessons, ENTRY_SCHEMAS.lessons)}</div>
      <div class="journey-group"><div class="journey-heading"><span>Practice</span><small>One clear prescription with a success and stop rule</small></div>${entryEditor('practices', golfer.practices, ENTRY_SCHEMAS.practices)}</div>
      <div class="journey-group"><div class="journey-heading"><span>Evidence</span><small>Selected observations with source and limitations</small></div>${entryEditor('evidence', golfer.evidence, ENTRY_SCHEMAS.evidence)}</div>
      <div class="journey-group"><div class="journey-heading"><span>Phase reviews</span><small>What changed, what remains, and why the plan continues or changes</small></div>${entryEditor('reviews', golfer.reviews, ENTRY_SCHEMAS.reviews)}</div>
    </section>`;
}

function readinessList(check) {
  if (check.ready) return `<div class="ready-banner">${icon('check')}<div><strong>Ready to publish</strong><span>The required roadmap foundation is complete.</span></div></div>`;
  return `<div class="not-ready-banner"><strong>Complete before publishing</strong><ul>${check.missing.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>`;
}

function previewCard(golfer) {
  const currentPhase = golfer.phases.find((item) => item.id === golfer.currentPhaseId) || golfer.phases[0];
  return `<article class="mini-preview"><div class="mini-preview-brand"><span class="brand-mark small">R</span><span>${escapeHtml(state.session.profile.businessName || state.session.profile.coachName)}</span></div><p>Private coaching roadmap</p><h3>${escapeHtml(golfer.name)}</h3><div><small>Goal</small><strong>${escapeHtml(golfer.goal || 'Add the golfer’s desired outcome')}</strong></div><div><small>What matters now</small><strong>${escapeHtml(golfer.currentPriority || 'Add one clear priority')}</strong></div><div><small>Current phase</small><strong>${escapeHtml(currentPhase?.title || 'Define the first phase')}</strong></div></article>`;
}

function publishTab(golfer, check) {
  const published = golfer.share?.status === 'published';
  return `
    <section class="editor-section">
      <div class="editor-intro"><p class="eyebrow">04 · Preview & share</p><h2>Review exactly what the golfer will receive.</h2><p>Publishing creates a private revocable link. This beta does not send a message or claim the golfer opened, booked, or paid.</p></div>
      <div class="publish-grid">
        <div>${readinessList(check)}
          <div class="publish-actions">
            <button type="button" id="open-preview" class="button secondary">Open coach preview</button>
            <button type="button" id="publish-roadmap" class="button primary" ${check.ready ? '' : 'disabled'}>${published ? 'Publish a new link' : 'Publish private link'}</button>
            ${published ? '<button type="button" id="revoke-roadmap" class="text-button danger-text">Revoke current link</button>' : ''}
          </div>
          ${state.lastShareUrl ? `<div class="share-result"><label>New private link<input id="share-url" readonly value="${escapeHtml(state.lastShareUrl)}"></label><div><button type="button" id="copy-share" class="button primary">Copy link</button><a class="button secondary" target="_blank" rel="noreferrer" href="${escapeHtml(state.lastShareUrl)}">Open</a></div><small>Copy this now. Publishing again replaces the prior link.</small></div>` : ''}
        </div>
        ${previewCard(golfer)}
      </div>
      <div class="response-panel"><div><p class="eyebrow">Golfer responses</p><h3>${golfer.responses.length ? `${golfer.responses.length} response${golfer.responses.length === 1 ? '' : 's'}` : 'No response yet'}</h3></div>${golfer.responses.length ? `<div class="response-list">${[...golfer.responses].reverse().map((item) => `<article><strong>${escapeHtml(RESPONSE_LABELS[item.action] || item.action)}</strong><span>${dateLabel(item.createdAt)}</span>${item.note ? `<p>${nl2br(item.note)}</p>` : ''}</article>`).join('')}</div>` : '<p class="muted">The golfer can choose ready, ask, wait, or decline. Roadmap stores the choice for the coach; it does not send a message.</p>'}</div>
      <div class="danger-zone"><div><strong>Delete this golfer record</strong><span>This permanently removes the beta record and invalidates its share link.</span></div><button type="button" id="delete-golfer" class="button danger">Delete</button></div>
    </section>`;
}

