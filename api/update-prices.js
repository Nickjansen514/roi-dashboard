export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN;
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const store = SHOPIFY_STORE.replace(/^https?:\/\//, '').replace(/\/$/, '');

  // since_id voor pagination — start bij 0, volgende keer het laatste product ID
  const sinceId = req.query.since_id || '0';
  const limit = 10;

  const results = { updated: [], skipped: 0, errors: [] };

  try {
    const url = 'https://' + store + '/admin/api/2024-01/products.json?limit=' + limit + '&since_id=' + sinceId + '&fields=id,title,variants';

    const r = await fetch(url, {
      headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN }
    });

    if (!r.ok) {
      const errText = await r.text();
      return res.status(500).json({ error: 'Shopify fout: ' + r.status + ' ' + errText });
    }

    const data = await r.json();
    const products = data.products || [];

    console.log('[price-update] since_id:', sinceId, '| Products:', products.length);

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
                old_price: variant.price,
                new_price: updates.price || variant.price,
                old_compare: variant.compare_at_price || null,
                new_compare: updates.compare_at_price || variant.compare_at_price || null
              });
            } else {
              const err = await updateR.text();
              results.errors.push({ product: product.title, error: err });
            }
          } catch (e) {
            results.errors.push({ product: product.title, error: e.message });
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
      next_url: products.length === limit ? '/api/update-prices?since_id=' + lastId : null,
      summary: {
        variants_updated: results.updated.length,
        variants_skipped: results.skipped,
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
