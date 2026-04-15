/**
 * webhooks.products.create.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Shopify webhook: products/create
 *
 * When a new product is created in the merchant's store:
 *   1. Verify the request via Shopify HMAC (handled by authenticate.webhook).
 *   2. Deduplicate: skip if this webhook ID was already processed.
 *   3. Invalidate the cached products list for this shop.
 *   4. Enqueue a background job to re-warm the products cache.
 */

import { authenticate } from "../shopify.server.js";
import db from "../db.server.js";
import { invalidateResource } from "../cache.server.js";
import { enqueueJob } from "../backgroundSync.server.js";

export const action = async ({ request }) => {
  // ── 1. HMAC verification + payload extraction ─────────────────────────────
  // authenticate.webhook throws if HMAC is invalid → Shopify automatically
  // retries with a 5xx if we throw, so we purposely let bad requests fail.
  const { topic, shop, payload, webhookId } = await authenticate.webhook(request);

  console.info(`[Webhook] ${topic} received for ${shop} (id: ${webhookId})`);

  // ── 2. Deduplication via DB ───────────────────────────────────────────────
  // Shopify occasionally delivers the same webhook more than once.
  // We store processed webhook IDs in the WebhookEvent table and skip
  // if we've already seen this ID.
  if (webhookId) {
    const existing = await db.webhookEvent.findUnique({ where: { webhookId } });
    if (existing) {
      console.info(`[Webhook] Duplicate ${topic} (id: ${webhookId}) – skipping`);
      return new Response(null, { status: 200 });
    }
    // Record as processed
    await db.webhookEvent.create({
      data: { webhookId, topic, shop, processedAt: new Date() },
    });
  }

  // ── 3. Invalidate product cache for this shop ─────────────────────────────
  await invalidateResource(shop, "products");

  // ── 4. Background re-warm (fire-and-forget) ───────────────────────────────
  // We can't get an admin client from a webhook (no session), so we just
  // invalidate the cache. The next legitimate admin request will re-populate it.
  enqueueJob({
    id:   `invalidate:products:${shop}`,
    shop,
    type: "invalidateCache",
    data: { shop, resource: "products" },
  });

  console.info(`[Webhook] products/create → cache invalidated for ${shop}. Product ID: ${payload?.id}`);
  return new Response(null, { status: 200 });
};
