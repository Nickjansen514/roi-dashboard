export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'URL missing' });

  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-GB,en;q=0.9',
      }
    });
    if (!r.ok) throw new Error('Kon pagina niet laden: ' + r.status);
    const html = await r.text();

    // ─── 1. Shopify .json API (meest betrouwbaar) ───────────────────────────
    let shopifyJson = null;
    if (url.includes('/products/')) {
      const jsonUrl = url.split('?')[0].replace(/\/$/, '') + '.json';
      try {
        const jr = await fetch(jsonUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
        });
        if (jr.ok) {
          const data = await jr.json();
          shopifyJson = data?.product || null;
        }
      } catch(e) {
        console.log('Shopify JSON fetch failed:', e.message);
      }
    }

    // ─── 2. Kleuren & maten uit Shopify JSON ────────────────────────────────
    let colors = [];
    let sizes = [];
    let images = [];
    let title = '';
    let price = null;
    let description = '';
    let material = '';

    if (shopifyJson) {
      title = shopifyJson.title || '';
      price = shopifyJson.variants?.[0]?.price
        ? parseFloat(shopifyJson.variants[0].price)
        : null;
      description = shopifyJson.body_html
        ? shopifyJson.body_html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
        : '';

      // Haal opties op (Color / Size)
      for (const option of shopifyJson.options || []) {
        const name = option.name?.toLowerCase() || '';
        if (name.includes('coul') || name.includes('color') || name.includes('colour') || name.includes('kleur') || name.includes('colou')) {
          colors = option.values || [];
        } else if (name.includes('taille') || name.includes('size') || name.includes('maat')) {
          sizes = option.values || [];
        }
      }

      // Als geen kleuren via opties gevonden, probeer via variant titles
      if (colors.length === 0 && shopifyJson.variants?.length > 0) {
        const colorSet = new Set();
        for (const v of shopifyJson.variants) {
          if (v.option1 && !['xs','s','m','l','xl','xxl','xxxl'].includes(v.option1.toLowerCase())) {
            colorSet.add(v.option1);
          }
          if (v.option2 && !['xs','s','m','l','xl','xxl','xxxl'].includes(v.option2.toLowerCase())) {
            colorSet.add(v.option2);
          }
        }
        colors = [...colorSet];
      }

      // Foto's uit Shopify JSON
      images = (shopifyJson.images || []).map(img => img.src).filter(Boolean).slice(0, 10);
    }

    // ─── 3. Fallback: kleuren uit HTML (variant buttons / select options) ───
    if (colors.length === 0) {
      // Zoek in inline JSON (window.ShopifyAnalytics, var meta, etc.)
      const variantJsonMatch = html.match(/\[\s*\{[^[\]]{0,50}"option1"/);
      if (variantJsonMatch) {
        const startIdx = html.indexOf('[', variantJsonMatch.index);
        let depth = 0;
        let endIdx = startIdx;
        for (let i = startIdx; i < html.length; i++) {
          if (html[i] === '[') depth++;
          if (html[i] === ']') { depth--; if (depth === 0) { endIdx = i; break; } }
        }
        try {
          const variants = JSON.parse(html.slice(startIdx, endIdx + 1));
          const colorSet = new Set();
          for (const v of variants) {
            if (v.option1) colorSet.add(v.option1);
          }
          colors = [...colorSet];
        } catch(e) {}
      }
    }

    // ─── 4. Fallback: afbeeldingen uit HTML ─────────────────────────────────
    if (images.length === 0) {
      const imgMatches = [...html.matchAll(/https?:\/\/[^"'\s]+\.(jpg|jpeg|png|webp)[^"'\s]*/gi)];
      images = [...new Set(imgMatches.map(m => m[0].split('?')[0]))].filter(img =>
        !img.includes('icon') &&
        !img.includes('logo') &&
        !img.includes('favicon') &&
        !img.includes('badge') &&
        img.length > 20
      ).slice(0, 10);
    }

    // ─── 5. Titel fallback ───────────────────────────────────────────────────
    if (!title) {
      const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
      const titleMatch = html.match(/<title>([^<]+)<\/title>/);
      title = (h1Match?.[1] || titleMatch?.[1] || '').replace(/\s*[\-|–]\s*.*$/, '').trim();
    }

    // ─── 6. Prijs fallback ───────────────────────────────────────────────────
    if (!price) {
      const priceMatch = html.match(/["']price["']\s*:\s*["']?(\d+[\.,]\d+)["']?/);
      price = priceMatch ? parseFloat(priceMatch[1].replace(',', '.')) : null;
    }

    // ─── 7. Beschrijving fallback ────────────────────────────────────────────
    if (!description) {
      const descMatch = html.match(/<meta name="description" content="([^"]+)"/);
      description = descMatch?.[1] || '';
    }

    console.log('[scrape] title:', title);
    console.log('[scrape] colors found:', colors);
    console.log('[scrape] sizes found:', sizes);
    console.log('[scrape] images found:', images.length);
    console.log('[scrape] price:', price);

    return res.status(200).json({
      title,
      price,
      description,
      material,
      colors,
      sizes,
      images,
      shopifyJson: shopifyJson || null,
      rawHtmlLength: html.length
    });

  } catch(err) {
    console.error('[scrape] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
