/**
 * AI Instafeed - Storefront Extension
 * Mirrors the admin dashboard preview container EXACTLY.
 * Polls for live config changes every 30 seconds for instant updates.
 */

(function () {
  "use strict";

  const POLL_INTERVAL = 30000; // 30 s – reflects dashboard changes instantly
  const MAX_FEED_ITEMS = 50;
  const PROXY_URL = "/apps/instafeed/data";

  let currentConfig = null;
  let currentMedia = [];

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  async function init() {
    const gridRoot  = document.getElementById("ai-instafeed-grid-root");
    const storyRoot = document.getElementById("ai-instafeed-story-root");

    if (!gridRoot && !storyRoot) return;

    await loadAndRender(gridRoot, storyRoot);

    setInterval(async () => {
      await loadAndRender(gridRoot, storyRoot);
    }, POLL_INTERVAL);

    let lastIsMobile = window.innerWidth <= 768;
    window.addEventListener("resize", () => {
      const isMobile = window.innerWidth <= 768;
      if (isMobile !== lastIsMobile) {
        lastIsMobile = isMobile;
        if (currentConfig && currentMedia) {
          if (gridRoot) renderFeedGrid(gridRoot, currentConfig, currentMedia);
          if (storyRoot && currentConfig.stories?.enable) renderStoryBlocks(storyRoot, currentConfig, currentMedia);
        }
      }
    });
  }

  async function loadAndRender(gridRoot, storyRoot) {
    try {
      const res = await fetch(PROXY_URL + "?t=" + Date.now(), {
        cache: "no-store",
        credentials: "same-origin",
      });

      if (!res.ok) throw new Error("Proxy returned " + res.status);

      const json = await res.json();
      if (json.error) throw new Error(json.error);

      const { config, instaData } = json;
      if (!config) return;

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
      }
    } catch (err) {
      console.warn("[AI Instafeed] Could not load data:", err.message);
    }
  }

  // ── Placeholder images (same as dashboard fallbacks) ─────────────────────
  const PLACEHOLDERS = [
    "https://images.unsplash.com/photo-1611162147679-aa3c393bc3ec?w=400&h=400&fit=crop",
    "https://images.unsplash.com/photo-1542435503-956c469947f6?w=400&h=400&fit=crop",
    "https://images.unsplash.com/photo-1493723843671-1d655e8d717f?w=400&h=400&fit=crop",
    "https://images.unsplash.com/photo-1512314889357-e157c22f938d?w=400&h=400&fit=crop",
    "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=400&h=400&fit=crop",
    "https://images.unsplash.com/photo-1519985176271-adb1088fa94c?w=400&h=400&fit=crop",
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
    const limit      = isMobile ? (c.mobileLimit || 4) : (c.desktopLimit || 8);
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
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
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
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
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

    html += `</div>`;
    container.innerHTML = html;
    bindCarouselNav(container);
  }

  // ── Single media card ──────────────────────────────────────────────────────
  function renderMediaCard(item, c, width) {
    const isVideo = item.media_type === "VIDEO";
    const src     = isVideo ? (item.thumbnail_url || item.media_url) : item.media_url;
    const href    = item.permalink || "#";
    const target  = href === "#" ? "_self" : "_blank";

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
          <svg aria-label="Reels" color="white" fill="white" width="18" height="18" role="img" viewBox="0 0 24 24">
            <line fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="2" x1="2.049" x2="21.95" y1="7.002" y2="7.002"></line>
            <line fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="13.504" x2="16.362" y1="2.001" y2="7.002"></line>
            <line fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="7.207" x2="10.002" y1="2.11" y2="7.002"></line>
            <path d="M2.049 2.001h20v20h-20z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path>
            <path d="M9.763 17.664a.908.908 0 0 1-.454-.787V11.63a.909.909 0 0 1 1.364-.788l4.545 2.624a.909.909 0 0 1 0 1.575l-4.545 2.624a.91.91 0 0 1-.91 0Z"></path>
          </svg>
        </div>`;
    } else if (item.media_type === "CAROUSEL_ALBUM") {
      mediaIcon = `
        <div class="media-icon-badge" style="position:absolute;top:8px;right:8px;z-index:10;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0px 2px 4px rgba(0,0,0,0.3));transition:opacity 0.25s ease;">
          <svg aria-label="Carousel" fill="white" width="20" height="20" role="img" viewBox="0 0 48 48">
            <path d="M34.8 29.7V11c0-2.9-2.3-5.2-5.2-5.2H11c-2.9 0-5.2 2.3-5.2 5.2v18.7c0 2.9 2.3 5.2 5.2 5.2h18.6c2.9-.1 5.2-2.4 5.2-5.2zm-23.8 0V11c0-.7.6-1.3 1.3-1.3h18.6c.7 0 1.3.6 1.3 1.3v18.7c0 .7-.6 1.3-1.3 1.3H12.3c-.7 0-1.3-.6-1.3-1.3z"></path>
            <path d="M38.2 8.6h-.2c-1.1 0-2 .9-2 2s.9 2 2 2h.2c1.8 0 3.2 1.4 3.2 3.2v20c0 1.8-1.4 3.2-3.2 3.2H18.2c-1.8 0-3.2-1.4-3.2-3.2v-.2c0-1.1-.9-2-2-2s-2 .9-2 2v.2c0 4 3.2 7.2 7.2 7.2h20c4 0 7.2-3.2 7.2-7.2v-20c0-4-3.2-7.2-7.2-7.2z"></path>
          </svg>
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
            <svg aria-label="Like" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
            <span>${item.like_count || 0}</span>
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            <svg aria-label="Comment" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
             <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
            </svg>
            <span>${item.comments_count || 0}</span>
          </div>
        </div>`
      : "";

    const instagramLogo = (c.showInstagramIcon !== false)
      ? `<div style="
          position:absolute;top:50%;left:50%;
          opacity:0;transform:translate(-50%, -40%) scale(0.8);
          transition:all 0.25s ease;pointer-events:none;z-index:7;
        " class="ai-ig-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
            <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
            <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
          </svg>
        </div>`
      : "";

    // Dark overlay background for hover
    const overlay = `<div class="ai-card-overlay" style="position:absolute;inset:0;background:rgba(0,0,0,0.4);opacity:0;transition:opacity 0.25s;z-index:4;"></div>`;

    const aspect = c.aspectRatio === "auto" ? "auto" : (c.aspectRatio || "1/1");
    return `
      <div style="flex-shrink:0;width:${width};box-sizing:border-box;">
        <a href="${esc(href)}" target="${target}" rel="noopener noreferrer"
          style="text-decoration:none;display:block;"
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
        </a>
      </div>`;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STORY LAYOUT — mirrors dashboard "story" tab preview EXACTLY
  // ══════════════════════════════════════════════════════════════════════════
  function renderStoryLayout(container, config, mediaData) {
    const s         = config.stories;
    const ringColor = config.postFeed?.typography?.heading?.color || "#6366f1";
    const storyItems = getMedia(mediaData, 15);

    // Unique track ID (avoids clashes if grid & story co-exist on page)
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
          <button class="ai-fw-nav ai-fw-prev" data-track-id="${trackId}" aria-label="Previous"
            style="left:-16px;top:42px;transform:translateY(-50%);">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
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
        const mediaTpl = src
          ? `<img loading="lazy" src="${esc(src)}" alt="story"
              style="width:100%;height:100%;object-fit:cover;display:block;">`
          : `<div style="width:100%;height:100%;background:#f1f5f9;"></div>`;

        html += `
          <div style="flex-shrink:0;width:76px;text-align:center;cursor:pointer;">
            <a href="${esc(href)}" target="${target}" rel="noopener noreferrer"
              style="text-decoration:none;display:block;">
              <div style="
                width:68px;height:68px;border-radius:50%;
                padding:3px;border:2.5px solid ${ringColor};
                background:white;margin:0 auto 8px;overflow:hidden;
                transition:transform 0.2s;
              " onmouseenter="this.style.transform='scale(1.08)'"
                 onmouseleave="this.style.transform='scale(1)'">
                <div style="width:100%;height:100%;border-radius:50%;overflow:hidden;background:#f1f5f9;">
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
          <button class="ai-fw-nav ai-fw-next" data-track-id="${trackId}" aria-label="Next"
            style="right:-16px;top:42px;transform:translateY(-50%);">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
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

  // ── Start ─────────────────────────────────────────────────────────────────
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
