/**
 * cache.server.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Unified caching layer for the AI-Instafeed Shopify app.
 *
 * Strategy
 * ────────
 * 1.  Tries to connect to Redis (REDIS_URL env variable) on first use.
 * 2.  Falls back to a fast in-memory LRU cache if Redis is unavailable.
 * 3.  The public API is identical in both modes so callers never need to
 *     care which backend is active.
 *
 * Public API
 * ──────────
 *   cache.get(key)            → value | null
 *   cache.set(key, value, ttlSeconds)
 *   cache.del(key)
 *   cache.delPattern(prefix)  → deletes all keys starting with prefix
 *   cache.flush()             → wipes everything
 *
 * Cache-key conventions used across this app
 * ───────────────────────────────────────────
 *   ig:<shop>:<handle>           Instagram feed data   TTL 5 min
 *   shopify:config:<shop>        Saved metafield config TTL 30 min
 *   shopify:products:<shop>      Bulk products         TTL 10 min
 *   shopify:orders:<shop>        Bulk orders           TTL 10 min
 *   shopify:customers:<shop>     Bulk customers        TTL 10 min
 */

// ── Constants ─────────────────────────────────────────────────────────────────
const DEFAULT_TTL = 300; // 5 minutes
const MAX_MEMORY_ENTRIES = 500; // LRU limit for in-memory fallback

// ══════════════════════════════════════════════════════════════════════════════
// IN-MEMORY LRU CACHE (always available as fallback)
// ══════════════════════════════════════════════════════════════════════════════
class MemoryCache {
  constructor(maxEntries = MAX_MEMORY_ENTRIES) {
    /** @type {Map<string, { value: any, expiresAt: number }>} */
    this._store = new Map();
    this._max = maxEntries;
  }

  // ── Internal helpers ──────────────────────────────────────────────────────
  _isExpired(entry) {
    return Date.now() > entry.expiresAt;
  }

  /** Evict the oldest (first-inserted) entry to stay within maxEntries. */
  _evictIfFull() {
    if (this._store.size >= this._max) {
      const oldestKey = this._store.keys().next().value;
      this._store.delete(oldestKey);
    }
  }

  /** Remove all expired entries (called lazily on get/set). */
  _purgeExpired() {
    for (const [key, entry] of this._store) {
      if (this._isExpired(entry)) this._store.delete(key);
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────
  get(key) {
    const entry = this._store.get(key);
    if (!entry) return null;
    if (this._isExpired(entry)) {
      this._store.delete(key);
      return null;
    }
    // Move to end (LRU behaviour)
    this._store.delete(key);
    this._store.set(key, entry);
    return entry.value;
  }

  set(key, value, ttl = DEFAULT_TTL) {
    this._purgeExpired();
    this._evictIfFull();
    this._store.set(key, {
      value,
      expiresAt: Date.now() + ttl * 1000,
    });
  }

  del(key) {
    this._store.delete(key);
  }

  /** Delete all keys whose name starts with `prefix`. */
  delPattern(prefix) {
    for (const key of this._store.keys()) {
      if (key.startsWith(prefix)) this._store.delete(key);
    }
  }

  flush() {
    this._store.clear();
  }

  get size() {
    return this._store.size;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// REDIS ADAPTER (optional – loaded only when REDIS_URL is set)
// ══════════════════════════════════════════════════════════════════════════════
class RedisCache {
  constructor(client) {
    this._client = client;
  }

  async get(key) {
    try {
      const raw = await this._client.get(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  async set(key, value, ttl = DEFAULT_TTL) {
    try {
      await this._client.set(key, JSON.stringify(value), { EX: ttl });
    } catch {
      // Silently fail – fallback to in-memory would be ideal but we keep it
      // simple: the next request will re-fetch from API.
    }
  }

  async del(key) {
    try {
      await this._client.del(key);
    } catch { /* noop */ }
  }

  async delPattern(prefix) {
    try {
      // SCAN is non-blocking and safe for production Redis
      let cursor = 0;
      do {
        const result = await this._client.scan(cursor, {
          MATCH: `${prefix}*`,
          COUNT: 100,
        });
        cursor = result.cursor;
        if (result.keys.length > 0) {
          await this._client.del(result.keys);
        }
      } while (cursor !== 0);
    } catch { /* noop */ }
  }

  async flush() {
    try {
      await this._client.flushDb();
    } catch { /* noop */ }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SINGLETON FACTORY
// ══════════════════════════════════════════════════════════════════════════════
let _cacheInstance = null;

/**
 * Returns the singleton cache instance.
 * Tries Redis first; falls back to in-memory.
 * @returns {Promise<MemoryCache|RedisCache>}
 */
async function getCache() {
  if (_cacheInstance) return _cacheInstance;

  const redisUrl = process.env.REDIS_URL;

  if (redisUrl) {
    try {
      // Dynamic import so the app doesn't crash when `redis` is not installed
      const { createClient } = await import("redis");
      const client = createClient({ url: redisUrl });
      client.on("error", (err) => {
        console.warn("[Cache] Redis error – will fall back to in-memory:", err.message);
        _cacheInstance = new MemoryCache();
      });
      await client.connect();
      _cacheInstance = new RedisCache(client);
      console.info("[Cache] ✅ Redis connected:", redisUrl);
    } catch (err) {
      console.warn("[Cache] Redis unavailable, using in-memory cache:", err.message);
      _cacheInstance = new MemoryCache();
    }
  } else {
    _cacheInstance = new MemoryCache();
    console.info("[Cache] Using in-memory cache (set REDIS_URL to enable Redis).");
  }

  return _cacheInstance;
}

// ── Eagerly initialise during server startup (fire-and-forget) ────────────────
getCache().catch(() => {});

// ── Convenience helpers (synchronous-looking wrappers for common patterns) ────

/**
 * get-or-set: returns cached value or calls `fetcher()` to populate it.
 *
 * @param {string} key
 * @param {() => Promise<any>} fetcher   async function that returns the value
 * @param {number} ttl                   TTL in seconds
 * @returns {Promise<any>}
 */
export async function cacheGetOrSet(key, fetcher, ttl = DEFAULT_TTL) {
  const cache = await getCache();
  const cached = await cache.get(key);
  if (cached !== null) return cached;

  const fresh = await fetcher();
  if (fresh !== null && fresh !== undefined) {
    await cache.set(key, fresh, ttl);
  }
  return fresh;
}

/**
 * Stale-While-Revalidate:
 * → Returns cached data immediately (even if stale).
 * → Fires a background refresh if the key is missing or expired in background.
 *
 * @param {string} key
 * @param {() => Promise<any>} fetcher
 * @param {number} ttl                  seconds before entry is truly expired
 * @param {number} staleWindow          extra seconds where stale data is served
 */
export async function cacheStaleWhileRevalidate(key, fetcher, ttl = DEFAULT_TTL, staleWindow = 60) {
  const staleKey = `${key}:stale`;
  const cache    = await getCache();

  // Try fresh cache first
  const fresh = await cache.get(key);
  if (fresh !== null) return fresh;

  // Check stale window cache
  const stale = await cache.get(staleKey);

  // Always revalidate in background
  (async () => {
    try {
      const value = await fetcher();
      if (value !== null && value !== undefined) {
        await cache.set(key, value, ttl);
        await cache.set(staleKey, value, ttl + staleWindow);
      }
    } catch (err) {
      console.warn("[Cache] Background revalidation failed for", key, err.message);
    }
  })();

  // Return stale data if we have it (non-blocking for the user)
  return stale;
}

/**
 * Invalidate all keys for a given shop (used by webhook handlers).
 * @param {string} shop   e.g. "my-store.myshopify.com"
 */
export async function invalidateShopCache(shop) {
  const cache = await getCache();
  const prefix = `shopify:${shop}`;
  await cache.delPattern(prefix);
  console.info(`[Cache] Invalidated all keys for shop: ${shop}`);
}

/**
 * Invalidate a specific resource cache entry.
 * @param {string} shop
 * @param {"products"|"orders"|"customers"|"config"} resource
 */
export async function invalidateResource(shop, resource) {
  const cache = await getCache();
  await cache.del(`shopify:${resource}:${shop}`);
  // Also clear stale key
  await cache.del(`shopify:${resource}:${shop}:stale`);
  console.info(`[Cache] Invalidated ${resource} for shop: ${shop}`);
}

/** Raw cache access (advanced use). */
export { getCache };

export const CACHE_TTL = {
  INSTAGRAM: 300,  // 5 min  – Instagram feed
  CONFIG:    1800, // 30 min – Shop metafield config
  PRODUCTS:  600,  // 10 min – Shopify products
  ORDERS:    600,  // 10 min – Shopify orders
  CUSTOMERS: 600,  // 10 min – Shopify customers
};
