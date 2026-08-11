import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitFor(url, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

function createClient(origin) {
  let cookie = '';
  let csrf = '';
  return {
    get csrf() { return csrf; },
    async request(pathname, { method = 'GET', body, useCsrf = true } = {}) {
      const headers = { Accept: 'application/json' };
      if (cookie) headers.Cookie = cookie;
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (useCsrf && !['GET', 'HEAD'].includes(method)) headers['X-CSRF-Token'] = csrf;
      const response = await fetch(`${origin}${pathname}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const setCookie = response.headers.get('set-cookie');
      if (setCookie) cookie = setCookie.split(';')[0];
      const data = await response.json().catch(() => ({}));
      if (data.csrf) csrf = data.csrf;
      return { response, data };
    },
  };
}

async function startServer({ dataFile, port }) {
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['src/server.mjs'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: {
      ...process.env,
      APP_SECRET: 'test-secret-that-is-longer-than-thirty-two-characters',
      BETA_INVITE_CODE: 'private-beta-test-code',
      DATA_FILE: dataFile,
      PORT: String(port),
      HOST: '127.0.0.1',
      PUBLIC_ORIGIN: origin,
      COOKIE_SECURE: 'false',
      NODE_ENV: 'test',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  await waitFor(`${origin}/api/health`);
  return {
    origin,
    child,
    async stop() {
      child.kill('SIGTERM');
      await new Promise((resolve) => child.once('exit', resolve));
      if (stderr) process.stderr.write(stderr);
    },
  };
}

test('invite-only beta supports isolated coach-to-golfer journey and survives restart', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'roadmap-beta-'));
  const dataFile = path.join(directory, 'store.json');
  const port = await freePort();
  let server = await startServer({ dataFile, port });
  t.after(async () => {
    if (server?.child && !server.child.killed) await server.stop();
    await fs.rm(directory, { recursive: true, force: true });
  });

  const coachA = createClient(server.origin);
  let result = await coachA.request('/api/register', {
    method: 'POST',
    useCsrf: false,
    body: { name: 'Maya Bennett', email: 'maya@example.test', password: 'correct-horse-battery', inviteCode: 'private-beta-test-code' },
  });
  assert.equal(result.response.status, 201);
  assert.ok(coachA.csrf);

  result = await coachA.request('/api/profile', {
    method: 'PUT',
    body: {
      coachName: 'Maya Bennett',
      businessName: 'Bennett Golf Coaching',
      contactEmail: 'maya@example.test',
      location: 'Alberta',
      philosophy: 'Clear priorities, honest evidence, and one useful next step.',
      accent: '#245c48',
      packages: [{ id: 'pkg_start', name: 'Start-Line Control', description: 'Three focused sessions.', priceLabel: 'CAD $595', actionLabel: 'View package', actionUrl: 'https://example.test/package', active: true }],
    },
  });
  assert.equal(result.response.status, 200);

  result = await coachA.request('/api/golfers', { method: 'POST', body: { name: 'Mark Chen' } });
  assert.equal(result.response.status, 201);
  const golfer = result.data.golfer;

  const phaseIds = golfer.phases.map((phase) => phase.id);
  result = await coachA.request(`/api/golfers/${golfer.id}`, {
    method: 'PUT',
    body: {
      ...golfer,
      goal: 'Break 90 more consistently.',
      motivation: 'Enjoy competitive rounds with friends.',
      constraints: 'One focused session most weeks.',
      assessment: 'Usable speed with an unpredictable right-start pattern.',
      strengths: 'Recognizes the intended window at controlled speed.',
      barriers: 'Adds speed before the start pattern is stable.',
      currentPriority: 'Keep the start window predictable before adding speed.',
      evidenceBoundary: 'Practice indication only; course transfer is not proven.',
      phases: [
        { id: phaseIds[0], title: 'Start-Line Control', purpose: 'Make initial direction predictable.', evidence: 'Repeated controlled sets.', status: 'current' },
        { id: phaseIds[1], title: 'Playable Driver Pattern', purpose: 'Build one recognizable stock pattern.', evidence: 'Mixed-speed target evidence.', status: 'next' },
        { id: phaseIds[2], title: 'On-Course Transfer', purpose: 'Test the pattern under playing decisions.', evidence: 'On-course observation.', status: 'directional' },
      ],
      currentPhaseId: phaseIds[0],
      packageId: 'pkg_start',
      nextActionLabel: 'Review the first phase',
      nextActionUrl: 'https://example.test/package',
      lessons: [{ id: 'les_1', title: 'Define the start window', date: '2026-08-01', status: 'complete', purpose: 'Establish direction.', observation: 'Window appeared intermittently.', takeaway: 'Speed can wait.', nextCheck: 'One controlled set.' }],
      practices: [{ id: 'pra_1', title: 'Repeat the window', date: '2026-08-02', status: 'active', objective: 'Repeat direction.', instructions: 'Three small sets.', cadence: 'Once this week.', successCheck: 'Recognizable window.', stopRule: 'Stop when the pattern is lost.' }],
      evidence: [{ id: 'evi_1', title: 'Controlled set', date: '2026-08-02', status: 'current', source: 'Coach count', observation: 'Fewer severe starts.', limitation: 'Small sample.', mediaUrl: '' }],
      reviews: [],
    },
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.readiness.ready, true);

  result = await coachA.request(`/api/golfers/${golfer.id}/publish`, { method: 'POST', body: {} });
  assert.equal(result.response.status, 200);
  assert.match(result.data.shareUrl, /^http:\/\/127\.0\.0\.1:\d+\/r\//);
  const shareToken = decodeURIComponent(new URL(result.data.shareUrl).pathname.split('/').pop());

  const publicResult = await fetch(`${server.origin}/api/share/${encodeURIComponent(shareToken)}`);
  assert.equal(publicResult.status, 200);
  const publicData = await publicResult.json();
  assert.equal(publicData.golfer.name, 'Mark Chen');
  assert.equal(publicData.coach.businessName, 'Bennett Golf Coaching');
  assert.equal(publicData.package.name, 'Start-Line Control');
  assert.equal('email' in publicData.golfer, false);

  const responseResult = await fetch(`${server.origin}/api/share/${encodeURIComponent(shareToken)}/respond`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'ask', note: 'Can we review the practice task?' }),
  });
  assert.equal(responseResult.status, 201);

  result = await coachA.request(`/api/golfers/${golfer.id}`);
  assert.equal(result.data.golfer.responses.length, 1);
  assert.equal(result.data.golfer.responses[0].action, 'ask');

  const coachB = createClient(server.origin);
  result = await coachB.request('/api/register', {
    method: 'POST', useCsrf: false,
    body: { name: 'Second Coach', email: 'second@example.test', password: 'another-strong-password', inviteCode: 'private-beta-test-code' },
  });
  assert.equal(result.response.status, 201);
  result = await coachB.request(`/api/golfers/${golfer.id}`);
  assert.equal(result.response.status, 404);

  await server.stop();
  server = null;
  const restartPort = await freePort();
  server = await startServer({ dataFile, port: restartPort });

  const returning = createClient(server.origin);
  result = await returning.request('/api/login', {
    method: 'POST', useCsrf: false,
    body: { email: 'maya@example.test', password: 'correct-horse-battery' },
  });
  assert.equal(result.response.status, 200);
  result = await returning.request('/api/golfers');
  assert.equal(result.data.golfers.length, 1);
  assert.equal(result.data.golfers[0].responseCount, 1);

  result = await returning.request(`/api/golfers/${golfer.id}/revoke`, { method: 'POST', body: {} });
  assert.equal(result.response.status, 200);
  const revoked = await fetch(`${server.origin}/api/share/${encodeURIComponent(shareToken)}`);
  assert.equal(revoked.status, 404);

  const stored = JSON.parse(await fs.readFile(dataFile, 'utf8'));
  assert.equal(stored.users.length, 2);
  assert.equal(stored.golfers.length, 1);
  assert.ok(stored.audit.length >= 8);
});
