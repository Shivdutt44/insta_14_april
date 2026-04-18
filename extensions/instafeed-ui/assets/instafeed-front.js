/**
 * AI Instafeed - Storefront Extension
 * Mirrors the admin dashboard preview container EXACTLY.
 * Polls for live config changes every 30 seconds for instant updates.
 */

(function () {
  "use strict";

  const POLL_INTERVAL = 30000; // 30 s – reflects dashboard changes instantly
  const MAX_FEED_ITEMS = 500; // Increased to match auto-crawl capacity
  const PROXY_URL = "/apps/instafeed/data";

  let currentConfig = null;
  let currentMedia = [];

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  async function init() {
    console.log("[AI Instafeed] Initializing...");
    const gridRoot  = document.getElementById("ai-instafeed-grid-root");
    const storyRoot = document.getElementById("ai-instafeed-story-root");

    if (!gridRoot && !storyRoot) {
      console.log("[AI Instafeed] No roots found on this page.");
      return;
    }

    await loadAndRender();

    // Re-bind on theme editor events
    document.addEventListener("shopify:section:load", () => {
      console.log("[AI Instafeed] Section load detected");
      loadAndRender();
    });

    setInterval(async () => {
      await loadAndRender();
    }, POLL_INTERVAL);

    let lastIsMobile = window.innerWidth <= 768;
    window.addEventListener("resize", () => {
      const isMobile = window.innerWidth <= 768;
      if (isMobile !== lastIsMobile) {
        lastIsMobile = isMobile;
        const gRoot = document.getElementById("ai-instafeed-grid-root");
        const sRoot = document.getElementById("ai-instafeed-story-root");
        if (currentConfig && currentMedia) {
          if (gRoot) renderFeedGrid(gRoot, currentConfig, currentMedia);
          if (sRoot && currentConfig.stories?.enable) renderStoryLayout(sRoot, currentConfig, currentMedia);
        }
      }
    });
  }

  async function loadAndRender() {
    const gridRoot  = document.getElementById("ai-instafeed-grid-root");
    const storyRoot = document.getElementById("ai-instafeed-story-root");

    if (!gridRoot && !storyRoot) return;

    try {
      console.log("[AI Instafeed] Fetching data from:", PROXY_URL);
      const res = await fetch(PROXY_URL + "?t=" + Date.now(), {
        cache: "no-store",
        credentials: "same-origin",
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("[AI Instafeed] Proxy error:", res.status, text.slice(0, 100));
        throw new Error("Proxy returned " + res.status);
      }

      const json = await res.json();
      console.log("[AI Instafeed] Data received:", json ? "Success" : "Empty");

      if (json.error) throw new Error(json.error);

      const { config, instaData } = json;
      if (!config) {
        console.warn("[AI Instafeed] No config returned by proxy.");
        return;
      }

      const newConfigStr = JSON.stringify(config);
      let mediaData      = instaData?.media?.data || [];
      
      if (config.postFeed?.hiddenPostIds?.length > 0) {
        mediaData = mediaData.filter(item => !config.postFeed.hiddenPostIds.includes(item.id || item.media_url));
      }

      // Only re-render if config or data changed (prevents flicker)
      const isSame =
        newConfigStr === JSON.stringify(currentConfig) &&
        JSON.stringify(mediaData) === JSON.stringify(currentMedia);

      if (!isSame) {
        currentConfig = config;
        currentMedia  = mediaData;

        if (gridRoot  && config.postFeed) renderFeedGrid(gridRoot, config, mediaData);
        if (storyRoot && config.stories)  renderStoryLayout(storyRoot, config, mediaData);
        
        // Ensure Modal container exists
        if (!document.getElementById("ai-instafeed-modal-root")) {
          const modStr = `<div id="ai-instafeed-modal-root" style="position:fixed;inset:0;z-index:999999;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,0.85);backdrop-filter:blur(10px);"></div>`;
          document.body.insertAdjacentHTML('beforeend', modStr);
          document.getElementById("ai-instafeed-modal-root").addEventListener('click', function(e) {
            if (e.target.id === "ai-instafeed-modal-root") this.style.display = 'none';
          });
        }
      }
    } catch (err) {
      console.warn("[AI Instafeed] Could not load data:", err.message);
    }
  }

  // ── Placeholder images (same as dashboard fallbacks) ─────────────────────
  const PLACEHOLDERS = [
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

  function getMedia(mediaData, count) {
    if (mediaData.length > 0) {
      return mediaData.slice(0, Math.min(count, MAX_FEED_ITEMS));
    }
    const base = [];
    for (let i = 0; i < count; i++) {
        base.push({
            id: 'placeholder_' + i,
            media_url: PLACEHOLDERS[i % PLACEHOLDERS.length],
            media_type: "IMAGE",
            like_count: Math.floor(Math.random() * 200) + 50,
            comments_count: Math.floor(Math.random() * 20) + 2,
            permalink: "#"
        });
    }
    return base.slice(0, Math.min(count, MAX_FEED_ITEMS));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FEED GRID — mirrors dashboard "post" tab preview EXACTLY
  // ══════════════════════════════════════════════════════════════════════════
  function renderFeedGrid(container, config, mediaData) {
    const c          = config.postFeed;
    const isMobile   = window.innerWidth <= 768;
    const columns    = isMobile ? c.mobileColumns : c.desktopColumns;
    const baseLimit  = isMobile ? (c.mobileLimit || 4) : (c.desktopLimit || 8);
    const limit      = c.load ? Math.max(baseLimit, currentDisplayLimit) : baseLimit;
    
    if (!c.load) {
      currentDisplayLimit = 0;
      if (infiniteObserver) {
          infiniteObserver.disconnect();
          infiniteObserver = null;
      }
    }

    const gap        = c.gap;
    const mediaItems = getMedia(mediaData, limit);
    const trackId    = "ai-fw-grid-track-" + Date.now();
    const hSize      = c.typography?.heading?.size ? (c.typography.heading.size + (isMobile ? 0 : 2)) : 18;
    const subSize    = c.typography?.subheading?.size ? (c.typography.subheading.size + (isMobile ? 0 : 1)) : 12;

    let html = `<div class="ai-instafeed-root" style="font-family:inherit;width:100%;max-width:1200px;margin:0 auto;box-sizing:border-box;padding-top:${c.paddingTop ?? 32}px;padding-bottom:${c.paddingBottom ?? 32}px;">`;

    if (c.header) {
      html += `
        <div style="text-align:${c.alignment};margin-bottom:24px;">
          <h2 style="
            font-size:${hSize}px;
            font-weight:${c.typography?.heading?.weight || '800'};
            color:${c.typography?.heading?.color || '#000'};
            margin:0 0 8px 0;
            line-height:1.2;
          ">${esc(c.heading)}</h2>
          <p style="
            font-size:${subSize}px;
            font-weight:${c.typography?.subheading?.weight || '500'};
            color:${c.typography?.subheading?.color || '#666'};
            margin:0;
          ">${esc(c.subheading)}</p>
        </div>`;
    }

    if (c.carousel) {
      const itemWidth = `calc((100% - ${(columns - 1) * gap}px) / ${columns})`;
      html += `
        <div class="ai-fw-carousel-wrapper" style="position:relative;width:100%;">
          <button class="ai-fw-nav ai-fw-prev" data-track-id="${trackId}" aria-label="Previous">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 16l-4-4 4-4"/></svg>
          </button>
          <div class="ai-fw-track" id="${trackId}" style="
            display:flex;
            overflow-x:auto;
            scroll-behavior:smooth;
            scrollbar-width:none;
            gap:${gap}px;
            padding:${gap}px 0;
          ">`;
      mediaItems.forEach((item) => { html += renderMediaCard(item, c, itemWidth); });
      html += `
          </div>
          <button class="ai-fw-nav ai-fw-next" data-track-id="${trackId}" aria-label="Next">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 16l4-4-4-4"/></svg>
          </button>
        </div>`;
    } else {
      html += `
        <div style="
          display:grid;
          grid-template-columns:repeat(${columns},1fr);
          gap:${gap}px;
        ">`;
      mediaItems.forEach((item) => { html += renderMediaCard(item, c, "100%"); });
      html += `</div>`;
    }

    if (!c.removeWatermark) {
      html += `
        <div style="text-align:center;padding:16px;font-size:12px;color:#9ca3af;">
          Powered by <a href="https://www.booststar.in/" target="_blank" rel="noopener noreferrer" style="font-weight:700;color:#64748b;text-decoration:none;">BOOST STAR Experts</a>
        </div>`;
    }

    if (c.load && mediaData.length > limit) {
      html += `<div id="ai-infinite-sentinel" style="height:40px;width:100%;display:flex;align-items:center;justify-content:center;margin-top:20px;">
        <div style="width:20px;height:20px;border:2px solid #ddd;border-top-color:#6366f1;border-radius:50%;animation:ai-spin 0.8s linear infinite;"></div>
        <style>@keyframes ai-spin { to { transform: rotate(360deg); } }</style>
      </div>`;
    }

    html += `</div>`;
    container.innerHTML = html;
    bindCarouselNav(container);
    
    if (c.load && mediaData.length > limit) {
      setupInfiniteScroll(container, config, mediaData);
    }
  }

  let infiniteObserver = null;
  let currentDisplayLimit = 0;

  function setupInfiniteScroll(container, config, mediaData) {
    const sentinel = document.getElementById("ai-infinite-sentinel");
    if (!sentinel) return;
    if (infiniteObserver) infiniteObserver.disconnect();
    const isMobile = window.innerWidth <= 768;
    const initialLimit = isMobile ? (config.postFeed.mobileLimit || 4) : (config.postFeed.desktopLimit || 8);
    if (currentDisplayLimit < initialLimit) {
        currentDisplayLimit = initialLimit;
    }
    infiniteObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        if (currentDisplayLimit < mediaData.length) {
          currentDisplayLimit += (isMobile ? 6 : 12); 
          renderFeedWithLimit(container, config, mediaData, currentDisplayLimit);
        } else {
          infiniteObserver.disconnect();
          sentinel.style.display = 'none';
        }
      }
    }, { rootMargin: '200px', threshold: 0.1 });
    infiniteObserver.observe(sentinel);
  }

  function renderFeedWithLimit(container, config, mediaData, limit) {
      const c = config.postFeed;
      const isMobile = window.innerWidth <= 768;
      const columns = isMobile ? c.mobileColumns : c.desktopColumns;
      const gap = c.gap;
      const mediaItems = getMedia(mediaData, limit);
      const gridBody = container.querySelector('.ai-instafeed-root > div:not([style*="text-align"])');
      if (!gridBody) {
          renderFeedGrid(container, config, mediaData);
          return;
      }
      let inner = "";
      if (c.carousel) {
          const itemWidth = `calc((100% - ${(columns - 1) * gap}px) / ${columns})`;
          mediaItems.forEach((item) => { inner += renderMediaCard(item, c, itemWidth); });
          const track = gridBody.querySelector('.ai-fw-track');
          if (track) track.innerHTML = inner;
      } else {
          mediaItems.forEach((item) => { inner += renderMediaCard(item, c, "100%"); });
          gridBody.innerHTML = inner;
      }
      if (limit >= mediaData.length) {
          const sentinel = document.getElementById("ai-infinite-sentinel");
          if (sentinel) sentinel.style.display = 'none';
          if (infiniteObserver) infiniteObserver.disconnect();
      }
  }

  function renderMediaCard(item, c, width) {
    const isVideo = item.media_type === "VIDEO";
    const src     = isVideo ? (item.thumbnail_url || item.media_url) : item.media_url;
    let inner = "";
    if (isVideo && c.autoplay) {
      inner = `<video src="${esc(item.media_url)}" autoplay muted loop playsinline style="width:100%;height:100%;object-fit:cover;display:block;"></video>`;
    } else if (src) {
      inner = `<img loading="lazy" src="${esc(src)}" alt="Instagram post" style="width:100%;height:100%;object-fit:cover;display:block;">`;
    } else {
      inner = `<div style="width:100%;height:100%;background:#f1f5f9;"></div>`;
    }
    let mediaIcon = "";
    if (isVideo) {
      mediaIcon = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill="#FFFFFF" fill-rule="evenodd" clip-rule="evenodd" d="M2 7.25h3.614L9.364 2H6a4 4 0 0 0-4 4v1.25Zm20 0h-6.543l3.641-5.097A4.002 4.002 0 0 1 22 6v1.25ZM2 8.75h20V18a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8.75Zm5.457-1.5L11.207 2h6.157l-3.75 5.25H7.457Zm7.404 7.953a.483.483 0 0 0 0-.837l-3.985-2.3a.483.483 0 0 0-.725.418v4.601c0 .372.403.605.725.419l3.985-2.301Z" /></svg>`;
    } else if (item.media_type === "CAROUSEL_ALBUM") {
      mediaIcon = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill="#FFFFFF" d="M20.453 8.5c.005.392.005.818.005 1.279v3.2c0 1.035 0 1.892-.057 2.591-.06.728-.187 1.403-.511 2.038a5.214 5.214 0 0 1-2.278 2.279c-.636.323-1.31.451-2.038.51-.699.058-1.556.058-2.59.058h-3.2c-.32 0-.624 0-.911-.002H5.395A3.856 3.856 0 0 0 8.485 22h7.724A5.793 5.793 0 0 0 22 16.207V8.483a3.856 3.856 0 0 0-1.548-3.093V8.5Z"/><path fill="#FFFFFF" fill-rule="evenodd" clip-rule="evenodd" d="M2 5.4A3.4 3.4 0 0 1 5.4 2h10.2A3.4 3.4 0 0 1 19 5.4v5.482l-1.91-1.25a4.037 4.037 0 0 0-4.767.253L7.87 13.528a2.763 2.763 0 0 1-3.262.173L2 11.994V5.4Zm14.392 5.299L19 12.406V15.6a3.4 3.4 0 0 1-3.4 3.4H5.4A3.4 3.4 0 0 1 2 15.6v-2.082l1.91 1.25a4.038 4.038 0 0 0 4.767-.253l4.453-3.643a2.763 2.763 0 0 1 3.262-.173ZM7.525 9.65a2.125 2.125 0 1 0 0-4.25 2.125 2.125 0 0 0 0 4.25Z"/></svg>`;
    }
    const metrics = c.metrics ? `
      <div style="display:flex;align-items:center;gap:6px;">
        <svg width="18" height="18" viewBox="0 0 20 20" fill="white"><path d="M14.5 3c-1.2 0-2.3.6-3 1.5-.7-.9-1.8-1.5-3-1.5-1.2 0-2.6.4-3.2 2-.6 1.6.2 3.7 1.8 5.4 1.5 1.6 4.4 4.1 4.4 4.1s2.9-2.5 4.4-4.1c1.6-1.7 2.4-3.8 1.8-5.4-.6-1.6-2-2-3.2-2z"/></svg>
        <span>${item.like_count || 0}</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;">
        <svg width="18" height="18" viewBox="0 0 20 20" fill="white"><path d="M17 14c-.5 0-1 .4-1 1v2H4V5h12v2c0 .5.4 1 1 1s1-.5 1-1V5c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2-2 2h12.6l2.7 2.7c.1.1.2.2.3.2.4.1.8-.1 1-.5V8c0-.5-.4-1-1-1s-1 .4-1 1v6c0 .5-.4 1-1 1z"/></svg>
        <span>${item.comments_count || 0}</span>
      </div>` : "";
    const instagramLogo = (c.showInstagramIcon !== false) ? `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.791-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.209-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>` : "";
    const aspect = (c.aspectRatio && c.aspectRatio !== "auto") ? c.aspectRatio : "4/5";
    const itemStyle = (aspect !== "auto") ? `aspect-ratio:${aspect};` : "";

    return `
      <div class="ai-grid-wrapper" style="flex-shrink:0; width:${width}; box-sizing:border-box; display:flex;">
        <div class="ai-grid-item" onclick="window.aiOpenInstaModal('${item.id || item.media_url.slice(-20)}')" 
             style="text-decoration:none; display:flex; flex-direction:column; cursor:pointer; width:100%; height:100%; background:#f1f5f9; position:relative; ${itemStyle}">
            ${inner}
            <div class="ai-badge">${mediaIcon}</div>
            <div class="ai-card-overlay"></div>
            <div class="ai-metrics">${metrics}</div>
            <div class="ai-ig-icon">${instagramLogo}</div>
        </div>
      </div>`;
  }

  function renderStoryLayout(container, config, mediaData) {
    const s         = config.stories;
    const ringColor = s.ringColor || config.postFeed?.typography?.heading?.color || "#6366f1";
    const storyItems = getMedia(mediaData, 15);
    const isActiveRing = s.activeRing !== false;
    const trackId = "ai-story-track-" + Date.now();

    let html = `<div class="ai-instafeed-root" style="font-family:inherit;width:100%;max-width:1200px;margin:0 auto;box-sizing:border-box;padding-top:${s.paddingTop ?? 24}px;padding-bottom:${s.paddingBottom ?? 24}px;">`;

    if (s.showHeader) {
      html += `
        <div style="text-align:${s.alignment};margin-bottom:24px;">
          <h4 style="font-size:${s.typography?.heading?.size || 28}px;font-weight:${s.typography?.heading?.weight || '800'};color:${s.typography?.heading?.color || '#000'};margin:0 0 8px 0;line-height:1.2;">${esc(s.heading)}</h4>
          <p style="font-size:${s.typography?.subheading?.size || 14}px;font-weight:${s.typography?.subheading?.weight || '400'};color:${s.typography?.subheading?.color || '#666'};margin:0;">${esc(s.subheading)}</p>
        </div>`;
    }

    if (s.enable) {
      const isShowNav = s.showNavigation !== false;
      html += `
        <div class="ai-fw-carousel-wrapper" style="position:relative;width:100%;padding:0 24px;">
          ${isShowNav ? `
            <button class="ai-fw-nav ai-fw-prev" data-track-id="${trackId}" aria-label="Previous" style="width:28px;height:28px;left:0px;top:32px;transform:translateY(-50%);">
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 16l-4-4 4-4"/></svg>
            </button>
          ` : ''}
          <div id="${trackId}" class="ai-fw-track" style="display:flex;overflow-x:auto;scroll-behavior:smooth;scrollbar-width:none;gap:16px;padding:8px 4px 12px;">`;

      storyItems.forEach((item, i) => {
        const isVideo  = item.media_type === "VIDEO";
        const src      = isVideo ? (item.thumbnail_url || item.media_url) : item.media_url;
        const href     = item.permalink || "#";
        const target   = href === "#" ? "_self" : "_blank";
        const label    = item.caption ? esc(item.caption.split(" ")[0]) : `Story ${i + 1}`;
        const mediaTpl = (isVideo && s.autoplay)
          ? `<video src="${esc(item.media_url)}" autoplay muted loop playsinline style="width:100%;height:100%;object-fit:cover;display:block;"></video>`
          : (src ? `<img loading="lazy" src="${esc(src)}" alt="story" class="${s.animateImages ? 'ai-ken-burns' : ''}" style="width:100%;height:100%;object-fit:cover;display:block;">` : `<div style="width:100%;height:100%;background:#f1f5f9;"></div>`);

        html += `
          <div style="flex-shrink:0;width:72px;text-align:center;cursor:pointer;">
            <a href="${esc(href)}" target="${target}" rel="noopener noreferrer" style="text-decoration:none;display:block;">
              <div style="width:64px;height:64px;border-radius:50%;padding:3px;border: ${isActiveRing ? 'none' : '2px solid ' + ringColor};background:white;margin:0 auto 6px;transition:transform 0.2s;position:relative;" onmouseenter="this.style.transform='scale(1.08)'" onmouseleave="this.style.transform='scale(1)'">
                ${isActiveRing ? `<svg viewBox="0 0 100 100" style="position:absolute;top:0;left:0;width:100%;height:100%;z-index:2;pointer-events:none;animation: ai-rotateRing 10s linear infinite;overflow:visible;transform-origin:50% 50%;"><circle cx="50" cy="50" r="48" fill="none" stroke="${ringColor}" stroke-width="3" stroke-dasharray="12 8" /></svg>` : ''}
                <div style="width:100%;height:100%;border-radius:50%;overflow:hidden;background:#f1f5f9;position:relative;z-index:1;">${mediaTpl}</div>
              </div>
              <div style="font-size:10px;color:#64748b;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${label}</div>
            </a>
          </div>`;
      });

      html += `</div>
          ${isShowNav ? `
            <button class="ai-fw-nav ai-fw-next" data-track-id="${trackId}" aria-label="Next" style="width:28px;height:28px;right:0px;top:32px;transform:translateY(-50%);">
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 16l4-4-4-4"/></svg>
            </button>
          ` : ''}
        </div>`;
    }
    html += `</div>`;
    container.innerHTML = html;
    bindCarouselNav(container);
  }

  function bindCarouselNav(root) {
    root.querySelectorAll(".ai-fw-nav").forEach((btn) => {
      btn.addEventListener("click", () => {
        const trackId = btn.getAttribute("data-track-id");
        const track   = trackId ? document.getElementById(trackId) : null;
        if (!track) return;
        const amount = track.clientWidth * 0.8;
        track.scrollBy({ left: btn.classList.contains("ai-fw-prev") ? -amount : amount, behavior: "smooth" });
      });
    });
  }

  function esc(str) {
    if (!str) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  window.aiOpenInstaModal = function(id) {
    const item = currentMedia.find(m => (m.id || m.media_url.slice(-20)) === id);
    if (!item) return;
    const root = document.getElementById("ai-instafeed-modal-root");
    if (!root) return;
    const isVideo = item.media_type === "VIDEO";
    const mediaHtml = isVideo 
      ? `<video src="${item.media_url}" autoplay loop muted playsinline style="max-width:100%;max-height:100%;object-fit:contain;"></video>`
      : `<img src="${item.media_url}" style="max-width:100%;max-height:100%;object-fit:contain;">`;
    
    root.innerHTML = `
      <div class="ai-modal-content" style="background:white;width:100%;max-width:1000px;max-height:90vh;border-radius:24px;display:flex;overflow:hidden;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);flex-direction:${window.innerWidth < 768 ? 'column' : 'row'};">
        <div style="flex:1.2;background:#000;display:flex;align-items:center;justify-content:center;position:relative;">
          ${mediaHtml}
          <button onclick="document.getElementById('ai-instafeed-modal-root').style.display='none'" style="position:absolute;top:16px;right:16px;background:rgba(255,255,255,0.9);border:none;width:36px;height:36px;border-radius:50%;cursor:pointer;font-weight:bold;display:${window.innerWidth < 768 ? 'flex' : 'none'};align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,0.15);">✕</button>
        </div>
        <div style="flex:0.8;display:flex;flex-direction:column;background:white;padding:32px;min-width:320px;">
          <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px;border-bottom:1px solid #f1f5f9;padding-bottom:20px;">
            <div style="width:48px;height:48px;border-radius:50%;background:var(--ai-accent-gradient);display:flex;align-items:center;justify-content:center;color:white;box-shadow:0 4px 10px rgba(99,102,241,0.2);">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.791-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.209-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
            </div>
            <div style="flex:1;">
              <div style="font-weight:800;font-size:18px;color:#0f172a;">@${currentConfig.instagramHandle || 'instagram'}</div>
              <div style="font-size:13px;color:#64748b;font-weight:500;">Instagram Feed</div>
            </div>
            <button onclick="document.getElementById('ai-instafeed-modal-root').style.display='none'" style="background:#f8fafc;border:1px solid #e2e8f0;padding:10px;border-radius:12px;cursor:pointer;display:${window.innerWidth >= 768 ? 'flex' : 'none'};transition:all 0.2s ease;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='#f8fafc'">
              <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="#64748b" stroke-width="2.5"><path d="M15 5l-10 10m0-10l10 10"/></svg>
            </button>
          </div>
          <div class="ai-modal-body" style="flex:1;overflow-y:auto;margin-bottom:24px;padding-right:8px;">
            <p style="margin:0;font-size:15px;line-height:1.7;color:#334155;white-space:pre-wrap;">${esc(item.caption)}</p>
            <div style="margin-top:20px;font-size:12px;color:#94a3b8;font-weight:700;display:flex;align-items:center;gap:6px;">
              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a8 8 0 100 16 8 8 0 000-16zm0 14a6 6 0 110-12 6 6 0 010 12zm1-6V6a1 1 0 10-2 0v5a1 1 0 00.5.86l3 1.73a1 1 0 001-1.73L11 10z"/></svg>
              ${item.timestamp ? new Date(item.timestamp).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : 'Recently'}
            </div>
          </div>
          <div style="border-top:1px solid #f1f5f9;padding-top:24px;">
            <div style="display:flex;gap:32px;margin-bottom:24px;">
              <div style="display:flex;align-items:center;gap:10px;">
                <svg width="24" height="24" viewBox="0 0 20 20" fill="#ef4444"><path d="M14.5 3c-1.2 0-2.3.6-3 1.5-.7-.9-1.8-1.5-3-1.5-1.2 0-2.6.4-3.2 2-.6 1.6.2 3.7 1.8 5.4 1.5 1.6 4.4 4.1 4.4 4.1s2.9-2.5 4.4-4.1c1.6-1.7 2.4-3.8 1.8-5.4-.6-1.6-2-2-3.2-2z"/></svg>
                <span style="font-weight:800;font-size:20px;color:#0f172a;">${item.like_count || 0}</span>
              </div>
              <div style="display:flex;align-items:center;gap:10px;">
                <svg width="24" height="24" viewBox="0 0 20 20" fill="#64748b"><path d="M17 14c-.5 0-1 .4-1 1v2H4V5h12v2c0 .5.4 1 1 1s1-.5 1-1V5c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2-2 2h12.6l2.7 2.7c.1.1.2.2.3.2.4.1.8-.1 1-.5V8c0-.5-.4-1-1-1s-1 .4-1 1v6c0 .5-.4 1-1 1z"/></svg>
                <span style="font-weight:800;font-size:20px;color:#0f172a;">${item.comments_count || 0}</span>
              </div>
            </div>
            <a href="${item.permalink}" target="_blank" rel="noreferrer" style="display:flex;align-items:center;justify-content:center;height:52px;background:#000;color:white;text-decoration:none;border-radius:16px;font-weight:800;font-size:15px;width:100%;transition:all 0.2s ease;box-shadow:0 4px 12px rgba(0,0,0,0.1);" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 20px rgba(0,0,0,0.15)'" onmouseout="this.style.transform='translateY(0)';this.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)'">View on Instagram</a>
          </div>
        </div>
      </div>
    `;
    root.style.display = 'flex';
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
