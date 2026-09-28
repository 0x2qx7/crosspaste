import rateLimit from 'express-rate-limit';
import { config } from '../config.js';

function rateLimitResponse(_req, res) {
  res.status(429).json({
    error: { code: 'RATE_LIMITED', message: 'Слишком много запросов. Подождите немного и повторите попытку.' },
  });
}

export const writeRateLimiter = config.writeRateLimitMax === 0 ? (_req, _res, next) => next() : rateLimit({
  windowMs: config.writeRateLimitWindowMs,
  max: config.writeRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitResponse,
});

export const uploadRateLimiter = config.uploadRateLimitMax === 0 ? (_req, _res, next) => next() : rateLimit({
  windowMs: config.uploadRateLimitWindowMs,
  max: config.uploadRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitResponse,
});
