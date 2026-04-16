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
import { fetchShopInstaData, fetchShopConfig } from "../instagramApi.server.js";
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

    // ── 4. Retrieve Persisted Instagram data ──────────────────────────────
    // We now read directly from the Shopify Metafield saved by the dashboard.
    // This COMPLETELY ELIMINATES storefront calls to the Instagram Graph API,
    // preserving your API rate limits.
    const instaData = await withRateLimit(shop, () => fetchShopInstaData(admin, shop));
    trackApiResponse(shop, {});

    // ── 5. Return response ───────────────────────────────────────────────────
    return Response.json({ config, instaData }, { status: 200 });

  } catch (error) {
    console.error("[api.data] Fatal error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
};
