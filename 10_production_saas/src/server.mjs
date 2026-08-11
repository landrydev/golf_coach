import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './context.mjs';
import {
  requireMutation,
  requireSession,
  securityHeaders,
  sendError,
} from './http.mjs';
import { handlePublicRoute } from './routes-public.mjs';
import { handlePrivateRoute } from './routes-private.mjs';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const STATIC_FILES = new Set([
  'index.html',
  'app-base.js',
  'app-editor-content.js',
  'app-editor-actions.js',
  'app-profile.js',
  'app-public.js',
  'styles-core.css',
  'styles-editor.css',
  'styles-public.css',
]);

async function apiRoute(req, res, url) {
  if (await handlePublicRoute(req, res, url)) return;
  const session = ['GET', 'HEAD'].includes(req.method)
    ? requireSession(req, res)
    : requireMutation(req, res);
  if (!session) return;
  if (await handlePrivateRoute(req, res, url, session)) return;
  sendError(res, 404, 'API route was not found.');
}

async function serveStatic(req, res, url) {
  const requested = url.pathname.replace(/^\//, '');
  const relativePath = url.pathname === '/' || url.pathname.startsWith('/r/') || !STATIC_FILES.has(requested)
    ? 'index.html'
    : requested;
  const filePath = path.join(config.publicDir, relativePath);
  try {
    const data = await fs.readFile(filePath);
    const contentType = MIME[path.extname(filePath)] || 'application/octet-stream';
    res.writeHead(200, {
      ...securityHeaders(contentType),
      ...(relativePath === 'index.html' ? {} : { 'Cache-Control': 'public, max-age=300' }),
    });
    if (req.method === 'HEAD') return res.end();
    res.end(data);
  } catch {
    sendError(res, 404, 'Page was not found.');
  }
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', config.publicOrigin);
    try {
      if (url.pathname.startsWith('/api/')) await apiRoute(req, res, url);
      else await serveStatic(req, res, url);
    } catch (error) {
      console.error(error);
      if (!res.headersSent) {
        sendError(res, error.statusCode || 500, error.statusCode ? error.message : 'The server could not complete this request.');
      } else res.end();
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createServer();
  server.listen(config.port, config.host, () => {
    console.log(`Roadmap beta is running at ${config.publicOrigin}`);
    if (!config.isProduction) console.log(`Local invite code: ${config.betaInviteCode}`);
  });
}
