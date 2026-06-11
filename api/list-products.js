const SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN;
const SHOPIFY_STORE = process.env.SHOPIFY_STORE;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { shopifyToken: reqToken, shopifyStore: reqStore, storeId } = req.body || {};
  let token = reqToken || SHOPIFY_TOKEN;
  let storeDomain = reqStore || SHOPIFY_STORE;
  if (storeId === 'store2') {
    token = process.env.SHOPIFY_TOKEN_2;
    storeDomain = process.env.SHOPIFY_STORE_2 || 'gw5ubt-8p.myshopify.com';
  }
  const store = (storeDomain || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (!token || !store) return res.status(400).json({ error: 'Geen winkel/token' });

  try {
    let url = 'https://' + store + '/admin/api/2024-01/products.json?fields=id,title,images&limit=250';
    const out = [];
    for (let page = 0; page < 20 && url; page++) {
      const r = await fetch(url, { headers: { 'X-Shopify-Access-Token': token } });
      if (!r.ok) {
        const e = await r.text();
        return res.status(500).json({ error: 'Shopify list failed: ' + r.status + ' ' + e });
      }
      const data = await r.json();
      (data.products || []).forEach(function(p) {
        out.push({ id: p.id, title: p.title, imageCount: (p.images || []).length });
      });
      const link = r.headers.get('link') || r.headers.get('Link') || '';
      const next = link.match(/<([^>]+)>;\s*rel="next"/);
      url = next ? next[1] : null;
    }
    return res.status(200).json({ success: true, count: out.length, products: out });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
