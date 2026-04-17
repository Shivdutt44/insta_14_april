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
import { fetchShopInstaData, fetchShopConfig, checkProPlan } from "../instagramApi.server.js";
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
    // ── 2. Get Subscription Status ───────────────────────────────────────────
    const isPro = await checkProPlan(admin, shop);

    // ── 3. Fetch config (cached, 30 min) ────────────────────────────────────
    let config = await withRateLimit(shop, () => fetchShopConfig(admin, shop));
    trackApiResponse(shop, {});

    // ── 4. Fallback to default if no config exists ───────────────────────────
    if (!config) {
      config = {
        instagramHandle: "",
        postFeed: {
          header: true,
          metrics: true,
          load: false,
          carousel: true,
          autoplay: true,
          heading: "SHOP OUR INSTAGRAM",
          subheading: "Tag us @account to get featured in our gallery!",
          typography: {
            heading: { size: 18, weight: "800", color: "#0f172a" },
            subheading: { size: 12, weight: "500", color: "#64748b" },
          },
          alignment: "left",
          desktopColumns: 4,
          mobileColumns: 2,
          desktopLimit: 8,
          mobileLimit: 4,
          gap: 16,
          aspectRatio: "auto",
          removeWatermark: false,
          showInstagramIcon: true,
          hiddenPostIds: [],
        },
        stories: {
          enable: true,
          carousel: true,
          autoplay: true,
          alignment: "center",
          showHeader: true,
          heading: "SHOP OUR INSTAGRAM",
          subheading: "Tag us @account to get featured in our gallery!",
          typography: {
            heading: { size: 28, weight: "800", color: "#000" },
            subheading: { size: 14, weight: "400", color: "#666" },
          },
          animateImages: false,
          activeRing: true,
          ringColor: "#6366f1",
          showNavigation: true,
        },
      };
    }

    // ── 5. Enforce Restrictions for Starter Plan ─────────────────────────────
    if (!isPro) {
      if (config.postFeed) {
        config.postFeed.removeWatermark = false; // Force watermark
        config.postFeed.load = false;           // Force no infinite scroll
        if (config.postFeed.desktopColumns > 4) config.postFeed.desktopColumns = 4;
        if (config.postFeed.desktopLimit > 12)  config.postFeed.desktopLimit = 12;
      }
    }

    // ── 6. Retrieve Persisted Instagram data ──────────────────────────────
    const instaData = await withRateLimit(shop, () => fetchShopInstaData(admin, shop));
    trackApiResponse(shop, {});

    // ── 7. Return response ───────────────────────────────────────────────────
    return Response.json({ config, instaData }, { status: 200 });

  } catch (error) {
    console.error("[api.data] Fatal error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
};
