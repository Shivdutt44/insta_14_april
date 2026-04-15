/**
 * webhooks.orders.create.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Shopify webhook: orders/create
 *
 * When a new order is placed we invalidate the orders cache so the admin
 * dashboard (if it shows orders) always sees the latest data.
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

  // ── 3. Invalidate orders cache ────────────────────────────────────────────
  await invalidateResource(shop, "orders");

  enqueueJob({
    id:   `invalidate:orders:${shop}:create`,
    shop,
    type: "invalidateCache",
    data: { shop, resource: "orders" },
  });

  console.info(`[Webhook] orders/create → cache invalidated for ${shop}. Order ID: ${payload?.id}`);
  return new Response(null, { status: 200 });
};
