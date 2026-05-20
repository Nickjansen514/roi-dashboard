export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN;
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const store = SHOPIFY_STORE.replace(/^https?:\/\//, '').replace(/\/$/, '');

  const results = { updated: [], skipped: [], errors: [] };

  try {
    // Haal alle producten op
    let products = [];
    let url = 'https://' + store + '/admin/api/2024-01/products.json?limit=250&fields=id,title,variants';

    while (url) {
      const r = await fetch(url, {
        headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN }
      });
      const data = await r.json();
      products = products.concat(data.products || []);

      // Pagination
      const linkHeader = r.headers.get('Link');
      const nextMatch = linkHeader && linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      url = nextMatch ? nextMatch[1] : null;
    }

    console.log('[price-update] Total products:', products.length);

    for (const product of products) {
      for (const variant of product.variants || []) {
        const updates = {};

        // Rond price af: .95 → .99
        if (variant.price) {
          const newPrice = roundPrice(variant.price);
          if (newPrice !== variant.price) updates.price = newPrice;
        }

        // Rond compare_at_price af: .95 → .99
        if (variant.compare_at_price) {
          const newCompare = roundPrice(variant.compare_at_price);
          if (newCompare !== variant.compare_at_price) updates.compare_at_price = newCompare;
        }

        if (Object.keys(updates).length > 0) {
          try {
            const updateR = await fetch('https://' + store + '/admin/api/2024-01/variants/' + variant.id + '.json', {
              method: 'PUT',
              headers: {
                'X-Shopify-Access-Token': SHOPIFY_TOKEN,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ variant: { id: variant.id, ...updates } })
            });

            if (updateR.ok) {
              results.updated.push({
                product: product.title,
                variant: variant.id,
                old_price: variant.price,
                new_price: updates.price || variant.price,
                old_compare: variant.compare_at_price,
                new_compare: updates.compare_at_price || variant.compare_at_price
              });
              console.log('[price-update] Updated:', product.title, variant.id, updates);
            } else {
              const err = await updateR.text();
              results.errors.push({ product: product.title, variant: variant.id, error: err });
            }

            // Rate limit: 0.5s wachten tussen calls
            await new Promise(r => setTimeout(r, 500));

          } catch (e) {
            results.errors.push({ product: product.title, variant: variant.id, error: e.message });
          }
        } else {
          results.skipped.push(variant.id);
        }
      }
    }

    return res.status(200).json({
      success: true,
      summary: {
        total_products: products.length,
        variants_updated: results.updated.length,
        variants_skipped: results.skipped.length,
        errors: results.errors.length
      },
      updated: results.updated,
      errors: results.errors
    });

  } catch (err) {
    console.error('[price-update] Fatal error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

function roundPrice(priceStr) {
  const price = parseFloat(priceStr);
  if (isNaN(price)) return priceStr;

  // Vervang .95 ending met .99
  const str = price.toFixed(2);
  if (str.endsWith('.95')) {
    return str.slice(0, -2) + '99';
  }
  // Ook .95 varianten zoals 34.950
  if (Math.abs((price % 1) - 0.95) < 0.001) {
    return (Math.floor(price) + 0.99).toFixed(2);
  }

  return priceStr; // Niet .95, laat staan
}
