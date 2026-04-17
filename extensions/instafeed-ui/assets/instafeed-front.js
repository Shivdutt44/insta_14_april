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
    // Strictly enforce manual limits if infinite paging is disabled
    const baseLimit = isMobile ? (c.mobileLimit || 4) : (c.desktopLimit || 8);
    const limit = c.load ? Math.max(baseLimit, currentDisplayLimit) : baseLimit;
    
    // Reset display state if load was recently disabled
    if (!c.load) {
      currentDisplayLimit = 0;
      if (infiniteObserver) {
          infiniteObserver.disconnect();
          infiniteObserver = null;
      }
    }

    const gap        = c.gap;
    const mediaItems = getMedia(mediaData, limit);

    // Use a unique track ID scoped to this container to avoid conflicts when
    // both the grid AND story blocks appear on the same page.
    const trackId = "ai-fw-grid-track-" + Date.now();

    let html = `<div class="ai-instafeed-root" style="font-family:inherit;width:100%;max-width:1200px;margin:0 auto;box-sizing:border-box;">`;

    // ── Header ──
    if (c.header) {
      html += `
        <div style="text-align:${c.alignment};margin-bottom:24px;">
          <h2 style="
            font-size:${c.typography.heading.size}px;
            font-weight:${c.typography.heading.weight};
            color:${c.typography.heading.color};
            margin:0 0 8px 0;
            line-height:1.2;
          ">${esc(c.heading)}</h2>
          <p style="
            font-size:${c.typography.subheading.size}px;
            font-weight:${c.typography.subheading.weight};
            color:${c.typography.subheading.color};
            margin:0;
          ">${esc(c.subheading)}</p>
        </div>`;
    }

    // ── Carousel or Grid ──
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
          Powered by <span style="font-weight:700;color:#64748b;">BOOST STAR Experts</span>
        </div>`;
    }

    // ── Infinite Paging Sentinel ──
    if (c.load && mediaData.length > limit) {
      html += `<div id="ai-infinite-sentinel" style="height:40px;width:100%;display:flex;align-items:center;justify-content:center;margin-top:20px;">
        <div style="width:20px;height:20px;border:2px solid #ddd;border-top-color:#6366f1;border-radius:50%;animation:ai-spin 0.8s linear infinite;"></div>
        <style>@keyframes ai-spin { to { transform: rotate(360deg); } }</style>
      </div>`;
    }

    html += `</div>`;
    container.innerHTML = html;
    bindCarouselNav(container);
    
    // Attach observer if infinite paging is enabled
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
    
    // Initialize currentDisplayLimit if not set or if config changed
    if (currentDisplayLimit < initialLimit) {
        currentDisplayLimit = initialLimit;
    }

    infiniteObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        if (currentDisplayLimit < mediaData.length) {
          // Use a slightly larger batch for better experience
          currentDisplayLimit += (isMobile ? 6 : 12); 
          renderFeedWithLimit(container, config, mediaData, currentDisplayLimit);
        } else {
          infiniteObserver.disconnect();
          sentinel.style.display = 'none';
        }
      }
    }, { 
      rootMargin: '200px', // Trigger before user hits absolute bottom
      threshold: 0.1 
    });

    infiniteObserver.observe(sentinel);
  }

  function renderFeedWithLimit(container, config, mediaData, limit) {
      // Re-render feed with the increased limit
      // We only update the grid/carousel part to avoid full re-render flickering
      const c = config.postFeed;
      const isMobile = window.innerWidth <= 768;
      const columns = isMobile ? c.mobileColumns : c.desktopColumns;
      const gap = c.gap;
      const mediaItems = getMedia(mediaData, limit);
      
      const gridBody = container.querySelector('.ai-instafeed-root > div:not([style*="text-align"])');
      if (!gridBody) {
          renderFeedGrid(container, config, mediaData); // Fallback
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

      // Check if we hit the end
      if (limit >= mediaData.length) {
          const sentinel = document.getElementById("ai-infinite-sentinel");
          if (sentinel) sentinel.style.display = 'none';
          if (infiniteObserver) infiniteObserver.disconnect();
      }
  }

  // ── Single media card ──────────────────────────────────────────────────────
  function renderMediaCard(item, c, width) {
    const isVideo = item.media_type === "VIDEO";
    const src     = isVideo ? (item.thumbnail_url || item.media_url) : item.media_url;

    let inner = "";
    if (isVideo && c.autoplay) {
      inner = `<video src="${esc(item.media_url)}" autoplay muted loop playsinline
        style="width:100%;height:100%;object-fit:cover;display:block;"></video>`;
    } else if (src) {
      inner = `<img loading="lazy" src="${esc(src)}" alt="Instagram post"
        style="width:100%;height:100%;object-fit:cover;display:block;">`;
    } else {
      inner = `<div style="width:100%;height:100%;background:#f1f5f9;"></div>`;
    }

    let mediaIcon = "";
    if (isVideo) {
      mediaIcon = `
        <div class="media-icon-badge" style="position:absolute;top:8px;right:8px;z-index:10;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0px 2px 4px rgba(0,0,0,0.3));transition:opacity 0.25s ease;">
          <svg color="white" fill="white" width="20" height="20" viewBox="0 0 20 20"><path d="M15 10l-7 4.5v-9l7 4.5z"/></svg>
        </div>`;
    } else if (item.media_type === "CAROUSEL_ALBUM") {
      mediaIcon = `
        <div class="media-icon-badge" style="position:absolute;top:8px;right:8px;z-index:10;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0px 2px 4px rgba(0,0,0,0.3));transition:opacity 0.25s ease;">
          <svg fill="white" width="20" height="20" viewBox="0 0 20 20"><path d="M13 13h4v4h-4v-4zm0-6h4v4h-4v-4zm-6 6h4v4H7v-4zm0-6h4v4H7v-4z"/></svg>
        </div>`;
    }

    const metrics = c.metrics
      ? `<div style="
          position:absolute;bottom:12px;left:12px;
          display:flex;gap:12px;color:white;font-size:14px;font-weight:700;
          opacity:0;transition:all 0.25s ease;pointer-events:none;z-index:6;
          white-space:nowrap;transform:translateY(10px);
        " class="ai-metrics">
          <div style="display:flex;align-items:center;gap:6px;">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="white"><path d="M14.5 3c-1.2 0-2.3.6-3 1.5-.7-.9-1.8-1.5-3-1.5-1.2 0-2.6.4-3.2 2-.6 1.6.2 3.7 1.8 5.4 1.5 1.6 4.4 4.1 4.4 4.1s2.9-2.5 4.4-4.1c1.6-1.7 2.4-3.8 1.8-5.4-.6-1.6-2-2-3.2-2z"/></svg>
            <span>${item.like_count || 0}</span>
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="white"><path d="M17 14c-.5 0-1 .4-1 1v2H4V5h12v2c0 .5.4 1 1 1s1-.5 1-1V5c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12.6l2.7 2.7c.1.1.2.2.3.2.4.1.8-.1 1-.5V8c0-.5-.4-1-1-1s-1 .4-1 1v6c0 .5-.4 1-1 1z"/></svg>
            <span>${item.comments_count || 0}</span>
          </div>
        </div>`
      : "";

    const instagramLogo = (c.showInstagramIcon !== false)
      ? `<div class="ai-ig-icon" style="position:absolute;top:50%;left:50%;opacity:0;transform:translate(-50%, -40%) scale(0.8);transition:all 0.25s ease;pointer-events:none;z-index:7;">
          <svg width="24" height="24" viewBox="0 0 20 20" fill="white"><path d="M13 10a3 3 0 11-6 0 3 3 0 016 0zm3-3H4a2 2 0 00-2 2v6a2 2 0 002 2h12a2 2 0 002-2V9a2 2 0 00-2-2z"/></svg>
        </div>`
      : "";

    // Dark overlay background for hover
    const overlay = `<div class="ai-card-overlay" style="position:absolute;inset:0;background:rgba(0,0,0,0.4);opacity:0;transition:opacity 0.25s;z-index:4;"></div>`;

    const aspect = c.aspectRatio === "auto" ? "auto" : (c.aspectRatio || "1/1");
    return `
      <div style="flex-shrink:0;width:${width};box-sizing:border-box;">
        <div 
          style="text-decoration:none;display:block;cursor:pointer;"
          onclick="window.aiOpenInstaModal('${item.id || item.media_url.slice(-20)}')"
          onmouseenter="
            var m=this.querySelector('.ai-metrics');if(m){m.style.opacity='1';m.style.transform='translateY(0)';}
            var i=this.querySelector('.ai-ig-icon');if(i){i.style.opacity='1';i.style.transform='translate(-50%,-50%) scale(1)';}
            var b=this.querySelector('.media-icon-badge');if(b){b.style.opacity='0';}
            var o=this.querySelector('.ai-card-overlay');if(o)o.style.opacity='1';
          "
          onmouseleave="
            var m=this.querySelector('.ai-metrics');if(m){m.style.opacity='0';m.style.transform='translateY(10px)';}
            var i=this.querySelector('.ai-ig-icon');if(i){i.style.opacity='0';i.style.transform='translate(-50%,-40%) scale(0.8)';}
            var b=this.querySelector('.media-icon-badge');if(b){b.style.opacity='1';}
            var o=this.querySelector('.ai-card-overlay');if(o)o.style.opacity='0';
          ">
          <div style="aspect-ratio:${aspect};background:#f1f5f9;border-radius:6px;overflow:hidden;position:relative;">
            ${inner}
            ${mediaIcon}
            ${overlay}
            ${metrics}
            ${instagramLogo}
          </div>
        </div>
      </div>`;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STORY LAYOUT — mirrors dashboard "story" tab preview EXACTLY
  // ══════════════════════════════════════════════════════════════════════════
  function renderStoryLayout(container, config, mediaData) {
    const s         = config.stories;
    const ringColor = s.ringColor || config.postFeed?.typography?.heading?.color || "#6366f1";
    const storyItems = getMedia(mediaData, 15);
    const isActiveRing = s.activeRing !== false;

    // Unique track ID
    const trackId = "ai-story-track-" + Date.now();

    let html = `<div class="ai-instafeed-root" style="font-family:inherit;width:100%;max-width:1200px;margin:0 auto;box-sizing:border-box;">`;

    // ── Header ──
    if (s.showHeader) {
      html += `
        <div style="text-align:${s.alignment};margin-bottom:24px;">
          <h3 style="
            font-size:${s.typography.heading.size}px;
            font-weight:${s.typography.heading.weight};
            color:${s.typography.heading.color};
            margin:0 0 8px 0;line-height:1.2;
          ">${esc(s.heading)}</h3>
          <p style="
            font-size:${s.typography.subheading.size}px;
            font-weight:${s.typography.subheading.weight};
            color:${s.typography.subheading.color};
            margin:0;
          ">${esc(s.subheading)}</p>
        </div>`;
    }

    // ── Story bubbles ──
    if (s.enable) {
      html += `
        <div style="position:relative;width:100%;">
          ${s.showNavigation ? `
            <button class="ai-fw-nav ai-fw-prev" data-track-id="${trackId}" aria-label="Previous"
              style="left:-16px;top:42px;transform:translateY(-50%);">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 16l-4-4 4-4"/></svg>
            </button>
          ` : ''}
          <div id="${trackId}" class="ai-fw-track" style="
            display:flex;
            overflow-x:auto;
            scroll-behavior:smooth;
            scrollbar-width:none;
            gap:20px;
            padding:8px 4px 16px;
          ">`;

      storyItems.forEach((item, i) => {
        const isVideo  = item.media_type === "VIDEO";
        const src      = isVideo ? (item.thumbnail_url || item.media_url) : item.media_url;
        const href     = item.permalink || "#";
        const target   = href === "#" ? "_self" : "_blank";
        const label    = item.caption ? esc(item.caption.split(" ")[0]) : `Story ${i + 1}`;
        
        const mediaTpl = (isVideo && s.autoplay)
          ? `<video src="${esc(item.media_url)}" autoplay muted loop playsinline
              style="width:100%;height:100%;object-fit:cover;display:block;"></video>`
          : (src
              ? `<img loading="lazy" src="${esc(src)}" alt="story"
                  class="${s.animateImages ? 'ai-ken-burns' : ''}"
                  style="width:100%;height:100%;object-fit:cover;display:block;">`
              : `<div style="width:100%;height:100%;background:#f1f5f9;"></div>`);

        html += `
          <div style="flex-shrink:0;width:76px;text-align:center;cursor:pointer;">
            <a href="${esc(href)}" target="${target}" rel="noopener noreferrer"
              style="text-decoration:none;display:block;">
              <div style="
                width:68px;height:68px;border-radius:50%;
                padding:3px;border: ${isActiveRing ? 'none' : '2.5px solid ' + ringColor};
                background:white;margin:0 auto 8px;overflow:hidden;
                transition:transform 0.2s;
                position:relative;
              " onmouseenter="this.style.transform='scale(1.08)'"
                 onmouseleave="this.style.transform='scale(1)'">
                ${isActiveRing ? `
                  <div class="ai-story-ring" style="
                    position:absolute;inset:0;border-radius:50%;
                    border:2.5px dashed ${ringColor};
                    animation: rotateRing 12s linear infinite;
                  "></div>
                ` : ''}
                <div style="width:100%;height:100%;border-radius:50%;overflow:hidden;background:#f1f5f9;position:relative;z-index:1;">
                  ${mediaTpl}
                </div>
              </div>
              <div style="font-size:11px;color:#333;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                ${label}
              </div>
            </a>
          </div>`;
      });

      html += `
          </div>
          ${s.showNavigation ? `
            <button class="ai-fw-nav ai-fw-next" data-track-id="${trackId}" aria-label="Next"
              style="right:-16px;top:42px;transform:translateY(-50%);">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 16l4-4-4-4"/></svg>
            </button>
          ` : ''}
        </div>`;
    }

    html += `</div>`;
    container.innerHTML = html;
    bindCarouselNav(container);
  }

  // ── Carousel Nav Binding ──────────────────────────────────────────────────
  // Uses data-track-id so multiple carousels on the same page each control
  // their own track (fixes the shared-id bug).
  function bindCarouselNav(root) {
    root.querySelectorAll(".ai-fw-nav").forEach((btn) => {
      btn.addEventListener("click", () => {
        const trackId = btn.getAttribute("data-track-id");
        const track   = trackId ? document.getElementById(trackId) : null;
        if (!track) return;
        const amount = track.clientWidth * 0.8;
        track.scrollBy({
          left: btn.classList.contains("ai-fw-prev") ? -amount : amount,
          behavior: "smooth",
        });
      });
    });
  }

  // ── XSS-safe escape ───────────────────────────────────────────────────────
  function esc(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ── Modal Logic ──────────────────────────────────────────────────────────
  window.aiOpenInstaModal = function(id) {
    const item = currentMedia.find(m => (m.id || m.media_url.slice(-20)) === id);
    if (!item) return;
    
    const root = document.getElementById("ai-instafeed-modal-root");
    if (!root) return;
    
    const isVideo = item.media_type === "VIDEO";
    const mediaHtml = isVideo 
      ? `<video src="${item.media_url}" autoplay loop muted playsinline style="max-width:100%;max-height:100%;object-fit:contain;"></video>`
      : `<img src="${item.media_url}" style="max-width:100%;max-height:100%;object-fit:contain;">`;

    const accent = currentConfig.postFeed?.typography?.heading?.color || "#6366f1";
    
    root.innerHTML = `
      <div style="background:white;width:100%;max-width:1000px;max-height:90vh;border-radius:20px;display:flex;overflow:hidden;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);flex-direction:${window.innerWidth < 768 ? 'column' : 'row'};">
        <div style="flex:1.2;background:#000;display:flex;align-items:center;justify-content:center;position:relative;">
          ${mediaHtml}
          <button onclick="document.getElementById('ai-instafeed-modal-root').style.display='none'" style="position:absolute;top:16px;right:16px;background:white;border:none;width:32px;height:32px;border-radius:50%;cursor:pointer;font-weight:bold;display:${window.innerWidth < 768 ? 'flex' : 'none'};align-items:center;justify-content:center;">✕</button>
        </div>
        <div style="flex:0.8;display:flex;flex-direction:column;background:white;padding:24px;min-width:320px;">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;border-bottom:1px solid #f1f5f9;padding-bottom:16px;">
            <div style="width:40px;height:40px;border-radius:50%;background:${accent};display:flex;align-items:center;justify-content:center;color:white;">
              <svg width="24" height="24" viewBox="0 0 20 20" fill="currentColor"><path d="M13 10a3 3 0 11-6 0 3 3 0 016 0zm3-3H4a2 2 0 00-2 2v6a2 2 0 002 2h12a2 2 0 002-2V9a2 2 0 00-2-2z"/></svg>
            </div>
            <div>
              <div style="font-weight:700;font-size:16px;">@${currentConfig.instagramHandle || 'instagram'}</div>
              <div style="font-size:12px;color:#64748b;">Instagram</div>
            </div>
            <button onclick="document.getElementById('ai-instafeed-modal-root').style.display='none'" style="margin-left:auto;background:#f8fafc;border:1px solid #e2e8f0;padding:8px;border-radius:8px;cursor:pointer;display:${window.innerWidth >= 768 ? 'flex' : 'none'};">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 5l-10 10m0-10l10 10"/></svg>
            </button>
          </div>
          <div style="flex:1;overflow-y:auto;margin-bottom:24px;">
            <p style="margin:0;font-size:14px;line-height:1.6;color:#334155;">${esc(item.caption)}</p>
            <div style="margin-top:16px;font-size:11px;color:#94a3b8;font-weight:600;">${item.timestamp ? new Date(item.timestamp).toLocaleDateString() : 'Recently'}</div>
          </div>
          <div style="border-top:1px solid #f1f5f9;padding-top:20px;">
            <div style="display:flex;gap:24px;margin-bottom:20px;">
              <div style="display:flex;align-items:center;gap:8px;">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="#ef4444"><path d="M14.5 3c-1.2 0-2.3.6-3 1.5-.7-.9-1.8-1.5-3-1.5-1.2 0-2.6.4-3.2 2-.6 1.6.2 3.7 1.8 5.4 1.5 1.6 4.4 4.1 4.4 4.1s2.9-2.5 4.4-4.1c1.6-1.7 2.4-3.8 1.8-5.4-.6-1.6-2-2-3.2-2z"/></svg>
                <span style="font-weight:700;font-size:18px;">${item.like_count || 0}</span>
              </div>
              <div style="display:flex;align-items:center;gap:8px;">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path d="M17 14c-.5 0-1 .4-1 1v2H4V5h12v2c0 .5.4 1 1 1s1-.5 1-1V5c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12.6l2.7 2.7c.1.1.2.2.3.2.4.1.8-.1 1-.5V8c0-.5-.4-1-1-1s-1 .4-1 1v6c0 .5-.4 1-1 1z"/></svg>
                <span style="font-weight:700;font-size:18px;">${item.comments_count || 0}</span>
              </div>
            </div>
            <a href="${item.permalink}" target="_blank" rel="noreferrer" style="display:flex;align-items:center;justify-content:center;height:44px;background:#000;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:14px;width:100%;">View on Instagram</a>
          </div>
        </div>
      </div>
    `;
    root.style.display = 'flex';
  };

  // ── Start ─────────────────────────────────────────────────────────────────
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
