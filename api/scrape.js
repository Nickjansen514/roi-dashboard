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

    // Extract JSON-LD product data
    const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g);
    let productData = null;

    if (jsonLdMatch) {
      for (const block of jsonLdMatch) {
        try {
          const json = JSON.parse(block.replace(/<script type="application\/ld\+json">/, '').replace('</script>', ''));
          if (json['@type'] === 'Product' || (Array.isArray(json['@graph']) && json['@graph'].find(x => x['@type'] === 'Product'))) {
            productData = json['@type'] === 'Product' ? json : json['@graph'].find(x => x['@type'] === 'Product');
            break;
          }
        } catch(e) {}
      }
    }

    // Extract Shopify product JSON
    const shopifyMatch = html.match(/var meta = ({[\s\S]*?});/);
    let shopifyProduct = null;
    if (shopifyMatch) {
      try { shopifyProduct = JSON.parse(shopifyMatch[1]); } catch(e) {}
    }

    // Try /products/handle.json for Shopify stores
    let shopifyJson = null;
    if (url.includes('myshopify.com') || url.includes('/products/')) {
      const jsonUrl = url.split('?')[0] + '.json';
      try {
        const jr = await fetch(jsonUrl);
        if (jr.ok) shopifyJson = await jr.json();
      } catch(e) {}
    }

    // Extract images
    const imgMatches = [...html.matchAll(/https?:\/\/[^"'\s]+\.(jpg|jpeg|png|webp)[^"'\s]*/gi)];
    const images = [...new Set(imgMatches.map(m => m[0].split('?')[0]))].filter(img =>
      !img.includes('icon') && !img.includes('logo') && !img.includes('favicon') && img.length > 20
    ).slice(0, 10);

    // Extract title
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
    const title = (h1Match?.[1] || titleMatch?.[1] || '').replace(/\s*[\-|–]\s*.*$/, '').trim();

    // Extract price
    const priceMatch = html.match(/["']price["']\s*:\s*["']?(\d+[\.,]\d+)["']?/);
    const price = priceMatch ? parseFloat(priceMatch[1].replace(',', '.')) : null;

    // Extract description
    const descMatch = html.match(/<meta name="description" content="([^"]+)"/);
    const description = descMatch?.[1] || '';

    return res.status(200).json({
      title,
      price,
      description,
      images,
      shopifyJson: shopifyJson?.product || null,
      productData,
      rawHtmlLength: html.length
    });

  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}
