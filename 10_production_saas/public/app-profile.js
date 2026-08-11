function profileContent(profile) {
  return `
    <header class="workspace-header"><div><p class="eyebrow">Profile & packages</p><h1>Keep the coach—not Roadmap—at the centre.</h1><p>Branding is bounded so every golfer journey stays readable, credible, and easy to maintain.</p></div><button id="export-data" class="button secondary">Export my beta data</button></header>
    <form id="profile-form" class="profile-layout">
      <section class="editor-section">
        <div class="editor-intro compact"><p class="eyebrow">Coach identity</p><h2>How golfers recognize the plan</h2></div>
        <div class="form-grid two">${field('Coach display name', 'coachName', profile.coachName, { required: true })}${field('Business name', 'businessName', profile.businessName)}</div>
        <div class="form-grid two">${field('Contact email', 'contactEmail', profile.contactEmail, { type: 'email' })}${field('Location', 'location', profile.location)}</div>
        ${field('Coaching philosophy', 'philosophy', profile.philosophy, { type: 'textarea', rows: 4, placeholder: 'A short, plain-language description of how you help golfers improve.' })}
        <label class="field"><span>Accent colour</span><div class="colour-row"><input name="accent" type="color" value="${escapeHtml(profile.accent || '#1f5a45')}"><span>Roadmap protects contrast and hierarchy around your accent.</span></div></label>
      </section>
      <section class="editor-section">
        <div class="editor-intro compact"><p class="eyebrow">Lesson packages</p><h2>Connect a phase to an offer you already sell</h2><p>These links leave Roadmap. No booking or payment is processed here.</p></div>
        <div id="package-list" class="package-editor-list">${(profile.packages || []).map((item, index) => packageEditor(item, index)).join('')}</div>
        <button id="add-package" type="button" class="button secondary">${icon('plus')} Add package</button>
      </section>
      <div class="sticky-save"><span>Changes apply to future and republished roadmaps.</span><button type="submit" class="button primary">Save profile</button></div>
    </form>`;
}

function packageEditor(item, index) {
  return `<article class="package-editor"><div class="package-editor-head"><span>Package ${index + 1}</span><button type="button" class="icon-button danger" data-remove-package="${index}" aria-label="Remove package">×</button></div><div class="form-grid two">${field('Name', `package-${index}-name`, item.name, { required: true })}${field('Price label', `package-${index}-priceLabel`, item.priceLabel, { placeholder: 'CAD $595' })}</div>${field('Description', `package-${index}-description`, item.description, { type: 'textarea', rows: 3 })}<div class="form-grid two">${field('Action label', `package-${index}-actionLabel`, item.actionLabel || 'View package')}${field('External URL', `package-${index}-actionUrl`, item.actionUrl, { type: 'url', placeholder: 'https://…' })}</div><label class="check-field"><input type="checkbox" name="package-${index}-active" ${item.active !== false ? 'checked' : ''}> Available for new roadmap recommendations</label></article>`;
}

function collectProfile() {
  const form = document.querySelector('#profile-form');
  const data = new FormData(form);
  const profile = structuredClone(state.session.profile);
  for (const key of ['coachName', 'businessName', 'contactEmail', 'location', 'philosophy', 'accent']) profile[key] = data.get(key) || '';
  profile.packages = profile.packages.map((item, index) => ({ ...item, name: data.get(`package-${index}-name`) || '', priceLabel: data.get(`package-${index}-priceLabel`) || '', description: data.get(`package-${index}-description`) || '', actionLabel: data.get(`package-${index}-actionLabel`) || '', actionUrl: data.get(`package-${index}-actionUrl`) || '', active: data.has(`package-${index}-active`) }));
  return profile;
}

function renderProfile() {
  app.innerHTML = shell(profileContent(state.session.profile));
  attachShellEvents();
  document.querySelector('#profile-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const profile = collectProfile();
    try {
      setBusy(true);
      const result = await api('/api/profile', { method: 'PUT', body: JSON.stringify(profile) });
      state.session.profile = result.profile;
      renderProfile();
      toast('Profile and packages saved.');
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  });
  document.querySelector('#add-package').addEventListener('click', () => {
    state.session.profile = collectProfile();
    state.session.profile.packages.push({ id: `local_${crypto.randomUUID()}`, name: '', description: '', priceLabel: '', actionLabel: 'View package', actionUrl: '', active: true });
    renderProfile();
  });
  document.querySelectorAll('[data-remove-package]').forEach((button) => button.addEventListener('click', () => {
    state.session.profile = collectProfile();
    state.session.profile.packages.splice(Number(button.dataset.removePackage), 1);
    renderProfile();
  }));
  document.querySelector('#export-data').addEventListener('click', () => window.open('/api/export', '_blank', 'noopener'));
}

