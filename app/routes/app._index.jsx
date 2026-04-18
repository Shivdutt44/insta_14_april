import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useFetcher, useLoaderData, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import { fetchShopConfig, fetchShopInstaData, fetchAllInstagramMedia } from "../instagramApi.server";
import { withRateLimit, trackApiResponse } from "../rateLimiter.server";
import { invalidateResource } from "../cache.server";
import {
  SkeletonPage,
  Layout,
  Card,
  SkeletonBodyText,
  SkeletonDisplayText,
  BlockStack,
  Icon,
  Button,
} from "@shopify/polaris";
import {
  RefreshIcon,
  XIcon,
  PlayIcon,
  HeartIcon,
  ChatIcon,
  LinkIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ProfileIcon,
  ChartVerticalIcon,
  MobileIcon,
  StarIcon,
  MagicIcon,
  MegaphoneIcon,
  ColorIcon,
  ViewIcon,
  StoreIcon,
  DesktopIcon,
  CollectionIcon
} from "@shopify/polaris-icons";

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOM ICONS
// ─────────────────────────────────────────────────────────────────────────────
const InstagramIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.791-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.209-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
  </svg>
);

const VideoMediaIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path fill="#FFFFFF" fillRule="evenodd" clipRule="evenodd" d="M2 7.25h3.614L9.364 2H6a4 4 0 0 0-4 4v1.25Zm20 0h-6.543l3.641-5.097A4.002 4.002 0 0 1 22 6v1.25ZM2 8.75h20V18a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8.75Zm5.457-1.5L11.207 2h6.157l-3.75 5.25H7.457Zm7.404 7.953a.483.483 0 0 0 0-.837l-3.985-2.3a.483.483 0 0 0-.725.418v4.601c0 .372.403.605.725.419l3.985-2.301Z" />
  </svg>
);

const CarouselMediaIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path fill="#FFFFFF" d="M20.453 8.5c.005.392.005.818.005 1.279v3.2c0 1.035 0 1.892-.057 2.591-.06.728-.187 1.403-.511 2.038a5.214 5.214 0 0 1-2.278 2.279c-.636.323-1.31.451-2.038.51-.699.058-1.556.058-2.59.058h-3.2c-.32 0-.624 0-.911-.002H5.395A3.856 3.856 0 0 0 8.485 22h7.724A5.793 5.793 0 0 0 22 16.207V8.483a3.856 3.856 0 0 0-1.548-3.093V8.5Z"/>
    <path fill="#FFFFFF" fillRule="evenodd" clipRule="evenodd" d="M2 5.4A3.4 3.4 0 0 1 5.4 2h10.2A3.4 3.4 0 0 1 19 5.4v5.482l-1.91-1.25a4.037 4.037 0 0 0-4.767.253L7.87 13.528a2.763 2.763 0 0 1-3.262.173L2 11.994V5.4Zm14.392 5.299L19 12.406V15.6a3.4 3.4 0 0 1-3.4 3.4H5.4A3.4 3.4 0 0 1 2 15.6v-2.082l1.91 1.25a4.038 4.038 0 0 0 4.767-.253l4.453-3.643a2.763 2.763 0 0 1 3.262-.173ZM7.525 9.65a2.125 2.125 0 1 0 0-4.25 2.125 2.125 0 0 0 0 4.25Z"/>
  </svg>
);

const ImageMediaIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path fill="#FFFFFF" d="M19 3H5c-1.103 0-2 .897-2 2v14c0 1.103.897 2 2 2h14c1.103 0 2-.897 2-2V5c0-1.103-.897-2-2-2zM5 19V5h14l.002 14H5z"/>
    <path fill="#FFFFFF" d="m10 14-1-1-3 4h12l-5-7z"/>
    <circle fill="#FFFFFF" cx="8.5" cy="8.5" r="1.5"/>
  </svg>
);

// ─────────────────────────────────────────────────────────────────────────────
// LOADER
// ─────────────────────────────────────────────────────────────────────────────
export const loader = async ({ request }) => {
  const { admin, session, billing } = await authenticate.admin(request);
  const shop = session?.shop ?? "unknown";
  
  let subscription = null;
  try {
    const billingCheck = await billing.check({
      plans: ["Pro Monthly", "Pro Yearly"],
      isTest: true,
    });
    // Ensure we only count ACTIVE subscriptions
    if (billingCheck.hasActivePayment) {
      const activeSub = billingCheck.appSubscriptions.find(s => s.status === "ACTIVE");
      if (activeSub) {
        subscription = activeSub;
      }
    }
  } catch (e) {
    console.error("Billing check error:", e.message);
  }

  let config = null;
  let instaData = null;

  try {
    const fetchedConfig = await withRateLimit(shop, () => fetchShopConfig(admin, shop));
    const fetchedInstaData = await fetchShopInstaData(admin, shop);
    trackApiResponse(shop, {});
    config = fetchedConfig;
    instaData = fetchedInstaData;
  } catch (err) {
    console.error("Loader fetch error:", err);
  }

  // Fetch Theme ID outside try/catch for config
  const themeRes = await admin.graphql(`{ themes(first: 1, roles: [MAIN]) { nodes { id } } }`);
  const themeJson = await themeRes.json();
  const themeId = themeJson.data?.themes?.nodes[0]?.id.split("/").pop() || "current";

  return { 
    config: config ? JSON.stringify(config) : null, 
    instaData: instaData ? JSON.stringify(instaData) : null, 
    subscription, 
    shop, 
    themeId,
    clientId: process.env.SHOPIFY_API_KEY 
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// ACTION
// ─────────────────────────────────────────────────────────────────────────────
export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session?.shop ?? "unknown";
  const formData = await request.formData();
  const intent = formData.get("intent");

  // ── Save Config ──
  if (intent === "saveConfig") {
    const configData = formData.get("config");
    try {
      const shopRes = await admin.graphql(`{ shop { id } }`);
      const shopJson = await shopRes.json();
      const shopId = shopJson.data.shop.id;

      const parsedConfig = JSON.parse(configData);
      const metafields = [
        {
          ownerId: shopId,
          namespace: "ai_instafeed",
          key: "config",
          type: "json",
          value: configData,
        },
      ];

      // If handle is empty, also clear the insta_data metafield
      if (!parsedConfig.instagramHandle) {
        metafields.push({
          ownerId: shopId,
          namespace: "ai_instafeed",
          key: "insta_data",
          type: "json",
          value: "null",
        });
      }

      const saveRes = await admin.graphql(
        `mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            userErrors { message }
          }
        }`,
        { variables: { metafields } }
      );

      const saveJson = await saveRes.json();
      if (saveJson.data?.metafieldsSet?.userErrors?.length > 0) {
        return { error: saveJson.data.metafieldsSet.userErrors[0].message };
      }
      // ── Invalidate config cache so the next loader hit re-fetches fresh data ──
      await invalidateResource(shop, "config");
      await invalidateResource(shop, "insta_data");
      return { success: true, message: "Settings updated successfully" };
    } catch (e) {
      return { error: e.message || "Failed to save metafield" };
    }
  }

  // ── intent: fetchInsta – Fully Automated All-Pages Crawl ──────────────────
  // Uses fetchAllInstagramMedia to crawl every pagination cursor
  // server-side in one shot. Returns complete dataset, saves to metafield.
  const handle = formData.get("handle");

  if (!handle) return { error: "Missing Instagram handle." };
  if (!process.env.FACEBOOK_ACCESS_TOKEN) return { error: "FACEBOOK_ACCESS_TOKEN is not configured." };

  try {
    // AUTO-CRAWL: Fetches ALL pages (up to 500 posts) automatically
    const allData = await fetchAllInstagramMedia(handle, shop);

    if (!allData) {
      return { error: "Could not fetch Instagram data. Check the username or access token." };
    }

    // Persist the complete dataset to Shopify metafield
    const shopRes = await admin.graphql(`{ shop { id } }`);
    const shopJson = await shopRes.json();
    const shopId = shopJson.data.shop.id;

    await admin.graphql(
      `mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          userErrors { message }
        }
      }`,
      {
        variables: {
          metafields: [
            {
              ownerId: shopId,
              namespace: "ai_instafeed",
              key: "insta_data",
              type: "json",
              value: JSON.stringify(allData),
            },
          ],
        },
      }
    );
    await invalidateResource(shop, "insta_data");

    return { data: allData };
  } catch (error) {
    return { error: error.message || "Failed to fetch Instagram data" };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_CONFIG = {
  instagramHandle: "",
  postFeed: {
    header: true,
    metrics: true,
    load: false,
    carousel: true,
    autoplay: true,
    modalSound: false,
    modalNavigation: true,
    heading: "SHOP OUR INSTAGRAM",
    subheading: "Tag us @account to get featured in our gallery!",
    typography: {
      heading:    { size: 18, weight: "800", color: "#0f172a" },
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
    paddingTop: 32,
    paddingBottom: 32,
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
      heading:    { size: 28, weight: "800", color: "#000" },
      subheading: { size: 14, weight: "400", color: "#666" },
    },
    animateImages: false,
    activeRing: true,
    ringColor: "#6366f1",
    showNavigation: true,
    paddingTop: 24,
    paddingBottom: 24,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function Index() {
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const fetcher = useFetcher();
  const saveFetcher = useFetcher();
  const loaderData = useLoaderData() || {};

  const [isHydrated, setIsHydrated] = useState(false);
  const [isAppBridgeReady, setIsAppBridgeReady] = useState(false);

  const [activeTab, setActiveTab] = useState("post");
  const [previewDevice, setPreviewDevice] = useState("mobile");

  const isPaid = !!loaderData.subscription;
  const planName = loaderData.subscription?.name || "Starter";

  const [instaData, setInstaData] = useState(null);
  const [selectedPost, setSelectedPost] = useState(null);
  const [isInfiniteLoading, setIsInfiniteLoading] = useState(false);
  const [extraLoadCount, setExtraLoadCount] = useState(0);

  const PLACEHOLDER_MEDIA = useMemo(() => {
    const baseUrls = [
      "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=600&h=600&fit=crop",
      "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=600&h=600&fit=crop",
      "https://images.unsplash.com/photo-1539106604-24283ef1677b?w=600&h=600&fit=crop",
      "https://images.unsplash.com/photo-1529139513364-c4d1221e93c0?w=600&h=600&fit=crop",
      "https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=600&h=600&fit=crop",
      "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=600&h=600&fit=crop",
      "https://images.unsplash.com/photo-1550614000-4895a10e1bfd?w=600&h=600&fit=crop",
      "https://images.unsplash.com/photo-1492724441997-5dc865305da7?w=600&h=600&fit=crop",
      "https://images.unsplash.com/photo-1581044777550-4cfa60707c03?w=600&h=600&fit=crop",
      "https://images.unsplash.com/photo-1485230895905-ec17bd36b5cc?w=600&h=600&fit=crop",
      "https://images.unsplash.com/photo-1475184447565-30060953d611?w=600&h=600&fit=crop",
      "https://images.unsplash.com/photo-1524250502761-1ac6f2e30d43?w=600&h=600&fit=crop",
    ];
    return Array.from({ length: 24 }).map((_, i) => ({
      id: `placeholder_${i}`,
      media_url: baseUrls[i % baseUrls.length],
      media_type: "IMAGE",
      like_count: 120 + (i * 5) % 80,
      comments_count: 8 + (i * 2) % 15
    }));
  }, []);

  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [lastSavedConfig, setLastSavedConfig] = useState(null);
  const [isHideMode, setIsHideMode] = useState(false);

  const baseMedia = useMemo(() => {
    let media = instaData?.media?.data || PLACEHOLDER_MEDIA;
    if (!isHideMode && config?.postFeed?.hiddenPostIds?.length > 0) {
      media = media.filter(item => !config.postFeed.hiddenPostIds.includes(item.id || item.media_url));
    }
    return media;
  }, [instaData?.media?.data, PLACEHOLDER_MEDIA, config?.postFeed?.hiddenPostIds, isHideMode]);

  const handleToggleHidePost = (itemIdentifier) => {
    setConfig(prev => {
      const isHidden = prev.postFeed.hiddenPostIds.includes(itemIdentifier);
      return {
        ...prev,
        postFeed: {
          ...prev.postFeed,
          hiddenPostIds: isHidden 
            ? prev.postFeed.hiddenPostIds.filter(id => id !== itemIdentifier)
            : [...prev.postFeed.hiddenPostIds, itemIdentifier]
        }
      };
    });
  };

  const baseDeviceLimit = previewDevice === "mobile" 
    ? (config.postFeed.mobileLimit ?? 4) 
    : (config.postFeed.desktopLimit ?? 8);

  // If infinite scroll was toggled off, reset extra loads immediately
  useEffect(() => {
    if (!config.postFeed.load) {
      setExtraLoadCount(0);
    }
  }, [config.postFeed.load]);

  const totalVisibleCount = config.postFeed.load 
    ? baseDeviceLimit + extraLoadCount 
    : baseDeviceLimit;

  const hasMoreToShow = totalVisibleCount < baseMedia.length;

  const simulatedInfiniteMedia = useMemo(
    () => baseMedia.slice(0, totalVisibleCount),
    [baseMedia, totalVisibleCount]
  );



  // Whether the user has unsaved local edits
  const hasChanges = lastSavedConfig
    ? JSON.stringify(config) !== JSON.stringify(lastSavedConfig)
    : false;

  // Track last-fetched handle to debounce refetches
  const [lastFetchedHandle, setLastFetchedHandle] = useState("");

  // Carousel refs
  const desktopCarouselRef = useRef(null);
  const mobileCarouselRef  = useRef(null);
  const mobileStoryRef     = useRef(null);
  const desktopStoryRef    = useRef(null);

  // ── Hydration guard ──
  useEffect(() => {
    setIsHydrated(true);
    const t = setTimeout(() => setIsAppBridgeReady(true), 800);
    return () => clearTimeout(t);
  }, []);

  // ── Restore from localStorage / metafield on mount ──
  useEffect(() => {
    // Restore cached feed data
    const savedData = localStorage.getItem("insta_feed_data");
    if (savedData) {
      try { setInstaData(JSON.parse(savedData)); } catch {}
    }

    // Restore config (metafield wins over localStorage)
    const configStr = loaderData?.config || localStorage.getItem("insta_config");
    const instaDataStr = loaderData?.instaData || localStorage.getItem("insta_feed_data");

    if (instaDataStr) {
      try { setInstaData(JSON.parse(instaDataStr)); } catch {}
    }

    if (configStr) {
      try {
        const parsed = JSON.parse(configStr);
        setConfig((prev) => {
          const merged = { ...prev };
          if (parsed.postFeed) {
            merged.postFeed = { ...prev.postFeed, ...parsed.postFeed };
            if (parsed.postFeed.typography) {
              merged.postFeed.typography = {
                ...prev.postFeed.typography,
                ...parsed.postFeed.typography,
              };
              if (parsed.postFeed.typography.heading)
                merged.postFeed.typography.heading = {
                  ...prev.postFeed.typography.heading,
                  ...parsed.postFeed.typography.heading,
                };
              if (parsed.postFeed.typography.subheading)
                merged.postFeed.typography.subheading = {
                  ...prev.postFeed.typography.subheading,
                  ...parsed.postFeed.typography.subheading,
                };
            }
          }
          if (parsed.stories) {
            merged.stories = { ...prev.stories, ...parsed.stories };
            if (parsed.stories.typography) {
              merged.stories.typography = {
                ...prev.stories.typography,
                ...parsed.stories.typography,
              };
              if (parsed.stories.typography.heading)
                merged.stories.typography.heading = {
                  ...prev.stories.typography.heading,
                  ...parsed.stories.typography.heading,
                };
              if (parsed.stories.typography.subheading)
                merged.stories.typography.subheading = {
                  ...prev.stories.typography.subheading,
                  ...parsed.stories.typography.subheading,
                };
            }
          }
          if (parsed.instagramHandle !== undefined)
            merged.instagramHandle = parsed.instagramHandle;
          return merged;
        });

        // Set baseline for apply/discard tracking after state settles
        setTimeout(() => {
          setLastSavedConfig(JSON.parse(configStr));
        }, 150);
      } catch (e) {
        console.error("Failed to parse saved config", e);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-fetch on handle change (debounced 1.5 s) ──
  useEffect(() => {
    const handle = config.instagramHandle?.trim();
    if (!handle || handle === lastFetchedHandle) return;

    // ── PERFORMANCE: Stop unwanted API calls if data already exists in Metafield ──
    if (instaData && handle.toLowerCase() === instaData.username.toLowerCase()) {
      setLastFetchedHandle(handle);
      return;
    }

    const timeout = setTimeout(() => {
      setLastFetchedHandle(handle);

      // Auto save the typed URL immediately to Shopify database,
      // so if they refresh the page before connection completes, it doesn't vanish.
      const currentConfig = { ...configRef.current, instagramHandle: handle };
      setLastSavedConfig(currentConfig);
      localStorage.setItem("insta_config", JSON.stringify(currentConfig));
      const fdSave = new FormData();
      fdSave.append("intent", "saveConfig");
      fdSave.append("config", JSON.stringify(currentConfig));
      saveFetcher.submit(fdSave, { method: "post" });

      const fd = new FormData();
      fd.append("handle", handle);
      fetcher.submit(fd, { method: "post" });
    }, 1500);

    return () => clearTimeout(timeout);
  // fetcher is intentionally omitted – it's stable enough and adding it
  // caused infinite re-fetch loops because useFetcher returns a new ref each render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.instagramHandle, lastFetchedHandle]);

  // ── Handle fetcher responses ──
  useEffect(() => {
    if (!fetcher.data) return;
    if (fetcher.data.success) return;

    if (fetcher.data.data) {
      const { username, media, _totalPages } = fetcher.data.data;
      setInstaData(fetcher.data.data);
      // Reset extra loads
      setExtraLoadCount(0);

      const newConfig = {
        ...configRef.current,
        instagramHandle: username,
        postFeed: {
          ...configRef.current.postFeed,
          subheading: configRef.current.postFeed.subheading.replace(/@[\w.]+/g, `@${username}`),
        },
        stories: {
          ...configRef.current.stories,
          subheading: configRef.current.stories.subheading.replace(/@[\w.]+/g, `@${username}`),
        },
      };

      setConfig(newConfig);
      setLastSavedConfig(newConfig);
      localStorage.setItem("insta_config", JSON.stringify(newConfig));

      // Auto-save to metafield so it persists across page reloads
      const fd = new FormData();
      fd.append("intent", "saveConfig");
      fd.append("config", JSON.stringify(newConfig));
      saveFetcher.submit(fd, { method: "post" });

      localStorage.setItem("insta_feed_data", JSON.stringify(fetcher.data.data));
      const totalPosts = media?.data?.length || 0;
      const pages = _totalPages || 1;
      shopify.toast.show(
        `✓ Connected @${username} · ${totalPosts} posts synced (${pages} page${pages > 1 ? "s" : ""} crawled)`
      );
    } else if (fetcher.data.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify]);
 
  // ── Connection smart logic ──
  const isConnected = useMemo(() => {
    if (!instaData || !config.instagramHandle) return false;
    return config.instagramHandle.trim().toLowerCase() === instaData.username.toLowerCase();
  }, [instaData, config.instagramHandle]);

  const handleDisconnect = useCallback(() => {
    setInstaData(null);
    localStorage.removeItem("insta_feed_data");
    const newConfig = { ...config, instagramHandle: "" };
    setConfig(newConfig);
    setLastSavedConfig(newConfig);
    localStorage.setItem("insta_config", JSON.stringify(newConfig));
    setLastFetchedHandle("");

    // Auto-save the cleared state to Shopify metafield
    const fd = new FormData();
    fd.append("intent", "saveConfig");
    fd.append("config", JSON.stringify(newConfig));
    saveFetcher.submit(fd, { method: "post" });

    shopify.toast.show("Instagram account disconnected successfully.");
  }, [config, fetcher, shopify]);

  // ── Config helpers ──
  const updateConfig = useCallback((section, key, value) => {
    setConfig((prev) => ({
      ...prev,
      [section]: { ...prev[section], [key]: value },
    }));
    if (key === "mobileColumns" || key === "mobileLimit")  setPreviewDevice("mobile");
    if (key === "desktopColumns" || key === "desktopLimit") setPreviewDevice("desktop");
    if (section === "stories")   setActiveTab("story");
    if (section === "postFeed")  setActiveTab("post");
  }, []);

  const updateNestedConfig = useCallback((section, subSection, key, value) => {
    setConfig((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [subSection]: { ...prev[section][subSection], [key]: value },
      },
    }));
    if (section === "stories")  setActiveTab("story");
    if (section === "postFeed") setActiveTab("post");
  }, []);

  // ── Apply / Discard ──
  const applyChanges = useCallback(() => {
    setLastSavedConfig(config);
    localStorage.setItem("insta_config", JSON.stringify(config));
    const fd = new FormData();
    fd.append("intent", "saveConfig");
    fd.append("config", JSON.stringify(config));
    saveFetcher.submit(fd, { method: "post" });
    shopify.toast.show("Configuration applied successfully!");
  }, [config, fetcher, shopify]);

  const discardChanges = useCallback(() => {
    if (lastSavedConfig) {
      setConfig(lastSavedConfig);
      shopify.toast.show("Changes discarded.");
    }
  }, [lastSavedConfig, shopify]);

  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  const handleScroll = useCallback((e, orientation = "vertical") => {
    if (!configRef.current.postFeed.load || isInfiniteLoading) return;
    const { scrollTop, scrollLeft, scrollHeight, scrollWidth, clientHeight, clientWidth } = e.currentTarget;
    const threshold = 300;
    const nearEnd =
      orientation === "vertical"
        ? scrollHeight - scrollTop - clientHeight < threshold
        : scrollWidth - scrollLeft - clientWidth < threshold;

    if (nearEnd && hasMoreToShow) {
      setIsInfiniteLoading(true);
      // Reveal more already-stored posts – zero API calls
      setTimeout(() => {
        setExtraLoadCount((prev) => prev + (previewDevice === "mobile" ? 4 : 8));
        setIsInfiniteLoading(false);
      }, 500);
    }
  }, [isInfiniteLoading, previewDevice, hasMoreToShow, baseMedia.length]);

  // ── Carousel scroll helper ──
  const scrollCarousel = useCallback((ref, direction) => {
    if (!ref.current) return;
    const amount = ref.current.clientWidth * 0.8;
    ref.current.scrollBy({
      left: direction === "next" ? amount : -amount,
      behavior: "smooth",
    });
  }, []);


  const isSyncing = fetcher.state !== "idle";

  // ── Skeleton loader ──
  if (!isHydrated || !isAppBridgeReady) {
    return (
      <div style={{ padding: "32px", maxWidth: "1300px", margin: "0 auto" }}>
        <SkeletonPage primaryAction>
          <Layout>
            <Layout.Section>
              <Card>
                <div style={{ padding: "24px" }}>
                  <SkeletonDisplayText size="small" />
                  <div style={{ marginTop: "16px" }}><SkeletonBodyText lines={3} /></div>
                </div>
              </Card>
              <div style={{ marginTop: "24px" }}>
                <Card>
                  <div style={{ padding: "24px" }}>
                    <SkeletonDisplayText size="small" />
                    <div style={{ marginTop: "16px" }}><SkeletonBodyText lines={6} /></div>
                  </div>
                </Card>
              </div>
            </Layout.Section>
            <Layout.Section variant="oneThird">
              <Card>
                <div style={{ padding: "24px" }}>
                  <BlockStack gap="400">
                    <SkeletonDisplayText size="small" />
                    <SkeletonBodyText lines={2} />
                    <div style={{ margin: "16px 0" }} />
                    <SkeletonDisplayText size="small" />
                    <SkeletonBodyText lines={8} />
                  </BlockStack>
                </div>
              </Card>
            </Layout.Section>
          </Layout>
        </SkeletonPage>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER HELPERS (media cards – keeps JSX DRY)
  // ─────────────────────────────────────────────────────────────────────────
  const renderMediaCard = (item, i, isDesktop = false) => {
    const itemIdentifier = item.id || item.media_url;
    const isHidden = config.postFeed.hiddenPostIds?.includes(itemIdentifier);
    const aspect = config.postFeed.aspectRatio === "auto" ? "auto" : (config.postFeed.aspectRatio || "1/1");
    
    const rawType   = (item.media_type || "").toUpperCase();
    const isVideo   = rawType === "VIDEO" || rawType === "REEL" || (item.media_url && item.media_url.toLowerCase().includes(".mp4"));
    const isAlbum   = rawType === "CAROUSEL_ALBUM" || rawType === "ALBUM";

    return (
      <div
        key={i}
        className="grid-item"
        onClick={() => {
          if (isHideMode) {
            handleToggleHidePost(itemIdentifier);
          } else {
            setSelectedPost(item);
          }
        }}
        style={{ 
          aspectRatio: aspect, 
          background: "#f1f5f9", 
          borderRadius: isDesktop ? "8px" : "4px", 
          overflow: "hidden", 
          position: "relative",
          cursor: isHideMode ? "pointer" : "default",
          opacity: isHideMode && isHidden ? 0.4 : 1,
          transition: "opacity 0.2s"
        }}
      >
        {isHideMode && isHidden && (
          <div style={{ position: "absolute", inset: 0, zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.4)" }}>
            <span style={{ background: "rgba(0,0,0,0.8)", color: "white", padding: "4px 8px", borderRadius: "12px", fontSize: "10px", fontWeight: "600", display: "flex", alignItems: "center", gap: "4px" }}>
              <Icon source={ViewIcon} tone="inherit" /> Hidden
            </span>
          </div>
        )}
        {isVideo && config.postFeed.autoplay ? (
          <video src={item.media_url} autoPlay muted loop playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (item.media_url || item.thumbnail_url) ? (
          <img
            loading="lazy"
            src={isVideo ? (item.thumbnail_url || item.media_url) : item.media_url}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            alt="Instagram post"
          />
        ) : null}
        {isVideo && (
          <div className="media-icon-badge" style={{ position: "absolute", top: "8px", right: "8px", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center", filter: "drop-shadow(0px 2px 4px rgba(0,0,0,0.3))", color: "white" }}>
            <VideoMediaIcon />
          </div>
        )}
        {isAlbum && (
          <div className="media-icon-badge" style={{ position: "absolute", top: "8px", right: "8px", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center", filter: "drop-shadow(0px 2px 4px rgba(0,0,0,0.3))", color: "white" }}>
            <CarouselMediaIcon />
          </div>
        )}
        {!isVideo && !isAlbum && (
           <div className="media-icon-badge" style={{ position: "absolute", top: "8px", right: "8px", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center", filter: "drop-shadow(0px 2px 4px rgba(0,0,0,0.3))", color: "white" }}>
            <ImageMediaIcon />
          </div>
        )}
        {config.postFeed.metrics && (
          <div className="media-metrics">
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Icon source={HeartIcon} tone="inherit" />
              <span>{item.like_count ?? "0"}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Icon source={ChatIcon} tone="inherit" />
              <span>{item.comments_count ?? "0"}</span>
            </div>
          </div>
        )}
        {(config.postFeed.showInstagramIcon !== false) && (
          <div className="ai-ig-icon" style={{ color: "white" }}>
            <InstagramIcon />
          </div>
        )}
        {/* Hover Overlay */}
        <div className="hover-card-overlay" />
      </div>
    );
  };

  const renderCarouselCard = (item, i, isDesktop = false) => (
    <div key={i} className="carousel-item">
      {renderMediaCard(item, i, isDesktop)}
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // MAIN RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="premium-dashboard">

      {/* ── Header Bar ── */}
      <div className="premium-header">
        <div className="brand-section">
          <div className="brand-logo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: "18px", fontWeight: "700" }}>Ai Highlight Center</h1>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "12px", color: "#6b7280" }}>V2.0 Core</span>
            </div>
          </div>
          <div className="status-badge" style={{ marginLeft: "16px" }}>
            <div className="status-dot" />
            System Online <span style={{ opacity: 0.6, marginLeft: "4px" }}>Active</span>
          </div>
        </div>

        {/* Plan & Customize Buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Button
            variant="tertiary"
            icon={StoreIcon}
            onClick={() => {
              const customizerUrl = `https://${loaderData.shop}/admin/themes/${loaderData.themeId}/editor?context=apps&activateAppId=${loaderData.clientId}/app-embed&activateAppEmbed=${loaderData.clientId}/app-embed`;
              window.open(customizerUrl, "_blank");
            }}
          >
            Customize in Store
          </Button>

          <div 
            onClick={() => navigate("/app/plans")}
            style={{ 
              fontSize: "11px", 
              fontWeight: "800", 
              padding: "6px 14px", 
              borderRadius: "14px", 
              background: loaderData?.subscription ? "var(--premium-accent-gradient)" : "rgba(0,0,0,0.05)",
              color: loaderData?.subscription ? "white" : "#64748b",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "5px",
              boxShadow: loaderData?.subscription ? "0 4px 12px rgba(99, 102, 241, 0.2)" : "none",
              transition: "all 0.2s ease"
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = loaderData?.subscription ? "0 6px 16px rgba(99, 102, 241, 0.3)" : "none"; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = loaderData?.subscription ? "0 4px 12px rgba(99, 102, 241, 0.2)" : "none"; }}
          >
            <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: isPaid ? "white" : "#94a3b8" }} />
            {planName.toUpperCase()} {isPaid ? "PRO" : "PLAN"}
          </div>
        </div>
      </div>

      {!isPaid && (
        <div style={{ 
          margin: "0 auto 24px", 
          maxWidth: "1300px", 
          background: "linear-gradient(90deg, #fef2f2 0%, #fff 100%)", 
          border: "1px solid #fee2e2", 
          borderRadius: "16px", 
          padding: "16px 24px", 
          display: "flex", 
          alignItems: "center", 
          justifyContent: "space-between",
          animation: "fadeInBlur 0.6s ease-out"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div style={{ background: "#ef4444", color: "white", padding: "8px", borderRadius: "12px" }}>
              <Icon source={StarIcon} />
            </div>
            <div>
              <p style={{ fontWeight: "700", color: "#991b1b", margin: 0 }}>Unlock PRO Features</p>
              <p style={{ fontSize: "13px", color: "#b91c1c", margin: 0 }}>Hiding posts, removing watermark, and infinite scroll are PRO features.</p>
            </div>
          </div>
          <button 
            className="premium-button button-accent" 
            style={{ padding: "8px 20px" }}
            onClick={() => navigate("/app/plans")}
          >
            Upgrade Now
          </button>
        </div>
      )}

      <div style={{ maxWidth: "1300px", margin: "0 auto" }}>

        {/* ── Connect Account Card ── */}
        <div className="premium-card" style={{ padding: "32px", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: "-20px", right: "-20px", width: "120px", height: "120px", background: "var(--premium-accent)", opacity: 0.05, borderRadius: "50%", filter: "blur(50px)", pointerEvents: "none" }} />

          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "24px", gap: "20px", flexWrap: "wrap" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                <span style={{ background: "var(--premium-accent)", color: "white", width: "22px", height: "22px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: "800", flexShrink: 0 }}>1</span>
                <h2 style={{ margin: 0, fontSize: "18px", fontWeight: "700", color: "#0f172a" }}>Connect Your Account</h2>
              </div>
              <p style={{ margin: 0, fontSize: "14px", color: "#64748b", lineHeight: "1.6" }}>
                Seamlessly sync your Instagram feed to your Shopify storefront.<br />
                Enter your <span style={{ color: "var(--premium-accent)", fontWeight: "600" }}>@username</span> or profile URL to begin.
              </p>
            </div>

            {isConnected ? (
              <div className="status-badge" style={{ animation: "fadeInBlur 0.5s ease" }}>
                <div className="status-dot" />
                Linked to @{instaData.username}
              </div>
            ) : (
              <div className="status-badge" style={{ animation: "fadeInBlur 0.5s ease", background: "#fef2f2", color: "#b91c1c", border: "1px solid #fee2e2" }}>
                <div className="status-dot" style={{ background: "#ef4444" }} />
                Account Unlinked
              </div>
            )}
          </div>

          <div className="input-group-nested">
            <div style={{ position: "relative", flex: 1, display: "flex", alignItems: "center" }}>
              <div style={{ paddingLeft: "16px", color: "var(--premium-accent)", display: "flex", alignItems: "center", flexShrink: 0 }}>
                <InstagramIcon />
              </div>
              <input
                type="text"
                className="premium-input"
                style={{ paddingLeft: "12px" }}
                value={config.instagramHandle}
                onChange={(e) => {
                  let val = e.target.value;
                  if (val.includes("instagram.com/")) {
                    try {
                      const url = new URL(val.startsWith("http") ? val : `https://${val}`);
                      const parts = url.pathname.split("/").filter(Boolean);
                      if (parts.length > 0) val = parts[0];
                    } catch {
                      const parts = val.replace(/\/$/, "").split("/");
                      val = parts[parts.length - 1].split("?")[0];
                    }
                  }
                  val = val.replace("@", "").split("?")[0].trim();
                  setConfig((prev) => ({ ...prev, instagramHandle: val }));
                }}
                placeholder="instagram_handle or profile URL"
              />
            </div>
            <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
              {isConnected && (
                <button
                  className="premium-button"
                  style={{ background: "#f1f5f9", color: "#6366f1", border: "1px solid #e2e8f0", minHeight: "46px", fontSize: "13px" }}
                  disabled={isSyncing}
                  title="Re-sync: Crawl all pages from Instagram again and update stored data"
                  onClick={() => {
                    const fd = new FormData();
                    fd.append("handle", config.instagramHandle);
                    fetcher.submit(fd, { method: "post" });
                  }}
                >
                  {isSyncing ? (
                    <div style={{ width: "14px", height: "14px", border: "2px solid #6366f1", borderTop: "2px solid transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                  ) : (
                    <Icon source={RefreshIcon} />
                  )}
                  <span>Re-sync</span>
                </button>
              )}
              <button
                className={`premium-button ${isSyncing ? "button-accent loading" : isConnected ? "button-danger" : "button-accent"}`}
                disabled={isSyncing}
                onClick={() => {
                  if (isConnected) {
                    handleDisconnect();
                  } else {
                    if (!config.instagramHandle.trim()) {
                      shopify.toast.show("Please enter an Instagram handle", { isError: true });
                      return;
                    }
                    const fd = new FormData();
                    fd.append("handle", config.instagramHandle);
                    fetcher.submit(fd, { method: "post" });
                  }
                }}
              >
                {isSyncing ? (
                  <>
                    <div style={{ width: "16px", height: "16px", border: "2px solid rgba(255,255,255,0.35)", borderTop: "2px solid white", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                    <span>Crawling all pages…</span>
                  </>
                ) : isConnected ? (
                  <>
                    <Icon source={XIcon} />
                    <span>Disconnect</span>
                  </>
                ) : (
                  <>
                    <Icon source={LinkIcon} />
                    <span>Connect & Sync All</span>
                  </>
                )}
              </button>
            </div>
          </div>
          {isConnected && instaData && (
            <div style={{ marginTop: "12px", padding: "8px 16px", background: "#f0fdf4", borderRadius: "10px", border: "1px solid #dcfce7", display: "flex", gap: "16px", flexWrap: "wrap", fontSize: "12px", color: "#166534", alignItems: "center" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><Icon source={StoreIcon} tone="inherit" /> <strong>{instaData.media?.data?.length || 0}</strong> posts stored</span>
              {instaData._totalPages && <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><Icon source={CollectionIcon} tone="inherit" /> <strong>{instaData._totalPages}</strong> page{instaData._totalPages > 1 ? "s" : ""} crawled</span>}
              {instaData._crawledAt && <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><Icon source={PlayIcon} tone="inherit" /> Last synced: <strong>{new Date(instaData._crawledAt).toLocaleString()}</strong></span>}
              <span style={{ marginLeft: "auto", color: "#15803d", fontWeight: 600 }}>✓ API calls: 0 per storefront visit</span>
            </div>
          )}
        </div>

        {/* ── Main Two-Column Grid ── */}
        <div className="main-content-grid" style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: "24px", alignItems: "start" }}>

          {/* ── LEFT: Settings Panel ── */}
          <div className="premium-card" style={{ padding: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ width: "8px", height: "8px", background: "var(--premium-accent)", borderRadius: "50%" }} />
                <h2 style={{ margin: 0, fontSize: "15px", fontWeight: "700" }}>DASHBOARD CONFIGURATOR</h2>
              </div>
              {hasChanges && (
                <div style={{ display: "flex", gap: "8px", animation: "fadeInBlur 0.3s ease" }}>
                  <button
                    className="premium-button"
                    style={{ padding: "6px 16px", fontSize: "12px", background: "#f8fafc", color: "#64748b", border: "1px solid #e2e8f0" }}
                    onClick={discardChanges}
                  >
                    Discard
                  </button>
                  <button className="premium-button button-success" style={{ padding: "6px 16px", fontSize: "12px" }} onClick={applyChanges}>
                    Apply
                  </button>
                </div>
              )}
            </div>

            {/* Tabs */}
            <div className="tab-container">
              <div className={`tab-item ${activeTab === "post" ? "active" : ""}`} onClick={() => setActiveTab("post")}>Feed Grid Settings</div>
              <div 
                className={`tab-item ${activeTab === "story" ? "active" : ""}`} 
                onClick={() => setActiveTab("story")}
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                Story &amp; Layouts
              </div>
            </div>

            {/* Tab Content */}
            <div className="tab-content-container" key={activeTab} style={{ animation: "fadeInBlur 0.35s ease-out" }}>

              {/* ── Feed Grid Settings ── */}
              {activeTab === "post" ? (
                <>
                  <h3 className="input-label" style={{ marginBottom: "12px" }}>Dynamic Modules</h3>
                  {[
                    { id: "header",   label: "Profile Header",  sub: "Show store bio & icon",       icon: ProfileIcon },
                    { id: "metrics",  label: "Engagement Hub",  sub: "Visualise social proof",       icon: ChartVerticalIcon },
                    { id: "load",     label: "Infinite Paging", sub: "Zero-latency scrolling",       icon: RefreshIcon, isPremium: true },
                    { id: "carousel", label: "Smart Carousel",  sub: "Auto-swipe logic",             icon: MobileIcon },
                    { id: "autoplay", label: "Smart Autoplay",  sub: "Pre-load video content",       icon: PlayIcon },
                    { id: "modalNavigation", label: "Modal Navigation", sub: "Prev/Next arrows in popup", icon: ChevronRightIcon },
                    { id: "modalSound", label: "Video Modal Sound", sub: "Enable audio in popup videos", icon: PlayIcon, isPremium: true },
                    { id: "showInstagramIcon", label: "Instagram Icon", sub: "Branding badge on posts", icon: InstagramIcon },
                    { id: "removeWatermark", label: "Remove Watermark", sub: "Hide 'By BOOST STAR' badge", icon: StarIcon, isPremium: true },
                    { id: "isHideMode", label: "Manual Hide Mode", sub: "Hide specific posts from feed", icon: ViewIcon, isPremium: true, isLocal: true },
                  ].map((item, idx) => (
                    <div key={item.id} className="setting-row" style={{ animation: `slideInUp 0.3s ease-out ${idx * 0.05}s both`, opacity: (!isPaid && item.isPremium) ? 0.7 : 1 }}>
                      <div className="setting-info">
                        <div className="setting-icon"><Icon source={item.icon} color="inherit" /></div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <div>
                            <div style={{ fontSize: "14px", fontWeight: "600", display: "flex", alignItems: "center", gap: "6px" }}>
                              {item.label}
                              {item.isPremium && <span style={{ fontSize: "9px", padding: "2px 6px", background: "var(--premium-accent)", color: "white", borderRadius: "4px", fontWeight: "800" }}>PRO</span>}
                            </div>
                            <div style={{ fontSize: "12px", color: "#9ca3af" }}>{item.sub}</div>
                          </div>
                        </div>
                      </div>
                      <label className="premium-switch" title={item.isPremium && !isPaid ? "Upgrade to PRO to enable this feature" : ""}>
                        <input
                          type="checkbox"
                          checked={(!isPaid && item.isPremium) ? false : (item.isLocal ? isHideMode : !!config.postFeed[item.id])}
                          onChange={(e) => {
                            if (item.isPremium && !isPaid) {
                              shopify.toast.show(`${item.label} is a PRO feature`, { isError: true });
                              navigate("/app/plans");
                              return;
                            }
                            if (item.isLocal) {
                              setIsHideMode(e.target.checked);
                            } else {
                              updateConfig("postFeed", item.id, e.target.checked);
                            }
                          }}
                        />
                        <span className="slider" />
                      </label>
                    </div>
                  ))}

                  <div className="visual-architecture">
                    <h3 className="input-label">Grid Architecture</h3>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
                      <div className="input-group">
                        <label className="input-label" style={{ fontSize: "10px" }}>Desktop Columns</label>
                        <select
                          className="premium-input"
                          value={config.postFeed.desktopColumns}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            if (!isPaid && val > 4) {
                              shopify.toast.show("Unlock PRO to use more than 4 columns", { isError: true });
                              navigate("/app/plans");
                              return;
                            }
                            updateConfig("postFeed", "desktopColumns", val);
                          }}
                        >
                          {[3, 4, 5, 6].map((n) => (
                            <option key={n} value={n}>
                              {n} Columns {!isPaid && n > 4 ? " (PRO)" : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="input-group">
                        <label className="input-label" style={{ fontSize: "10px" }}>Mobile Columns</label>
                        <select
                          className="premium-input"
                          value={config.postFeed.mobileColumns}
                          onChange={(e) => updateConfig("postFeed", "mobileColumns", parseInt(e.target.value))}
                        >
                          {[1, 2, 3].map((n) => <option key={n} value={n}>{n} Columns</option>)}
                        </select>
                      </div>
                    </div>

                    {!config.postFeed.load && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
                        <div className="input-group">
                          <label className="input-label" style={{ fontSize: "10px" }}>Total Posts (Desktop)</label>
                          <select
                            className="premium-input"
                            value={config.postFeed.desktopLimit || 8}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              if (!isPaid && val > 12) {
                                shopify.toast.show("Unlock PRO to show more than 12 posts", { isError: true });
                                navigate("/app/plans");
                                return;
                              }
                              updateConfig("postFeed", "desktopLimit", val);
                            }}
                          >
                            {[4, 6, 8, 12, 16, 20, 24].map((n) => (
                              <option key={n} value={n}>
                                {n} Posts {!isPaid && n > 12 ? " (PRO)" : ""}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="input-group">
                          <label className="input-label" style={{ fontSize: "10px" }}>Total Posts (Mobile)</label>
                          <select
                            className="premium-input"
                            value={config.postFeed.mobileLimit || 4}
                            onChange={(e) => updateConfig("postFeed", "mobileLimit", parseInt(e.target.value))}
                          >
                            {[3, 4, 6, 8, 12].map((n) => <option key={n} value={n}>{n} Posts</option>)}
                          </select>
                        </div>
                      </div>
                    )}
                    <div className="input-group">
                      <label className="input-label" style={{ fontSize: "10px" }}>Visual Gap ({config.postFeed.gap}px)</label>
                      <input
                        type="range"
                        min="0" max="40"
                        value={config.postFeed.gap}
                        onChange={(e) => updateConfig("postFeed", "gap", parseInt(e.target.value))}
                        className="premium-input"
                      />
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginTop: "16px" }}>
                      <div className="input-group">
                        <label className="input-label" style={{ fontSize: "10px" }}>Top Padding ({config.postFeed.paddingTop}px)</label>
                        <input
                          type="range"
                          min="0" max="100"
                          value={config.postFeed.paddingTop}
                          onChange={(e) => updateConfig("postFeed", "paddingTop", parseInt(e.target.value))}
                          className="premium-input"
                        />
                      </div>
                      <div className="input-group">
                        <label className="input-label" style={{ fontSize: "10px" }}>Bottom Padding ({config.postFeed.paddingBottom}px)</label>
                        <input
                          type="range"
                          min="0" max="100"
                          value={config.postFeed.paddingBottom}
                          onChange={(e) => updateConfig("postFeed", "paddingBottom", parseInt(e.target.value))}
                          className="premium-input"
                        />
                      </div>
                    </div>
                    
                    <div className="input-group" style={{ marginTop: "16px" }}>
                      <label className="input-label" style={{ fontSize: "10px" }}>Image Sizing (Aspect Ratio)</label>
                      <select
                        className="premium-input"
                        value={config.postFeed.aspectRatio || "auto"}
                        onChange={(e) => updateConfig("postFeed", "aspectRatio", e.target.value)}
                      >
                        <option value="auto">Auto (Original)</option>
                        <option value="1/1">1:1 (Square)</option>
                        <option value="3/4">3:4 (Portrait)</option>
                        <option value="3/2">3:2 (Landscape)</option>
                        <option value="9/16">9:16 (Story)</option>
                      </select>
                    </div>


                  </div>


                    <div className="config-visual-card">
                      <div className="input-group-header">
                        <Icon source={ColorIcon} tone="base" />
                        <h4>Branding & Typography</h4>
                      </div>

                      <div style={{ marginBottom: "24px" }}>
                        <label className="input-label">Layout Alignment</label>
                        <select className="premium-input" value={config.postFeed.alignment} onChange={(e) => updateConfig("postFeed", "alignment", e.target.value)} style={{ background: "#f8fafc" }}>
                          <option value="left">Left Aligned</option>
                          <option value="center">Centered</option>
                          <option value="right">Right Aligned</option>
                        </select>
                      </div>

                      <div style={{ marginBottom: "16px" }}>
                        <label className="input-label">Feed Heading</label>
                        <input className="premium-input" value={config.postFeed.heading} onChange={(e) => updateConfig("postFeed", "heading", e.target.value)} style={{ background: "#f8fafc" }} placeholder="e.g. SHOP OUR INSTAGRAM" />
                        
                        <div className="typography-grid">
                          <div>
                            <label className="input-label" style={{ fontSize: "9px" }}>Size (px)</label>
                            <input type="number" className="premium-input" value={config.postFeed.typography.heading.size}
                              onChange={(e) => updateConfig("postFeed", "typography", { ...config.postFeed.typography, heading: { ...config.postFeed.typography.heading, size: parseInt(e.target.value) } })} />
                          </div>
                          <div>
                            <label className="input-label" style={{ fontSize: "9px" }}>Weight</label>
                            <select className="premium-input" value={config.postFeed.typography.heading.weight}
                              onChange={(e) => updateConfig("postFeed", "typography", { ...config.postFeed.typography, heading: { ...config.postFeed.typography.heading, weight: e.target.value } })}>
                              <option value="400">Normal</option>
                              <option value="600">Semi-Bold</option>
                              <option value="800">Extra-Bold</option>
                            </select>
                          </div>
                          <div>
                            <label className="input-label" style={{ fontSize: "9px" }}>Color</label>
                            <input type="color" className="premium-input" value={config.postFeed.typography.heading.color}
                              onChange={(e) => updateConfig("postFeed", "typography", { ...config.postFeed.typography, heading: { ...config.postFeed.typography.heading, color: e.target.value } })} />
                          </div>
                        </div>
                      </div>

                      <div style={{ marginTop: "24px" }}>
                        <label className="input-label">Subheading Text</label>
                        <input className="premium-input" value={config.postFeed.subheading} onChange={(e) => updateConfig("postFeed", "subheading", e.target.value)} style={{ background: "#f8fafc" }} placeholder="e.g. Tag us to get featured!" />
                        
                        <div className="typography-grid">
                          <div>
                            <label className="input-label" style={{ fontSize: "9px" }}>Size (px)</label>
                            <input type="number" className="premium-input" value={config.postFeed.typography.subheading.size}
                              onChange={(e) => updateConfig("postFeed", "typography", { ...config.postFeed.typography, subheading: { ...config.postFeed.typography.subheading, size: parseInt(e.target.value) } })} />
                          </div>
                          <div>
                            <label className="input-label" style={{ fontSize: "9px" }}>Weight</label>
                            <select className="premium-input" value={config.postFeed.typography.subheading.weight}
                              onChange={(e) => updateConfig("postFeed", "typography", { ...config.postFeed.typography, subheading: { ...config.postFeed.typography.subheading, weight: e.target.value } })}>
                              <option value="400">Normal</option>
                              <option value="500">Medium</option>
                              <option value="700">Bold</option>
                            </select>
                          </div>
                          <div>
                            <label className="input-label" style={{ fontSize: "9px" }}>Color</label>
                            <input type="color" className="premium-input" value={config.postFeed.typography.subheading.color}
                              onChange={(e) => updateConfig("postFeed", "typography", { ...config.postFeed.typography, subheading: { ...config.postFeed.typography.subheading, color: e.target.value } })} />
                          </div>
                        </div>
                      </div>
                    </div>
                </>
              ) : (
                /* ── Story & Layouts Settings ── */
                <>
                  <h3 className="input-label" style={{ marginBottom: "12px" }}>Highlight Modules</h3>
                  <div style={{ marginBottom: "32px" }}>
                    {[
                      { id: "enable",     label: "Active Stories",    sub: "Render top highlight-bar",  icon: StarIcon },
                      { id: "carousel",   label: "Snap Scrolling",    sub: "Touch-optimized motion",    icon: MagicIcon },
                      { id: "autoplay",   label: "Auto Play Stories", sub: "Animate top highlights",    icon: PlayIcon },
                      { id: "animateImages", label: "Animate Images", sub: "Subtle zoom effect on photos", icon: MagicIcon },
                      { id: "activeRing", label: "Moving Story Ring", sub: "Rotating dashed border effect", icon: RefreshIcon },
                      { id: "showNavigation", label: "Story Navigation Arrows", sub: "Show/Hide prev/next buttons", icon: ChevronRightIcon },
                      { id: "showHeader", label: "Display Branding",  sub: "Show/Hide story title",     icon: MegaphoneIcon },
                    ].map((item, idx) => (
                      <div key={item.id} className="setting-row" style={{ animation: `slideInUp 0.3s ease-out ${idx * 0.05}s both` }}>
                        <div className="setting-info">
                          <div className="setting-icon"><Icon source={item.icon} color="inherit" /></div>
                          <div>
                            <div style={{ fontSize: "14px", fontWeight: "600" }}>{item.label}</div>
                            <div style={{ fontSize: "12px", color: "#9ca3af" }}>{item.sub}</div>
                          </div>
                        </div>
                        <label className="premium-switch">
                          <input
                            type="checkbox"
                            checked={config.stories[item.id]}
                            onChange={(e) => updateConfig("stories", item.id, e.target.checked)}
                          />
                          <span className="slider" />
                        </label>
                      </div>
                    ))}

                    {/* ── Active Ring Color Picker ── */}
                    {config.stories.activeRing && (
                      <div className="setting-row" style={{ animation: "slideInUp 0.3s ease-out 0.25s both", background: "#f8fafc", marginTop: "12px" }}>
                        <div className="setting-info">
                          <div className="setting-icon"><Icon source={ColorIcon} color="inherit" /></div>
                          <div>
                            <p style={{ fontWeight: 600, fontSize: "14px" }}>Ring Color</p>
                            <p style={{ fontSize: "12px", color: "#64748b" }}>Choose the color of the moving ring</p>
                          </div>
                        </div>
                        <input 
                          type="color" 
                          value={config.stories.ringColor || "#6366f1"} 
                          onChange={(e) => updateConfig("stories", "ringColor", e.target.value)}
                          style={{ width: "40px", height: "40px", border: "none", borderRadius: "10px", cursor: "pointer", background: "none", padding: 0 }}
                        />
                      </div>
                    )}
                  </div>

                  <div className="visual-architecture" style={{ marginTop: "32px", animation: "slideInUp 0.3s ease-out 0.2s both" }}>

                    <div className="config-visual-card">
                      <div className="input-group-header">
                        <Icon source={ColorIcon} tone="base" />
                        <h4>Branding & Typography</h4>
                      </div>

                      <div style={{ marginBottom: "24px" }}>
                        <label className="input-label">Layout Alignment</label>
                        <select className="premium-input" value={config.stories.alignment} onChange={(e) => updateConfig("stories", "alignment", e.target.value)} style={{ background: "#f8fafc" }}>
                          <option value="left">Left Aligned</option>
                          <option value="center">Centered</option>
                          <option value="right">Right Aligned</option>
                        </select>
                      </div>

                      <div style={{ marginBottom: "16px" }}>
                        <label className="input-label">Story Heading</label>
                        <input className="premium-input" value={config.stories.heading} onChange={(e) => updateConfig("stories", "heading", e.target.value)} style={{ background: "#f8fafc" }} placeholder="e.g. SHOP OUR INSTAGRAM" />
                        
                        <div className="typography-grid">
                          <div>
                            <label className="input-label" style={{ fontSize: "9px" }}>Size (px)</label>
                            <input type="number" className="premium-input" value={config.stories.typography.heading.size}
                              onChange={(e) => updateConfig("stories", "typography", { ...config.stories.typography, heading: { ...config.stories.typography.heading, size: parseInt(e.target.value) } })} />
                          </div>
                          <div>
                            <label className="input-label" style={{ fontSize: "9px" }}>Weight</label>
                            <select className="premium-input" value={config.stories.typography.heading.weight}
                              onChange={(e) => updateConfig("stories", "typography", { ...config.stories.typography, heading: { ...config.stories.typography.heading, weight: e.target.value } })}>
                              <option value="400">Normal</option>
                              <option value="600">Semi-Bold</option>
                              <option value="800">Extra-Bold</option>
                            </select>
                          </div>
                          <div>
                            <label className="input-label" style={{ fontSize: "9px" }}>Color</label>
                            <input type="color" className="premium-input" value={config.stories.typography.heading.color}
                              onChange={(e) => updateConfig("stories", "typography", { ...config.stories.typography, heading: { ...config.stories.typography.heading, color: e.target.value } })} />
                          </div>
                        </div>
                      </div>

                      <div style={{ marginTop: "24px" }}>
                        <label className="input-label">Story Subtext</label>
                        <input className="premium-input" value={config.stories.subheading} onChange={(e) => updateConfig("stories", "subheading", e.target.value)} style={{ background: "#f8fafc" }} placeholder="e.g. Tag us to get featured!" />
                        
                        <div className="typography-grid">
                          <div>
                            <label className="input-label" style={{ fontSize: "9px" }}>Size (px)</label>
                            <input type="number" className="premium-input" value={config.stories.typography.subheading.size}
                              onChange={(e) => updateConfig("stories", "typography", { ...config.stories.typography, subheading: { ...config.stories.typography.subheading, size: parseInt(e.target.value) } })} />
                          </div>
                          <div>
                            <label className="input-label" style={{ fontSize: "9px" }}>Weight</label>
                            <select className="premium-input" value={config.stories.typography.subheading.weight}
                              onChange={(e) => updateConfig("stories", "typography", { ...config.stories.typography, subheading: { ...config.stories.typography.subheading, weight: e.target.value } })}>
                              <option value="400">Normal</option>
                              <option value="500">Medium</option>
                              <option value="700">Bold</option>
                            </select>
                          </div>
                          <div>
                            <label className="input-label" style={{ fontSize: "9px" }}>Color</label>
                            <input type="color" className="premium-input" value={config.stories.typography.subheading.color}
                              onChange={(e) => updateConfig("stories", "typography", { ...config.stories.typography, subheading: { ...config.stories.typography.subheading, color: e.target.value } })} />
                          </div>
                        </div>
                      </div>
                    <div className="input-group" style={{ marginTop: "20px" }}>
                      <label className="input-label" style={{ fontSize: "10px" }}>Vertical Spacing (Top: {config.stories.paddingTop}px, Bottom: {config.stories.paddingBottom}px)</label>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                        <input
                          type="range"
                          min="0" max="100"
                          value={config.stories.paddingTop}
                          onChange={(e) => updateConfig("stories", "paddingTop", parseInt(e.target.value))}
                          className="premium-input"
                          title="Top Padding"
                        />
                        <input
                          type="range"
                          min="0" max="100"
                          value={config.stories.paddingBottom}
                          onChange={(e) => updateConfig("stories", "paddingBottom", parseInt(e.target.value))}
                          className="premium-input"
                          title="Bottom Padding"
                        />
                      </div>
                    </div>
                    </div>
                    </div>
                </>
              )}
            </div>

            {/* Bottom Apply / Discard */}
            {hasChanges && (
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "32px", borderTop: "1px solid #f1f5f9", paddingTop: "24px", animation: "slideInUp 0.3s ease-out" }}>
                <button className="premium-button" style={{ color: "#64748b", background: "transparent" }} onClick={discardChanges}>Discard Changes</button>
                <button className="premium-button button-success" style={{ minWidth: "160px" }} onClick={applyChanges}>Apply Configuration</button>
              </div>
            )}
          </div>

          {/* ── RIGHT: Preview Panel ── */}
          <div style={{ position: "sticky", top: "24px" }}>
            <div className="premium-card" style={{ padding: "24px", background: "#f8fafc" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                <h2 style={{ margin: 0, fontSize: "14px", fontWeight: "700", color: "#64748b" }}>LIVE RENDERING</h2>
                <div style={{ display: "flex", gap: "6px", background: "white", padding: "4px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                  <button
                    onClick={() => setPreviewDevice("mobile")}
                    className="premium-button"
                    style={{ padding: "8px 12px", borderRadius: "8px", background: previewDevice === "mobile" ? "var(--premium-accent)" : "transparent", color: previewDevice === "mobile" ? "white" : "#64748b", minHeight: "unset", transition: "all 0.2s" }}
                  ><Icon source={MobileIcon} tone="inherit" /></button>
                  <button
                    onClick={() => setPreviewDevice("desktop")}
                    className="premium-button"
                    style={{ padding: "8px 12px", borderRadius: "8px", background: previewDevice === "desktop" ? "var(--premium-accent)" : "transparent", color: previewDevice === "desktop" ? "white" : "#64748b", minHeight: "unset", transition: "all 0.2s" }}
                  ><Icon source={DesktopIcon} tone="inherit" /></button>
                </div>
              </div>

              <div className="preview-container" style={{ background: "transparent", border: "none", padding: "0", display: "flex", flexDirection: "column", justifyContent: "flex-start", alignItems: "center", minHeight: previewDevice === "mobile" ? "580px" : "auto" }}>
                {/* Sync overlay — uses absolute inside preview-container (position:relative) */}
                {isSyncing && (
                  <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.82)", zIndex: 100, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)", borderRadius: "16px", animation: "fadeInBlur 0.3s ease" }}>
                    <div style={{ width: "40px", height: "40px", border: "4px solid #e2e8f0", borderTop: `4px solid var(--premium-accent)`, borderRadius: "50%", animation: "spin 0.8s linear infinite", marginBottom: "16px" }} />
                    <span style={{ fontWeight: "700", color: "#0f172a" }}>Syncing Live Data…</span>
                  </div>
                )}

                {/* ── Mobile Device Frame ── */}
                {previewDevice === "mobile" ? (
                  <div style={{ animation: "fadeInBlur 0.4s ease-out", display: "flex", justifyContent: "center", width: "100%" }}>
                    <div style={{ width: "280px", height: "580px", background: "white", borderRadius: "44px", border: "12px solid #1e293b", boxShadow: "0 35px 60px -15px rgba(0,0,0,0.3)", position: "relative", overflow: "hidden", flexShrink: 0 }}>
                      {/* Status bar */}
                      <div style={{ height: "40px", padding: "14px 20px 0", display: "flex", justifyContent: "space-between", fontSize: "10px", fontWeight: "700", background: "white" }}>
                        <span>9:41</span>
                        <div style={{ display: "flex", gap: "4px" }}>📶 🔋</div>
                      </div>

                      {/* Scrollable content */}
                      <div
                        style={{ height: "calc(100% - 40px)", overflowY: "auto", paddingBottom: "20px" }}
                        onScroll={(e) => handleScroll(e, "vertical")}
                      >
                        {activeTab === "post" ? (
                          <div style={{ animation: "fadeInBlur 0.4s ease-out", paddingTop: `${config.postFeed.paddingTop}px`, paddingBottom: `${config.postFeed.paddingBottom}px` }}>
                            {/* Header */}
                            {config.postFeed.header && (
                              <div style={{ padding: "12px 16px 0", textAlign: config.postFeed.alignment }}>
                                <h4 style={{ fontSize: `${config.postFeed.typography.heading.size}px`, fontWeight: config.postFeed.typography.heading.weight, color: config.postFeed.typography.heading.color, margin: "0 0 4px 0" }}>
                                  {config.postFeed.heading}
                                </h4>
                                <p style={{ fontSize: `${config.postFeed.typography.subheading.size}px`, fontWeight: config.postFeed.typography.subheading.weight, color: config.postFeed.typography.subheading.color, margin: 0 }}>
                                  {config.postFeed.subheading}
                                </p>
                              </div>
                            )}

                            {/* Carousel or Grid */}
                            {config.postFeed.carousel ? (
                              <div className="carousel-wrapper" style={{ padding: `${config.postFeed.gap}px 0`, position: "relative", width: "100%" }}>
                                <button className="carousel-nav prev" onClick={() => scrollCarousel(mobileCarouselRef, "prev")} style={{ width: "26px", height: "26px", left: "4px" }}>
                                  <Icon source={ChevronLeftIcon} />
                                </button>
                                <div
                                  className="carousel-container"
                                  ref={mobileCarouselRef}
                                  style={{ padding: `0 ${config.postFeed.gap}px`, "--carousel-gap": `${config.postFeed.gap}px`, "--carousel-item-width": `calc((100% - ${(config.postFeed.mobileColumns - 1) * config.postFeed.gap}px) / ${config.postFeed.mobileColumns})` }}
                                  onScroll={(e) => handleScroll(e, "horizontal")}
                                >
                                  {simulatedInfiniteMedia.map((item, i) => renderCarouselCard(item, i))}
                                </div>
                                <button className="carousel-nav next" onClick={() => scrollCarousel(mobileCarouselRef, "next")} style={{ width: "26px", height: "26px", right: "4px" }}>
                                  <Icon source={ChevronRightIcon} />
                                </button>
                              </div>
                            ) : (
                              <div style={{ padding: `${config.postFeed.gap}px`, display: "grid", gridTemplateColumns: `repeat(${config.postFeed.mobileColumns}, 1fr)`, gap: `${config.postFeed.gap}px` }}>
                                {simulatedInfiniteMedia.map((item, i) => renderMediaCard(item, i))}
                              </div>
                            )}

                            {config.postFeed.load && isInfiniteLoading && (
                              <div style={{ padding: "20px", display: "flex", justifyContent: "center", animation: "fadeInBlur 0.3s ease" }}>
                                <div style={{ width: "20px", height: "20px", border: "2px solid #e2e8f0", borderTop: "2px solid var(--premium-accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                              </div>
                            )}

                            {!config.postFeed.removeWatermark && (
                              <div style={{ textAlign: "center", padding: "12px", fontSize: "10px", color: "#9ca3af" }}>
                                Powered by <a href="https://www.booststar.in/" target="_blank" rel="noopener noreferrer" style={{ fontWeight: "700", color: "#64748b", textDecoration: "none" }}>BOOST STAR Experts</a>
                              </div>
                            )}
                          </div>
                        ) : (
                          /* Story preview – mobile */
                          <div style={{ padding: "16px", paddingTop: `${config.stories.paddingTop}px`, paddingBottom: `${config.stories.paddingBottom}px` }}>
                            {config.stories.showHeader && (
                              <div style={{ textAlign: config.stories.alignment, marginBottom: "24px" }}>
                                <h4 style={{ fontSize: `${Math.min(config.stories.typography.heading.size, 22)}px`, fontWeight: config.stories.typography.heading.weight, margin: "0 0 6px 0", lineHeight: 1.2, color: config.stories.typography.heading.color }}>
                                  {config.stories.heading}
                                </h4>
                                <p style={{ fontSize: `${config.stories.typography.subheading.size}px`, color: config.stories.typography.subheading.color, fontWeight: config.stories.typography.subheading.weight, margin: 0 }}>
                                  {config.stories.subheading}
                                </p>
                              </div>
                            )}
                            {config.stories.enable && (
                              <div className="carousel-wrapper hover-buttons" style={{ position: "relative" }}>
                                {config.stories.showNavigation && (
                                  <button className="carousel-nav prev" onClick={() => scrollCarousel(mobileStoryRef, "prev")} style={{ width: "22px", height: "22px", left: "-6px", top: "28px", transform: "translateY(-50%)" }}>
                                    <Icon source={ChevronLeftIcon} />
                                  </button>
                                )}
                                <div className="carousel-container" ref={mobileStoryRef} style={{ gap: "12px", padding: "0 4px 10px" }}>
                                  {(instaData?.media?.data || baseMedia).slice(0, 12).map((item, i) => (
                                    <div key={i} style={{ flexShrink: 0, width: "60px", textAlign: "center" }}>
                                      <div style={{ width: "56px", height: "56px", borderRadius: "50%", padding: "2px", border: config.stories.activeRing ? "none" : "2px solid var(--premium-accent)", background: "white", overflow: "hidden", margin: "0 auto", position: "relative" }}>
                                        {config.stories.activeRing && (
                                          <div className="ai-story-ring" style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "2.5px dashed " + (config.stories.ringColor || "var(--premium-accent)"), animation: "rotateRing 10s linear infinite" }} />
                                        )}
                                        <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: "#f1f5f9", overflow: "hidden", position: "relative", zIndex: 1 }}>
                                          {(item.media_url || item.thumbnail_url) && (
                                            item.media_type === "VIDEO" && config.stories.autoplay ? (
                                              <video src={item.media_url} autoPlay muted loop playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                            ) : (
                                              <img 
                                                loading="lazy" 
                                                src={item.media_type === "VIDEO" ? (item.thumbnail_url || item.media_url) : item.media_url} 
                                                className={config.stories.animateImages ? "ai-ken-burns" : ""}
                                                style={{ width: "100%", height: "100%", objectFit: "cover" }} 
                                                alt="story" 
                                              />
                                            )
                                          )}
                                        </div>
                                      </div>
                                      <div style={{ fontSize: "9px", marginTop: "4px", color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {item.caption ? item.caption.split(" ")[0] : `Story ${i + 1}`}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                {config.stories.showNavigation && (
                                  <button className="carousel-nav next" onClick={() => scrollCarousel(mobileStoryRef, "next")} style={{ width: "22px", height: "22px", right: "-6px", top: "28px", transform: "translateY(-50%)" }}>
                                    <Icon source={ChevronRightIcon} />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ── Desktop Device Frame ── */
                  <div style={{ animation: "fadeInBlur 0.4s ease-out", width: "100%", marginTop: "0" }}>
                    <div style={{ width: "100%", maxWidth: "680px", margin: "0 auto" }}>
                      {/* Browser Frame */}
                      <div style={{ width: "100%", background: "#e2e8f0", borderRadius: "12px 12px 0 0", padding: "8px 12px", display: "flex", alignItems: "center", gap: "12px", border: "1px solid #cbd5e1", borderBottom: "none" }}>
                         <div style={{ display: "flex", gap: "6px" }}>
                           <div style={{ width: "10px", height: "10px", background: "#f87171", borderRadius: "50%" }} />
                           <div style={{ width: "10px", height: "10px", background: "#fbbf24", borderRadius: "50%" }} />
                           <div style={{ width: "10px", height: "10px", background: "#34d399", borderRadius: "50%" }} />
                         </div>
                         <div style={{ height: "24px", width: "120px", background: "white", borderRadius: "6px 6px 0 0", padding: "0 10px", display: "flex", alignItems: "center", fontSize: "10px", fontWeight: "600", color: "#64748b", border: "1px solid #cbd5e1", borderBottom: "none", position: "relative", top: "8px" }}>
                           Your Feed
                         </div>
                      </div>
                      <div style={{ width: "100%", background: "#f8fafc", padding: "10px 16px", display: "flex", alignItems: "center", gap: "12px", border: "1px solid #cbd5e1" }}>
                         <div style={{ display: "flex", gap: "10px", fontSize: "12px", color: "#94a3b8" }}>
                           <span>←</span> <span>→</span> <span>↻</span>
                         </div>
                         <div style={{ flex: 1, height: "28px", background: "white", borderRadius: "14px", border: "1px solid #e2e8f0", padding: "0 12px", display: "flex", alignItems: "center", gap: "6px" }}>
                           <span style={{ fontSize: "10px" }}>🔒</span>
                           <span style={{ fontSize: "11px", color: "#64748b" }}>your-store.myshopify.com</span>
                         </div>
                         <div style={{ fontSize: "12px", color: "#94a3b8" }}>≡</div>
                      </div>
                      <div style={{ width: "100%", aspectRatio: "1.6/1", background: "white", border: "1px solid #cbd5e1", borderTop: "none", borderRadius: "0 0 12px 12px", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.15)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
                        <div style={{ height: "100%", overflowY: "auto", padding: "24px" }} onScroll={(e) => handleScroll(e, "vertical")}>
                            {activeTab === "story" ? (
                              /* Story desktop preview */
                              <div style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", paddingTop: `${config.stories.paddingTop}px`, paddingBottom: `${config.stories.paddingBottom}px` }}>
                                {config.stories.showHeader && (
                                  <div style={{ textAlign: config.stories.alignment, marginBottom: "24px" }}>
                                    <h4 style={{ fontSize: `${config.stories.typography.heading.size}px`, fontWeight: config.stories.typography.heading.weight, margin: "0 0 8px 0", color: config.stories.typography.heading.color }}>
                                      {config.stories.heading}
                                    </h4>
                                    <p style={{ fontSize: `${config.stories.typography.subheading.size}px`, color: config.stories.typography.subheading.color, fontWeight: config.stories.typography.subheading.weight, margin: config.stories.alignment === "center" ? "0 auto" : config.stories.alignment === "right" ? "0 0 0 auto" : "0" }}>
                                      {config.stories.subheading}
                                    </p>
                                  </div>
                                )}
                                {config.stories.enable && (
                                  <div className="carousel-wrapper hover-buttons" style={{ position: "relative", padding: "0 24px" }}>
                                    {config.stories.showNavigation && (
                                      <button className="carousel-nav prev" onClick={() => scrollCarousel(desktopStoryRef, "prev")} style={{ width: "28px", height: "28px", left: "0px", top: "32px", transform: "translateY(-50%)" }}>
                                        <Icon source={ChevronLeftIcon} />
                                      </button>
                                    )}
                                    <div className="carousel-container" ref={desktopStoryRef} style={{ justifyContent: "flex-start", gap: "16px", padding: "8px 4px 12px" }}>
                                      {(instaData?.media?.data || baseMedia).slice(0, 8).map((item, i) => (
                                        <div key={i} style={{ textAlign: "center", width: "72px", flexShrink: 0 }}>
                                          <div style={{ width: "64px", height: "64px", borderRadius: "50%", padding: "3px", border: config.stories.activeRing ? "none" : "2px solid var(--premium-accent)", background: "white", marginBottom: "6px", overflow: "hidden", margin: "0 auto 6px", position: "relative" }}>
                                            {config.stories.activeRing && (
                                              <div className="ai-story-ring" style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "3px dashed " + (config.stories.ringColor || "var(--premium-accent)"), animation: "rotateRing 10s linear infinite" }} />
                                            )}
                                            <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: "#f1f5f9", overflow: "hidden", position: "relative", zIndex: 1 }}>
                                              {(item.media_url || item.thumbnail_url) && (
                                                item.media_type === "VIDEO" && config.stories.autoplay ? (
                                                  <video src={item.media_url} autoPlay muted loop playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                                ) : (
                                                  <img 
                                                    loading="lazy" 
                                                    src={item.media_type === "VIDEO" ? (item.thumbnail_url || item.media_url) : item.media_url} 
                                                    className={config.stories.animateImages ? "ai-ken-burns" : ""}
                                                    style={{ width: "100%", height: "100%", objectFit: "cover" }} 
                                                    alt="story" 
                                                  />
                                                )
                                              )}
                                            </div>
                                          </div>
                                          <div style={{ fontSize: "10px", color: "#64748b", fontWeight: "600", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                            {item.caption ? item.caption.split(" ")[0] : `Story ${i + 1}`}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                    {config.stories.showNavigation && (
                                      <button className="carousel-nav next" onClick={() => scrollCarousel(desktopStoryRef, "next")} style={{ width: "28px", height: "28px", right: "0px", top: "32px", transform: "translateY(-50%)" }}>
                                        <Icon source={ChevronRightIcon} />
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            ) : (
                              /* Feed Grid desktop preview */
                              <div style={{ paddingTop: `${config.postFeed.paddingTop}px`, paddingBottom: `${config.postFeed.paddingBottom}px` }}>
                                {config.postFeed.header && (
                                  <div style={{ marginBottom: "16px", textAlign: config.postFeed.alignment }}>
                                    <h4 style={{ fontSize: `${config.postFeed.typography.heading.size + 2}px`, fontWeight: config.postFeed.typography.heading.weight, color: config.postFeed.typography.heading.color, margin: "0 0 4px 0" }}>
                                      {config.postFeed.heading}
                                    </h4>
                                    <p style={{ fontSize: `${config.postFeed.typography.subheading.size + 1}px`, color: config.postFeed.typography.subheading.color, fontWeight: config.postFeed.typography.subheading.weight, margin: 0 }}>
                                      {config.postFeed.subheading}
                                    </p>
                                  </div>
                                )}

                                {config.postFeed.carousel ? (
                                  <div className="carousel-wrapper">
                                    <button className="carousel-nav prev" onClick={() => scrollCarousel(desktopCarouselRef, "prev")}>
                                      <Icon source={ChevronLeftIcon} />
                                    </button>
                                    <div
                                      className="carousel-container"
                                      ref={desktopCarouselRef}
                                      style={{ "--carousel-gap": `${config.postFeed.gap}px`, "--carousel-item-width": `calc((100% - ${(config.postFeed.desktopColumns - 1) * config.postFeed.gap}px) / ${config.postFeed.desktopColumns})` }}
                                      onScroll={(e) => handleScroll(e, "horizontal")}
                                    >
                                      {simulatedInfiniteMedia.map((item, i) => renderCarouselCard(item, i, true))}
                                    </div>
                                    <button className="carousel-nav next" onClick={() => scrollCarousel(desktopCarouselRef, "next")}>
                                      <Icon source={ChevronRightIcon} />
                                    </button>
                                  </div>
                                ) : (
                                  <div style={{ display: "grid", gridTemplateColumns: `repeat(${config.postFeed.desktopColumns}, 1fr)`, gap: `${config.postFeed.gap}px` }}>
                                    {simulatedInfiniteMedia.map((item, i) => renderMediaCard(item, i, true))}
                                  </div>
                                )}

                                {config.postFeed.load && isInfiniteLoading && (
                                  <div style={{ padding: "24px", display: "flex", justifyContent: "center" }}>
                                    <div style={{ width: "22px", height: "22px", border: "3px solid #e2e8f0", borderTop: "3px solid var(--premium-accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                                  </div>
                                )}

                                {!config.postFeed.removeWatermark && (
                                  <div style={{ textAlign: "center", padding: "16px", fontSize: "12px", color: "#9ca3af" }}>
                                    Powered by <a href="https://www.booststar.in/" target="_blank" rel="noopener noreferrer" style={{ fontWeight: "700", color: "#64748b", textDecoration: "none" }}>BOOST STAR Experts</a>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Premium Post Modal ── */}
      {selectedPost && (
        <div 
          className="premium-modal-overlay" 
          onClick={() => setSelectedPost(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.85)",
            backdropFilter: "blur(12px)",
            zIndex: 2000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            animation: "fadeInBlur 0.3s ease"
          }}
        >
          <div 
            className="premium-modal-content" 
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "white",
              width: "100%",
              maxWidth: "1000px",
              maxHeight: "90vh",
              borderRadius: "20px",
              display: "flex",
              overflow: "hidden",
              boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)",
              flexDirection: window.innerWidth < 768 ? "column" : "row"
            }}
          >
            {/* Left: Media Area */}
            <div style={{ flex: 1.2, background: "#000", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
              {selectedPost.media_type === "VIDEO" ? (
                <video src={selectedPost.media_url} autoPlay loop muted playsInline style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
              ) : (
                <img src={selectedPost.media_url} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} alt="Post" />
              )}
              <button 
                onClick={() => setSelectedPost(null)}
                style={{ position: "absolute", top: "16px", right: "16px", background: "white", border: "none", width: "32px", height: "32px", borderRadius: "50%", cursor: "pointer", fontWeight: "bold", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center" }}
              >✕</button>
            </div>

            {/* Right: Info Area */}
            <div style={{ flex: 0.8, display: "flex", flexDirection: "column", background: "white", padding: "24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px", borderBottom: "1px solid #f1f5f9", paddingBottom: "16px" }}>
                <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "var(--premium-accent-gradient)", display: "flex", alignItems: "center", justifyContent: "center", color: "white" }}>
                  <InstagramIcon />
                </div>
                <div>
                  <div style={{ fontWeight: "700", fontSize: "16px" }}>@{instaData?.username || config.instagramHandle}</div>
                  <div style={{ fontSize: "12px", color: "#64748b" }}>Instagram Business Discovery</div>
                </div>
                <button 
                  onClick={() => setSelectedPost(null)}
                  style={{ marginLeft: "auto", background: "#f8fafc", border: "1px solid #e2e8f0", padding: "8px", borderRadius: "8px", cursor: "pointer" }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"></path></svg>
                </button>
              </div>

              <div style={{ flex: 1, overflowY: "auto", marginBottom: "24px" }}>
                <p style={{ margin: 0, fontSize: "14px", lineHeight: "1.6", color: "#334155" }}>
                  {selectedPost.caption || "No caption provided for this post."}
                </p>
                <div style={{ marginTop: "16px", fontSize: "11px", color: "#94a3b8", fontWeight: "600" }}>
                  {selectedPost.timestamp ? new Date(selectedPost.timestamp).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "Recently Shared"}
                </div>
              </div>

              <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "20px" }}>
                <div style={{ display: "flex", gap: "24px", marginBottom: "20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <svg color="#ef4444" fill="#ef4444" width="22" height="22" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                    <span style={{ fontWeight: "700", fontSize: "18px" }}>{selectedPost.like_count || 0}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
                    <span style={{ fontWeight: "700", fontSize: "18px" }}>{selectedPost.comments_count || 0}</span>
                  </div>
                </div>
                <a 
                  href={selectedPost.permalink} 
                  target="_blank" 
                  rel="noreferrer"
                  className="premium-button button-accent"
                  style={{ width: "100%", textDecoration: "none" }}
                >
                  View on Instagram
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
