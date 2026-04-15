import { useState, useEffect, useRef, useMemo } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useFetcher, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import axios from "axios";
import { AppProvider as PolarisProvider, SkeletonPage, Layout, Card, SkeletonBodyText, SkeletonDisplayText, BlockStack } from "@shopify/polaris";
import enTranslations from '@shopify/polaris/locales/en.json';
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  try {
    const shopRes = await admin.graphql(`{
      shop {
        metafield(namespace: "ai_instafeed", key: "config") {
          value
        }
      }
    }`);
    const shopJson = await shopRes.json();
    const config = shopJson.data?.shop?.metafield?.value || null;
    return { config };
  } catch (error) {
    return { config: null };
  }
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  
  const intent = formData.get("intent");
  if (intent === "saveConfig") {
    const configData = formData.get("config");
    try {
      const shopRes = await admin.graphql(`{ shop { id } }`);
      const shopJson = await shopRes.json();
      const shopId = shopJson.data.shop.id;
      
      const saveRes = await admin.graphql(`
        mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            userErrors { message }
          }
        }
      `, {
        variables: {
          metafields: [{
            ownerId: shopId,
            namespace: "ai_instafeed",
            key: "config",
            type: "json",
            value: configData
          }]
        }
      });
      
      const saveJson = await saveRes.json();
      if (saveJson.data?.metafieldsSet?.userErrors?.length > 0) {
        return { error: saveJson.data.metafieldsSet.userErrors[0].message };
      }
      return { success: true, message: "Settings saved to Shop Metafield" };
    } catch (e) {
      return { error: e.message || "Failed to save metafield" };
    }
  }

  const handle = formData.get("handle");
  const fbToken = process.env.FACEBOOK_ACCESS_TOKEN;

  if (!handle || !fbToken) {
    return { error: "Missing handle or configuration token." };
  }

  try {
    // 1. Get linked pages
    const pagesRes = await axios.get('https://graph.facebook.com/v21.0/me/accounts', {
      params: { access_token: fbToken }
    });

    if (!pagesRes.data.data || pagesRes.data.data.length === 0) {
      throw new Error('No Facebook Pages found.');
    }

    const pageId = pagesRes.data.data[0].id;
    const pageToken = pagesRes.data.data[0].access_token;

    // 2. Get IG Business Account
    const igRes = await axios.get(`https://graph.facebook.com/v21.0/${pageId}`, {
      params: {
        fields: 'instagram_business_account',
        access_token: pageToken
      }
    });

    const igBusinessId = igRes.data.instagram_business_account?.id;
    if (!igBusinessId) throw new Error('No IG Business Account linked.');

    // 3. Business Discovery
    const mediaQuery = `media.limit(50){media_url,media_type,caption,timestamp,like_count,comments_count,thumbnail_url}`;
    const response = await axios.get(`https://graph.facebook.com/v21.0/${igBusinessId}`, {
      params: {
        fields: `business_discovery.fields(username,name,biography,profile_picture_url,followers_count,follows_count,media_count,${mediaQuery}).username(${handle})`,
        access_token: fbToken
      }
    });

    return { data: response.data.business_discovery };
  } catch (error) {
    return { error: error.message || "Failed to fetch Instagram data" };
  }
};

export default function Index() {
  const shopify = useAppBridge();
  const fetcher = useFetcher();
  const loaderData = useLoaderData() || {};
  const [isHydrated, setIsHydrated] = useState(false);
  const [activeTab, setActiveTab] = useState("post");
  const [previewDevice, setPreviewDevice] = useState("mobile");

  // Local state for fetched data
  const [instaData, setInstaData] = useState(null);
  const [isInfiniteLoading, setIsInfiniteLoading] = useState(false);
  const [visibleMediaCount, setVisibleMediaCount] = useState(12);

  const [isAppBridgeReady, setIsAppBridgeReady] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
    // Explicit iframe loading delay check (wait for AppBridge ready state)
    const initTimer = setTimeout(() => {
      setIsAppBridgeReady(true);
    }, 800); // 800ms buffer for App Bridge & iframe to fully settle
    return () => clearTimeout(initTimer);
  }, [shopify]);

  // Carousel Refs
  const desktopCarouselRef = useRef(null);
  const mobileCarouselRef = useRef(null);
  const mobileStoryRef = useRef(null);
  const desktopStoryRef = useRef(null);

  const handleScroll = (e, orientation = "vertical") => {
    if (!config.postFeed.load || isInfiniteLoading) return;
    const { scrollTop, scrollLeft, scrollHeight, scrollWidth, clientHeight, clientWidth } = e.currentTarget;
    
    // threshold of 150px for a more seamless experience
    const threshold = 150;
    
    if (orientation === "vertical") {
      if (scrollHeight - scrollTop - clientHeight < threshold) {
        setIsInfiniteLoading(true);
        setTimeout(() => {
          setIsInfiniteLoading(false);
          setVisibleMediaCount(prev => prev + (previewDevice === "mobile" ? 6 : 12));
        }, 600); // reduced delay for "zero-latency" feel
      }
    } else {
      if (scrollWidth - scrollLeft - clientWidth < threshold) {
        setIsInfiniteLoading(true);
        setTimeout(() => {
          setIsInfiniteLoading(false);
          setVisibleMediaCount(prev => prev + (previewDevice === "mobile" ? 6 : 12));
        }, 600);
      }
    }
  };

  const scrollCarousel = (ref, direction) => {
    if (ref.current) {
      const scrollAmount = ref.current.clientWidth * 0.8;
      ref.current.scrollBy({
        left: direction === "next" ? scrollAmount : -scrollAmount,
        behavior: "smooth"
      });
    }
  };

  // Central Dynamic State
  const [config, setConfig] = useState({
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
        heading: { size: 18, weight: "800", color: "#0f172a" },
        subheading: { size: 12, weight: "500", color: "#64748b" }
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
        heading: { size: 28, weight: "800", color: "#000" },
        subheading: { size: 14, weight: "400", color: "#666" },
      }
    }
  });

  const [lastSavedConfig, setLastSavedConfig] = useState(null);
  const hasChanges = lastSavedConfig ? JSON.stringify(config) !== JSON.stringify(lastSavedConfig) : false;

  // State update helpers with automation
  const updateConfig = (section, key, value) => {
    setConfig(prev => ({
      ...prev,
      [section]: { ...prev[section], [key]: value }
    }));

    // Automation: Auto-switch preview device or tab context
    if (key === "mobileColumns") setPreviewDevice("mobile");
    if (key === "desktopColumns") setPreviewDevice("desktop");
    if (section === "stories") setActiveTab("story");
    if (section === "postFeed") setActiveTab("post");
  };

  const updateNestedConfig = (section, subSection, key, value) => {
    setConfig(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [subSection]: { ...prev[section][subSection], [key]: value }
      }
    }));
    
    // Automation: Switch context for nested changes
    if (section === "stories") setActiveTab("story");
  };

  const [lastFetchedHandle, setLastFetchedHandle] = useState("");

  useEffect(() => {
    const handle = config.instagramHandle;
    if (handle && handle !== lastFetchedHandle) {
      const timeout = setTimeout(() => {
        setLastFetchedHandle(handle);
        const formData = new FormData();
        formData.append("handle", handle);
        fetcher.submit(formData, { method: "post" });
      }, 1500);
      return () => clearTimeout(timeout);
    }
  }, [config.instagramHandle, lastFetchedHandle, fetcher]);

  // Persistence Logic: Load from localStorage on mount
  useEffect(() => {
    const savedData = localStorage.getItem("insta_feed_data");
    if (savedData) {
      try {
        setInstaData(JSON.parse(savedData));
      } catch (e) {
        console.error("Failed to parse saved insta data");
      }
    }
    
    const configStr = loaderData?.config || localStorage.getItem("insta_config");
    if (configStr) {
      try {
        const parsed = JSON.parse(configStr);
        
        // Deep merge saved config with defaults to prevent crashes on new fields
        setConfig(prev => {
          const merged = { ...prev };
          if (parsed.postFeed) {
            merged.postFeed = { ...prev.postFeed, ...parsed.postFeed };
            if (parsed.postFeed.typography) {
              merged.postFeed.typography = { ...prev.postFeed.typography, ...parsed.postFeed.typography };
              if (parsed.postFeed.typography.heading) merged.postFeed.typography.heading = { ...prev.postFeed.typography.heading, ...parsed.postFeed.typography.heading };
              if (parsed.postFeed.typography.subheading) merged.postFeed.typography.subheading = { ...prev.postFeed.typography.subheading, ...parsed.postFeed.typography.subheading };
            }
          }
          if (parsed.stories) {
            merged.stories = { ...prev.stories, ...parsed.stories };
            if (parsed.stories.typography) {
              merged.stories.typography = { ...prev.stories.typography, ...parsed.stories.typography };
            }
          }
          if (parsed.instagramHandle) merged.instagramHandle = parsed.instagramHandle;
          return merged;
        });

        // If we have saved data, make sure the handle matches it
        if (savedData) {
          try {
            const parsedData = JSON.parse(savedData);
            if (parsedData.username) {
              setConfig(prev => ({ 
                ...prev, 
                instagramHandle: parsedData.username,
                postFeed: {
                  ...prev.postFeed,
                  subheading: prev.postFeed.subheading.replace(/@floorlanduk|@account/g, `@${parsedData.username}`)
                },
                stories: {
                  ...prev.stories,
                  subheading: prev.stories.subheading.replace(/@floorlanduk|@account/g, `@${parsedData.username}`)
                }
              }));
            }
          } catch(e) {}
        }
      } catch (e) {
        console.error("Failed to parse saved config", e);
      }
    }
    
    // Set initial baseline for Apply/Discard logic AFTER merging
    setTimeout(() => {
      setLastSavedConfig(prev => {
        // This timeout ensures setConfig has stabilized
        const initialConfigStr = loaderData?.config || localStorage.getItem("insta_config");
        return initialConfigStr ? JSON.parse(initialConfigStr) : config;
      });
    }, 100);
  }, []);

  useEffect(() => {
    if (fetcher.data?.success) return;
    
    if (fetcher.data?.data) {
      const { username } = fetcher.data.data;
      setInstaData(fetcher.data.data);
      setVisibleMediaCount(12); // Reset paging on new data
      
      // Update config handle and dynamically replace handles in subheadings
      setConfig(prev => ({ 
        ...prev, 
        instagramHandle: username,
        postFeed: {
          ...prev.postFeed,
          subheading: prev.postFeed.subheading.replace(/@floorlanduk|@account/g, `@${username}`)
        },
        stories: {
          ...prev.stories,
          subheading: prev.stories.subheading.replace(/@floorlanduk|@account/g, `@${username}`)
        }
      }));
      
      localStorage.setItem("insta_feed_data", JSON.stringify(fetcher.data.data));
      shopify.toast.show(`Connected to @${username}`);
    } else if (fetcher.data?.error) {
      setInstaData(null);
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify]);

  // Persist config changes (Internal state management)
  // No longer auto-saving to localStorage here to respect "Apply Changes" logic
  
  const applyChanges = () => {
    setLastSavedConfig(config);
    localStorage.setItem("insta_config", JSON.stringify(config));
    
    const formData = new FormData();
    formData.append("intent", "saveConfig");
    formData.append("config", JSON.stringify(config));
    fetcher.submit(formData, { method: "post" });
    
    shopify.toast.show("Configuration applied successfully!");
  };

  const discardChanges = () => {
    if (lastSavedConfig) {
      setConfig(lastSavedConfig);
      shopify.toast.show("Changes discarded.");
    }
  };

  // Helper to genuinely simulate infinite scroll when running out of initial items
  const baseMedia = useMemo(() => instaData?.media?.data || [
    { media_url: "https://images.unsplash.com/photo-1611162147679-aa3c393bc3ec?w=400&h=400&fit=crop", media_type: "IMAGE", like_count: 120, comments_count: 8 },
    { media_url: "https://images.unsplash.com/photo-1542435503-956c469947f6?w=400&h=400&fit=crop", media_type: "IMAGE", like_count: 85, comments_count: 12 },
    { media_url: "https://images.unsplash.com/photo-1493723843671-1d655e8d717f?w=400&h=400&fit=crop", media_type: "IMAGE", like_count: 210, comments_count: 45 },
    { media_url: "https://images.unsplash.com/photo-1512314889357-e157c22f938d?w=400&h=400&fit=crop", media_type: "IMAGE", like_count: 110, comments_count: 15 },
    { media_url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4", thumbnail_url: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400", media_type: "VIDEO", like_count: 320, comments_count: 31 },
    { media_url: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=400&h=400&fit=crop", media_type: "IMAGE", like_count: 95, comments_count: 3 },
  ], [instaData?.media?.data]);

  const simulatedInfiniteMedia = useMemo(() => {
    return Array.from({ length: visibleMediaCount }).map((_, i) => baseMedia[i % baseMedia.length]);
  }, [baseMedia, visibleMediaCount]);

  const isSyncing = fetcher.state !== "idle";

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
                      <div style={{ margin: "16px 0" }}></div>
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

  return (
    <div className="premium-dashboard">
      {/* Header Bar */}
      <div className="premium-header">
        <div className="brand-section">
          <div className="brand-logo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: "18px", fontWeight: "700" }}>Ai Highlight Center</h1>
            <span style={{ fontSize: "12px", color: "#6b7280" }}>V2.0 PRO</span>
          </div>
          <div className="status-badge" style={{ marginLeft: "20px" }}>
            <div className="status-dot"></div>
            System Online <span style={{ opacity: 0.6, marginLeft: "4px" }}>Active</span>
          </div>
        </div>
      </div>
      <div style={{ maxWidth: "1300px", margin: "0 auto" }}>
        {/* Connect Account Card */}
        <div className="premium-card" style={{ padding: "32px", position: "relative", overflow: "hidden" }}>
          {/* Background Decoration */}
          <div style={{ position: "absolute", top: "-20px", right: "-20px", width: "100px", height: "100px", background: "var(--premium-accent)", opacity: 0.05, borderRadius: "50%", filter: "blur(40px)" }}></div>
          
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "24px", gap: "20px" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                <span style={{ background: "var(--premium-accent)", color: "white", width: "22px", height: "22px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: "800" }}>1</span>
                <h2 style={{ margin: 0, fontSize: "18px", fontWeight: "700", color: "#0f172a" }}>Connect Your Account</h2>
              </div>
              <p style={{ margin: 0, fontSize: "14px", color: "#64748b", lineHeight: "1.5" }}>
                Seamlessly sync your Instagram feed to your Shopify storefront. <br/>
                Enter your <span style={{ color: "var(--premium-accent)", fontWeight: "600" }}>@username</span> or profile URL to begin.
              </p>
            </div>
            
            {instaData && (
              <div className="status-badge" style={{ animation: "fadeInBlur 0.5s ease" }}>
                <div className="status-dot"></div>
                Connected to @{instaData.username}
              </div>
            )}
          </div>
          
          <div className="input-group-nested">
            <div style={{ position: "relative", flex: 1, display: "flex", alignItems: "center" }}>
              <div style={{ paddingLeft: "16px", color: "var(--premium-accent)", display: "flex", alignItems: "center" }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                  <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                  <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
                </svg>
              </div>
              <input 
                type="text" 
                className="premium-input" 
                style={{ paddingLeft: "12px" }}
                value={config.instagramHandle}
                onChange={(e) => {
                  let val = e.target.value;
                  // Automatic Handle Extraction logic
                  if (val.includes("instagram.com/")) {
                    try {
                      const url = new URL(val.startsWith('http') ? val : `https://${val}`);
                      const pathParts = url.pathname.split('/').filter(p => p);
                      if (pathParts.length > 0) {
                        val = pathParts[0];
                      }
                    } catch (err) {
                      const parts = val.replace(/\/$/, "").split("/");
                      val = parts[parts.length - 1].split("?")[0];
                    }
                  }
                  val = val.replace("@", "").split("?")[0];
                  setConfig({ ...config, instagramHandle: val });
                }}
                placeholder="instagram_handle or URL"
              />
            </div>
            <button 
              className={`premium-button button-accent ${isSyncing ? "loading" : ""}`}
              disabled={isSyncing}
              onClick={() => {
                const formData = new FormData();
                formData.append("handle", config.instagramHandle);
                fetcher.submit(formData, { method: "post" });
              }}
            >
              {isSyncing ? (
                <>
                  <div className="spinner" style={{ width: "16px", height: "16px", border: "2px solid rgba(255,255,255,0.3)", borderTop: "2px solid white", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}></div>
                  <span>Syncing...</span>
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="18" height="18">
                    <polyline points="23 4 23 10 17 10"></polyline>
                    <polyline points="1 20 1 14 7 14"></polyline>
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                  </svg>
                  <span>Update & Preview</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="main-content-grid" style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: "24px", alignItems: "start" }}>
          
          {/* Left Column: Settings (Scrollable) */}
          <div className="premium-card" style={{ padding: "24px", position: "relative" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ width: "8px", height: "8px", background: "var(--premium-accent)", borderRadius: "50%" }}></div>
                <h2 style={{ margin: 0, fontSize: "15px", fontWeight: "700" }}>DASHBOARD CONFIGURATOR</h2>
              </div>
              {hasChanges && (
                <div style={{ display: "flex", gap: "8px", animation: "fadeInBlur 0.3s ease" }}>
                  <button className="premium-button" style={{ padding: "6px 16px", fontSize: "12px", background: "#f8fafc", color: "#64748b", border: "1px solid #e2e8f0" }} onClick={discardChanges}>Discard</button>
                  <button className="premium-button button-success" style={{ padding: "6px 16px", fontSize: "12px" }} onClick={applyChanges}>Apply</button>
                </div>
              )}
            </div>

            <div className="tab-container">
              <div className={`tab-item ${activeTab === "post" ? "active" : ""}`} onClick={() => setActiveTab("post")}>Feed Grid Settings</div>
              <div className={`tab-item ${activeTab === "story" ? "active" : ""}`} onClick={() => setActiveTab("story")}>Story & Layouts</div>
            </div>

            <div className="tab-content-container" key={activeTab} style={{ animation: "fadeInBlur 0.4s ease-out" }}>
              {activeTab === "post" ? (
                <>
                  <h3 className="input-label" style={{ marginBottom: "12px" }}>Dynamic Modules</h3>
                  {[
                    { id: "header", label: "Profile Header", sub: "Show store bio & icon", icon: "👤" },
                    { id: "metrics", label: "Engagement Hub", sub: "Visualize social proof", icon: "📊" },
                    { id: "load", label: "Infinite Paging", sub: "Zero-latency scrolling", icon: "🔄" },
                    { id: "carousel", label: "Smart Carousel", sub: "Auto-swipe logic", icon: "📱" },
                    { id: "autoplay", label: "Smart Autoplay", sub: "Pre-load video content", icon: "🎬" },
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
                        <span className="slider"></span>
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
                          {[3,4,5,6].map(n => <option key={n} value={n}>{n} Columns</option>)}
                        </select>
                      </div>
                      <div className="input-group">
                        <label className="input-label" style={{ fontSize: "10px" }}>Mobile Columns</label>
                        <select 
                          className="premium-input" 
                          value={config.postFeed.mobileColumns}
                          onChange={(e) => updateConfig("postFeed", "mobileColumns", parseInt(e.target.value))}
                        >
                          {[1,2,3].map(n => <option key={n} value={n}>{n} Columns</option>)}
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
                        style={{ padding: 0 }} 
                      />
                    </div>
                  </div>

                  <div style={{ marginTop: "32px", animation: "slideInUp 0.3s ease-out 0.2s both" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
                      <span style={{ fontSize: "16px" }}>🎨</span>
                      <h3 style={{ margin: 0, fontSize: "14px", fontWeight: "800", color: "#0f172a" }}>BRAND CUSTOMIZATION</h3>
                    </div>
                    
                    <div className="setting-card" style={{ background: "#f8fafc", padding: "16px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
                      <div className="setting-field">
                        <label className="input-label" style={{ fontSize: "10px", marginBottom: "4px", display: "block" }}>Feed Heading</label>
                        <input className="premium-input" value={config.postFeed.heading} onChange={(e) => updateConfig("postFeed", "heading", e.target.value)} />
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginTop: "12px" }}>
                        <div className="setting-field">
                          <label className="input-label" style={{ fontSize: "10px", marginBottom: "4px", display: "block" }}>Size</label>
                          <input type="number" className="premium-input" value={config.postFeed.typography.heading.size} onChange={(e) => updateConfig("postFeed", "typography", { ...config.postFeed.typography, heading: { ...config.postFeed.typography.heading, size: parseInt(e.target.value) } })} />
                        </div>
                        <div className="setting-field">
                          <label className="input-label" style={{ fontSize: "10px", marginBottom: "4px", display: "block" }}>Weight</label>
                          <select className="premium-input" value={config.postFeed.typography.heading.weight} onChange={(e) => updateConfig("postFeed", "typography", { ...config.postFeed.typography, heading: { ...config.postFeed.typography.heading, weight: e.target.value } })}>
                            <option value="400">Normal</option>
                            <option value="600">Semi-Bold</option>
                            <option value="800">Extra-Bold</option>
                          </select>
                        </div>
                        <div className="setting-field">
                          <label className="input-label" style={{ fontSize: "10px", marginBottom: "4px", display: "block" }}>Color</label>
                          <input type="color" className="premium-input" style={{ padding: "2px", height: "38px" }} value={config.postFeed.typography.heading.color} onChange={(e) => updateConfig("postFeed", "typography", { ...config.postFeed.typography, heading: { ...config.postFeed.typography.heading, color: e.target.value } })} />
                        </div>
                      </div>

                      <div className="setting-field" style={{ marginTop: "20px" }}>
                        <label className="input-label" style={{ fontSize: "10px", marginBottom: "4px", display: "block" }}>Subheading Text</label>
                        <input className="premium-input" value={config.postFeed.subheading} onChange={(e) => updateConfig("postFeed", "subheading", e.target.value)} />
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginTop: "12px" }}>
                        <div className="setting-field">
                          <label className="input-label" style={{ fontSize: "10px", marginBottom: "4px", display: "block" }}>Size</label>
                          <input type="number" className="premium-input" value={config.postFeed.typography.subheading.size} onChange={(e) => updateConfig("postFeed", "typography", { ...config.postFeed.typography, subheading: { ...config.postFeed.typography.subheading, size: parseInt(e.target.value) } })} />
                        </div>
                        <div className="setting-field">
                          <label className="input-label" style={{ fontSize: "10px", marginBottom: "4px", display: "block" }}>Weight</label>
                          <select className="premium-input" value={config.postFeed.typography.subheading.weight} onChange={(e) => updateConfig("postFeed", "typography", { ...config.postFeed.typography, subheading: { ...config.postFeed.typography.subheading, weight: e.target.value } })}>
                            <option value="400">Normal</option>
                            <option value="500">Medium</option>
                            <option value="700">Bold</option>
                          </select>
                        </div>
                        <div className="setting-field">
                          <label className="input-label" style={{ fontSize: "10px", marginBottom: "4px", display: "block" }}>Color</label>
                          <input type="color" className="premium-input" style={{ padding: "2px", height: "38px" }} value={config.postFeed.typography.subheading.color} onChange={(e) => updateConfig("postFeed", "typography", { ...config.postFeed.typography, subheading: { ...config.postFeed.typography.subheading, color: e.target.value } })} />
                        </div>
                      </div>

                      <div className="setting-field" style={{ marginTop: "20px" }}>
                        <label className="input-label" style={{ fontSize: "10px", marginBottom: "4px", display: "block" }}>Header Alignment</label>
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
                <>
                  <h3 className="input-label" style={{ marginBottom: "12px" }}>Highlight Modules</h3>
                  <div className="setting-card" style={{ marginBottom: "32px" }}>
                    {[
                      { id: "enable", label: "Active Stories", sub: "Render top highlight-bar", icon: "🔥" },
                      { id: "carousel", label: "Snap Scrolling", sub: "Touch-optimized motion", icon: "✨" },
                      { id: "autoplay", label: "Auto Play Stories", sub: "Animate top highlights", icon: "🎞️" },
                      { id: "showHeader", label: "Display Branding", sub: "Show/Hide story title", icon: "📢" },
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
                          <span className="slider"></span>
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

                    <div className="setting-card" style={{ background: "#f8fafc", padding: "16px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
                      <div className="setting-field">
                        <label className="input-label" style={{ fontSize: "10px", marginBottom: "4px", display: "block" }}>Story Heading</label>
                        <input className="premium-input" value={config.stories.heading} onChange={(e) => updateConfig("stories", "heading", e.target.value)} />
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginTop: "12px" }}>
                        <div className="setting-field">
                          <label className="input-label" style={{ fontSize: "10px", marginBottom: "4px", display: "block" }}>Size</label>
                          <input type="number" className="premium-input" value={config.stories.typography.heading.size} onChange={(e) => updateConfig("stories", "typography", { ...config.stories.typography, heading: { ...config.stories.typography.heading, size: parseInt(e.target.value) } })} />
                        </div>
                        <div className="setting-field">
                          <label className="input-label" style={{ fontSize: "10px", marginBottom: "4px", display: "block" }}>Weight</label>
                          <select className="premium-input" value={config.stories.typography.heading.weight} onChange={(e) => updateConfig("stories", "typography", { ...config.stories.typography, heading: { ...config.stories.typography.heading, weight: e.target.value } })}>
                            <option value="400">Normal</option>
                            <option value="600">Semi-Bold</option>
                            <option value="800">Extra-Bold</option>
                          </select>
                        </div>
                        <div className="setting-field">
                          <label className="input-label" style={{ fontSize: "10px", marginBottom: "4px", display: "block" }}>Color</label>
                          <input type="color" className="premium-input" style={{ padding: "2px", height: "38px" }} value={config.stories.typography.heading.color} onChange={(e) => updateConfig("stories", "typography", { ...config.stories.typography, heading: { ...config.stories.typography.heading, color: e.target.value } })} />
                        </div>
                      </div>

                      <div className="setting-field" style={{ marginTop: "20px" }}>
                        <label className="input-label" style={{ fontSize: "10px", marginBottom: "4px", display: "block" }}>Story Subtext</label>
                        <input className="premium-input" value={config.stories.subheading} onChange={(e) => updateConfig("stories", "subheading", e.target.value)} />
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginTop: "12px" }}>
                        <div className="setting-field">
                          <label className="input-label" style={{ fontSize: "10px", marginBottom: "4px", display: "block" }}>Size</label>
                          <input type="number" className="premium-input" value={config.stories.typography.subheading.size} onChange={(e) => updateConfig("stories", "typography", { ...config.stories.typography, subheading: { ...config.stories.typography.subheading, size: parseInt(e.target.value) } })} />
                        </div>
                        <div className="setting-field">
                          <label className="input-label" style={{ fontSize: "10px", marginBottom: "4px", display: "block" }}>Weight</label>
                          <select className="premium-input" value={config.stories.typography.subheading.weight} onChange={(e) => updateConfig("stories", "typography", { ...config.stories.typography, subheading: { ...config.stories.typography.subheading, weight: e.target.value } })}>
                            <option value="400">Normal</option>
                            <option value="500">Medium</option>
                            <option value="700">Bold</option>
                          </select>
                        </div>
                        <div className="setting-field">
                          <label className="input-label" style={{ fontSize: "10px", marginBottom: "4px", display: "block" }}>Color</label>
                          <input type="color" className="premium-input" style={{ padding: "2px", height: "38px" }} value={config.stories.typography.subheading.color} onChange={(e) => updateConfig("stories", "typography", { ...config.stories.typography, subheading: { ...config.stories.typography.subheading, color: e.target.value } })} />
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {hasChanges && (
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "32px", borderTop: "1px solid #f1f5f9", paddingTop: "24px", animation: "slideInUp 0.3s ease-out" }}>
                <button className="premium-button" style={{ color: "#64748b", background: "transparent" }} onClick={discardChanges}>Discard Changes</button>
                <button className="premium-button button-success" style={{ minWidth: "160px" }} onClick={applyChanges}>Apply Configuration</button>
              </div>
            )}
          </div>

          {/* Right Column: Preview (Sticky) */}
          <div style={{ position: "sticky", top: "24px" }}>
            <div className="premium-card" style={{ padding: "24px", background: "#f8fafc" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                <h2 style={{ margin: 0, fontSize: "14px", fontWeight: "700", color: "#64748b" }}>LIVE RENDERING</h2>
                <div style={{ display: "flex", gap: "6px", background: "white", padding: "4px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                  <button onClick={() => setPreviewDevice("mobile")} className={`premium-button ${previewDevice === "mobile" ? "button-primary" : ""}`} style={{ padding: "8px 12px", borderRadius: "8px", background: previewDevice === "mobile" ? "var(--premium-accent)" : "transparent", color: previewDevice === "mobile" ? "white" : "#64748b" }}>📱</button>
                  <button onClick={() => setPreviewDevice("desktop")} className={`premium-button ${previewDevice === "desktop" ? "button-primary" : ""}`} style={{ padding: "8px 12px", borderRadius: "8px", background: previewDevice === "desktop" ? "var(--premium-accent)" : "transparent", color: previewDevice === "desktop" ? "white" : "#64748b" }}>💻</button>
                </div>
              </div>

              <div className="preview-container" style={{ background: "transparent", border: "none" }}>
                {isSyncing && (
                  <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.8)", zIndex: 1000, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)", animation: "fadeInBlur 0.3s ease" }}>
                    <div className="spinner" style={{ width: "40px", height: "40px", border: "4px solid #e2e8f0", borderTop: "4px solid var(--premium-accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite", marginBottom: "16px" }}></div>
                    <span style={{ fontWeight: "700", color: "#0f172a" }}>Syncing Live Data...</span>
                  </div>
                )}
                {previewDevice === "mobile" ? (
                  <div style={{ animation: "fadeInBlur 0.4s ease-out", display: "flex", justifyContent: "center", position: "relative" }}>
                    <div style={{
                      width: "280px",
                      height: "560px",
                      background: "white",
                      borderRadius: "44px",
                      border: "12px solid #1e293b",
                      boxShadow: "0 35px 60px -15px rgba(0, 0, 0, 0.3)",
                      position: "relative",
                      overflow: "hidden"
                    }}>
                      <div style={{ height: "40px", padding: "14px 20px 0", display: "flex", justifyContent: "space-between", fontSize: "10px", fontWeight: "700" }}>
                        <span>9:41</span>
                        <div style={{ display: "flex", gap: "4px" }}>📶 🔋</div>
                      </div>
                      <div 
                        style={{ height: "calc(100% - 40px)", overflowY: "auto", paddingBottom: "20px" }}
                        onScroll={handleScroll}
                      >
                        {activeTab === "post" ? (
                          <div style={{ animation: "fadeInBlur 0.4s ease-out" }}>
                            {config.postFeed.header && (
                              <div style={{ padding: "16px", textAlign: config.postFeed.alignment }}>
                                <h4 style={{ 
                                  fontSize: `${config.postFeed.typography.heading.size}px`, 
                                  fontWeight: config.postFeed.typography.heading.weight, 
                                  color: config.postFeed.typography.heading.color,
                                  margin: 0
                                }}>{config.postFeed.heading}</h4>
                                <p style={{ 
                                  fontSize: `${config.postFeed.typography.subheading.size}px`, 
                                  fontWeight: config.postFeed.typography.subheading.weight, 
                                  color: config.postFeed.typography.subheading.color,
                                  margin: 0 
                                }}>{config.postFeed.subheading}</p>
                              </div>
                            )}
                             {config.postFeed.carousel ? (
                               <div className="carousel-wrapper" style={{ padding: `${config.postFeed.gap}px 0`, position: "relative", width: "100%" }}>
                                 <button 
                                   className="carousel-nav prev" 
                                   onClick={() => scrollCarousel(mobileCarouselRef, "prev")} 
                                   style={{ width: "28px", height: "28px", left: "6px", zIndex: 100, display: "flex", background: "rgba(255,255,255,0.9)", border: "1px solid #e2e8f0" }}
                                 >
                                   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="15 18 9 12 15 6"></polyline></svg>
                                 </button>
                                 <div 
                                   className="carousel-container" 
                                   ref={mobileCarouselRef}
                                   style={{ 
                                     padding: `0 ${config.postFeed.gap}px`,
                                     "--carousel-gap": `${config.postFeed.gap}px`,
                                     "--carousel-item-width": `calc((100% - ${(config.postFeed.mobileColumns - 1) * config.postFeed.gap}px) / ${config.postFeed.mobileColumns})`,
                                     zIndex: 1
                                   }}
                                   onScroll={(e) => handleScroll(e, "horizontal")}
                                 >
                                   {simulatedInfiniteMedia.map((item, i) => (
                                     <div key={i} className="carousel-item">
                                       <div style={{ aspectRatio: "1/1", background: "#f1f5f9", borderRadius: "4px", overflow: "hidden", position: "relative" }}>
                                         {item.media_type === "VIDEO" && config.postFeed.autoplay ? (
                                           <video src={item.media_url} autoPlay muted loop playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                         ) : (item.media_url || item.thumbnail_url) ? (
                                           <img loading="lazy" src={item.media_type === "VIDEO" ? (item.thumbnail_url || item.media_url) : item.media_url} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="post" />
                                         ) : null}
                                         {item.media_type === "VIDEO" && <div style={{ position: "absolute", top: "4px", right: "4px", fontSize: "10px", background: "rgba(0,0,0,0.5)", color: "white", padding: "2px 4px", borderRadius: "4px" }}>📹</div>}
                                         {config.postFeed.metrics && (
                                           <div className="media-metrics" style={{ fontSize: "10px", padding: "4px 8px" }}>
                                             <span>❤️ {item.like_count || "0"}</span>
                                             <span>💬 {item.comments_count || "0"}</span>
                                           </div>
                                         )}
                                       </div>
                                     </div>
                                   ))}
                                 </div>
                                 <button 
                                   className="carousel-nav next" 
                                   onClick={() => scrollCarousel(mobileCarouselRef, "next")} 
                                   style={{ width: "28px", height: "28px", right: "6px", zIndex: 100, display: "flex", background: "rgba(255,255,255,0.9)", border: "1px solid #e2e8f0" }}
                                 >
                                   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="9 18 15 12 9 6"></polyline></svg>
                                 </button>
                               </div>
                             ) : (
                              <div style={{ padding: `${config.postFeed.gap}px`, display: "grid", gridTemplateColumns: `repeat(${config.postFeed.mobileColumns}, 1fr)`, gap: `${config.postFeed.gap}px` }}>
                                {simulatedInfiniteMedia.map((item, i) => (
                                  <div key={i} className="grid-item" style={{ aspectRatio: "1/1", background: "#f1f5f9", borderRadius: "4px", overflow: "hidden", position: "relative" }}>
                                    {item.media_type === "VIDEO" && config.postFeed.autoplay ? (
                                      <video src={item.media_url} autoPlay muted loop playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                    ) : (item.media_url || item.thumbnail_url) ? (
                                      <img loading="lazy" src={item.media_type === "VIDEO" ? (item.thumbnail_url || item.media_url) : item.media_url} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="post" />
                                    ) : null}
                                    {item.media_type === "VIDEO" && <div style={{ position: "absolute", top: "4px", right: "4px", fontSize: "10px", background: "rgba(0,0,0,0.5)", color: "white", padding: "2px 4px", borderRadius: "4px" }}>📹</div>}
                                    {config.postFeed.metrics && (
                                      <div className="media-metrics" style={{ fontSize: "10px", padding: "4px 8px" }}>
                                        <span>❤️ {item.like_count || "0"}</span>
                                        <span>💬 {item.comments_count || "0"}</span>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                             )}
                         {config.postFeed.load && isInfiniteLoading && (
                           <div style={{ padding: "20px", display: "flex", justifyContent: "center", animation: "fadeInBlur 0.3s ease" }}>
                             <div className="spinner" style={{ width: "20px", height: "20px", border: "2px solid #e2e8f0", borderTop: "2px solid var(--premium-accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}></div>
                           </div>
                         )}
                       </div>
                        ) : (
                          <div style={{ padding: "20px 16px" }}>
                            {config.stories.showHeader && (
                              <div style={{ textAlign: config.stories.alignment, marginBottom: "30px" }}>
                                <h4 style={{ 
                                  fontSize: `${Math.min(config.stories.typography.heading.size, 24)}px`, 
                                  fontWeight: config.stories.typography.heading.weight, 
                                  margin: "0 0 8px 0", 
                                  lineHeight: 1.2,
                                  color: config.stories.typography.heading.color
                                }}>{config.stories.heading}</h4>
                                <p style={{ 
                                  fontSize: `${config.stories.typography.subheading.size}px`, 
                                  color: config.stories.typography.subheading.color, 
                                  fontWeight: config.stories.typography.subheading.weight,
                                  margin: config.stories.alignment === "center" ? "0 auto" : config.stories.alignment === "right" ? "0 0 0 auto" : "0" 
                                }}>{config.stories.subheading}</p>
                              </div>
                            )}
                            {config.stories.enable && (
                              <div className="carousel-wrapper hover-buttons" style={{ position: "relative" }}>
                                <button 
                                  className="carousel-nav prev" 
                                  onClick={() => scrollCarousel(mobileStoryRef, "prev")} 
                                  style={{ width: "24px", height: "24px", left: "0px", zIndex: 100, background: "rgba(255,255,255,0.9)" }}
                                >
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="15 18 9 12 15 6"></polyline></svg>
                                </button>
                                <div 
                                  className="carousel-container" 
                                  ref={mobileStoryRef}
                                  style={{ gap: "12px", padding: "0 4px 10px", margin: "0 -4px" }}
                                >
                                  {(instaData?.media?.data || [1,2,3,4,5,6]).slice(0, 12).map((item, i) => (
                                    <div key={i} style={{ flexShrink: 0, width: "60px" }}>
                                      <div style={{ width: "56px", height: "56px", borderRadius: "50%", padding: "2px", border: "2px solid var(--premium-accent)", background: "white", overflow: "hidden" }}>
                                        <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: "#f1f5f9", overflow: "hidden" }}>
                                          {item.media_type === "VIDEO" && config.stories.autoplay ? (
                                            <video src={item.media_url} autoPlay muted loop playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                          ) : (item.media_url || item.thumbnail_url) && (
                                            <img loading="lazy" src={item.media_type === "VIDEO" ? (item.thumbnail_url || item.media_url) : item.media_url} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="story" />
                                          )}
                                        </div>
                                      </div>
                                      <div style={{ fontSize: "9px", textAlign: "center", marginTop: "4px", color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {item.caption ? item.caption.split(" ")[0] : `Story ${i+1}`}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                <button 
                                  className="carousel-nav next" 
                                  onClick={() => scrollCarousel(mobileStoryRef, "next")} 
                                  style={{ width: "24px", height: "24px", right: "0px", zIndex: 100, background: "rgba(255,255,255,0.9)" }}
                                >
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="9 18 15 12 9 6"></polyline></svg>
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ animation: "fadeInBlur 0.4s ease-out", width: "100%" }}>
                    <div style={{ width: "100%", maxWidth: "580px", margin: "0 auto" }}>
                      <div style={{ width: "100%", aspectRatio: "1.6/1", background: "#1e293b", borderRadius: "16px", padding: "10px", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)" }}>
                        <div style={{ width: "100%", height: "100%", background: "white", borderRadius: "8px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
                          <div style={{ height: "30px", background: "#f1f5f9", display: "flex", alignItems: "center", padding: "0 10px", gap: "6px" }}>
                            <div style={{ width: "6px", height: "6px", background: "#ff5f56", borderRadius: "50%" }}></div>
                            <div style={{ width: "6px", height: "6px", background: "#ffbd2e", borderRadius: "50%" }}></div>
                            <div style={{ width: "6px", height: "6px", background: "#27c93f", borderRadius: "50%" }}></div>
                          </div>
                          <div 
                            style={{ padding: "24px", flex: 1, overflowY: "auto" }}
                            onScroll={handleScroll}
                          >
                            {activeTab === "story" ? (
                              <div style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", maxWidth: "400px", margin: "0 auto" }}>
                                {config.stories.showHeader && (
                                  <div style={{ textAlign: config.stories.alignment, marginBottom: "40px" }}>
                                    <h4 style={{ 
                                      fontSize: `${config.stories.typography.heading.size}px`, 
                                      fontWeight: config.stories.typography.heading.weight, 
                                      margin: "0 0 12px 0", 
                                      color: config.stories.typography.heading.color 
                                    }}>{config.stories.heading}</h4>
                                    <p style={{ 
                                      fontSize: `${config.stories.typography.subheading.size}px`, 
                                      color: config.stories.typography.subheading.color,
                                      fontWeight: config.stories.typography.subheading.weight,
                                      maxWidth: "400px", 
                                      margin: config.stories.alignment === "center" ? "0 auto" : config.stories.alignment === "right" ? "0 0 0 auto" : "0" 
                                    }}>{config.stories.subheading}</p>
                                  </div>
                                )}
                                {config.stories.enable && (
                                  <div className="carousel-wrapper hover-buttons" style={{ position: "relative" }}>
                                    <button className="carousel-nav prev" onClick={() => scrollCarousel(desktopStoryRef, "prev")} style={{ width: "30px", height: "30px", left: "-10px", zIndex: 100, background: "rgba(255,255,255,0.9)" }}>
                                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
                                    </button>
                                    <div 
                                      className="carousel-container" 
                                      ref={desktopStoryRef}
                                      style={{ justifyContent: "center", gap: "20px", padding: "10px 0" }}
                                    >
                                      {(instaData?.media?.data || baseMedia).slice(0, 8).map((item, i) => (
                                        <div key={i} style={{ textAlign: "center", width: "80px", flexShrink: 0 }}>
                                          <div style={{ width: "72px", height: "72px", borderRadius: "50%", padding: "3px", border: "2px solid var(--premium-accent)", background: "white", marginBottom: "8px", overflow: "hidden" }}>
                                            <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: "#f1f5f9", overflow: "hidden" }}>
                                              {item.media_type === "VIDEO" && config.stories.autoplay ? (
                                                <video src={item.media_url} autoPlay muted loop playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                              ) : (item.media_url || item.thumbnail_url) && (
                                                <img loading="lazy" src={item.media_type === "VIDEO" ? (item.thumbnail_url || item.media_url) : item.media_url} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="story" />
                                              )}
                                            </div>
                                          </div>
                                          <div style={{ fontSize: "11px", color: "#64748b", fontWeight: "600", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                            {item.caption ? item.caption.split(" ")[0] : `Story ${i+1}`}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                          <button className="carousel-nav next" onClick={() => scrollCarousel(desktopStoryRef, "next")} style={{ width: "30px", height: "30px", right: "-10px", zIndex: 100, background: "rgba(255,255,255,0.9)" }}>
                                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
                                    </button>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <>
                                <div style={{ marginBottom: "32px", borderBottom: "1px solid #f1f5f9", paddingBottom: "20px", textAlign: config.postFeed.alignment }}>
                                  {config.postFeed.header && (
                                    <div>
                                      <h4 style={{ 
                                        fontSize: `${config.postFeed.typography.heading.size + 4}px`, 
                                        fontWeight: config.postFeed.typography.heading.weight, 
                                        color: config.postFeed.typography.heading.color,
                                        margin: "0 0 4px 0"
                                      }}>{config.postFeed.heading}</h4>
                                      <p style={{ 
                                        fontSize: `${config.postFeed.typography.subheading.size + 2}px`, 
                                        color: config.postFeed.typography.subheading.color,
                                        fontWeight: config.postFeed.typography.subheading.weight,
                                        margin: 0
                                      }}>{config.postFeed.subheading}</p>
                                    </div>
                                  )}
                                </div>
                                {config.postFeed.carousel ? (
                                  <div className="carousel-wrapper">
                                    <button className="carousel-nav prev" onClick={() => scrollCarousel(desktopCarouselRef, "prev")}>
                                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
                                    </button>
                                    <div 
                                      className="carousel-container" 
                                      ref={desktopCarouselRef}
                                      style={{ 
                                        "--carousel-gap": `${config.postFeed.gap}px`,
                                        "--carousel-item-width": `calc((100% - ${(config.postFeed.desktopColumns - 1) * config.postFeed.gap}px) / ${config.postFeed.desktopColumns})` 
                                      }}
                                      onScroll={(e) => handleScroll(e, "horizontal")}
                                    >
                                      {simulatedInfiniteMedia.map((item, i) => (
                                        <div key={i} className="carousel-item">
                                          <div style={{ aspectRatio: "1/1", background: "#f8fafc", border: "1px solid #f1f5f9", borderRadius: "8px", overflow: "hidden", position: "relative" }}>
                                            {item.media_type === "VIDEO" && config.postFeed.autoplay ? (
                                              <video src={item.media_url} autoPlay muted loop playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                            ) : (item.media_url || item.thumbnail_url) ? (
                                              <img loading="lazy" src={item.media_type === "VIDEO" ? (item.thumbnail_url || item.media_url) : item.media_url} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="post" />
                                            ) : null}
                                            {config.postFeed.metrics && (
                                              <div className="media-metrics">
                                                <span>❤️ {item.like_count || "0"}</span>
                                                <span>💬 {item.comments_count || "0"}</span>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                    <button className="carousel-nav next" onClick={() => scrollCarousel(desktopCarouselRef, "next")}>
                                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
                                    </button>
                                  </div>
                                ) : (
                                  <div style={{ display: "grid", gridTemplateColumns: `repeat(${config.postFeed.desktopColumns}, 1fr)`, gap: `${config.postFeed.gap}px` }}>
                                    {simulatedInfiniteMedia.map((item, i) => (
                                      <div key={i} className="grid-item" style={{ aspectRatio: "1/1", background: "#f8fafc", border: "1px solid #f1f5f9", borderRadius: "8px", overflow: "hidden", position: "relative" }}>
                                        {item.media_type === "VIDEO" && config.postFeed.autoplay ? (
                                          <video src={item.media_url} autoPlay muted loop playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                        ) : (item.media_url || item.thumbnail_url) ? (
                                          <img loading="lazy" src={item.media_type === "VIDEO" ? (item.thumbnail_url || item.media_url) : item.media_url} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="post" />
                                        ) : null}
                                        {config.postFeed.metrics && (
                                          <div className="media-metrics">
                                            <span>❤️ {item.like_count || "0"}</span>
                                            <span>💬 {item.comments_count || "0"}</span>
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {config.postFeed.load && isInfiniteLoading && (
                                  <div style={{ padding: "30px", display: "flex", justifyContent: "center" }}>
                                    <div className="spinner" style={{ width: "24px", height: "24px", border: "3px solid #e2e8f0", borderTop: "3px solid var(--premium-accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}></div>
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
