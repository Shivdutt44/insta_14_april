import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  billing: {
    "Pro Monthly": {
      lineItems: [
        {
          planType: "RECURRING",
          amount: 8,
          currencyCode: "USD",
          interval: "EVERY_30_DAYS",
          trialDays: 7,
        },
      ],
      replacementBehavior: "APPLY_IMMEDIATELY",
    },
    "Pro Yearly": {
      lineItems: [
        {
          planType: "RECURRING",
          amount: 72,
          currencyCode: "USD",
          interval: "ANNUAL",
          trialDays: 7,
        },
      ],
      replacementBehavior: "APPLY_IMMEDIATELY",
    },
    "Plus Monthly": {
      lineItems: [
        {
          planType: "RECURRING",
          amount: 20,
          currencyCode: "USD",
          interval: "EVERY_30_DAYS",
          trialDays: 7,
        },
      ],
      replacementBehavior: "APPLY_IMMEDIATELY",
    },
    "Plus Yearly": {
      lineItems: [
        {
          planType: "RECURRING",
          amount: 180,
          currencyCode: "USD",
          interval: "ANNUAL",
          trialDays: 7,
        },
      ],
      replacementBehavior: "APPLY_IMMEDIATELY",
    },
  },
  future: {
    expiringOfflineAccessTokens: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.October25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
