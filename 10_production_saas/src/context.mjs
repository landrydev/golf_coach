import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JsonStore } from './store.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  publicDir: path.resolve(__dirname, '../public'),
  port: Number.parseInt(process.env.PORT || '4175', 10),
  host: process.env.HOST || '127.0.0.1',
  dataFile: process.env.DATA_FILE || path.resolve(__dirname, '../data/store.json'),
  sessionHours: Math.min(Math.max(Number(process.env.SESSION_HOURS || 168), 1), 24 * 30),
  cookieSecure: String(process.env.COOKIE_SECURE || 'false').toLowerCase() === 'true',
  isProduction: process.env.NODE_ENV === 'production',
};

config.publicOrigin = (process.env.PUBLIC_ORIGIN || `http://${config.host}:${config.port}`).replace(/\/$/, '');
config.appSecret = process.env.APP_SECRET || (config.isProduction ? '' : 'local-development-secret-change-before-sharing');
config.betaInviteCode = process.env.BETA_INVITE_CODE || (config.isProduction ? '' : 'roadmap-local-beta');

if (!config.appSecret || config.appSecret.length < 32) {
  throw new Error('APP_SECRET must contain at least 32 characters.');
}
if (!config.betaInviteCode || config.betaInviteCode.length < 8) {
  throw new Error('BETA_INVITE_CODE must contain at least 8 characters.');
}

export const store = await new JsonStore(config.dataFile).init();
export const responseRate = new Map();
