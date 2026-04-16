import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useFetcher, useLoaderData } from "react-router";
import {
  AppProvider as PolarisProvider,
  SkeletonPage,
  Layout,
  Card,
  SkeletonBodyText,
  SkeletonDisplayText,
  BlockStack,
} from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

// ─────────────────────────────────────────────────────────────────────────────
// LOADER
// ─────────────────────────────────────────────────────────────────────────────
export const loader = async ({ request }) => {
  const { authenticate } = await import("../shopify.server");
  const { fetchShopConfig, fetchShopInstaData } = await import("../instagramApi.server.js");
  const { withRateLimit, trackApiResponse } = await import("../rateLimiter.server.js");

  const { admin, session } = await authenticate.admin(request);
  const shop = session?.shop ?? "unknown";
  try {
    const config = await withRateLimit(shop, () => fetchShopConfig(admin, shop));
    const instaData = await fetchShopInstaData(admin, shop);
    trackApiResponse(shop, {});
    
    return { 
      config: config ? JSON.stringify(config) : null,
      instaData: instaData ? JSON.stringify(instaData) : null
    };
  } catch {
    return { config: null, instaData: null };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ACTION
// ─────────────────────────────────────────────────────────────────────────────
export const action = async ({ request }) => {
  const { authenticate } = await import("../shopify.server");
  const { fetchAllInstagramMedia, fetchShopInstaData } = await import("../instagramApi.server.js");
  const { invalidateResource } = await import("../cache.server.js");

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
  instagramHandle: "floorlanduk",
  postFeed: {
    header: true,
    metrics: true,
    load: true,
    carousel: true,
    autoplay: true,
    heading: "SHOP OUR INSTAGRAM",
    subheading: "Tag us @account to get featured in our gallery!",
    typography: {
      heading:    { size: 18, weight: "800", color: "#0f172a" },
      subheading: { size: 12, weight: "500", color: "#64748b" },
    },
    alignment: "left",
    desktopColumns: 4,
    mobileColumns: 2,
    gap: 16,
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
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function Index() {
  const shopify = useAppBridge();
  const fetcher = useFetcher();
  const loaderData = useLoaderData() || {};

  const [isHydrated, setIsHydrated] = useState(false);
  const [isAppBridgeReady, setIsAppBridgeReady] = useState(false);

  const [activeTab, setActiveTab] = useState("post");
  const [previewDevice, setPreviewDevice] = useState("mobile");

  const [instaData, setInstaData] = useState(null);
  const [isInfiniteLoading, setIsInfiniteLoading] = useState(false);
  const [visibleMediaCount, setVisibleMediaCount] = useState(12);

  const PLACEHOLDER_MEDIA = useMemo(() => [
    { media_url: "https://images.unsplash.com/photo-1611162147679-aa3c393bc3ec?w=400&h=400&fit=crop", media_type: "IMAGE", like_count: 120,  comments_count: 8  },
    { media_url: "https://images.unsplash.com/photo-1542435503-956c469947f6?w=400&h=400&fit=crop", media_type: "IMAGE", like_count: 85,   comments_count: 12 },
    { media_url: "https://images.unsplash.com/photo-1493723843671-1d655e8d717f?w=400&h=400&fit=crop", media_type: "IMAGE", like_count: 210, comments_count: 45 },
    { media_url: "https://images.unsplash.com/photo-1512314889357-e157c22f938d?w=400&h=400&fit=crop", media_type: "IMAGE", like_count: 110, comments_count: 15 },
    { media_url: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400&h=400&fit=crop", media_type: "IMAGE", like_count: 320, comments_count: 31 },
    { media_url: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=400&h=400&fit=crop", media_type: "IMAGE", like_count: 95,  comments_count: 3  },
  ], []);

  const baseMedia = useMemo(
    () => instaData?.media?.data || PLACEHOLDER_MEDIA,
    [instaData?.media?.data, PLACEHOLDER_MEDIA]
  );

  const hasMoreToShow = visibleMediaCount < baseMedia.length;

  const simulatedInfiniteMedia = useMemo(
    () => baseMedia.slice(0, visibleMediaCount),
    [baseMedia, visibleMediaCount]
  );

  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [lastSavedConfig, setLastSavedConfig] = useState(null);

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
          if (parsed.instagramHandle)
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
      // Show all fetched media right away
      setVisibleMediaCount(Math.min((media?.data?.length || 12), 24));

      setConfig((prev) => ({
        ...prev,
        instagramHandle: username,
        postFeed: {
          ...prev.postFeed,
          subheading: prev.postFeed.subheading.replace(/@[\w.]+/g, `@${username}`),
        },
        stories: {
          ...prev.stories,
          subheading: prev.stories.subheading.replace(/@[\w.]+/g, `@${username}`),
        },
      }));

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
    setLastFetchedHandle("");

    // Auto-save the cleared state to Shopify metafield
    const fd = new FormData();
    fd.append("intent", "saveConfig");
    fd.append("config", JSON.stringify(newConfig));
    fetcher.submit(fd, { method: "post" });

    shopify.toast.show("Instagram account disconnected successfully.");
  }, [config, fetcher, shopify]);

  // ── Config helpers ──
  const updateConfig = useCallback((section, key, value) => {
    setConfig((prev) => ({
      ...prev,
      [section]: { ...prev[section], [key]: value },
    }));
    if (key === "mobileColumns")  setPreviewDevice("mobile");
    if (key === "desktopColumns") setPreviewDevice("desktop");
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
    fetcher.submit(fd, { method: "post" });
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
    const threshold = 150;
    const nearEnd =
      orientation === "vertical"
        ? scrollHeight - scrollTop - clientHeight < threshold
        : scrollWidth - scrollLeft - clientWidth < threshold;

    if (nearEnd && hasMoreToShow) {
      setIsInfiniteLoading(true);
      // Reveal more already-stored posts – zero API calls
      setTimeout(() => {
        setVisibleMediaCount((prev) => Math.min(prev + (previewDevice === "mobile" ? 6 : 12), baseMedia.length));
        setIsInfiniteLoading(false);
      }, 400);
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
      <PolarisProvider i18n={enTranslations}>
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
      </PolarisProvider>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER HELPERS (media cards – keeps JSX DRY)
  // ─────────────────────────────────────────────────────────────────────────
  const renderMediaCard = (item, i, isDesktop = false) => (
    <div
      key={i}
      className="grid-item"
      style={{ aspectRatio: "1/1", background: "#f1f5f9", borderRadius: isDesktop ? "8px" : "4px", overflow: "hidden", position: "relative" }}
    >
      {item.media_type === "VIDEO" && config.postFeed.autoplay ? (
        <video src={item.media_url} autoPlay muted loop playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (item.media_url || item.thumbnail_url) ? (
        <img
          loading="lazy"
          src={item.media_type === "VIDEO" ? (item.thumbnail_url || item.media_url) : item.media_url}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          alt="Instagram post"
        />
      ) : null}
      {item.media_type === "VIDEO" && (
        <div style={{ position: "absolute", top: "4px", right: "4px", fontSize: "10px", background: "rgba(0,0,0,0.55)", color: "white", padding: "2px 5px", borderRadius: "4px" }}>
          📹
        </div>
      )}
      {config.postFeed.metrics && (
        <div className="media-metrics">
          <span>❤️ {item.like_count ?? "0"}</span>
          <span>💬 {item.comments_count ?? "0"}</span>
        </div>
      )}
    </div>
  );

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
            <span style={{ fontSize: "12px", color: "#6b7280" }}>V2.0 PRO</span>
          </div>
          <div className="status-badge" style={{ marginLeft: "16px" }}>
            <div className="status-dot" />
            System Online <span style={{ opacity: 0.6, marginLeft: "4px" }}>Active</span>
          </div>
        </div>
      </div>

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
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                  <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                  <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
                </svg>
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
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16">
                      <polyline points="23 4 23 10 17 10" />
                      <polyline points="1 20 1 14 7 14" />
                      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                    </svg>
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
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="18" height="18">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                    <span>Disconnect</span>
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="18" height="18">
                      <polyline points="23 4 23 10 17 10" />
                      <polyline points="1 20 1 14 7 14" />
                      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                    </svg>
                    <span>Connect & Sync All</span>
                  </>
                )}
              </button>
            </div>
          </div>
          {isConnected && instaData && (
            <div style={{ marginTop: "12px", padding: "8px 16px", background: "#f0fdf4", borderRadius: "10px", border: "1px solid #dcfce7", display: "flex", gap: "16px", flexWrap: "wrap", fontSize: "12px", color: "#166534" }}>
              <span>📦 <strong>{instaData.media?.data?.length || 0}</strong> posts stored</span>
              {instaData._totalPages && <span>📄 <strong>{instaData._totalPages}</strong> page{instaData._totalPages > 1 ? "s" : ""} crawled</span>}
              {instaData._crawledAt && <span>🕐 Last synced: <strong>{new Date(instaData._crawledAt).toLocaleString()}</strong></span>}
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
              <div className={`tab-item ${activeTab === "story" ? "active" : ""}`} onClick={() => setActiveTab("story")}>Story &amp; Layouts</div>
            </div>

            {/* Tab Content */}
            <div className="tab-content-container" key={activeTab} style={{ animation: "fadeInBlur 0.35s ease-out" }}>

              {/* ── Feed Grid Settings ── */}
              {activeTab === "post" ? (
                <>
                  <h3 className="input-label" style={{ marginBottom: "12px" }}>Dynamic Modules</h3>
                  {[
                    { id: "header",   label: "Profile Header",  sub: "Show store bio & icon",       icon: "👤" },
                    { id: "metrics",  label: "Engagement Hub",  sub: "Visualise social proof",       icon: "📊" },
                    { id: "load",     label: "Infinite Paging", sub: "Zero-latency scrolling",       icon: "🔄" },
                    { id: "carousel", label: "Smart Carousel",  sub: "Auto-swipe logic",             icon: "📱" },
                    { id: "autoplay", label: "Smart Autoplay",  sub: "Pre-load video content",       icon: "🎬" },
                  ].map((item, idx) => (
                    <div key={item.id} className="setting-row" style={{ animation: `slideInUp 0.3s ease-out ${idx * 0.05}s both` }}>
                      <div className="setting-info">
                        <div className="setting-icon">{item.icon}</div>
                        <div>
                          <div style={{ fontSize: "14px", fontWeight: "600" }}>{item.label}</div>
                          <div style={{ fontSize: "12px", color: "#9ca3af" }}>{item.sub}</div>
                        </div>
                      </div>
                      <label className="premium-switch">
                        <input
                          type="checkbox"
                          checked={config.postFeed[item.id]}
                          onChange={(e) => updateConfig("postFeed", item.id, e.target.checked)}
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
                          onChange={(e) => updateConfig("postFeed", "desktopColumns", parseInt(e.target.value))}
                        >
                          {[3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} Columns</option>)}
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
                  </div>

                  {/* Brand Customisation */}
                  <div style={{ marginTop: "32px", animation: "slideInUp 0.3s ease-out 0.2s both" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
                      <span style={{ fontSize: "16px" }}>🎨</span>
                      <h3 style={{ margin: 0, fontSize: "14px", fontWeight: "800", color: "#0f172a" }}>BRAND CUSTOMIZATION</h3>
                    </div>

                    <div className="setting-card">
                      <div>
                        <label className="input-label" style={{ fontSize: "10px", marginBottom: "4px" }}>Feed Heading</label>
                        <input className="premium-input" value={config.postFeed.heading} onChange={(e) => updateConfig("postFeed", "heading", e.target.value)} />
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginTop: "12px" }}>
                        <div>
                          <label className="input-label" style={{ fontSize: "10px", marginBottom: "4px" }}>Size</label>
                          <input type="number" className="premium-input" value={config.postFeed.typography.heading.size}
                            onChange={(e) => updateConfig("postFeed", "typography", { ...config.postFeed.typography, heading: { ...config.postFeed.typography.heading, size: parseInt(e.target.value) } })} />
                        </div>
                        <div>
                          <label className="input-label" style={{ fontSize: "10px", marginBottom: "4px" }}>Weight</label>
                          <select className="premium-input" value={config.postFeed.typography.heading.weight}
                            onChange={(e) => updateConfig("postFeed", "typography", { ...config.postFeed.typography, heading: { ...config.postFeed.typography.heading, weight: e.target.value } })}>
                            <option value="400">Normal</option>
                            <option value="600">Semi-Bold</option>
                            <option value="800">Extra-Bold</option>
                          </select>
                        </div>
                        <div>
                          <label className="input-label" style={{ fontSize: "10px", marginBottom: "4px" }}>Color</label>
                          <input type="color" className="premium-input" value={config.postFeed.typography.heading.color}
                            onChange={(e) => updateConfig("postFeed", "typography", { ...config.postFeed.typography, heading: { ...config.postFeed.typography.heading, color: e.target.value } })} />
                        </div>
                      </div>

                      <div style={{ marginTop: "20px" }}>
                        <label className="input-label" style={{ fontSize: "10px", marginBottom: "4px" }}>Subheading Text</label>
                        <input className="premium-input" value={config.postFeed.subheading} onChange={(e) => updateConfig("postFeed", "subheading", e.target.value)} />
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginTop: "12px" }}>
                        <div>
                          <label className="input-label" style={{ fontSize: "10px", marginBottom: "4px" }}>Size</label>
                          <input type="number" className="premium-input" value={config.postFeed.typography.subheading.size}
                            onChange={(e) => updateConfig("postFeed", "typography", { ...config.postFeed.typography, subheading: { ...config.postFeed.typography.subheading, size: parseInt(e.target.value) } })} />
                        </div>
                        <div>
                          <label className="input-label" style={{ fontSize: "10px", marginBottom: "4px" }}>Weight</label>
                          <select className="premium-input" value={config.postFeed.typography.subheading.weight}
                            onChange={(e) => updateConfig("postFeed", "typography", { ...config.postFeed.typography, subheading: { ...config.postFeed.typography.subheading, weight: e.target.value } })}>
                            <option value="400">Normal</option>
                            <option value="500">Medium</option>
                            <option value="700">Bold</option>
                          </select>
                        </div>
                        <div>
                          <label className="input-label" style={{ fontSize: "10px", marginBottom: "4px" }}>Color</label>
                          <input type="color" className="premium-input" value={config.postFeed.typography.subheading.color}
                            onChange={(e) => updateConfig("postFeed", "typography", { ...config.postFeed.typography, subheading: { ...config.postFeed.typography.subheading, color: e.target.value } })} />
                        </div>
                      </div>

                      <div style={{ marginTop: "20px" }}>
                        <label className="input-label" style={{ fontSize: "10px", marginBottom: "4px" }}>Header Alignment</label>
                        <select className="premium-input" value={config.postFeed.alignment} onChange={(e) => updateConfig("postFeed", "alignment", e.target.value)}>
                          <option value="left">Left Align</option>
                          <option value="center">Center Align</option>
                          <option value="right">Right Align</option>
                        </select>
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
                      { id: "enable",     label: "Active Stories",    sub: "Render top highlight-bar",  icon: "🔥" },
                      { id: "carousel",   label: "Snap Scrolling",    sub: "Touch-optimized motion",    icon: "✨" },
                      { id: "autoplay",   label: "Auto Play Stories", sub: "Animate top highlights",    icon: "🎞️" },
                      { id: "showHeader", label: "Display Branding",  sub: "Show/Hide story title",     icon: "📢" },
                    ].map((item, idx) => (
                      <div key={item.id} className="setting-row" style={{ animation: `slideInUp 0.3s ease-out ${idx * 0.05}s both` }}>
                        <div className="setting-info">
                          <div className="setting-icon">{item.icon}</div>
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
                  </div>

                  <div className="visual-architecture" style={{ marginTop: "32px", animation: "slideInUp 0.3s ease-out 0.2s both" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
                      <span style={{ fontSize: "16px" }}>🎨</span>
                      <h3 style={{ margin: 0, fontSize: "14px", fontWeight: "800", color: "#0f172a" }}>STORY BRANDING</h3>
                    </div>

                    <div className="input-group" style={{ marginBottom: "20px" }}>
                      <label className="input-label" style={{ fontSize: "10px" }}>Header Alignment</label>
                      <select className="premium-input" value={config.stories.alignment} onChange={(e) => updateConfig("stories", "alignment", e.target.value)}>
                        <option value="left">Left Align</option>
                        <option value="center">Center Align</option>
                        <option value="right">Right Align</option>
                      </select>
                    </div>

                    <div className="setting-card">
                      <div>
                        <label className="input-label" style={{ fontSize: "10px", marginBottom: "4px" }}>Story Heading</label>
                        <input className="premium-input" value={config.stories.heading} onChange={(e) => updateConfig("stories", "heading", e.target.value)} />
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginTop: "12px" }}>
                        <div>
                          <label className="input-label" style={{ fontSize: "10px", marginBottom: "4px" }}>Size</label>
                          <input type="number" className="premium-input" value={config.stories.typography.heading.size}
                            onChange={(e) => updateConfig("stories", "typography", { ...config.stories.typography, heading: { ...config.stories.typography.heading, size: parseInt(e.target.value) } })} />
                        </div>
                        <div>
                          <label className="input-label" style={{ fontSize: "10px", marginBottom: "4px" }}>Weight</label>
                          <select className="premium-input" value={config.stories.typography.heading.weight}
                            onChange={(e) => updateConfig("stories", "typography", { ...config.stories.typography, heading: { ...config.stories.typography.heading, weight: e.target.value } })}>
                            <option value="400">Normal</option>
                            <option value="600">Semi-Bold</option>
                            <option value="800">Extra-Bold</option>
                          </select>
                        </div>
                        <div>
                          <label className="input-label" style={{ fontSize: "10px", marginBottom: "4px" }}>Color</label>
                          <input type="color" className="premium-input" value={config.stories.typography.heading.color}
                            onChange={(e) => updateConfig("stories", "typography", { ...config.stories.typography, heading: { ...config.stories.typography.heading, color: e.target.value } })} />
                        </div>
                      </div>

                      <div style={{ marginTop: "20px" }}>
                        <label className="input-label" style={{ fontSize: "10px", marginBottom: "4px" }}>Story Subtext</label>
                        <input className="premium-input" value={config.stories.subheading} onChange={(e) => updateConfig("stories", "subheading", e.target.value)} />
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginTop: "12px" }}>
                        <div>
                          <label className="input-label" style={{ fontSize: "10px", marginBottom: "4px" }}>Size</label>
                          <input type="number" className="premium-input" value={config.stories.typography.subheading.size}
                            onChange={(e) => updateConfig("stories", "typography", { ...config.stories.typography, subheading: { ...config.stories.typography.subheading, size: parseInt(e.target.value) } })} />
                        </div>
                        <div>
                          <label className="input-label" style={{ fontSize: "10px", marginBottom: "4px" }}>Weight</label>
                          <select className="premium-input" value={config.stories.typography.subheading.weight}
                            onChange={(e) => updateConfig("stories", "typography", { ...config.stories.typography, subheading: { ...config.stories.typography.subheading, weight: e.target.value } })}>
                            <option value="400">Normal</option>
                            <option value="500">Medium</option>
                            <option value="700">Bold</option>
                          </select>
                        </div>
                        <div>
                          <label className="input-label" style={{ fontSize: "10px", marginBottom: "4px" }}>Color</label>
                          <input type="color" className="premium-input" value={config.stories.typography.subheading.color}
                            onChange={(e) => updateConfig("stories", "typography", { ...config.stories.typography, subheading: { ...config.stories.typography.subheading, color: e.target.value } })} />
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
                  >📱</button>
                  <button
                    onClick={() => setPreviewDevice("desktop")}
                    className="premium-button"
                    style={{ padding: "8px 12px", borderRadius: "8px", background: previewDevice === "desktop" ? "var(--premium-accent)" : "transparent", color: previewDevice === "desktop" ? "white" : "#64748b", minHeight: "unset", transition: "all 0.2s" }}
                  >💻</button>
                </div>
              </div>

              <div className="preview-container" style={{ background: "transparent", border: "none", padding: "0", minHeight: "520px" }}>
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
                          <div style={{ animation: "fadeInBlur 0.4s ease-out" }}>
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
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="15 18 9 12 15 6" /></svg>
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
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="9 18 15 12 9 6" /></svg>
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
                          </div>
                        ) : (
                          /* Story preview – mobile */
                          <div style={{ padding: "16px" }}>
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
                                <button className="carousel-nav prev" onClick={() => scrollCarousel(mobileStoryRef, "prev")} style={{ width: "24px", height: "24px", left: "0" }}>
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="15 18 9 12 15 6" /></svg>
                                </button>
                                <div className="carousel-container" ref={mobileStoryRef} style={{ gap: "12px", padding: "0 4px 10px" }}>
                                  {(instaData?.media?.data || baseMedia).slice(0, 12).map((item, i) => (
                                    <div key={i} style={{ flexShrink: 0, width: "60px", textAlign: "center" }}>
                                      <div style={{ width: "56px", height: "56px", borderRadius: "50%", padding: "2px", border: "2px solid var(--premium-accent)", background: "white", overflow: "hidden", margin: "0 auto" }}>
                                        <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: "#f1f5f9", overflow: "hidden" }}>
                                          {(item.media_url || item.thumbnail_url) && (
                                            <img loading="lazy" src={item.media_type === "VIDEO" ? (item.thumbnail_url || item.media_url) : item.media_url} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="story" />
                                          )}
                                        </div>
                                      </div>
                                      <div style={{ fontSize: "9px", marginTop: "4px", color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {item.caption ? item.caption.split(" ")[0] : `Story ${i + 1}`}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                <button className="carousel-nav next" onClick={() => scrollCarousel(mobileStoryRef, "next")} style={{ width: "24px", height: "24px", right: "0" }}>
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="9 18 15 12 9 6" /></svg>
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ── Desktop Device Frame ── */
                  <div style={{ animation: "fadeInBlur 0.4s ease-out", width: "100%" }}>
                    <div style={{ width: "100%", maxWidth: "580px", margin: "0 auto" }}>
                      <div style={{ width: "100%", aspectRatio: "1.6/1", background: "#1e293b", borderRadius: "16px", padding: "10px", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)" }}>
                        <div style={{ width: "100%", height: "100%", background: "white", borderRadius: "8px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
                          {/* Browser chrome */}
                          <div style={{ height: "28px", background: "#f1f5f9", display: "flex", alignItems: "center", padding: "0 10px", gap: "6px", flexShrink: 0 }}>
                            <div style={{ width: "6px", height: "6px", background: "#ff5f56", borderRadius: "50%" }} />
                            <div style={{ width: "6px", height: "6px", background: "#ffbd2e", borderRadius: "50%" }} />
                            <div style={{ width: "6px", height: "6px", background: "#27c93f", borderRadius: "50%" }} />
                          </div>
                          {/* Page content */}
                          <div style={{ padding: "16px", flex: 1, overflowY: "auto" }} onScroll={(e) => handleScroll(e, "vertical")}>
                            {activeTab === "story" ? (
                              /* Story desktop preview */
                              <div style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "center" }}>
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
                                  <div className="carousel-wrapper hover-buttons" style={{ position: "relative" }}>
                                    <button className="carousel-nav prev" onClick={() => scrollCarousel(desktopStoryRef, "prev")} style={{ width: "28px", height: "28px", left: "-8px" }}>
                                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
                                    </button>
                                    <div className="carousel-container" ref={desktopStoryRef} style={{ justifyContent: "flex-start", gap: "16px", padding: "8px 4px 12px" }}>
                                      {(instaData?.media?.data || baseMedia).slice(0, 8).map((item, i) => (
                                        <div key={i} style={{ textAlign: "center", width: "72px", flexShrink: 0 }}>
                                          <div style={{ width: "64px", height: "64px", borderRadius: "50%", padding: "3px", border: "2px solid var(--premium-accent)", background: "white", marginBottom: "6px", overflow: "hidden", margin: "0 auto 6px" }}>
                                            <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: "#f1f5f9", overflow: "hidden" }}>
                                              {(item.media_url || item.thumbnail_url) && (
                                                <img loading="lazy" src={item.media_type === "VIDEO" ? (item.thumbnail_url || item.media_url) : item.media_url} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="story" />
                                              )}
                                            </div>
                                          </div>
                                          <div style={{ fontSize: "10px", color: "#64748b", fontWeight: "600", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                            {item.caption ? item.caption.split(" ")[0] : `Story ${i + 1}`}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                    <button className="carousel-nav next" onClick={() => scrollCarousel(desktopStoryRef, "next")} style={{ width: "28px", height: "28px", right: "-8px" }}>
                                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6" /></svg>
                                    </button>
                                  </div>
                                )}
                              </div>
                            ) : (
                              /* Feed Grid desktop preview */
                              <>
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
                                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
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
                                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6" /></svg>
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
                              </>
                            )}
                          </div>
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
    </div>
  );
}
