/**
 * backgroundSync.server.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Lightweight background job queue for heavy Shopify data sync tasks.
 *
 * Why this exists
 * ───────────────
 * Some operations (bulk product/order sync, cache warm-up after a webhook)
 * are too slow to run in-band with an HTTP request.  This module provides
 * a per-process FIFO job queue so those jobs can run in the background while
 * the HTTP response is returned immediately.
 *
 * Guarantees
 * ──────────
 * • Jobs execute ONE AT A TIME per queue (no concurrency issues).
 * • Failed jobs are retried up to MAX_RETRIES times with exponential back-off.
 * • Duplicate jobs (same jobId enqueued twice) are deduplicated automatically.
 * • The queue does NOT persist across server restarts — on restart the cache
 *   warm-up runs lazily on first request instead.
 *
 * Usage
 * ─────
 *   import { enqueueJob } from "./backgroundSync.server.js";
 *
 *   // Fire-and-forget — response goes out immediately
 *   enqueueJob({
 *     id:    `sync:products:${shop}`,  // deduplicated by id
 *     shop,
 *     type:  "syncProducts",
 *     data:  { admin, shop, limit: 100 },
 *   });
 */

import { fetchShopifyProducts, fetchShopifyOrders, fetchShopifyCustomers } from "./instagramApi.server.js";
import { getCache, CACHE_TTL, invalidateResource } from "./cache.server.js";

// ── Config ────────────────────────────────────────────────────────────────────
const MAX_RETRIES   = 3;
const BASE_DELAY_MS = 2000; // 2 s base for exponential back-off

// ── Queue state ───────────────────────────────────────────────────────────────
/** @type {Map<string, { id: string, shop: string, type: string, data: any, attempts: number }>} */
const pendingJobs = new Map(); // keyed by id for deduplication

let isRunning = false;

// ── Job handlers ──────────────────────────────────────────────────────────────
/**
 * Map of job type → async handler function.
 * Add new job types here without touching the queue logic.
 */
const JOB_HANDLERS = {
  /**
   * Refresh Shopify products cache for a given shop.
   * Requires `data.admin` and `data.shop`.
   */
  syncProducts: async ({ admin, shop, limit = 50 }) => {
    await invalidateResource(shop, "products");
    const products = await fetchShopifyProducts(admin, shop, limit);
    console.info(`[BgSync] syncProducts: refreshed ${products.length} products for ${shop}`);
  },

  /**
   * Refresh Shopify orders cache.
   */
  syncOrders: async ({ admin, shop, limit = 50 }) => {
    await invalidateResource(shop, "orders");
    const orders = await fetchShopifyOrders(admin, shop, limit);
    console.info(`[BgSync] syncOrders: refreshed ${orders.length} orders for ${shop}`);
  },

  /**
   * Refresh Shopify customers cache.
   */
  syncCustomers: async ({ admin, shop, limit = 50 }) => {
    await invalidateResource(shop, "customers");
    const customers = await fetchShopifyCustomers(admin, shop, limit);
    console.info(`[BgSync] syncCustomers: refreshed ${customers.length} customers for ${shop}`);
  },

  /**
   * Warm the cache for all major resources of a shop.
   * Good to call after app install or app/uninstalled webhook.
   */
  warmAll: async ({ admin, shop }) => {
    await invalidateResource(shop, "products");
    await invalidateResource(shop, "orders");
    await invalidateResource(shop, "customers");
    await fetchShopifyProducts(admin, shop);
    await fetchShopifyOrders(admin, shop);
    await fetchShopifyCustomers(admin, shop);
    console.info(`[BgSync] warmAll: cache warmed for ${shop}`);
  },

  /**
   * Invalidate only a specific resource after a webhook event.
   * Expects `data.resource` (e.g. "products") and `data.shop`.
   */
  invalidateCache: async ({ shop, resource }) => {
    await invalidateResource(shop, resource);
    console.info(`[BgSync] invalidateCache: invalidated ${resource} for ${shop}`);
  },
};

// ── Queue runner ──────────────────────────────────────────────────────────────
async function runQueue() {
  if (isRunning) return;
  isRunning = true;

  while (pendingJobs.size > 0) {
    // Grab the first pending job
    const [jobId, job] = pendingJobs.entries().next().value;

    const handler = JOB_HANDLERS[job.type];
    if (!handler) {
      console.warn(`[BgSync] Unknown job type "${job.type}" – skipping`);
      pendingJobs.delete(jobId);
      continue;
    }

    try {
      await handler(job.data);
      pendingJobs.delete(jobId);
    } catch (err) {
      job.attempts = (job.attempts || 0) + 1;
      if (job.attempts >= MAX_RETRIES) {
        console.error(`[BgSync] Job "${jobId}" failed after ${MAX_RETRIES} attempts:`, err.message);
        pendingJobs.delete(jobId);
      } else {
        // Exponential back-off: 2s, 4s, 8s …
        const delay = BASE_DELAY_MS * Math.pow(2, job.attempts - 1);
        console.warn(`[BgSync] Job "${jobId}" attempt ${job.attempts} failed – retrying in ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  isRunning = false;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Enqueue a background sync job.
 * If a job with the same `id` is already in the queue, it is not added again.
 *
 * @param {{
 *   id:    string,   – unique job identifier (used for deduplication)
 *   shop:  string,   – mystore.myshopify.com
 *   type:  keyof JOB_HANDLERS,
 *   data:  object    – payload passed to the handler
 * }} job
 */
export function enqueueJob(job) {
  if (!job.id || !job.type) {
    console.warn("[BgSync] enqueueJob called with missing id or type – ignoring");
    return;
  }

  if (pendingJobs.has(job.id)) {
    console.debug(`[BgSync] Job "${job.id}" already queued – skipping duplicate`);
    return;
  }

  pendingJobs.set(job.id, { ...job, attempts: 0 });
  console.debug(`[BgSync] Enqueued job "${job.id}" (queue size: ${pendingJobs.size})`);

  // Start the runner without awaiting it (fire-and-forget)
  setImmediate(() => runQueue().catch(console.error));
}

/**
 * How many jobs are currently waiting to run.
 * @returns {number}
 */
export function queueSize() {
  return pendingJobs.size;
}

/**
 * Check whether a job id is already queued (for UI status indicators).
 * @param {string} id
 * @returns {boolean}
 */
export function isJobQueued(id) {
  return pendingJobs.has(id);
}
