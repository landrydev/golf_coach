import { randomId, randomToken } from './security.mjs';
import { newGolfer } from './store.mjs';
import { config, store } from './context.mjs';
import { readJson, sendError, sendJson } from './http.mjs';
import {
  listProjection,
  readiness,
  sanitizeGolfer,
  sanitizeProfile,
} from './domain.mjs';

export async function handlePrivateRoute(req, res, url, session) {
  const ownerId = session.user.id;

  if (req.method === 'PUT' && url.pathname === '/api/profile') {
    const body = await readJson(req);
    const existing = store.getProfile(ownerId);
    if (!existing) sendError(res, 404, 'Coach profile was not found.');
    else {
      const profile = sanitizeProfile(body, existing);
      await store.mutate('profile.update', ownerId, (state) => {
        const index = state.profiles.findIndex((item) => item.ownerId === ownerId);
        state.profiles[index] = profile;
      });
      sendJson(res, 200, { profile });
    }
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/golfers') {
    sendJson(res, 200, { golfers: store.listGolfers(ownerId).map(listProjection) });
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/golfers') {
    const body = await readJson(req);
    const golfer = newGolfer(ownerId, body);
    await store.mutate('golfer.create', ownerId, (state) => state.golfers.push(golfer));
    sendJson(res, 201, { golfer });
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/demo') {
    const existingDemo = store.listGolfers(ownerId).find((item) => item.name === 'Mark Chen — demo');
    if (existingDemo) sendJson(res, 200, { golfer: existingDemo, alreadyExisted: true });
    else {
      const golfer = newGolfer(ownerId, { name: 'Mark Chen — demo' });
      golfer.status = 'active';
      golfer.goal = 'Break 90 more consistently without driver penalty holes deciding the round.';
      golfer.motivation = 'Competitive rounds with friends should feel enjoyable rather than fragile.';
      golfer.constraints = 'One focused 30–45 minute practice session most weeks.';
      golfer.assessment = 'Mark has usable distance, but the driver start direction varies enough that a severe right miss can create several penalty shots in a round.';
      golfer.strengths = 'Athletic motion, useful speed, and a clear ability to recognize the intended start window at controlled pace.';
      golfer.barriers = 'Unpredictable start direction and adding speed before the pattern is stable.';
      golfer.currentPriority = 'Keep the start window predictable before adding speed.';
      golfer.evidenceBoundary = 'Current improvement is a controlled-practice signal. Full-speed and on-course transfer are not yet proven.';
      golfer.phases = [
        { id: randomId('pha_'), title: 'Start-Line Control', purpose: 'Make initial direction more predictable at manageable speed.', evidence: 'Repeated controlled-practice start window.', status: 'current' },
        { id: randomId('pha_'), title: 'Playable Driver Pattern', purpose: 'Build one recognizable stock pattern and reduce the severe right miss.', evidence: 'Mixed-speed and target evidence.', status: 'next' },
        { id: randomId('pha_'), title: 'On-Course Transfer', purpose: 'Test the pattern across targets, pressure, and club-choice decisions.', evidence: 'On-course observation and decision context.', status: 'directional' },
        { id: randomId('pha_'), title: 'Scoring Consolidation', purpose: 'Compare driver penalties with the rest of the scoring game before choosing the next priority.', evidence: 'Scoring and broader-game evidence.', status: 'directional' },
      ];
      golfer.currentPhaseId = golfer.phases[0].id;
      golfer.lessons = [{ id: randomId('les_'), title: 'Define the start window', date: new Date().toISOString().slice(0, 10), status: 'complete', purpose: 'Establish a recognizable initial direction at comfortable speed.', observation: 'The intended window appeared intermittently without adding speed.', takeaway: 'See the window first. Speed can wait.', nextCheck: 'Complete one controlled ten-ball set.' }];
      golfer.practices = [{ id: randomId('pra_'), title: 'Repeat the start window', date: '', status: 'active', objective: 'Repeat a recognizable start window before increasing speed.', instructions: 'Build three small sets. Pause between sets and record playable, recoverable, and likely-penalty starts.', cadence: 'One 30–40 minute session this week.', successCheck: 'The start window remains recognizable across two sets.', stopRule: 'Stop or ask the coach if the severe miss repeats without understanding.' }];
      golfer.evidence = [{ id: randomId('evi_'), title: 'Controlled practice sample', date: new Date().toISOString().slice(0, 10), status: 'current', source: 'Coach-counted practice set', observation: 'Fewer severe right starts at controlled speed.', limitation: 'Small sample; full-speed and course transfer are not proven.', mediaUrl: '' }];
      golfer.updatedAt = new Date().toISOString();
      await store.mutate('demo.create', ownerId, (state) => state.golfers.push(golfer));
      sendJson(res, 201, { golfer, alreadyExisted: false });
    }
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/export') {
    const profile = store.getProfile(ownerId);
    const golfers = store.listGolfers(ownerId).map((item) => ({
      ...item,
      share: { ...item.share, token: item.share.token ? '[redacted]' : '' },
    }));
    const filename = `roadmap-beta-export-${new Date().toISOString().slice(0, 10)}.json`;
    sendJson(res, 200, { exportedAt: new Date().toISOString(), profile, golfers }, {
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    return true;
  }

  const golferMatch = url.pathname.match(/^\/api\/golfers\/([^/]+)$/);
  if (golferMatch) {
    const golferId = decodeURIComponent(golferMatch[1]);
    const golfer = store.getGolfer(ownerId, golferId);
    if (!golfer) sendError(res, 404, 'Golfer was not found.');
    else if (req.method === 'GET') sendJson(res, 200, { golfer, readiness: readiness(golfer) });
    else if (req.method === 'PUT') {
      const body = await readJson(req);
      const updated = sanitizeGolfer(body, golfer);
      await store.mutate('golfer.update', ownerId, (state) => {
        const index = state.golfers.findIndex((item) => item.ownerId === ownerId && item.id === golferId);
        state.golfers[index] = updated;
      });
      sendJson(res, 200, { golfer: updated, readiness: readiness(updated) });
    } else if (req.method === 'DELETE') {
      await store.mutate('golfer.delete', ownerId, (state) => {
        state.golfers = state.golfers.filter((item) => !(item.ownerId === ownerId && item.id === golferId));
      });
      sendJson(res, 200, { deleted: true });
    } else return false;
    return true;
  }

  const publishMatch = url.pathname.match(/^\/api\/golfers\/([^/]+)\/publish$/);
  if (publishMatch && req.method === 'POST') {
    const golferId = decodeURIComponent(publishMatch[1]);
    const golfer = store.getGolfer(ownerId, golferId);
    if (!golfer) sendError(res, 404, 'Golfer was not found.');
    else {
      const check = readiness(golfer);
      if (!check.ready) sendError(res, 422, 'Complete the roadmap before publishing.', check);
      else {
        const token = randomToken(32);
        const publishedAt = new Date().toISOString();
        await store.mutate('golfer.publish', ownerId, (state) => {
          const target = state.golfers.find((item) => item.ownerId === ownerId && item.id === golferId);
          target.status = target.status === 'draft' ? 'active' : target.status;
          target.share = {
            status: 'published',
            token,
            publishedAt,
            revokedAt: null,
            revision: Number(target.share?.revision || 0) + 1,
          };
          target.updatedAt = publishedAt;
        });
        sendJson(res, 200, { shareUrl: `${config.publicOrigin}/r/${encodeURIComponent(token)}`, publishedAt });
      }
    }
    return true;
  }

  const revokeMatch = url.pathname.match(/^\/api\/golfers\/([^/]+)\/revoke$/);
  if (revokeMatch && req.method === 'POST') {
    const golferId = decodeURIComponent(revokeMatch[1]);
    const golfer = store.getGolfer(ownerId, golferId);
    if (!golfer) sendError(res, 404, 'Golfer was not found.');
    else {
      await store.mutate('golfer.revoke', ownerId, (state) => {
        const target = state.golfers.find((item) => item.ownerId === ownerId && item.id === golferId);
        target.share = { ...target.share, status: 'revoked', token: '', revokedAt: new Date().toISOString() };
        target.updatedAt = new Date().toISOString();
      });
      sendJson(res, 200, { revoked: true });
    }
    return true;
  }

  return false;
}
