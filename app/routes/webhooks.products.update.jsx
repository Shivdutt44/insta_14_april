/**
 * webhooks.products.update.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Shopify webhook: products/update
 *
 * Triggered when a product's title, description, images, price, status, etc.
 * changes.  We invalidate the product cache so the next API request returns
 * fresh data, rather than serving a stale cached version.
 */

import { authenticate } from "../shopify.server.js";
import db from "../db.server.js";
import { invalidateResource } from "../cache.server.js";
import { enqueueJob } from "../backgroundSync.server.js";

export const action = async ({ request }) => {
  // ── 1. HMAC + payload ────────────────────────────────────────────────────
  const { topic, shop, payload, webhookId } = await authenticate.webhook(request);

  console.info(`[Webhook] ${topic} received for ${shop} (id: ${webhookId})`);

  // ── 2. Deduplication ─────────────────────────────────────────────────────
  if (webhookId) {
    const existing = await db.webhookEvent.findUnique({ where: { webhookId } });
    if (existing) {
      console.info(`[Webhook] Duplicate ${topic} (id: ${webhookId}) – skipping`);
      return new Response(null, { status: 200 });
    }
    await db.webhookEvent.create({
      data: { webhookId, topic, shop, processedAt: new Date() },
    });
  }

  // ── 3. Targeted cache invalidation ───────────────────────────────────────
  // Only invalidate products—don't blow away orders/customers unnecessarily.
  await invalidateResource(shop, "products");

  enqueueJob({
    id:   `invalidate:products:${shop}:update`,
    shop,
    type: "invalidateCache",
    data: { shop, resource: "products" },
  });

  console.info(`[Webhook] products/update → cache invalidated for ${shop}. Product ID: ${payload?.id}`);
  return new Response(null, { status: 200 });
};
