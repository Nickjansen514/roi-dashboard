export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { shop, token, days, resource } = req.query;
  if (!shop || !token) return res.status(400).json({ error: 'Missing shop or token' });

  const since = new Date(Date.now() - (parseInt(days) || 7) * 86400000).toISOString();
  const cleanShop = shop.replace(/^https?:\/\//, '').replace(/\/$/, '');

  let url;
  if (resource === 'products') {
    url = `https://${cleanShop}/admin/api/2024-01/products.json?limit=250`;
  } else {
    url = `https://${cleanShop}/admin/api/2024-01/orders.json?status=any&created_at_min=${since}&limit=250`;
  }

  try {
    const r = await fetch(url, {
      headers: { 'X-Shopify-Access-Token': token }
    });
    const data = await r.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
