import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const DEFAULT_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_MAX_REQUESTS = 5;

/* ------------------------------------------------------------------ */
/*  Upstash Redis rate limiter (shared across serverless instances)    */
/*  Falls back to in-memory Map if UPSTASH env vars are not set.      */
/* ------------------------------------------------------------------ */

const useRedis = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
);

// In serverless production, the in-memory fallback is per-instance and
// provides effectively no cross-instance rate limiting. Make that loud.
if (!useRedis && process.env.NODE_ENV === 'production') {
  console.error(
    'SECURITY: Upstash Redis is not configured in production. ' +
      'Rate limiting is falling back to per-instance memory and will not ' +
      'protect against distributed abuse. Set UPSTASH_REDIS_REST_URL and ' +
      'UPSTASH_REDIS_REST_TOKEN.'
  );
}

let redis;
if (useRedis) {
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

// Cache of Ratelimit instances keyed by "windowMs:maxRequests"
const ratelimiters = new Map();

function getUpstashLimiter(windowMs, maxRequests) {
  const cacheKey = `${windowMs}:${maxRequests}`;
  if (ratelimiters.has(cacheKey)) {
    return ratelimiters.get(cacheKey);
  }

  const windowSec = Math.max(1, Math.ceil(windowMs / 1000));
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(maxRequests, `${windowSec} s`),
    analytics: false,
    prefix: 'mash-rl',
  });
  ratelimiters.set(cacheKey, limiter);
  return limiter;
}

/* ------------------------------------------------------------------ */
/*  In-memory fallback (used when Redis is unavailable)               */
/* ------------------------------------------------------------------ */

const rateLimitStore = new Map();

function cleanupExpiredEntries(now) {
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function getClientIp(request) {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  return (
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') ||
    'unknown'
  );
}

function getAllowedOrigins(request) {
  const requestOrigin = request.nextUrl?.origin;
  const configuredOrigins = [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.SITE_URL,
    'https://mash.example',
    'https://www.mash.example',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ].filter(Boolean);

  return new Set([requestOrigin, ...configuredOrigins].filter(Boolean));
}

function isAllowedOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) {
    return true;
  }

  return getAllowedOrigins(request).has(origin);
}

function buildRateLimitHeaders(limit, remaining, resetAt) {
  return {
    'X-RateLimit-Limit': String(limit),
    'X-RateLimit-Remaining': String(Math.max(0, remaining)),
    'X-RateLimit-Reset': String(Math.ceil(resetAt / 1000)),
  };
}

async function rateLimit(
  request,
  routeKey,
  { windowMs = DEFAULT_WINDOW_MS, maxRequests = DEFAULT_MAX_REQUESTS } = {}
) {
  const ip = getClientIp(request);
  const identifier = `${routeKey}:${ip}`;

  /* ---------- Upstash Redis path ---------- */
  if (useRedis) {
    try {
      const limiter = getUpstashLimiter(windowMs, maxRequests);
      const result = await limiter.limit(identifier);

      const headers = buildRateLimitHeaders(
        result.limit,
        result.remaining,
        result.reset
      );

      if (!result.success) {
        const retryAfter = Math.max(
          1,
          Math.ceil((result.reset - Date.now()) / 1000)
        );
        return {
          ok: false,
          response: Response.json(
            { error: 'Too many requests. Please try again later.' },
            {
              status: 429,
              headers: { ...headers, 'Retry-After': String(retryAfter) },
            }
          ),
        };
      }

      return { ok: true, headers };
    } catch (redisError) {
      // Fall through to in-memory if Redis is unreachable
      console.error(
        'Rate limiter: Upstash Redis unreachable, using in-memory fallback.',
        redisError
      );
    }
  }

  /* ---------- In-memory fallback ---------- */
  const now = Date.now();
  cleanupExpiredEntries(now);

  const fallbackKey = identifier;
  const existing = rateLimitStore.get(fallbackKey);

  if (!existing || existing.resetAt <= now) {
    const freshEntry = {
      count: 1,
      resetAt: now + windowMs,
    };
    rateLimitStore.set(fallbackKey, freshEntry);

    return {
      ok: true,
      headers: buildRateLimitHeaders(
        maxRequests,
        maxRequests - 1,
        freshEntry.resetAt
      ),
    };
  }

  existing.count += 1;

  if (existing.count > maxRequests) {
    return {
      ok: false,
      response: Response.json(
        { error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: {
            ...buildRateLimitHeaders(maxRequests, 0, existing.resetAt),
            'Retry-After': String(
              Math.max(1, Math.ceil((existing.resetAt - now) / 1000))
            ),
          },
        }
      ),
    };
  }

  return {
    ok: true,
    headers: buildRateLimitHeaders(
      maxRequests,
      maxRequests - existing.count,
      existing.resetAt
    ),
  };
}

export function rejectDisallowedOrigin(request) {
  if (isAllowedOrigin(request)) {
    return null;
  }

  return Response.json(
    { error: 'Requests from this origin are not allowed.' },
    { status: 403 }
  );
}

export async function protectPublicRoute(request, routeKey, options) {
  const originResponse = rejectDisallowedOrigin(request);
  if (originResponse) {
    return { ok: false, response: originResponse };
  }

  return rateLimit(request, routeKey, options);
}

export function enforceJsonRequest(request) {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return null;
  }

  return Response.json(
    { error: 'Content-Type must be application/json.' },
    { status: 415 }
  );
}

export function enforceMultipartRequest(request) {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.toLowerCase().includes('multipart/form-data')) {
    return null;
  }

  return Response.json(
    { error: 'Content-Type must be multipart/form-data.' },
    { status: 415 }
  );
}

export async function protectPublicPostRoute(request, routeKey, options) {
  const protection = await protectPublicRoute(request, routeKey, options);
  if (!protection.ok) {
    return protection;
  }

  const contentTypeResponse = enforceJsonRequest(request);
  if (contentTypeResponse) {
    return { ok: false, response: contentTypeResponse };
  }

  return protection;
}

export async function protectPublicMultipartPostRoute(
  request,
  routeKey,
  options
) {
  const protection = await protectPublicRoute(request, routeKey, options);
  if (!protection.ok) {
    return protection;
  }

  const contentTypeResponse = enforceMultipartRequest(request);
  if (contentTypeResponse) {
    return { ok: false, response: contentTypeResponse };
  }

  return protection;
}
