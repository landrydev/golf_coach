import {
  isHttpUrl,
  normalizeEmail,
  randomId,
  safeText,
} from './security.mjs';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function sanitizePackages(value) {
  return asArray(value).slice(0, 20).map((item) => ({
    id: safeText(item.id || randomId('pkg_'), 80),
    name: safeText(item.name, 120),
    description: safeText(item.description, 1000),
    priceLabel: safeText(item.priceLabel, 80),
    actionLabel: safeText(item.actionLabel || 'View package', 80),
    actionUrl: isHttpUrl(item.actionUrl) ? safeText(item.actionUrl, 1000) : '',
    active: item.active !== false,
  }));
}

export function sanitizeProfile(input, existing) {
  return {
    ...existing,
    coachName: safeText(input.coachName, 120),
    businessName: safeText(input.businessName, 160),
    contactEmail: normalizeEmail(input.contactEmail).slice(0, 254),
    location: safeText(input.location, 160),
    philosophy: safeText(input.philosophy, 1200),
    accent: /^#[0-9a-f]{6}$/i.test(String(input.accent || '')) ? String(input.accent) : '#1f5a45',
    packages: sanitizePackages(input.packages),
    updatedAt: new Date().toISOString(),
  };
}

function sanitizePhases(value, existing = []) {
  const phases = asArray(value).slice(0, 4).map((item, index) => ({
    id: safeText(item.id || existing[index]?.id || randomId('pha_'), 80),
    title: safeText(item.title || `Phase ${index + 1}`, 120),
    purpose: safeText(item.purpose, 1200),
    evidence: safeText(item.evidence, 800),
    status: ['current', 'next', 'directional', 'complete'].includes(item.status) ? item.status : 'directional',
  }));
  while (phases.length < 3) {
    phases.push({ id: randomId('pha_'), title: `Phase ${phases.length + 1}`, purpose: '', evidence: '', status: 'directional' });
  }
  return phases;
}

function sanitizeEntries(value, type) {
  const limits = { lessons: 100, practices: 100, evidence: 150, reviews: 50 };
  return asArray(value).slice(0, limits[type] || 100).map((item) => {
    const base = {
      id: safeText(item.id || randomId(`${type.slice(0, 3)}_`), 80),
      title: safeText(item.title, 160),
      date: safeText(item.date, 32),
      status: safeText(item.status, 40),
      createdAt: safeText(item.createdAt || new Date().toISOString(), 40),
      updatedAt: new Date().toISOString(),
    };
    if (type === 'lessons') {
      return { ...base, purpose: safeText(item.purpose, 1200), observation: safeText(item.observation, 2500), takeaway: safeText(item.takeaway, 1200), nextCheck: safeText(item.nextCheck, 1200) };
    }
    if (type === 'practices') {
      return { ...base, objective: safeText(item.objective, 1200), instructions: safeText(item.instructions, 3000), cadence: safeText(item.cadence, 600), successCheck: safeText(item.successCheck, 1200), stopRule: safeText(item.stopRule, 1200) };
    }
    if (type === 'evidence') {
      return { ...base, source: safeText(item.source, 120), observation: safeText(item.observation, 2500), limitation: safeText(item.limitation, 1200), mediaUrl: isHttpUrl(item.mediaUrl) ? safeText(item.mediaUrl, 1000) : '' };
    }
    return { ...base, outcome: safeText(item.outcome, 80), summary: safeText(item.summary, 2500), nextPhase: safeText(item.nextPhase, 1200) };
  });
}

export function sanitizeGolfer(input, existing) {
  const phases = sanitizePhases(input.phases, existing.phases);
  const currentPhaseId = phases.some((item) => item.id === input.currentPhaseId)
    ? input.currentPhaseId
    : phases[0].id;
  return {
    ...existing,
    name: safeText(input.name, 120),
    email: normalizeEmail(input.email).slice(0, 254),
    status: ['draft', 'active', 'paused', 'complete'].includes(input.status) ? input.status : existing.status,
    goal: safeText(input.goal, 1200),
    motivation: safeText(input.motivation, 1200),
    constraints: safeText(input.constraints, 1200),
    assessment: safeText(input.assessment, 3500),
    strengths: safeText(input.strengths, 1800),
    barriers: safeText(input.barriers, 1800),
    currentPriority: safeText(input.currentPriority, 1200),
    evidenceBoundary: safeText(input.evidenceBoundary, 1200),
    phases,
    currentPhaseId,
    packageId: safeText(input.packageId, 80),
    nextActionLabel: safeText(input.nextActionLabel || 'Contact your coach', 80),
    nextActionUrl: isHttpUrl(input.nextActionUrl) ? safeText(input.nextActionUrl, 1000) : '',
    lessons: sanitizeEntries(input.lessons, 'lessons'),
    practices: sanitizeEntries(input.practices, 'practices'),
    evidence: sanitizeEntries(input.evidence, 'evidence'),
    reviews: sanitizeEntries(input.reviews, 'reviews'),
    updatedAt: new Date().toISOString(),
  };
}

export function readiness(golfer) {
  const missing = [];
  if (!golfer.name) missing.push('golfer name');
  if (!golfer.goal) missing.push('goal');
  if (!golfer.assessment) missing.push('starting assessment');
  if (!golfer.currentPriority) missing.push('current priority');
  if (golfer.phases.length < 3 || golfer.phases.some((item) => !item.title || !item.purpose)) missing.push('three complete phases');
  return { ready: missing.length === 0, missing };
}

export function publicProjection(golfer, profile) {
  const packageItem = profile.packages.find((item) => item.id === golfer.packageId && item.active !== false) ?? null;
  const currentPhase = golfer.phases.find((item) => item.id === golfer.currentPhaseId) ?? golfer.phases[0] ?? null;
  return {
    golfer: {
      id: golfer.id,
      name: golfer.name,
      status: golfer.status,
      goal: golfer.goal,
      motivation: golfer.motivation,
      constraints: golfer.constraints,
      assessment: golfer.assessment,
      strengths: golfer.strengths,
      barriers: golfer.barriers,
      currentPriority: golfer.currentPriority,
      evidenceBoundary: golfer.evidenceBoundary,
      phases: golfer.phases,
      currentPhaseId: golfer.currentPhaseId,
      currentPhase,
      nextActionLabel: golfer.nextActionLabel,
      nextActionUrl: golfer.nextActionUrl,
      lessons: golfer.lessons,
      practices: golfer.practices,
      evidence: golfer.evidence,
      reviews: golfer.reviews,
      updatedAt: golfer.updatedAt,
      publishedAt: golfer.share.publishedAt,
      revision: golfer.share.revision,
    },
    coach: {
      coachName: profile.coachName,
      businessName: profile.businessName,
      contactEmail: profile.contactEmail,
      location: profile.location,
      philosophy: profile.philosophy,
      accent: profile.accent,
    },
    package: packageItem,
  };
}

export function listProjection(item) {
  const currentPhase = item.phases.find((phase) => phase.id === item.currentPhaseId);
  return {
    id: item.id,
    name: item.name,
    email: item.email,
    status: item.status,
    goal: item.goal,
    currentPriority: item.currentPriority,
    currentPhase: currentPhase?.title || '',
    published: item.share.status === 'published',
    responseCount: item.responses.length,
    updatedAt: item.updatedAt,
  };
}
