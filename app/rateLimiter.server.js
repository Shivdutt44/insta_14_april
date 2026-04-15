/**
 * rateLimiter.server.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Smart Shopify API rate-limit handler.
 *
 * Shopify uses a leaky-bucket model:
 *   • REST calls  → X-Shopify-Shop-Api-Call-Limit: used/max
 *   • GraphQL     → X-Shopify-Shop-Api-Cost header (query cost points)
 *
 * This module:
 *   1. Tracks per-shop bucket levels.
 *   2. Automatically delays outgoing requests when the bucket is >80% full.
 *   3. Exposes a `withRateLimit(shop, fn)` wrapper that queues calls when
 *      throttled, so no request is ever dropped.
 *   4. Parses GraphQL/REST response headers and updates bucket state.
 */

// ── Per-shop state ─────────────────────────────────────────────────────────────
// shape: { used: number, max: number, updatedAt: number }
const buckets = new Map();

// Per-shop FIFO queues to serialise requests when throttling is active
const queues = new Map();

// ── Constants ─────────────────────────────────────────────────────────────────
const THROTTLE_THRESHOLD  = 0.80; // pause when bucket ≥ 80% full
const THROTTLE_DELAY_MS   = 1000; // base delay between throttled calls (ms)
const LEAK_RATE_PER_SEC   = 2;    // Shopify leaks 2 calls/sec (REST bucket)
const MIN_REMAINING_COST  = 200;  // GraphQL: pause if remaining cost < 200 pts

// ── Helpers ───────────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Parse a REST `X-Shopify-Shop-Api-Call-Limit` header into { used, max }.
 * Returns null if the header is absent or malformed.
 * @param {Headers|Record<string,string>} headers
 * @returns {{ used: number, max: number } | null}
 */
export function parseRestBucket(headers) {
  const raw =
    (typeof headers.get === "function"
      ? headers.get("x-shopify-shop-api-call-limit")
      : headers["x-shopify-shop-api-call-limit"]) ?? null;

  if (!raw) return null;
  const [used, max] = raw.split("/").map(Number);
  if (isNaN(used) || isNaN(max)) return null;
  return { used, max };
}

/**
 * Parse a GraphQL cost extension object.
 * @param {{ requestedQueryCost?: number, actualQueryCost?: number,
 *           throttleStatus?: { maximumAvailable: number, currentlyAvailable: number } }} cost
 * @returns {{ used: number, max: number } | null}
 */
export function parseGraphQLCost(cost) {
  if (!cost?.throttleStatus) return null;
  const { maximumAvailable, currentlyAvailable } = cost.throttleStatus;
  return {
    used: maximumAvailable - currentlyAvailable,
    max:  maximumAvailable,
  };
}

/**
 * Update the bucket state for a given shop.
 * @param {string} shop
 * @param {{ used: number, max: number }} bucket
 */
export function updateBucket(shop, bucket) {
  buckets.set(shop, { ...bucket, updatedAt: Date.now() });
}

/**
 * Get estimated current fill level (accounts for leakage since last update).
 * @param {string} shop
 * @returns {{ used: number, max: number, ratio: number } | null}
 */
export function getBucket(shop) {
  const b = buckets.get(shop);
  if (!b) return null;

  const elapsedSec = (Date.now() - b.updatedAt) / 1000;
  const leaked     = elapsedSec * LEAK_RATE_PER_SEC;
  const used       = Math.max(0, b.used - leaked);

  return { used, max: b.max, ratio: used / b.max };
}

/**
 * How many milliseconds to wait before the next call is safe.
 * Returns 0 if no throttling is needed.
 * @param {string} shop
 * @returns {number}
 */
export function getThrottleDelayMs(shop) {
  const bucket = getBucket(shop);
  if (!bucket) return 0;
  if (bucket.ratio < THROTTLE_THRESHOLD) return 0;

  // Calculate how many calls need to leak before we're safely below threshold
  const targetUsed  = bucket.max * (THROTTLE_THRESHOLD - 0.1);
  const callsToLeak = bucket.used - targetUsed;
  const waitSec     = callsToLeak / LEAK_RATE_PER_SEC;

  return Math.ceil(waitSec * 1000) + THROTTLE_DELAY_MS;
}

// ── Per-shop queues ────────────────────────────────────────────────────────────
function getQueue(shop) {
  if (!queues.has(shop)) {
    queues.set(shop, { running: false, tasks: [] });
  }
  return queues.get(shop);
}

async function drainQueue(shop) {
  const q = getQueue(shop);
  if (q.running) return; // already draining
  q.running = true;

  while (q.tasks.length > 0) {
    const delay = getThrottleDelayMs(shop);
    if (delay > 0) {
      console.info(`[RateLimit] Shop ${shop} throttled – waiting ${delay}ms`);
      await sleep(delay);
    }

    const { task, resolve, reject } = q.tasks.shift();
    try {
      const result = await task();
      resolve(result);
    } catch (err) {
      reject(err);
    }
  }
  q.running = false;
}

/**
 * Wrap any async function `fn` with automatic rate-limit queueing.
 *
 * Usage:
 *   const data = await withRateLimit(shop, () => admin.graphql(...));
 *
 * @param {string}           shop  – mystore.myshopify.com
 * @param {() => Promise<T>} fn    – the actual Shopify API call
 * @returns {Promise<T>}
 */
export function withRateLimit(shop, fn) {
  return new Promise((resolve, reject) => {
    const q = getQueue(shop);
    q.tasks.push({ task: fn, resolve, reject });
    drainQueue(shop).catch(reject);
  });
}

/**
 * Middleware-style helper: call this after every Shopify API response to
 * keep bucket state fresh.
 *
 * @param {string}               shop
 * @param {Headers|object}       headers  – raw response headers
 * @param {object|null}          gqlCost  – GraphQL extensions.cost object
 */
export function trackApiResponse(shop, headers, gqlCost = null) {
  // Try GraphQL cost first (more precise)
  const b = gqlCost
    ? parseGraphQLCost(gqlCost)
    : parseRestBucket(headers);

  if (b) updateBucket(shop, b);
}

/**
 * Log current bucket state for a shop (useful for debugging).
 * @param {string} shop
 */
export function logBucket(shop) {
  const b = getBucket(shop);
  if (!b) {
    console.debug(`[RateLimit] No bucket state for ${shop}`);
    return;
  }
  console.debug(
    `[RateLimit] ${shop}: ${b.used.toFixed(1)}/${b.max} (${(b.ratio * 100).toFixed(0)}%)`
  );
}
