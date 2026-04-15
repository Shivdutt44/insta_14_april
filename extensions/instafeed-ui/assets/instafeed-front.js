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
      const mediaData    = instaData?.media?.data || [];

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
    const base =
      mediaData.length > 0
        ? mediaData
        : PLACEHOLDERS.map((url) => ({
            media_url:      url,
            media_type:     "IMAGE",
            like_count:     0,
            comments_count: 0,
            permalink:      "#",
          }));
    return Array.from({ length: Math.min(count, MAX_FEED_ITEMS) }, (_, i) => base[i % base.length]);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FEED GRID — mirrors dashboard "post" tab preview EXACTLY
  // ══════════════════════════════════════════════════════════════════════════
  function renderFeedGrid(container, config, mediaData) {
    const c          = config.postFeed;
    const isMobile   = window.innerWidth <= 768;
    const columns    = isMobile ? c.mobileColumns : c.desktopColumns;
    const gap        = c.gap;
    const mediaItems = getMedia(mediaData, 24);

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

    const videoIcon = isVideo
      ? `<div style="position:absolute;top:4px;right:4px;font-size:10px;background:rgba(0,0,0,0.55);color:white;padding:2px 5px;border-radius:4px;">📹</div>`
      : "";

    const metrics = c.metrics
      ? `<div style="
          position:absolute;bottom:0;left:0;right:0;
          padding:8px;
          background:linear-gradient(to top,rgba(0,0,0,0.6),transparent);
          display:flex;gap:10px;color:white;
          font-size:11px;font-weight:600;
          opacity:0;transition:opacity 0.25s;
        " class="ai-metrics">
          <span>❤️ ${item.like_count || 0}</span>
          <span>💬 ${item.comments_count || 0}</span>
        </div>`
      : "";

    return `
      <div style="flex-shrink:0;width:${width};box-sizing:border-box;">
        <a href="${esc(href)}" target="${target}" rel="noopener noreferrer"
          style="text-decoration:none;display:block;"
          onmouseenter="var m=this.querySelector('.ai-metrics');if(m)m.style.opacity='1';"
          onmouseleave="var m=this.querySelector('.ai-metrics');if(m)m.style.opacity='0';">
          <div style="aspect-ratio:1/1;background:#f1f5f9;border-radius:6px;overflow:hidden;position:relative;">
            ${inner}
            ${videoIcon}
            ${metrics}
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
            style="left:-16px;">
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
            style="right:-16px;">
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
