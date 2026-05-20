const COLOR_TRANSLATION = {
  // Frans
  'noir': 'Black', 'blanc': 'White', 'rouge': 'Red', 'bleu': 'Blue',
  'vert': 'Green', 'rose': 'Pink', 'beige': 'Beige', 'crème': 'Cream', 'creme': 'Cream',
  'gris': 'Grey', 'marron': 'Brown', 'orange': 'Orange', 'violet': 'Purple',
  'jaune': 'Yellow', 'marine': 'Navy', 'bordeaux': 'Burgundy',
  'rouge foncé': 'Dark Red', 'rouge fonce': 'Dark Red', 'khaki': 'Khaki', 'lila': 'Lilac',
  // Nederlands
  'zwart': 'Black', 'wit': 'White', 'blauw': 'Blue', 'groen': 'Green',
  'roze': 'Pink', 'grijs': 'Grey', 'bruin': 'Brown', 'geel': 'Yellow',
  'rood': 'Red', 'paars': 'Purple',
  // Spaans
  'negro': 'Black', 'blanco': 'White', 'rojo': 'Red', 'azul': 'Blue',
  'verde': 'Green', 'rosa': 'Pink', 'amarillo': 'Yellow',
  // Engels (zorg voor hoofdletter)
  'black': 'Black', 'white': 'White', 'red': 'Red', 'blue': 'Blue',
  'green': 'Green', 'pink': 'Pink', 'grey': 'Grey', 'gray': 'Grey',
  'brown': 'Brown', 'purple': 'Purple', 'yellow': 'Yellow', 'navy': 'Navy',
  'burgundy': 'Burgundy', 'lilac': 'Lilac', 'cream': 'Cream', 'beige': 'Beige',
  'dark red': 'Dark Red', 'camel': 'Camel', 'tan': 'Tan', 'coral': 'Coral',
  'mint': 'Mint', 'olive': 'Olive', 'gold': 'Gold', 'silver': 'Silver',
  'teal': 'Teal', 'mustard': 'Mustard', 'rust': 'Rust', 'apricot': 'Apricot',
  'champagne': 'Champagne', 'ivory': 'Ivory', 'khaki': 'Khaki', 'orange': 'Orange',
  'off white': 'Off White', 'light blue': 'Light Blue', 'dark blue': 'Dark Blue',
  'light pink': 'Light Pink', 'hot pink': 'Hot Pink', 'baby pink': 'Baby Pink',
  'army green': 'Army Green', 'forest green': 'Forest Green', 'sage': 'Sage',
  'cobalt': 'Cobalt', 'electric blue': 'Electric Blue', 'denim': 'Denim',
  'nude': 'Nude', 'stone': 'Stone', 'taupe': 'Taupe', 'mauve': 'Mauve',
  'blush': 'Blush', 'wine': 'Wine', 'plum': 'Plum', 'fuchsia': 'Fuchsia',
  'magenta': 'Magenta', 'turquoise': 'Turquoise', 'aqua': 'Aqua',
  'lemon': 'Lemon', 'khaki green': 'Khaki Green', 'chocolate': 'Chocolate',
};

function translateAndCapitalizeColor(color) {
  const lower = color.toLowerCase().trim();
  if (COLOR_TRANSLATION[lower]) return COLOR_TRANSLATION[lower];
  // Capitalize eerste letter van elk woord als niet gevonden
  return color.trim().replace(/\b\w/g, function(c) { return c.toUpperCase(); });
}

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

    // ─── 1. Shopify .json API ────────────────────────────────────────────────
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

    let colors = [];
    let sizes = [];
    let images = [];
    let title = '';
    let price = null;
    let description = '';
    let material = '';

    if (shopifyJson) {
      title = shopifyJson.title || '';

      // Prijs: laagste variant prijs
      const allPrices = (shopifyJson.variants || []).map(function(v) { return parseFloat(v.price); }).filter(function(p) { return !isNaN(p) && p > 0; });
      price = allPrices.length > 0 ? Math.min.apply(null, allPrices) : null;

      description = shopifyJson.body_html
        ? shopifyJson.body_html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
        : '';

      // Kleuren en maten uit opties
      for (const option of shopifyJson.options || []) {
        const name = (option.name || '').toLowerCase();
        if (name.includes('coul') || name.includes('color') || name.includes('colour') || name.includes('kleur')) {
          colors = (option.values || []).map(translateAndCapitalizeColor);
        } else if (name.includes('taille') || name.includes('size') || name.includes('maat')) {
          sizes = option.values || [];
        }
      }

      // Fallback kleuren via variants
      if (colors.length === 0 && shopifyJson.variants?.length > 0) {
        const colorSet = new Set();
        const sizeKeywords = ['xs','s','m','l','xl','xxl','xxxl','36','38','40','42','44'];
        for (const v of shopifyJson.variants) {
          if (v.option1 && !sizeKeywords.includes(v.option1.toLowerCase())) colorSet.add(v.option1);
          if (v.option2 && !sizeKeywords.includes(v.option2.toLowerCase())) colorSet.add(v.option2);
        }
        colors = [...colorSet].map(translateAndCapitalizeColor);
      }

      // ✅ Foto's: alle unieke images uit Shopify JSON (inclusief variant images)
      const imageSet = new Set();

      // Eerst product-level images
      for (const img of shopifyJson.images || []) {
        if (img.src) imageSet.add(img.src);
      }

      // Dan variant-level images (kleurspecifieke foto's)
      for (const v of shopifyJson.variants || []) {
        if (v.image_id) {
          const varImg = (shopifyJson.images || []).find(function(i) { return i.id === v.image_id; });
          if (varImg && varImg.src) imageSet.add(varImg.src);
        }
      }

      images = [...imageSet].slice(0, 20);
    }

    // ─── 2. Fallback kleuren uit HTML ────────────────────────────────────────
    if (colors.length === 0) {
      // Probeer inline JSON varianten
      const variantJsonMatch = html.match(/\[\s*\{[^[\]]{0,50}"option1"/);
      if (variantJsonMatch) {
        const startIdx = html.indexOf('[', variantJsonMatch.index);
        let depth = 0, endIdx = startIdx;
        for (let i = startIdx; i < html.length; i++) {
          if (html[i] === '[') depth++;
          if (html[i] === ']') { depth--; if (depth === 0) { endIdx = i; break; } }
        }
        try {
          const variants = JSON.parse(html.slice(startIdx, endIdx + 1));
          const colorSet = new Set();
          for (const v of variants) { if (v.option1) colorSet.add(v.option1); }
          colors = [...colorSet].map(translateAndCapitalizeColor);
        } catch(e) {}
      }
    }

    // ─── 3. Prijs fallback voor niet-Shopify sites ────────────────────────────
    if (!price) {
      // Probeer JSON-LD structured data
      const jsonLdMatches = [...html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
      for (const match of jsonLdMatches) {
        try {
          const json = JSON.parse(match[1]);
          const offers = json.offers || (json['@graph'] && json['@graph'].find(function(n) { return n.offers; })?.offers);
          if (offers) {
            const offerArr = Array.isArray(offers) ? offers : [offers];
            const prices = offerArr.map(function(o) { return parseFloat(o.price); }).filter(function(p) { return !isNaN(p) && p > 0; });
            if (prices.length > 0) { price = Math.min.apply(null, prices); break; }
          }
          if (json.price) { price = parseFloat(json.price); break; }
        } catch(e) {}
      }
    }

    if (!price) {
      // Probeer meta property price
      const metaPriceMatch = html.match(/property="product:price:amount"\s+content="([^"]+)"/);
      if (metaPriceMatch) price = parseFloat(metaPriceMatch[1]);
    }

    if (!price) {
      // Algemene price regex
      const priceMatch = html.match(/["']price["']\s*:\s*["']?(\d+[\.,]\d+)["']?/);
      if (priceMatch) price = parseFloat(priceMatch[1].replace(',', '.'));
    }

    // ─── 4. Afbeeldingen fallback ─────────────────────────────────────────────
    if (images.length === 0) {
      const imgMatches = [...html.matchAll(/https?:\/\/[^"'\s]+\.(jpg|jpeg|png|webp)[^"'\s]*/gi)];
      images = [...new Set(imgMatches.map(function(m) { return m[0].split('?')[0]; }))].filter(function(img) {
        return !img.includes('icon') && !img.includes('logo') && !img.includes('favicon') && !img.includes('badge') && img.length > 20;
      }).slice(0, 20);
    }

    // ─── 5. Titel fallback ───────────────────────────────────────────────────
    if (!title) {
      const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
      const titleMatch = html.match(/<title>([^<]+)<\/title>/);
      title = (h1Match?.[1] || titleMatch?.[1] || '').replace(/\s*[\-|–]\s*.*$/, '').trim();
    }

    // ─── 6. Beschrijving fallback ─────────────────────────────────────────────
    if (!description) {
      const descMatch = html.match(/<meta name="description" content="([^"]+)"/);
      description = descMatch?.[1] || '';
    }

    console.log('[scrape] title:', title);
    console.log('[scrape] price:', price);
    console.log('[scrape] colors:', colors);
    console.log('[scrape] sizes:', sizes);
    console.log('[scrape] images:', images.length);

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
