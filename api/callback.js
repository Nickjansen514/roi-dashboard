const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;

export default async function handler(req, res) {
  const { shop, code } = req.query;
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

    const dashboardUrl = process.env.APP_URL;
    return res.redirect(`${dashboardUrl}?shop=${cleanShop}&token=${tokenData.access_token}`);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
