const COLOR_TRANSLATION = {
  'noir': 'Black', 'blanc': 'White', 'rouge': 'Red', 'bleu': 'Blue',
  'vert': 'Green', 'rose': 'Pink', 'beige': 'Beige', 'crème': 'Cream', 'creme': 'Cream',
  'gris': 'Grey', 'marron': 'Brown', 'orange': 'Orange', 'violet': 'Purple',
  'jaune': 'Yellow', 'marine': 'Navy', 'bordeaux': 'Burgundy',
  'rouge foncé': 'Dark Red', 'rouge fonce': 'Dark Red', 'khaki': 'Khaki', 'lila': 'Lilac',
  'zwart': 'Black', 'wit': 'White', 'blauw': 'Blue', 'groen': 'Green',
  'roze': 'Pink', 'grijs': 'Grey', 'bruin': 'Brown', 'geel': 'Yellow',
  'rood': 'Red', 'paars': 'Purple',
  'negro': 'Black', 'blanco': 'White', 'rojo': 'Red', 'azul': 'Blue',
  'verde': 'Green', 'rosa': 'Pink', 'amarillo': 'Yellow',
  'black': 'Black', 'white': 'White', 'red': 'Red', 'blue': 'Blue',
  'green': 'Green', 'pink': 'Pink', 'grey': 'Grey', 'gray': 'Grey',
  'brown': 'Brown', 'purple': 'Purple', 'yellow': 'Yellow', 'navy': 'Navy',
  'burgundy': 'Burgundy', 'lilac': 'Lilac', 'cream': 'Cream', 'beige': 'Beige',
  'dark red': 'Dark Red', 'camel': 'Camel', 'tan': 'Tan', 'coral': 'Coral',
  'mint': 'Mint', 'olive': 'Olive', 'gold': 'Gold', 'silver': 'Silver',
  'teal': 'Teal', 'mustard': 'Mustard', 'rust': 'Rust', 'apricot': 'Apricot',
  'champagne': 'Champagne', 'ivory': 'Ivory', 'orange': 'Orange',
  'off white': 'Off White', 'light blue': 'Light Blue', 'dark blue': 'Dark Blue',
  'light pink': 'Light Pink', 'hot pink': 'Hot Pink', 'baby pink': 'Baby Pink',
  'army green': 'Army Green', 'forest green': 'Forest Green', 'sage': 'Sage',
  'cobalt': 'Cobalt', 'electric blue': 'Electric Blue', 'denim': 'Denim',
  'nude': 'Nude', 'stone': 'Stone', 'taupe': 'Taupe', 'mauve': 'Mauve',
  'blush': 'Blush', 'wine': 'Wine', 'plum': 'Plum', 'fuchsia': 'Fuchsia',
  'magenta': 'Magenta', 'turquoise': 'Turquoise', 'aqua': 'Aqua',
  'lemon': 'Lemon', 'khaki green': 'Khaki Green', 'chocolate': 'Chocolate',
  // Metaalkleur Nederlands
  'goud': 'Gold', 'zilver': 'Silver', 'koper': 'Copper', 'brons': 'Bronze',
  // Overige Nederlands gemist
  'lichtblauw': 'Light Blue', 'donkerblauw': 'Dark Blue', 'lichtroze': 'Light Pink',
  'donkerrood': 'Dark Red', 'lichtgroen': 'Light Green', 'donkergroen': 'Dark Green',
  'panterprint': 'Leopard Print', 'luipaardprint': 'Leopard Print', 'dierenprint': 'Animal Print',
  'gebloemd': 'Floral', 'gestreept': 'Striped', 'ecru': 'Ecru', 'zand': 'Sand',
  'oudroze': 'Dusty Pink', 'poederroze': 'Powder Pink', 'offwhite': 'Off White',
  'naturel': 'Natural', 'donkerbruin': 'Dark Brown', 'lichtbruin': 'Light Brown',
  // Extra Nederlands/specifiek
  'lichtblauw': 'Light Blue', 'donkerblauw': 'Dark Blue', 'lichtroze': 'Light Pink',
  'donkerrood': 'Dark Red', 'donkergroen': 'Dark Green', 'lichtgroen': 'Light Green',
  'panterprint': 'Leopard Print', 'luipaardprint': 'Leopard Print', 'tijgerprint': 'Tiger Print',
  'slangenprint': 'Snake Print', 'zebraprint': 'Zebra Print', 'dierenprint': 'Animal Print',
  'gebloemd': 'Floral', 'gestreept': 'Striped', 'geblokt': 'Checked',
  'ecru': 'Ecru', 'zand': 'Sand', 'cognac': 'Cognac', 'petrol': 'Petrol',
  'oudroze': 'Dusty Pink', 'poederroze': 'Powder Pink', 'fuchsia': 'Fuchsia',
  'lila': 'Lilac', 'paars': 'Purple', 'aubergine': 'Aubergine',
  'donkerbruin': 'Dark Brown', 'lichtbruin': 'Light Brown', 'camel': 'Camel',
  'offwhite': 'Off White', 'gebroken wit': 'Off White', 'naturel': 'Natural',
};

function translateAndCapitalizeColor(color) {
  const lower = color.toLowerCase().trim();
  if (COLOR_TRANSLATION[lower]) return COLOR_TRANSLATION[lower];
  // Capitalize every word
  return color.trim().split(' ').map(function(w) {
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }).join(' ');
}

// Detecteer producttype uit titel
function detectProductType(title) {
  const t = (title || '').toLowerCase();
  // Engels
  if (t.includes('maxi dress') || t.includes('long dress')) return 'Maxi Dress';
  if (t.includes('midi dress')) return 'Midi Dress';
  if (t.includes('mini dress')) return 'Mini Dress';
  if (t.includes('bodycon dress') || t.includes('bodycon')) return 'Bodycon Dress';
  if (t.includes('wrap dress') || t.includes('robe portefeuille')) return 'Wrap Dress';
  if (t.includes('shirt dress')) return 'Shirt Dress';
  if (t.includes('skirt') || t.includes('jupe')) return 'Skirt';
  if (t.includes('midi skirt')) return 'Midi Skirt';
  if (t.includes('mini skirt')) return 'Mini Skirt';
  if (t.includes('maxi skirt')) return 'Maxi Skirt';
  if (t.includes('robe') || t.includes('dress')) return 'Dress';
  if (t.includes('two piece') || t.includes('co-ord') || t.includes('co ord') || t.includes('ensemble') || t.includes('set')) return 'Co-ord Set';
  if (t.includes('jumpsuit') || t.includes('combinaison')) return 'Jumpsuit';
  if (t.includes('blazer')) return 'Blazer';
  if (t.includes('jacket') || t.includes('veste')) return 'Jacket';
  if (t.includes('coat') || t.includes('manteau')) return 'Coat';
  if (t.includes('trench')) return 'Trench Coat';
  if (t.includes('cardigan')) return 'Cardigan';
  if (t.includes('hoodie')) return 'Hoodie';
  if (t.includes('trouser') || t.includes('pants') || t.includes('pantalon')) return 'Trousers';
  if (t.includes('top') || t.includes('blouse')) return 'Top';
  if (t.includes('shirt') || t.includes('chemise')) return 'Shirt';
  // Nederlands
  if (t.includes('maxi rok') || t.includes('lange rok')) return 'Maxi Skirt';
  if (t.includes('midi rok')) return 'Midi Skirt';
  if (t.includes('mini rok')) return 'Mini Skirt';
  if (t.includes('rok')) return 'Skirt';
  if (t.includes('maxi jurk') || t.includes('lange jurk')) return 'Maxi Dress';
  if (t.includes('midi jurk')) return 'Midi Dress';
  if (t.includes('mini jurk')) return 'Mini Dress';
  if (t.includes('jurk')) return 'Dress';
  if (t.includes('broek')) return 'Trousers';
  if (t.includes('jasje') || t.includes('jas')) return 'Jacket';
  if (t.includes('vest')) return 'Cardigan';
  if (t.includes('blouse') || t.includes('top')) return 'Top';
  if (t.includes('jumpsuit') || t.includes('playsuit')) return 'Jumpsuit';
  if (t.includes('set') || t.includes('twinset')) return 'Co-ord Set';
  return 'Dress';
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
    let productType = '';

    if (shopifyJson) {
      title = shopifyJson.title || '';
      productType = detectProductType(title);

      // Pak variant price (dit is de sale prijs als er een compare_at_price is)
      // compare_at_price = originele prijs, price = sale prijs
      const variantPrices = [];
      (shopifyJson.variants || []).forEach(function(v) {
        if (v.price) variantPrices.push(parseFloat(v.price));
      });
      const validVariantPrices = variantPrices.filter(function(p) { return !isNaN(p) && p > 0; });
      price = validVariantPrices.length > 0 ? Math.min.apply(null, validVariantPrices) : null;
      console.log('[scrape] variant price (sale):', price);

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

      // ✅ Foto's: pak ALLE images uit Shopify JSON
      // shopifyJson.images bevat alle product images inclusief alle kleurvarianten
      const imageSet = new Set();
      
      // Alle product images (dit zijn ALLE kleuren)
      for (const img of shopifyJson.images || []) {
        if (img.src) imageSet.add(img.src);
      }
      
      images = [...imageSet];
      console.log('[scrape] Shopify images found:', images.length);
      console.log('[scrape] Image IDs:', (shopifyJson.images || []).map(function(i) { return i.id; }));
      console.log('[scrape] Image URLs:', images.slice(0,5));
    }

    // ─── 2. Extra foto's uit HTML als Shopify JSON niet genoeg heeft ─────────
    // Zoek alle CDN afbeeldingen in de HTML broncode
    const htmlImageMatches = [...html.matchAll(/https?:\/\/[^"'\s,]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s,]*)?/gi)];
    const htmlImages = htmlImageMatches
      .map(function(m) { return m[0]; })
      .filter(function(src) {
        return !src.includes('icon') &&
               !src.includes('logo') &&
               !src.includes('favicon') &&
               !src.includes('badge') &&
               !src.includes('placeholder') &&
               src.length > 30;
      });

    // Voeg HTML afbeeldingen toe die nog niet in de set zitten
    // Normaliseer door query params te verwijderen voor deduplicatie check
    const normalizedSet = new Set(images.map(function(i) { return i.split('?')[0]; }));
    for (const img of htmlImages) {
      const normalized = img.split('?')[0];
      if (!normalizedSet.has(normalized)) {
        normalizedSet.add(normalized);
        images.push(img);
      }
    }

    console.log('[scrape] Total images after HTML scan:', images.length);

    // ─── 3. Fallback kleuren uit HTML ────────────────────────────────────────
    if (colors.length === 0) {
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

    // ─── 4. Prijs fallback ────────────────────────────────────────────────────
    if (!price) {
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
      const metaPriceMatch = html.match(/property="product:price:amount"\s+content="([^"]+)"/);
      if (metaPriceMatch) price = parseFloat(metaPriceMatch[1]);
    }
    if (!price) {
      const priceMatch = html.match(/["']price["']\s*:\s*["']?(\d+[\.,]\d+)["']?/);
      if (priceMatch) price = parseFloat(priceMatch[1].replace(',', '.'));
    }

    // ─── 5. Titel fallback ───────────────────────────────────────────────────
    if (!title) {
      const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
      const titleMatch = html.match(/<title>([^<]+)<\/title>/);
      title = (h1Match?.[1] || titleMatch?.[1] || '').replace(/\s*[\-|–]\s*.*$/, '').trim();
      productType = detectProductType(title);
    }

    // ─── 6. Beschrijving fallback ─────────────────────────────────────────────
    if (!description) {
      const descMatch = html.match(/<meta name="description" content="([^"]+)"/);
      description = descMatch?.[1] || '';
    }

    console.log('[scrape] title:', title);
    console.log('[scrape] productType:', productType);
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
      productType,
      shopifyJson: shopifyJson || null,
      rawHtmlLength: html.length
    });

  } catch(err) {
    console.error('[scrape] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
