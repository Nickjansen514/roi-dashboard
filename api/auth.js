const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const SCOPES = 'read_orders,read_products';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, shop, code } = req.query;

  if (action === 'login') {
    if (!shop) return res.status(400).json({ error: 'shop parameter missing' });
    const cleanShop = shop.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const redirectUri = `${process.env.APP_URL}/api/auth?action=callback&shop=${cleanShop}`;
    const authUrl = `https://${cleanShop}/admin/oauth/authorize?client_id=${SHOPIFY_CLIENT_ID}&scope=${SCOPES}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    return res.redirect(authUrl);
  }

  if (action === 'callback') {
    if (!shop || !code) return res.status(400).json({ error: 'Missing shop or code' });
    const cleanShop = shop.replace(/^https?:\/\//, '').replace(/\/$/, '');

    try {
      const tokenRes = await fetch(`https://${cleanShop}/admin/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: SHOPIFY_CLIENT_ID,
          client_secret: SHOPIFY_CLIENT_SECRET,
          code
        })
      });

      const tokenData = await tokenRes.json();
      if (!tokenData.access_token) {
        return res.status(400).json({ error: 'Token exchange failed', detail: tokenData });
      }

      const dashboardUrl = process.env.DASHBOARD_URL || process.env.APP_URL;
      return res.redirect(`${dashboardUrl}?shop=${cleanShop}&token=${tokenData.access_token}`);

    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: 'Unknown action' });
}
