const SCOPES_1 = 'read_orders,read_products';
const SCOPES_2 = 'write_products,read_products,read_orders';
const STORE2_DOMAIN = 'gw5ubt-8p.myshopify.com';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { shop } = req.query;
  if (!shop) return res.status(400).json({ error: 'shop parameter missing' });

  const cleanShop = shop.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const isStore2 = cleanShop === STORE2_DOMAIN;
  const clientId = isStore2 ? process.env.SHOPIFY_CLIENT_ID_2 : process.env.SHOPIFY_CLIENT_ID;
  const scopes = isStore2 ? SCOPES_2 : SCOPES_1;
  const redirectUri = `${process.env.APP_URL}/api/callback`;

  const authUrl = `https://${cleanShop}/admin/oauth/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  return res.redirect(authUrl);
}
