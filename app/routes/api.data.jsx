/**
 * api.data.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * App-Proxy endpoint consumed by the storefront Theme Extension (instafeed-front.js).
 *
 * Response shape: { config: object|null, instaData: object|null }
 *
 * Performance notes
 * ─────────────────
 * • Config AND Instagram data are served from cache on every hit.
 * • If cache is cold the live data is fetched, stored, and returned.
 * • Instagram fetch uses stale-while-revalidate so the browser always gets
 *   a fast response even when the cache is refreshing in the background.
 * • Shopify API call costs are tracked via rateLimiter so we never exceed
 *   the bucket limit.
 */

import { authenticate } from "../shopify.server.js";
import { fetchInstagramFeed, fetchShopConfig } from "../instagramApi.server.js";
import { trackApiResponse, withRateLimit } from "../rateLimiter.server.js";

export const loader = async ({ request }) => {
  // ── 1. Authenticate as app-proxy ─────────────────────────────────────────
  const { admin, session } = await authenticate.public.appProxy(request);

  if (!session) {
    return Response.json(
      { error: "Unauthorized: App Proxy session missing." },
      { status: 401 }
    );
  }

  const shop = session.shop;

  try {
    // ── 2. Fetch config (cached, 30 min) ────────────────────────────────────
    // `fetchShopConfig` checks cache first and only calls Shopify Admin GraphQL
    // on a cache miss.  We wrap in withRateLimit to respect bucket limits.
    const config = await withRateLimit(shop, () => fetchShopConfig(admin, shop));

    // Track the Shopify API response headers for rate-limit accounting.
    // (GraphQL via `admin.graphql` handles this internally but we log anyway.)
    trackApiResponse(shop, {});

    // ── 3. Return early if no config exists ──────────────────────────────────
    if (!config || !config.instagramHandle) {
      return Response.json({ config: null, instaData: null }, { status: 200 });
    }

    // ── 4. Fetch Instagram data (stale-while-revalidate, 5 min) ─────────────
    let instaData = null;
    if (process.env.FACEBOOK_ACCESS_TOKEN) {
      try {
        instaData = await fetchInstagramFeed(config.instagramHandle, shop);
      } catch (igErr) {
        // Non-fatal: serve config alone, storefront falls back to placeholders
        console.warn("[api.data] Instagram fetch failed (non-fatal):", igErr.message);
      }
    }

    // ── 5. Return response ───────────────────────────────────────────────────
    return Response.json({ config, instaData }, { status: 200 });

  } catch (error) {
    console.error("[api.data] Fatal error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
};
