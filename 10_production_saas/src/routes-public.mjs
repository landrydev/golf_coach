import path from 'node:path';
import {
  clearSessionCookie,
  hashPassword,
  normalizeEmail,
  randomId,
  randomToken,
  safeText,
  timingSafeEqualText,
  verifyPassword,
} from './security.mjs';
import { newProfile } from './store.mjs';
import { config, responseRate, store } from './context.mjs';
import {
  createSession,
  readJson,
  sendError,
  sendJson,
  sessionFromRequest,
  sessionResponseCookie,
} from './http.mjs';
import { publicProjection } from './domain.mjs';

export async function handlePublicRoute(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/health') {
    sendJson(res, 200, { status: 'ok', version: '0.1.0', dataFile: path.basename(config.dataFile) });
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/session') {
    const session = sessionFromRequest(req);
    if (!session) sendJson(res, 200, { authenticated: false });
    else {
      const profile = store.getProfile(session.user.id);
      sendJson(res, 200, {
        authenticated: true,
        csrf: session.csrf,
        user: { id: session.user.id, name: session.user.name, email: session.user.email },
        profile,
      });
    }
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/register') {
    const body = await readJson(req);
    if (!timingSafeEqualText(body.inviteCode, config.betaInviteCode)) {
      sendError(res, 403, 'The beta invite code is not valid.');
      return true;
    }
    const name = safeText(body.name, 120);
    const email = normalizeEmail(body.email);
    if (!name || !email || !email.includes('@')) {
      sendError(res, 400, 'Name and a valid email are required.');
      return true;
    }
    if (store.findUserByEmail(email)) {
      sendError(res, 409, 'An account already exists for this email.');
      return true;
    }
    const password = await hashPassword(String(body.password || ''));
    const user = {
      id: randomId('usr_'),
      name,
      email,
      passwordSalt: password.salt,
      passwordHash: password.hash,
      createdAt: new Date().toISOString(),
    };
    await store.mutate('account.register', user.id, (state) => {
      state.users.push(user);
      state.profiles.push(newProfile(user.id, name, email));
    });
    const session = createSession(user);
    sendJson(res, 201, { authenticated: true, csrf: session.payload.csrf }, {
      'Set-Cookie': sessionResponseCookie(session.token),
    });
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/login') {
    const body = await readJson(req);
    const email = normalizeEmail(body.email);
    const user = store.findUserByEmail(email);
    const valid = user && await verifyPassword(String(body.password || ''), user.passwordSalt, user.passwordHash);
    if (!valid) sendError(res, 401, 'Email or password is incorrect.');
    else {
      const session = createSession(user);
      sendJson(res, 200, { authenticated: true, csrf: session.payload.csrf }, {
        'Set-Cookie': sessionResponseCookie(session.token),
      });
    }
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/logout') {
    sendJson(res, 200, { authenticated: false }, {
      'Set-Cookie': clearSessionCookie({ secure: config.cookieSecure }),
    });
    return true;
  }

  const shareMatch = url.pathname.match(/^\/api\/share\/([^/]+)$/);
  if (shareMatch && req.method === 'GET') {
    const token = decodeURIComponent(shareMatch[1]);
    const golfer = store.getGolferByShareToken(token);
    const profile = golfer ? store.getProfile(golfer.ownerId) : null;
    if (!golfer || !profile) sendError(res, 404, 'This private roadmap link is unavailable.');
    else sendJson(res, 200, publicProjection(golfer, profile));
    return true;
  }

  const responseMatch = url.pathname.match(/^\/api\/share\/([^/]+)\/respond$/);
  if (responseMatch && req.method === 'POST') {
    const token = decodeURIComponent(responseMatch[1]);
    const golfer = store.getGolferByShareToken(token);
    if (!golfer) {
      sendError(res, 404, 'This private roadmap link is unavailable.');
      return true;
    }
    const rateKey = `${token}:${req.socket.remoteAddress || 'unknown'}`;
    const last = responseRate.get(rateKey) || 0;
    if (Date.now() - last < 10_000) {
      sendError(res, 429, 'Please wait before submitting another response.');
      return true;
    }
    const body = await readJson(req, 20_000);
    const action = ['ready', 'ask', 'wait', 'decline'].includes(body.action) ? body.action : '';
    if (!action) {
      sendError(res, 400, 'Choose one response.');
      return true;
    }
    const response = {
      id: randomId('rsp_'),
      action,
      note: safeText(body.note, 600),
      createdAt: new Date().toISOString(),
    };
    await store.mutate('golfer.response', golfer.ownerId, (state) => {
      const target = state.golfers.find((item) => item.id === golfer.id);
      target.responses.push(response);
      target.updatedAt = new Date().toISOString();
    });
    responseRate.set(rateKey, Date.now());
    sendJson(res, 201, { response });
    return true;
  }

  return false;
}
