import {
  csrfMatches,
  parseCookies,
  randomToken,
  sessionCookie,
  signSession,
  verifySession,
} from './security.mjs';
import { config, store } from './context.mjs';

export function securityHeaders(contentType = 'application/json; charset=utf-8') {
  return {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https:; media-src 'self' https:; style-src 'self'; script-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  };
}

export function sendJson(res, status, data, extraHeaders = {}) {
  res.writeHead(status, { ...securityHeaders(), ...extraHeaders });
  res.end(JSON.stringify(data));
}

export function sendError(res, status, message, details = undefined) {
  sendJson(res, status, { error: message, ...(details ? { details } : {}) });
}

export async function readJson(req, maxBytes = 1_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      const error = new Error('Request body is too large.');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('Request body must be valid JSON.');
    error.statusCode = 400;
    throw error;
  }
}

export function sessionFromRequest(req) {
  const token = parseCookies(req.headers.cookie).roadmap_session;
  const payload = verifySession(token, config.appSecret);
  if (!payload) return null;
  const user = store.findUserById(payload.userId);
  return user ? { ...payload, user } : null;
}

export function createSession(user) {
  const expiresAt = Date.now() + config.sessionHours * 60 * 60 * 1000;
  const payload = {
    userId: user.id,
    email: user.email,
    csrf: randomToken(24),
    expiresAt,
  };
  return { payload, token: signSession(payload, config.appSecret) };
}

export function sessionResponseCookie(token) {
  return sessionCookie(token, {
    secure: config.cookieSecure,
    maxAgeSeconds: config.sessionHours * 3600,
  });
}

export function requireSession(req, res) {
  const session = sessionFromRequest(req);
  if (!session) {
    sendError(res, 401, 'Sign in is required.');
    return null;
  }
  return session;
}

export function requireMutation(req, res) {
  const session = requireSession(req, res);
  if (!session) return null;
  if (!csrfMatches(session, req.headers['x-csrf-token'])) {
    sendError(res, 403, 'The security token is missing or expired. Refresh and try again.');
    return null;
  }
  return session;
}
