import 'server-only';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Sliding-window rate limits keyed by any identifier (docs/system-design.md
// §13), e.g. `evt:<eventId>:register:ip:<ip>` or `...:email:<hash>`.
// Upstash when configured; otherwise an in-memory window per instance
// (development, or a Redis outage after Turnstile has already passed).

export type Limit = { key: string; max: number; windowSeconds: number };

const limiters = new Map<string, Ratelimit>();
const memory = new Map<string, number[]>();

function upstash(max: number, windowSeconds: number): Ratelimit | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  const id = `${max}:${windowSeconds}`;
  let limiter = limiters.get(id);
  if (!limiter) {
    limiter = new Ratelimit({
      redis: new Redis({ url, token }),
      limiter: Ratelimit.slidingWindow(max, `${windowSeconds} s`),
      prefix: 'mash:rl',
    });
    limiters.set(id, limiter);
  }
  return limiter;
}

function inMemory({ key, max, windowSeconds }: Limit): boolean {
  const now = Date.now();
  const since = now - windowSeconds * 1000;
  const hits = (memory.get(key) ?? []).filter((t) => t > since);
  if (hits.length >= max) {
    memory.set(key, hits);
    return false;
  }
  hits.push(now);
  memory.set(key, hits);
  if (memory.size > 10_000) memory.clear();
  return true;
}

/** True when every limit allows the request. */
export async function allow(limits: Limit[]): Promise<boolean> {
  for (const limit of limits) {
    const limiter = upstash(limit.max, limit.windowSeconds);
    if (limiter) {
      try {
        const { success } = await limiter.limit(limit.key);
        if (!success) return false;
        continue;
      } catch {
        // Redis down: fall back to the instance-local window.
      }
    }
    if (!inMemory(limit)) return false;
  }
  return true;
}

// Client IP resolution lives in client-ip.ts (a pure module the tests can
// import); re-exported here for the existing call sites.
export { clientIp } from './client-ip.ts';

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value)
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
