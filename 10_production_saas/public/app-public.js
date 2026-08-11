function publicPage(data, { preview = false } = {}) {
  const { golfer, coach, package: packageItem } = data;
  const currentPhase = golfer.currentPhase || golfer.phases.find((item) => item.id === golfer.currentPhaseId) || golfer.phases[0];
  const accent = /^#[0-9a-f]{6}$/i.test(coach.accent || '') ? coach.accent : '#1f5a45';
  return `
    <main id="main" class="public-roadmap" style="--coach-accent:${escapeHtml(accent)}">
      ${preview ? '<div class="preview-bar"><button id="close-preview">← Return to editor</button><span>Coach preview · not the published link</span></div>' : ''}
      <header class="public-header"><div class="public-brand"><span class="coach-monogram">${escapeHtml((coach.businessName || coach.coachName || 'R').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase())}</span><span><strong>${escapeHtml(coach.businessName || coach.coachName)}</strong><small>${escapeHtml(coach.location || 'Private coaching roadmap')}</small></span></div><span class="private-label">Private · coach-authored</span></header>
      <section class="public-hero"><p class="eyebrow">${escapeHtml(golfer.name)}’s coaching journey</p><h1>${escapeHtml(golfer.currentPriority || golfer.goal)}</h1><p>${escapeHtml(currentPhase?.purpose || golfer.assessment)}</p><div class="public-meta"><span><small>Current phase</small><strong>${escapeHtml(currentPhase?.title || 'Roadmap')}</strong></span><span><small>Last updated</small><strong>${dateLabel(golfer.updatedAt)}</strong></span><span><small>Coach</small><strong>${escapeHtml(coach.coachName)}</strong></span></div></section>
      <nav class="public-anchor-nav" aria-label="Roadmap sections"><a href="#now">Now</a><a href="#goal">Goal</a><a href="#roadmap">Roadmap</a>${golfer.lessons.length ? '<a href="#lessons">Lessons</a>' : ''}${golfer.practices.length ? '<a href="#practice">Practice</a>' : ''}${golfer.evidence.length ? '<a href="#evidence">Evidence</a>' : ''}${golfer.reviews.length ? '<a href="#reviews">Reviews</a>' : ''}</nav>
      <div class="public-content">
        <section id="now" class="public-section now-section"><div><p class="eyebrow">What matters now</p><h2>${escapeHtml(golfer.currentPriority)}</h2><p>${nl2br(golfer.evidenceBoundary || currentPhase?.evidence || '')}</p></div>${golfer.practices[0] ? `<article class="current-practice"><span>Current practice</span><strong>${escapeHtml(golfer.practices[0].title)}</strong><p>${nl2br(golfer.practices[0].objective || golfer.practices[0].instructions)}</p><small>${escapeHtml(golfer.practices[0].cadence)}</small></article>` : ''}</section>
        <section id="goal" class="public-section reading-section"><p class="eyebrow">Your goal</p><h2>${escapeHtml(golfer.goal)}</h2>${golfer.motivation ? `<blockquote>${nl2br(golfer.motivation)}</blockquote>` : ''}<div class="public-two"><article><span>Starting point</span><p>${nl2br(golfer.assessment)}</p></article><article><span>Real context</span><p>${nl2br(golfer.constraints || 'The plan can be adjusted as real-life context changes.')}</p></article></div>${golfer.strengths ? `<div class="strength-note"><strong>What we can build on</strong><p>${nl2br(golfer.strengths)}</p></div>` : ''}${golfer.barriers ? `<div class="barrier-note"><strong>Priority barriers</strong><p>${nl2br(golfer.barriers)}</p></div>` : ''}</section>
        <section id="roadmap" class="public-section"><p class="eyebrow">Development roadmap</p><h2>A direction that can change as evidence develops.</h2><div class="public-phase-list">${golfer.phases.map((phase, index) => `<article class="public-phase ${phase.id === golfer.currentPhaseId ? 'current' : ''}"><span class="public-phase-number">0${index + 1}</span><div><small>${phase.id === golfer.currentPhaseId ? 'Current phase' : escapeHtml(phase.status || 'Directional')}</small><h3>${escapeHtml(phase.title)}</h3><p>${nl2br(phase.purpose)}</p>${phase.evidence ? `<em>Evidence that would matter: ${escapeHtml(phase.evidence)}</em>` : ''}</div></article>`).join('')}</div><p class="honest-boundary">Future phases may change. This roadmap supports the goal; it does not promise a score, result, or timeline.</p></section>
        ${golfer.lessons.length ? `<section id="lessons" class="public-section"><p class="eyebrow">Lesson chapters</p><h2>What the work has added so far.</h2><div class="public-card-list">${golfer.lessons.slice().reverse().map((item) => `<article><div class="card-date"><span>${dateLabel(item.date)}</span><small>${escapeHtml(item.status || 'Lesson')}</small></div><h3>${escapeHtml(item.title)}</h3>${item.purpose ? `<p>${nl2br(item.purpose)}</p>` : ''}${item.observation ? `<div><strong>Coach observation</strong><p>${nl2br(item.observation)}</p></div>` : ''}${item.takeaway ? `<blockquote>${nl2br(item.takeaway)}</blockquote>` : ''}${item.nextCheck ? `<small>Next check · ${escapeHtml(item.nextCheck)}</small>` : ''}</article>`).join('')}</div></section>` : ''}
        ${golfer.practices.length ? `<section id="practice" class="public-section"><p class="eyebrow">Practice direction</p><h2>One useful task at a time.</h2><div class="public-card-list">${golfer.practices.slice().reverse().map((item) => `<article><div class="card-date"><span>${escapeHtml(item.cadence || dateLabel(item.date))}</span><small>${escapeHtml(item.status || 'Practice')}</small></div><h3>${escapeHtml(item.title)}</h3><p>${nl2br(item.objective)}</p>${item.instructions ? `<div class="practice-instructions"><strong>How to practise</strong><p>${nl2br(item.instructions)}</p></div>` : ''}${item.successCheck ? `<div><strong>Success check</strong><p>${nl2br(item.successCheck)}</p></div>` : ''}${item.stopRule ? `<div class="stop-note"><strong>Stop or ask when</strong><p>${nl2br(item.stopRule)}</p></div>` : ''}</article>`).join('')}</div></section>` : ''}
        ${golfer.evidence.length ? `<section id="evidence" class="public-section"><p class="eyebrow">Selected evidence</p><h2>Signals with their limits still attached.</h2><div class="evidence-grid">${golfer.evidence.slice().reverse().map((item) => `<article><span>${escapeHtml(item.source || 'Coach-selected evidence')}</span><h3>${escapeHtml(item.title)}</h3><p>${nl2br(item.observation)}</p>${item.mediaUrl ? `<a href="${escapeHtml(item.mediaUrl)}" target="_blank" rel="noreferrer">Open attached media ↗</a>` : ''}${item.limitation ? `<small>Limitation · ${escapeHtml(item.limitation)}</small>` : ''}</article>`).join('')}</div></section>` : ''}
        ${golfer.reviews.length ? `<section id="reviews" class="public-section"><p class="eyebrow">Phase reviews</p><h2>What changed and why the plan continues or changes.</h2><div class="public-card-list">${golfer.reviews.slice().reverse().map((item) => `<article><div class="card-date"><span>${dateLabel(item.date)}</span><small>${escapeHtml(item.outcome || 'Review')}</small></div><h3>${escapeHtml(item.title)}</h3><p>${nl2br(item.summary)}</p>${item.nextPhase ? `<div><strong>Next direction</strong><p>${nl2br(item.nextPhase)}</p></div>` : ''}</article>`).join('')}</div></section>` : ''}
        <section class="public-section action-section"><div><p class="eyebrow">A clear next step</p><h2>${packageItem ? escapeHtml(packageItem.name) : escapeHtml(golfer.nextActionLabel || 'Continue the conversation with your coach')}</h2><p>${packageItem?.description ? nl2br(packageItem.description) : 'This decision belongs to you and your coach. You can ask questions, wait, or decline without losing the clarity of the plan.'}</p>${packageItem?.priceLabel ? `<strong class="package-price">${escapeHtml(packageItem.priceLabel)}</strong>` : ''}</div>${golfer.nextActionUrl || packageItem?.actionUrl ? `<a class="button primary public-action" href="${escapeHtml(golfer.nextActionUrl || packageItem.actionUrl)}" target="_blank" rel="noreferrer">${escapeHtml(golfer.nextActionLabel || packageItem.actionLabel || 'Open coach’s next step')} ↗</a>` : `<a class="button primary public-action" href="mailto:${escapeHtml(coach.contactEmail)}">Ask ${escapeHtml(coach.coachName)}</a>`}</section>
        ${preview ? '' : `<section class="response-box"><p class="eyebrow">Your response</p><h2>What feels right after reviewing the plan?</h2><form id="response-form"><div class="response-options">${Object.entries(RESPONSE_LABELS).map(([value, label]) => `<label><input type="radio" name="action" value="${value}" required><span>${escapeHtml(label)}</span></label>`).join('')}</div><label class="field"><span>Optional note</span><textarea name="note" rows="3" maxlength="600" placeholder="Keep this short. Roadmap is not a message thread."></textarea></label><button class="button primary" type="submit">Send response to coach</button><p class="tiny">This stores your choice in the coach’s Roadmap workspace. It does not send email, book a lesson, or process payment.</p></form></section>`}
      </div>
      <footer class="public-footer"><div class="wordmark">Roadmap<span>.</span></div><p>Coach-authored clarity for the next useful step.</p><small>Private beta · Adult golfers only · No automated diagnosis or guaranteed outcome</small></footer>
    </main>`;
}

function renderPublicPreview(golfer, profile) {
  const packageItem = profile.packages.find((item) => item.id === golfer.packageId) || null;
  const currentPhase = golfer.phases.find((item) => item.id === golfer.currentPhaseId) || golfer.phases[0];
  app.innerHTML = publicPage({ golfer: { ...golfer, currentPhase }, coach: profile, package: packageItem }, { preview: true });
  document.querySelector('#close-preview').addEventListener('click', () => renderGolfer(golfer.id));
  scrollTo({ top: 0, behavior: 'smooth' });
}

async function renderPublic(token) {
  try {
    const data = await api(`/api/share/${encodeURIComponent(token)}`);
    app.innerHTML = publicPage(data);
    document.querySelector('#response-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const body = Object.fromEntries(new FormData(form));
      try {
        setBusy(true);
        await api(`/api/share/${encodeURIComponent(token)}/respond`, { method: 'POST', body: JSON.stringify(body) });
        form.innerHTML = `<div class="response-success">${icon('check')}<div><strong>Your response was recorded.</strong><span>Your coach will see the choice the next time they open Roadmap.</span></div></div>`;
      } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
    });
  } catch (error) {
    app.innerHTML = `<main id="main" class="unavailable-page"><div class="wordmark">Roadmap<span>.</span></div><span class="empty-symbol">◇</span><h1>This private roadmap is unavailable.</h1><p>The coach may have revoked or replaced the link. Ask the coach for the current version.</p></main>`;
  }
}

async function renderRoute() {
  if (!state.session) return renderAuth('login');
  if (state.route === 'profile') return renderProfile();
  if (state.route.startsWith('golfer:')) return renderGolfer(state.route.split(':')[1]);
  return renderDashboard();
}

async function boot() {
  const shareMatch = location.pathname.match(/^\/r\/([^/]+)$/);
  if (shareMatch) return renderPublic(decodeURIComponent(shareMatch[1]));
  try {
    await loadSession();
    if (!state.session) return renderAuth('login');
    state.route = currentRouteFromLocation();
    await renderRoute();
  } catch (error) {
    app.innerHTML = `<main class="unavailable-page"><h1>Roadmap could not start.</h1><p>${escapeHtml(error.message)}</p><button class="button primary" onclick="location.reload()">Try again</button></main>`;
  }
}

addEventListener('popstate', () => {
  if (location.pathname.startsWith('/r/')) return location.reload();
  state.route = currentRouteFromLocation();
  renderRoute();
});

boot();
