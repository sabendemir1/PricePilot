(() => {
  const HIGHLIGHT_CLASS = "pc-highlight";
  const MAX_ASCENT = 8;                 // climb at most 8 ancestors
  const MIN_SIZE = 80;                  // min width/height to count as a card
  const VIEWPORT_FRACTION_LIMIT = 0.9;  // don't choose containers that fill the page
  let currentEl = null;
  let rafId = 0;
  let lastEvt = null;

  const PRICE_SELECTOR = [
    "[itemprop=price]",
    "[data-price]",
    "[data-price-amount]",
    "[class*=price]",
    "[class*=Price]",
    "[class*=amount]",
    "meta[itemprop=price]"
  ].join(",");

  const IMAGE_SELECTOR = "img, picture, [style*='background-image']";
  const LINK_SELECTOR = "a[href]";

  document.addEventListener("pointerover", onPointerMove, { capture: true, passive: true });
  document.addEventListener("pointermove", onPointerMove, { capture: true, passive: true });
  document.addEventListener("pointerout", onPointerOut, { capture: true, passive: true });
  window.addEventListener("blur", clearHighlight, { passive: true });

  function onPointerMove(e) {
    lastEvt = e;
    if (rafId) return;
    rafId = requestAnimationFrame(processHover);
  }

  function onPointerOut(e) {
    // If we left the document/window entirely, clear
    if (!e.relatedTarget || e.relatedTarget === document || e.relatedTarget === document.documentElement) {
      clearHighlight();
    }
  }

  function processHover() {
    rafId = 0;
    const t = lastEvt && lastEvt.target;
    if (!t || !(t instanceof Element)) {
      clearHighlight();
      return;
    }

    const card = findProductCard(t);
    if (card === currentEl) return;

    if (currentEl) currentEl.classList.remove(HIGHLIGHT_CLASS);
    currentEl = card;
    if (card) card.classList.add(HIGHLIGHT_CLASS);
  }

  function clearHighlight() {
    if (currentEl) {
      currentEl.classList.remove(HIGHLIGHT_CLASS);
      currentEl = null;
    }
  }

  // ---------- Heuristics ----------

  function findProductCard(startEl) {
    if (!(startEl instanceof Element)) return null;

    // Climb up to find the smallest plausible product tile
    let node = startEl;
    let best = null;

    for (let i = 0; node && i < MAX_ASCENT; i++, node = node.parentElement) {
      if (!(node instanceof HTMLElement)) continue;
      if (node.dataset.pcIgnore === "true") continue; // our own UI later

      const rect = node.getBoundingClientRect();
      if (!isRectVisible(rect)) continue;

      // Skip things that are too small to be a whole card
      if (rect.width < MIN_SIZE || rect.height < MIN_SIZE) continue;

      const score = scoreAsProductTile(node);
      if (score <= 0) continue;

      // If parent clearly groups multiple products, stop here (node is the single card)
      const parent = node.parentElement;
      if (parent && groupsMultipleProducts(parent)) {
        best = node;
        break;
      }

      best = node; // keep climbing; we may still find a better boundary
    }

    if (!best) return null;

    // If the chosen node itself appears to contain multiple products, refine downward
    if (groupsMultipleProducts(best)) {
      const refined = findSubtileUnderPointer(best, startEl);
      if (refined) return refined;
    }

    // Avoid selecting huge wrappers (like the entire grid)
    const r = best.getBoundingClientRect();
    if (r.width > window.innerWidth * VIEWPORT_FRACTION_LIMIT ||
        r.height > window.innerHeight * VIEWPORT_FRACTION_LIMIT) {
      // Try to refine downward to something tighter
      const refined = findSubtileUnderPointer(best, startEl) || findClosestTileDescendant(best, startEl);
      if (refined) return refined;
    }

    return best;
  }

  function isRectVisible(rect) {
    return rect.width > 0 && rect.height > 0 &&
      rect.bottom > 0 && rect.right > 0 &&
      rect.top < (window.innerHeight || document.documentElement.clientHeight) &&
      rect.left < (window.innerWidth || document.documentElement.clientWidth);
  }

  function containsImage(el) {
    if (el.querySelector(IMAGE_SELECTOR)) return true;
    // Heuristic: background-image on self
    const cs = getComputedStyle(el);
    return cs && cs.backgroundImage && cs.backgroundImage !== "none";
  }

  function priceRegexHit(text) {
    if (!text) return false;
    const t = text.replace(/\s+/g, " ").trim();
    // symbols or ISO + number; also number + trailing symbol
    return /(?:[$€£¥₽₹AED|USD|EUR|GBP|JPY|CHF|CAD|AUD|SEK|NOK|DKK|PLN|TRY])\s?\d/.test(t) ||
           /\d[\d\s.,]{2,}\s?(?:€|£|¥|₽|zł|Ft|Kč|kr|lei|лв|₺|CHF|USD|EUR|GBP)/i.test(t);
  }

  function containsPrice(el) {
    // Fast structured signals
    if (el.querySelector(PRICE_SELECTOR)) return true;

    // Lightweight text scan (bounded): only check up to 5 price-likely nodes
    let hits = 0;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
        const v = node.nodeValue;
        if (v.length > 80) return NodeFilter.FILTER_SKIP; // skip long blobs
        return priceRegexHit(v) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });
    while (walker.nextNode()) {
      hits++;
      if (hits >= 1) return true;
    }
    return false;
  }

  function hasProductMarkers(el) {
    const c = (el.className || "").toString().toLowerCase();
    const id = (el.id || "").toString().toLowerCase();
    const attrHit =
      el.hasAttribute("itemtype") && /product/i.test(el.getAttribute("itemtype") || "") ||
      el.hasAttribute("itemscope") && /product/i.test(el.getAttribute("itemtype") || "") ||
      el.hasAttribute("data-product-id") ||
      el.hasAttribute("data-sku") ||
      el.hasAttribute("data-asin");

    const classHit = /(product|prod|tile|card|listing|list-item|result|grid__item|sku|asin)/i.test(c);
    const idHit = /(product|tile|card|item|sku|asin)/i.test(id);

    return attrHit || classHit || idHit;
  }

  function scoreAsProductTile(el) {
    let score = 0;
    if (containsImage(el)) score += 2;
    if (containsPrice(el)) score += 2;

    const link = el.querySelector(LINK_SELECTOR);
    if (link) score += 1;

    if (hasProductMarkers(el)) score += 1;

    // Penalize if it obviously contains many priced children (likely a row)
    const childCount = pricedChildCount(el);
    if (childCount >= 2) score -= 2;

    return score;
  }

  function pricedChildCount(container) {
    // Look only 1–2 levels down to estimate how many independent priced blocks exist
    let count = 0;
    const kids = container.children;
    for (let i = 0; i < kids.length && count < 5; i++) {
      const k = kids[i];
      if (!(k instanceof HTMLElement)) continue;
      if (!isRectVisible(k.getBoundingClientRect())) continue;

      // A child is a "priced block" if it has price + (image or link)
      if (containsPrice(k) && (containsImage(k) || k.querySelector(LINK_SELECTOR))) {
        count++;
        continue;
      }
      // Check one level deeper for grid cells
      const grandkids = k.children;
      for (let j = 0; j < grandkids.length && count < 5; j++) {
        const g = grandkids[j];
        if (!(g instanceof HTMLElement)) continue;
        if (containsPrice(g) && (containsImage(g) || g.querySelector(LINK_SELECTOR))) {
          count++;
        }
      }
    }
    return count;
  }

  function groupsMultipleProducts(container) {
    return pricedChildCount(container) > 1;
  }

  function findSubtileUnderPointer(container, startEl) {
    // Find the smallest descendant that looks like a single product tile and contains startEl
    let node = startEl;
    for (let i = 0; node && i < MAX_ASCENT; i++, node = node.parentElement) {
      if (!(node instanceof HTMLElement)) continue;
      if (!container.contains(node)) break;
      const rect = node.getBoundingClientRect();
      if (rect.width < MIN_SIZE || rect.height < MIN_SIZE) continue;

      const score = scoreAsProductTile(node);
      if (score >= 3 && pricedChildCount(node) <= 1) {
        return node;
      }
    }
    return null;
  }

  function findClosestTileDescendant(container, startEl) {
    // Fallback: nearest descendant with image+price
    const candidates = container.querySelectorAll("*");
    let best = null;
    let bestDist = Infinity;

    for (const el of candidates) {
      if (!(el instanceof HTMLElement)) continue;
      if (!el.contains(startEl) && !startEl.contains(el)) continue;

      const rect = el.getBoundingClientRect();
      if (rect.width < MIN_SIZE || rect.height < MIN_SIZE) continue;

      const score = scoreAsProductTile(el);
      if (score < 3 || pricedChildCount(el) > 1) continue;

      const dist = rectArea(rect); // prefer smaller tight boxes
      if (dist < bestDist) {
        bestDist = dist;
        best = el;
      }
    }
    return best;
  }

  function rectArea(r) { return r.width * r.height; }
})();