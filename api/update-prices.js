export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN;
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const store = SHOPIFY_STORE.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const sinceId = req.query.since_id || '0';
  const limit = 5;

  const results = { updated: [], skipped: 0, errors: [] };

  async function updateVariant(variantId, updates, productTitle) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await fetch('https://' + store + '/admin/api/2024-01/variants/' + variantId + '.json', {
        method: 'PUT',
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ variant: { id: variantId, ...updates } })
      });

      if (r.status === 429) {
        // Rate limited - wacht 1 seconde en probeer opnieuw
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }

      if (r.ok) return true;

      const err = await r.text();
      results.errors.push({ product: productTitle, variantId, error: err });
      return false;
    }
    results.errors.push({ product: productTitle, variantId, error: 'Rate limit na 3 pogingen' });
    return false;
  }

  try {
    const url = 'https://' + store + '/admin/api/2024-01/products.json?limit=' + limit + '&since_id=' + sinceId + '&fields=id,title,variants';
    const r = await fetch(url, { headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN } });

    if (!r.ok) {
      const errText = await r.text();
      return res.status(500).json({ error: 'Shopify fout: ' + r.status + ' ' + errText });
    }

    const data = await r.json();
    const products = data.products || [];

    for (const product of products) {
      for (const variant of product.variants || []) {
        const updates = {};

        if (variant.price && variant.price.endsWith('.95')) {
          updates.price = variant.price.slice(0, -2) + '99';
        }
        if (variant.compare_at_price && variant.compare_at_price.endsWith('.95')) {
          updates.compare_at_price = variant.compare_at_price.slice(0, -2) + '99';
        }

        if (Object.keys(updates).length > 0) {
          // Wacht 600ms tussen elke call om rate limit te vermijden
          await new Promise(r => setTimeout(r, 600));
          const ok = await updateVariant(variant.id, updates, product.title);
          if (ok) {
            results.updated.push({
              product: product.title,
              old_price: variant.price,
              new_price: updates.price || variant.price
            });
          }
        } else {
          results.skipped++;
        }
      }
    }

    const lastId = products.length > 0 ? products[products.length - 1].id : null;

    return res.status(200).json({
      success: true,
      products_on_this_page: products.length,
      has_more: products.length === limit,
      next_url: products.length === limit
        ? 'https://project-jufmd.vercel.app/api/update-prices?since_id=' + lastId
        : null,
      summary: {
        variants_updated: results.updated.length,
        variants_skipped: results.skipped,
        errors: results.errors.length
      },
      updated: results.updated,
      errors: results.errors
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
