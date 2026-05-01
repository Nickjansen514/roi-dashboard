const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const SCOPES = 'read_orders,read_products';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { shop } = req.query;
  if (!shop) return res.status(400).json({ error: 'shop parameter missing' });

  const cleanShop = shop.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const redirectUri = `${process.env.APP_URL}/api/callback`;
  const authUrl = `https://${cleanShop}/admin/oauth/authorize?client_id=${SHOPIFY_CLIENT_ID}&scope=${SCOPES}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  return res.redirect(authUrl);
}
