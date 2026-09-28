import helmet from 'helmet';
import crypto from 'node:crypto';
import { config } from '../config.js';

export const securityHeaders = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'none'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: null,
    },
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'no-referrer' },
  frameguard: { action: 'deny' },
  hsts: false,
});

export function permissionsPolicy(_req, res, next) {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=(), clipboard-read=(self), clipboard-write=(self)');
  next();
}

export function noCacheForMutableData(_req, res, next) {
  res.setHeader('Cache-Control', 'no-store, must-revalidate');
  next();
}

const ACCESS_COOKIE_NAME = 'crosspaste_access';

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

/**
 * Optional shared-token gate. Disabled entirely when OPTIONAL_ACCESS_TOKEN is unset,
 * so the default LAN/VPN workflow never sees a login prompt.
 */
export function accessTokenGate(req, res, next) {
  if (!config.accessTokenEnabled) return next();

  const isApiRequest = req.path.startsWith('/api/');
  const allowedWithoutAuth =
    req.path === '/api/health' ||
    req.path === '/api/access/verify' ||
    req.path === '/access.html' ||
    req.path === '/robots.txt' ||
    req.path === '/favicon.svg' ||
    req.path.startsWith('/styles/') ||
    req.path.startsWith('/scripts/');

  if (allowedWithoutAuth) return next();

  const cookieToken = req.cookies?.[ACCESS_COOKIE_NAME];
  const authHeader = req.headers['authorization'];
  const bearerToken = typeof authHeader === 'string' && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const headerToken = bearerToken || (typeof req.headers['x-access-token'] === 'string' ? req.headers['x-access-token'].trim() : null);
  const token = cookieToken || headerToken;

  if (token && timingSafeEqual(token, config.optionalAccessToken)) {
    return next();
  }

  if (isApiRequest) {
    return res.status(401).json({ error: { code: 'ACCESS_TOKEN_REQUIRED', message: 'Требуется ключ доступа.' } });
  }

  return res.redirect('/access.html');
}

export function verifyAccessToken(req, res) {
  const submitted = typeof req.body?.token === 'string' ? req.body.token : '';
  if (!submitted || !timingSafeEqual(submitted, config.optionalAccessToken)) {
    return res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'Неверный ключ доступа.' } });
  }

  res.cookie(ACCESS_COOKIE_NAME, submitted, {
    httpOnly: true,
    secure: req.secure,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 30,
  });
  return res.json({ ok: true });
}
