import fs from 'node:fs/promises';
import path from 'node:path';
import { randomId, safeText } from './security.mjs';

const EMPTY_STORE = Object.freeze({
  schemaVersion: 1,
  users: [],
  profiles: [],
  golfers: [],
  audit: [],
});

function cloneEmptyStore() {
  return JSON.parse(JSON.stringify(EMPTY_STORE));
}

function nowIso() {
  return new Date().toISOString();
}

export class JsonStore {
  constructor(filePath) {
    this.filePath = path.resolve(filePath);
    this.state = cloneEmptyStore();
    this.writeQueue = Promise.resolve();
    this.mutationQueue = Promise.resolve();
  }

  async init() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      this.state = {
        ...cloneEmptyStore(),
        ...parsed,
        users: Array.isArray(parsed.users) ? parsed.users : [],
        profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
        golfers: Array.isArray(parsed.golfers) ? parsed.golfers : [],
        audit: Array.isArray(parsed.audit) ? parsed.audit : [],
      };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await this.persist();
    }
    return this;
  }

  async persist() {
    this.writeQueue = this.writeQueue.then(async () => {
      const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
      const serialized = `${JSON.stringify(this.state, null, 2)}\n`;
      await fs.writeFile(tempPath, serialized, { encoding: 'utf8', mode: 0o600 });
      await fs.rename(tempPath, this.filePath);
    });
    return this.writeQueue;
  }

  async mutate(action, actorId, callback) {
    const operation = this.mutationQueue.then(async () => {
      const result = callback(this.state);
      this.state.audit.push({
        id: randomId('aud_'),
        at: nowIso(),
        actorId: actorId ?? null,
        action: safeText(action, 120),
      });
      if (this.state.audit.length > 1000) this.state.audit = this.state.audit.slice(-1000);
      await this.persist();
      return result;
    });

    // Keep later mutations moving even when one caller observes a rejected operation.
    this.mutationQueue = operation.catch(() => undefined);
    return operation;
  }

  findUserByEmail(email) {
    return this.state.users.find((item) => item.email === email) ?? null;
  }

  findUserById(id) {
    return this.state.users.find((item) => item.id === id) ?? null;
  }

  getProfile(ownerId) {
    return this.state.profiles.find((item) => item.ownerId === ownerId) ?? null;
  }

  listGolfers(ownerId) {
    return this.state.golfers
      .filter((item) => item.ownerId === ownerId)
      .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
  }

  getGolfer(ownerId, golferId) {
    return this.state.golfers.find((item) => item.ownerId === ownerId && item.id === golferId) ?? null;
  }

  getGolferByShareToken(token) {
    return this.state.golfers.find((item) => item.share?.status === 'published' && item.share?.token === token) ?? null;
  }
}

export function newProfile(ownerId, name, email) {
  return {
    ownerId,
    coachName: safeText(name, 120),
    businessName: '',
    contactEmail: safeText(email, 254),
    location: '',
    philosophy: '',
    accent: '#1f5a45',
    packages: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

export function newGolfer(ownerId, input = {}) {
  const id = randomId('gol_');
  const phase1 = randomId('pha_');
  const phase2 = randomId('pha_');
  const phase3 = randomId('pha_');
  const now = nowIso();
  return {
    id,
    ownerId,
    name: safeText(input.name || 'New golfer', 120),
    email: safeText(input.email, 254),
    status: 'draft',
    goal: '',
    motivation: '',
    constraints: '',
    assessment: '',
    strengths: '',
    barriers: '',
    currentPriority: '',
    evidenceBoundary: '',
    phases: [
      { id: phase1, title: 'Foundation', purpose: '', evidence: '', status: 'current' },
      { id: phase2, title: 'Build', purpose: '', evidence: '', status: 'directional' },
      { id: phase3, title: 'Transfer', purpose: '', evidence: '', status: 'directional' },
    ],
    currentPhaseId: phase1,
    packageId: '',
    nextActionLabel: 'Contact your coach',
    nextActionUrl: '',
    lessons: [],
    practices: [],
    evidence: [],
    reviews: [],
    responses: [],
    share: { status: 'draft', token: '', publishedAt: null, revokedAt: null, revision: 0 },
    createdAt: now,
    updatedAt: now,
  };
}
