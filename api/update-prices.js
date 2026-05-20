export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN;
  const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
  const store = SHOPIFY_STORE.replace(/^https?:\/\//, '').replace(/\/$/, '');

  // Gebruik ?page=1, ?page=2 etc om pagina voor pagina te verwerken
  const page = parseInt(req.query.page || '1');
  const limit = 10; // 10 producten per keer zodat het snel genoeg is

  const results = { updated: [], skipped: 0, errors: [] };

  try {
    const url = 'https://' + store + '/admin/api/2024-01/products.json?limit=' + limit + '&page=' + page + '&fields=id,title,variants';

    const r = await fetch(url, {
      headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN }
    });
    const data = await r.json();
    const products = data.products || [];

    console.log('[price-update] Page:', page, '| Products:', products.length);

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

    return res.status(200).json({
      success: true,
      page: page,
      products_on_this_page: products.length,
      has_more: products.length === limit,
      next_url: products.length === limit ? '/api/update-prices?page=' + (page + 1) : null,
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
