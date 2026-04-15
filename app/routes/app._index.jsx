import { useState, useEffect, useRef } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import axios from "axios";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
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
  const [activeTab, setActiveTab] = useState("post");
  const [previewDevice, setPreviewDevice] = useState("mobile");

  // Local state for fetched data
  const [instaData, setInstaData] = useState(null);
  const [isInfiniteLoading, setIsInfiniteLoading] = useState(false);
  const [visibleMediaCount, setVisibleMediaCount] = useState(12);

  // Carousel Refs
  const desktopCarouselRef = useRef(null);
  const mobileCarouselRef = useRef(null);

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
      desktopColumns: 4,
      mobileColumns: 2,
      gap: 16,
    },
    stories: {
      enable: true,
      carousel: true,
      heading: "SHOP OUR INSTAGRAM",
      subheading: "Tag us @floorlanduk to get featured in our gallery!",
      typography: {
        heading: { size: 28, color: "#000" },
        subheading: { size: 14, color: "#666" },
      }
    }
  });

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

  // Persistence Logic: Load from localStorage on mount
  useEffect(() => {
    const savedData = localStorage.getItem("insta_feed_data");
    const savedConfig = localStorage.getItem("insta_config");
    if (savedData) {
      try {
        setInstaData(JSON.parse(savedData));
      } catch (e) {
        console.error("Failed to parse saved insta data");
      }
    }
    if (savedConfig) {
      try {
        setConfig(JSON.parse(savedConfig));
      } catch (e) {
        console.error("Failed to parse saved config");
      }
    }
  }, []);

  useEffect(() => {
    if (fetcher.data?.data) {
      setInstaData(fetcher.data.data);
      localStorage.setItem("insta_feed_data", JSON.stringify(fetcher.data.data));
      shopify.toast.show(`Connected to @${fetcher.data.data.username}`);
    } else if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify]);

  // Persist config changes
  useEffect(() => {
    localStorage.setItem("insta_config", JSON.stringify(config));
  }, [config]);

  // Helper to genuinely simulate infinite scroll when running out of initial items
  const baseMedia = instaData?.media?.data || [1,2,3,4,5,6,7,8,9,10,11,12];
  const simulatedInfiniteMedia = Array.from({ length: visibleMediaCount }).map((_, i) => baseMedia[i % baseMedia.length]);

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
        <button className="premium-button button-primary">
          <span>+</span> New Feed
        </button>
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
                onChange={(e) => setConfig({ ...config, instagramHandle: e.target.value })}
                placeholder="instagram_handle or URL"
              />
            </div>
            <button 
              className={`premium-button button-accent ${fetcher.state !== "idle" ? "loading" : ""}`}
              disabled={fetcher.state !== "idle"}
              onClick={() => {
                let handle = config.instagramHandle.trim();
                // Simple handle extraction from URL
                if (handle.includes("instagram.com/")) {
                  handle = handle.split("instagram.com/")[1].split("/")[0].split("?")[0];
                }
                const formData = new FormData();
                formData.append("handle", handle);
                fetcher.submit(formData, { method: "post" });
              }}
            >
              {fetcher.state !== "idle" ? (
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
              <button className="premium-button button-primary" style={{ padding: "8px 20px" }} onClick={() => shopify.toast.show("Configuration Saved!")}>Save Changes</button>
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
                </>
              ) : (
                <>
                  <div className="visual-architecture" style={{ marginTop: 0, marginBottom: "20px" }}>
                    <h3 className="input-label">Story Branding</h3>
                    <div className="input-group">
                      <label className="input-label" style={{ fontSize: "10px" }}>Heading Text</label>
                      <input 
                        type="text" 
                        className="premium-input" 
                        value={config.stories.heading}
                        onChange={(e) => updateConfig("stories", "heading", e.target.value)}
                      />
                    </div>
                    <div className="input-group" style={{ marginTop: "12px" }}>
                      <label className="input-label" style={{ fontSize: "10px" }}>Sub-description</label>
                      <textarea 
                        className="premium-input" 
                        style={{ height: "60px", resize: "none" }}
                        value={config.stories.subheading}
                        onChange={(e) => updateConfig("stories", "subheading", e.target.value)}
                      />
                    </div>
                  </div>

                  <h3 className="input-label">Layout Modules</h3>
                  {[
                    { id: "enable", label: "Active Highlights", sub: "Render top-bar stories", icon: "🔥" },
                    { id: "carousel", label: "Snap Scrolling", sub: "Touch-optimized motion", icon: "✨" },
                  ].map((item, idx) => (
                    <div key={item.id} className="setting-row" style={{ animation: `slideInUp 0.3s ease-out ${idx * 0.05}s both` }}>
                      <div className="setting-info">
                        <div className="setting-icon">{item.icon}</div>
                        <div>
                          <div style={{ fontSize: "14px", fontWeight: "600" }}>{item.label}</div>
                          <div style={{ fontSize: "12px", color: "#64748b" }}>{item.sub}</div>
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
                  <div className="visual-architecture" style={{ marginTop: "24px" }}>
                     <h3 className="input-label">Heading Typography</h3>
                     <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                        <span style={{ fontSize: "13px" }}>Font Size ({config.stories.typography.heading.size}px)</span>
                        <input 
                           type="range" min="12" max="48"
                           value={config.stories.typography.heading.size}
                           onChange={(e) => updateNestedConfig("stories", "typography", "heading", { ...config.stories.typography.heading, size: parseInt(e.target.value) })}
                           style={{ width: "100px" }}
                        />
                     </div>
                  </div>
                </>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "32px", borderTop: "1px solid #f1f5f9", paddingTop: "24px" }}>
              <button className="premium-button" style={{ color: "#64748b", background: "transparent" }}>Discard</button>
              <button className="premium-button button-success">Apply Changes</button>
            </div>
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
                {previewDevice === "mobile" ? (
                  <div style={{ animation: "fadeInBlur 0.4s ease-out", display: "flex", justifyContent: "center" }}>
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
                        onScroll={(e) => {
                          if (!config.postFeed.load || isInfiniteLoading) return;
                          const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
                          if (scrollHeight - Math.ceil(scrollTop) <= clientHeight + 50) {
                            setIsInfiniteLoading(true);
                            setTimeout(() => {
                              setIsInfiniteLoading(false);
                              setVisibleMediaCount(prev => prev + 6);
                            }, 1500);
                          }
                        }}
                      >
                        {activeTab === "post" ? (
                          <>
                            {config.postFeed.header && (
                              <div style={{ padding: "20px 16px", background: "#fff", display: "flex", gap: "12px", alignItems: "center", borderBottom: "1px solid #f1f5f9" }}>
                                <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #e2e8f0", overflow: "hidden" }}>
                                  {instaData?.profile_picture_url ? <img src={instaData.profile_picture_url} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="profile" /> : "📸"}
                                </div>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: "13px", fontWeight: "800" }}>@{instaData?.username || config.instagramHandle}</div>
                                  <div style={{ fontSize: "10px", color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{instaData?.biography || "Premium Collection"}</div>
                                </div>
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
                                 >
                                   {simulatedInfiniteMedia.map((item, i) => (
                                     <div key={i} className="carousel-item">
                                       <div style={{ aspectRatio: "1/1", background: "#f1f5f9", borderRadius: "4px", overflow: "hidden", position: "relative" }}>
                                         {(item.media_url || item.thumbnail_url) ? (
                                           <img src={item.media_type === "VIDEO" ? (item.thumbnail_url || item.media_url) : item.media_url} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="post" />
                                         ) : null}
                                         {item.media_type === "VIDEO" && <div style={{ position: "absolute", top: "4px", right: "4px", fontSize: "10px" }}>📹</div>}
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
                                    {(item.media_url || item.thumbnail_url) ? (
                                      <img src={item.media_type === "VIDEO" ? (item.thumbnail_url || item.media_url) : item.media_url} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="post" />
                                    ) : null}
                                    {item.media_type === "VIDEO" && <div style={{ position: "absolute", top: "4px", right: "4px", fontSize: "10px" }}>📹</div>}
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
                              <div style={{ padding: "20px", display: "flex", justifyContent: "center" }}>
                                <div className="spinner" style={{ width: "20px", height: "20px", border: "2px solid #e2e8f0", borderTop: "2px solid var(--premium-accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}></div>
                              </div>
                            )}
                          </>
                        ) : (
                          <div style={{ padding: "20px 16px" }}>
                            <div style={{ textAlign: "center", marginBottom: "30px" }}>
                              <h4 style={{ fontSize: `${Math.min(config.stories.typography.heading.size, 24)}px`, fontWeight: "800", margin: "0 0 8px 0", lineHeight: 1.2 }}>{config.stories.heading}</h4>
                              <p style={{ fontSize: "11px", color: "#64748b", margin: 0 }}>{config.stories.subheading}</p>
                            </div>
                            {config.stories.enable && (
                              <div style={{ display: "flex", gap: "12px", overflowX: "auto", paddingBottom: "10px", scrollbarWidth: "none" }}>
                                {(instaData?.media?.data || [1,2,3,4,5,6]).slice(0, 8).map((item, i) => (
                                  <div key={i} style={{ flexShrink: 0, width: "60px" }}>
                                    <div style={{ width: "56px", height: "56px", borderRadius: "50%", padding: "2px", border: "2px solid var(--premium-accent)", background: "white", overflow: "hidden" }}>
                                      <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: "#f1f5f9", overflow: "hidden" }}>
                                        {(item.media_url || item.thumbnail_url) && (
                                          <img src={item.media_type === "VIDEO" ? (item.thumbnail_url || item.media_url) : item.media_url} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="story" />
                                        )}
                                      </div>
                                    </div>
                                    <div style={{ fontSize: "9px", textAlign: "center", marginTop: "4px", color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      {item.caption ? item.caption.split(" ")[0] : `Story ${i+1}`}
                                    </div>
                                  </div>
                                ))}
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
                            onScroll={(e) => {
                              if (!config.postFeed.load || isInfiniteLoading) return;
                              const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
                              if (scrollHeight - Math.ceil(scrollTop) <= clientHeight + 50) {
                                setIsInfiniteLoading(true);
                                setTimeout(() => {
                                  setIsInfiniteLoading(false);
                                  setVisibleMediaCount(prev => prev + 12);
                                }, 1500);
                              }
                            }}
                          >
                            {activeTab === "story" ? (
                              <div style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                                <div style={{ textAlign: "center", marginBottom: "40px" }}>
                                  <h4 style={{ fontSize: `${config.stories.typography.heading.size}px`, fontWeight: "800", margin: "0 0 12px 0", color: "#0f172a" }}>{config.stories.heading}</h4>
                                  <p style={{ fontSize: "14px", color: "#64748b", maxWidth: "400px", margin: "0 auto" }}>{config.stories.subheading}</p>
                                </div>
                                {config.stories.enable && (
                                  <div style={{ display: "flex", justifyContent: "center", gap: "20px" }}>
                                    {(instaData?.media?.data || [1,2,3,4,5,6]).slice(0, 6).map((item, i) => (
                                      <div key={i} style={{ textAlign: "center", width: "80px" }}>
                                        <div style={{ width: "72px", height: "72px", borderRadius: "50%", padding: "3px", border: "2px solid var(--premium-accent)", background: "white", marginBottom: "8px", overflow: "hidden" }}>
                                          <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: "#f1f5f9", overflow: "hidden" }}>
                                            {(item.media_url || item.thumbnail_url) && (
                                              <img src={item.media_type === "VIDEO" ? (item.thumbnail_url || item.media_url) : item.media_url} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="story" />
                                            )}
                                          </div>
                                        </div>
                                        <div style={{ fontSize: "11px", color: "#64748b", fontWeight: "600", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                          {item.caption ? item.caption.split(" ")[0] : `Story ${i+1}`}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
                                  <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                                    <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "#6366f1", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                      {instaData?.profile_picture_url ? <img src={instaData.profile_picture_url} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="profile" /> : "📸"}
                                    </div>
                                    <div>
                                      <div style={{ fontSize: "14px", fontWeight: "800" }}>@{instaData?.username || config.instagramHandle}</div>
                                      <div style={{ fontSize: "11px", color: "#9ca3af" }}>Official Feed</div>
                                    </div>
                                  </div>
                                  <div style={{ padding: "8px 20px", background: "#0f172a", borderRadius: "100px", color: "white", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>Follow</div>
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
                                    >
                                      {simulatedInfiniteMedia.map((item, i) => (
                                        <div key={i} className="carousel-item">
                                          <div style={{ aspectRatio: "1/1", background: "#f8fafc", border: "1px solid #f1f5f9", borderRadius: "8px", overflow: "hidden", position: "relative" }}>
                                            {(item.media_url || item.thumbnail_url) ? (
                                              <img src={item.media_type === "VIDEO" ? (item.thumbnail_url || item.media_url) : item.media_url} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="post" />
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
                                        {(item.media_url || item.thumbnail_url) ? (
                                          <img src={item.media_type === "VIDEO" ? (item.thumbnail_url || item.media_url) : item.media_url} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="post" />
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
