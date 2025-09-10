(() => {
  // ====== Config ======
  const HIGHLIGHT_CLASS = "pc-highlight";
  const HIGHLIGHT_BLUE_CLASS = "pc-highlight-blue";
  const DWELL_MS = 600;         // hover dwell before scraping
  const MAX_ASCENT = 8;
  const MIN_SIZE = 80;
  const VIEWPORT_FRACTION_LIMIT = 0.9;

  // Re-use container once scraped to avoid spam
  const scraped = new WeakSet();
  let hoverCard = null;
  let dwellTimer = null;
  let rafId = 0;
  let lastEvt = null;

  // ====== Price/Review heuristics from your script ======
  const priceRegex = /(?:[\$€£¥₹₽₩₺]|(?:USD|EUR|GBP|JPY|AUD|CAD|CHF|CNY|SEK|NZD|KRW|INR|RUB|ZAR|SGD|TRY|TL|BRL|MXN|IDR|DKK|PLN|THB|HUF|CZK|ILS|MYR|PHP|RON|ARS|CLP|COP|EGP|HKD|IQD|JOD|KWD|LBP|MAD|MUR|NGN|NOK|OMR|QAR|SAR|VND)\\s*)\\s*\\d{1,3}(?:[.,\\s]\\d{3})*(?:[.,]\\d{1,2})?\\b|^\\d{1,3}(?:[.,\\s]\\d{3})*(?:[.,]\\d{1,2})?\\s*(?:[\\$€£¥₹₽₩₺]|(?:USD|EUR|GBP|JPY|AUD|CAD|CHF|CNY|SEK|NZD|KRW|INR|RUB|ZAR|SGD|TRY|TL|BRL|MXN|IDR|DKK|PLN|THB|HUF|CZK|ILS|MYR|PHP|RON|ARS|CLP|COP|EGP|HKD|IQD|JOD|KWD|LBP|MAD|MUR|NGN|NOK|OMR|QAR|SAR|VND))$/i;

  const reviewPattern = /\b(?:star(?:s)?|rating|review(?:s)?|out of \d+|sur \d+|from \d+(?:\.\d+)?|customer reviews|overall score|average rating|wertung|beoordeling)\b|^\d(?:\.\d+)?\/\d$/i;

  const reviewContainerSelectors = [
    '[itemprop="review"]', '[class*="review-section"]', '[id*="reviews"]', '[class*="rating-summary"]',
    '[class*="customer-reviews"]', '[aria-label*="rating"]', '[data-testid*="review"]', '[data-qa*="review"]',
    '.reviews', '.product-reviews', '.rating-stars', '.star-rating', '.score'
  ].join(',');

  const PRICE_QS = 'span, div, p, strong, b, ins, a, [itemprop="price"], [data-price], [data-saleprice]';
  const TITLE_QS = 'h1, h2, h3, h4, h5, h6, a[href], [role="heading"], [itemprop="name"], .product-title, .item-name';
  const IMAGE_QS = 'img';

  const MAX_TEXT_ELEMENT_LENGTH = 50;
  const MAX_TITLE_LENGTH = 200;
  const MIN_TITLE_LENGTH = 3;
  const MIN_IMAGE_SIZE_PX = 60;
  const MIN_NATURAL_IMAGE_SIZE_PX = 50;

  // ====== Small toast ======
  function toast(msg, isError = false) {
    let el = document.getElementById('product-detector-notification');
    if (!el) {
      el = document.createElement('div');
      el.id = 'product-detector-notification';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.toggle('error', !!isError);
    el.style.opacity = '1';
    setTimeout(() => { el.style.opacity = '0'; }, 1500);
  }

  // ====== Hover tracking ======
  document.addEventListener("pointerover", onPointerMove, { capture: true, passive: true });
  document.addEventListener("pointermove", onPointerMove, { capture: true, passive: true });
  document.addEventListener("pointerout", onPointerOut, { capture: true, passive: true });
  window.addEventListener("blur", clearHighlight, { passive: true });

  function onPointerMove(e) {
    lastEvt = e;
    if (rafId) return;
    rafId = requestAnimationFrame(processHover);
      // ====== Panel UI ======
      function isPanelClosed() {
        return localStorage.getItem('pc-bottomright-panel-closed') === '1';
      }

      function setPanelClosed() {
        localStorage.setItem('pc-bottomright-panel-closed', '1');
      }

      function createPanel() {
        if (document.getElementById('pc-bottomright-panel')) return;
        if (isPanelClosed()) {
          createRestoreButton();
          return;
        }
  function createRestoreButton() {
    if (document.getElementById('pc-bottomright-restore')) return;
    const btn = document.createElement('button');
    btn.id = 'pc-bottomright-restore';
    btn.textContent = 'Show PricePilot';
    btn.style.position = 'fixed';
    btn.style.bottom = '24px';
    btn.style.right = '24px';
    btn.style.zIndex = '99999';
    btn.style.background = '#ffd400';
    btn.style.color = '#222';
    btn.style.border = 'none';
    btn.style.borderRadius = '8px';
    btn.style.padding = '8px 16px';
    btn.style.fontSize = '15px';
    btn.style.cursor = 'pointer';
    btn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.10)';
    btn.addEventListener('click', () => {
      localStorage.removeItem('pc-bottomright-panel-closed');
      btn.remove();
      createPanel();
    });
    document.body.appendChild(btn);
  }
        const panel = document.createElement('div');
        panel.id = 'pc-bottomright-panel';
        panel.style.position = 'fixed';
        panel.style.bottom = '24px';
        panel.style.right = '24px';
        panel.style.zIndex = '99999';
        panel.style.background = '#fff';
        panel.style.boxShadow = '0 2px 12px rgba(0,0,0,0.12)';
        panel.style.borderRadius = '10px';
        panel.style.padding = '16px 24px 16px 16px';
        panel.style.display = 'flex';
        panel.style.alignItems = 'center';
        panel.style.gap = '12px';
        panel.style.fontFamily = 'system-ui,sans-serif';
        panel.style.fontSize = '15px';
        panel.style.color = '#222';
        panel.style.minWidth = '180px';
        panel.style.maxWidth = '320px';
        panel.style.transition = 'opacity 0.2s';

        const text = document.createElement('span');
        text.textContent = '🛒 PricePilot is active, hover on a product card to search better prices';
        panel.appendChild(text);

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        closeBtn.title = 'Close';
        closeBtn.style.background = 'none';
        closeBtn.style.border = 'none';
        closeBtn.style.fontSize = '22px';
        closeBtn.style.cursor = 'pointer';
        closeBtn.style.marginLeft = 'auto';
        closeBtn.style.color = '#888';
        closeBtn.style.padding = '0 4px';
        closeBtn.style.lineHeight = '1';
        closeBtn.addEventListener('click', () => {
          panel.style.opacity = '0';
          setPanelClosed();
          setTimeout(() => {
            panel.remove();
            createRestoreButton();
          }, 200);
        });
        panel.appendChild(closeBtn);

        document.body.appendChild(panel);
      }

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createPanel);
      } else {
        createPanel();
      }
  }

  function onPointerOut(e) {
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
    if (card === hoverCard) return;

    // Swap highlight
    if (hoverCard) {
      hoverCard.classList.remove(HIGHLIGHT_CLASS);
      hoverCard.classList.remove(HIGHLIGHT_BLUE_CLASS);
    }
    hoverCard = card;
    if (hoverCard) {
      hoverCard.classList.add(HIGHLIGHT_CLASS);
    }
  }

  // Replace dwell logic with Shift+Ctrl+Click event
  // ====== Advanced Title Heuristics ======
  const TITLE_EXCLUDE_KEYWORDS = [
  'discount', 'add', 'sale','other', 'review', 'star', 'compare', 'available', 'only', 'others','similar','off','%','saler','find','price','deal','basket','cart','coupon','shopping','sponsored','item','product','new','options','see','used','personnalize','shipping','delivery','save','size','color',
  'xl','l','m','s','xs','xxl','xxxl','large','medium','small','extra large','extra small','extra','x-large','x-small',
  // Turkish keywords
  'indirim', 'ekle', 'fırsat','sepet','kupon','alışveriş','ürün','yeni','renk','beden','kargo','teslimat','stok','satıcı','puan','değerlendirme','yorum','kampanya','ödül','ödeme','ödüllü','ödüller','ödüllendirme','ödüllendir','ödeme','ödendi','ödüyor','ödüyorlar','ödüyorsunuz','ödüyordum','ödüyordu','ödüyorduk','ödüyordunuz','ödüyordular','ödüyorsa','ödüyorsak','ödüyorsanız','ödüyorsalar','ödüyormuş','ödüyormuşum','ödüyormuşsun','ödüyormuşuz','ödüyormuşsunuz','ödüyormuşlar','ödüyorsa','ödüyorsak','ödüyorsanız','ödüyorsalar','ödüyormuş','ödüyormuşum','ödüyormuşsun','ödüyormuşuz','ödüyormuşsunuz','ödüyormuşlar','ödeme','ödemez','ödemezsin','ödemez','ödemezsiniz','ödemezler','ödemezsek','ödemezseniz','ödemezlerse','ödemezmiş','ödemezmişim','ödemezmişsin','ödemezmişiz','ödemezmişsiniz','ödemezmişler','ödemezse','ödemezsek','ödemezseniz','ödemezlerse','ödemezmiş','ödemezmişim','ödemezmişsin','ödemezmişiz','ödemezmişsiniz','ödemezmişler','ödemez','ödemezsin','ödemez','ödemezsiniz','ödemezler','ödemezsek','ödemezseniz','ödemezlerse','ödemezmiş','ödemezmişim','ödemezmişsin','ödemezmişiz','ödemezmişsiniz','ödemezmişler','ödemezse','ödemezsek','ödemezseniz','ödemezlerse','ödemezmiş','ödemezmişim','ödemezmişsin','ödemezmişiz','ödemezmişsiniz','ödemezmişler'
  ];

  function showCardText(card) {
    if (!card) return;
    card.classList.remove(HIGHLIGHT_CLASS);
    card.classList.add(HIGHLIGHT_BLUE_CLASS);

    // Heuristic: Find price element
    const priceRegex = /(?:[\$€£¥₹₽₩₺]|(?:USD|EUR|GBP|JPY|AUD|CAD|CHF|CNY|SEK|NZD|KRW|INR|RUB|ZAR|SGD|TRY|TL|BRL|MXN|IDR|DKK|PLN|THB|HUF|CZK|ILS|MYR|PHP|RON|ARS|CLP|COP|EGP|HKD|IQD|JOD|KWD|LBP|MAD|MUR|NGN|NOK|OMR|QAR|SAR|VND)\s*)\s*\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{1,2})?\b|^\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{1,2})?\s*(?:[\$€£¥₹₽₩₺]|(?:USD|EUR|GBP|JPY|AUD|CAD|CHF|CNY|SEK|NZD|KRW|INR|RUB|ZAR|SGD|TRY|TL|BRL|MXN|IDR|DKK|PLN|THB|HUF|CZK|ILS|MYR|PHP|RON|ARS|CLP|COP|EGP|HKD|IQD|JOD|KWD|LBP|MAD|MUR|NGN|NOK|OMR|QAR|SAR|VND))$/i;
    const reviewPattern = /\b(?:star(?:s)?|rating|review(?:s)?|out of \d+|sur \d+|from \d+(?:\.\d+)?|customer reviews|overall score|average rating|wertung|beoordeling)\b|^\d(?:\.\d+)?\/\d$/i;
    const reviewContainerSelectors = '[itemprop="review"], [class*="review-section"], [id*="reviews"], [class*="rating-summary"], [class*="customer-reviews"], [aria-label*="rating"], [data-testid*="review"], [data-qa*="review"], .reviews, .product-reviews, .rating-stars, .star-rating, .score';
    const MAX_TEXT_ELEMENT_LENGTH = 50;
    const PRICE_QS = 'span, div, p, strong, b, ins, a, [itemprop="price"], [data-price], [data-saleprice]';
    const TITLE_QS = 'h1, h2, h3, h4, h5, h6, a[href], [role="heading"], [itemprop="name"], .product-title, .item-name';
    const MAX_TITLE_LENGTH = 200;
    const MIN_TITLE_LENGTH = 5;

    // Find price element
    const priceElement = Array.from(card.querySelectorAll(PRICE_QS)).find(el => {
      if (el.offsetParent === null || el.offsetWidth === 0 || el.offsetHeight === 0) return false;
      const text = (el.innerText || '').trim();
      if (text.length === 0 || text.length > MAX_TEXT_ELEMENT_LENGTH) return false;
      if (el.closest(reviewContainerSelectors)) return false;
      const hasSemanticPriceAttr = el.hasAttribute('data-price') || el.hasAttribute('data-saleprice') || (el.hasAttribute('itemprop') && el.getAttribute('itemprop').toLowerCase().includes('price'));
      const isReviewElement = (el.hasAttribute('itemprop') && (el.getAttribute('itemprop').toLowerCase().includes('reviewrating') || el.getAttribute('itemprop').toLowerCase().includes('ratingvalue'))) || el.hasAttribute('data-rating');
      if (isReviewElement) return false;
      if (reviewPattern.test(text)) return false;
      if (priceRegex.test(text)) return true;
      return hasSemanticPriceAttr;
    });

    // Gather all product cards in the parent container for uniqueness check
    const allCards = Array.from(card.parentElement ? card.parentElement.children : []);
    const titleFrequency = {};
    allCards.forEach(c => {
      Array.from(c.querySelectorAll(TITLE_QS)).forEach(el => {
        const txt = (el.innerText || '').trim();
        if (txt) titleFrequency[txt] = (titleFrequency[txt] || 0) + 1;
      });
    });

    // Score all candidate titles
    const scoredTitles = [];
    const potentialTitles = Array.from(card.querySelectorAll(TITLE_QS));
    for (const el of potentialTitles) {
      const titleText = (el.innerText || '').trim();
      if (!titleText) continue;

      // Visibility penalty instead of exclusion
      let visibilityPenalty = 0;
      if (el.offsetParent === null || el.offsetWidth === 0 || el.offsetHeight === 0) {
        visibilityPenalty -= 10;
      } else {
        // Ratio penalty for partially visible text
        const widthRatio = el.offsetWidth / (el.scrollWidth || 1);
        const heightRatio = el.offsetHeight / (el.scrollHeight || 1);
        if (widthRatio < 0.5 || heightRatio < 0.5) {
          visibilityPenalty -= 8;
        }
      }

      // Avoid duplicates within the same card
      if (scoredTitles.some(t => t.text === titleText)) continue;

      // Compute structural path for this element within the card
      function getStructuralPath(element, root) {
        const path = [];
        let el = element;
        while (el && el !== root) {
          let idx = 0;
          let sib = el;
          while ((sib = sib.previousElementSibling)) idx++;
          path.unshift(`${el.tagName}:${idx}`);
          el = el.parentElement;
        }
        return path.join('>');
      }
      const structuralPath = getStructuralPath(el, card);

  // Scoring
  let score = visibilityPenalty;
      // Word count scoring
      const wordCount = titleText.split(/\s+/).length;
      if (wordCount >= 3) score += Math.min(wordCount, 5);
      //else if (wordCount === 2) score += 1;
      else score -= 2;
      // Tag preference
      if (/^h[1-6]$/i.test(el.tagName)) score += 2;
      if (el.hasAttribute('itemprop') && el.getAttribute('itemprop').toLowerCase().includes('name')) score += 2;
      if (el.classList.contains('product-title') || el.classList.contains('item-name')) score += 2;
      // Font size
      const style = window.getComputedStyle(el);
      const fontSize = parseFloat(style.fontSize);
      if (fontSize >= 18) score += 2;
      else if (fontSize >= 15) score += 1;
      // Font weight
      const fontWeight = style.fontWeight;
      if (fontWeight === 'bold' || parseInt(fontWeight) >= 600) score += 1;
      // Position in card (closer to top)
      const rect = el.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      if (rect.top - cardRect.top < cardRect.height / 3) score += 1;
      // Keyword penalty
      const lowerText = titleText.toLowerCase();
      for (const kw of TITLE_EXCLUDE_KEYWORDS) {
        if (lowerText.includes(kw)) {
          score -= 4;
          break;
        }
      }
      // Price/review/number penalty
      if (priceElement && el.contains(priceElement)) score -= 2;
      if (priceRegex.test(titleText)) score -= 5;
      if (reviewPattern.test(titleText)) score -= 2;

      // Uniqueness penalty: check all cards for same phrase at same structural path
      let repeatedCount = 0;
      for (const otherCard of allCards) {
        if (otherCard === card) continue;
        const otherTitles = Array.from(otherCard.querySelectorAll(TITLE_QS));
        for (const otherEl of otherTitles) {
          const otherText = (otherEl.innerText || '').trim();
          if (!otherText) continue;
          const otherPath = getStructuralPath(otherEl, otherCard);
          if (otherPath === structuralPath && otherText === titleText) {
            repeatedCount++;
          }
        }
      }
      if (repeatedCount > 0) score -= 8 * repeatedCount;

      scoredTitles.push({ text: titleText, score });
    }

    scoredTitles.sort((a, b) => b.score - a.score);

    // Show all scored titles in panel
    const panel = document.getElementById('pc-bottomright-panel');
    if (panel) {
      const textSpan = panel.querySelector('span');
      if (textSpan) {
        const priceText = priceElement ? priceElement.innerText.trim() : '(No price)';
        const allTitles = scoredTitles.map(t => `${t.text} [${t.score}]`).join(' | ');
        textSpan.textContent = `${allTitles} — ${priceText}`;

      }
    }
  }

  document.addEventListener("click", function(e) {
    if (!(e.target instanceof Element)) return;
    if (!e.ctrlKey || !e.shiftKey) return;
    const card = findProductCard(e.target);
    if (card) {
      e.preventDefault();
      e.stopPropagation();
      showCardText(card);
    }
  }, true);

  function cancelDwell() {
    if (dwellTimer) {
      clearTimeout(dwellTimer);
      dwellTimer = null;
    }
  }

  function clearHighlight() {
    cancelDwell();
    if (hoverCard) {
      hoverCard.classList.remove(HIGHLIGHT_CLASS);
      hoverCard.classList.remove(HIGHLIGHT_BLUE_CLASS);
      hoverCard = null;
    }
  }

  // ====== Card detection (tight per-tile) ======
  function findProductCard(startEl) {
    const IMAGE_SELECTOR = "img, picture, [style*='background-image']";
    const LINK_SELECTOR = "a[href]";

    let node = startEl;
    let best = null;

    for (let i = 0; node && i < MAX_ASCENT; i++, node = node.parentElement) {
      if (!(node instanceof HTMLElement)) continue;

      const rect = node.getBoundingClientRect();
      if (!isRectVisible(rect)) continue;
      if (rect.width < MIN_SIZE || rect.height < MIN_SIZE) continue;

      const score = scoreAsProductTile(node);
      if (score <= 0) continue;

      // If parent groups multiple products, this node is a good tile boundary
      if (node.parentElement && groupsMultipleProducts(node.parentElement)) {
        best = node;
        break;
      }

      best = node;
    }

    if (!best) return null;

    // If best is too huge, refine down
    const r = best.getBoundingClientRect();
    if (r.width > window.innerWidth * VIEWPORT_FRACTION_LIMIT ||
        r.height > window.innerHeight * VIEWPORT_FRACTION_LIMIT ||
        groupsMultipleProducts(best)) {
      const refined = findSubtileUnderPointer(best, startEl);
      if (refined) return refined;
    }
    return best;

    // Helpers
    function isRectVisible(rect) {
      return rect.width > 0 && rect.height > 0 &&
        rect.bottom > 0 && rect.right > 0 &&
        rect.top < (window.innerHeight || document.documentElement.clientHeight) &&
        rect.left < (window.innerWidth || document.documentElement.clientWidth);
    }

    function containsImage(el) {
      if (el.querySelector(IMAGE_SELECTOR)) return true;
      const cs = getComputedStyle(el);
      return cs && cs.backgroundImage && cs.backgroundImage !== "none";
    }

    function priceRegexHit(text) {
      if (!text) return false;
      const t = text.replace(/\s+/g, " ").trim();
      return /(?:[$€£¥₽₹AED|USD|EUR|GBP|JPY|CHF|CAD|AUD|SEK|NOK|DKK|PLN|TRY])\s?\d/.test(t) ||
             /\d[\d\s.,]{2,}\s?(?:€|£|¥|₽|CHF|USD|EUR|GBP)/i.test(t);
    }

    function containsPrice(el) {
      // quick scan
      const PRICE_SELECTOR = "[itemprop=price],[data-price],[data-price-amount],[class*=price],[class*=Price],[class*=amount],meta[itemprop=price]";
      if (el.querySelector(PRICE_SELECTOR)) return true;
      let hits = 0;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
          const v = node.nodeValue;
          if (v.length > 80) return NodeFilter.FILTER_SKIP;
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
        (el.hasAttribute("itemtype") && /product/i.test(el.getAttribute("itemtype") || "")) ||
        el.hasAttribute("itemscope") ||
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
      if (el.querySelector(LINK_SELECTOR)) score += 1;
      if (hasProductMarkers(el)) score += 1;
      const childCount = pricedChildCount(el);
      if (childCount >= 2) score -= 2;
      return score;
    }

    function pricedChildCount(container) {
      let count = 0;
      const kids = container.children;
      for (let i = 0; i < kids.length && count < 5; i++) {
        const k = kids[i];
        if (!(k instanceof HTMLElement)) continue;
        if (!isRectVisible(k.getBoundingClientRect())) continue;
        if (containsPrice(k) && (k.querySelector(IMAGE_SELECTOR) || k.querySelector(LINK_SELECTOR))) {
          count++;
          continue;
        }
        const grandkids = k.children;
        for (let j = 0; j < grandkids.length && count < 5; j++) {
          const g = grandkids[j];
          if (!(g instanceof HTMLElement)) continue;
          if (containsPrice(g) && (g.querySelector(IMAGE_SELECTOR) || g.querySelector(LINK_SELECTOR))) {
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
      let node = startEl;
      for (let i = 0; node && i < MAX_ASCENT; i++, node = node.parentElement) {
        if (!(node instanceof HTMLElement)) continue;
        if (!container.contains(node)) break;
        const rect = node.getBoundingClientRect();
        if (rect.width < MIN_SIZE || rect.height < MIN_SIZE) continue;
        const score = scoreAsProductTile(node);
        if (score >= 3 && pricedChildCount(node) <= 1) return node;
      }
      return null;
    }
  }

  // ====== Scrape only inside the hovered card ======
  function scrapeSingleProduct(card) {
    // 1) Candidate price elements within card
    const potentialPriceElements = Array.from(card.querySelectorAll(PRICE_QS))
      .filter(el => {
        if (!(el instanceof Element)) return false;
        if (el.closest(reviewContainerSelectors)) return false; // skip review blocks
        if (el.offsetParent === null || el.offsetWidth === 0 || el.offsetHeight === 0) return false;

        const text = (el.innerText || "").trim();
        if (text.length === 0 || text.length > MAX_TEXT_ELEMENT_LENGTH) return false;

        // Semantic review-ish attributes
        if ((el.hasAttribute('itemprop') && /(reviewrating|ratingvalue)/i.test(el.getAttribute('itemprop') || "")) ||
            el.hasAttribute('data-rating')) {
          return false;
        }

        if (reviewPattern.test(text)) return false;
        if (priceRegex.test(text)) return true;

        const hasSemanticPriceAttr = el.hasAttribute('data-price') ||
                                     el.hasAttribute('data-saleprice') ||
                                     (el.hasAttribute('itemprop') && /price/i.test(el.getAttribute('itemprop') || ""));
        return hasSemanticPriceAttr;
      });

    // Pick the first decent price, but prefer one closest to card center
    let priceEl = null;
    if (potentialPriceElements.length) {
      const cx = card.getBoundingClientRect();
      const center = { x: cx.left + cx.width / 2, y: cx.top + cx.height / 2 };
      priceEl = potentialPriceElements
        .map(el => ({ el, r: el.getBoundingClientRect() }))
        .sort((a, b) => {
          const da = (a.r.left + a.r.width / 2 - center.x) ** 2 + (a.r.top + a.r.height / 2 - center.y) ** 2;
          const db = (b.r.left + b.r.width / 2 - center.x) ** 2 + (b.r.top + b.r.height / 2 - center.y) ** 2;
          return da - db;
        })[0].el;
    }

    // 2) Image in card
    let image = Array.from(card.querySelectorAll(IMAGE_QS)).find(img =>
      img instanceof HTMLImageElement &&
      img.offsetParent !== null &&
      img.offsetWidth > MIN_IMAGE_SIZE_PX && img.offsetHeight > MIN_IMAGE_SIZE_PX &&
      (
        (img.src && !img.src.startsWith('data:image/gif;base64') && !img.src.includes('blank.gif')) ||
        img.dataset?.src || img.dataset?.lazyload || img.getAttribute('data-src') || img.srcset ||
        (img.naturalWidth > MIN_NATURAL_IMAGE_SIZE_PX && img.naturalHeight > MIN_NATURAL_IMAGE_SIZE_PX && !img.loading)
      )
    );

    // 3) Title in card
    let titleEl = null;
    const potentialTitles = Array.from(card.querySelectorAll(TITLE_QS));
    for (const el of potentialTitles) {
      const titleText = (el.innerText || "").trim();
      if (!titleText) continue;
      if (titleText.length < MIN_TITLE_LENGTH || titleText.length > MAX_TITLE_LENGTH) continue;
      if (priceEl && el.contains(priceEl)) continue;
      if (priceRegex.test(titleText)) continue;
      if (/^\d+$/.test(titleText)) continue;
      if (reviewPattern.test(titleText)) continue;
      if (el.offsetParent === null || el.offsetWidth === 0 || el.offsetHeight === 0) continue;
      titleEl = el;
      break;
    }

    if (!image && !titleEl && !priceEl) {
      return null;
    }

    // Extract best image URL
    let imageUrl = image ? image.src : null;
    if (image) {
      if (!imageUrl || imageUrl.startsWith('data:image/gif') || imageUrl.includes('blank.gif')) {
        imageUrl = image.dataset?.src || image.dataset?.lazyload || image.getAttribute('data-src') || imageUrl;
      }
      if ((!imageUrl || imageUrl.startsWith('data:')) && image.srcset) {
        const srcsetParts = image.srcset.split(',').map(s => s.trim().split(' '));
        if (srcsetParts.length > 0) imageUrl = srcsetParts[srcsetParts.length - 1][0];
      }
    }
    if (!imageUrl || imageUrl.startsWith('data:')) imageUrl = 'N/A';

    // Apply sub-element highlights
    if (image) image.classList.add('product-detector-highlight-image');
    if (titleEl) titleEl.classList.add('product-detector-highlight-title');
    if (priceEl) priceEl.classList.add('product-detector-highlight-price');

    const result = {
      title: titleEl ? titleEl.innerText.trim() : 'N/A',
      price: priceEl ? priceEl.innerText.trim() : 'N/A',
      imageUrl
    };

    // Also log for dev
    console.log("Hovered product scraped:", result);
    return result;
  }
  // Inject highlight styles
  const style = document.createElement('style');
  style.textContent = `
    .pc-highlight {
      outline: 3px solid #ffd400 !important;
      outline-offset: -3px !important;
      border-radius: 8px !important;
      transition: outline-color 0.2s;
    }
    .pc-highlight-blue {
      outline: 3px solid #2196f3 !important;
      outline-offset: -3px !important;
      border-radius: 8px !important;
      transition: outline-color 0.2s;
    }
  `;
  document.head.appendChild(style);
})();