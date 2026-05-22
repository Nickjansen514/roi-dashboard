const STORE2_DOMAIN = 'gw5ubt-8p.myshopify.com';

export default async function handler(req, res) {
  const { shop, code } = req.query;
  if (!shop || !code) return res.status(400).json({ error: 'Missing shop or code' });

  const cleanShop = shop.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const isStore2 = cleanShop === STORE2_DOMAIN;
  const clientId = isStore2 ? process.env.SHOPIFY_CLIENT_ID_2 : process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = isStore2 ? process.env.SHOPIFY_CLIENT_SECRET_2 : process.env.SHOPIFY_CLIENT_SECRET;

  try {
    const tokenRes = await fetch(`https://${cleanShop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code })
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      return res.status(400).json({ error: 'Token exchange failed', detail: tokenData });
    }

    const dashboardUrl = process.env.APP_URL;
    const returnPage = isStore2 ? 'store2.html' : '';
    return res.redirect(`${dashboardUrl}/${returnPage}?shop=${cleanShop}&token=${tokenData.access_token}`);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
