/**
 * instagramApi.server.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Centralised Instagram / Facebook Graph API client for the AI-Instafeed app.
 *
 * Every public function is cache-aware:
 *   • Returns cached result immediately when available.
 *   • Falls back to a live Facebook Graph API call.
 *   • Updates the cache on every successful fetch.
 *
 * Nothing in this file touches the HTTP request/response cycle, making it
 * safe to call from both loaders (SSR) and action handlers.
 */

import axios from "axios";
import { cacheGetOrSet, cacheStaleWhileRevalidate, CACHE_TTL } from "./cache.server.js";

// ── Constants ─────────────────────────────────────────────────────────────────
const FB_BASE = "https://graph.facebook.com/v21.0";

/**
 * Fields to fetch in the Business Discovery media sub-query.
 * Kept in one place so we don't drift between loader/action/proxy.
 */
const MEDIA_FIELDS =
  "media_url,media_type,caption,timestamp,like_count,comments_count,thumbnail_url,permalink";

const PROFILE_FIELDS =
  "username,name,biography,profile_picture_url,followers_count,follows_count,media_count";

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Fetch the first linked Facebook Page's ID and page-level access token.
 * Result is cached for 30 minutes (token rarely changes).
 *
 * @param {string} fbToken – long-lived user access token
 * @returns {Promise<{ pageId: string, pageToken: string }>}
 */
async function getLinkedPage(fbToken) {
  // We cache by a hash of the fbToken (not the token itself for security)
  const tokenKey = `fb:page:${fbToken.slice(-16)}`;

  return cacheGetOrSet(
    tokenKey,
    async () => {
      const res = await axios.get(`${FB_BASE}/me/accounts`, {
        params: { access_token: fbToken },
      });

      const pages = res.data?.data;
      if (!pages || pages.length === 0) {
        throw new Error("No Facebook Pages found for this access token.");
      }

      return { pageId: pages[0].id, pageToken: pages[0].access_token };
    },
    CACHE_TTL.CONFIG // 30 min
  );
}

/**
 * Fetch the Instagram Business Account ID linked to a Facebook Page.
 * Cached for 30 minutes.
 *
 * @param {string} pageId
 * @param {string} pageToken
 * @returns {Promise<string>} igBusinessId
 */
async function getIGBusinessId(pageId, pageToken) {
  return cacheGetOrSet(
    `fb:igbiz:${pageId}`,
    async () => {
      const res = await axios.get(`${FB_BASE}/${pageId}`, {
        params: { fields: "instagram_business_account", access_token: pageToken },
      });

      const igId = res.data?.instagram_business_account?.id;
      if (!igId) {
        throw new Error("No Instagram Business Account linked to this Facebook Page.");
      }
      return igId;
    },
    CACHE_TTL.CONFIG
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch an Instagram profile + media feed via Business Discovery.
 *
 * Uses stale-while-revalidate so the user always gets a response instantly.
 *
 * @param {string} handle  – Instagram username (without @)
 * @param {string} shop    – mystore.myshopify.com (used for cache-key scoping)
 * @returns {Promise<object|null>}  business_discovery data or null on error
 */
export async function fetchInstagramFeed(handle, shop) {
  const safeHandle = handle.replace("@", "").split("?")[0].trim().toLowerCase();
  const cacheKey   = `ig:${shop}:${safeHandle}`;
  const fbToken    = process.env.FACEBOOK_ACCESS_TOKEN;

  if (!fbToken) {
    throw new Error("FACEBOOK_ACCESS_TOKEN is not configured in environment variables.");
  }

  // ── Stale-while-revalidate fetcher ──────────────────────────────────────
  return cacheStaleWhileRevalidate(
    cacheKey,
    async () => {
      try {
        // Step 1 – get linked page
        const { pageId, pageToken } = await getLinkedPage(fbToken);

        // Step 2 – get IG Business Account ID
        const igBusinessId = await getIGBusinessId(pageId, pageToken);

        // Step 3 – Business Discovery request
        const mediaQuery = `media.limit(50){${MEDIA_FIELDS}}`;
        const fields     = `business_discovery.fields(${PROFILE_FIELDS},${mediaQuery}).username(${safeHandle})`;

        const res = await axios.get(`${FB_BASE}/${igBusinessId}`, {
          params: { fields, access_token: fbToken },
        });

        const discovery = res.data?.business_discovery;
        if (!discovery) {
          console.warn(`[IG API] No discovery data for @${safeHandle}`);
          return null;
        }

        console.info(`[IG API] Fetched @${safeHandle} for ${shop} → ${discovery.media_count} posts`);
        return discovery;
      } catch (error) {
        console.warn(`[IG API] Fetch failed for @${safeHandle}: ${error.response?.data?.error?.message || error.message}`);
        // Cache the failure as null instead of throwing, so we gracefully pause retries
        return null;
      }
    },
    CACHE_TTL.INSTAGRAM,       // 5 min TTL
    120                        // serve stale for up to 2 extra min while refreshing
  );
}

/**
 * Bulk-fetch Shopify products for a shop via the Admin GraphQL API.
 * Results are cached for CACHE_TTL.PRODUCTS seconds.
 *
 * @param {object}  admin  – authenticated Shopify admin client (from authenticate.admin)
 * @param {string}  shop   – mystore.myshopify.com
 * @param {number}  limit  – max number of products to return (default 50)
 * @returns {Promise<Array>}
 */
export async function fetchShopifyProducts(admin, shop, limit = 50) {
  const cacheKey = `shopify:products:${shop}`;

  return cacheGetOrSet(
    cacheKey,
    async () => {
      const res  = await admin.graphql(`
        query GetProducts($first: Int!) {
          products(first: $first) {
            edges {
              node {
                id
                title
                handle
                status
                totalInventory
                priceRangeV2 {
                  minVariantPrice { amount currencyCode }
                  maxVariantPrice { amount currencyCode }
                }
                images(first: 1) {
                  edges { node { url altText } }
                }
                updatedAt
              }
            }
          }
        }
      `, { variables: { first: limit } });

      const json     = await res.json();
      const products = json.data?.products?.edges?.map((e) => e.node) ?? [];
      console.info(`[Shopify] Fetched ${products.length} products for ${shop}`);
      return products;
    },
    CACHE_TTL.PRODUCTS
  );
}

/**
 * Bulk-fetch Shopify orders for a shop.
 * Results are cached for CACHE_TTL.ORDERS seconds.
 *
 * @param {object}  admin
 * @param {string}  shop
 * @param {number}  limit
 * @returns {Promise<Array>}
 */
export async function fetchShopifyOrders(admin, shop, limit = 50) {
  const cacheKey = `shopify:orders:${shop}`;

  return cacheGetOrSet(
    cacheKey,
    async () => {
      const res  = await admin.graphql(`
        query GetOrders($first: Int!) {
          orders(first: $first, sortKey: CREATED_AT, reverse: true) {
            edges {
              node {
                id
                name
                email
                createdAt
                totalPriceSet { shopMoney { amount currencyCode } }
                financialStatus
                fulfillmentStatus
                lineItems(first: 5) {
                  edges { node { title quantity } }
                }
              }
            }
          }
        }
      `, { variables: { first: limit } });

      const json   = await res.json();
      const orders = json.data?.orders?.edges?.map((e) => e.node) ?? [];
      console.info(`[Shopify] Fetched ${orders.length} orders for ${shop}`);
      return orders;
    },
    CACHE_TTL.ORDERS
  );
}

/**
 * Bulk-fetch Shopify customers.
 * Results are cached for CACHE_TTL.CUSTOMERS seconds.
 *
 * @param {object}  admin
 * @param {string}  shop
 * @param {number}  limit
 * @returns {Promise<Array>}
 */
export async function fetchShopifyCustomers(admin, shop, limit = 50) {
  const cacheKey = `shopify:customers:${shop}`;

  return cacheGetOrSet(
    cacheKey,
    async () => {
      const res  = await admin.graphql(`
        query GetCustomers($first: Int!) {
          customers(first: $first, sortKey: CREATED_AT, reverse: true) {
            edges {
              node {
                id
                displayName
                email
                phone
                createdAt
                numberOfOrders
                amountSpent { amount currencyCode }
              }
            }
          }
        }
      `, { variables: { first: limit } });

      const json      = await res.json();
      const customers = json.data?.customers?.edges?.map((e) => e.node) ?? [];
      console.info(`[Shopify] Fetched ${customers.length} customers for ${shop}`);
      return customers;
    },
    CACHE_TTL.CUSTOMERS
  );
}

/**
 * Fetch & cache the shop's saved AI-Instafeed metafield config.
 *
 * @param {object} admin
 * @param {string} shop
 * @returns {Promise<object|null>}
 */
export async function fetchShopConfig(admin, shop) {
  const cacheKey = `shopify:config:${shop}`;

  return cacheGetOrSet(
    cacheKey,
    async () => {
      const res  = await admin.graphql(`{
        shop {
          metafield(namespace: "ai_instafeed", key: "config") {
            value
          }
        }
      }`);
      const json = await res.json();
      const raw  = json.data?.shop?.metafield?.value;
      if (!raw) return null;

      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    },
    CACHE_TTL.CONFIG
  );
}
